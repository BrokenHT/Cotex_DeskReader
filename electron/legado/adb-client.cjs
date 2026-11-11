'use strict';

/**
 * Legado USB/ADB 传输层。
 * 由 vscode-read-side/src/adbLegadoClient.ts 原样移植为 CommonJS。
 * 数据模型（对应 src/model.ts）：见 http-client.cjs 顶部的 typedef 说明。
 */

const { execFile } = require('node:child_process');
const { existsSync, statSync } = require('node:fs');
const { isAbsolute, join } = require('node:path');
const { LegadoClientError } = require('./http-client.cjs');

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_CONTENT_CACHE_ENTRIES = 12;
const WEB_PROBE_TIMEOUT_SECONDS = 8;

/** Reads Legado through its exported Android ContentProvider over USB ADB. */
class AdbLegadoClient {
  constructor(options = {}) {
    this.executable = resolveAdbExecutable(options.adbPath);
    this.configuredSerial = options.deviceSerial?.trim() || undefined;
    this.configuredPackage = options.packageName?.trim() || undefined;
    this.stickySerial = this.configuredSerial;
    this.stickyPackage = this.configuredPackage;
    this.configuredWebPort = normalizeWebPort(options.webPort);
    this.webPort = this.configuredWebPort;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.runCommand = options.commandRunner ?? executeAdb;
    this.connection = undefined;
    this.curlAvailable = undefined;
    this.chapterCache = new Map();
    this.contentCache = new Map();
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new LegadoClientError('invalid-url', 'ADB 超时时间必须是大于零的毫秒数。');
    }
  }

  get serverUrl() {
    if (this.connection) {
      return `adb://${encodeURIComponent(this.connection.serial)}/${this.connection.packageName}`;
    }
    return `adb://${encodeURIComponent(this.stickySerial ?? 'auto')}/${this.stickyPackage ?? 'auto'}`;
  }

  async getBookshelf() {
    const envelope = await this.queryProvider('books/query');
    if (!envelope.isSuccess) {
      if (envelope.errorMsg?.includes('还没有添加小说')) {
        return [];
      }
      this.throwProviderError(envelope);
    }
    if (!Array.isArray(envelope.data)) {
      throw new LegadoClientError('invalid-response', 'Legado 书架响应缺少书籍数组。');
    }
    return envelope.data;
  }

  async getChapterList(bookUrl) {
    const cached = this.chapterCache.get(bookUrl);
    if (cached) {
      return cached;
    }
    const envelope = await this.queryProvider('book/chapter/query', { url: bookUrl });
    this.ensureSuccess(envelope);
    if (!Array.isArray(envelope.data)) {
      throw new LegadoClientError('invalid-response', 'Legado 目录响应缺少章节数组。');
    }
    const chapters = envelope.data;
    this.chapterCache.set(bookUrl, chapters);
    return chapters;
  }

  async getBookContent(bookUrl, chapterIndex) {
    if (!Number.isInteger(chapterIndex) || chapterIndex < 0) {
      throw new LegadoClientError('invalid-response', '章节索引必须是非负整数。');
    }
    const key = contentCacheKey(bookUrl, chapterIndex);
    const cached = this.contentCache.get(key);
    if (cached !== undefined) {
      this.contentCache.delete(key);
      this.contentCache.set(key, cached);
      return cached;
    }
    const envelope = await this.queryProvider('book/content/query', {
      url: bookUrl,
      index: String(chapterIndex),
    });
    this.ensureSuccess(envelope);
    if (typeof envelope.data !== 'string') {
      throw new LegadoClientError('invalid-response', 'Legado 正文响应缺少文本内容。');
    }
    this.cacheContent(key, envelope.data);
    return envelope.data;
  }

  prefetchBookContent(bookUrl, chapterIndex) {
    if (!Number.isInteger(chapterIndex) || chapterIndex < 0) {
      return;
    }
    const key = contentCacheKey(bookUrl, chapterIndex);
    if (!this.contentCache.has(key)) {
      void this.getBookContent(bookUrl, chapterIndex).catch(() => undefined);
    }
  }

  /** Writes progress through Legado's official localhost HTTP endpoint on the phone. */
  async saveBookProgress(progress) {
    const shelf = await this.getBookshelf();
    const matches = shelf.filter((book) => book.name === progress.name && book.author === progress.author);
    if (matches.length !== 1) {
      throw new LegadoClientError(
        'server',
        matches.length === 0
          ? 'ADB 回写前已找不到对应书籍，未修改手机数据。'
          : 'ADB 回写发现同名同作者书籍不唯一，未修改手机数据。',
      );
    }

    const connection = await this.ensureConnection();
    const port = await this.ensureWebPort(connection);
    const payload = {
      name: progress.name,
      author: progress.author,
      durChapterIndex: progress.durChapterIndex,
      durChapterPos: progress.durChapterPos,
      durChapterTime: progress.durChapterTime,
      durChapterTitle: progress.durChapterTitle,
    };
    const result = await this.runShell(connection, [
      'curl',
      '--silent',
      '--show-error',
      '--max-time',
      String(Math.max(WEB_PROBE_TIMEOUT_SECONDS, Math.ceil(this.timeoutMs / 1000))),
      '--request',
      'POST',
      '--header',
      androidShellQuote('Content-Type: application/json; charset=utf-8'),
      '--data-binary',
      androidShellQuote(JSON.stringify(payload)),
      androidShellQuote(`http://127.0.0.1:${port}/saveBookProgress`),
    ], false);
    const envelope = parseJsonEnvelope(result.stdout, 'Legado 进度接口');
    this.ensureSuccess(envelope);

    const verifiedShelf = await this.getBookshelf();
    const verified = verifiedShelf.find((book) => book.bookUrl === matches[0].bookUrl);
    if (
      !verified ||
      verified.durChapterIndex !== progress.durChapterIndex ||
      verified.durChapterPos !== progress.durChapterPos
    ) {
      throw new LegadoClientError('server', 'ADB 命令已完成，但手机未返回目标阅读位置；进度保留在本地待重试。');
    }
  }

  async ensureWebPort(connection) {
    await this.ensureCurl(connection);
    if (this.webPort && await this.probeWebPort(connection, this.webPort)) {
      return this.webPort;
    }
    this.webPort = undefined;

    const discovered = await this.discoverListeningPorts(connection);
    for (const port of orderWebPortCandidates(discovered)) {
      if (await this.probeWebPort(connection, port)) {
        this.webPort = port;
        return port;
      }
    }

    await this.tryStartWebService(connection);
    const afterStart = this.configuredWebPort
      ? [this.configuredWebPort]
      : orderWebPortCandidates(await this.discoverListeningPorts(connection));
    for (const port of afterStart) {
      if (await this.probeWebPort(connection, port)) {
        this.webPort = port;
        return port;
      }
    }
    throw new LegadoClientError(
      'network',
      '已连接手机，但无法启动或识别 Legado Web 服务。请在手机快捷设置中添加一次“Web 服务”磁贴，或在设置中指定 legado.adbWebPort。',
    );
  }

  async ensureCurl(connection) {
    if (this.curlAvailable === true) {
      return;
    }
    try {
      const result = await this.runShell(connection, ['which', 'curl'], true);
      this.curlAvailable = result.stdout.trim().length > 0;
    } catch {
      this.curlAvailable = false;
    }
    if (!this.curlAvailable) {
      throw new LegadoClientError(
        'network',
        '这台手机没有可供 ADB 调用的 curl，暂时只能读取；请切换 HTTP 模式回写进度。',
      );
    }
  }

  async discoverListeningPorts(connection) {
    const packageDump = await this.runShell(
      connection,
      ['dumpsys', 'package', connection.packageName],
      true,
    );
    const uidMatch = packageDump.stdout.match(/(?:appId|userId)=(\d+)/u)
      ?? packageDump.stdout.match(/\buid=(\d+)/u);
    if (!uidMatch) {
      throw new LegadoClientError('invalid-response', '无法从 Android 包信息中识别 Legado UID。');
    }
    const uid = Number(uidMatch[1]);
    const tables = await Promise.all([
      this.runShell(connection, ['cat', '/proc/net/tcp'], true),
      this.runShell(connection, ['cat', '/proc/net/tcp6'], true),
    ]);
    return [...new Set(tables.flatMap((table) => parseListeningPorts(table.stdout, uid)))];
  }

  async probeWebPort(connection, port) {
    try {
      // A closed/non-HTTP port is an expected probe miss, not an ADB disconnect.
      // Run it directly so one failed candidate does not invalidate and rediscover
      // the otherwise healthy USB connection.
      const result = await this.run(['-s', connection.serial, 'shell',
        'curl',
        '--silent',
        '--show-error',
        '--max-time',
        String(WEB_PROBE_TIMEOUT_SECONDS),
        '--output',
        '/dev/null',
        '--write-out',
        androidShellQuote('%{http_code}'),
        androidShellQuote(`http://127.0.0.1:${port}/getBookshelf`),
      ]);
      return result.stdout.trim() === '200';
    } catch {
      return false;
    }
  }

  async tryStartWebService(connection) {
    const component = `${connection.packageName}/io.legado.app.service.WebTileService`;
    try {
      await this.runShell(connection, ['cmd', 'statusbar', 'click-tile', component], true);
      await delay(1_200);
    } catch {
      // The actionable error is emitted by ensureWebPort after a final probe.
    }
  }

  async queryProvider(path, query = {}) {
    const connection = await this.ensureConnection();
    const uri = this.providerUri(connection, path, query);
    const result = await this.runShell(
      connection,
      ['content', 'query', '--uri', androidShellQuote(uri)],
      true,
    );
    return parseProviderOutput(result.stdout);
  }

  providerUri(connection, path, query = {}) {
    const params = Object.entries(query)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    return `content://${connection.authority}/${path}${params ? `?${params}` : ''}`;
  }

  async ensureConnection(force = false) {
    if (this.connection && !force) {
      return this.connection;
    }
    const devicesResult = await this.run(['devices']);
    const devices = parseAdbDevices(devicesResult.stdout);
    const serial = selectDevice(devices, this.stickySerial);
    const packageName = await this.selectPackage(serial);
    this.stickySerial = serial;
    this.stickyPackage = packageName;
    this.connection = {
      serial,
      packageName,
      authority: `${packageName}.readerProvider`,
    };
    return this.connection;
  }

  async selectPackage(serial) {
    const result = await this.run(['-s', serial, 'shell', 'pm', 'list', 'packages', 'io.legado']);
    const packages = result.stdout
      .split(/\r?\n/u)
      .map((line) => line.trim().replace(/^package:/u, ''))
      .filter((name) => /^io\.legado(?:\.|$)/u.test(name));

    if (this.stickyPackage) {
      if (!packages.includes(this.stickyPackage)) {
        throw new LegadoClientError('network', `指定的 Legado 包 ${this.stickyPackage} 未安装在所选手机上。`);
      }
      return this.stickyPackage;
    }
    if (packages.length === 0) {
      throw new LegadoClientError('network', '已连接手机，但没有找到 Legado/阅读应用。');
    }
    if (packages.length === 1) {
      return packages[0];
    }

    const preferred = ['io.legado.app.releaseA', 'io.legado.app.release', 'io.legado.play.release'];
    const preferredMatches = preferred.filter((name) => packages.includes(name));
    if (preferredMatches.length === 1) {
      return preferredMatches[0];
    }
    throw new LegadoClientError(
      'network',
      '手机上发现多个 Legado 安装包，请在 legado.adbPackageName 中指定要读取的包名。',
    );
  }

  async runShell(connection, args, retryRead) {
    try {
      return await this.run(['-s', connection.serial, 'shell', ...args]);
    } catch (error) {
      this.connection = undefined;
      if (!retryRead) {
        throw error;
      }
      const refreshed = await this.ensureConnection(true);
      return this.run(['-s', refreshed.serial, 'shell', ...args]);
    }
  }

  async run(args) {
    try {
      return await this.runCommand(this.executable, args, this.timeoutMs);
    } catch (error) {
      if (error instanceof LegadoClientError) {
        throw error;
      }
      const code = commandErrorCode(error);
      const suffix = code ? `（${code}）` : '';
      throw new LegadoClientError(
        'network',
        `ADB 连接失败${suffix}。请确认 USB 调试已授权、数据线已连接；插件会在下次操作时自动重试。`,
      );
    }
  }

  ensureSuccess(envelope) {
    if (!envelope.isSuccess) {
      this.throwProviderError(envelope);
    }
  }

  throwProviderError(envelope) {
    const message = typeof envelope.errorMsg === 'string' && envelope.errorMsg.trim()
      ? envelope.errorMsg.trim()
      : 'Legado ContentProvider 未说明失败原因。';
    throw new LegadoClientError('server', `Legado ADB 请求失败：${message}`);
  }

  cacheContent(key, content) {
    this.contentCache.set(key, content);
    while (this.contentCache.size > MAX_CONTENT_CACHE_ENTRIES) {
      const oldest = this.contentCache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.contentCache.delete(oldest);
    }
  }
}

function parseAdbDevices(output) {
  const devices = new Map();
  for (const line of output.split(/\r?\n/u)) {
    const match = line.trim().match(/^([^\s]+)\s+(device|offline|unauthorized|no permissions)\b/u);
    if (match && match[1] !== 'List') {
      devices.set(match[1], match[2]);
    }
  }
  return devices;
}

function parseProviderOutput(output) {
  const marker = 'result=';
  const offset = output.indexOf(marker);
  if (offset < 0) {
    throw new LegadoClientError(
      'invalid-response',
      output.includes('No result found')
        ? '当前 Legado 版本没有返回 ContentProvider 数据。'
        : 'ADB 返回中缺少 Legado result 列。',
    );
  }
  const json = output.slice(offset + marker.length).trim();
  return parseJsonEnvelope(json, 'Legado ContentProvider');
}

function parseListeningPorts(output, uid) {
  const ports = [];
  for (const line of output.split(/\r?\n/u)) {
    const fields = line.trim().split(/\s+/u);
    if (fields.length < 8 || fields[0] === 'sl' || fields[3] !== '0A' || Number(fields[7]) !== uid) {
      continue;
    }
    const portHex = fields[1]?.split(':').at(-1);
    if (!portHex || !/^[0-9A-Fa-f]{4}$/u.test(portHex)) {
      continue;
    }
    const port = Number.parseInt(portHex, 16);
    if (port > 0 && port <= 65535) {
      ports.push(port);
    }
  }
  return [...new Set(ports)];
}

function parseJsonEnvelope(json, source) {
  let value;
  try {
    value = JSON.parse(json);
  } catch {
    throw new LegadoClientError('invalid-response', `${source} 返回的不是有效 JSON。`);
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof value.isSuccess !== 'boolean'
  ) {
    throw new LegadoClientError('invalid-response', `${source} 响应缺少 isSuccess 标记。`);
  }
  return value;
}

function androidShellQuote(value) {
  return `'${value.replace(/'/gu, "'\\''")}'`;
}

function selectDevice(devices, configuredSerial) {
  if (configuredSerial) {
    const status = devices.get(configuredSerial);
    if (status === 'device') {
      return configuredSerial;
    }
    if (status === 'unauthorized') {
      throw new LegadoClientError('network', '指定手机尚未授权 USB 调试，请解锁手机并确认授权弹窗。');
    }
    throw new LegadoClientError('network', `未找到可用的指定 ADB 设备 ${configuredSerial}。`);
  }

  const ready = [...devices.entries()].filter(([, status]) => status === 'device').map(([serial]) => serial);
  if (ready.length === 1) {
    return ready[0];
  }
  if (ready.length > 1) {
    throw new LegadoClientError('network', '检测到多台 ADB 设备，请在 legado.adbDeviceSerial 中指定手机序列号。');
  }
  if ([...devices.values()].includes('unauthorized')) {
    throw new LegadoClientError('network', '手机尚未授权 USB 调试，请解锁手机并确认授权弹窗。');
  }
  throw new LegadoClientError('network', '没有检测到 ADB 手机，请连接数据线并开启 USB 调试。');
}

function resolveAdbExecutable(configuredPath) {
  const configured = configuredPath?.trim();
  if (configured) {
    return executableFromPath(configured);
  }

  const candidates = [
    process.env.ADB_PATH,
    process.env.ANDROID_HOME ? join(process.env.ANDROID_HOME, 'platform-tools', adbFileName()) : undefined,
    process.env.ANDROID_SDK_ROOT ? join(process.env.ANDROID_SDK_ROOT, 'platform-tools', adbFileName()) : undefined,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', adbFileName()) : undefined,
    process.platform === 'win32' ? join('C:\\', 'platform-tools', 'adb.exe') : undefined,
  ].filter((value) => Boolean(value));

  const existing = candidates.find((candidate) => existsSync(candidate));
  return existing ?? adbFileName();
}

function executableFromPath(value) {
  if (existsSync(value) && statSync(value).isDirectory()) {
    return join(value, adbFileName());
  }
  if (isAbsolute(value) || value.includes('/') || value.includes('\\')) {
    return value;
  }
  return value;
}

function adbFileName() {
  return process.platform === 'win32' ? 'adb.exe' : 'adb';
}

function executeAdb(executable, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      [...args],
      { encoding: 'utf8', timeout: timeoutMs, windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function commandErrorCode(error) {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const value = error.code;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function contentCacheKey(bookUrl, chapterIndex) {
  return `${bookUrl}\u0000${chapterIndex}`;
}

function normalizeWebPort(value) {
  if (value === undefined || value === 0) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new LegadoClientError('invalid-url', 'ADB Web 服务端口必须是 1 到 65535 的整数，或用 0 自动发现。');
  }
  return value;
}

function orderWebPortCandidates(ports) {
  const priority = new Map([[1122, 0], [1234, 1]]);
  return [...new Set(ports)].sort((left, right) => {
    const leftPriority = priority.get(left) ?? 10;
    const rightPriority = priority.get(right) ?? 10;
    return leftPriority - rightPriority || left - right;
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

module.exports = {
  AdbLegadoClient,
  parseAdbDevices,
  parseProviderOutput,
  parseListeningPorts,
  parseJsonEnvelope,
  androidShellQuote,
  resolveAdbExecutable,
  executeAdb,
  selectDevice,
  contentCacheKey,
  normalizeWebPort,
  orderWebPortCandidates,
  DEFAULT_TIMEOUT_MS,
  MAX_CONTENT_CACHE_ENTRIES,
  WEB_PROBE_TIMEOUT_SECONDS,
};
