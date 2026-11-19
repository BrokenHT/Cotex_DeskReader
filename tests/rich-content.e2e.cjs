const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),JSZip=require('jszip');
const {parseEPUB,finalizeBook}=require('../electron/core.cjs');
const {Store}=require('../electron/store.cjs');

const root=path.resolve(__dirname,'..'),results=path.join(root,'test-results');
fs.mkdirSync(results,{recursive:true});
const directory=fs.mkdtempSync(path.join(results,'rich-content-'));
const errors=[];

const chart=`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180" viewBox="0 0 360 180">
  <rect width="360" height="180" rx="12" fill="#eef4ff"/>
  <polyline points="28,146 112,84 196,116 332,40" fill="none" stroke="#2f6fed" stroke-width="7" stroke-linecap="round"/>
  <circle cx="112" cy="84" r="7" fill="#2f6fed"/><circle cx="196" cy="116" r="7" fill="#2f6fed"/>
  <text x="180" y="168" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#43516b">季度趋势图</text>
</svg>`;

function mediaType(href) {
  if (/\.xhtml$/i.test(href)) return 'application/xhtml+xml';
  if (/\.svg$/i.test(href)) return 'image/svg+xml';
  return 'application/octet-stream';
}

async function richEpub() {
  const files = {
    'Text/ch1.xhtml': `<html><head><title>回退标题</title></head><body>
      <h1>富内容验收</h1>
      <p>这段包含<em>强调</em>和<strong>加粗</strong>。</p>
      <h2>小节标题</h2>
      <table><caption>年度数据</caption><thead><tr><th>项目</th><th>数值</th></tr></thead>
        <tbody><tr><td>收入</td><td>128</td></tr><tr><td colspan="2">备注合并</td></tr></tbody></table>
      <p>行内公式 <math><semantics><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow>
        <annotation encoding="application/x-tex">a+b</annotation></semantics></math> 结束。</p>
      <math display="block"><semantics><mrow><mi>c</mi><mo>=</mo><msup><mi>x</mi><mn>2</mn></msup></mrow>
        <annotation encoding="application/x-tex">c=x^2</annotation></semantics></math>
      <figure><img src="../Images/chart.svg" alt="季度趋势图"/><figcaption>图 1 图表</figcaption></figure>
      <ul><li>要点一</li><li>要点二</li></ul>
      <blockquote><p>引用块</p></blockquote>
      <p>脚注段落<sup><a epub:type="noteref" href="#fn1">1</a></sup>结束。</p>
      <aside epub:type="footnote" id="fn1"><p>这是脚注正文 <em>重点</em>。</p></aside>
    </body></html>`,
    'Images/chart.svg': chart
  };
  const zip = new JSZip();
  zip.file('META-INF/container.xml',
    '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>');
  const hrefs = Object.keys(files);
  const manifest = hrefs.map((href, index) =>
    `<item id="f${index}" href="${href}" media-type="${mediaType(href)}"/>`).join('');
  zip.file('OPS/book.opf',
    '<package><metadata><title>富内容验收</title><creator>测试作者</creator></metadata>' +
    `<manifest>${manifest}</manifest><spine><itemref idref="f0"/></spine></package>`);
  for (const [href, content] of Object.entries(files)) zip.file('OPS/' + href, content);
  return zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
}

async function seed() {
  const data = path.join(directory, 'data');
  const book = finalizeBook(await parseEPUB(await richEpub(), 'rich-content.epub'), 'rich-content-e2e');
  const store = new Store(data);
  store.add(book);
  store.db.seeded = true;
  store.write();
  return data;
}

async function launch(data) {
  const env = {...process.env, COTEX_DATA: data};
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.COTEX_DEV_URL;
  delete env.DESKREADER_DEV_URL;
  const app = await electron.launch({args: [root], env, timeout: 45000});
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForSelector('.chapter .prose', {timeout: 20000});
  return {app, page};
}

(async () => {
  const data = await seed();
  let {app, page} = await launch(data);
  try {
    await expect(page.locator('.book-row')).toHaveCount(1);
    await expect(page.locator('.chapter').first()).toContainText('富内容验收');

    await expect(page.locator('.rich-table table')).toHaveCount(1);
    await expect(page.locator('.rich-table table')).toContainText('年度数据');
    await expect(page.locator('.rich-table th')).toHaveCount(2);
    await expect(page.locator('.rich-table td[colspan="2"]')).toHaveCount(1);

    await expect(page.locator('.rich-text math')).toHaveCount(1);
    await expect(page.locator('.rich-math math')).toHaveCount(1);
    await expect(page.locator('.rich-math math')).toBeVisible();
    await expect(page.locator('.rich-text annotation')).toHaveCount(0);
    await expect(page.locator('.rich-math annotation')).toHaveCount(0);
    await expect(page.locator('.rich-math')).not.toContainText('c=x^2');

    await expect(page.locator('.rich-figure img')).toHaveCount(0);
    await expect(page.locator('.rich-figure figcaption')).toHaveText('图 1 图表');

    const gallery = page.locator('.epub-images');
    await expect(gallery).toHaveCount(1);
    const imageToggle = gallery.locator('.image-toggle');
    await expect(imageToggle).toContainText('已查看图片');
    await expect(imageToggle).toHaveAttribute('aria-expanded', 'true');
    const thumbnail = gallery.locator('.image-thumbnail');
    await expect(thumbnail).toHaveCount(1);
    await expect(thumbnail.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml;base64,/);
    await gallery.screenshot({path: path.join(directory, '03-figure.png')});
    await imageToggle.click();
    await expect(imageToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(thumbnail).toHaveCount(0);
    await imageToggle.click();
    await expect(imageToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(thumbnail).toHaveCount(1);

    const preview = page.getByRole('dialog', {name: '查看图片'});
    await thumbnail.click();
    await expect(preview).toBeVisible();
    await expect(preview.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml;base64,/);
    const stage = await preview.locator('.image-viewer-stage').boundingBox();
    const shown = await preview.locator('img').boundingBox();
    expect(shown.width).toBeGreaterThan(stage.width * 0.9);
    expect(shown.height).toBeGreaterThan(stage.height * 0.9);
    await page.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);
    await thumbnail.focus();
    await page.keyboard.press('Enter');
    await expect(preview).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);
    await imageToggle.click();
    await expect(thumbnail).toHaveCount(0);

    await expect(page.locator('.rich-html h2')).toHaveText('小节标题');
    await expect(page.locator('.rich-list li')).toHaveCount(2);
    await expect(page.locator('.rich-quote blockquote')).toContainText('引用块');
    await expect(page.locator('.chapter')).toHaveCount(1);
    await expect(page.locator('.chapter .prose')).not.toContainText('这是脚注正文');

    await page.locator('.rich-table').screenshot({path: path.join(directory, '01-table.png')});
    await page.locator('.rich-math').screenshot({path: path.join(directory, '02-math.png')});

    const ref = page.locator('.rich-note-ref');
    await expect(ref).toHaveCount(1);
    await expect(ref).toHaveText('1');
    await expect(ref).toHaveAttribute('tabindex', '0');

    const dialog = page.getByRole('dialog', {name: '注释 1'});
    await ref.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.rich-note')).toContainText('这是脚注正文');
    await expect(dialog.locator('.rich-note em')).toHaveText('重点');
    await page.screenshot({path: path.join(directory, '04-note.png')});
    await dialog.getByRole('button', {name: '关闭'}).click();
    await expect(dialog).toHaveCount(0);

    await ref.focus();
    await page.keyboard.press('Space');
    await expect(dialog).toBeVisible();
    await expect(page.locator('.boss-content')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await ref.focus();
    await ref.press('Enter');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(820, 700));
    const pageOverflow = await page.evaluate(() => {
      const main = document.querySelector('.main');
      return main.scrollWidth > main.clientWidth + 1;
    });
    expect(pageOverflow).toBe(false);
    await page.screenshot({path: path.join(directory, '05-narrow.png')});

    await app.close();
    ({app, page} = await launch(data));
    await expect(page.locator('.rich-table table')).toBeVisible();
    await expect(page.locator('.rich-math math')).toBeVisible();
    await expect(page.locator('.rich-figure figcaption')).toHaveText('图 1 图表');
    await expect(page.locator('.epub-images .image-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.image-thumbnail')).toHaveCount(0);
    await page.locator('.epub-images .image-toggle').click();
    await expect(page.locator('.image-thumbnail')).toHaveCount(1);
    await expect(page.locator('.rich-note-ref')).toHaveCount(1);

    expect(errors).toEqual([]);
    console.log('PASS: rich EPUB E2E — table, MathML, default-open image gallery with fold/preview, full-window viewer, heading, list, quote, click/keyboard footnote modal, no duplicate inline image, no page overflow, persisted after restart.');
    console.log('Screenshots: ' + directory);
  } finally {
    await app.close().catch(() => {});
  }
})().catch(error => {console.error(error);process.exitCode = 1;});
