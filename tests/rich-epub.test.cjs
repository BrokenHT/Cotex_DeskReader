const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const {parseEPUB} = require('../electron/core.cjs');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64');

function mediaType(href) {
  if (/\.xhtml$/i.test(href)) return 'application/xhtml+xml';
  if (/\.ncx$/i.test(href)) return 'application/x-dtbncx+xml';
  if (/\.svg$/i.test(href)) return 'image/svg+xml';
  if (/\.png$/i.test(href)) return 'image/png';
  return 'application/octet-stream';
}

async function epub({files, spine, title = '富内容测试', author = '测试作者', toc = null, nav = null}) {
  const zip = new JSZip();
  zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>');
  const hrefs = Object.keys(files);
  const manifest = hrefs.map((href, index) =>
    `<item id="f${index}" href="${href}" media-type="${mediaType(href)}"${href === nav ? ' properties="nav"' : ''}/>`).join('');
  const itemrefs = spine.map(href => `<itemref idref="f${hrefs.indexOf(href)}"/>`).join('');
  zip.file('OPS/book.opf',
    `<package><metadata><title>${title}</title><creator>${author}</creator></metadata>` +
    `<manifest>${manifest}</manifest><spine${toc ? ` toc="f${hrefs.indexOf(toc)}"` : ''}>${itemrefs}</spine></package>`);
  for (const [href, content] of Object.entries(files)) {
    zip.file('OPS/' + href, Buffer.isBuffer(content) ? content : String(content));
  }
  return zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
}

function chapterByTitle(book, title) {
  const chapter = book.chapters.find(item => item.title === title);
  assert.ok(chapter, 'missing chapter ' + title);
  return chapter;
}

function richBlocks(chapter) {
  return Object.entries(chapter.rich || {}).map(([index, block]) => ({index: Number(index), ...block}));
}

test('EPUB rich blocks preserve tables, MathML, figures, inline markup, lists, quotes and code', async () => {
  const book = await parseEPUB(await epub({
    spine: ['Text/ch1.xhtml'],
    files: {
      'Text/ch1.xhtml': `<html><head><title>回退标题</title></head><body>
        <h1>第一章 结构</h1>
        <p>普通段落</p>
        <p>带<em>强调</em>和<strong>加粗</strong>的行内段落。</p>
        <table><caption>数据表</caption><thead><tr><th>名称</th><th>数值</th></tr></thead>
          <tbody><tr><td colspan="2">合并单元格</td></tr></tbody></table>
        <p>行内公式 <math><semantics><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow>
          <annotation encoding="application/x-tex">x+1</annotation></semantics></math> 结束</p>
        <math display="block"><semantics><mrow><mi>y</mi><mo>=</mo><msup><mi>x</mi><mn>2</mn></msup></mrow>
          <annotation encoding="application/x-tex">y=x^2</annotation></semantics></math>
        <figure><img src="../Images/pixel.png" alt="图示"/><figcaption>图注说明</figcaption></figure>
        <ul><li>第一项</li><li>第二项</li></ul>
        <ol><li>步骤一</li><li>步骤二</li></ol>
        <blockquote><p>引用文字</p></blockquote>
        <pre><code>const x = 1;</code></pre>
        <h2>中间标题</h2>
        <p>结尾段落</p>
      </body></html>`,
      'Images/pixel.png': PNG
    }
  }), 'rich.epub');

  assert.equal(book.contentVersion, 4);
  const chapter = chapterByTitle(book, '第一章 结构');
  const blocks = richBlocks(chapter);
  const types = new Set(blocks.map(block => block.type));
  for (const type of ['text', 'table', 'math', 'figure', 'list', 'quote', 'code', 'html']) {
    assert.ok(types.has(type), 'missing rich type ' + type);
  }

  assert.equal(chapter.paragraphs[0], '普通段落');
  assert.equal(chapter.rich[0], undefined);
  const plainEnd = chapter.paragraphs.indexOf('结尾段落');
  assert.ok(plainEnd >= 0);
  assert.equal(chapter.rich[plainEnd], undefined);

  const inline = blocks.find(block => block.type === 'text');
  assert.match(inline.html, /<em>强调<\/em>/);
  assert.match(inline.html, /<strong>加粗<\/strong>/);
  assert.equal(chapter.paragraphs[inline.index], '带强调和加粗的行内段落。');

  const table = blocks.find(block => block.type === 'table');
  assert.match(table.html, /^<table[\s>]/);
  assert.match(table.html, /<caption>数据表<\/caption>/);
  assert.match(table.html, /<thead>/);
  assert.match(table.html, /colspan="2"/);
  for (const value of ['数据表', '名称', '数值', '合并单元格']) assert.match(chapter.paragraphs[table.index], new RegExp(value));

  const inlineMath = chapter.paragraphs.findIndex(text => text.includes('行内公式'));
  assert.ok(inlineMath >= 0);
  assert.equal(chapter.rich[inlineMath].type, 'text');
  assert.match(chapter.rich[inlineMath].html, /<math>/);
  assert.match(chapter.rich[inlineMath].html, /<semantics>/);
  assert.doesNotMatch(chapter.rich[inlineMath].html, /<annotation/);

  const blockMath = blocks.find(block => block.type === 'math');
  assert.match(blockMath.html, /^<math[^>]*display="block"/);
  assert.doesNotMatch(blockMath.html, /annotation|c=x\^2/);
  assert.match(chapter.paragraphs[blockMath.index], /y/);

  const figure = blocks.find(block => block.type === 'figure');
  assert.match(figure.html, /^<figure>/);
  assert.match(figure.html, /<figcaption>图注说明<\/figcaption>/);
  assert.match(figure.html, /<img data-asset="[a-f0-9]{24}" alt="图示">/);
  assert.doesNotMatch(figure.html, /\bsrc=/);
  assert.equal(chapter.paragraphs[figure.index], '图注说明');
  assert.ok(book.media[figure.html.match(/data-asset="([a-f0-9]{24})"/)[1]]);
  assert.ok(!chapter.images.some(group => group.paragraph === figure.index),
    'figure images render inline and must not be duplicated in the gallery');

  const lists = blocks.filter(block => block.type === 'list');
  assert.equal(lists.length, 2);
  assert.match(lists[0].html, /^<ul>/);
  assert.match(lists[1].html, /^<ol>/);
  assert.match(chapter.paragraphs[lists[0].index], /第一项/);

  const quote = blocks.find(block => block.type === 'quote');
  assert.match(quote.html, /^<blockquote>/);
  assert.equal(chapter.paragraphs[quote.index], '引用文字');

  const code = blocks.find(block => block.type === 'code');
  assert.match(code.html, /^<pre>/);
  assert.match(code.html, /<code>const x = 1;<\/code>/);
  assert.equal(chapter.paragraphs[code.index], 'const x = 1;');

  const heading = blocks.find(block => block.type === 'html' && block.html === '<h2>中间标题</h2>');
  assert.ok(heading);
  assert.equal(chapter.paragraphs[heading.index], '中间标题');

  for (const block of blocks) {
    assert.ok(block.index >= 0 && block.index < chapter.paragraphs.length);
    assert.doesNotMatch(chapter.paragraphs[block.index], /<[^>]+>/);
    assert.doesNotMatch(block.html, /<script|<style|on[a-z]+\s*=|javascript:/i);
  }
});

test('EPUB resolves same-file and cross-file notes, deduplicates ids and keeps note images in media', async () => {
  const book = await parseEPUB(await epub({
    spine: ['Text/ch1.xhtml'],
    files: {
      'Text/ch1.xhtml': `<html><head><title>注释章节</title></head><body>
        <p>正文一<sup><a epub:type="noteref" href="#fn1">1</a></sup></p>
        <p>正文二<a role="doc-noteref" href="notes.xhtml#en1">2</a></p>
        <p>重复引用<a epub:type="noteref" href="#fn1">1</a></p>
        <aside epub:type="footnote" id="fn1"><p>脚注文本 <em>重点</em></p>
          <script>alert('note')</script>
          <img src="https://evil.example/note.png" onerror="alert(1)" alt="坏图"/>
          <a href="#ch1" class="backlink">&#8617;</a></aside>
      </body></html>`,
      'Text/notes.xhtml': `<html><body>
        <section epub:type="endnote" id="en1"><p>尾注文本 <img src="../Images/pixel.png" alt="尾注图"/></p>
          <a role="doc-backlink" href="ch1.xhtml#n2">返回</a></section>
      </body></html>`,
      'Images/pixel.png': PNG
    }
  }), 'notes.epub');

  assert.equal(book.chapters.length, 1);
  const chapter = book.chapters[0];
  assert.equal(chapter.notes.length, 2);
  assert.deepEqual(chapter.notes.map(note => note.id), ['n1', 'n2']);
  assert.equal(chapter.notes[0].label, '1');
  assert.equal(chapter.notes[1].label, '2');
  assert.match(chapter.notes[0].html, /<p>脚注文本 <em>重点<\/em><\/p>/);
  assert.match(chapter.notes[0].html, /<span data-missing-image="1" role="img" aria-label="坏图">坏图<\/span>/);
  assert.doesNotMatch(chapter.notes[0].html, /backlink|8617|↩|script|alert|https?:\/\/|\bsrc=/i);
  assert.deepEqual([...chapter.notes.map(note => note.id)], [...new Set(chapter.notes.map(note => note.id))]);

  assert.match(chapter.notes[1].html, /<img data-asset="[a-f0-9]{24}" alt="尾注图">/);
  assert.doesNotMatch(chapter.notes[1].html, /\bsrc=|https?:\/\//);
  const noteAsset = chapter.notes[1].html.match(/data-asset="([a-f0-9]{24})"/)[1];
  assert.ok(book.media[noteAsset]);

  const first = chapter.paragraphs.findIndex(text => text.startsWith('正文一'));
  const second = chapter.paragraphs.findIndex(text => text.startsWith('正文二'));
  const repeat = chapter.paragraphs.findIndex(text => text.startsWith('重复引用'));
  assert.equal(chapter.rich[first].html,
    '正文一<sup><a role="doc-noteref" data-note-id="n1">1</a></sup>');
  assert.match(chapter.rich[second].html, /data-note-id="n2"/);
  assert.match(chapter.rich[repeat].html, /data-note-id="n1"/);
  assert.doesNotMatch(chapter.rich[first].html, /\bhref=/);

  for (const block of richBlocks(chapter)) {
    for (const match of block.html.matchAll(/data-note-id="([^"]+)"/g)) {
      assert.ok(chapter.notes.some(note => note.id === match[1]));
    }
  }
  assert.ok(!chapter.paragraphs.some(text => text.includes('脚注文本')));
});

test('EPUB rich content sanitizes scripts, event handlers, styles, external URLs and non-note links', async () => {
  const book = await parseEPUB(await epub({
    spine: ['Text/ch1.xhtml'],
    files: {
      'Text/ch1.xhtml': `<html><body>
        <h1>安全章节</h1>
        <p onclick="evil()" style="color:red" class="danger">安全<em>文本</em>
          <script>alert(1)</script></p>
        <a href="javascript:alert(1)" onclick="bad()">危险链接</a>
        <p><a href="https://example.com/x" target="_blank">外部链接</a></p>
        <img src="https://example.com/track.png" onerror="alert(2)" alt="外部图"/>
        <iframe src="https://evil.example/frame"></iframe>
        <p><span style="background:url(https://evil.example/x)">样式文字</span></p>
        <p><math><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow><script>alert(3)</script></math></p>
        <p><a epub:type="noteref" href="#missing">9</a></p>
        <div style="width:1px" onclick="click()"><p>div 内文字</p></div>
      </body></html>`
    }
  }), 'safe.epub');

  const chapter = book.chapters[0];
  const serialized = JSON.stringify({rich: chapter.rich || {}, notes: chapter.notes || {}});
  assert.doesNotMatch(serialized, /script|alert\(|onerror|onclick|javascript:|https?:\/\/|iframe|style=|class=|id=/i);
  assert.doesNotMatch(serialized, /\bsrc(?:set)?=/i);
  for (const block of richBlocks(chapter)) {
    assert.doesNotMatch(block.html, /<(?:script|style|iframe|object|embed|form|input|button|select|textarea|audio|video|canvas|svg)\b/i);
    assert.doesNotMatch(block.html, /\son[a-z]+\s*=/i);
  }

  assert.ok(chapter.paragraphs.includes('危险链接'));
  assert.ok(chapter.paragraphs.includes('外部链接'));
  assert.ok(chapter.paragraphs.includes('样式文字'));
  assert.ok(chapter.paragraphs.includes('div 内文字'));
  assert.ok(chapter.rich[chapter.paragraphs.indexOf('外部链接')]);
  assert.doesNotMatch(chapter.rich[chapter.paragraphs.indexOf('外部链接')].html, /<a|href=/);

  const externalImage = chapter.images[0].items[0];
  assert.equal(externalImage.missing, true);
  assert.equal(externalImage.alt, '外部图');
  assert.ok(!Object.keys(book.media).some(asset => /https?:/i.test(book.media[asset])));

  const missingRef = chapter.paragraphs.findIndex(text => text === '9');
  assert.ok(missingRef >= 0);
  assert.equal(chapter.rich[missingRef].html, '<sup>9</sup>');
  assert.equal(chapter.notes, undefined);
});

test('EPUB resolves notes whose group container uses plural EPUB semantics', async () => {
  const book = await parseEPUB(await epub({
    spine: ['Text/ch1.xhtml'],
    files: {
      'Text/ch1.xhtml': '<html><body><h1>复数注释</h1><p>正文' +
        '<a epub:type="noteref" href="notes.xhtml#en1">1</a></p></body></html>',
      'Text/notes.xhtml': '<html><body><section epub:type="endnotes">' +
        '<aside id="en1"><p>组尾注文本</p></aside></section></body></html>'
    }
  }), 'plural-notes.epub');

  assert.equal(book.chapters.length, 1);
  const chapter = book.chapters[0];
  assert.equal(chapter.notes.length, 1);
  assert.match(chapter.notes[0].html, /组尾注文本/);
  assert.ok(!chapter.paragraphs.some(text => text.includes('组尾注文本')));
  assert.match(chapter.rich[0].html, /data-note-id="n1"/);
});

test('EPUB caches cross-file notes for reuse by later chapters', async () => {
  const book = await parseEPUB(await epub({
    spine: ['Text/ch1.xhtml', 'Text/ch2.xhtml', 'Text/notes.xhtml'],
    files: {
      'Text/ch1.xhtml': '<html><body><h1>第一章</h1><p>正文一' +
        '<a role="doc-noteref" href="notes.xhtml#en1">1</a></p></body></html>',
      'Text/ch2.xhtml': '<html><body><h1>第二章</h1><p>正文二' +
        '<a role="doc-noteref" href="notes.xhtml#en1">1</a></p></body></html>',
      'Text/notes.xhtml': '<html><body><aside epub:type="endnote" id="en1">' +
        '<p>共享尾注 <img src="../Images/pixel.png" alt="共享图"/></p></aside></body></html>',
      'Images/pixel.png': PNG
    }
  }), 'shared-notes.epub');

  assert.equal(book.chapters.length, 2);
  const assets = [];
  for (const chapter of book.chapters) {
    assert.equal(chapter.notes.length, 1);
    assert.equal(chapter.notes[0].id, 'n1');
    assert.match(chapter.notes[0].html, /共享尾注/);
    const asset = chapter.notes[0].html.match(/data-asset="([a-f0-9]{24})"/)[1];
    assets.push(asset);
    assert.ok(book.media[asset]);
    assert.ok(!chapter.paragraphs.some(text => text.includes('共享尾注')));
  }
  assert.equal(assets[0], assets[1]);
  assert.equal(Object.keys(book.media).length, 1);
});

test('EPUB hides endnote files that precede the chapter referencing them', async () => {
  const book = await parseEPUB(await epub({
    spine: ['Text/notes.xhtml', 'Text/ch1.xhtml'],
    files: {
      'Text/notes.xhtml': '<html><body><aside epub:type="endnote" id="en1"><p>尾注文本</p></aside></body></html>',
      'Text/ch1.xhtml': '<html><body><h1>第一章</h1><p>正文<a role="doc-noteref" href="notes.xhtml#en1">1</a></p></body></html>'
    }
  }), 'notes-first.epub');

  assert.equal(book.chapters.length, 1);
  assert.equal(book.chapters[0].title, '第一章');
  assert.equal(book.chapters[0].notes.length, 1);
  assert.match(book.chapters[0].notes[0].html, /尾注文本/);
  assert.ok(!book.chapters[0].paragraphs.some(text => text.includes('尾注文本')));
});

test('EPUB keeps picture-only chapters anchor-only and removes only the title heading', async () => {
  const book = await parseEPUB(await epub({
    spine: ['Text/cover.xhtml', 'Text/ch1.xhtml', 'Text/ch2.xhtml'],
    files: {
      'Text/cover.xhtml': '<html><head><title>封面</title></head><body>' +
        '<img src="../Images/pixel.png" alt="封面图"/></body></html>',
      'Text/ch1.xhtml': '<html><body><h1>唯一标题</h1><p>正文</p></body></html>',
      'Text/ch2.xhtml': '<html><head><title>备用标题</title></head><body><p>无标题正文</p></body></html>',
      'Images/pixel.png': PNG
    }
  }), 'headings.epub');

  assert.equal(book.contentVersion, 4);
  assert.equal(book.chapters.length, 3);
  const cover = book.chapters[0];
  assert.equal(cover.title, '封面');
  assert.deepEqual(cover.paragraphs, []);
  assert.equal(cover.rich, undefined);
  assert.equal(cover.images.length, 1);
  assert.equal(cover.images[0].paragraph, 0);
  assert.equal(cover.images[0].items[0].alt, '封面图');

  const first = book.chapters[1];
  assert.equal(first.title, '唯一标题');
  assert.deepEqual(first.paragraphs, ['正文']);
  assert.equal(first.rich, undefined);

  const second = book.chapters[2];
  assert.equal(second.title, '备用标题');
  assert.deepEqual(second.paragraphs, ['无标题正文']);
});

const ncx = points => `<?xml version="1.0" encoding="utf-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>${points}</navMap></ncx>`;

test('EPUB2 NCX splits one spine document into chapters and keeps notes and images with their segment', async () => {
  const book = await parseEPUB(await epub({
    spine: ['Text/book.xhtml'],
    toc: 'toc.ncx',
    files: {
      'Text/book.xhtml': `<html><head><title>目录测试</title></head><body><div id="root">
        <div class="page"><p class="title">前言</p><p>前言内容</p></div>
        <div class="page"><p id="a">第一章 准备</p><p>第一章正文</p><img src="../Images/pixel.png" alt="插图"/></div>
        <div class="page"><p>第一节引言</p><p id="b">第一节 细节</p><p>细节正文</p></div>
        <div class="page"><p id="c">第二章 继续</p><p>脚注段落<a epub:type="noteref" href="#fn1">1</a></p>
          <aside epub:type="footnote" id="fn1"><p>脚注文本</p></aside></div>
      </div></body></html>`,
      'toc.ncx': ncx(
        '<navPoint><navLabel><text>第一章 准备</text></navLabel><content src="Text/book.xhtml#a"/>' +
        '<navPoint><navLabel><text>第一节 细节</text></navLabel><content src="Text/book.xhtml#b"/></navPoint></navPoint>' +
        '<navPoint><navLabel><text>第二章 继续</text></navLabel><content src="Text/book.xhtml#c"/></navPoint>'),
      'Images/pixel.png': PNG
    }
  }), 'toc-ncx.epub');

  assert.deepEqual(book.chapters.map(chapter => chapter.title),
    ['前言', '第一章 准备', '第一节 细节', '第二章 继续']);
  assert.equal(book.chapters.length, 4);
  assert.ok(book.chapters[1].paragraphs.includes('第一节引言'));
  assert.deepEqual(book.chapters[2].paragraphs, ['第一节 细节', '细节正文']);
  assert.equal(book.chapters[1].images.length, 1);
  assert.equal(book.chapters[1].images[0].items[0].alt, '插图');
  for (const chapter of book.chapters.slice(0, 3)) assert.equal(chapter.notes, undefined);
  assert.equal(book.chapters[3].notes.length, 1);
  assert.match(book.chapters[3].notes[0].html, /脚注文本/);
  assert.ok(!book.chapters[3].paragraphs.some(text => text.includes('脚注文本')));
  assert.equal(new Set(book.chapters.map(chapter => chapter.epubPath)).size, 4);
});

test('EPUB3 nav splits a spine document and uses its labels as chapter titles', async () => {
  const book = await parseEPUB(await epub({
    spine: ['Text/book.xhtml'],
    nav: 'Text/nav.xhtml',
    files: {
      'Text/book.xhtml': `<html><head><title>导航测试</title></head><body><div id="root">
        <div class="page"><p id="a">第一章</p><p>正文一</p></div>
        <div class="page"><p id="b">第二章</p><p>正文二</p></div>
      </div></body></html>`,
      'Text/nav.xhtml': `<html><body><nav epub:type="toc"><ol>
        <li><a href="book.xhtml#a">第一章</a></li>
        <li><a href="book.xhtml#b">第二章</a></li>
      </ol></nav></body></html>`
    }
  }), 'toc-nav.epub');

  assert.equal(book.chapters.length, 2);
  assert.deepEqual(book.chapters.map(chapter => chapter.title), ['第一章', '第二章']);
  assert.deepEqual(book.chapters[0].paragraphs, ['第一章', '正文一']);
  assert.deepEqual(book.chapters[1].paragraphs, ['第二章', '正文二']);
});

test('a single TOC entry supplies the whole-document chapter title and removes a duplicate heading', async () => {
  const book = await parseEPUB(await epub({
    spine: ['Text/book.xhtml'],
    toc: 'toc.ncx',
    files: {
      'Text/book.xhtml': '<html><head><title>回退标题</title></head><body>' +
        '<h1 id="a">第1章 唯一</h1><p>正文</p></body></html>',
      'toc.ncx': ncx('<navPoint><navLabel><text>第1章 唯一</text></navLabel>' +
        '<content src="Text/book.xhtml#a"/></navPoint>')
    }
  }), 'toc-single.epub');

  assert.equal(book.chapters.length, 1);
  assert.equal(book.chapters[0].title, '第1章 唯一');
  assert.deepEqual(book.chapters[0].paragraphs, ['正文']);
});
