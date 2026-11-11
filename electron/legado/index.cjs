'use strict';

/**
 * Legado 传输层统一出口。
 *
 * 只做装配，不引入任何 VS Code 依赖：所有配置都必须显式传入。
 *
 *   const { createLegadoClient } = require('./electron/legado/index.cjs');
 *   const client = createLegadoClient({ mode: 'adb', deviceSerial: 'xxx', webPort: 1122 });
 *   const client2 = createLegadoClient({ mode: 'http', baseUrl: '192.168.1.20', accessToken: 't' });
 */

const {
  LegadoClient,
  LegadoClientError,
  normalizeServerUrl,
  DEFAULT_TIMEOUT_MS,
  LEGADO_DEFAULT_PORT,
  LEGADO_CLIENT_ERROR_CODES,
} = require('./http-client.cjs');
const adb = require('./adb-client.cjs');
const cache = require('./cache.cjs');

const { AdbLegadoClient } = adb;
const { CachedLegadoClient } = cache;

/**
 * 按 mode 构造传输层，并统一套上预读缓存层（与原扩展的装配顺序一致：缓存包在最外层）。
 *
 * @param {object} [config]
 * @param {'adb'|'http'} [config.mode] 传输模式，缺省为 'adb'。
 * @param {string} [config.baseUrl] HTTP 模式的服务地址（会经 normalizeServerUrl 规范化）。
 * @param {string} [config.accessToken] HTTP 模式的 X-Legado-Token。
 * @param {number} [config.timeoutMs] 传输超时（HTTP 默认 15000，ADB 默认 30000）。
 * @param {string} [config.adbPath] ADB 可执行文件路径。
 * @param {string} [config.deviceSerial] 指定设备序列号。
 * @param {string} [config.packageName] 指定 Legado 包名。
 * @param {number} [config.webPort] 手机端 Web 服务端口，0 表示自动发现。
 * @param {Function} [config.commandRunner] 注入的 ADB 命令执行器（测试用）。
 * @param {number} [config.maxEntries] 缓存层内存章节上限。
 * @param {number} [config.prefetchGapMs] 缓存层后台预取间隔。
 * @param {boolean} [config.cache=true] 是否套预读缓存层。
 * @returns {CachedLegadoClient|AdbLegadoClient|LegadoClient}
 */
function createLegadoClient(config = {}) {
  const mode = config.mode ?? 'adb';
  let transport;
  if (mode === 'adb') {
    transport = new AdbLegadoClient({
      adbPath: config.adbPath,
      deviceSerial: config.deviceSerial,
      packageName: config.packageName,
      webPort: config.webPort,
      timeoutMs: config.timeoutMs,
      commandRunner: config.commandRunner,
    });
  } else if (mode === 'http') {
    if (!config.baseUrl) {
      throw new LegadoClientError('invalid-url', 'Legado 服务地址不能为空。');
    }
    transport = new LegadoClient({
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
      accessToken: config.accessToken,
    });
  } else {
    throw new LegadoClientError('invalid-url', `不支持的 Legado 传输模式：${String(mode)}。`);
  }

  if (config.cache === false) {
    return transport;
  }
  return new CachedLegadoClient(transport, {
    maxEntries: config.maxEntries,
    prefetchGapMs: config.prefetchGapMs,
  });
}

module.exports = {
  createLegadoClient,
  // http-client.cjs
  LegadoClient,
  LegadoClientError,
  normalizeServerUrl,
  DEFAULT_TIMEOUT_MS,
  LEGADO_DEFAULT_PORT,
  LEGADO_CLIENT_ERROR_CODES,
  // adb-client.cjs
  AdbLegadoClient,
  parseAdbDevices: adb.parseAdbDevices,
  parseProviderOutput: adb.parseProviderOutput,
  parseListeningPorts: adb.parseListeningPorts,
  parseJsonEnvelope: adb.parseJsonEnvelope,
  androidShellQuote: adb.androidShellQuote,
  resolveAdbExecutable: adb.resolveAdbExecutable,
  executeAdb: adb.executeAdb,
  selectDevice: adb.selectDevice,
  adbContentCacheKey: adb.contentCacheKey,
  normalizeWebPort: adb.normalizeWebPort,
  orderWebPortCandidates: adb.orderWebPortCandidates,
  ADB_DEFAULT_TIMEOUT_MS: adb.DEFAULT_TIMEOUT_MS,
  MAX_CONTENT_CACHE_ENTRIES: adb.MAX_CONTENT_CACHE_ENTRIES,
  WEB_PROBE_TIMEOUT_SECONDS: adb.WEB_PROBE_TIMEOUT_SECONDS,
  // cache.cjs
  CachedLegadoClient,
  cacheContentKey: cache.contentCacheKey,
  CACHE_MAX_CONTENT_CACHE_ENTRIES: cache.MAX_CONTENT_CACHE_ENTRIES,
  PREFETCH_AHEAD_CHAPTERS: cache.PREFETCH_AHEAD_CHAPTERS,
  FOREGROUND_YIELD_POLL_MS: cache.FOREGROUND_YIELD_POLL_MS,
  DEFAULT_PREFETCH_GAP_MS: cache.DEFAULT_PREFETCH_GAP_MS,
};
