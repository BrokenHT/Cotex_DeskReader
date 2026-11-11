const {app,BrowserWindow,ipcMain,dialog,Menu,net,shell,session,screen}=require('electron');
const fs=require('node:fs');const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {parseTXT,parseEPUB,finalizeBook,chapterMatches,MAX_BYTES,uid}=require('./core.cjs');
const {Store}=require('./store.cjs');
const {Sources,SOURCE_LIST,isSourceURL,withCatalog}=require('./sources.cjs');
const {readWindowState,rememberWindow}=require('./window-state.cjs');
const {LegadoBridge,toCotexBook,progressPayload,workAlias,needsAliasRepair,mergeCatalogue,hasPlaceholderCatalogue}=require('./legado-bridge.cjs');
const {toChapterPos}=require('./reading-progress.cjs');
const {readLegadoSettings,applyLegadoPatch}=require('./legado-settings.cjs');
const {createChapterLoader}=require('./chapter-loader.cjs');
let win,store,sources,closeAllowed=false,legado=null;
// Kept as an alias so existing references stay valid.
const LEGADO_DEFAULTS=readLegadoSettings();
app.setName('Cotex');
const dev=process.env.COTEX_DEV_URL||process.env.DESKREADER_DEV_URL;
const testData=process.env.COTEX_DATA||process.env.DESKREADER_DATA;
if(testData)app.setPath('userData',path.resolve(testData));
else app.setPath('userData',path.join(app.getPath('appData'),'DeskReader'));
app.setAppUserModelId('local.deskreader.app');
const only=app.requestSingleInstanceLock();
if(!only)app.quit();
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
const contentFile=path.join(__dirname,'../dist/index.html');
const send=a=>win?.webContents.send('action',a);
function handler(name,fn){ipcMain.handle(name,async(e,...args)=>{
 const url=e.senderFrame?.url||'';
 if(e.sender!==win?.webContents||e.senderFrame!==e.sender.mainFrame||!(url===pathToFileURL(contentFile).href||(dev&&url.startsWith(dev))))throw new Error('非法请求');
 return fn(...args);
});}
let chapterLoader=null;
function ensureLegadoChapter(id,index){return chapterLoader.ensure(id,index);}
async function imports(paths){
 const results=[],errors=[];
 for(const file of paths.slice(0,20)){try{
  if(typeof file!=='string'||!/\.(txt|epub)$/i.test(file))throw new Error('请选择 TXT 或 EPUB 文件。');
  const stat=await fs.promises.stat(file);if(!stat.isFile()||stat.size>MAX_BYTES)throw new Error('文件超过 60 MB。');
  const bytes=await fs.promises.readFile(file);const p=/\.epub$/i.test(file)?await parseEPUB(bytes,path.basename(file)):parseTXT(bytes,path.basename(file));
  results.push(store.add(finalizeBook(p,'local:'+uid(bytes))));
 }catch(e){errors.push(path.basename(file)+'：'+e.message);}}
 return {books:results,errors};
}
async function chooseImport(){const r=await dialog.showOpenDialog(win,{title:'导入本地小说',properties:['openFile','multiSelections'],filters:[{name:'小说文件',extensions:['txt','epub']}]});return r.canceled?{books:[],errors:[]}:imports(r.filePaths);}
function register(){
 handler('state',()=>({...store.state(),sources:SOURCE_LIST}));
 handler('open',id=>{const b=store.get(id);store.db.activeId=id;store.write();return b;});
 handler('import',chooseImport);
 handler('import-paths',files=>imports(Array.isArray(files)?files:[]));
 handler('patch',(id,p)=>store.patch(id,p||{}));
 handler('settings',p=>store.settings(p||{}));
 handler('remove',id=>{store.remove(id);return store.state();});
 handler('search',(id,q,page)=>sources.search(id,q,page));
 handler('book-access',(id,remoteId)=>sources.bookAccess(id,remoteId));
 handler('add',async(id,remoteId)=>{const known=store.db.books.find(b=>b.source.id===id&&b.source.remoteId===remoteId);return known?store.get(known.id):store.add(await sources.add(id,remoteId));});
 handler('legado-settings',()=>readLegadoSettings(store.db.legado));
 handler('legado-config',p=>{const next=applyLegadoPatch(store.db.legado,p);store.db.legado=next;store.write();legado.reset();return next;});
 handler('legado-shelf',async()=>{
 if(!legado)throw new Error('Legado 连接尚未就绪');
 if(!(store.db.legado&&store.db.legado.enabled))throw new Error('Legado 手机书架未启用，请先在设置中打开');
 const remote=await legado.shelf();
 const existing=store.db.books.filter(b=>b.source.id==='legado');
 for(const r of remote){
  const shell=toCotexBook(r);
  const known=existing.find(b=>b.id===shell.id);
  if(!known){
   // Fetch the real catalogue instead of inventing placeholder titles.
   let chapters=[];
   try{chapters=await legado.chapters(shell.source.remoteId);}catch{}
   store.add(chapters.length?toCotexBook(r,chapters):shell);
   continue;
  }
  const latest=store.get(shell.id);
  // Placeholder catalogues (and length drift) mean the real one was never fetched.
  if(hasPlaceholderCatalogue(latest)||latest.chapters.length!==shell.chapters.length){
   const real=await legado.chapters(shell.source.remoteId).catch(()=>null);
   if(real&&real.length){mergeCatalogue(latest,real);store.save(latest);}
   continue;
  }
  if(!latest.chapters.length){
   const real=await legado.chapters(shell.source.remoteId).catch(()=>null);
   if(real&&real.length)mergeCatalogue(latest,real);
  }
 }
 return store.state();
});
 handler('legado-progress',async id=>{
  const b=store.get(id);
  if(b.source.id!=='legado')return {ok:false,reason:'not-legado'};
  if(!legado)return {ok:false,reason:'未配置 Legado 连接'};
  if(!(store.db.legado&&store.db.legado.enabled))return {ok:false,enabled:false,reason:'Legado 未启用，仅保存在本机'};
  let chapter=Math.max(0,Math.min(b.chapters.length-1,b.progress.chapter||0));
  let paragraph=b.progress.paragraph||0;
  let offsets=b.chapters[chapter]&&b.chapters[chapter].offsets;
  // Legado stores a character offset, so the chapter text must be known first.
  if(!(Array.isArray(offsets)&&offsets.length)){
    try{await chapterLoader.ensure(id,chapter,{force:true});}
    catch(e){const detail=String(e&&e.message||e);const net=/超时|timeout|ECONN|network|无法连接/.test(detail);return {ok:false,network:net,reason:'无法读取当前章节，进度未写回：'+detail,hint:net?(readLegadoSettings(store.db.legado).mode==='http'?'手机端连接中断；HTTP 模式需要手机保持亮屏。':'手机连接中断，请检查数据线与 USB 调试授权。'):undefined};}
    const fresh=store.get(id);
    // The user may have moved on while the chapter was downloading; a stale
    // coordinate must never overwrite a newer reading position.
    const freshChapter=Math.max(0,Math.min(fresh.chapters.length-1,fresh.progress.chapter||0));
    if(freshChapter!==chapter)return {ok:false,reason:'阅读位置已变化，稍后重试'};
    chapter=freshChapter;
    paragraph=fresh.progress.paragraph||0;
    offsets=fresh.chapters[chapter]&&fresh.chapters[chapter].offsets;
    if(!(Array.isArray(offsets)&&offsets.length))return {ok:false,reason:'当前章节没有可用于换算的正文偏移，进度未写回'};
  }
  const pos=toChapterPos(offsets,paragraph);
  const payload=progressPayload(store.get(id),chapter,pos);
  try{await legado.save(payload);}
  catch(e){return {ok:false,reason:String(e&&e.message||e)};}
  // Legado matches a book by name+author. An isSuccess reply does not prove the
  // position was applied, so read it back the way the ADB transport already does.
  // Legado matches a book by name+author. An isSuccess reply does not prove the
  // position was applied, so read it back the way the ADB transport already does.
  let shelf;
  try{shelf=await legado.shelf();}
  catch(e){return {ok:true,pos,unverified:true,reason:'进度已发送，但无法复核手机状态：'+String(e&&e.message||e)};}
  const named=(shelf||[]).filter(x=>x.name===payload.name&&x.author===payload.author);
  if(!named.length){
   return {ok:false,pos,mismatch:true,reason:'手机书架里找不到《'+payload.name+'》（作者：'+(payload.author||'未填')+'），书名或作者与手机端不一致，进度未写入'};
  }
  const applied=named.find(x=>Number(x.durChapterIndex)===payload.durChapterIndex&&Number(x.durChapterPos)===payload.durChapterPos);
  if(!applied){
   const at=named[0];
   return {ok:false,pos,mismatch:true,reason:'手机未接受该进度（手机当前在第 '+(Number(at.durChapterIndex)+1)+' 章）'+(named.length>1?'，且同名书籍不唯一':'')};
  }
  return {ok:true,pos,verified:true};
});
 handler('chapter-has-text',(id,index)=>{const b=store.get(id);const c=b.chapters[index];return !!(c&&c.paragraphs);});
 handler('legado-test',async()=>{
  if(!legado)return {ok:false,reason:'Legado 连接尚未就绪'};
  const s=readLegadoSettings(store.db.legado);
  if(!s.enabled)return {ok:false,reason:'Legado 未启用'};
  try{
   const shelf=await legado.shelf();
   chapterLoader.clearFailures();
   return {ok:true,count:Array.isArray(shelf)?shelf.length:0,mode:s.mode};
  }catch(e){
   const hint=s.mode==='http'
    ? '请确认手机与电脑在同一网络、Legado 的「Web 服务」已开启，且手机保持亮屏。'
    : '请确认数据线已连接、手机已授权 USB 调试。';
   return {ok:false,mode:s.mode,reason:String(e&&e.message||e),hint};
  }
 });
 handler('chapter',async(id,index)=>{
  if(!Number.isInteger(index))throw new Error('无效章节');
  const b=store.get(id);
  if(b.source.id==='legado')return ensureLegadoChapter(id,index);
  const c=await sources.chapter(b,index);
  if(!b.chapters[index].paragraphs){const latest=store.get(id);const target=latest.chapters.findIndex(x=>x.url===c.url);if(target>=0){latest.chapters[target]=c;store.save(latest);}}return c;
 });
 handler('find',(id,q)=>chapterMatches(store.get(id).chapters,String(q||'').slice(0,120)));
 handler('refresh',async id=>{const original=store.get(id);const updated=await sources.refresh(original);const latest=store.get(id);return store.save(original.updatedAt===latest.updatedAt?updated:withCatalog(latest,updated.chapters));});
 handler('external',url=>{const u=new URL(url);if(!isSourceURL(u.toString())&&!(u.protocol==='https:'&&u.hostname==='github.com'&&!u.username&&!u.password&&!u.port))throw new Error('不支持的链接');return shell.openExternal(u.toString());});
 handler('export',async id=>{const b=store.get(id);const r=await dialog.showSaveDialog(win,{defaultPath:b.title.replace(/[\\/:*?"<>|]/g,'_')+'.txt',filters:[{name:'TXT 文本',extensions:['txt']}]});if(r.canceled)return false;let t=b.title+'\n'+b.author+'\n来源：'+(b.source.url||'本地导入')+'\n\n';for(const c of b.chapters)if(c.paragraphs)t+=c.title+'\n\n'+c.paragraphs.join('\n\n')+'\n\n';await fs.promises.writeFile(r.filePath,t,'utf8');return true;});
 handler('backup',async()=>{const r=await dialog.showSaveDialog(win,{defaultPath:'Cotex-backup.json',filters:[{name:'书库备份',extensions:['json']}]});if(r.canceled)return false;await fs.promises.writeFile(r.filePath,JSON.stringify({format:'DeskReaderBackup',version:1,settings:store.db.settings,books:store.db.books.map(b=>store.get(b.id))}),'utf8');return true;});
 handler('restore',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'书库备份',extensions:['json']}]});if(r.canceled)return null;const f=r.filePaths[0];if((await fs.promises.stat(f)).size>300*1024*1024)throw new Error('备份文件过大');const d=JSON.parse(await fs.promises.readFile(f,'utf8'));if(d.format!=='DeskReaderBackup'||d.version!==1||!Array.isArray(d.books))throw new Error('不是有效的 Cotex / DeskReader 备份');for(const b of d.books){if(!/^[a-f0-9]{24}$/.test(b.id)||!Array.isArray(b.chapters)||!b.chapters.length||typeof b.title!=='string'||!b.progress||!Array.isArray(b.bookmarks)||!Array.isArray(b.collapsed))throw new Error('备份内容不完整');for(const c of b.chapters)if(typeof c.title!=='string'||(c.paragraphs!==null&&(!Array.isArray(c.paragraphs)||c.paragraphs.some(p=>typeof p!=='string'))))throw new Error('备份章节格式有误');}for(const b of d.books)store.add(b);store.settings(d.settings||{});return store.state();});
 handler('window',a=>{if(a==='minimize')win.minimize();if(a==='maximize')win.isMaximized()?win.unmaximize():win.maximize();if(a==='close'){closeAllowed=true;win.close();}});
 handler('menu',name=>{
  const definitions={
   file:[{label:'新聊天',accelerator:'CmdOrCtrl+O',click:()=>send('import')},{label:'搜索',accelerator:'CmdOrCtrl+K',click:()=>send('search')},{type:'separator'},{label:'导出当前文本',click:()=>send('export')},{label:'备份书库',click:()=>send('backup')},{label:'恢复书库',click:()=>send('restore')},{type:'separator'},{label:'退出',role:'quit'}],
   edit:[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}],
   view:[{label:'侧边栏',click:()=>send('sidebar')},{label:'章节目录',click:()=>send('toc')},{label:'全部收起',click:()=>send('collapse')},{label:'工作摘要（空格）',click:()=>send('boss')},{type:'separator'},{label:'设置',click:()=>send('settings')},{role:'togglefullscreen',label:'全屏'}],
   help:[{label:'使用说明',click:()=>send('help')},{label:'关于 Cotex',click:()=>send('about')}]
  };if(definitions[name])Menu.buildFromTemplate(definitions[name]).popup({window:win});
 });
}
app.whenReady().then(()=>{
 store=new Store(app.getPath('userData'));sources=new Sources((url,init)=>net.fetch(url,init));
 legado=new LegadoBridge(()=>({...LEGADO_DEFAULTS,...(store.db.legado||{})}));
 chapterLoader=createChapterLoader({store,legado});
 const leaked=store.db.books.filter(needsAliasRepair);
 for(const summary of leaked){const full=store.get(summary.id);full.alias=workAlias(full.id);store.save(full);}
 if(!store.db.seeded){
  const seeds=[['watermargin','23863','水浒传（七十回本）','施耐庵','检查原表'],['threekingdoms','23950','三国演义','罗贯中','分类细则最终版'],['redchamber','24264','红楼梦','曹雪芹','整理需求文档'],['journey','23962','西游记','吴承恩','核对项目资料']];
  for(const [name,id,title,author,alias] of seeds){const file=path.join(__dirname,'../assets/'+name+'.txt');if(fs.existsSync(file)){const b=finalizeBook({...parseTXT(fs.readFileSync(file),title+'.txt',{gutenberg:true,wrapped:true}),author},'gutenberg:'+id,{id:'gutenberg',name:'Project Gutenberg',remoteId:id,url:'https://www.gutenberg.org/ebooks/'+id});b.alias=alias;store.add(b);}}
  store.db.seeded=true;store.write();
 }
 Menu.setApplicationMenu(null);
 session.defaultSession.setPermissionRequestHandler((wc,permission,cb)=>cb(false));
 session.defaultSession.setPermissionCheckHandler(()=>false);
 const stateFile=path.join(app.getPath('userData'),'window-state.json');
 const {maximized,...bounds}=readWindowState(stateFile,screen);
 win=new BrowserWindow({...bounds,minWidth:Math.min(720,bounds.width),minHeight:Math.min(580,bounds.height),frame:false,backgroundColor:'#f8f0f6',title:'Cotex',icon:path.join(__dirname,'../assets/icon.png'),show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,spellcheck:false}});
 rememberWindow(win,stateFile);
 win.webContents.setZoomFactor(1);
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 register();
 win.on('close',event=>{if(!closeAllowed&&!win.webContents.isDestroyed()){event.preventDefault();send('prepare-close');}});
 win.once('ready-to-show',()=>{if(maximized)win.maximize();win.show();});
 if(dev)win.loadURL(dev);else win.loadFile(contentFile);
}).catch(e=>{dialog.showErrorBox('Cotex 启动失败',e.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
