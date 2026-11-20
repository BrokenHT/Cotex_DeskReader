'use strict';

const path = require('node:path');
const cheerio = require('cheerio');
const {resolveEntry} = require('./epub-images.cjs');

const MAX_ENTRIES = 5000;

function clean(value) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function splitHref(href) {
  const index = href.indexOf('#');
  if (index < 0) return {pathPart: href, fragment: ''};
  return {pathPart: href.slice(0, index), fragment: href.slice(index + 1)};
}

function isExternal(href) {
  return /^(?:[a-z][\w+.-]*:|\/\/)/i.test(href || '');
}

function target(tocPath, href) {
  if (!href || isExternal(href)) return null;
  const split = splitHref(href);
  const relPath = split.pathPart ? resolveEntry(path.posix.dirname(tocPath), split.pathPart) : tocPath;
  if (!relPath) return null;
  let fragment = '';
  try { fragment = decodeURIComponent(split.fragment); } catch { fragment = split.fragment; }
  return {relPath, fragment};
}

function fromNav($, tocPath) {
  const navs = $('nav').toArray();
  let nav = navs.find(el => /\btoc\b/i.test(el.attribs?.['epub:type'] || '') || /doc-toc/i.test(el.attribs?.role || ''));
  if (!nav) nav = navs.sort((a, b) => $(b).find('a[href]').length - $(a).find('a[href]').length)[0];
  if (!nav) return [];
  const entries = [];
  for (const anchor of $(nav).find('a[href]').toArray()) {
    const $a = $(anchor);
    const resolved = target(tocPath, $a.attr('href'));
    if (!resolved) continue;
    entries.push({
      ...resolved,
      label: clean($a.text()) || clean($a.attr('title')) || clean($a.attr('aria-label'))
    });
  }
  return entries;
}

function fromNcx($, tocPath) {
  const entries = [];
  for (const node of $('navPoint').toArray()) {
    const $node = $(node);
    const resolved = target(tocPath, $node.children('content').first().attr('src'));
    if (!resolved) continue;
    entries.push({...resolved, label: clean($node.children('navLabel').first().text())});
  }
  return entries;
}

function dedupe(entries) {
  const seen = new Set();
  const unique = [];
  for (const entry of entries) {
    const key = entry.relPath + '#' + entry.fragment;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
    if (unique.length >= MAX_ENTRIES) break;
  }
  return unique;
}

async function readTOC({zip, opfPath, pkg}) {
  const items = [].concat(pkg?.manifest?.item || []);
  const opfDir = path.posix.dirname(opfPath);
  const navItem = items.find(item => /\bnav\b/.test(item['@_properties'] || ''));
  if (navItem) {
    const navPath = resolveEntry(opfDir, navItem['@_href'] || '');
    if (navPath) {
      const file = zip.file(navPath);
      if (file) {
        const entries = dedupe(fromNav(cheerio.load(await file.async('string')), navPath));
        if (entries.length) return entries;
      }
    }
  }

  const tocId = pkg?.spine?.['@_toc'];
  const ncxItem = items.find(item => item['@_id'] === tocId) ||
    items.find(item => item['@_media-type'] === 'application/x-dtbncx+xml');
  if (ncxItem) {
    const ncxPath = resolveEntry(opfDir, ncxItem['@_href'] || '');
    if (ncxPath) {
      const file = zip.file(ncxPath);
      if (file) return dedupe(fromNcx(cheerio.load(await file.async('string'), {xmlMode: true}), ncxPath));
    }
  }
  return [];
}

module.exports = {readTOC};
