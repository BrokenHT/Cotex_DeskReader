import React from 'react';
function icon(children){return function Icon({size=24,strokeWidth=1.65,...props}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>}}
export const BuddyAssistant=icon(<><path d="M8 5V2m8 3V2M7 4h10l3 6v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-7Z"/><circle cx="12" cy="11" r="2.8"/><path d="M7.5 18c.6-2.3 2.1-3.5 4.5-3.5s3.9 1.2 4.5 3.5"/></>);
export const BuddyExperts=icon(<><path d="M5 3c-2 0-2 4 0 5h4l2 3M4 9c-2 8 2 13 8 13 5 0 9-4 9-9 0-6-4-10-10-10H5Z"/><circle cx="7" cy="12" r="2.7"/><circle cx="15.8" cy="12" r="2.7"/><path d="M9.7 11.7h3.4M10 18h3"/></>);
export const BuddyLibrary=icon(<><path d="M12 5c-2-3-8-3-9 0v14c3-2 6-1 9 1 3-2 6-3 9-1V5c-1-3-7-3-9 0Zm0 0v15"/></>);
export const BuddyMore=icon(<><path d="m6 2 3.5 6h-7Z"/><circle cx="6" cy="17.5" r="3.5"/><path d="M17.5 2v7M14 5.5h7"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>);
export const BuddyShare=icon(<path d="M14 3v5C6 7 2 12 3 21c2-6 5-8 11-8v5l8-8Z"/>);
export const BuddyFilter=icon(<><ellipse cx="12" cy="4" rx="8.5" ry="2.5"/><path d="m3.5 4 6.8 8v10l3.5-3v-7l6.7-8"/></>);
export const BuddyAccess=icon(<><path d="M3.3 6.3v7.1a8.7 8.7 0 0 0 17.4 0V5.5C17.6 3.4 15 2.3 12 2.3c-2 0-4 .5-6 1.5"/><path d="M12 7.2v6.4"/><circle cx="12" cy="17.4" r=".8" fill="currentColor" stroke="none"/></>);
export const BuddyChevron=icon(<path d="m7 10 5 5 5-5"/>);
export const BuddyDiscover=icon(<><path d="M7 5.7 8.2 3l3.1 2h5.2l2.4 1.2 1.5 4v5.3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V11L5 8.3Z"/><ellipse cx="10.4" cy="13.6" rx="2.7" ry="3.2" transform="rotate(20 10.4 13.6)"/><path d="m16 10.4 1.5 1.4-1.2 2"/></>);
// Draw upright in the button's own coordinate space. The notch balances the
// triangle optically without rotating an off-center paper-plane glyph.
export function BuddySend(){return <svg className="buddy-send-icon" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><path d="M29.5 18.2Q32 13.7 34.5 18.2L45.3 40Q47.1 43.8 43.5 42.4L32 37.7L20.5 42.4Q16.9 43.8 18.7 40Z"/></svg>}
