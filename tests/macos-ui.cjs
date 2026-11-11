// Runs against a real macOS Electron window with an isolated library.
const {_electron:electron,expect}=require('@playwright/test');
const path=require('node:path'),fs=require('node:fs');
if(process.platform!=='darwin')throw new Error('Run this test on macOS.');
const root=path.resolve(__dirname,'..'),data=path.join(root,'test-results','mac-'+Date.now());
const env={...process.env,COTEX_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
(async()=>{
 const launchOptions=process.argv[2]?{executablePath:path.resolve(process.argv[2])}:{args:[root]};
 const app=await electron.launch({...launchOptions,env,timeout:45000});
 const errors=[];
 try{
  let page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  await page.waitForSelector('.chapter .prose');
  await expect(page.locator('.app')).toHaveClass(/platform-mac/);
  await expect(page.locator('.window-buttons')).toHaveCount(0);
  await expect(page.locator('.app-menu')).toHaveCount(0);
  const menus=await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.map(i=>i.label));
  expect(menus).toContain('Cotex');expect(menus).toContain('编辑');
  await page.keyboard.press('Meta+k');await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Meta+f');await expect(page.getByRole('textbox',{name:'搜索章节',exact:true})).toBeFocused();
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},path.join(__dirname,'fixtures/sample.epub'));
  await page.keyboard.press('Meta+o');
  await expect(page.locator('.book-row')).toHaveCount(5);
  await expect(page.locator('.chapter').first()).toContainText('这是一段可读的正文');
  await page.keyboard.press('Meta+d');await expect(page.locator('.toast')).toContainText('书签');
  await page.getByRole('textbox',{name:'搜索章节',exact:true}).fill('2');
  await page.getByRole('textbox',{name:'搜索章节',exact:true}).press('Enter');
  await expect(page.locator('.chapter').first()).toHaveAttribute('id','chapter-1');
  // Native close (red light / Cmd+W) saves progress without quitting the app.
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
  await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length)).toBe(0);
  const reopened=app.waitForEvent('window');await app.evaluate(({app})=>app.emit('activate'));
  page=await reopened;page.on('pageerror',e=>errors.push(e.message));
  await page.waitForSelector('.chapter .prose');
  await expect(page.locator('.chapter').first()).toHaveAttribute('id','chapter-1');
  await expect(page.locator('.book-row')).toHaveCount(5);
  // Menu actions also reopen a closed window and reach the new renderer.
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
  await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length)).toBe(0);
  const next=app.waitForEvent('window');
  await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.find(i=>i.label==='文件').submenu.items.find(i=>i.label==='搜索').click());
  page=await next;await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({path:path.join(data,'macos.png')});
  expect(errors).toEqual([]);
  // Cmd+Q / menu quit completes the asynchronous save-and-close handshake.
  const closed=app.waitForEvent('close');await app.evaluate(({app})=>{setTimeout(()=>app.quit(),0);});await closed;
  expect(fs.existsSync(path.join(data,'window-state.json'))).toBe(true);
  console.log('PASS: macOS chrome, Command shortcuts, import, bookmark, native close, Dock reopen, menu reopen, persistence and quit.');
 }finally{await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
