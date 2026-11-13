import React, {useState} from 'react';
import {File, Undo2} from 'lucide-react';

// These local summary attachments use only generic work copy. Never include a
// book title, author, chapter title or novel text in the summary or its preview.
const topics=['资料整理','项目核对','内容检查','工作记录'];
function attachments(seed=0) {
 const topic=topics[Math.abs(Math.trunc(seed))%topics.length];
 return [
  {kind:'pdf',name:topic+'交接简报.pdf',title:topic+'交接简报',lead:'已整理当前资料，完成结构检查、记录核对与交接内容汇总。',sections:[
   ['整理范围','已核对原始资料、对应条目和相关记录，保留现有分类与索引。'],
   ['核查结果','内容结构已检查，处理记录已补齐，后续事项已单独列出。'],
   ['后续安排','继续按原有顺序检查剩余内容；发现差异时补充说明，再统一复核。'],
  ]},
  {kind:'txt',name:topic+'交接说明.txt',title:topic+'交接说明',lead:'当前工作结果已整理，可按以下顺序继续处理。',sections:[
   ['接手说明','先查看交接简报，再核对对应条目与处理记录。'],
   ['核对要点','检查资料是否齐全、分类是否一致，以及待处理事项是否已有说明。'],
   ['记录方式','保留已确认的结果，补充新发现的问题，完成后更新工作记录。'],
  ]},
 ];
}

export function SummaryFileIcon({kind,size=18}) {
 if(kind!=='pdf')return <File size={size} strokeWidth={1.8} aria-hidden="true"/>;
 return <svg className="summary-pdf-icon" width={size} height={size} viewBox="0 0 20 24" aria-hidden="true"><path fill="#ff5661" d="M4 0h8l8 8v12a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4Z"/><path fill="#ff9ca3" d="M12 0v6a2 2 0 0 0 2 2h6Z"/><text x="10" y="19" textAnchor="middle" fill="white" fontSize="6.5" fontWeight="700" fontFamily="Arial,sans-serif">PDF</text></svg>;
}

const briefChange = {
 name: 'build_brief.py',
 lines: [
  [' ', 'def build_brief(records):'],
  ['-', '    sections = ["工作记录"]'],
  ['-', '    return render_brief(sections, records)'],
  ['+', '    sections = ['],
  ['+', '        "资料范围",'],
  ['+', '        "核查结果",'],
  ['+', '        "后续安排",'],
  ['+', '    ]'],
  ['+', '    return render_brief(sections, records, include_index=True)'],
 ],
};
const additions = briefChange.lines.filter(([mark])=>mark==='+').length;
const deletions = briefChange.lines.filter(([mark])=>mark==='-').length;

function ChangeIcon() {
 return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
  <rect x="2.5" y="2.5" width="19" height="19" rx="3"/>
  <path d="M9 10h6m-3-3v6m-3 4h6"/>
 </svg>;
}

function SummaryChangeCard({onViewChange}) {
 const [undone,setUndone]=useState(false);
 return <div className="summary-change-card">
  <span className="summary-change-icon"><ChangeIcon/></span>
  <div className="summary-change-info">
   <div className="summary-change-title" aria-live="polite">{undone?'已撤销':'已编辑'} {briefChange.name}</div>
   {!undone&&<div className="summary-change-counts" aria-label={`新增 ${additions} 行，删除 ${deletions} 行`}>
    <span>+{additions}</span><span>-{deletions}</span>
   </div>}
  </div>
  <div className="summary-change-actions">
   <button type="button" onClick={()=>setUndone(value=>!value)}>{undone?'重新应用':'撤销'}<Undo2 size={14} aria-hidden="true"/></button>
   <button type="button" className="summary-change-view" onClick={onViewChange}>查看变更</button>
  </div>
 </div>;
}

export function SummaryChangePreview({onClose}) {
 return <div className="summary-file-preview">
  <div className="summary-file-heading"><ChangeIcon/><strong>{briefChange.name}</strong></div>
  <p className="summary-change-note">工作摘要示例</p>
  <pre className="summary-diff">{briefChange.lines.map(([mark,line],index)=>
   <span key={index} className={mark==='+'?'diff-add':mark==='-'?'diff-remove':undefined}>{mark} {line}{'\n'}</span>
  )}</pre>
  <button className="primary full" type="button" onClick={onClose}>返回工作摘要</button>
 </div>;
}

export function WorkSummary({seed=0,onOpenFile,onViewChange}) {
 const files=attachments(seed);
 return <div className="summary-text">
  <p>已完成这部分资料的整理，<strong>交接简报与工作记录</strong>已汇总，内容结构和相关条目已核对。</p>
  <div className="summary-files" aria-label="工作摘要附件">{files.map(file=><button key={file.kind} type="button" className="summary-file-link" aria-label={'预览 '+file.name} onClick={()=>onOpenFile(file)}><SummaryFileIcon kind={file.kind}/><span>{file.name}</span></button>)}</div>
  <p>可结合简报和交接说明继续核对，按同一标准补齐后续记录。</p>
  {onViewChange
   ?<><p>当前结果已保存在本地，后续事项已列入工作记录。</p><SummaryChangeCard onViewChange={onViewChange}/></>
   :<><ul><li>检查了原始资料与对应条目。</li><li>保留了有效记录，并同步当前处理位置。</li><li>后续可继续核对剩余部分。</li></ul><p>当前结果已保存在本地。</p></>}
 </div>;
}

export function SummaryFilePreview({file,onClose}) {
 return <div className="summary-file-preview">
  <div className="summary-file-heading"><SummaryFileIcon kind={file.kind} size={22}/><strong>{file.name}</strong></div>
  <article className={'summary-document summary-document-'+file.kind}><h3>{file.title}</h3><p>{file.lead}</p>{file.sections.map(([title,text])=><section key={title}><h4>{title}</h4><p>{text}</p></section>)}</article>
  <button className="primary full" type="button" onClick={onClose}>返回工作摘要</button>
 </div>;
}
