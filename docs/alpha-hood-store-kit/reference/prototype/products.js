// Demo catalogue (fictional). [name, garment, colour, price, mrp, tag, swatches]
const CAT = [
 ['Heavyweight Oversized Tee — Jet Black','oversized','#1b1b1b',899,1299,'NEW',['#1b1b1b','#f2f0ea','#5b6b4e']],
 ['Washed Baggy Jeans — Ice Blue','baggy','#8fb3d1',2199,2999,'BESTSELLER',['#8fb3d1','#3e5c7a']],
 ['Boxy Fit Corduroy Overshirt','shirt','#7a5230',1799,2499,'',['#7a5230','#2f3a2a','#c8b79a']],
 ['Essential Zip Hoodie — Charcoal','hoodie','#3a3a3c',1699,2299,'',['#3a3a3c','#6d7a8a','#e9e4d8']],
 ['Relaxed Cargo Pants — Olive','cargo','#59603f',1899,2599,'NEW',['#59603f','#1b1b1b','#c2b28f']],
 ['Brushed Flannel Check Shirt','check','#5c6670',1299,1799,'',['#5c6670','#7a2b2b']],
 ['Cable Knit Polo Sweater — Cream','sweater','#e8e1cf',1999,2799,'',['#e8e1cf','#2b3a55']],
 ['Matte Puffer Jacket — Black','puffer','#202020',3499,4999,'-30%',['#202020','#4a5a3c']],
 ['Mandarin Collar Linen Shirt','shirt','#d9d3c3',1499,1999,'',['#d9d3c3','#ffffff','#8aa0a8']],
 ['Straight Fit Raw Denim','jeans','#2d3f5a',1999,2599,'',['#2d3f5a','#1b1b1b']],
 ['Varsity Knit Bomber','jacket','#5a1f2a',2799,3699,'NEW',['#5a1f2a','#1d2a44']],
 ['Retro Low-Top Sneakers','sneaker','#2a2a2a',2499,3299,'',['#2a2a2a','#f1efe9']],
 ['Pleated Korean Trousers — Beige','trouser','#c8b99b',1799,2399,'',['#c8b99b','#3a3a3c','#1b1b1b']],
 ['Textured Knit Polo — Forest','polo','#2f4a3a',1299,1699,'',['#2f4a3a','#e8e1cf']],
 ['Graphic Print Oversized Tee','oversized','#f2f0ea',999,1399,'',['#f2f0ea','#1b1b1b']],
 ['Aviator Sunglasses','shades','#1b1b1b',999,1499,'',['#1b1b1b','#7a5230']],
];
const inr=n=>'₹'+n.toLocaleString('en-IN');
function card([n,g,c,p,m,t,sw],i,opt={}){
 const off=Math.round((1-p/m)*100);
 const tag=t?`<span class="tag ${t.startsWith('-')||t==='BESTSELLER'?'r':''}">${t}</span>`:'';
 return `<div class="pc"><div data-g="${g}" data-c="${c}" ${opt.bg?`data-bg="${opt.bg}"`:''}>${tag}<span class="wl">${HEART}</span>${i%3==0?`<span class="rt">4.${6+i%3} ★</span>`:''}</div>
 <div class="nm">${n}</div><div class="pr"><span>${inr(p)}</span>${opt.mrp!==false?`<s>${inr(m)}</s><span class="off">${off}% OFF</span>`:''}</div>
 ${opt.sw!==false?`<div class="sw">${sw.map(s=>`<i style="background:${s}"></i>`).join('')}${sw.length>2?'':''}</div>`:''}<span class="add">${PLUS}</span></div>`;
}
const HEART='<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/></svg>';
const PLUS='<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 12h14M12 5v14"/></svg>';
document.querySelectorAll('[data-grid]').forEach(el=>{
 const [from,count]=el.dataset.grid.split(',').map(Number);
 const items=[];for(let k=0;k<count;k++)items.push(CAT[(from+k)%CAT.length]);
 el.innerHTML=items.map((it,i)=>card(it,i+from,{mrp:el.dataset.mrp!=='0',sw:el.dataset.sw!=='0'})).join('');
});
