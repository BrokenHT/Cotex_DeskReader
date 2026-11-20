'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const cheerio = require('cheerio');
const {resolveEntry} = require('./epub-images.cjs');

const MATH_TAGS = new Set([
  'math','mi','mn','mo','mtext','mrow','mfrac','msqrt','mroot','msup','msub',
  'msubsup','mover','munder','munderover','mtable','mtr','mtd','mspace',
  'semantics','annotation','mpadded','mphantom','menclose','mmultiscripts',
  'mprescripts','none','merror','mstyle'
]);

const ALLOWED_TAGS = new Set([
  'p','span','em','strong','i','b','u','s','sub','sup','small','br','hr',
  'h1','h2','h3','h4','h5','h6',
  'ul','ol','li','dl','dt','dd','blockquote','pre','code',
  'table','caption','thead','tbody','tfoot','tr','th','td','colgroup','col',
  'figure','figcaption','img',
  ...MATH_TAGS
]);

const REMOVE_TAGS = new Set([
  'script','style','iframe','object','embed','link','meta','form','input',
  'button','select','textarea','audio','video','canvas','svg','noscript',
  'template'
]);

const CONTAINER_TAGS = new Set([
  'div','section','article','main','header','footer','aside','body','html',
  'address','center','details','summary','fieldset','legend'
]);

const BLOCK_TAGS = new Set([
  'p','table','math','figure','ul','ol','dl','blockquote','pre',
  'h1','h2','h3','h4','h5','h6','hr'
]);

const RICH_TYPES = new Set(['text','table','math','figure','list','quote','code','html']);
function blockHasImages(html) {
  return /<img\b|data-missing-image="1"/.test(String(html || ''));
}

const INLINE_TAGS = new Set([
  'span','em','strong','i','b','u','s','sub','sup','small','br','code','a',
  'img','mark','q','cite','abbr','time','ruby','rt','rp','del','ins','kbd',
  'samp','var','wbr','bdi','bdo','label','output'
]);

const MATH_ATTRS = new Set([
  'display','encoding','mathvariant','mathsize','mathcolor','mathbackground',
  'displaystyle','scriptlevel','width','height','depth','lspace','rspace',
  'voffset','stretchy','fence','separator','largeop','movablelimits',
  'accent','accentunder','symmetric','maxsize','minsize','linethickness',
  'bevelled','notation','columnalign','rowalign','columnspan','rowspan',
  'columnspacing','rowspacing','columnlines','rowlines','frame',
  'framespacing','equalrows','equalcolumns','side','minlabelspacing',
  'numalign','denomalign','form','lquote','rquote','actiontype',
  'selection','altimg','altimg-width','altimg-height','altimg-valign',
  'alttext','open','close','separators','subscriptshift','superscriptshift',
  'align','charalign','charspacing','groupalign',
  'indentalign','indentalignfirst','indentalignlast','indentshift',
  'indentshiftfirst','indentshiftlast','indenttarget','longdivstyle',
  'position','shift','stackalign'
]);

const HTML_ATTRS = {
  td: new Set(['colspan','rowspan','scope','abbr']),
  th: new Set(['colspan','rowspan','scope','abbr']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
  ol: new Set(['start','reversed','type']),
  li: new Set(['value']),
  table: new Set(),
  img: new Set(['data-asset','alt']),
  span: new Set(['data-missing-image','role','aria-label']),
  a: new Set(['role','data-note-id'])
};

const NOTE_TYPE_TOKENS = new Set([
  'footnote','footnotes','endnote','endnotes','rearnote','rearnotes',
  'biblioentry','glossdef','note','notes'
]);
const NOTE_ROLES = new Set([
  'doc-footnote','doc-footnotes','doc-endnote','doc-endnotes','doc-rearnote',
  'doc-biblioentry','doc-glossdef','doc-note','doc-notes'
]);
const NOTE_CLASS_RE = /(?:^|\s)(?:footnote|endnote|rearnote|biblioentry|glossdef|notes?|footnotes|endnotes)(?:\s|$)/i;
const NOTE_ID_RE = /(?:footnote|endnote|rearnote|biblioentry|glossdef|(?:^|[-_])note(?:$|[-_\d])|^fn\d+$)/i;

const ESC = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ESC[c]); }
function missingImage(label) {
  const text = String(label == null ? '' : label);
  return '<span data-missing-image="1" role="img" aria-label="' + esc(text) + '">' + esc(text) + '</span>';
}
function norm(value) {
  return String(value == null ? '' : value).replace(/^\uFEFF/, '').replace(/\s+/g, ' ').trim();
}
function tokens(value) {
  return String(value || '').toLowerCase().split(/\s+/).filter(Boolean);
}

function prepareDocument($) {
  $(Array.from(REMOVE_TAGS).filter(tag => tag !== 'svg').join(',')).remove();
  $('nav').remove();
}

function isNoteref($el) {
  return tokens($el.attr('epub:type')).includes('noteref') ||
    tokens($el.attr('role')).includes('doc-noteref');
}

function hasNoteSemantics($el) {
  if (!$el || !$el.length) return false;
  const types = tokens($el.attr('epub:type'));
  if (types.some(token => NOTE_TYPE_TOKENS.has(token))) return true;
  const roles = tokens($el.attr('role'));
  if (roles.some(role => NOTE_ROLES.has(role))) return true;
  const cls = $el.attr('class') || '';
  if (NOTE_CLASS_RE.test(cls)) return true;
  return NOTE_ID_RE.test($el.attr('id') || '');
}

function noteSemanticsInAncestors($el) {
  let node = $el.parent();
  while (node.length && node[0].name !== 'body' && node[0].name !== 'html') {
    if (hasNoteSemantics(node)) return true;
    node = node.parent();
  }
  return false;
}

function findById(doc, id) {
  const el = doc.ids.get(id);
  return el ? doc.$(el) : null;
}

function splitHref(href) {
  const index = href.indexOf('#');
  if (index < 0) return {pathPart: href, fragment: ''};
  return {pathPart: href.slice(0, index), fragment: href.slice(index + 1)};
}

function isExternal(href) {
  return /^(?:[a-z][\w+.-]*:|\/\/)/i.test(href || '');
}

function isBacklink($, $a) {
  const role = tokens($a.attr('role'));
  const type = tokens($a.attr('epub:type'));
  const rel = tokens($a.attr('rel'));
  const cls = tokens($a.attr('class'));
  const href = $a.attr('href') || '';
  return role.includes('doc-backlink') || type.includes('backlink') ||
    rel.includes('back') || cls.includes('backlink') ||
    (href.includes('#') && /^(?:back|return|返回|回|notes?|[\s\u21a9\u21ba\u2934\u2191\u2190]+)$/i.test(norm($a.text())));
}

function isNoteContainer(tag) {
  return new Set(['aside','div','section','article','main','li','dd','dt','span','body','html','footer','header']).has(tag);
}

function expandMarkers(html, marker, pictures, onImage) {
  const re = new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)', 'g');
  return String(html).replace(re, (_, number) => {
    const picture = pictures[Number(number)];
    if (!picture) return '';
    if (onImage) onImage(picture);
    const alt = picture.alt || '';
    if (picture.asset) return '<img data-asset="' + esc(picture.asset) + '" alt="' + esc(alt) + '">';
    return missingImage(alt);
  });
}

function textOf(html) {
  const $ = cheerio.load('<body>' + String(html || '') + '</body>');
  const root = $('body');
  root.find('img').each((_, el) => $(el).replaceWith($(el).attr('alt') || ''));
  root.find('math').each((_, math) => {
    const node = $(math);
    const annotations = node.find('annotation');
    if (!annotations.length) return;
    const visible = node.clone();
    visible.find('annotation').remove();
    if (norm(visible.text())) annotations.remove();
  });
  root.find('br').replaceWith(' ');
  root.find('td,th,tr,li,dt,dd,p,div,h1,h2,h3,h4,h5,h6,blockquote,pre,figcaption,caption,section').each((_, el) => $(el).append(' '));
  return norm(root.text());
}

function textOfFigure(html) {
  const $ = cheerio.load('<body>' + String(html || '') + '</body>');
  const root = $('body');
  const caption = root.find('figcaption').first();
  if (caption.length && norm(caption.text())) {
    root.find('img').remove();
  } else {
    root.find('img').each((_, el) => $(el).replaceWith($(el).attr('alt') || ''));
  }
  root.find('br').replaceWith(' ');
  root.find('p,div,figcaption').each((_, el) => $(el).append(' '));
  return norm(root.text());
}

function textOfMath(html) {
  const $ = cheerio.load('<body>' + String(html || '') + '</body>');
  const root = $('body');
  const annotations = root.find('annotation').toArray().map(el => norm($(el).text())).filter(Boolean);
  const visible = root.clone();
  visible.find('annotation').remove();
  return norm(visible.text()) || norm(annotations.join(' '));
}

function blockText(type, html) {
  if (type === 'math') return textOfMath(html);
  if (type === 'figure') return textOfFigure(html);
  return textOf(html);
}

// TeX annotations are fallback text for paragraph extraction. Chromium can
// display them next to the typeset MathML, so strip them from stored rich HTML
// and report visibility in the same pass.
function renderRich(html, stripImages = false) {
  const $ = cheerio.load('<body>' + String(html || '') + '</body>');
  const root = $('body');
  const visible = root.clone();
  visible.find('img,[data-missing-image],annotation').remove();
  const hasVisible = !!norm(visible.text());
  if (stripImages) root.find('img,[data-missing-image]').remove();
  root.find('annotation').remove();
  return {html: (root.html() || '').trim(), hasVisible};
}

function sanitizeHtml(html, options = {}) {
  const $ = cheerio.load('<body>' + String(html || '') + '</body>');
  const root = $('body');
  const allowNoteref = options.allowNoteref !== false;

  const cleanChildren = node => {
    for (const child of $(node).contents().toArray()) {
      if (child.type === 'comment') { $(child).remove(); continue; }
      if (child.type !== 'tag') continue;
      cleanElement(child);
    }
  };

  const missingImageFor = (alt, original) => missingImage(alt || original.attr('aria-label') || '');

  const cleanAttributes = (el, tag) => {
    const attrs = el.attribs || {};
    const allowed = MATH_TAGS.has(tag) ? MATH_ATTRS : (HTML_ATTRS[tag] || new Set());
    for (const name of Object.keys(attrs)) {
      if (!allowed.has(name.toLowerCase())) $(el).removeAttr(name);
    }
  };

  const cleanElement = el => {
    const $el = $(el);
    const tag = String(el.name || '').toLowerCase();
    if (REMOVE_TAGS.has(tag)) { $el.remove(); return; }

    if (tag === 'a') {
      cleanChildren(el);
      const role = tokens($el.attr('role'));
      const noteId = $el.attr('data-note-id') || '';
      if (allowNoteref && role.includes('doc-noteref') && /^[a-z0-9_-]+$/i.test(noteId)) {
        for (const name of Object.keys(el.attribs || {})) {
          if (name !== 'role' && name !== 'data-note-id') $el.removeAttr(name);
        }
        $el.attr('role', 'doc-noteref');
      } else {
        $el.replaceWith($el.contents());
      }
      return;
    }

    if (tag === 'img') {
      const asset = $el.attr('data-asset') || '';
      const alt = $el.attr('alt') || '';
      if (/^[a-f0-9]{24}$/i.test(asset)) {
        for (const name of Object.keys(el.attribs || {})) {
          if (name !== 'data-asset' && name !== 'alt') $el.removeAttr(name);
        }
        $el.attr('data-asset', asset);
      } else {
        $el.replaceWith(missingImageFor(alt, $el));
      }
      return;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      cleanChildren(el);
      $el.replaceWith($el.contents());
      return;
    }

    if (tag === 'span' && $el.attr('data-missing-image') === '1') {
      const label = $el.attr('aria-label') || norm($el.text());
      for (const name of Object.keys(el.attribs || {})) $el.removeAttr(name);
      $el.attr('data-missing-image', '1').attr('role', 'img').attr('aria-label', label);
      cleanChildren(el);
      return;
    }

    cleanAttributes(el, tag);
    cleanChildren(el);
  };

  cleanChildren(root[0]);
  return (root.html() || '').trim();
}

function isDescendant(node, ancestor) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent === ancestor) return true;
  }
  return false;
}

function directChildOf(node, ancestor) {
  let child = node;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent === ancestor) return child;
    child = parent;
  }
  return null;
}

function commonAncestor(nodes) {
  for (let candidate = nodes[0].parent; candidate; candidate = candidate.parent) {
    if (nodes.every(node => node === candidate || isDescendant(node, candidate))) return candidate;
  }
  return null;
}

function cloneContainer($, container, from, to) {
  const source = $(container).contents().toArray();
  if (to <= from || from < 0 || to > source.length) return null;
  const clone = $(container).clone();
  clone.removeAttr('id');
  clone.empty();
  for (let index = from; index < to; index++) clone.append($(source[index]).clone());
  return clone[0];
}

// Split a body clone at the elements referenced by the EPUB table of contents.
// TOC anchors are usually direct children of a page container; when an anchor
// is nested deeper, the closest direct child becomes the boundary.
function splitBody($, body, entries) {
  const ids = new Map();
  $(body).find('[id]').each((_, el) => {
    const id = $(el).attr('id');
    if (id && !ids.has(id)) ids.set(id, el);
  });
  const order = new Map();
  $(body).find('*').toArray().forEach((el, index) => order.set(el, index));

  const targets = [];
  for (const entry of entries) {
    if (!entry.fragment) continue;
    const target = ids.get(entry.fragment);
    if (!target || !isDescendant(target, body)) continue;
    targets.push({entry, target, order: order.get(target) ?? Number.MAX_SAFE_INTEGER});
  }
  targets.sort((a, b) => a.order - b.order);
  const unique = [];
  for (const item of targets) {
    if (!unique.some(existing => existing.target === item.target)) unique.push(item);
  }
  if (unique.length < 2) return null;

  const root = commonAncestor(unique.map(item => item.target));
  if (!root) return null;
  const groups = new Map();
  let startEntry = null;
  for (const item of unique) {
    if (item.target === root) {
      startEntry = startEntry || item.entry;
      continue;
    }
    const top = directChildOf(item.target, root);
    if (!top) continue;
    const topTarget = item.target === top;
    let innerIndex = -1;
    if (!topTarget) {
      const inner = directChildOf(item.target, top);
      if (!inner) continue;
      innerIndex = $(top).contents().toArray().indexOf(inner);
      if (innerIndex < 0) continue;
    }
    let boundaries = groups.get(top);
    if (!boundaries) { boundaries = []; groups.set(top, boundaries); }
    if (!boundaries.some(existing => existing.topTarget === topTarget && existing.innerIndex === innerIndex)) {
      boundaries.push({entry: item.entry, innerIndex, topTarget});
    }
  }

  const segments = [];
  let current = null;
  const ensure = () => {
    if (!current) current = {title: null, fragment: '', nodes: []};
    return current;
  };
  const flush = () => {
    if (current && current.nodes.length) segments.push(current);
    current = null;
  };
  const start = entry => {
    flush();
    current = {title: entry?.label || '', fragment: entry?.fragment || '', nodes: []};
  };

  if (startEntry) start(startEntry);
  for (const top of $(root).children().toArray()) {
    const boundaries = groups.get(top);
    if (!boundaries || !boundaries.length) {
      ensure().nodes.push(cloneContainer($, top, 0, $(top).contents().length));
      continue;
    }
    const whole = boundaries.find(boundary => boundary.topTarget);
    if (whole) {
      start(whole.entry);
      ensure().nodes.push(cloneContainer($, top, 0, $(top).contents().length));
      continue;
    }
    const ordered = boundaries.slice().sort((a, b) => a.innerIndex - b.innerIndex);
    const contents = $(top).contents().toArray();
    if (ordered[0].innerIndex > 0) {
      const range = cloneContainer($, top, 0, ordered[0].innerIndex);
      if (range) ensure().nodes.push(range);
    }
    for (let index = 0; index < ordered.length; index++) {
      const boundary = ordered[index];
      const end = index + 1 < ordered.length ? ordered[index + 1].innerIndex : contents.length;
      start(boundary.entry);
      const range = cloneContainer($, top, boundary.innerIndex, end);
      if (range) current.nodes.push(range);
    }
  }
  flush();
  return segments.length >= 2 ? segments : null;
}

function titleOf($, root) {
  for (const selector of ['[class*="title"],[class*="Title"]', 'h1,h2,h3,h4,h5,h6', '[id*="toc"],[id*="TOC"]']) {
    const element = $(root).find(selector).toArray().find(el => norm($(el).text()));
    if (element) return norm($(element).text()).slice(0, 120);
  }
  const first = $(root).find('p,div').toArray().find(el => norm($(el).text()));
  return first ? norm($(first).text()).slice(0, 120) : '';
}

function createRichParser({zip, imageReader}) {
  const docs = new Map();
  // premarkNotes and processNotes inspect the same anchors; resolve each once.
  const located = new WeakMap();

  async function getDocument(rel, providedHtml) {
    if (docs.has(rel)) return docs.get(rel);
    let html = providedHtml;
    if (html === undefined) {
      const entry = zip.file(rel);
      if (!entry) return null;
      html = await entry.async('string');
    }
    const $ = cheerio.load(html);
    prepareDocument($);
    const doc = {rel, $, ids: new Map()};
    $('[id]').each((_, el) => {
      const id = $(el).attr('id');
      if (id && !doc.ids.has(id)) doc.ids.set(id, el);
    });
    docs.set(rel, doc);
    return doc;
  }

  async function scanImages(root, baseDir) {
    const $ = root.$;
    const pictures = [];
    const marker = 'COTEX_IMAGE_' + crypto.randomBytes(8).toString('hex') + '_';
    const token = async (href, alt) => {
      const index = pictures.length;
      pictures.push(await imageReader.read(href, baseDir, alt || ''));
      return '\n' + marker + index + '\n';
    };

    for (const node of $(root.el).find('img,svg').toArray()) {
      const el = $(node);
      let replacement = '';
      if (node.name === 'img') {
        replacement = await token(el.attr('src') || el.attr('data-src'), el.attr('alt') || '');
      } else if (el.find('image').length) {
        for (const image of el.find('image').toArray()) {
          const item = $(image);
          replacement += await token(item.attr('href') || item.attr('xlink:href'),
            item.attr('alt') || el.find('title').first().text() || '');
        }
      } else {
        replacement = await token('data:image/svg+xml;base64,' + Buffer.from($.html(node)).toString('base64'),
          el.find('title').text());
      }
      el.replaceWith(replacement);
    }
    return {pictures, marker};
  }

  async function extractNote(doc, target, targetRel) {
    const $ = doc.$;
    const clone = $(target).clone();
    clone.find('a').each((_, anchor) => {
      if (isBacklink($, $(anchor))) $(anchor).remove();
    });

    const scan = await scanImages({$ , el: clone}, path.posix.dirname(targetRel));
    const tag = String(target.name || '').toLowerCase();
    let html;
    if (isNoteContainer(tag)) html = clone.html() || '';
    else html = $.html(clone) || '';
    html = expandMarkers(html, scan.marker, scan.pictures);
    return renderRich(sanitizeHtml(html, {allowNoteref: false})).html;
  }

  async function locateNote(doc, rel, anchor) {
    const cached = located.get(anchor);
    if (cached) return cached;
    const $ = doc.$;
    const $a = $(anchor);
    if (isBacklink($, $a)) return null;
    const explicit = isNoteref($a);
    const href = $a.attr('href') || $a.attr('xlink:href') || '';
    const text = norm($a.text());
    if (!explicit && noteSemanticsInAncestors($a)) return null;
    if (!explicit && !href.includes('#')) return null;

    let targetDoc = null;
    let target = null;
    let fragment = '';
    let targetRel = rel;

    if (href && !isExternal(href)) {
      const split = splitHref(href);
      try { fragment = decodeURIComponent(split.fragment); } catch { fragment = ''; }
      if (fragment) {
        targetRel = split.pathPart ? resolveEntry(path.posix.dirname(rel), split.pathPart) : rel;
        if (targetRel) {
          targetDoc = await getDocument(targetRel);
          if (targetDoc) target = findById(targetDoc, fragment);
        }
      }
    }

    const targetIsNote = !!(target && (explicit || hasNoteSemantics(target) || noteSemanticsInAncestors(target)));
    const info = {$a, explicit, text, targetDoc, target, targetRel, fragment, targetIsNote};
    located.set(anchor, info);
    return info;
  }

  // Hide note targets before parsing any chapter so a notes file that appears
  // earlier in the spine cannot leak its notes into the reading flow.
  async function premarkNotes(rels) {
    for (const rel of rels) {
      let doc;
      try {
        doc = await getDocument(rel);
      } catch {
        continue;
      }
      if (!doc) continue;
      for (const anchor of doc.$('body a').toArray()) {
        const info = await locateNote(doc, rel, anchor);
        if (!info || !info.targetIsNote) continue;
        const name = String(info.target[0].name || '').toLowerCase();
        if (name !== 'body' && name !== 'html') info.target.attr('data-cotex-note-hidden', '1');
      }
    }
  }

  async function processNotes(doc, rel) {
    const $ = doc.$;
    const notes = [];
    const byTarget = new Map();
    let counter = 0;

    for (const anchor of $('body a').toArray()) {
      const info = await locateNote(doc, rel, anchor);
      if (!info) continue;
      const { $a, explicit, text, targetDoc, target, targetRel, fragment, targetIsNote } = info;

      if (!targetIsNote) {
        if (explicit) $a.replaceWith($('<sup></sup>').text(text || String(notes.length + 1)));
        continue;
      }

      const key = targetRel + '#' + (target.attr('id') || fragment);
      let note = byTarget.get(key);
      if (!note) {
        note = {
          id: 'n' + (++counter),
          label: text || String(notes.length + 1),
          html: await extractNote(targetDoc, target[0], targetRel)
        };
        byTarget.set(key, note);
        notes.push(note);
        if (target[0].name !== 'body' && target[0].name !== 'html') {
          target.attr('data-cotex-note-hidden', '1');
        }
      }

      const replacement = $('<sup></sup>');
      replacement.append($('<a role="doc-noteref"></a>').attr('data-note-id', note.id).text(text || note.label));
      const parent = $a.parent();
      if (parent.is('sup') && norm(parent.text()) === text && parent.children().length === 1) {
        parent.replaceWith(replacement);
      } else {
        $a.replaceWith(replacement);
      }
    }

    return notes;
  }

  function classify(tag, el, $) {
    if (CONTAINER_TAGS.has(tag)) return 'container';
    if (BLOCK_TAGS.has(tag)) return 'block';
    if (INLINE_TAGS.has(tag)) return 'inline';
    return $(el).find('p,div,section,article,table,figure,ul,ol,dl,blockquote,pre,h1,h2,h3,h4,h5,h6').length ? 'block' : 'inline';
  }

  async function buildChapter({doc, body, rel, title, chapterNumber, notes, epubPath}) {
    const $ = doc.$;
    const scan = await scanImages({$, el: body}, path.posix.dirname(rel));
    const pictures = scan.pictures;
    const marker = scan.marker;
    const paragraphs = [];
    const images = [];
    const rich = {};

    const addImage = (picture, paragraph) => {
      let group = images.at(-1);
      if (!group || group.paragraph !== paragraph) {
        group = {paragraph, items: []};
        images.push(group);
      }
      group.items.push(picture);
    };

    const collectImages = raw => {
      const collected = [];
      const html = expandMarkers(raw, marker, pictures, picture => collected.push(picture));
      return {html, collected};
    };
    const addPictures = (collected, paragraph) => {
      for (const picture of collected) addImage(picture, paragraph);
    };

    const emitRich = (type, clean, collected) => {
      const index = paragraphs.length;
      const text = blockText(type, clean);
      const rendered = renderRich(clean, collected.length > 0);
      if ((type === 'text' || collected.length) && !rendered.hasVisible) {
        addPictures(collected, index);
        if (!collected.length && text) paragraphs.push(text);
        return;
      }
      if (collected.length) addPictures(collected, index);
      rich[index] = {type, html: rendered.html};
      paragraphs.push(text);
    };

    const emitInline = async raw => {
      if (!raw || !raw.trim()) return;
      const hasTags = /<\/?[a-z]/i.test(raw);
      const hasMarker = raw.includes(marker);
      if (!hasTags && !hasMarker) {
        const text = norm(cheerio.load('<body>' + raw + '</body>')('body').text());
        if (text) paragraphs.push(text);
        return;
      }

      const {html, collected} = collectImages(raw);
      const clean = sanitizeHtml(html, {allowNoteref: true});
      if (clean) emitRich('text', clean, collected);
    };

    const emitBlock = async (el, tag) => {
      let type = 'html';
      if (tag === 'p') type = 'text';
      else if (tag === 'table') type = 'table';
      else if (tag === 'math') type = 'math';
      else if (tag === 'figure') type = 'figure';
      else if (tag === 'ul' || tag === 'ol' || tag === 'dl') type = 'list';
      else if (tag === 'blockquote') type = 'quote';
      else if (tag === 'pre') type = 'code';

      if (type === 'text') {
        const raw = $(el).html() || '';
        const hasTags = $(el).children().length > 0;
        const hasMarker = raw.includes(marker);
        if (!hasTags && !hasMarker) {
          const text = norm($(el).text());
          if (text) paragraphs.push(text);
          return;
        }
      }

      const raw = type === 'text' ? ($(el).html() || '') : ($.html(el) || '');
      if (!raw.trim()) return;
      const {html, collected} = collectImages(raw);
      const clean = sanitizeHtml(html, {allowNoteref: true});
      if (clean) emitRich(type, clean, collected);
    };

    const walk = async parent => {
      const inline = [];
      const flush = async () => {
        if (!inline.length) return;
        const wrapper = $('<div></div>');
        for (const node of inline) wrapper.append($(node).clone());
        inline.length = 0;
        await emitInline(wrapper.html() || '');
      };

      for (const node of $(parent).contents().toArray()) {
        if (node.type === 'text') { inline.push(node); continue; }
        if (node.type === 'comment') continue;
        if (node.type !== 'tag') continue;
        if ($(node).attr('data-cotex-note-hidden') === '1') continue;
        const tag = String(node.name || '').toLowerCase();
        const kind = classify(tag, node, $);
        if (kind === 'container') {
          await flush();
          await walk(node);
        } else if (kind === 'block') {
          await flush();
          await emitBlock(node, tag);
        } else {
          inline.push(node);
        }
      }
      await flush();
    };

    await walk(body);

    const chapter = {title: title || '第' + chapterNumber + '节', paragraphs, images, epubPath};
    if (Object.keys(rich).length) chapter.rich = rich;
    if (notes.length) {
      const used = new Set();
      for (const block of Object.values(rich)) {
        for (const match of block.html.matchAll(/data-note-id="([^"]+)"/g)) used.add(match[1]);
      }
      const chapterNotes = notes.filter(note => used.has(note.id));
      if (chapterNotes.length) chapter.notes = chapterNotes;
    }
    return chapter;
  }

  async function wholeChapter({doc, body, rel, toc, chapterNumber, notes, docTitle}) {
    const $ = doc.$;
    const headingEl = $(body).find('h1,h2,h3').first();
    const heading = headingEl.length ? norm(headingEl.text()) : '';
    let title;
    if (toc?.label) {
      title = toc.label;
      if (heading && norm(heading) === norm(title)) headingEl.remove();
    } else {
      title = heading || docTitle || '第' + chapterNumber + '节';
      if (headingEl.length) headingEl.remove();
    }
    return buildChapter({doc, body, rel, title, chapterNumber, notes, epubPath: rel});
  }

  async function parseChapters({html, rel, toc = [], chapterNumber = 1}) {
    const doc = await getDocument(rel, html);
    if (!doc) return [];
    const $ = doc.$;
    const notes = await processNotes(doc, rel);
    const body = $('body').clone();
    body.find('[data-cotex-note-hidden="1"]').remove();
    const docTitle = norm($('title').first().text());
    const entries = (Array.isArray(toc) ? toc : []).filter(entry => entry && (!entry.relPath || entry.relPath === rel));
    const segments = entries.length >= 2 ? splitBody($, body[0], entries) : null;
    if (!segments || segments.length < 2) {
      return [await wholeChapter({doc, body, rel, toc: entries[0], chapterNumber, notes, docTitle})];
    }

    const chapters = [];
    for (const [index, segment] of segments.entries()) {
      const root = $('<div></div>')[0];
      for (const node of segment.nodes) $(root).append(node);
      const title = segment.title || titleOf($, root) || docTitle || '第' + (chapterNumber + index) + '节';
      const suffix = segment.fragment || (segment.title ? 'start' : 'front');
      const chapter = await buildChapter({
        doc, body: root, rel, title,
        chapterNumber: chapterNumber + index,
        notes,
        epubPath: rel + '#' + suffix
      });
      if (chapter.paragraphs.length || chapter.images.length) chapters.push(chapter);
    }
    return chapters;
  }

  async function parseChapter(args) {
    const chapters = await parseChapters({...args, toc: []});
    return chapters[0] || null;
  }

  return {parseChapter, parseChapters, premarkNotes};
}

module.exports = {createRichParser, RICH_TYPES, blockHasImages};
