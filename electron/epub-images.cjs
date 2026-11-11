const path = require('node:path');
const crypto = require('node:crypto');
const cheerio = require('cheerio');

function resolveEntry(base, href) {
  if (typeof href !== 'string' || /^(?:[a-z][\w+.-]*:|\/\/|[\\/])/i.test(href)) return null;
  let decoded;
  try { decoded = decodeURIComponent(href.split(/[?#]/)[0]); } catch { return null; }
  if (!decoded || decoded.includes('\\') || decoded.includes('\0')) return null;
  const result = path.posix.normalize(path.posix.join(base, decoded));
  return result === '..' || result.startsWith('../') || result.startsWith('/') ? null : result;
}

// SVGs are displayed as images, never inserted into the document as HTML.
function cleanSVG(source) {
  const $ = cheerio.load(source, {xmlMode:true});
  if (!$('svg').length) return null;
  $('script,foreignObject,iframe,object,embed,audio,video,style,animate,set,animateTransform').remove();
  $('*').each((_, el) => {
    for (const [name, value] of Object.entries(el.attribs || {})) {
      if (/^on/i.test(name) || /^(?:href|xlink:href)$/i.test(name) && !value.startsWith('#') || /(?:url\(\s*['"]?(?!#)|@import|expression\s*\()/i.test(value)) $(el).removeAttr(name);
    }
  });
  return $.xml($('svg').first());
}

function imageData(bytes, filename = '') {
  let mime;
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime='image/png';
  else if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) mime='image/jpeg';
  else if (/^GIF8[79]a/.test(bytes.subarray(0,6).toString())) mime='image/gif';
  else if (bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP') mime='image/webp';
  else if (bytes.subarray(4,8).toString()==='ftyp' && /avif|avis/.test(bytes.subarray(8,32).toString())) mime='image/avif';
  else if (/\.svg$/i.test(filename) || /<svg[\s>]/i.test(bytes.subarray(0,1000).toString())) {
    const svg=cleanSVG(bytes.toString('utf8')); if (!svg) return null;
    bytes=Buffer.from(svg); mime='image/svg+xml';
  }
  return mime ? 'data:'+mime+';base64,'+bytes.toString('base64') : null;
}

function createImageReader(zip) {
  const media={}; const cache=new Map();
  async function read(href, base, alt='') {
    const name=resolveEntry(base, href);
    const result={alt:String(alt).slice(0,300)};
    let data;
    if (/^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(href||'')) {
      const bytes=Buffer.from(href.slice(href.indexOf(',')+1),'base64');
      if(bytes.length<=20*1024*1024)data=imageData(bytes);
    } else if(name) {
      if(cache.has(name))return {...result,...cache.get(name)};
      const entry=zip.file(name);
      if(entry && (entry._data?.uncompressedSize||0)<=20*1024*1024) data=imageData(await entry.async('nodebuffer'),name);
    }
    const state=data?{asset:crypto.createHash('sha256').update(data).digest('hex').slice(0,24)}:{missing:true};
    if(data)media[state.asset]=data;
    if(name)cache.set(name,state);
    return {...result,...state};
  }
  return {read,media};
}

function validMedia(book) {
  if (book.media !== undefined && (!book.media || typeof book.media !== 'object' || Array.isArray(book.media))) return false;
  for(const [id,src] of Object.entries(book.media||{})) {
    if(!/^[a-f0-9]{24}$/.test(id) || typeof src!=='string' || !/^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);base64,[a-z0-9+/=]+$/i.test(src))return false;
    // Re-sanitize SVG resources from a restored backup too.
    if(src.startsWith('data:image/svg+xml;'))book.media[id]=imageData(Buffer.from(src.split(',')[1],'base64'),'image.svg');
  }
  return book.chapters.every(c=>c.images===undefined || Array.isArray(c.images)&&c.images.every(g=>Number.isInteger(g.paragraph)&&g.paragraph>=0&&g.paragraph<=(c.paragraphs?.length||0)&&Array.isArray(g.items)&&g.items.every(i=>i&&typeof i.alt==='string'&&(i.missing===true||typeof book.media?.[i.asset]==='string'))));
}
module.exports={resolveEntry,createImageReader,validMedia};
