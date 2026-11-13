const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium, expect } = require('@playwright/test');

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

(async () => {
  fs.mkdirSync(path.resolve(__dirname,'../test-results'),{recursive:true});
  const data = fs.mkdtempSync(path.join(path.resolve(__dirname,'../test-results'), 'portable-smoke-'));
  const env = { ...process.env, COTEX_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.COTEX_DEV_URL;
  delete env.DESKREADER_DEV_URL;
  const port = await freePort();
  const endpoint = 'http://127.0.0.1:' + port;
  const exe = process.env.COTEX_PORTABLE_EXE || path.resolve(__dirname,'../release/Cotex-1.1.4-Portable.exe');
  const child = spawn(exe, ['--remote-debugging-port=' + port], { env, windowsHide: true, stdio: 'ignore' });
  let browser;
  try {
    let available = false;
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline && child.exitCode === null) {
      const response = await fetch(endpoint + '/json/version', { signal: AbortSignal.timeout(750) }).catch(() => null);
      if (response?.ok) { available = true; break; }
      await delay(300);
    }
    if (!available) throw Error('The portable app did not expose its test endpoint.');
    browser = await chromium.connectOverCDP(endpoint, { timeout: 5000 });
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.waitForEvent('page', { timeout: 10000 });
    await page.waitForSelector('.chapter .prose', { timeout: 10000 });
    await expect(page).toHaveTitle('Cotex');
    await page.locator('.chapter .prose p').first().click();await page.keyboard.press('Space');
    const workSummary = page.locator('.boss-content');
    await expect(workSummary).toBeVisible();
    await expect(workSummary).toContainText('编辑了文件运行了命令');
    await expect(workSummary).toContainText('运行了命令');
    await expect(workSummary.locator('.summary-file-link')).toHaveCount(2);
    const loadedFont = await page.evaluate(async () => {
      const fonts = await document.fonts.load('500 14px "Cotex Noto Sans SC"', '已编辑');
      return fonts.some(font => font.status === 'loaded');
    });
    expect(loadedFont).toBe(true);
    await workSummary.getByRole('button',{name:'查看变更'}).click();
    const changePreview = page.getByRole('dialog',{name:'查看变更'});
    await expect(changePreview.locator('.diff-add')).toHaveCount(6);
    await page.keyboard.press('Escape');
    await expect(changePreview).toHaveCount(0);
    await expect(workSummary).toBeVisible();
    await workSummary.locator('.summary-file-link').first().click();
    const preview = page.getByRole('dialog',{name:'工作摘要附件'});
    await expect(preview.locator('.summary-document-pdf')).toBeVisible();
    await page.keyboard.press('Escape');await expect(preview).toHaveCount(0);await expect(workSummary).toBeVisible();
    await workSummary.locator('.summary-file-link').last().click();await expect(preview.locator('.summary-document-txt')).toBeVisible();
    await preview.getByRole('button',{name:'返回工作摘要'}).click();await expect(workSummary).toBeVisible();
    await page.keyboard.press('Space');await expect(workSummary).toHaveCount(0);await expect(page.locator('.chapter .prose').first()).toBeVisible();

    await page.getByRole('button', {name:'阅读设置',exact:true}).click();
    await page.getByLabel('界面外观',{exact:true}).selectOption('workbuddy');
    await page.keyboard.press('Escape');
    await expect(page.locator('.buddy-brand small')).toHaveText('V1.1.4');
    const promo = page.getByRole('region',{name:'推广轮播'});
    await expect(promo).toBeVisible();
    await promo.getByRole('button',{name:'做任务赢积分好礼',exact:true}).click();
    await expect(promo.locator('strong')).toHaveText('做任务赢积分好礼');
    await promo.getByRole('button',{name:'本次隐藏推广轮播'}).click();
    await expect(promo).toHaveCount(0);
    await expect(page.locator('.composer .reading-progress')).toBeVisible();
    await expect(page.locator('.access-label')).toHaveCSS('color', 'rgb(180, 44, 63)');
    await expect(page.locator('.buddy-send-icon')).toHaveCSS('transform', 'none');
    await expect(page.locator('.buddy-send-icon')).toHaveCSS('width', '32px');
    await expect.poll(() => page.locator('.assistant-identity .buddy-mark img').first().evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    expect(await page.locator('.model-select .deepseek-mark').evaluate(el => getComputedStyle(el).maskImage)).toContain('svg');
    const sendPosition = await page.locator('.send-button').evaluate(el => {
      const b = el.getBoundingClientRect(), s = el.querySelector('svg').getBoundingClientRect();
      return { dx: (s.left+s.right-b.left-b.right)/2, dy: (s.top+s.bottom-b.top-b.bottom)/2 };
    });
    expect(Math.abs(sendPosition.dx)).toBeLessThan(0.1);
    expect(Math.abs(sendPosition.dy)).toBeLessThan(0.1);
    await page.getByRole('button',{name:'自定义昵称和头像',exact:true}).click();
    await page.getByLabel('昵称',{exact:true}).fill('工作笔记');
    await page.getByLabel('头像文字',{exact:true}).fill('WB');
    await page.keyboard.press('Escape');
    await expect(page.locator('.buddy-profile')).toContainText('工作笔记');
    const popup = page.locator('.row-popover');
    await page.locator('.book-more').first().click();
    await expect(popup).toBeVisible();
    await page.getByRole('button', { name: '章节目录', exact: true }).click();
    await expect(popup).toHaveCount(0);
    await expect(page.locator('.toc-panel')).toBeVisible();
    const summary = page.locator('.boss-content');
    await page.keyboard.press('Space');
    await expect(summary).toBeVisible();
    await page.keyboard.press('Space');
    await expect(summary).toHaveCount(0);
    await expect(page.locator('.chapter .prose').first()).toBeVisible();
    await expect(page.locator('.toc-panel')).toBeVisible();
    await page.getByRole('button', { name: '定位下一章', exact: true }).click();
    const chapter = page.locator('.chapter').first();
    await expect(chapter).toHaveAttribute('id', 'chapter-1');
    await page.keyboard.press('Space');
    await expect(summary).toBeVisible();
    await page.keyboard.press('Space');
    await expect(chapter).toHaveAttribute('id', 'chapter-1');
    fs.writeFileSync(path.resolve(__dirname,'../test-results/portable-work-summary.json'),JSON.stringify({passed:true,version:'1.1.4',summaryPreviews:true,nestedEscape:true,space:true,workbuddy:true},null,2));
    console.log('PASS: actual Cotex 1.1.4 Portable, expanded work statuses, summary file previews, nested Escape, Space, WorkBuddy assets, profile and navigation.');
    const cdp = await browser.newBrowserCDPSession();
    await cdp.send('Browser.close').catch(() => {});
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(1500)]);
  } finally {
    if (child.exitCode === null && child.pid) {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    }
    await browser?.close().catch(() => {});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });


