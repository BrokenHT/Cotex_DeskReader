import React,{useState,useRef,useEffect} from 'react';
import {ChevronDown,ChevronRight,Images,ImageOff,Upload,RotateCcw} from 'lucide-react';
import workbuddyMark from '../assets/brands/workbuddy-mark.svg';

const segmenter=new Intl.Segmenter('zh',{granularity:'grapheme'});
export const limitCharacters=(text,max)=>[...segmenter.segment(text.replace(/[\p{Cc}\p{Cf}]/gu,''))].slice(0,max).map(x=>x.segment).join('');
export const profileDefaults={appearance:'codex',avatarText:'TI',avatarColor:'#ea80b5',buddyName:'心碎的咸菜',buddyAvatarText:'',buddyAvatarColor:'#00bfaa',buddyAvatarImage:''};

export function BuddyMark({size=26,color='#565656',className=''}) {
 return <span className={'buddy-mark '+className} style={{width:size,height:size,backgroundColor:color}} aria-hidden="true"><img src={workbuddyMark} alt=""/></span>;
}
export function Whale({size=18,className='',style,...props}) {
 return <span className={'deepseek-mark '+className} style={{width:size,height:size,...style}} aria-hidden="true" {...props}/>;
}
export function Avatar({settings,buddy=false}) {
 const text=buddy?settings.buddyAvatarText:settings.avatarText;
 const color=buddy?settings.buddyAvatarColor:settings.avatarColor;
 const luminance=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)).reduce((n,v,i)=>n+v*[.299,.587,.114][i],0);
 return <span className="profile-avatar" style={{backgroundColor:color,color:luminance>170?'#202124':'#fff'}}>{buddy&&settings.buddyAvatarImage?<img src={settings.buddyAvatarImage} alt="自定义头像"/>:text||!buddy?<span>{text||'TI'}</span>:<BuddyMark color={color} size="100%"/>}</span>;
}
export function ProgressRing({percent,buddy,onClick,label,hasBook}) {
 // The remaining arc's end moves counterclockwise; WorkBuddy fills clockwise.
 const fill=hasBook?(buddy?percent:100-percent):0;
 return <button type="button" className="reading-progress" title={label} aria-label={label} onClick={onClick}><svg viewBox="0 0 28 28" width="28" height="28" role="progressbar" aria-label="小说阅读进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent} data-direction={buddy?'clockwise-increase':'counterclockwise-decrease'}><circle className="progress-track" cx="14" cy="14" r="11"/><circle className="progress-value" cx="14" cy="14" r="11" pathLength="100" strokeDasharray="100" strokeDashoffset={100-fill} transform="rotate(-90 14 14)"/>{!buddy&&<path className="progress-diamond" d="M14 8.8 19.2 14 14 19.2 8.8 14Z"/>}</svg></button>;
}
export function AssistantIdentity(){return <div className="assistant-identity"><BuddyMark size={24}/><strong>WorkBuddy</strong></div>}

function LimitedInput({value,max,onChange,...props}) {
 const [draft,setDraft]=useState(value);const composing=useRef(false),focused=useRef(false);
 useEffect(()=>{if(!focused.current)setDraft(value);},[value]);
 function commit(text){const next=limitCharacters(text,max);setDraft(next);onChange(next);}
 return <input {...props} value={draft} onFocus={()=>{focused.current=true;}} onChange={e=>{setDraft(e.target.value);if(!composing.current)commit(e.target.value);}} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={e=>{composing.current=false;commit(e.target.value);}} onBlur={()=>{focused.current=false;if(!draft.trim()){setDraft(value);}else commit(draft);}}/>;
}

export function ImageGallery({group,chapter,media,collapsed,onToggle,onPreview}) {
 const [failed,setFailed]=useState({});
 return <div className={'epub-images '+(collapsed?'images-collapsed':'')} data-chapter={chapter} data-paragraph={group.paragraph} data-group={chapter+':'+group.paragraph}>
  <button className="image-toggle" type="button" aria-expanded={!collapsed} onClick={onToggle}><Images size={17}/><span>已查看图片{group.items.length>1?' · '+group.items.length+' 张':''}</span>{collapsed?<ChevronRight size={15}/>:<ChevronDown size={15}/>}</button>
  {!collapsed&&<div className="image-thumbnails">{group.items.map((item,i)=>item.missing||failed[i]||!media?.[item.asset]?<div className="image-missing" key={i}><ImageOff size={24}/><span>{item.alt||'图片暂不可用'}</span><small>{item.missing?'原文件缺少可用图片资源':'无法读取此图片'}</small></div>:<button className="image-thumbnail" type="button" key={i} aria-label={'查看图片 '+(i+1)+(item.alt?'：'+item.alt:'')} onClick={()=>onPreview({src:media[item.asset],alt:item.alt})}><img src={media[item.asset]} alt={item.alt||'EPUB 插图 '+(i+1)} loading="lazy" onError={()=>setFailed(s=>({...s,[i]:true}))}/></button>)}</div>}
 </div>;
}

export function ProfileSettings({settings,save,onError}) {
 const uploadRef=useRef();const [loading,setLoading]=useState(false);
 const buddy=settings.appearance==='workbuddy';
 const textKey=buddy?'buddyAvatarText':'avatarText',colorKey=buddy?'buddyAvatarColor':'avatarColor';
 async function upload(event) {
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>10*1024*1024){onError('请选择 10 MB 以内的 PNG、JPG 或 WebP 头像。');return;}
  setLoading(true);
  try{
   const bitmap=await createImageBitmap(file);
   const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
   const ctx=canvas.getContext('2d');const side=Math.min(bitmap.width,bitmap.height);
   ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,256,256);bitmap.close();
   await save({buddyAvatarImage:canvas.toDataURL('image/png')});
  }catch{onError('无法读取这张头像图片，请换一张重试。');}finally{setLoading(false);}
 }
 return <div className="profile-settings">
  <div className="profile-preview"><Avatar settings={settings} buddy={buddy}/><div><strong>{buddy?settings.buddyName:'Codex 头像'}</strong><small>{buddy?'左下角个人资料':'左下角头像'}</small></div></div>
  {buddy&&<label className="setting-row"><span>昵称 <small>最多 12 个字符</small></span><LimitedInput max={12} className="text-input group-input" aria-label="昵称" value={settings.buddyName} onChange={text=>save({buddyName:text})}/></label>}
  <label className="setting-row"><span>头像文字 <small>最多 2 个字符{buddy?'，留空显示图案':''}</small></span><LimitedInput key={textKey} max={2} className="text-input avatar-text-input" aria-label="头像文字" value={settings[textKey]} onChange={text=>save({[textKey]:text,...(buddy?{buddyAvatarImage:''}:{})})}/></label>
  <label className="setting-row"><span>头像颜色</span><input type="color" aria-label="头像颜色" value={settings[colorKey]} onChange={e=>save({[colorKey]:e.target.value})}/></label>
  {buddy&&<div className="profile-upload"><input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" aria-label="选择头像图片" onChange={upload} hidden/><button type="button" className="secondary" disabled={loading} onClick={()=>uploadRef.current.click()}><Upload size={15}/>{loading?'正在处理…':'上传头像'}</button><button type="button" className="secondary" onClick={()=>save({buddyAvatarImage:'',buddyAvatarText:'',buddyAvatarColor:profileDefaults.buddyAvatarColor})}><RotateCcw size={15}/>恢复头像</button><small>PNG / JPG / WebP，最大 10 MB，居中裁切</small></div>}
 </div>;
}
