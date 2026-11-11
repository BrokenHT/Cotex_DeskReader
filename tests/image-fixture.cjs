const JSZip=require('jszip');
const landscape=(night=false)=>`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640"><rect width="480" height="640" fill="${night?'#162638':'#f1e9d8'}"/><circle cx="340" cy="155" r="55" fill="${night?'#f8e5b3':'#dba06b'}"/><path d="M0 420 170 210 370 470 480 310V640H0Z" fill="${night?'#2e5465':'#9aa889'}"/><path d="M0 520 230 350 480 530V640H0Z" fill="${night?'#4e8181':'#597f77'}"/><path d="m190 640 100-145 30 15-55 130" fill="${night?'#c9d9c0':'#e7d6b0'}"/></svg>`;
async function imageFixture(){
 const zip=new JSZip();
 zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>');
 zip.file('OPS/book.opf','<package><metadata><title>图文阅读测试</title><creator>测试作者</creator></metadata><manifest><item id="cover" href="Text/cover.xhtml"/><item id="one" href="Text/one.xhtml"/><item id="two" href="Text/two.xhtml"/></manifest><spine><itemref idref="cover"/><itemref idref="one"/><itemref idref="two"/></spine></package>');
 zip.file('OPS/Images/白昼.svg',landscape());zip.file('OPS/Images/night.svg',landscape(true));
 zip.file('OPS/Text/cover.xhtml','<html><head><title>封面</title></head><body><svg xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="../Images/%E7%99%BD%E6%98%BC.svg"/></svg></body></html>');
 zip.file('OPS/Text/one.xhtml','<html><body><h1>第一章 山间来信</h1><p>晨光照进山谷，她在桌边读完了远方寄来的信。</p><div><img src="../Images/%E7%99%BD%E6%98%BC.svg" alt="山谷的白昼"/><img src="../Images/night.svg#view" alt="山谷的夜晚"/></div><p>她把信放进口袋，沿着小路向山下走去。</p><p>走到桥头时，最后一盏灯已经熄灭了。</p></body></html>');
 zip.file('OPS/Text/two.xhtml','<html><body><h1>第二章 夜色</h1><p>山路在月光下静静延伸。远处有人提着灯，等候归来的旅人。</p><img src="../Images/night.svg" alt="月下的归途"/></body></html>');
 return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
module.exports={imageFixture,landscape};
