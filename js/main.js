/* ============================== NAVIGAZIONE E BOOT ============================== */
const VIEWS=['panoramica','mappa','lga','modello','budget','dati'];
const DONE={};
function switchView(v){
  VIEWS.forEach(x=>document.getElementById('v-'+x).classList.toggle('hidden',x!==v));
  document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected',String(t.dataset.view===v)));
  if(!DONE[v]){
    DONE[v]=true;
    if(v==='mappa'){ initMap(); buildMap(); paintMap(); mapPanel(); tableMap(); }
    if(v==='lga') initLGA();
    if(v==='modello') renderModello();
    if(v==='budget') renderBudget();
    if(v==='dati') renderDati();
  }
  window.scrollTo({top:0,behavior:'instant'});
}
function repaintAll(){
  Object.keys(DONE).forEach(k=>delete DONE[k]);
  MAPBUILT=false; MAPPATHS={};
  renderKPI(); chartZone(); chartFasce(); chartTrend(); chartTopDriver(); tableTop();
  const cur=VIEWS.find(v=>!document.getElementById('v-'+v).classList.contains('hidden'))||'panoramica';
  DONE['panoramica']=true;
  switchView(cur);
}
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>switchView(t.dataset.view));
document.querySelectorAll('[data-goto]').forEach(a=>a.onclick=e=>{e.preventDefault();switchView(a.dataset.goto);});
document.getElementById('theme').onclick=()=>{
  const d=document.documentElement.getAttribute('data-theme')==='dark';
  document.documentElement.setAttribute('data-theme',d?'light':'dark');
  repaintAll();
};
if(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme','dark');

renderKPI(); chartZone(); chartFasce(); chartTrend(); chartTopDriver(); tableTop();
DONE['panoramica']=true;

