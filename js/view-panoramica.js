/* ============================== PANORAMICA ============================== */
function tile(k,v,d){
  return el('div',{class:'tile'}, el('div',{class:'k'},k), el('div',{class:'v'},v),
             d?el('div',{class:'d'},d):'');
}
function renderKPI(){
  const host = document.getElementById('kpi'); host.innerHTML='';
  host.append(
    tile('Bambini 6-11 fuori dalla scuola', fmM(TOT.kids), `su ${fmM(TOT.pop)} in età primaria · previsione 2026`),
    tile('Tasso nazionale previsto', fm(100*TOT.kids/TOT.pop,1)+'%', 'media ponderata sulle 774 LGA'),
    tile('LGA ad alto rischio', fm(TOT.hi), `punteggio > ${fm(M.soglia_alto,0)} · ${fm(100*TOT.hi/N,0)}% del territorio`),
    tile('Bambini nelle LGA critiche', fmM(TOT.hiKids), `${fm(100*TOT.hiKids/TOT.kids,0)}% del totale, concentrati dove intervenire`),
  );
}

/* --- barre orizzontali per zona ------------------------------------------- */
function chartZone(){
  const host=document.getElementById('c-zone');
  const data=ZONE_STATS, pad={l:112,r:56,t:8,b:26}, rowH=34;
  const c=chart(host,640,pad.t+pad.b+data.length*rowH,pad);
  const g=c.g(); const max=Math.max(...data.map(d=>d.rate))*1.14;
  const x=v=>v/max*c.iw;
  [0,10,20,30,40,50].filter(t=>t<=max).forEach(t=>{
    g.append(S('line',{class:'gl',x1:x(t),x2:x(t),y1:0,y2:data.length*rowH-10}));
    g.append(S('text',{x:x(t),y:data.length*rowH+8,'text-anchor':'middle',fill:cssv('--muted'),'font-size':11},t+'%'));
  });
  data.forEach((d,i)=>{
    const y=i*rowH, bh=15;
    g.append(S('text',{x:-10,y:y+bh-2,'text-anchor':'end',fill:cssv('--ink-2'),'font-size':12},d.zone));
    const r=S('rect',{x:0,y:y+2,width:Math.max(x(d.rate),3),height:bh,rx:4,fill:riskColor(d.rate/60*100),
                      tabindex:0,role:'img','aria-label':`${d.zone}: ${fm(d.rate,1)}%`});
    hoverable(r,()=>`<b>${esc(d.zone)}</b>`+ttRows([
      ['Tasso fuori-scuola',fm(d.rate,1)+'%'],['Bambini fuori dalla scuola',fmM(d.kids)],
      ['Popolazione 6-11',fmM(d.pop)],['LGA',fm(d.n)],['di cui alto rischio',fm(d.hi)]]));
    g.append(r);
    g.append(S('text',{x:x(d.rate)+8,y:y+bh-2,fill:cssv('--ink'),'font-size':12,'font-weight':600},fm(d.rate,1)+'%'));
  });
}

/* --- fasce: barra impilata + conteggi -------------------------------------- */
function chartFasce(){
  const host=document.getElementById('c-fasce');
  const cnt=[0,1,2].map(f=>IDX.filter(i=>L.fa[i]===f).length);
  const kids=[0,1,2].map(f=>IDX.filter(i=>L.fa[i]===f).reduce((s,i)=>s+L.kids[i],0));
  const c=chart(host,520,190,{l:0,r:0,t:6,b:6}); const g=c.g();
  const cols=BANDCOL(); let x=0; const gap=2;
  cnt.forEach((v,i)=>{
    const w=v/N*(c.iw-gap*2);
    const r=S('rect',{x,y:0,width:w,height:30,rx:i===0?4:0,fill:cols[i],tabindex:0,role:'img',
      'aria-label':`${FASCIA[i]}: ${v} LGA`});
    if(i===2) r.setAttribute('rx',4);
    hoverable(r,()=>`<b>Rischio ${esc(FASCIA[i])}</b>`+ttRows([['LGA',fm(v)],
      ['Quota',fm(100*v/N,1)+'%'],['Bambini fuori dalla scuola',fmM(kids[i])]]));
    g.append(r); x+=w+gap;
  });
  [0,1,2].forEach((i,k)=>{
    const y=52+k*46;
    g.append(S('text',{x:0,y:y+4,fill:cssv('--ink-2'),'font-size':12},`${BANDGLYPH[i]} ${FASCIA[i]}`));
    g.append(S('text',{x:c.iw,y:y+4,'text-anchor':'end',fill:cssv('--ink'),'font-size':13,'font-weight':600},
      `${fm(cnt[i])} LGA · ${fmM(kids[i])} bambini`));
    g.append(S('rect',{x:0,y:y+12,width:c.iw,height:6,rx:3,fill:cssv('--surface-2')}));
    g.append(S('rect',{x:0,y:y+12,width:Math.max(c.iw*cnt[i]/N,3),height:6,rx:3,fill:cols[i]}));
  });
  const lg=document.getElementById('lg-fasce'); lg.innerHTML='';
  [0,1,2].forEach(i=>lg.append(el('span',{},
    el('i',{style:`background:${cols[i]}`}), `${BANDGLYPH[i]} ${FASCIA[i]}`,
    el('span',{style:'color:var(--muted)'}, i===0?` (>${fm(M.soglia_alto,0)})`:i===1?' (40-'+fm(M.soglia_alto,0)+')':' (<40)'))));
}

/* --- trend nel tempo ------------------------------------------------------ */
function chartTrend(){
  const host=document.getElementById('c-trend'); const H=D.storico;
  // il punto 2026 e' la previsione del modello, mostrata tratteggiata
  const anni=[...H.anni,2026];
  const predZone={}; M.zone.forEach(z=>{
    let k=0,p=0; IDX.forEach(i=>{if(zoneName(i)===z){k+=L.pre[i]*L.pop[i];p+=L.pop[i];}});
    predZone[z]=k/p;});
  let kk=0,pp=0; IDX.forEach(i=>{kk+=L.pre[i]*L.pop[i];pp+=L.pop[i];});
  const nat=[...H.nazionale,kk/pp];
  const serie={}; Object.keys(H.zone).forEach(z=>serie[z]=[...H.zone[z],predZone[z]]);
  const pad={l:40,r:96,t:14,b:30};
  const c=chart(host,600,270,pad); const g=c.g();
  const ymax=Math.ceil(Math.max(...nat,...Object.values(serie).flat())/10)*10;
  const X=i=>i/(anni.length-1)*c.iw, Y=v=>c.ih-v/ymax*c.ih;
  yAxis(g,Y,c.iw,[0,10,20,30,40,50].filter(t=>t<=ymax),t=>t+'%');
  anni.forEach((a,i)=>g.append(S('text',{x:X(i),y:c.ih+18,'text-anchor':'middle',
    fill:cssv('--muted'),'font-size':11,'font-weight':i===anni.length-1?600:400},a)));
  // banda della previsione
  g.append(S('rect',{x:X(anni.length-2),y:0,width:c.iw-X(anni.length-2),height:c.ih,
    fill:cssv('--surface-2'),opacity:.6}));
  g.append(S('text',{x:X(anni.length-1)-3,y:12,'text-anchor':'end',fill:cssv('--muted'),
    'font-size':10,'font-weight':600},'PREVISIONE'));
  const order=Object.keys(serie).map(z=>[z,serie[z][serie[z].length-1]]).sort((a,b)=>b[1]-a[1]);
  const line=(v,col,w,dash)=>{
    const hist=v.slice(0,-1);
    g.append(S('path',{d:hist.map((y,i)=>`${i?'L':'M'}${X(i)},${Y(y)}`).join(' '),fill:'none',
      stroke:col,'stroke-width':w,'stroke-linejoin':'round','stroke-linecap':'round',
      'stroke-dasharray':dash||null}));
    const n=v.length-2;
    g.append(S('path',{d:`M${X(n)},${Y(v[n])}L${X(n+1)},${Y(v[n+1])}`,fill:'none',stroke:col,
      'stroke-width':w,'stroke-linecap':'round','stroke-dasharray':'3 3'}));
    g.append(S('circle',{cx:X(n+1),cy:Y(v[n+1]),r:3.5,fill:col,stroke:cssv('--surface'),'stroke-width':1.5}));
  };
  // etichette di fine linea con anti-collisione verticale
  const labels=[...order.map(([z])=>({t:z,y:Y(serie[z][serie[z].length-1]),bold:0})),
                {t:'Nazionale',y:Y(nat[nat.length-1]),bold:1}].sort((a,b)=>a.y-b.y);
  for(let i=1;i<labels.length;i++) if(labels[i].y-labels[i-1].y<13) labels[i].y=labels[i-1].y+13;
  order.forEach(([z],k)=>line(serie[z],cssv(SER[k%SER.length]),2));
  line(nat,cssv('--ink'),2.5);
  labels.forEach(l=>g.append(S('text',{x:c.iw+9,y:l.y+4,fill:l.bold?cssv('--ink'):cssv('--ink-2'),
    'font-size':11,'font-weight':l.bold?600:400},l.t)));
  const ch=S('line',{y1:0,y2:c.ih,stroke:cssv('--axis'),'stroke-width':1,opacity:0}); g.append(ch);
  const hit=S('rect',{x:0,y:0,width:c.iw,height:c.ih,fill:'transparent'}); g.append(hit);
  hit.addEventListener('mousemove',e=>{
    const b=c.svg.getBoundingClientRect();
    const px=(e.clientX-b.left)/b.width*c.w-pad.l;
    const i=clamp(Math.round(px/c.iw*(anni.length-1)),0,anni.length-1);
    ch.setAttribute('x1',X(i)); ch.setAttribute('x2',X(i)); ch.setAttribute('opacity',1);
    ttShow(e,`<b>${anni[i]}${i===anni.length-1?' (previsione)':''}</b>`+ttRows([
      ['Nazionale',fm(nat[i],1)+'%'],...order.map(([z])=>[z,fm(serie[z][i],1)+'%'])]));
  });
  hit.addEventListener('mouseleave',()=>{ch.setAttribute('opacity',0);ttHide();});
}

/* --- driver principale ---------------------------------------------------- */
function chartTopDriver(){
  const host=document.getElementById('c-topdriver');
  const d=D.top_driver.slice(0,9), pad={l:0,r:0,t:2,b:2}, rowH=25;
  const c=chart(host,560,pad.t+pad.b+d.length*rowH,pad); const g=c.g();
  const max=Math.max(...d.map(x=>x.n));
  d.forEach((x,i)=>{
    const y=i*rowH;
    g.append(S('text',{x:0,y:y+11,fill:cssv('--ink-2'),'font-size':11.5},
      x.label.replace(/\s*\(.*\)$/,'').slice(0,52)));
    g.append(S('text',{x:c.iw,y:y+11,'text-anchor':'end',fill:cssv('--ink'),'font-size':11.5,
      'font-weight':600},`${x.n} LGA`));
    g.append(S('rect',{x:0,y:y+15,width:c.iw,height:5,rx:2.5,fill:cssv('--surface-2')}));
    const r=S('rect',{x:0,y:y+15,width:Math.max(c.iw*x.n/max,3),height:5,rx:2.5,fill:cssv('--s1'),
      tabindex:0,role:'img','aria-label':`${x.label}: ${x.n} LGA`});
    hoverable(r,()=>`<b>${esc(x.label)}</b>`+ttRows([['LGA in cui è il driver principale',fm(x.n)],
      ['Quota delle 774 LGA',fm(100*x.n/N,1)+'%']]));
    g.append(r);
  });
}

/* --- tabella top LGA ------------------------------------------------------ */
function tableTop(){
  const t=document.getElementById('t-top'); t.innerHTML='';
  const rows=IDX.slice(0,12);
  t.append(el('thead',{},el('tr',{},
    el('th',{},'#'),el('th',{},'LGA'),el('th',{},'Stato'),el('th',{},'Zona'),
    el('th',{class:'num'},'Punteggio'),el('th',{},'Fascia'),
    el('th',{class:'num'},'Bambini fuori'),el('th',{},'Driver principale'))));
  const tb=el('tbody');
  rows.forEach((i,k)=>{
    const top=topDrivers(i,1)[0];
    const tr=el('tr',{style:'cursor:pointer'},
      el('td',{class:'num',style:'color:var(--muted)'},k+1),
      el('td',{style:'font-weight:600'},L.nome[i]),el('td',{},stateName(i)),el('td',{},zoneName(i)),
      el('td',{class:'num',style:'font-weight:600'},fm(L.score[i],1)),
      el('td',{},bandChip(L.fa[i])),
      el('td',{class:'num'},fm(L.kids[i])),
      el('td',{style:'color:var(--ink-2)'},top?top.label.replace(/\s*\(.*\)$/,''):'—'));
    tr.onclick=()=>openLGA(i); tb.append(tr);
  });
  t.append(tb);
}
function bandChip(f){
  const cls=['alto','medio','basso'][f];
  return el('span',{class:'chip '+cls}, el('span',{class:'dot'}), BANDGLYPH[f]+' '+FASCIA[f]);
}
function topDrivers(i,k=4){
  return M.drivers.map(d=>({d,label:M.driver_label[d]||d,v:L.shap[d][i],val:L.feat[d][i]}))
    .filter(x=>x.v>0).sort((a,b)=>b.v-a.v).slice(0,k);
}
