const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.style={};this.textContent='';}
 appendChild(child){this.children.push(child);return child;}
 replaceChildren(){this.children=[];}
 set innerHTML(_){throw Error('Untrusted rendering must not use innerHTML');}
}
const document={createElement:tag=>new Element(tag),createTextNode:text=>({tag:'#text',textContent:text})};
const payload='<img src=x onerror="window.compromised=true">';
const weekly=fs.readFileSync('wochenplanuser.html','utf8');
const monthly=fs.readFileSync('monatsplanuser.html','utf8');
test('both page scripts parse',()=>{
 for(const source of [weekly,monthly]) for(const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});
test('weekly headings preserve malicious markup as literal text',()=>{
 const source=weekly.slice(weekly.indexOf("            const headingRow ="),weekly.indexOf('            table.appendChild(thead);'));
 const thead=new Element('thead');vm.runInNewContext(source,{document,thead,dayNames:[payload,'Montag & Dienstag']});
 assert.equal(thead.children[0].children[1].textContent,payload);
 assert.equal(thead.children[0].children[1].children.length,0);
});
for(const selectMonth of ['', '2026-09']) test('monthly headings safe with month '+selectMonth,()=>{
 const start=monthly.indexOf("            const tHead = document.createElement('thead');");
 const source=monthly.slice(start,monthly.indexOf('            // Body',start));
 const table=new Element('table');vm.runInNewContext(source,{document,table,selectMonth,dayNames:[payload]});
 const rows=table.children[0].children;
 assert.equal(rows.at(-1).children[1].textContent,payload);
 if(selectMonth){assert.equal(rows[0].children[0].colSpan,2);assert.equal(rows[0].children[0].textContent,'September 2026');}
});
for(const logoUrl of ['javascript:alert(1)','data:image/svg+xml,<svg onload=alert(1)>','https://example.invalid/logo.png','https://example.invalid/x" onerror="alert(1)']) test('print title and logo safe: '+logoUrl,()=>{
 const start=monthly.indexOf('    function printSchedule()');
 const source=monthly.slice(start,monthly.indexOf('    // ─',start));
 const header=new Element('header');let printed=false;
 const doc={...document,getElementById:id=>id==='print-header'?header:{textContent:payload}};
 vm.runInNewContext(source+'\nprintSchedule();',{document:doc,window:{location:{href:'https://example.invalid/monatsplanuser.html'},__orgBranding:{logoUrl},print(){printed=true;}},URL,setTimeout(){}});
 assert.equal(printed,true);
 assert.equal(header.children.find(n=>n.tag==='strong').textContent,payload);
 assert.equal(header.children.at(-1).textContent,payload);
 const imgs=header.children.filter(n=>n.tag==='img');
 assert.equal(imgs.length,logoUrl.startsWith('https:')?1:0);
 if(imgs.length)assert.equal(imgs[0].onerror,undefined);
});
