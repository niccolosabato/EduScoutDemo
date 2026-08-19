/* ============================ EduScout · front-end ============================ */
const D = window.__ES__;
const M = D.meta, L = D.lga, MET = D.metriche, SCE = D.scenari;
const N = L.id.length;
const FASCIA = M.fasce;
const RAMP = ['--r1','--r2','--r3','--r4','--r5','--r6','--r7'];
const SER = ['--s1','--s2','--s3','--s4','--s5','--s6'];
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------------------------------------------------------------- utilities */
const NB = new Intl.NumberFormat('it-IT');
const fm = (v,d=0)=>new Intl.NumberFormat('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v);
const fmM = v => v>=1e6 ? fm(v/1e6,2)+' mln' : v>=1e3 ? fm(v/1e3,0)+' mila' : fm(v,0);
const usd = v => v>=1e9 ? fm(v/1e9,2)+' mld $' : v>=1e6 ? fm(v/1e6,0)+' mln $' : fm(v,0)+' $';
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const el = (t,a={},...k)=>{const n=document.createElementNS(a.__ns||'http://www.w3.org/1999/xhtml',t);
  for(const[p,v]of Object.entries(a)){if(p!=='__ns'&&v!=null)n.setAttribute(p,v);}
  k.flat().forEach(c=>n.append(c&&c.nodeType?c:document.createTextNode(c==null?'':c)));return n;};
const S = (t,a={},...k)=>el(t,{...a,__ns:'http://www.w3.org/2000/svg'},...k);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/* risk score -> colour step of the sequential ramp */
function riskColor(score){
  const i = clamp(Math.floor(score/100*RAMP.length),0,RAMP.length-1);
  return cssv(RAMP[i]);
}
function bandOf(score){ return score>M.soglia_alto?0 : score>=40?1:2; }
const BANDCOL = ()=>[cssv('--critical'),cssv('--warning'),cssv('--good')];
const BANDGLYPH = ['▲','■','▼'];

/* --------------------------------------------------------------- tooltip */
const TT = document.getElementById('tt');
function ttShow(ev, html){
  TT.innerHTML = html; TT.style.opacity = 1;
  const r = TT.getBoundingClientRect();
  let x = ev.clientX+14, y = ev.clientY+14;
  if(x+r.width > innerWidth-8) x = ev.clientX-r.width-14;
  if(y+r.height > innerHeight-8) y = ev.clientY-r.height-14;
  TT.style.left = x+'px'; TT.style.top = y+'px';
}
const ttHide = ()=>{ TT.style.opacity = 0; };
function ttRows(pairs){ return pairs.map(([k,v])=>`<div class="r"><span>${esc(k)}</span><span>${v}</span></div>`).join(''); }
function hoverable(node, htmlFn){
  node.addEventListener('mousemove', e=>ttShow(e, htmlFn()));
  node.addEventListener('mouseleave', ttHide);
  node.addEventListener('focus', e=>{const b=node.getBoundingClientRect();
    ttShow({clientX:b.left+b.width/2, clientY:b.top}, htmlFn());});
  node.addEventListener('blur', ttHide);
}

/* --------------------------------------------------------------- svg chart base */
function chart(host, w, h, pad){
  host.innerHTML = '';
  const svg = S('svg',{viewBox:`0 0 ${w} ${h}`,role:'img'});
  host.append(svg);
  return {svg, w, h, pad, iw:w-pad.l-pad.r, ih:h-pad.t-pad.b,
          g:(x=0,y=0)=>{const g=S('g',{transform:`translate(${pad.l+x},${pad.t+y})`});svg.append(g);return g;}};
}
function yAxis(g, scale, iw, ticks, fmt=String){
  ticks.forEach(t=>{
    const y = scale(t);
    g.append(S('line',{class:'gl',x1:0,x2:iw,y1:y,y2:y}));
    g.append(S('text',{x:-8,y:y+4,'text-anchor':'end',class:'axlbl',fill:cssv('--muted'),'font-size':11},fmt(t)));
  });
}

/* --------------------------------------------------------------- derived data */
const IDX = L.id.map((_,i)=>i);
const stateName = i=>M.stati[L.st[i]], zoneName = i=>M.zone[L.zn[i]];
const byId = {}; L.id.forEach((id,i)=>byId[id]=i);

const ZONE_STATS = M.zone.map((z,zi)=>{
  let pop=0, kids=0, n=0, hi=0;
  IDX.forEach(i=>{ if(L.zn[i]===zi){ pop+=L.pop[i]; kids+=L.kids[i]; n++; if(L.fa[i]===0)hi++; }});
  return {zone:z, pop, kids, n, hi, rate:100*kids/pop};
}).sort((a,b)=>b.rate-a.rate);

const TOT = {pop:M.tot_bambini, kids:M.tot_fuori,
             hi:IDX.filter(i=>L.fa[i]===0).length,
             hiKids:IDX.filter(i=>L.fa[i]===0).reduce((s,i)=>s+L.kids[i],0)};
