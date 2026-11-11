const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
async function boot(platform) {
 const app=new EventEmitter(),ipc=new Map(),windows=[];let quits=0;
 Object.assign(app,{setName(){},setPath(){},getPath:()=>'/tmp/cotex-lifecycle',setAppUserModelId(){},requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),isReady:()=>true,
  quit(){app.emit('before-quit');if(windows.length){for(const w of [...windows])w.close();}else quits++;}
 });
 class Window extends EventEmitter {
  constructor(options){super();this.options=options;this.actions=[];windows.push(this);this.webContents=new EventEmitter();Object.assign(this.webContents,{mainFrame:{url:''},send:(_,a)=>this.actions.push(a),setZoomFactor(){},setWindowOpenHandler(){},isDestroyed:()=>false});}
  loadFile(file){this.webContents.mainFrame.url=require('node:url').pathToFileURL(file).href;}
  show(){} focus(){} isMinimized(){return false;}
  close(){let prevented=false;this.emit('close',{preventDefault(){prevented=true;}});if(!prevented){windows.splice(windows.indexOf(this),1);this.emit('closed');if(!windows.length)app.emit('window-all-closed');}}
 }
 const electron={app,BrowserWindow:Window,ipcMain:{handle(name,fn){assert.ok(!ipc.has(name),'IPC registered twice: '+name);ipc.set(name,fn);}},Menu:{setApplicationMenu(){},buildFromTemplate:x=>x},session:{defaultSession:{setPermissionRequestHandler(){},setPermissionCheckHandler(){}}},dialog:{showErrorBox(_,message){throw Error(message);}}};
 const root=path.resolve(__dirname,'../electron');
 const stubs={electron,'./core.cjs':{},'./store.cjs':{Store:class{constructor(){this.db={seeded:true};}}},'./sources.cjs':{Sources:class{}},'./window-state.cjs':{readWindowState:()=>({width:1000,height:700}),rememberWindow(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'main.cjs'),'utf8'),{require:name=>name in stubs?stubs[name]:require(name.startsWith('.')?path.join(root,name):name),process:{platform,env:{}},__dirname:root,console});
 await new Promise(resolve=>setImmediate(resolve));
 const call=(name,...args)=>{const w=windows[0];return ipc.get(name)({sender:w.webContents,senderFrame:w.webContents.mainFrame},...args);};
 return {app,windows,call,quits:()=>quits};
}
test('macOS native close saves first, Dock reopens, and quit completes after save',async()=>{
 const x=await boot('darwin');await x.call('renderer-ready');const first=x.windows[0];
 first.close();assert.equal(x.windows.length,1);assert.deepEqual(first.actions,['prepare-close']);
 await x.call('window','close');assert.equal(x.windows.length,0);assert.equal(x.quits(),0);
 x.app.emit('activate');assert.equal(x.windows.length,1);assert.notEqual(x.windows[0],first);
 await x.call('renderer-ready');x.app.quit();assert.equal(x.quits(),0);
 assert.deepEqual(x.windows[0].actions,['prepare-close']);
 await x.call('window','close');assert.equal(x.windows.length,0);assert.ok(x.quits()>0);
});
test('Windows still quits after its last window closes',async()=>{
 const x=await boot('win32');await x.call('renderer-ready');x.windows[0].close();
 await x.call('window','close');assert.equal(x.windows.length,0);assert.ok(x.quits()>0);
});
