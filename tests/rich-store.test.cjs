const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Store}=require('../electron/store.cjs');
const {validateBackup}=require('../electron/backup.cjs');

const BOOK_ID='0123456789abcdef01234567';
const rich={0:{type:'text',html:'<p>富内容</p>'}};
const notes=[{id:'note-1',label:'注释一',html:'<p>注释内容</p>'}];

function fixture(overrides={}){
  return {
    id:BOOK_ID,
    title:'测试书籍',
    author:'测试作者',
    alias:'测试工作',
    source:{id:'local',name:'本地导入',remoteId:'fixture',url:''},
    format:'EPUB',
    contentVersion:3,
    createdAt:1,
    updatedAt:2,
    progress:{chapter:0,paragraph:0},
    bookmarks:[],
    collapsed:[],
    chapters:[{id:'chapter-1',title:'第一章',paragraphs:['第一段'],rich,notes}],
    ...overrides
  };
}

function backup(book=fixture()){
  return {format:'DeskReaderBackup',version:1,settings:{},books:[book]};
}

test('rich and notes survive Store.add/get/save and restart',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cotex-rich-'));
  const store=new Store(root);
  store.add(fixture());
  const loaded=store.get(BOOK_ID);
  assert.deepEqual(loaded.chapters[0].rich,rich);
  assert.deepEqual(loaded.chapters[0].notes,notes);
  loaded.progress={chapter:0,paragraph:0};
  store.save(loaded);
  const restarted=new Store(root).get(BOOK_ID);
  assert.equal(restarted.contentVersion,3);
  assert.deepEqual(restarted.chapters[0].rich,rich);
  assert.deepEqual(restarted.chapters[0].notes,notes);
});

test('validateBackup accepts rich/notes and legacy chapters without them',()=>{
  assert.equal(validateBackup(backup()).books[0].chapters[0].notes[0].id,'note-1');
  const legacy=fixture();
  delete legacy.chapters[0].rich;
  delete legacy.chapters[0].notes;
  assert.doesNotThrow(()=>validateBackup(backup(legacy)));
});

test('validateBackup rejects malformed rich content',()=>{
  const invalid=(change,message)=>{
    const data=backup();
    change(data.books[0].chapters[0]);
    assert.throws(()=>validateBackup(data),new RegExp(message));
  };
  invalid(chapter=>{chapter.rich=[];},'备份富内容格式有误');
  invalid(chapter=>{chapter.rich={'1':{type:'text',html:'越界'}};},'备份富内容格式有误');
  invalid(chapter=>{chapter.rich={0:{type:'video',html:'非法类型'}};},'备份富内容格式有误');
  invalid(chapter=>{chapter.rich={0:{type:'text',html:42}};},'备份富内容格式有误');
  invalid(chapter=>{chapter.paragraphs=null;},'备份富内容格式有误');
});

test('validateBackup rejects malformed notes and oversized HTML',()=>{
  const invalid=(change,message)=>{
    const data=backup();
    change(data.books[0].chapters[0]);
    assert.throws(()=>validateBackup(data),new RegExp(message));
  };
  invalid(chapter=>{chapter.notes=[{id:'same',label:'一',html:''},{id:'same',label:'二',html:''}];},'备份注释格式有误');
  invalid(chapter=>{chapter.notes=Array.from({length:501},(_,index)=>({id:'note-'+index,label:'注',html:''}));},'备份注释格式有误');
  invalid(chapter=>{chapter.notes=[{id:'large',label:'大',html:'a'.repeat(2_000_001)}];},'备份内容过大');
  invalid(chapter=>{
    const large='a'.repeat(2_000_000);
    chapter.notes=Array.from({length:26},(_,index)=>({id:'large-'+index,label:'大',html:large}));
  },'备份内容过大');
});

test('EPUB v2 to v3 upgrade preserves state and adopts new rich content',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cotex-upgrade-'));
  const store=new Store(root);
  const previous=fixture({
    contentVersion:2,
    chapters:[{id:'old',title:'第一章 旧题',paragraphs:['旧段落一','旧段落二']}]
  });
  store.add(previous);
  store.patch(BOOK_ID,{alias:'保留工作',progress:{chapter:0,paragraph:1},bookmarks:[{chapter:0,paragraph:1}],collapsed:[0]});
  const next=fixture({
    contentVersion:3,
    chapters:[
      {id:'cover',title:'封面',paragraphs:[]},
      {id:'new',title:'第一章 新题',paragraphs:['新增前言','旧段落一','旧段落二'],rich,notes}
    ]
  });
  const upgraded=store.add(next);
  assert.equal(upgraded.alias,'保留工作');
  assert.equal(upgraded.contentVersion,3);
  assert.equal(upgraded.progress.chapter,1);
  assert.equal(upgraded.progress.paragraph,2);
  assert.equal(upgraded.bookmarks[0].chapter,1);
  assert.equal(upgraded.bookmarks[0].paragraph,2);
  assert.deepEqual(upgraded.collapsed,[1]);
  assert.deepEqual(upgraded.chapters[1].rich,rich);
  assert.deepEqual(upgraded.chapters[1].notes,notes);
});
