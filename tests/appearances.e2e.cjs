const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const {imageFixture}=require('./image-fixture.cjs');
const root=path.resolve(__dirname,'..'),results=path.join(root,'test-results');fs.mkdirSync(results,{recursive:true});
const directory=fs.mkdtempSync(path.join(results,'appearances-')),fixture=path.join(directory,'pictures.epub'),backup=path.join(directory,'backup.json');
const errors=[];
async function launch(data){
 const env={...process.env,COTEX_DATA:data};delete env.ELECTRON_RUN_AS_NODE;delete env.COTEX_DEV_URL;delete env.DESKREADER_DEV_URL;
 const a=await electron.launch({...process.env.COTEX_TEST_EXE?{executablePath:process.env.COTEX_TEST_EXE}:{args:[root]},env,timeout:45000});
 const p=await a.firstWindow();p.on('pageerror',e=>errors.push(e.message));await p.waitForSelector('.chapter .prose');
 await a.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(1340,760);});
 return {a,p};
}
async function jump(p,q){const input=p.getByRole('textbox',{name:'搜索章节',exact:true});await input.fill(q);await input.press('Enter');}
async function skin(p,value){await p.getByRole('button',{name:'阅读设置',exact:true}).click();await p.getByLabel('界面外观',{exact:true}).selectOption(value);await p.keyboard.press('Escape');await expect(p.locator('.app')).toHaveClass(new RegExp('appearance-'+value));}
async function screenshot(p,name){await expect(p.locator('.toast')).toHaveCount(0,{timeout:6000});await p.screenshot({path:path.join(directory,name+'.png')});}
async function ring(p,buddy){const ring=p.getByRole('progressbar',{name:'小说阅读进度'});const percent=Number(await ring.getAttribute('aria-valuenow'));await expect(ring.locator('.progress-value')).toHaveAttribute('stroke-dashoffset',String(buddy?100-percent:percent));}
(async()=>{
 fs.writeFileSync(fixture,await imageFixture());let {a,p}=await launch(path.join(directory,'data'));
 try {
  await ring(p,false);
  await a.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},fixture);
  await p.getByRole('button',{name:'新聊天',exact:true}).click();await expect(p.locator('.chapter').first()).toHaveAttribute('id','chapter-0');
  await expect(p.locator('#chapter-0 .image-thumbnail')).toHaveCount(1);
  await expect.poll(()=>p.locator('#chapter-0 .image-thumbnail img').evaluate(img=>img.naturalWidth)).toBe(480);
  await jump(p,'第一章');await expect(p.locator('.chapter').first()).toHaveAttribute('id','chapter-1');
  const group=p.locator('#chapter-1 .epub-images');await expect(group.locator('.image-thumbnail')).toHaveCount(2);
  const order=await p.locator('#chapter-1 .prose').evaluate(el=>[...el.children].filter(e=>e.matches('p,.epub-images')).map(e=>e.tagName));expect(order).toEqual(['P','DIV','P','P']);
  await screenshot(p,'codex-images');await ring(p,false);
  await group.getByRole('button',{name:'已查看图片 · 2 张'}).click();await expect(group.locator('.image-thumbnail')).toHaveCount(0);
  await p.keyboard.press('Space');await expect(p.locator('.boss-content')).toBeVisible();await p.keyboard.press('Space');await expect(group).toHaveClass(/images-collapsed/);
  await group.getByRole('button',{name:'已查看图片 · 2 张'}).click();await group.getByRole('button',{name:'查看图片 1：山谷的白昼'}).click();
  await expect(p.getByRole('dialog',{name:'查看图片'}).locator('img')).toHaveAttribute('alt','山谷的白昼');
  await p.keyboard.press('Space');await expect(p.getByRole('dialog',{name:'查看图片'})).toBeVisible();await screenshot(p,'image-preview');await p.keyboard.press('Escape');
  await p.getByRole('button',{name:'自定义头像',exact:true}).click();await p.getByLabel('头像文字',{exact:true}).fill('ABC');await p.getByLabel('头像颜色',{exact:true}).fill('#184a63');await p.keyboard.press('Escape');
  await expect(p.locator('.rail .profile-avatar')).toHaveText('AB');
  await skin(p,'workbuddy');await expect(p.locator('.chapter').first()).toHaveAttribute('id','chapter-1');await expect(p.locator('.rail')).toHaveCount(0);await ring(p,true);
  await screenshot(p,'workbuddy-images');
  await p.getByRole('button',{name:'自定义昵称和头像',exact:true}).click();await p.getByLabel('昵称',{exact:true}).fill('一二三四五六七八九十甲乙丙');await p.getByLabel('头像文字',{exact:true}).fill('猫咪喵');await p.getByLabel('头像颜色',{exact:true}).fill('#35a080');
  await expect(p.getByLabel('昵称',{exact:true})).toHaveValue('一二三四五六七八九十甲乙');await expect(p.getByLabel('头像文字',{exact:true})).toHaveValue('猫咪');await screenshot(p,'profile-settings');
  await p.getByLabel('选择头像图片',{exact:true}).setInputFiles(path.join(root,'assets/icon.png'));await expect(p.locator('.profile-preview img')).toBeVisible();await p.keyboard.press('Escape');await expect(p.locator('.buddy-profile img')).toBeVisible();
  // Mouse-focused chapter controls must never activate on Space.
  await p.getByRole('button',{name:'定位下一章',exact:true}).click();await expect(p.locator('.chapter').first()).toHaveAttribute('id','chapter-2');
  await p.keyboard.press('Space');await expect(p.locator('.boss-content')).toBeVisible();await p.keyboard.press('Space');await expect(p.locator('.chapter').first()).toHaveAttribute('id','chapter-2');
  await jump(p,'第一章');await p.locator('#chapter-1 .image-toggle').click();await expect(p.locator('#chapter-1 .epub-images')).toHaveClass(/images-collapsed/);
  const more=p.locator('.book-more').first();await more.hover();await more.click();await expect(p.locator('.row-popover')).toBeVisible();await p.getByRole('button',{name:'切换目录面板',exact:true}).click();await expect(p.locator('.row-popover')).toHaveCount(0);await expect(p.locator('.toc-panel')).toBeVisible();await p.getByRole('button',{name:'关闭目录',exact:true}).click();
  await p.getByRole('button',{name:'阅读设置',exact:true}).click();await p.getByLabel('外观',{exact:true}).selectOption('dark');await p.keyboard.press('Escape');
  await a.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(760,600));await expect(p.locator('.sidebar')).toHaveCount(0);await screenshot(p,'workbuddy-narrow-dark');
  expect(await p.locator('.main').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  expect(await p.locator('.composer').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await p.locator('.model-select').click();await p.getByLabel('外观',{exact:true}).selectOption('light');await p.keyboard.press('Escape');
  await a.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1340,760));await p.getByRole('button',{name:'切换侧边栏 Ctrl+B',exact:true}).click();
  await a.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},backup);
  await p.getByRole('button',{name:'阅读设置',exact:true}).click();await p.getByRole('button',{name:'备份书库',exact:true}).click();await expect(p.locator('.toast')).toContainText('书库备份已保存');await p.keyboard.press('Escape');
  const saved=JSON.parse(fs.readFileSync(backup));expect(saved.settings.appearance).toBe('workbuddy');expect(saved.settings.buddyAvatarImage).toMatch(/^data:image\/png/);const savedBook=saved.books.find(b=>b.title==='图文阅读测试');expect(Object.keys(savedBook.media)).toHaveLength(2);expect(savedBook.collapsedImages).toContain('1:1');
  await skin(p,'codex');await expect(p.locator('.rail .profile-avatar')).toHaveText('AB');await ring(p,false);await skin(p,'workbuddy');
  await a.close();({a,p}=await launch(path.join(directory,'data')));await expect(p.locator('.app')).toHaveClass(/appearance-workbuddy/);await expect(p.locator('#chapter-1 .epub-images')).toHaveClass(/images-collapsed/);await expect(p.locator('.buddy-profile img')).toBeVisible();
  await a.close();({a,p}=await launch(path.join(directory,'restored')));
  await a.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},backup);
  await p.getByRole('button',{name:'阅读设置',exact:true}).click();await p.getByRole('button',{name:'恢复书库',exact:true}).click();await expect(p.locator('.toast')).toContainText('已合并恢复');await p.keyboard.press('Escape');
  await expect(p.locator('.app')).toHaveClass(/appearance-workbuddy/);await p.keyboard.press('Control+k');await p.getByRole('textbox',{name:'搜索书名或作者'}).fill('图文阅读测试');await p.locator('.library-book').click();await expect(p.locator('#chapter-1 .epub-images')).toHaveClass(/images-collapsed/);
  await p.locator('#chapter-1 .image-toggle').click();await expect(p.locator('#chapter-1 .image-thumbnail')).toHaveCount(2);await expect.poll(()=>p.locator('#chapter-1 .image-thumbnail img').first().evaluate(i=>i.naturalWidth)).toBe(480);
  await screenshot(p,'restored-workbuddy');expect(errors).toEqual([]);
  console.log('PASS: both skins, ring directions, EPUB picture order/preview/collapse, profiles/upload, Space/menu regressions, narrow dark layout, restart, backup and restore.');console.log('Screenshots: '+directory);
 }finally{await a.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
