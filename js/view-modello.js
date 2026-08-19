/* ============================== MODELLO ============================== */
function renderModello(){
  const R=MET.regressione, C=MET.classificazione, ST=MET.strutturale;
  const k=document.getElementById('m-kpi'); k.innerHTML='';
  k.append(
    tile('R² sull\'holdout',fm(R.r2,3),`anno 2025, mai visto in addestramento · ${fm(R.n_test)} LGA`),
    tile('MAE',fm(R.mae,2)+' pp','errore medio assoluto sul tasso fuori-scuola'),
    tile('Recall alto rischio',fm(C.Alto.recall*100,1)+'%',`${C.Alto.support-Math.round(C.Alto.recall*C.Alto.support)} LGA critiche non individuate su ${C.Alto.support}`),
    tile('F1 alto rischio',fm(C.Alto.f1,3),`precision ${fm(C.Alto.precision,3)} · soglia operativa ${fm(C.soglia_alto,0)}`),
    tile('CV temporale',fm(R.cv_r2_mean,3)+' ± '+fm(R.cv_r2_std,3),'R² medio su 4 split TimeSeriesSplit'),
  );

  /* scatter previsto vs reale */
  (function(){
    const host=document.getElementById('c-scatter'), sc=MET.scatter;
    const pad={l:44,r:12,t:10,b:36}, c=chart(host,540,400,pad), g=c.g();
    const mx=Math.ceil(Math.max(...sc.reale,...sc.predetto)/10)*10;
    const X=v=>v/mx*c.iw, Y=v=>c.ih-v/mx*c.ih;
    const ticks=[]; for(let t=0;t<=mx;t+=20)ticks.push(t);
    yAxis(g,Y,c.iw,ticks,t=>t+'%');
    ticks.forEach(t=>g.append(S('text',{x:X(t),y:c.ih+18,'text-anchor':'middle',fill:cssv('--muted'),'font-size':11},t+'%')));
    g.append(S('line',{x1:X(0),y1:Y(0),x2:X(mx),y2:Y(mx),stroke:cssv('--axis'),'stroke-width':1.5,'stroke-dasharray':'4 4'}));
    sc.reale.forEach((r,i)=>{
      const p=sc.predetto[i];
      const cc=S('circle',{cx:X(r),cy:Y(p),r:3.2,fill:cssv('--s1'),opacity:.34,
        stroke:cssv('--surface'),'stroke-width':.5});
      cc.addEventListener('mousemove',e=>ttShow(e,`<b>${esc(sc.zona[i])}</b>`+ttRows([
        ['Reale 2025',fm(r,1)+'%'],['Previsto',fm(p,1)+'%'],['Errore',(p>=r?'+':'')+fm(p-r,1)+' pp']])));
      cc.addEventListener('mouseleave',ttHide);
      g.append(cc);
    });
    g.append(S('text',{x:c.iw,y:c.ih+32,'text-anchor':'end',fill:cssv('--muted'),'font-size':11},
      'tasso reale osservato →'));
    g.append(S('text',{x:-34,y:-2,fill:cssv('--muted'),'font-size':11},'previsto ↑'));
  })();

  /* benchmark modelli */
  (function(){
    const host=document.getElementById('c-bench');
    const rows=Object.entries(MET.benchmark).map(([n,v])=>({n,...v}))
      .concat([{n:'Strutturale (senza memoria storica)',...ST}])
      .sort((a,b)=>b.r2-a.r2);
    const pad={l:210,r:52,t:6,b:20}, rowH=34, c=chart(host,600,pad.t+pad.b+rows.length*rowH,pad), g=c.g();
    const X=v=>Math.max(v,0)*c.iw;
    [0,.25,.5,.75,1].forEach(t=>{
      g.append(S('line',{class:'gl',x1:X(t),x2:X(t),y1:0,y2:rows.length*rowH-10}));
      g.append(S('text',{x:X(t),y:rows.length*rowH+8,'text-anchor':'middle',fill:cssv('--muted'),'font-size':11},fm(t,2)));
    });
    rows.forEach((r,i)=>{
      const y=i*rowH, prod=r.n.startsWith('Ridge');
      g.append(S('text',{x:-10,y:y+16,'text-anchor':'end',fill:prod?cssv('--ink'):cssv('--ink-2'),
        'font-size':11.5,'font-weight':prod?600:400},r.n.length>34?r.n.slice(0,32)+'…':r.n));
      const rr=S('rect',{x:0,y:y+4,width:Math.max(X(r.r2),2),height:15,rx:4,
        fill:prod?cssv('--s1'):cssv('--surface-2'),stroke:prod?'none':cssv('--axis'),'stroke-width':1,
        tabindex:0,role:'img','aria-label':`${r.n}: R² ${fm(r.r2,3)}`});
      hoverable(rr,()=>`<b>${esc(r.n)}</b>`+ttRows([['R²',fm(r.r2,3)],['MAE',fm(r.mae,2)+' pp'],['RMSE',fm(r.rmse,2)+' pp']]));
      g.append(rr);
      g.append(S('text',{x:X(Math.max(r.r2,0))+8,y:y+16,fill:cssv('--ink'),'font-size':11.5,'font-weight':600},fm(r.r2,3)));
    });
  })();

  /* importanza per gruppi */
  barList('c-gruppi',MET.importanza_gruppi.map(x=>({label:x.gruppo,v:x.importance_pct})),'%','--s1');
  barList('c-imp',MET.importanza_strutturale.filter(x=>x.importance_pct>0.4).slice(0,10)
    .map(x=>({label:x.label,v:x.importance_pct})),'%','--s3');

  /* matrice di confusione */
  (function(){
    const host=document.getElementById('c-cm'), cm=MET.confusion_matrix;
    host.innerHTML='';
    const t=el('table',{style:'font-size:13px'});
    t.append(el('thead',{},el('tr',{},el('th',{},''),
      ...cm.labels.map(l=>el('th',{class:'num'},'prev. '+l)),el('th',{class:'num'},'Recall'))));
    const b=el('tbody');
    const mxv=Math.max(...cm.matrix.flat());
    cm.matrix.forEach((row,i)=>{
      const tot=row.reduce((a,x)=>a+x,0);
      b.append(el('tr',{},el('td',{style:'font-weight:600'},BANDGLYPH[i]+' reale '+cm.labels[i]),
        ...row.map((v,j)=>{
          const k=clamp(Math.floor(v/mxv*RAMP.length),0,RAMP.length-1);
          const on=i===j;
          return el('td',{class:'num',style:`background:${on?cssv(RAMP[k]):'transparent'};`+
            (on?`color:${k>=4?'#fff':'var(--ink)'};font-weight:600`:'color:var(--ink-2)')},fm(v));
        }),
        el('td',{class:'num',style:'font-weight:600'},fm(100*row[i]/tot,1)+'%')));
    });
    t.append(b); host.append(t);
    host.append(el('div',{class:'note'},
      `I ${cm.matrix[0][1]+cm.matrix[0][2]} falsi negativi in fascia alta sono l'errore che costa di più: sono LGA critiche che non riceverebbero fondi.`));
  })();

  /* curva soglia */
  (function(){
    const host=document.getElementById('c-soglia'), gr=MET.soglia_grid;
    const pad={l:44,r:60,t:10,b:34}, c=chart(host,540,270,pad), g=c.g();
    const xs=gr.map(x=>x.soglia), x0=Math.min(...xs), x1=Math.max(...xs);
    const X=v=>(v-x0)/(x1-x0)*c.iw, Y=v=>c.ih-v*c.ih;
    yAxis(g,Y,c.iw,[0,.25,.5,.75,1],t=>fm(t*100,0)+'%');
    [55,60,65,70,75].filter(t=>t>=x0&&t<=x1).forEach(t=>
      g.append(S('text',{x:X(t),y:c.ih+18,'text-anchor':'middle',fill:cssv('--muted'),'font-size':11},t)));
    const draw=(key,col,lab)=>{
      g.append(S('path',{d:gr.map((p,i)=>`${i?'L':'M'}${X(p.soglia)},${Y(p[key])}`).join(' '),
        fill:'none',stroke:cssv(col),'stroke-width':2,'stroke-linecap':'round'}));
      g.append(S('text',{x:c.iw+7,y:Y(gr[gr.length-1][key])+4,fill:cssv('--ink-2'),'font-size':11},lab));
    };
    draw('recall','--s1','Recall'); draw('precision','--s2','Precision'); draw('f1','--s3','F1');
    const sel=MET.classificazione.soglia_alto;
    g.append(S('line',{x1:X(sel),x2:X(sel),y1:0,y2:c.ih,stroke:cssv('--ink'),'stroke-width':1.5,'stroke-dasharray':'3 3'}));
    g.append(S('text',{x:X(sel),y:-1,'text-anchor':'middle',fill:cssv('--ink'),'font-size':11,'font-weight':600},'soglia '+fm(sel,0)));
    const hit=S('rect',{x:0,y:0,width:c.iw,height:c.ih,fill:'transparent'}); g.append(hit);
    hit.addEventListener('mousemove',e=>{
      const b=c.svg.getBoundingClientRect();
      const v=x0+clamp((e.clientX-b.left)/b.width*c.w-pad.l,0,c.iw)/c.iw*(x1-x0);
      const p=gr.reduce((a,x)=>Math.abs(x.soglia-v)<Math.abs(a.soglia-v)?x:a);
      ttShow(e,`<b>Soglia ${fm(p.soglia,0)}</b>`+ttRows([['Recall',fm(p.recall*100,1)+'%'],
        ['Precision',fm(p.precision*100,1)+'%'],['F1',fm(p.f1,3)]]));
    });
    hit.addEventListener('mouseleave',ttHide);
  })();

  /* tabella per classe */
  (function(){
    const t=document.getElementById('t-clf'); t.innerHTML='';
    const C=MET.classificazione;
    t.append(el('thead',{},el('tr',{},el('th',{},'Fascia'),el('th',{class:'num'},'Precision'),
      el('th',{class:'num'},'Recall'),el('th',{class:'num'},'F1'),el('th',{class:'num'},'LGA (support)'))));
    const b=el('tbody');
    ['Alto','Medio','Basso'].forEach((f,i)=>b.append(el('tr',{},
      el('td',{},bandChip(i)),el('td',{class:'num'},fm(C[f].precision,3)),
      el('td',{class:'num',style:i===0?'font-weight:600':''},fm(C[f].recall,3)),
      el('td',{class:'num'},fm(C[f].f1,3)),el('td',{class:'num'},fm(C[f].support)))));
    b.append(el('tr',{style:'border-top:2px solid var(--axis)'},el('td',{style:'font-weight:600'},'Complessivo'),
      el('td',{class:'num',style:'color:var(--muted)'},'—'),el('td',{class:'num',style:'color:var(--muted)'},'—'),
      el('td',{class:'num',style:'font-weight:600'},fm(C.macro_f1,3)+' (macro)'),
      el('td',{class:'num'},fm(MET.regressione.n_test))));
    t.append(b);
  })();
}
function barList(id,rows,unit,col){
  const host=document.getElementById(id);
  const pad={l:0,r:0,t:2,b:2}, rowH=27;
  const c=chart(host,560,pad.t+pad.b+rows.length*rowH,pad), g=c.g();
  const mx=Math.max(...rows.map(r=>r.v))||1;
  rows.forEach((r,i)=>{
    const y=i*rowH;
    g.append(S('text',{x:0,y:y+11,fill:cssv('--ink-2'),'font-size':11.5},
      r.label.length>46?r.label.slice(0,44)+'…':r.label));
    g.append(S('text',{x:c.iw,y:y+11,'text-anchor':'end',fill:cssv('--ink'),'font-size':11.5,'font-weight':600},
      fm(r.v,1)+unit));
    g.append(S('rect',{x:0,y:y+15,width:c.iw,height:6,rx:3,fill:cssv('--surface-2')}));
    const rr=S('rect',{x:0,y:y+15,width:Math.max(c.iw*r.v/mx,3),height:6,rx:3,fill:cssv(col),
      tabindex:0,role:'img','aria-label':`${r.label}: ${fm(r.v,1)}${unit}`});
    hoverable(rr,()=>`<b>${esc(r.label)}</b>`+ttRows([['Quota della capacità predittiva',fm(r.v,1)+unit]]));
    g.append(rr);
  });
}
