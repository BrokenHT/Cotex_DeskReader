import React,{useMemo} from 'react';
import DOMPurify from 'dompurify';
import {ImageToggle} from './image-toggle.jsx';

const forbiddenTags=['script','style','iframe','object','embed','link','meta','form','input','button','select','textarea','audio','video','canvas','svg'];
const forbiddenAttributes=new Set(['style','srcset','formaction','background','poster','xlink:href']);
const purifyConfig={
 FORBID_TAGS:forbiddenTags,
 FORBID_ATTR:[...forbiddenAttributes],
 ADD_ATTR:['data-asset','data-missing-image','data-note-id','role'],
 ALLOW_DATA_ATTR:true,
 ALLOW_ARIA_ATTR:true
};

function replaceImages(root,media){
 for(const image of [...root.querySelectorAll('img')]){
  const asset=image.getAttribute('data-asset');
  const source=asset&&media&&Object.prototype.hasOwnProperty.call(media,asset)?media[asset]:'';
  if(typeof source!=='string'||!/^data:image\//i.test(source)){
   const alt=image.getAttribute('alt')||'';
   const missing=document.createElement('span');
   missing.className='rich-missing-image';
   missing.setAttribute('data-missing-image','1');
   missing.setAttribute('role','img');
   missing.setAttribute('aria-label',alt||'图片暂不可用');
   missing.textContent=alt;
   image.replaceWith(missing);
   continue;
  }
  image.setAttribute('src',source);
  image.setAttribute('tabindex','0');
  image.setAttribute('role','button');
  if(!image.getAttribute('aria-label'))image.setAttribute('aria-label','查看图片'+(image.getAttribute('alt')?'：'+image.getAttribute('alt'):'')); }
}

function normalizeLinks(root){
 for(const anchor of [...root.querySelectorAll('a')]){
  if(anchor.hasAttribute('data-note-id')){
   anchor.removeAttribute('href');
   anchor.removeAttribute('target');
   anchor.removeAttribute('download');
   anchor.removeAttribute('ping');
   anchor.setAttribute('tabindex','0');
   if(!anchor.getAttribute('role'))anchor.setAttribute('role','doc-noteref');
   anchor.classList.add('rich-note-ref');
  }else{
   anchor.replaceWith(...anchor.childNodes);
  }
 }
}

function convertText(root,convert){
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 let node;
 while((node=walker.nextNode())){
  const converted=convert(node.nodeValue);
  if(typeof converted==='string'&&converted!==node.nodeValue)node.nodeValue=converted;
 }
}

function prepareHtml(html,media,simplified,convert){
 const template=document.createElement('template');
 // A template's contents are inert. Remove TeX fallback annotations before
 // DOMPurify, which otherwise unwraps them into visible stray text.
 template.innerHTML=html||'';
 for(const annotation of [...template.content.querySelectorAll('annotation')])annotation.remove();
 template.innerHTML=DOMPurify.sanitize(template.innerHTML,purifyConfig);
 const root=template.content;
 replaceImages(root,media);
 normalizeLinks(root);
 if(simplified&&typeof convert==='function')convertText(root,convert);
 return template.innerHTML;
}

function useRichHtml(html,media,simplified,convert){
 return useMemo(()=>prepareHtml(html,media,simplified,convert),[html,media,simplified,convert]);
}

function noteTarget(event){
 const target=event.target instanceof Element?event.target.closest('[data-note-id]'):null;
 return target&&event.currentTarget.contains(target)&&target.getAttribute('data-note-id')?target:null;
}

function imageTarget(event){
 const target=event.target instanceof Element?event.target.closest('img[data-asset]'):null;
 return target&&event.currentTarget.contains(target)?target:null;
}

function activateRichTarget(event,onOpenNote,onPreviewImage){
 const note=noteTarget(event);
 if(note){onOpenNote?.(note.getAttribute('data-note-id'));return true;}
 const image=imageTarget(event);
 if(image){onPreviewImage?.({src:image.getAttribute('src'),alt:image.getAttribute('alt')||''});return true;}
 return false;
}

function clickRich(event,onOpenNote,onPreviewImage){
 if(!activateRichTarget(event,onOpenNote,onPreviewImage))return;
 event.preventDefault();
 event.stopPropagation();
}

function keyRich(event,onOpenNote,onPreviewImage){
 if(event.key!=='Enter'&&event.key!==' '&&event.key!=='Spacebar')return;
 if(!activateRichTarget(event,onOpenNote,onPreviewImage))return;
 event.preventDefault();
 event.stopPropagation();
}

export function RichBlock({html,type,chapter,paragraph,media,simplified,convert,onOpenNote,onPreviewImage,collapsed,onToggleImages}){
 const content=useRichHtml(html,media,simplified,convert);
 const kind=type||'html';
 const imageCount=useMemo(()=>(content.match(/<img\b/g)||[]).length+(content.match(/data-missing-image="1"/g)||[]).length,[content]);
 const className=(kind==='text'?'rich-text':'rich-block rich-'+kind)+(collapsed?' images-collapsed':'');
 const props={
  'data-chapter':chapter,
  'data-paragraph':paragraph,
  className,
  onClick:event=>clickRich(event,onOpenNote,onPreviewImage),
  onKeyDown:event=>keyRich(event,onOpenNote,onPreviewImage),
  dangerouslySetInnerHTML:{__html:content}
 };
 const element=kind==='text'?<p {...props}/>:<div {...props}/>;
 if(!imageCount)return element;
 return <div className="rich-media-block" data-group={chapter+':'+paragraph}>
  <ImageToggle collapsed={collapsed} count={imageCount} onToggle={onToggleImages}/>
  {element}
 </div>;
}

export function RichNote({html,media,simplified,convert}){
 const content=useRichHtml(html,media,simplified,convert);
 return <div className="rich-note" dangerouslySetInnerHTML={{__html:content}}/>;
}
