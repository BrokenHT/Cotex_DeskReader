'use strict';

/**
 * Legado 预读缓存层。
 * 由 vscode-read-side/src/cachedLegadoClient.ts 原样移植为 CommonJS。
 */

const { LegadoClientError } = require('./http-client.cjs');

const MAX_CONTENT_CACHE_ENTRIES = 12;
/** How many chapters after the reading position to preload. */
const PREFETCH_AHEAD_CHAPTERS = 3;
const FOREGROUND_YIELD_POLL_MS = 40;
const DEFAULT_PREFETCH_GAP_MS = 100;

/**
 * Wraps any transport with a silent read-ahead cache: chapters already
 * downloaded are served instantly, and the following chapters are fetched one
 * at a time in the background, yielding to foreground reads so page turns stay
 * responsive. Transport failures during prefetching are swallowed silently.
 */
class CachedLegadoClient {
  constructor(inner, options = {}) {
    this.inner = inner;
    this.maxEntries = Math.max(1, Math.trunc(options.maxEntries ?? MAX_CONTENT_CACHE_ENTRIES));
    this.prefetchGapMs = Math.max(0, Math.trunc(options.prefetchGapMs ?? DEFAULT_PREFETCH_GAP_MS));
    this.contentCache = new Map();
    this.inFlight = new Map();
    this.queuedKeys = new Set();
    this.queue = [];
    this.foregroundReads = 0;
    this.draining = false;
  }

  /** The inner transport identity used to keep sessions and journals isolated. */
  get serverUrl() {
    return this.inner.serverUrl;
  }

  getBookshelf() {
    return this.inner.getBookshelf();
  }

  getChapterList(bookUrl) {
    return this.inner.getChapterList(bookUrl);
  }

  saveBookProgress(progress) {
    return this.inner.saveBookProgress(progress);
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
    this.foregroundReads += 1;
    try {
      return await this.fetchContent(key, bookUrl, chapterIndex);
    } finally {
      this.foregroundReads -= 1;
    }
  }

  prefetchBookContent(bookUrl, chapterIndex) {
    if (!Number.isInteger(chapterIndex) || chapterIndex < 0) {
      return;
    }
    const key = contentCacheKey(bookUrl, chapterIndex);
    if (this.contentCache.has(key) || this.inFlight.has(key) || this.queuedKeys.has(key)) {
      return;
    }
    this.queuedKeys.add(key);
    this.queue.push({ key, bookUrl, chapterIndex });
    void this.drainPrefetchQueue();
  }

  /** Shares one transport request between a background prefetch and a real read. */
  fetchContent(key, bookUrl, chapterIndex) {
    const pending = this.inFlight.get(key);
    if (pending) {
      return pending;
    }
    const operation = this.inner
      .getBookContent(bookUrl, chapterIndex)
      .then((content) => {
        this.cacheContent(key, content);
        return content;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, operation);
    return operation;
  }

  async drainPrefetchQueue() {
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const task = this.queue.shift();
        if (!task) {
          break;
        }
        this.queuedKeys.delete(task.key);
        if (this.contentCache.has(task.key) || this.inFlight.has(task.key)) {
          continue;
        }
        await this.waitForForegroundIdle();
        if (this.contentCache.has(task.key) || this.inFlight.has(task.key)) {
          continue;
        }
        try {
          await this.fetchContent(task.key, task.bookUrl, task.chapterIndex);
        } catch {
          // Prefetching is best-effort; a real read surfaces its own errors.
        }
        if (this.prefetchGapMs > 0 && this.queue.length > 0) {
          await delay(this.prefetchGapMs);
        }
      }
    } finally {
      this.draining = false;
    }
  }

  async waitForForegroundIdle() {
    while (this.foregroundReads > 0) {
      await delay(FOREGROUND_YIELD_POLL_MS);
    }
  }

  cacheContent(key, content) {
    this.contentCache.set(key, content);
    while (this.contentCache.size > this.maxEntries) {
      const oldest = this.contentCache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.contentCache.delete(oldest);
    }
  }
}

function contentCacheKey(bookUrl, chapterIndex) {
  return JSON.stringify([bookUrl, chapterIndex]);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

module.exports = {
  CachedLegadoClient,
  contentCacheKey,
  MAX_CONTENT_CACHE_ENTRIES,
  PREFETCH_AHEAD_CHAPTERS,
  FOREGROUND_YIELD_POLL_MS,
  DEFAULT_PREFETCH_GAP_MS,
};
