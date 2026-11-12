import React from 'react';
import {Globe,FileText,Image,SquareTerminal,FolderOpen,Search,ListChecks,CodeXml,Layers,Database,CheckCheck,Pencil,FileCheck2,Files,Link2,Save} from 'lucide-react';
import {LayoutGrid} from './ui-icons.jsx';

// A round, open-ended eye matching the validation indicator in the reference.
function ValidationEye({size=16}) {
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 9.1C19.7 5.2 16.5 2.8 12 2.8 7.3 2.8 3.5 6.2 1.8 12c1.7 5.8 5.5 9.2 10.2 9.2 4.5 0 7.7-2.4 10-6.3"/><circle cx="12" cy="12" r="4.3"/></svg>;
}
const buddyHints=[
 ['globe',Globe,'收集资料，核对相关记录'],
 ['validation',ValidationEye,'运行校验、修改：工作记录.md'],
 ['document',FileText,'读取文档，整理相关内容'],
 ['image',Image,'检查图片，核对相关素材'],
 ['terminal',SquareTerminal,'运行命令，检查处理结果'],
 ['folder',FolderOpen,'查看文件，核对资料目录'],
 ['search',Search,'搜索资料，补充相关信息'],
 ['checklist',ListChecks,'检查任务清单与完成情况'],
 ['code',CodeXml,'分析内容结构与关联记录'],
 ['layers',Layers,'比对资料版本与上下文'],
 ['database',Database,'整理数据，更新内容索引'],
 ['complete',CheckCheck,'已完成核验，保存工作记录'],
];
function BrowserTool({size=16}) {
 return <span className="browser-icon" aria-hidden="true"><FileText size={size-2}/><span/></span>;
}
const codexHints=[
 ['document',FileText,'读取了文件'],
 ['terminal',SquareTerminal,'运行了命令'],
 ['search',Search,'搜索了文件'],
 ['folder',FolderOpen,'查看了资料目录'],
 ['plan',ListChecks,'更新了工作计划'],
 ['document-check',FileCheck2,'检查了文档'],
 ['compare',Files,'对比了文件内容'],
 ['image',Image,'已查看图片'],
 ['code',CodeXml,'检查了内容结构'],
 ['references',Link2,'核对了引用与记录'],
 ['save',Save,'已保存工作记录'],
 ['document-tool',LayoutGrid,'已使用 文档加载了工具运行了命令'],
 ['browser',BrowserTool,'已使用 浏览器运行了命令'],
 ['complete',CheckCheck,'已完成内容核验'],
 ['database',Database,'整理了数据索引'],
 ['edit',Pencil,'编辑了文件运行了命令'],
 ['tools',LayoutGrid,'已使用 浏览器和文档加载了工具运行了命令'],
];
export function WorkHint({seed=0,buddy=false}) {
 if(buddy){
  // Stable per paragraph: scrolling, folding and switching skins do not shuffle
  // the content or move the reading anchor. Adjacent seeds visit all 12 styles.
  const [kind,Icon,label]=buddyHints[(Math.abs(Math.trunc(seed))*7+1)%buddyHints.length];
  return <div className="work-hint" data-hint-icon={kind} aria-hidden="true"><Icon size={16} strokeWidth={1.65}/><span>{label}</span></div>;
 }
 // Keep a paragraph's status stable across renders, scrolling and skin changes.
 const [kind,Icon,label]=codexHints[(Math.abs(Math.trunc(seed))*7+1)%codexHints.length];
 return <div className="work-hint" data-hint-icon={kind} aria-hidden="true"><Icon size={16} strokeWidth={1.6}/><span>{label}</span></div>;
}
