'use strict';
// Fetches and caches Legado chapter text. Extracted from electron/main.cjs so
// the concurrency and retry rules can be tested without Electron.
const COOLDOWN_MS = 60000;
/** How many chapters ahead of the reading position to warm, per the original reader. */
const PREFETCH_AHEAD_CHAPTERS = 3;

function createChapterLoader({ store, legado }) {
  const inFlight = new Map();
  const failures = new Map();

  /**
   * Returns the stored chapter, downloading it when its offsets are unknown.
   *
   * `force` bypasses the failure cooldown. The cooldown exists to stop a
   * sleeping phone from being polled on every progress flush, but it must
   * never block something the user explicitly asked for - otherwise a single
   * timeout makes every later attempt fail locally while the phone is awake.
   */
  async function ensure(id, index, options = {}) {
    const key = id + ':' + index;
    const pending = inFlight.get(key);
    if (pending) return pending;

    const failedAt = failures.get(key);
    const cooling = failedAt && Date.now() - failedAt < COOLDOWN_MS;
    if (cooling && !options.force) {
      const wait = Math.ceil((COOLDOWN_MS - (Date.now() - failedAt)) / 1000);
      const error = new Error(`${wait} 秒后可重试`);
      error.cooldownSeconds = wait;
      throw error;
    }
    if (cooling && options.force) failures.delete(key);

    const task = (async () => {
      const book = store.get(id);
      const cached = book.chapters[index];
      if (cached && Array.isArray(cached.offsets) && cached.offsets.length) return cached;

      let split;
      try {
        split = await legado.chapterText(book.source.remoteId, index);
        failures.delete(key);
      } catch (error) {
        failures.set(key, Date.now());
        throw error;
      }

      const latest = store.get(id);
      if (!latest.chapters[index]) throw new Error('章节已不存在');
      latest.chapters[index] = {
        ...latest.chapters[index],
        paragraphs: split.paragraphs,
        offsets: split.offsets,
      };
      store.save(latest);

      // A position stored before these offsets existed must be repaired, or a
      // later restore lands on stale data.
      if (latest.progress && latest.progress.chapter === index) {
        const paragraph = Math.max(0, Math.min(split.offsets.length - 1, latest.progress.paragraph || 0));
        store.patch(id, { progress: { chapter: index, paragraph, durChapterPos: split.offsets[paragraph] } });
      }
      // Warm the following chapters the way the original reader did: a fixed
      // look-ahead budget, not just the single next one.
      const total = store.get(id).chapters.length;
      for (let offset = 1; offset <= PREFETCH_AHEAD_CHAPTERS; offset += 1) {
        const next = index + offset;
        if (next >= total) break;
        legado.prefetch(book.source.remoteId, next);
      }
      // Warming the transport alone is lost on restart, so persist them too.
      void warmAhead(id, index);
      return store.get(id).chapters[index];
    })();

    inFlight.set(key, task);
    try { return await task; } finally { inFlight.delete(key); }
  }

  /**
   * Downloads and stores the next chapters in the background. Failures are
   * ignored: this is an optimisation, never a correctness requirement.
   */
  async function warmAhead(id, from) {
    const book = store.get(id);
    const total = book.chapters.length;
    for (let offset = 1; offset <= PREFETCH_AHEAD_CHAPTERS; offset += 1) {
      const next = from + offset;
      if (next >= total) return;
      const existing = store.get(id).chapters[next];
      if (existing && Array.isArray(existing.offsets) && existing.offsets.length) continue;
      try {
        const split = await legado.chapterText(book.source.remoteId, next);
        const latest = store.get(id);
        if (!latest.chapters[next]) continue;
        latest.chapters[next] = { ...latest.chapters[next], paragraphs: split.paragraphs, offsets: split.offsets };
        store.save(latest);
      } catch {
        return;
      }
    }
  }

  /** Clears the cooldown, used when the connection settings change. */
  function clearFailures() { failures.clear(); }

  return { ensure, clearFailures, inFlight, failures };
}

module.exports = { createChapterLoader, CHAPTER_RETRY_COOLDOWN_MS: COOLDOWN_MS, PREFETCH_AHEAD_CHAPTERS };
