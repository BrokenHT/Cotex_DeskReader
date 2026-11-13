import React from 'react';
export function CodexWordmark(){
 return <svg className="codex-wordmark" width="54" height="18" viewBox="0 0 54 18" aria-hidden="true">
  <path fill="currentColor" fillRule="evenodd" d="M7.2 2.3c2 0 3.7.7 5 2l-1.5 1.8a5 5 0 0 0-3.4-1.4C4.7 4.7 3 6.5 3 9s1.7 4.3 4.3 4.3c1.4 0 2.5-.5 3.5-1.5l1.5 1.8a6.8 6.8 0 0 1-5.1 2.1A6.6 6.6 0 0 1 .3 9c0-3.9 3-6.7 6.9-6.7ZM18.7 5.5a5 5 0 0 1 5.3 5.1 5 5 0 0 1-5.3 5.1 5 5 0 0 1-5.3-5.1 5 5 0 0 1 5.3-5.1Zm0 2.1a2.8 2.8 0 0 0-2.7 3c0 1.7 1.1 3 2.7 3s2.7-1.3 2.7-3-1.1-3-2.7-3ZM33 2h2.5v13.5h-2.4v-1.3c-.7.9-1.8 1.5-3.1 1.5-2.7 0-4.7-2.1-4.7-5.1s2-5.1 4.7-5.1c1.3 0 2.3.5 3 1.4V2Zm-2.6 5.6c-1.6 0-2.6 1.3-2.6 3 0 1.8 1 3 2.6 3s2.7-1.2 2.7-3c0-1.7-1.1-3-2.7-3ZM42 5.5c3 0 4.9 2.1 4.9 5.2v.7h-7.5c.3 1.4 1.3 2.2 2.9 2.2 1.1 0 2.1-.4 2.8-1l1.1 1.6c-1 .9-2.4 1.5-4.1 1.5-3.1 0-5.2-2-5.2-5.1 0-2.9 2.1-5.1 5.1-5.1Zm-.1 2c-1.3 0-2.3.8-2.5 2.1h4.9c-.2-1.3-1.1-2.1-2.4-2.1Z" transform="scale(.95 1)"/>
  <path fill="currentColor" d="M44.8 5.7h2.8l1.8 2.9 1.9-2.9H54l-3.2 4.7 3.4 5.1h-2.8l-2-3.2-2.1 3.2h-2.8l3.5-5.1Z"/>
 </svg>;
}
function icon(children){return function Icon({size=24,strokeWidth=1.65,...props}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>}}
export const Home=icon(<path fill="currentColor" stroke="none" d="M2.8 9.5 10 3.6a3.1 3.1 0 0 1 4 0l7.2 5.9c1 .8.5 2.3-.8 2.3h-.9v7.5c0 1.1-.8 1.9-1.9 1.9h-3.1v-6.1a2.5 2.5 0 0 0-5 0v6.1H6.4c-1.1 0-1.9-.8-1.9-1.9v-7.5h-.9c-1.3 0-1.8-1.5-.8-2.3Z"/>);
export const LayoutGrid=icon(<><rect x="3" y="3" width="8" height="8" rx="1.9"/><rect x="15" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="15" width="6" height="6" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.9"/></>);
export const Bell=icon(<><path d="M5.2 16.6h13.6c1.1 0 1.4-1.1.7-2.1-1.1-1.5-1.6-2.7-1.6-6a5.9 5.9 0 0 0-11.8 0c0 3.3-.5 4.5-1.6 6-.7 1-.4 2.1.7 2.1ZM9.8 20a2.5 2.5 0 0 0 4.4 0"/></>);
export const Search=icon(<><circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 4.5 4.5"/></>);
export const SquarePen=icon(<><path d="M10 4H6a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3v-5"/><path d="m11 15-4 1 1-4 9-9a2.2 2.2 0 0 1 3 3Z"/></>);
export const PanelLeft=icon(<><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M10 3.5v17"/></>);
export const PanelRight=icon(<><rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M14.5 5v14"/></>);
export const SlidersHorizontal=icon(<><circle cx="6" cy="6.5" r="2.5"/><circle cx="6" cy="17.5" r="2.5"/><path d="M13 6.5h8M13 17.5h8"/></>);
export const Mic=icon(<><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11.5v1a6.5 6.5 0 0 0 13 0v-1M12 19v1"/></>);
export function DotPet(){return <svg className="dot-pet" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="frog-body" x2="0" y2="1"><stop stopColor="#bde95b"/><stop offset="1" stopColor="#80c339"/></linearGradient></defs><path fill="#292c20" d="m7 17-1 5 6-2 6 2-1-5Z"/><ellipse fill="url(#frog-body)" cx="12" cy="11.6" rx="10.3" ry="7.5"/><ellipse fill="#acd954" cx="6.5" cy="5.5" rx="3.8" ry="4.1"/><ellipse fill="#acd954" cx="17.5" cy="5.5" rx="3.8" ry="4.1"/><ellipse fill="#30372a" cx="7" cy="4.6" rx="1.2" ry="1.7"/><ellipse fill="#30372a" cx="17" cy="4.6" rx="1.2" ry="1.7"/><path d="M9.8 14q2.2 1 4.4 0" fill="none" stroke="#7ca336" strokeWidth=".7"/></svg>}
