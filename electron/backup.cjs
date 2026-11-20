const {validMedia}=require('./epub-images.cjs');
const {RICH_TYPES}=require('./rich-content.cjs');

const BACKUP_FORMAT='DeskReaderBackup';
const BACKUP_VERSION=1;
const RICH_INDEX=/^(0|[1-9]\d*)$/;
const MAX_HTML_LENGTH=2_000_000;
const MAX_BOOK_HTML_LENGTH=50_000_000;
const MAX_NOTES=5000;

const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const isPlainObject=value=>{
  if(value===null||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  return prototype===Object.prototype||prototype===null;
};

function validateBackup(data){
  if(!data||typeof data!=='object'||data.format!==BACKUP_FORMAT||data.version!==BACKUP_VERSION||!Array.isArray(data.books))throw new Error('不是有效的 Cotex / DeskReader 备份');
  for(const book of data.books){
    if(!book||typeof book!=='object'||!/^[a-f0-9]{24}$/.test(book.id)||!Array.isArray(book.chapters)||!book.chapters.length||typeof book.title!=='string'||!book.progress||!Array.isArray(book.bookmarks)||!Array.isArray(book.collapsed))throw new Error('备份内容不完整');
    let bookHtmlLength=0;
    for(const chapter of book.chapters){
      if(!chapter||typeof chapter!=='object'||typeof chapter.title!=='string'||(chapter.paragraphs!==null&&(!Array.isArray(chapter.paragraphs)||chapter.paragraphs.some(paragraph=>typeof paragraph!=='string'))))throw new Error('备份章节格式有误');
      if(own(chapter,'rich')){
        if(!isPlainObject(chapter.rich)||!Array.isArray(chapter.paragraphs))throw new Error('备份富内容格式有误');
        for(const key of Object.keys(chapter.rich)){
          if(!RICH_INDEX.test(key)||Number(key)>=chapter.paragraphs.length)throw new Error('备份富内容格式有误');
          const rich=chapter.rich[key];
          if(!isPlainObject(rich)||!own(rich,'type')||!RICH_TYPES.has(rich.type)||!own(rich,'html')||typeof rich.html!=='string')throw new Error('备份富内容格式有误');
          if(rich.html.length>MAX_HTML_LENGTH)throw new Error('备份内容过大');
          bookHtmlLength+=rich.html.length;
          if(bookHtmlLength>MAX_BOOK_HTML_LENGTH)throw new Error('备份内容过大');
        }
      }
      if(own(chapter,'notes')){
        if(!Array.isArray(chapter.notes)||chapter.notes.length>MAX_NOTES)throw new Error('备份注释格式有误');
        const ids=new Set();
        for(const note of chapter.notes){
          if(!isPlainObject(note)||!own(note,'id')||typeof note.id!=='string'||!note.id.trim()||ids.has(note.id)||!own(note,'label')||typeof note.label!=='string'||!own(note,'html')||typeof note.html!=='string')throw new Error('备份注释格式有误');
          ids.add(note.id);
          if(note.html.length>MAX_HTML_LENGTH)throw new Error('备份内容过大');
          bookHtmlLength+=note.html.length;
          if(bookHtmlLength>MAX_BOOK_HTML_LENGTH)throw new Error('备份内容过大');
        }
      }
    }
    if(!validMedia(book))throw new Error('备份图片格式有误');
  }
  return data;
}

module.exports={validateBackup,BACKUP_FORMAT,BACKUP_VERSION};
