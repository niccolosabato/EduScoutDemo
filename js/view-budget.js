/* ============================== BUDGET ============================== */
const BKEYS=Object.keys(SCE.scenari).sort((a,b)=>+a-+b);
function renderBudget(){
  const sl=document.getElementById('b-budget');
  sl.max=BKEYS.length-1;
  const upd=()=>{
    const s=SCE.scenari[BKEYS[+sl.value]];
    document.getElementById('b-out').textContent=fm(s.budget_mln)+' mln $';
    const k=document.getElementById('b-kpi'); k.innerHTML='';
    k.append(
      tile('Bambini riportati a scuola',fmM(s.bambini),`${fm(s.interventi)} interventi in ${fm(s.lga_coperte)} LGA`),
      tile('Costo per bambino',fm(s.costo_per_bambino,0)+' $','media sul portafoglio selezionato'),
      tile('SROI',fm(s.sroi,2)+'×',`${usd(s.beneficio_mln*1e6)} di reddito futuro attualizzato`),
      tile('Quota di bambini raggiunta',fm(100*s.bambini/TOT.kids,1)+'%',`sui ${fmM(TOT.kids)} fuori dalla scuola`),
      tile('Budget impegnato',fm(s.speso,1)+' mln $',`su ${fm(s.budget_mln)} disponibili`),
    );
    chartInterventi(s); tablePlan(s);
  };
  sl.oninput=upd; upd(); chartCurve();
  tableCatalogo();
}
function chartInterventi(s){
  const host=document.getElementById('c-int');
  const rows=s.per_intervento.slice().sort((a,b)=>b.bambini-a.bambini);
  const pad={l:0,r:0,t:2,b:2}, rowH=44;
  const c=chart(host,560,pad.t+pad.b+rows.length*rowH,pad), g=c.g();
  const mx=Math.max(...rows.map(r=>r.bambini))||1;
  rows.forEach((r,i)=>{
    const y=i*rowH;
    g.append(S('text',{x:0,y:y+11,fill:cssv('--ink-2'),'font-size':11.5},
      r.nome.length>52?r.nome.slice(0,50)+'…':r.nome));
    g.append(S('text',{x:c.iw,y:y+11,'text-anchor':'end',fill:cssv('--ink'),'font-size':12,'font-weight':600},
      fm(r.bambini)+' bambini'));
    g.append(S('rect',{x:0,y:y+16,width:c.iw,height:7,rx:3.5,fill:cssv('--surface-2')}));
    const rr=S('rect',{x:0,y:y+16,width:Math.max(c.iw*r.bambini/mx,3),height:7,rx:3.5,fill:cssv('--s1'),
      tabindex:0,role:'img','aria-label':`${r.nome}: ${r.bambini} bambini`});
    hoverable(rr,()=>`<b>${esc(r.nome)}</b>`+ttRows([['Bambini raggiunti',fm(r.bambini)],
      ['LGA coinvolte',fm(r.lga)],['Costo',fm(r.costo_mln,1)+' mln $'],
      ['Costo per bambino',fm(r.costo_mln*1e6/Math.max(r.bambini,1),0)+' $']]));
    g.append(rr);
    g.append(S('text',{x:0,y:y+35,fill:cssv('--muted'),'font-size':11},
      `${fm(r.lga)} LGA · ${fm(r.costo_mln,1)} mln $ · ${fm(r.costo_mln*1e6/Math.max(r.bambini,1),0)} $/bambino`));
  });
}
function chartCurve(){
  const host=document.getElementById('c-curve');
  const pts=BKEYS.map(k=>SCE.scenari[k]);
  const pad={l:52,r:14,t:12,b:38}, c=chart(host,540,300,pad), g=c.g();
  const kmax=Math.max(...pts.map(p=>p.bambini));
  // spaziatura per indice: i livelli di budget raddoppiano, una scala lineare
  // schiaccerebbe i primi punti l'uno sull'altro
  const X=i=>i/(pts.length-1)*c.iw, Y=v=>c.ih-v/(kmax*1.12)*c.ih;
  const ticks=[0,.25,.5,.75,1].map(t=>t*kmax*1.12);
  ticks.forEach(t=>{const y=Y(t);g.append(S('line',{class:'gl',x1:0,x2:c.iw,y1:y,y2:y}));
    g.append(S('text',{x:-8,y:y+4,'text-anchor':'end',fill:cssv('--muted'),'font-size':11},fmM(t)));});
  pts.forEach((p,i)=>g.append(S('text',{x:X(i),y:c.ih+18,'text-anchor':'middle',
    fill:cssv('--muted'),'font-size':11},p.budget_mln+'M')));
  g.append(S('path',{d:pts.map((p,i)=>`${i?'L':'M'}${X(i)},${Y(p.bambini)}`).join(' '),
    fill:'none',stroke:cssv('--s1'),'stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round'}));
  pts.forEach((p,i)=>{
    const cc=S('circle',{cx:X(i),cy:Y(p.bambini),r:5,fill:cssv('--s1'),
      stroke:cssv('--surface'),'stroke-width':2,tabindex:0,role:'img',
      'aria-label':`${p.budget_mln} milioni: ${p.bambini} bambini`});
    hoverable(cc,()=>`<b>Budget ${fm(p.budget_mln)} mln $</b>`+ttRows([
      ['Bambini raggiunti',fmM(p.bambini)],['Costo per bambino',fm(p.costo_per_bambino,0)+' $'],
      ['LGA coperte',fm(p.lga_coperte)],['SROI',fm(p.sroi,2)+'×']]));
    g.append(cc);
    g.append(S('text',{x:X(i),y:Y(p.bambini)-13,'text-anchor':i===pts.length-1?'end':'middle',
      fill:cssv('--ink-2'),'font-size':11},fm(p.costo_per_bambino,0)+' $/bambino'));
  });
  g.append(S('text',{x:0,y:c.ih+34,fill:cssv('--muted'),'font-size':11},'budget annuo, scala logaritmica (milioni di dollari) →'));
  g.append(S('text',{x:-44,y:-10,fill:cssv('--muted'),'font-size':11},'bambini ↑'));
}
function tablePlan(s){
  const t=document.getElementById('t-plan'); t.innerHTML='';
  t.append(el('thead',{},el('tr',{},el('th',{},'#'),el('th',{},'LGA'),el('th',{},'Stato'),
    el('th',{},'Intervento'),el('th',{class:'num'},'Costo'),el('th',{class:'num'},'Bambini'),
    el('th',{class:'num'},'$/bambino'))));
  const b=el('tbody');
  s.top_lga.forEach((r,i)=>b.append(el('tr',{},el('td',{class:'num',style:'color:var(--muted)'},i+1),
    el('td',{style:'font-weight:600'},r.lga),el('td',{},r.state),el('td',{},r.intervento),
    el('td',{class:'num'},fm(r.costo_mln,2)+' mln $'),el('td',{class:'num',style:'font-weight:600'},fm(r.bambini)),
    el('td',{class:'num'},fm(r.costo_mln*1e6/Math.max(r.bambini,1),0)+' $'))));
  t.append(b);
}
function tableCatalogo(){
  const t=document.getElementById('t-cat'); t.innerHTML='';
  t.append(el('thead',{},el('tr',{},el('th',{},'Intervento'),el('th',{},'Meccanismo'),
    el('th',{class:'num'},'Costo unitario'),el('th',{class:'num'},'Riduzione max'))));
  const b=el('tbody');
  CAT.forEach(c=>b.append(el('tr',{},el('td',{style:'font-weight:600'},c.nome),
    el('td',{style:'color:var(--ink-2)'},c.desc),
    el('td',{class:'num'},fm(c.costo,0)+' $ / bambino'),el('td',{class:'num'},'−'+fm(c.eff_max,1)+' pp'))));
  t.append(b);
}

