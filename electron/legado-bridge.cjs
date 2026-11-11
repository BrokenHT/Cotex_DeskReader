'use strict';
// Bridges Legado (phone library + Web API) into Cotex's local book model.
// Reading progress is owned locally; Legado is written as a mirror so a
// failed write never blocks reading, matching the VS Code reader's
// "progress stays local, retry later" behaviour.
const { createLegadoClient, CachedLegadoClient } = require('./legado/index.cjs');
const progress = require('./reading-progress.cjs');

const LEGADO_SOURCE_NAME = 'Legado';

function legadoBookId(book) {
  const { uid } = require('./core.cjs');
  return uid('legado:' + String(book.bookUrl));
}

/** Same obfuscation as finalizeBook: the sidebar shows a work title, not the book name. */
function workAlias(id) {
  const { aliases } = require('./core.cjs');
  return aliases[parseInt(id.slice(0, 6), 16) % aliases.length];
}

/** Builds a Cotex book shell from one Legado shelf entry. Text is fetched lazily. */
function toCotexBook(remote, chapters) {
  const list = chapters && chapters.length
    ? chapters
    : Array.from({ length: Math.max(1, Number(remote.totalChapterNum) || 1) }, (_, i) => ({
      index: i,
      title: i === Number(remote.durChapterIndex) && remote.durChapterTitle
        ? String(remote.durChapterTitle)
        : '第 ' + (i + 1) + ' 章',
    }));
  const chapter = Math.max(0, Math.min(list.length - 1, Number(remote.durChapterIndex) || 0));
  const title = list[chapter] && list[chapter].title ? String(list[chapter].title) : undefined;
  const durPos = Math.max(0, Number(remote.durChapterPos) || 0);
  const id = legadoBookId(remote);
  return {
    id,
    title: String(remote.name || '未命名'),
    author: String(remote.author || ''),
    alias: workAlias(id),
    format: '在线',
    source: {
      id: 'legado',
      name: LEGADO_SOURCE_NAME,
      remoteId: String(remote.bookUrl || ''),
      url: String(remote.bookUrl || ''),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    progress: { chapter, paragraph: 0, durChapterPos: durPos },
    durChapterTitle: title,
    bookmarks: [],
    collapsed: [],
    chapters: list.map((c, i) => ({
      title: String((c && c.title) || '第 ' + (i + 1) + ' 章'),
      url: c && c.url ? String(c.url) : undefined,
      id: String(i),
      paragraphs: null,
    })),
  };
}

/** Lifts a saved durChapterPos back onto a paragraph index once text is known. */
function restoreParagraph(book, index, offsets) {
  if (!offsets || !offsets.length) return 0;
  return progress.fromChapterPos(offsets, book && book.progress ? book.progress.durChapterPos : 0);
}

/** True when a stored Legado book still shows its real title as the work alias. */
function needsAliasRepair(book) {
  return book.source && book.source.id === 'legado' && book.alias === book.title;
}

/** The exact payload /saveBookProgress accepts, derived from Cotex state. */
function progressPayload(book, chapterIndex, chapterPos) {
  const chapter = book.chapters[chapterIndex];
  return progress.toBookProgress(
    { name: book.title, author: book.author },
    chapterIndex,
    chapterPos,
    chapter && chapter.title ? String(chapter.title) : undefined,
  );
}

class LegadoBridge {
  constructor(getConfig) {
    this.getConfig = getConfig;
    this.client = null;
    this.key = null;
  }

  /** Rebuilds the client only when the connection settings actually change. */
  current() {
    const config = this.getConfig() || {};
    const key = JSON.stringify([config.mode, config.baseUrl, config.adbPath, config.deviceSerial, config.packageName, config.webPort, config.timeoutMs, config.accessToken]);
    if (this.client && this.key === key) return this.client;
    this.client = createLegadoClient(config);
    this.key = key;
    return this.client;
  }

  reset() {
    this.client = null;
    this.key = null;
  }

  async shelf() {
    const books = await this.current().getBookshelf();
    return Array.isArray(books) ? books : [];
  }

  async chapters(bookUrl) {
    const list = await this.current().getChapterList(bookUrl);
    return Array.isArray(list) ? list : [];
  }

  /** Fetches chapter text and splits it with the reader's offset rule. */
  async chapterText(bookUrl, index) {
    const raw = await this.current().getBookContent(bookUrl, index);
    return progress.splitChapter(raw);
  }

  prefetch(bookUrl, index) {
    const client = this.current();
    if (client && typeof client.prefetchBookContent === 'function') {
      client.prefetchBookContent(bookUrl, index);
    }
  }

  /** Downloads a chapter's text so the caller can persist it. */
  async fetchChapter(bookUrl, index) {
    const raw = await this.current().getBookContent(bookUrl, index);
    return progress.splitChapter(raw);
  }

  /** Writes progress to the phone; the caller keeps it locally on failure. */
  async save(payload) {
    await this.current().saveBookProgress(payload);
  }
}


/**
 * Replaces a book's chapter list with a real catalogue while preserving text
 * already downloaded. Chapters are matched by URL when possible, otherwise by
 * position, so a shifted catalogue does not discard cached paragraphs.
 */
function mergeCatalogue(book, remoteChapters) {
  const list = Array.isArray(remoteChapters) && remoteChapters.length ? remoteChapters : null;
  if (!list) return book;
  const byUrl = new Map();
  for (const chapter of book.chapters || []) {
    if (chapter && chapter.url) byUrl.set(String(chapter.url), chapter);
  }
  const chapters = list.map((remote, i) => {
    const cached = (remote && remote.url ? byUrl.get(String(remote.url)) : undefined) || (book.chapters || [])[i];
    return {
      title: String((remote && remote.title) || (cached && cached.title) || '第 ' + (i + 1) + ' 章'),
      url: remote && remote.url ? String(remote.url) : undefined,
      id: String(i),
      paragraphs: cached && Array.isArray(cached.paragraphs) ? cached.paragraphs : null,
      offsets: cached && Array.isArray(cached.offsets) ? cached.offsets : undefined,
      locked: remote && remote.locked === true ? true : undefined,
    };
  });
  book.chapters = chapters;
  return book;
}
/** True when the stored catalogue is mostly placeholder titles we generated. */
function hasPlaceholderCatalogue(book) {
  const chapters = book && book.chapters;
  if (!Array.isArray(chapters) || chapters.length < 2) return false;
  const placeholder = chapters.filter((c) => c && /^第 \d+ 章$/.test(String(c.title || ''))).length;
  return placeholder / chapters.length > 0.8;
}
module.exports = {
  LegadoBridge,
  toCotexBook,
  restoreParagraph,
  progressPayload,
  legadoBookId,
  workAlias,
  needsAliasRepair,
  mergeCatalogue,
  hasPlaceholderCatalogue,
  LEGADO_SOURCE_NAME,
};
