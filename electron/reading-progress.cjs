'use strict';
// Ported from vscode-read-side/src/readerViewProvider.ts (renderChapter) and
// src/progress.ts. Legado's durChapterPos is a character offset inside the
// chapter, not a paragraph ordinal, so the offset table is computed from the
// raw chapter text with the same accumulation rule the reader view used.
const cheerio = require('cheerio');

const IMG_TAG = /<img[^>]*>/gi;
const OFFICIAL_IMG = /<img[^>]*src=['"][^'"]*(?:['"][^>]+})?['"][^>]*>/gi;

function officialLength(raw) {
  return String(raw).replace(OFFICIAL_IMG, ' ').length;
}

function readableText(raw) {
  const withLabels = String(raw).replace(IMG_TAG, ' [图片] ');
  return cheerio.load(withLabels).root().text();
}

/**
 * Splits a Legado chapter body into display paragraphs and records each one's
 * official offset. Blank lines advance the offset counter without producing a
 * paragraph, exactly as the reader view did.
 */
function splitChapter(rawContent) {
  const paragraphs = [];
  const offsets = [];
  let position = -1;
  for (const raw of String(rawContent == null ? '' : rawContent).split(/\n+/)) {
    position += officialLength(raw) + 1;
    if (!raw.trim()) continue;
    paragraphs.push(readableText(raw).trim());
    offsets.push(position);
  }
  return { paragraphs, offsets };
}

/** Official offset of one paragraph index; clamped to the last paragraph. */
function toChapterPos(offsets, index) {
  if (!Array.isArray(offsets) || !offsets.length) return 0;
  const clamped = Math.max(0, Math.min(offsets.length - 1, Math.trunc(Number(index)) || 0));
  return offsets[clamped];
}

/** First paragraph whose offset reaches chapterPos, matching the reader restore rule. */
function fromChapterPos(offsets, chapterPos) {
  if (!Array.isArray(offsets) || !offsets.length) return 0;
  const target = Number(chapterPos);
  if (!Number.isFinite(target) || target <= 0) return 0;
  const found = offsets.findIndex((value) => value >= target);
  return found < 0 ? offsets.length - 1 : found;
}

function sameProgressPosition(left, right) {
  return left.durChapterIndex === right.durChapterIndex
    && left.durChapterPos === right.durChapterPos;
}

function hasExternalProgressChange(remote, baseline) {
  return !sameProgressPosition(remote, baseline);
}

/** Builds the exact payload /saveBookProgress accepts. */
function toBookProgress(book, index, pos, title, now) {
  return {
    name: book.name,
    author: book.author,
    durChapterIndex: index,
    durChapterPos: pos,
    durChapterTime: now === undefined ? Date.now() : now,
    durChapterTitle: title,
  };
}

/** Reads a shelf entry as a progress coordinate. */
function progressFromBook(book) {
  return {
    name: book.name,
    author: book.author,
    durChapterIndex: Math.max(0, Number(book.durChapterIndex) || 0),
    durChapterPos: Math.max(0, Number(book.durChapterPos) || 0),
    durChapterTime: Number(book.durChapterTime) || 0,
    durChapterTitle: book.durChapterTitle,
  };
}

module.exports = {
  splitChapter, toChapterPos, fromChapterPos, sameProgressPosition,
  hasExternalProgressChange, toBookProgress, progressFromBook,
  officialLength, readableText, IMG_TAG,
};
