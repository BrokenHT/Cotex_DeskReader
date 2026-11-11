const segmenter=new Intl.Segmenter('zh',{granularity:'grapheme'});
function shortText(value,max,fallback='') {
  if(typeof value!=='string')return fallback;
  return [...segmenter.segment(value.replace(/[\p{Cc}\p{Cf}]/gu,''))].slice(0,max).map(x=>x.segment).join('').trim()||fallback;
}
const profileDefaults={appearance:'codex',avatarText:'TI',avatarColor:'#ea80b5',buddyName:'心碎的咸菜',buddyAvatarText:'',buddyAvatarColor:'#00bfaa',buddyAvatarImage:''};
function profileSettings(current,patch) {
  const next={...current};
  if(patch.appearance!==undefined)next.appearance=patch.appearance==='workbuddy'?'workbuddy':'codex';
  for(const k of ['avatarText','buddyAvatarText'])if(patch[k]!==undefined)next[k]=shortText(patch[k],2,k==='avatarText'?'TI':'');
  if(patch.buddyName!==undefined)next.buddyName=shortText(patch.buddyName,12,'我的工作空间');
  for(const k of ['avatarColor','buddyAvatarColor'])if(/^#[a-f0-9]{6}$/i.test(patch[k]||''))next[k]=patch[k];
  if(patch.buddyAvatarImage!==undefined && (patch.buddyAvatarImage==='' || typeof patch.buddyAvatarImage==='string' && patch.buddyAvatarImage.length<800000 && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(patch.buddyAvatarImage)))next.buddyAvatarImage=patch.buddyAvatarImage;
  return next;
}
module.exports={profileDefaults,profileSettings};
