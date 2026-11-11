'use strict';

/**
 * Legado HTTP 传输层。
 * 由 vscode-read-side/src/legadoClient.ts 原样移植为 CommonJS，行为逐条保持一致。
 *
 * 数据模型（对应 src/model.ts，仅作为文档存在，无运行时结构）：
 * @typedef {Object} Book
 * @property {string} name
 * @property {string} author
 * @property {string} bookUrl
 * @property {number} totalChapterNum
 * @property {number} durChapterIndex
 * @property {number} durChapterPos
 * @property {number} durChapterTime
 * @property {string} [durChapterTitle]
 *
 * @typedef {Object} BookChapter
 * @property {number} index
 * @property {string} [title]
 * @property {string} [url]
 * @property {boolean} [isVolume]
 *
 * @typedef {Object} BookProgress
 * @property {string} name
 * @property {string} author
 * @property {number} durChapterIndex
 * @property {number} durChapterPos
 * @property {number} durChapterTime
 * @property {string} [durChapterTitle]
 */

const { Buffer } = require('node:buffer');
const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

/** Legado Web 服务的默认端口。 */
const LEGADO_DEFAULT_PORT = 1234;
const DEFAULT_TIMEOUT_MS = 15_000;

const LEGADO_CLIENT_ERROR_CODES = Object.freeze([
  'invalid-url',
  'timeout',
  'network',
  'http',
  'invalid-response',
  'server',
]);

class LegadoClientError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LegadoClientError';
    this.code = code;
  }
}

/** Canonicalizes a host address and supplies Legado's default Web-service port. */
function normalizeServerUrl(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new LegadoClientError('invalid-url', 'Legado 服务地址不能为空。');
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new LegadoClientError('invalid-url', 'Legado 服务地址无效，请使用 http://主机:端口 格式。');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new LegadoClientError('invalid-url', 'Legado 服务地址只支持 HTTP 或 HTTPS。');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new LegadoClientError('invalid-url', 'Legado 服务地址不能包含账号、查询参数或片段。');
  }
  const authority = withProtocol.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/, 1)[0];
  const hasExplicitPort = authority.startsWith('[')
    ? /^\[[^\]]+\]:\d+$/.test(authority)
    : /^[^:]+:\d+$/.test(authority);
  // WHATWG URL omits an explicitly supplied default port (80/443), so retain
  // it semantically instead of accidentally replacing it with Legado's 1234.
  if (!parsed.port && !hasExplicitPort) {
    parsed.port = String(LEGADO_DEFAULT_PORT);
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString().replace(/\/$/, '');
}

class LegadoClient {
  constructor(options = {}) {
    this.baseUrl = normalizeServerUrl(options.baseUrl);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.accessToken = options.accessToken?.trim() || undefined;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new LegadoClientError('invalid-url', '请求超时时间必须是大于零的毫秒数。');
    }
  }

  /** The normalized service identity used to keep sessions and journals isolated. */
  get serverUrl() {
    return this.baseUrl;
  }

  async getBookshelf() {
    const envelope = await this.request('GET', 'getBookshelf');
    if (!envelope.isSuccess) {
      if (envelope.errorMsg?.includes('还没有添加小说')) {
        return [];
      }
      this.throwServiceError(envelope);
    }
    if (!Array.isArray(envelope.data)) {
      throw new LegadoClientError('invalid-response', 'Legado 书架响应缺少书籍数组。');
    }
    return envelope.data;
  }

  async getChapterList(bookUrl) {
    const envelope = await this.request('GET', `getChapterList?url=${encodeURIComponent(bookUrl)}`);
    this.ensureSuccess(envelope);
    if (!Array.isArray(envelope.data)) {
      throw new LegadoClientError('invalid-response', 'Legado 目录响应缺少章节数组。');
    }
    return envelope.data;
  }

  async getBookContent(bookUrl, chapterIndex) {
    if (!Number.isInteger(chapterIndex) || chapterIndex < 0) {
      throw new LegadoClientError('invalid-response', '章节索引必须是非负整数。');
    }
    const query = `url=${encodeURIComponent(bookUrl)}&index=${encodeURIComponent(String(chapterIndex))}`;
    const envelope = await this.request('GET', `getBookContent?${query}`);
    this.ensureSuccess(envelope);
    if (typeof envelope.data !== 'string') {
      throw new LegadoClientError('invalid-response', 'Legado 正文响应缺少文本内容。');
    }
    return envelope.data;
  }

  async saveBookProgress(progress) {
    const payload = {
      name: progress.name,
      author: progress.author,
      durChapterIndex: progress.durChapterIndex,
      durChapterPos: progress.durChapterPos,
      durChapterTime: progress.durChapterTime,
      durChapterTitle: progress.durChapterTitle,
    };
    const envelope = await this.request('POST', 'saveBookProgress', JSON.stringify(payload));
    this.ensureSuccess(envelope);
  }

  endpoint(pathAndQuery) {
    return `${this.baseUrl}/${pathAndQuery}`;
  }

  async request(method, pathAndQuery, body) {
    const url = this.endpoint(pathAndQuery);
    const headers = { Accept: 'application/json' };
    if (this.accessToken) {
      headers['X-Legado-Token'] = this.accessToken;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      headers['Content-Length'] = String(Buffer.byteLength(body, 'utf8'));
    }

    const text = await new Promise((resolve, reject) => {
      const transport = url.startsWith('https:') ? https : http;
      let completed = false;
      let timer;
      const finish = (action) => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          action();
        }
      };
      const request = transport.request(url, { method, headers }, (response) => {
        let responseText = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { responseText += chunk; });
        response.on('error', (error) => finish(() => reject(this.networkError(error))));
        response.on('end', () => {
          const status = response.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            finish(() => reject(new LegadoClientError('http', `Legado 服务返回 HTTP ${status}。`)));
          } else {
            finish(() => resolve(responseText));
          }
        });
      });
      timer = setTimeout(() => {
        request.destroy(new Error('timeout'));
        finish(() => reject(new LegadoClientError('timeout', `连接 Legado 服务超时（${this.timeoutMs}ms）。`)));
      }, this.timeoutMs);
      request.on('error', (error) => finish(() => reject(this.networkError(error))));
      request.end(body);
    });

    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new LegadoClientError('invalid-response', 'Legado 服务返回的不是有效 JSON。');
    }
    if (!this.isEnvelope(value)) {
      throw new LegadoClientError('invalid-response', 'Legado 服务响应缺少 isSuccess 标记。');
    }
    return value;
  }

  isEnvelope(value) {
    return typeof value === 'object' && value !== null
      && typeof value.isSuccess === 'boolean';
  }

  ensureSuccess(envelope) {
    if (!envelope.isSuccess) {
      this.throwServiceError(envelope);
    }
  }

  throwServiceError(envelope) {
    const message = typeof envelope.errorMsg === 'string' && envelope.errorMsg.trim()
      ? envelope.errorMsg.trim()
      : 'Legado 服务未说明失败原因。';
    throw new LegadoClientError('server', `Legado 服务请求失败：${message}`);
  }

  networkError(error) {
    const detail = error instanceof Error && error.message ? `：${error.message}` : '。';
    return new LegadoClientError('network', `无法连接 Legado 服务${detail}`);
  }
}

module.exports = {
  LegadoClient,
  LegadoClientError,
  normalizeServerUrl,
  DEFAULT_TIMEOUT_MS,
  LEGADO_DEFAULT_PORT,
  LEGADO_CLIENT_ERROR_CODES,
};
