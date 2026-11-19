function upgradeEPUB(previous,next) {
  const used=new Set();
  const indexes=previous.chapters.map((c,index)=>{
    let found=c.epubPath?next.chapters.findIndex((n,j)=>!used.has(j)&&n.epubPath===c.epubPath):-1;
    // Legacy EPUBs lack spine paths. Match their text before title fallbacks,
    // because inserting a cover can renumber unnamed chapters.
    if(found<0&&c.paragraphs?.length){
      const sample=c.paragraphs.slice(0,3);
      const matches=next.chapters.map((n,j)=>({j,score:used.has(j)?0:sample.filter(p=>n.paragraphs.includes(p)).length,title:n.title===c.title})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||Number(b.title)-Number(a.title)||a.j-b.j);
      found=matches[0]?.j??-1;
    }
    if(found<0)found=next.chapters.findIndex((n,j)=>!used.has(j)&&n.title===c.title);
    if(found<0)found=Math.min(index,next.chapters.length-1);
    used.add(found);return found;
  });
  const position=p=>{
    const chapter=indexes[p.chapter]??0;
    const oldText=previous.chapters[p.chapter]?.paragraphs?.[p.paragraph];
    const ps=next.chapters[chapter].paragraphs;
    const match=oldText?ps.findIndex(t=>t===oldText||oldText.startsWith(t)&&t.length>10):-1;
    return {...p,chapter,paragraph:match>=0?match:Math.max(0,Math.min(p.paragraph||0,Math.max(0,ps.length-1)))};
  };
  return {...next,alias:previous.alias,createdAt:previous.createdAt,progress:position(previous.progress||{chapter:0,paragraph:0}),bookmarks:previous.bookmarks.map(position),collapsed:previous.collapsed.map(i=>indexes[i]).filter(i=>i!==undefined),collapsedImages:[]};
}
module.exports={upgradeEPUB};
