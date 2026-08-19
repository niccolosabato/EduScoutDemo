/* ============================== MAPPA ============================== */
const GEO = D.geo, STG = D.stati_geo;
let MAPSTATE = {zone:'', state:'', metric:'score', sel:null};

/* proiezione equirettangolare adattata al bounding box della Nigeria */
function makeProj(w,h,pad){
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  GEO.features.forEach(f=>eachCoord(f.geometry,(x,y)=>{
    if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;}));
  const cy=Math.cos((y0+y1)/2*Math.PI/180);
  const sw=(x1-x0)*cy, sh=(y1-y0);
  const s=Math.min((w-pad*2)/sw,(h-pad*2)/sh);
  const ox=(w-sw*s)/2, oy=(h-sh*s)/2;
  return (x,y)=>[ox+(x-x0)*cy*s, oy+(y1-y)*s];
}
function eachCoord(g,fn){
  const walk=c=>{ if(typeof c[0]==='number') fn(c[0],c[1]); else c.forEach(walk); };
  walk(g.coordinates);
}
function pathOf(g,proj){
  const rings = g.type==='Polygon'?[g.coordinates]:g.coordinates;
  let d='';
  rings.forEach(poly=>poly.forEach(ring=>{
    ring.forEach((c,i)=>{ const[px,py]=proj(c[0],c[1]); d+=(i?'L':'M')+px.toFixed(1)+','+py.toFixed(1); });
    d+='Z';
  }));
  return d;
}

const METRIC = {
  score:{lab:'Punteggio di rischio',get:i=>L.score[i],fmt:v=>fm(v,1),unit:'',max:100},
  pre:  {lab:'Tasso fuori-scuola 2026',get:i=>L.pre[i],fmt:v=>fm(v,1)+'%',unit:'%',max:null},
  kids: {lab:'Bambini fuori dalla scuola',get:i=>L.kids[i],fmt:v=>fm(v),unit:'',max:null},
  gap:  {lab:'Divario di genere',get:i=>L.gap[i],fmt:v=>fm(v,1)+' pp',unit:'pp',max:null},
};

let MAPBUILT=false, MAPPATHS={};
function buildMap(){
  const host=document.getElementById('c-map');
  const W=560,H=520;
  host.innerHTML='';
  const svg=S('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'Mappa delle 774 LGA nigeriane per punteggio di rischio'});
  host.append(svg);
  const proj=makeProj(W,H,10);
  const gL=S('g'), gS=S('g',{'pointer-events':'none'});
  svg.append(gL,gS);
  GEO.features.forEach(f=>{
    const i=byId[f.properties.id]; if(i===undefined) return;
    const p=S('path',{d:pathOf(f.geometry,proj),stroke:cssv('--surface'),'stroke-width':.35,
      tabindex:0,role:'img'});
    p.dataset.i=i;
    p.addEventListener('mousemove',e=>ttShow(e,mapTip(i)));
    p.addEventListener('mouseleave',ttHide);
    p.addEventListener('click',()=>{MAPSTATE.sel=i;paintMap();mapPanel();});
    p.addEventListener('keydown',e=>{if(e.key==='Enter'){MAPSTATE.sel=i;paintMap();mapPanel();}});
    gL.append(p); MAPPATHS[i]=p;
  });
  STG.features.forEach(f=>gS.append(S('path',{d:pathOf(f.geometry,proj),fill:'none',
    stroke:cssv('--ink-2'),'stroke-width':.7,opacity:.35})));
  MAPBUILT=true;
}
function mapTip(i){
  const m=METRIC[MAPSTATE.metric];
  return `<b>${esc(L.nome[i])}</b><div style="color:var(--muted);font-size:11px;margin:-2px 0 5px">${esc(stateName(i))} · ${esc(zoneName(i))}</div>`+
    ttRows([['Punteggio di rischio',fm(L.score[i],1)],['Fascia',BANDGLYPH[L.fa[i]]+' '+FASCIA[L.fa[i]]],
      ['Tasso previsto 2026',fm(L.pre[i],1)+'%'],['Bambini fuori dalla scuola',fm(L.kids[i])],
      ['Divario di genere',fm(L.gap[i],1)+' pp']]);
}
function visible(i){
  return (!MAPSTATE.zone||zoneName(i)===MAPSTATE.zone) && (!MAPSTATE.state||stateName(i)===MAPSTATE.state);
}
function paintMap(){
  const m=METRIC[MAPSTATE.metric];
  const vals=IDX.filter(visible).map(m.get);
  const lo=Math.min(...vals), hi=m.max??Math.max(...vals);
  const scale=v=>clamp((v-(m.max?0:lo))/((hi-(m.max?0:lo))||1),0,1);
  IDX.forEach(i=>{
    const p=MAPPATHS[i]; if(!p) return;
    if(!visible(i)){ p.setAttribute('fill',cssv('--surface-2')); p.setAttribute('opacity',.35);
                     p.setAttribute('stroke-width',.2); return; }
    const k=clamp(Math.floor(scale(m.get(i))*RAMP.length),0,RAMP.length-1);
    p.setAttribute('fill',cssv(RAMP[k])); p.setAttribute('opacity',1);
    const s=MAPSTATE.sel===i;
    p.setAttribute('stroke',s?cssv('--ink'):cssv('--surface'));
    p.setAttribute('stroke-width',s?1.8:.35);
    p.setAttribute('aria-label',`${L.nome[i]}, ${stateName(i)}: ${m.lab} ${m.fmt(m.get(i))}`);
  });
  document.getElementById('m-count').textContent=`${fm(vals.length)} LGA visualizzate`;
  // legenda
  const lg=document.getElementById('lg-map'); lg.innerHTML='';
  lg.append(el('span',{style:'color:var(--muted)'},m.lab+' →'));
  RAMP.forEach((r,k)=>{
    const a=(m.max?0:lo)+(hi-(m.max?0:lo))*k/RAMP.length;
    lg.append(el('span',{},el('i',{style:`background:${cssv(r)}`}),m.fmt(a)));
  });
}
function mapPanel(){
  const host=document.getElementById('m-panel');
  const i=MAPSTATE.sel;
  if(i==null){
    host.innerHTML='<h3>Seleziona una LGA</h3><div class="sub">Clicca un poligono sulla mappa per vedere il dettaglio, i driver del rischio e l\'intervento suggerito.</div>';
    const agg=IDX.filter(visible);
    const kids=agg.reduce((s,j)=>s+L.kids[j],0), pop=agg.reduce((s,j)=>s+L.pop[j],0);
    host.append(el('div',{class:'grid',style:'grid-template-columns:1fr 1fr;margin-top:8px'},
      tile('LGA nella selezione',fm(agg.length)),
      tile('Alto rischio',fm(agg.filter(j=>L.fa[j]===0).length)),
      tile('Bambini fuori dalla scuola',fmM(kids)),
      tile('Tasso medio',fm(100*kids/pop,1)+'%')));
    return;
  }
  host.innerHTML='';
  host.append(el('h3',{},L.nome[i]),
    el('div',{class:'sub'},`${stateName(i)} · ${zoneName(i)} · ${L.urb[i]?'area urbana':'area rurale'}`));
  host.append(el('div',{style:'display:flex;gap:8px;align-items:center;margin-bottom:12px'},
    el('span',{style:'font-size:32px;font-weight:600;letter-spacing:-.03em'},fm(L.score[i],1)),
    el('span',{style:'font-size:12px;color:var(--muted)'},'punteggio 0-100'), bandChip(L.fa[i])));
  host.append(el('div',{class:'grid',style:'grid-template-columns:1fr 1fr;margin-bottom:14px'},
    tile('Bambini fuori dalla scuola',fmM(L.kids[i]),`su ${fmM(L.pop[i])} in età 6-11`),
    tile('Divario di genere',fm(L.gap[i],1)+' pp','svantaggio femminile')));
  host.append(el('h4',{style:'font-size:12.5px;margin-bottom:8px'},'Perché è a rischio'));
  const td=topDrivers(i,4), tot=td.reduce((s,x)=>s+x.v,0)||1;
  td.forEach(x=>{
    const row=el('div',{style:'margin-bottom:10px'});
    row.append(el('div',{style:'display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px'},
      el('span',{style:'color:var(--ink-2)'},x.label.replace(/\s*\(.*\)$/,'')),
      el('span',{style:'font-variant-numeric:tabular-nums;font-weight:600'},'+'+fm(x.v,1)+' pp')));
    row.append(el('div',{class:'bar-track'},el('div',{class:'bar-fill',
      style:`width:${clamp(100*x.v/tot,2,100)}%;background:${cssv('--s2')}`})));
    host.append(row);
  });
  host.append(el('div',{class:'note'},'Contributo SHAP al tasso previsto di bambini fuori dalla scuola, in punti percentuali.'));
  const btnFull=el('button',{class:'tab',style:'margin-top:12px;border:1px solid var(--border)'},'Apri scheda completa →');
  btnFull.onclick=()=>openLGA(i);
  host.append(btnFull);
}

function tableMap(){
  const t=document.getElementById('t-map'); t.innerHTML='';
  const q=(document.getElementById('m-search').value||'').toLowerCase();
  const rows=IDX.filter(i=>visible(i)&&(!q||L.nome[i].toLowerCase().includes(q)||stateName(i).toLowerCase().includes(q)))
                .slice(0,300);
  t.append(el('thead',{},el('tr',{},el('th',{},'LGA'),el('th',{},'Stato'),el('th',{},'Zona'),
    el('th',{class:'num'},'Punteggio'),el('th',{},'Fascia'),el('th',{class:'num'},'Tasso 2026'),
    el('th',{class:'num'},'Bambini fuori'),el('th',{class:'num'},'Divario genere'))));
  const tb=el('tbody');
  rows.forEach(i=>{
    const tr=el('tr',{style:'cursor:pointer'},el('td',{style:'font-weight:600'},L.nome[i]),
      el('td',{},stateName(i)),el('td',{},zoneName(i)),
      el('td',{class:'num',style:'font-weight:600'},fm(L.score[i],1)),el('td',{},bandChip(L.fa[i])),
      el('td',{class:'num'},fm(L.pre[i],1)+'%'),el('td',{class:'num'},fm(L.kids[i])),
      el('td',{class:'num'},fm(L.gap[i],1)));
    tr.onclick=()=>openLGA(i); tb.append(tr);
  });
  t.append(tb);
  if(!rows.length) t.append(el('caption',{style:'caption-side:bottom;font-size:13px;color:var(--ink-2);padding:18px 0;text-align:left'},
    'Nessuna LGA corrisponde ai filtri attivi. Prova ad allargare la zona o lo stato, oppure a svuotare la ricerca.'));
  if(rows.length===300) t.append(el('caption',{style:'caption-side:bottom;font-size:12px;color:var(--muted);padding-top:8px;text-align:left'},
    'Mostrate le prime 300 LGA della selezione — usa i filtri o la ricerca per restringere.'));
}
function initMap(){
  const z=document.getElementById('m-zone'), s=document.getElementById('m-state');
  z.innerHTML='<option value="">Tutte le zone</option>'+M.zone.map(x=>`<option>${esc(x)}</option>`).join('');
  s.innerHTML='<option value="">Tutti gli stati</option>'+M.stati.map(x=>`<option>${esc(x)}</option>`).join('');
  const upd=()=>{MAPSTATE.zone=z.value;MAPSTATE.state=s.value;MAPSTATE.metric=document.getElementById('m-metric').value;
    if(MAPSTATE.sel!=null&&!visible(MAPSTATE.sel))MAPSTATE.sel=null;
    paintMap();mapPanel();tableMap();};
  z.onchange=()=>{ if(z.value){ s.innerHTML='<option value="">Tutti gli stati</option>'+
      [...new Set(IDX.filter(i=>zoneName(i)===z.value).map(stateName))].sort().map(x=>`<option>${esc(x)}</option>`).join(''); }
    else { s.innerHTML='<option value="">Tutti gli stati</option>'+M.stati.map(x=>`<option>${esc(x)}</option>`).join(''); }
    upd(); };
  s.onchange=upd; document.getElementById('m-metric').onchange=upd;
  document.getElementById('m-search').oninput=tableMap;
}
