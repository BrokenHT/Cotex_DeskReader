const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),results=path.join(root,'test-results');
fs.mkdirSync(results,{recursive:true});
const directory=fs.mkdtempSync(path.join(results,'work-summary-'));
const fixture=path.join(directory,'只应出现在书库的小说标题.txt');
const marker='小说正文专用标记，不应进入工作摘要或文件预览';
fs.writeFileSync(fixture,Array.from({length:4},(_,i)=>'第'+(i+1)+'章 小说章节'+(i+1)+'\n\n'+Array.from({length:160},(_,j)=>marker+'。这是第'+(j+1)+'段用于验证阅读位置和工作提示的正文。').join('\n\n')).join('\n\n'));
const errors=[];
async function launch(){
 const env={...process.env,COTEX_DATA:path.join(directory,'data')};
 delete env.ELECTRON_RUN_AS_NODE;delete env.COTEX_DEV_URL;delete env.DESKREADER_DEV_URL;
 const app=await electron.launch({...process.env.COTEX_TEST_EXE?{executablePath:process.env.COTEX_TEST_EXE}:{args:[root]},env,timeout:45000});
 const p=await app.firstWindow();p.on('pageerror',e=>errors.push(e.message));
 await p.waitForSelector('.chapter .prose');
 await app.evaluate(({BrowserWindow,shell})=>{BrowserWindow.getAllWindows()[0].setSize(1340,860);globalThis.summaryExternalCalls=[];shell.openExternal=async url=>globalThis.summaryExternalCalls.push(url);});
 return {app,p};
}
async function skin(p,value){await p.locator('.model-select').click();await p.getByLabel('界面外观',{exact:true}).selectOption(value);await p.keyboard.press('Escape');}
async function noOverflow(p,selector){expect(await p.locator(selector).evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1))).toBe(true);}
async function workHints(p){return p.locator('.prose .work-hint[data-hint-icon]').evaluateAll(els=>els.map(el=>[el.dataset.hintIcon,el.textContent]));}
async function shot(p,name){await expect(p.locator('.toast')).toHaveCount(0,{timeout:6000});await p.screenshot({path:path.join(directory,name+'.png')});}
async function activeBook(p){return p.evaluate(async()=>{const state=await window.desk.state();return window.desk.open(state.activeId);});}

(async()=>{
 let {app,p}=await launch();
 try{
  expect(await app.evaluate(({app})=>app.getVersion())).toBe('1.1.4');
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},fixture);
  await p.getByRole('button',{name:'新聊天',exact:true}).click();
  await expect(p.locator('.chapter').first()).toHaveAttribute('id','chapter-0');
  await expect(p.locator('.prose').first()).toContainText(marker);
  const hints=await workHints(p),kinds=[...new Set(hints.map(h=>h[0]))];
  expect(kinds.length).toBeGreaterThanOrEqual(14);
  expect(hints.map(h=>h[1])).toContain('编辑了文件运行了命令');
  expect(hints.map(h=>h[1])).toContain('运行了命令');
  await shot(p,'01-codex-status');
  await p.keyboard.press('Control+d');await expect(p.locator('.toast')).toContainText('书签');
  const before=await activeBook(p);
  await p.locator('.prose p').first().click();await p.keyboard.press('Space');
  const boss=p.locator('.boss-content');await expect(boss).toBeVisible();
  await expect(boss.locator('.summary-file-link')).toHaveCount(2);
  await expect(boss.locator('.summary-file-link').first()).toHaveCSS('color','rgb(0, 101, 189)');
  await expect(boss.locator('.summary-pdf-icon')).toHaveCount(1);
  const attachment=boss.locator('.summary-file-link').first();
  await attachment.hover();
  const linkLabel=attachment.locator('span');
  await expect(linkLabel).toHaveCSS('text-decoration-style','dashed');
  expect(await linkLabel.evaluate(el=>{
   const style=getComputedStyle(el);
   return style.textDecorationColor===style.color;
  })).toBe(true);
  await expect(linkLabel).toHaveCSS('font-weight','500');
  await expect(boss.locator('.thought-line')).toHaveCSS('font-size','14px');
  await expect(p.locator('.group-title').first()).toHaveCSS('font-weight','500');
  await expect(p.locator('.model-select')).toHaveCSS('font-size','13px');
  await expect(p.locator('.brand .codex-wordmark')).toHaveAttribute('height','18');
  const session=await p.context().newCDPSession(p);
  await p.evaluate(()=>document.fonts.ready);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  const {root:dom}=await session.send('DOM.getDocument');
  for(const [selector,family] of [['.group-title',/Noto Sans SC/i],['.model-select > span',/Segoe UI/i]]) {
   const {nodeId}=await session.send('DOM.querySelector',{nodeId:dom.nodeId,selector});
   const {fonts}=await session.send('CSS.getPlatformFontsForNode',{nodeId});
   expect(fonts.some(font=>family.test(font.familyName)&&font.glyphCount>0)).toBe(true);
  }
  await session.detach();
  const change=boss.locator('.summary-change-card');
  await expect(change).toContainText('已编辑 build_brief.py');
  await expect(change.locator('.summary-change-title')).toHaveCSS('font-size','14px');
  await change.getByRole('button',{name:'查看变更'}).click();
  const diff=p.getByRole('dialog',{name:'查看变更'});
  await expect(diff.locator('.diff-add')).toHaveCount(6);
  await expect(diff.locator('.diff-remove')).toHaveCount(2);
  await p.keyboard.press('Escape');
  await expect(diff).toHaveCount(0);
  await expect(boss).toBeVisible();
  await change.getByRole('button',{name:'撤销',exact:true}).click();
  await expect(change).toContainText('已撤销 build_brief.py');
  await expect(change.locator('.summary-change-counts')).toHaveCount(0);
  await change.getByRole('button',{name:'重新应用'}).click();
  await expect(change.locator('.summary-change-counts')).toHaveText('+6-2');
  await change.scrollIntoViewIfNeeded();await shot(p,'07-change-card');
  expect(await boss.innerText()).not.toContain(marker);expect(await boss.innerText()).not.toContain(before.title);
  await p.locator('.conversation').evaluate(el=>el.scrollTop=0);
  await shot(p,'02-codex-summary');
  await boss.locator('.summary-file-link').first().click();
  const dialog=p.getByRole('dialog',{name:'工作摘要附件'});
  await expect(dialog).toBeVisible();await expect(dialog.locator('.summary-document-pdf')).toBeVisible();
  expect(await dialog.innerText()).not.toContain(marker);expect(await dialog.innerText()).not.toContain(before.title);
  await p.keyboard.press('Space');await expect(dialog).toBeVisible();await expect(p.locator('.prose')).toHaveCount(0);
  await shot(p,'03-pdf-summary-preview');
  // Closing a nested preview must not accidentally expose the novel.
  await p.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(boss).toBeVisible();await expect(p.locator('.prose')).toHaveCount(0);
  await boss.locator('.summary-file-link').last().click();await expect(dialog.locator('.summary-document-txt')).toBeVisible();
  await dialog.getByRole('button',{name:'返回工作摘要'}).click();await expect(boss).toBeVisible();
  await p.keyboard.press('Space');await expect(boss).toHaveCount(0);await expect(p.locator('.prose').first()).toContainText(marker);
  expect(await workHints(p)).toEqual(hints);
  expect((await activeBook(p)).bookmarks).toEqual(before.bookmarks);
  await expect(p.locator('.chapter').first()).toHaveAttribute('id','chapter-0');

  await p.getByRole('button',{name:'收起正文 1',exact:true}).click();
  const collapsed=p.locator('#chapter-0');await expect(collapsed.locator('.summary-file-link')).toHaveCount(2);
  await expect(collapsed.locator('.summary-change-card')).toHaveCount(1);
  await expect(collapsed.locator('.prose')).toHaveCount(0);
  await collapsed.locator('.summary-file-link').last().click();await expect(dialog).toBeVisible();
  await p.keyboard.press('Escape');await expect(collapsed).toHaveClass(/collapsed/);
  await p.getByRole('button',{name:'展开正文 1',exact:true}).click();
  await skin(p,'workbuddy');
  const buddyKinds=[...new Set((await workHints(p)).map(h=>h[0]))];expect(buddyKinds).toHaveLength(12);expect(buddyKinds).toContain('validation');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1340,768));
  const promo=p.getByRole('region',{name:'推广轮播'});
  await expect(promo).toBeVisible();
  await expect(promo.locator('strong')).toHaveText('Hy4 正式版发布');
  const sidebarBounds=await p.locator('.sidebar').evaluate(sidebar=>{
   const bounds=selector=>sidebar.querySelector(selector).getBoundingClientRect();
   return {
    taskY:bounds('.group-title').top,
    spaceGap:bounds('.secondary-group').top-Array.from(sidebar.querySelectorAll('.book-row')).at(-1).getBoundingClientRect().bottom,
    profileGap:bounds('.buddy-profile').top-bounds('.buddy-promo').bottom,
   };
  });
  expect(sidebarBounds.taskY).toBeGreaterThanOrEqual(310);
  expect(sidebarBounds.taskY).toBeLessThanOrEqual(320);
  expect(sidebarBounds.spaceGap).toBeGreaterThanOrEqual(18);
  expect(sidebarBounds.spaceGap).toBeLessThanOrEqual(21);
  expect(sidebarBounds.profileGap).toBeCloseTo(4,0);
  await expect(promo.locator('strong')).toHaveText('混元Hy4「体验官」征集活动',{timeout:8000});
  await shot(p,'08-workbuddy-sidebar');
  await promo.getByRole('button',{name:'立即参与'}).click();
  await expect(p.getByRole('dialog',{name:'搜索资料'})).toBeVisible();
  await p.keyboard.press('Escape');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(760,600));
  const sidebarToggle=p.getByRole('button',{name:'切换侧边栏 Ctrl+B',exact:true});
  await sidebarToggle.click();
  const taskList=p.locator('.sidebar-list');
  expect(await taskList.evaluate(list=>list.scrollHeight>list.clientHeight)).toBe(true);
  await taskList.evaluate(list=>{list.scrollTop=list.scrollHeight;});
  const compactGap=await p.locator('.sidebar').evaluate(el=>el.querySelector('.buddy-profile').getBoundingClientRect().top-el.querySelector('.buddy-promo').getBoundingClientRect().bottom);
  expect(compactGap).toBeCloseTo(4,0);
  await promo.getByRole('button',{name:'做任务赢积分好礼',exact:true}).click();
  await expect(promo.locator('strong')).toHaveText('做任务赢积分好礼');
  await shot(p,'09-workbuddy-compact-sidebar');
  await promo.getByRole('button',{name:'本次隐藏推广轮播'}).click();
  await expect(promo).toHaveCount(0);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1340,860));
  await p.locator('.prose p').first().click();await p.keyboard.press('Space');
  await expect(boss.locator('.summary-file-link')).toHaveCount(2);
  await expect(boss.locator('.summary-change-card')).toHaveCount(0);
  await boss.locator('.summary-file-link').last().click();await expect(dialog).toBeVisible();await p.keyboard.press('Escape');await expect(boss).toBeVisible();
  await p.keyboard.press('Escape');await expect(boss).toHaveCount(0);

  await skin(p,'codex');
  await p.getByRole('button',{name:'阅读设置',exact:true}).click();
  const hintsToggle=p.getByLabel('插入工作提示行',{exact:false});await hintsToggle.uncheck();await p.keyboard.press('Escape');
  await expect(p.locator('.prose .work-hint')).toHaveCount(0);
  await p.getByRole('button',{name:'阅读设置',exact:true}).click();await hintsToggle.check();await p.getByLabel('外观',{exact:true}).selectOption('dark');await p.keyboard.press('Escape');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(720,650));
  await p.locator('.prose p').first().click();await p.keyboard.press('Space');await expect(boss).toBeVisible();
  await noOverflow(p,'.main, .summary-text, .summary-files, .summary-change-card');
  await boss.locator('.summary-change-card').scrollIntoViewIfNeeded();
  await shot(p,'06-change-card-narrow-dark');
  await boss.locator('.summary-file-link').first().scrollIntoViewIfNeeded();await shot(p,'04-summary-narrow-dark');
  // Keyboard-selected file buttons keep normal Space activation.
  await p.keyboard.press('Tab');await boss.locator('.summary-file-link').first().focus();await p.keyboard.press('Space');
  await expect(dialog).toBeVisible();await noOverflow(p,'.modal, .summary-file-preview, .summary-document');await shot(p,'05-preview-narrow-dark');
  await p.keyboard.press('Escape');await expect(boss).toBeVisible();await p.keyboard.press('Escape');await expect(boss).toHaveCount(0);
  expect(await app.evaluate(()=>globalThis.summaryExternalCalls)).toEqual([]);
  await app.close();({app,p}=await launch());
  await expect(p.locator('.chapter').first()).toHaveAttribute('id','chapter-0');expect((await activeBook(p)).bookmarks).toEqual(before.bookmarks);
  await p.locator('.prose p').first().click();await p.keyboard.press('Space');await expect(p.locator('.boss-content .summary-file-link')).toHaveCount(2);
  expect(errors).toEqual([]);
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify({passed:true,version:'1.1.4',codexHintKinds:kinds,buddyHintKinds:buddyKinds,screenshots:directory},null,2));
  console.log('PASS: varied stable statuses; both summary modes and skins; PDF/TXT preview; no novel leakage/external opens; nested Escape and focus-aware Space; hints toggle; narrow dark layout; bookmarks/restart.');console.log('Screenshots: '+directory);
 }finally{await app.close().catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
