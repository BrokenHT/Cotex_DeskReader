const test=require('node:test'),assert=require('node:assert/strict');
const {windowOptions,menuDefinitions,applicationMenu}=require('../electron/platform.cjs');
test('macOS uses native traffic lights; Windows keeps frameless controls',()=>{
 assert.deepEqual(windowOptions('win32'),{frame:false});
 assert.equal(windowOptions('darwin').frame,true);
 assert.equal(windowOptions('darwin').titleBarStyle,'hidden');
 assert.ok(windowOptions('darwin').trafficLightPosition.x<82);
});
test('native menus support editing, close, quit and reader actions',()=>{
 const actions=[],menus=menuDefinitions(a=>actions.push(a));
 menus.file.find(i=>i.accelerator==='CmdOrCtrl+O').click();
 assert.deepEqual(actions,['import']);
 const native=applicationMenu(a=>actions.push(a));
 native[0].submenu.find(i=>i.accelerator==='Command+,').click();
 assert.deepEqual(actions,['import','settings']);
 assert.ok(native[0].submenu.some(i=>i.role==='quit'));
 assert.ok(native[1].submenu.some(i=>i.role==='close'));
 assert.ok(native[2].submenu.some(i=>i.role==='copy'));
 assert.ok(native.some(i=>i.role==='windowMenu'));
});
