import React from 'react';
import {ChevronDown,ChevronRight,Images} from 'lucide-react';

export function ImageToggle({collapsed,count,onToggle,className=''}){
 return <button className={'image-toggle'+(className?' '+className:'')} type="button" aria-expanded={!collapsed} onClick={onToggle}><Images size={17}/><span>已查看图片{count>1?' · '+count+' 张':''}</span>{collapsed?<ChevronRight size={15}/>:<ChevronDown size={15}/>}</button>;
}
