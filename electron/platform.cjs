// Keep platform differences in one place so Windows keeps its custom chrome.
function windowOptions(platform) {
 return platform==='darwin'
  ? {frame:true,titleBarStyle:'hidden',trafficLightPosition:{x:14,y:10}}
  : {frame:false};
}
function menuDefinitions(send) {
 return {
  file:[{label:'新聊天',accelerator:'CmdOrCtrl+O',click:()=>send('import')},{label:'搜索',accelerator:'CmdOrCtrl+K',click:()=>send('search')},{type:'separator'},{label:'导出当前文本',click:()=>send('export')},{label:'备份书库',click:()=>send('backup')},{label:'恢复书库',click:()=>send('restore')},{type:'separator'},{label:'关闭窗口',role:'close'},{label:'退出',role:'quit'}],
  edit:[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}],
  view:[{label:'侧边栏',click:()=>send('sidebar')},{label:'章节目录',click:()=>send('toc')},{label:'全部收起',click:()=>send('collapse')},{label:'工作摘要（空格）',click:()=>send('boss')},{type:'separator'},{label:'设置',click:()=>send('settings')},{role:'togglefullscreen',label:'全屏'}],
  help:[{label:'使用说明',click:()=>send('help')},{label:'关于 Cotex',click:()=>send('about')}]
 };
}
function applicationMenu(send) {
 const menus=menuDefinitions(send);
 return [
  {label:'Cotex',submenu:[{label:'关于 Cotex',click:()=>send('about')},{type:'separator'},{label:'设置…',accelerator:'Command+,',click:()=>send('settings')},{type:'separator'},{role:'services',label:'服务'},{type:'separator'},{role:'hide',label:'隐藏 Cotex'},{role:'hideOthers',label:'隐藏其他'},{role:'unhide',label:'显示全部'},{type:'separator'},{role:'quit',label:'退出 Cotex'}]},
  {label:'文件',submenu:menus.file.filter(item=>item.role!=='quit')},
  {label:'编辑',submenu:menus.edit},
  {label:'视图',submenu:menus.view},
  {role:'windowMenu',label:'窗口'},
  {label:'帮助',submenu:menus.help}
 ];
}
module.exports={windowOptions,menuDefinitions,applicationMenu};
