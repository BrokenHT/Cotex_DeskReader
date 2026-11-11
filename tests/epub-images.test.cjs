const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),JSZip=require('jszip');
const {parseEPUB,finalizeBook}=require('../electron/core.cjs');
const {Store}=require('../electron/store.cjs');
const {resolveEntry,validMedia}=require('../electron/epub-images.cjs');
const {imageFixture}=require('./image-fixture.cjs');

test('EPUB retains picture-only chapters, ordered image groups and shared assets',async()=>{
 const b=await parseEPUB(await imageFixture(),'pictures.epub');
 assert.equal(b.chapters.length,3);assert.equal(b.chapters[0].title,'封面');assert.deepEqual(b.chapters[0].paragraphs,[]);
 assert.equal(b.chapters[0].images[0].paragraph,0);
 const c=b.chapters[1];assert.equal(c.paragraphs.length,3);assert.equal(c.images.length,1);assert.equal(c.images[0].paragraph,1);assert.equal(c.images[0].items.length,2);
 assert.equal(Object.keys(b.media).length,2);assert.equal(b.chapters[2].images[0].paragraph,1);
 assert.equal(validMedia(b),true);
 const {readingPercent}=await import('../src/progress.mjs');assert.equal(readingPercent(b,{chapter:2,paragraph:0}),66.6);assert.equal(readingPercent(b,{chapter:2,paragraph:1}),83.3);
});
test('EPUB resolves encoded relative paths; external/missing resources remain safe placeholders',async()=>{
 const zip=await JSZip.loadAsync(await imageFixture());
 zip.file('OPS/Text/one.xhtml','<html><body><h1>第一章 山间来信</h1><p>开始</p><img src="https://example.com/track.png"/><img src="../Images/missing.png"/><svg><script>alert(1)</script><foreignObject><p>BAD</p></foreignObject><rect onclick="bad()" width="100" height="100" fill="red"/></svg><p>结束</p></body></html>');
 const b=await parseEPUB(await zip.generateAsync({type:'nodebuffer'}),'safe.epub');
 const items=b.chapters[1].images[0].items;assert.equal(items[0].missing,true);assert.equal(items[1].missing,true);
 const svg=Buffer.from(b.media[items[2].asset].split(',')[1],'base64').toString();assert.doesNotMatch(svg,/script|foreignObject|onclick|BAD/);assert.match(svg,/<rect/);
 assert.equal(resolveEntry('OPS/Text','../../../outside.png'),null);assert.equal(resolveEntry('OPS','http://remote/image.png'),null);assert.equal(resolveEntry('OPS','%broken'),null);
});
test('reimport upgrades legacy EPUBs, remaps positions past a new cover and preserves metadata',async()=>{
 const fresh=finalizeBook(await parseEPUB(await imageFixture(),'same.epub'),'same-epub');
 const legacy=structuredClone(fresh);delete legacy.media;delete legacy.contentVersion;
 legacy.chapters=legacy.chapters.slice(1).map((c,i)=>({id:String(i),title:c.title,paragraphs:c.paragraphs}));
 const store=new Store(fs.mkdtempSync(path.join(os.tmpdir(),'cotex-media-')));store.add(legacy);
 store.patch(legacy.id,{alias:'保留工作名',progress:{chapter:0,paragraph:1},bookmarks:[{chapter:1,paragraph:0}],collapsed:[1]});
 const upgraded=store.add(fresh);assert.equal(upgraded.alias,'保留工作名');assert.equal(upgraded.progress.chapter,1);assert.equal(upgraded.progress.paragraph,1);assert.equal(upgraded.bookmarks[0].chapter,2);assert.deepEqual(upgraded.collapsed,[2]);
 store.patch(fresh.id,{collapsedImages:['1:1','bad-key']});
 const again=new Store(store.root);assert.deepEqual(again.get(fresh.id).collapsedImages,['1:1']);assert.equal(Object.keys(again.get(fresh.id).media).length,2);assert.equal(again.db.books.length,1);
 assert.equal(again.add(fresh).progress.paragraph,1);
});
test('profile limits, colors and independent skins survive restart; invalid image URLs are rejected',()=>{
 const store=new Store(fs.mkdtempSync(path.join(os.tmpdir(),'cotex-profile-')));
 const settings=store.settings({appearance:'workbuddy',avatarText:'ABC',avatarColor:'#123456',buddyName:'一二三四五六七八九十甲乙丙丁',buddyAvatarText:'猫咪喵',buddyAvatarColor:'#abcdef',buddyAvatarImage:'https://remote/photo.png'});
 assert.equal(settings.avatarText,'AB');assert.equal(settings.buddyAvatarText,'猫咪');assert.equal(settings.buddyName,'一二三四五六七八九十甲乙');assert.equal(settings.buddyAvatarImage,'');
 assert.equal(new Store(store.root).db.settings.avatarColor,'#123456');assert.equal(new Store(store.root).db.settings.appearance,'workbuddy');
 assert.equal(store.settings({avatarColor:'red;bad'}).avatarColor,'#123456');assert.equal(store.settings({buddyName:'   '}).buddyName,'我的工作空间');
});
test('legacy chapters without headings follow their text when a cover changes generated titles',()=>{
 const {upgradeEPUB}=require('../electron/epub-upgrade.cjs');
 const previous={chapters:[{title:'第1节',paragraphs:['first story']},{title:'第2节',paragraphs:['second story']}],progress:{chapter:1,paragraph:0},bookmarks:[],collapsed:[]};
 const next={chapters:[{title:'第1节',paragraphs:[]},{title:'第2节',paragraphs:['first story']},{title:'第3节',paragraphs:['second story']}]};
 assert.equal(upgradeEPUB(previous,next).progress.chapter,2);
});
