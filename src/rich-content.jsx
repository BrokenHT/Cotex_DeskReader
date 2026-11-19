import React,{useMemo} from 'react';
import DOMPurify from 'dompurify';

const forbiddenTags=['script','style','iframe','object','embed','link','meta','form','input','button','select','textarea','audio','video','canvas','svg'];
const forbiddenAttributes=new Set(['style','srcset','formaction','background','poster','xlink:href']);
const purifyConfig={
 FORBID_TAGS:forbiddenTags,
 FORBID_ATTR:[...forbiddenAttributes],
 ADD_ATTR:['data-asset','data-missing-image','data-note-id','role'],
 ALLOW_DATA_ATTR:true,
 ALLOW_ARIA_ATTR:true
};

function cleanAttributes(root){
 for(const element of root.querySelectorAll('*')){
  for(const attribute of [...element.attributes]){
   const name=attribute.name.toLowerCase();
   if(name.startsWith('on')||forbiddenAttributes.has(name))element.removeAttribute(attribute.name);
  }
 }
}

function replaceImages(root,media){
 for(const image of [...root.querySelectorAll('img')]){
  const asset=image.getAttribute('data-asset');
  const source=asset&&media&&Object.prototype.hasOwnProperty.call(media,asset)?media[asset]:'';
  if(typeof source!=='string'||!/^data:image\//i.test(source)){
   const missing=document.createElement('span');
   missing.className='rich-missing-image';
   missing.setAttribute('role','img');
   missing.textContent=image.getAttribute('alt')||'';
   image.replaceWith(missing);
   continue;
  }
  image.setAttribute('src',source);
 }
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
 for(const element of [...root.querySelectorAll(forbiddenTags.join(','))])element.remove();
 cleanAttributes(root);
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

function openNoteRef(event,onOpenNote){
 const target=noteTarget(event);
 if(!target)return;
 event.preventDefault();
 event.stopPropagation();
 onOpenNote?.(target.getAttribute('data-note-id'));
}

function keyNoteRef(event,onOpenNote){
 if(event.key!=='Enter'&&event.key!==' '&&event.key!=='Spacebar')return;
 const target=noteTarget(event);
 if(!target)return;
 event.preventDefault();
 event.stopPropagation();
 onOpenNote?.(target.getAttribute('data-note-id'));
}

export function RichBlock({html,type,chapter,paragraph,media,simplified,convert,onOpenNote}){
 const content=useRichHtml(html,media,simplified,convert);
 const kind=type||'html';
 const props={
  'data-chapter':chapter,
  'data-paragraph':paragraph,
  onClick:event=>openNoteRef(event,onOpenNote),
  onKeyDown:event=>keyNoteRef(event,onOpenNote),
  dangerouslySetInnerHTML:{__html:content}
 };
 return kind==='text'?<p className="rich-text" {...props}/>:<div className={'rich-block rich-'+kind} {...props}/>;
}

export function RichNote({html,media,simplified,convert}){
 const content=useRichHtml(html,media,simplified,convert);
 return <div className="rich-note" dangerouslySetInnerHTML={{__html:content}}/>;
}
