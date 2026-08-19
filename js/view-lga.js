/* ============================== SCHEDA LGA ============================== */
const CAT = SCE.catalogo;
const CAT_DRIVER = {
  cct:['poverta_minorile','lavoro_minorile'], feeding:['poverta_minorile'],
  wash:['servizi_igienici_f','acqua_potabile'], trasporto:['distanza_scuola_km','accesso_stradale'],
  docenti:['rapporto_alunni_ins'], almajiri:['scuola_coranica'],
  resilienti:['eventi_conflitto','shock_climatico'], alfabet:['alfab_femminile'],
};
const UNITA = {poverta_minorile:'%',alfab_femminile:'%',distanza_scuola_km:' km',rapporto_alunni_ins:'',
  servizi_igienici_f:'%',accesso_stradale:'%',lavoro_minorile:'%',eventi_conflitto:'/anno',
  shock_climatico:'/100',scuola_coranica:'%',acqua_potabile:'%',spesa_edu_procapite:' $'};
const NEG = new Set(['alfab_femminile','servizi_igienici_f','accesso_stradale','acqua_potabile','spesa_edu_procapite']);

const NAT = {}; M.drivers.forEach(d=>{ NAT[d]=L.feat[d].reduce((s,v)=>s+v,0)/N; });

function suggerimenti(i){
  return CAT.map(c=>{
    const ds=(CAT_DRIVER[c.id]||[]).filter(d=>M.drivers.includes(d));
    const quota=ds.reduce((s,d)=>s+Math.max(L.shap[d][i],0),0);
    const tot=M.drivers.reduce((s,d)=>s+Math.max(L.shap[d][i],0),0)||1;
    const deficit=ds.length? ds.reduce((s,d)=>{
      const v=L.feat[d][i], arr=L.feat[d]; const mn=Math.min(...arr), mx=Math.max(...arr);
      const x=(v-mn)/((mx-mn)||1); return s+(NEG.has(d)?1-x:x); },0)/ds.length : 0;
    const eff=c.eff_max*deficit*(0.45+0.55*Math.min(quota/tot*2.2,1));
    const bambini=L.pop[i]*Math.min(eff,L.pre[i]*.55)/100;
    const costo=c.costo*L.pop[i];
    return {...c,eff:Math.min(eff,L.pre[i]*.55),bambini,costo,ratio:bambini/costo};
  }).sort((a,b)=>b.ratio-a.ratio);
}

function openLGA(i){
  document.getElementById('l-pick').value=String(i);
  switchView('lga'); renderLGA(i);
}
function renderLGA(i){
  const host=document.getElementById('l-body'); host.innerHTML='';
  const head=el('div',{class:'card',style:'margin-bottom:14px'});
  head.append(el('div',{style:'display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start'},
    el('div',{style:'flex:1;min-width:200px'},
      el('h3',{style:'font-size:20px'},L.nome[i]),
      el('div',{class:'sub'},`${stateName(i)} · ${zoneName(i)} · ${L.urb[i]?'area urbana':'area rurale'} · ${fmM(L.pop[i])} bambini 6-11`)),
    el('div',{style:'text-align:right'},
      el('div',{style:'font-size:38px;font-weight:600;letter-spacing:-.03em;line-height:1'},fm(L.score[i],1)),
      el('div',{style:'font-size:11.5px;color:var(--muted);margin:2px 0 6px'},'punteggio di rischio 0-100'),
      bandChip(L.fa[i]))));
  host.append(head);

  host.append(el('div',{class:'grid',style:'grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:14px'},
    tile('Tasso attuale (2025)',fm(L.oos[i],1)+'%','bambini 6-11 fuori dalla scuola'),
    tile('Previsione 2026',fm(L.pre[i],1)+'%', (L.pre[i]>=L.oos[i]?'▲ ':'▼ ')+fm(Math.abs(L.pre[i]-L.oos[i]),1)+' pp rispetto al 2025'),
    tile('Bambini coinvolti',fmM(L.kids[i]),'stima per il 2026'),
    tile('Divario di genere',fm(L.gap[i],1)+' pp','svantaggio delle bambine')));

  /* --- driver: waterfall SHAP --- */
  const c1=el('div',{class:'card'});
  c1.append(el('h3',{},'Perché questa LGA è a rischio'),
    el('div',{class:'sub'},'Contributo SHAP di ogni fattore al tasso previsto, in punti percentuali. Verso destra = aumenta il rischio.'));
  const dd=M.drivers.map(d=>({d,label:M.driver_label[d]||d,v:L.shap[d][i],val:L.feat[d][i]}))
    .sort((a,b)=>b.v-a.v);
  const host1=el('div'); c1.append(host1);
  const rowH=27, pad={l:238,r:52,t:6,b:20};
  const cc=chart(host1,700,pad.t+pad.b+dd.length*rowH,pad); const g=cc.g();
  const mx=Math.max(...dd.map(x=>Math.abs(x.v)))*1.1||1;
  const zx=cc.iw/2, X=v=>zx+v/mx*(cc.iw/2);
  g.append(S('line',{x1:zx,x2:zx,y1:0,y2:dd.length*rowH-8,stroke:cssv('--axis'),'stroke-width':1}));
  [-mx/2,0,mx/2].forEach(t=>g.append(S('text',{x:X(t),y:dd.length*rowH+8,'text-anchor':'middle',
    fill:cssv('--muted'),'font-size':11},(t>0?'+':'')+fm(t,1)+' pp')));
  dd.forEach((x,k)=>{
    const y=k*rowH, bh=14, pos=x.v>=0;
    g.append(S('text',{x:-10,y:y+bh-1,'text-anchor':'end',fill:cssv('--ink-2'),'font-size':11.5},
      x.label.length>40?x.label.slice(0,38)+'…':x.label));
    const w=Math.abs(X(x.v)-zx);
    const r=S('rect',{x:pos?zx:zx-w,y:y+2,width:Math.max(w,2),height:bh,rx:3,
      fill:pos?cssv('--s2'):cssv('--s1'),tabindex:0,role:'img',
      'aria-label':`${x.label}: ${pos?'+':''}${fm(x.v,2)} punti percentuali`});
    hoverable(r,()=>`<b>${esc(x.label)}</b>`+ttRows([
      ['Valore in questa LGA',fm(x.val,1)+(UNITA[x.d]||'')],
      ['Media nazionale',fm(NAT[x.d],1)+(UNITA[x.d]||'')],
      ['Contributo al rischio',(pos?'+':'')+fm(x.v,2)+' pp']]));
    g.append(r);
    g.append(S('text',{x:pos?X(x.v)+7:X(x.v)-7,y:y+bh-1,'text-anchor':pos?'start':'end',
      fill:cssv('--ink'),'font-size':11.5,'font-weight':600},(pos?'+':'')+fm(x.v,1)));
  });
  c1.append(el('div',{class:'legend',style:'margin-top:8px'},
    el('span',{},el('i',{style:`background:${cssv('--s2')}`}),'aumenta il rischio'),
    el('span',{},el('i',{style:`background:${cssv('--s1')}`}),'riduce il rischio')));

  /* --- profilo indicatori --- */
  const c2=el('div',{class:'card'});
  c2.append(el('h3',{},'Profilo della LGA'),
    el('div',{class:'sub'},'Valore locale a confronto con la media nazionale · percentile fra le 774 LGA'));
  const tb=el('table'); tb.append(el('thead',{},el('tr',{},el('th',{},'Indicatore'),
    el('th',{class:'num'},'LGA'),el('th',{class:'num'},'Media naz.'),el('th',{},'Percentile (peggiore → migliore)'))));
  const body=el('tbody');
  M.drivers.forEach(d=>{
    const arr=L.feat[d], v=arr[i];
    let rank=arr.filter(x=>x<v).length/N; if(!NEG.has(d)) rank=1-rank;
    const pct=Math.round(rank*100);
    const bad=pct<34, col=bad?cssv('--critical'):pct<67?cssv('--warning'):cssv('--good');
    body.append(el('tr',{},
      el('td',{},M.driver_label[d]||d),
      el('td',{class:'num',style:'font-weight:600'},fm(v,1)+(UNITA[d]||'')),
      el('td',{class:'num',style:'color:var(--ink-2)'},fm(NAT[d],1)),
      el('td',{},el('div',{style:'display:flex;align-items:center;gap:8px'},
        el('div',{class:'bar-track',style:'flex:1;min-width:70px'},
          el('div',{class:'bar-fill',style:`width:${Math.max(pct,2)}%;background:${col}`})),
        el('span',{style:'font-variant-numeric:tabular-nums;font-size:12px;color:var(--ink-2);min-width:30px'},pct+'°')))));
  });
  tb.append(body); c2.append(el('div',{style:'overflow:auto'},tb));

  host.append(el('div',{class:'grid',style:'grid-template-columns:1.25fr 1fr'},c1,c2));

  /* --- interventi suggeriti --- */
  const c3=el('div',{class:'card',style:'margin-top:14px'});
  c3.append(el('h3',{},'Interventi suggeriti per questa LGA'),
    el('div',{class:'sub'},'Ordinati per bambini riportati a scuola per dollaro speso. L\'efficacia dipende dal deficit locale sul driver che l\'intervento aggredisce.'));
  const sg=suggerimenti(i);
  const t3=el('table'); t3.append(el('thead',{},el('tr',{},el('th',{},'#'),el('th',{},'Intervento'),
    el('th',{class:'num'},'Riduzione attesa'),el('th',{class:'num'},'Bambini'),
    el('th',{class:'num'},'Costo'),el('th',{class:'num'},'$/bambino'))));
  const b3=el('tbody');
  sg.slice(0,6).forEach((x,k)=>{
    b3.append(el('tr',{},el('td',{class:'num',style:'color:var(--muted)'},k+1),
      el('td',{},el('div',{style:'font-weight:600'},x.nome),
                 el('div',{style:'font-size:11.5px;color:var(--muted)'},x.desc)),
      el('td',{class:'num'},'−'+fm(x.eff,1)+' pp'),
      el('td',{class:'num',style:'font-weight:600'},fm(x.bambini)),
      el('td',{class:'num'},fm(x.costo/1e6,2)+' mln $'),
      el('td',{class:'num'},x.bambini>1?fm(x.costo/x.bambini,0)+' $':'—')));
  });
  t3.append(b3); c3.append(el('div',{style:'overflow:auto'},t3));
  host.append(c3);
}
function initLGA(){
  const p=document.getElementById('l-pick');
  p.innerHTML=IDX.map(i=>`<option value="${i}">${esc(L.nome[i])} — ${esc(stateName(i))} (${fm(L.score[i],1)})</option>`).join('');
  p.onchange=()=>renderLGA(+p.value);
  renderLGA(0);
}
