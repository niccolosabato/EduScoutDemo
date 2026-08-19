/* ============================== DATI E METODO ============================== */
function renderDati(){
  const h=document.getElementById('d-body');
  const I=SCE.ipotesi;
  h.innerHTML=`
  <div class="grid" style="grid-template-columns:1fr 1fr">
    <div class="card">
      <h3>Cosa è reale in questa demo</h3>
      <div class="sub">Dati verificabili, con link diretto alla fonte</div>
      <ul class="src" style="padding-left:18px;margin:0">
        <li><b>Confini delle 774 LGA e dei 37 stati</b> — geometrie ufficiali
          <a href="https://www.geoboundaries.org/" target="_blank" rel="noopener">geoBoundaries ADM1/ADM2 Nigeria</a>.
          Il numero di LGA per stato coincide con la ripartizione ufficiale (Kano 44, Katsina 34, Oyo 33…).</li>
        <li><b>Bambini in età primaria fuori dalla scuola, 24,3% (2023)</b> — World Bank,
          <a href="https://data.worldbank.org/indicator/SE.PRM.UNER.ZS?locations=NG" target="_blank" rel="noopener">SE.PRM.UNER.ZS</a>.</li>
        <li><b>Alfabetizzazione adulta 70,4% (2024)</b> — World Bank,
          <a href="https://data.worldbank.org/indicator/SE.ADT.LITR.ZS?locations=NG" target="_blank" rel="noopener">SE.ADT.LITR.ZS</a>.</li>
        <li><b>10,5 milioni di bambini 5-14 fuori dalla scuola; solo il 61% dei 6-11 frequenta
          regolarmente; frequenza netta al Nord 53%; frequenza femminile 47,7% (Nord-Est) e 47,3% (Nord-Ovest);
          istruzione coranica esclusiva 29% NE e 35% NW</b> — UNICEF,
          <a href="https://www.unicef.org/nigeria/education" target="_blank" rel="noopener">Education · UNICEF Nigeria</a>.</li>
        <li><b>Panoramica globale sull'istruzione</b> —
          <a href="https://data.unicef.org/topic/education/overview/" target="_blank" rel="noopener">UNICEF Data</a>.</li>
        <li><b>Indicatori globali di abbandono ed equità</b> — UNESCO Institute for Statistics,
          <a href="https://databrowser.uis.unesco.org/browser" target="_blank" rel="noopener">UIS Data Browser</a> e
          <a href="https://www.unesco.org/en/education/view/outofschool" target="_blank" rel="noopener">Out-of-school children</a>.</li>
        <li><b>Rendimento dell'istruzione: +9-10% di reddito per anno di scuola</b> — usato nel calcolo dello SROI.</li>
      </ul>
    </div>
    <div class="card">
      <h3>Cosa è simulato</h3>
      <div class="sub">E perché</div>
      <p style="margin-top:0;color:var(--ink-2)">Non esiste una serie storica pubblica, annuale e completa
      di indicatori socio-economici disaggregati su tutte le 774 LGA nigeriane: è esattamente il problema
      di data engineering che EduScout dovrebbe risolvere sul campo. Per far vedere la pipeline in funzione
      i valori a livello di LGA sono <b>generati</b> da un modello strutturale con rumore idiosincratico,
      e poi <b>ricalibrati</b> con una singola trasformazione affine globale stimata ai minimi quadrati sulle
      medie di zona pubblicate.</p>
      <p style="color:var(--ink-2)">Scelta metodologica importante: il livello di rischio di una zona
      <b>non è imposto dall'esterno</b>, emerge dalle variabili esplicative. È la tesi stessa del progetto —
      il divario Nord/Sud è il risultato di povertà, distanza dalla scuola, alfabetizzazione femminile e
      insicurezza, non una caratteristica geografica in sé. Per questo il modello non contiene nessuna
      dummy di zona.</p>
      <div class="banner"><span aria-hidden="true">⚠️</span><div><b>Non usare i valori delle singole LGA
      come dati reali.</b> Sono plausibili e coerenti con le medie pubblicate, ma non descrivono
      la situazione effettiva di nessuna specifica LGA.</div></div>
    </div>
  </div>

  <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:14px">
    <div class="card">
      <h3>La pipeline in cinque passaggi</h3>
      <div class="sub">Ogni passaggio è uno script Python riproducibile</div>
      <ol style="padding-left:18px;color:var(--ink-2);font-size:13px">
        <li><code>01_geo.py</code> — 774 poligoni LGA, assegnazione allo stato per massima
          sovrapposizione di area, semplificazione topology-preserving.</li>
        <li><code>02_dataset.py</code> — panel 774 LGA × 6 anni (2020-2025), 12 variabili esplicative,
          equazione strutturale con interazioni non lineari, calibrazione affine sulle ancore reali.</li>
        <li><code>03_model.py</code> — regressione + classificazione, holdout temporale, TimeSeriesSplit,
          permutation importance a blocchi, SHAP.</li>
        <li><code>04_ottimizzatore.py</code> — knapsack multi-scelta con rendimenti decrescenti,
          greedy + scambio locale, SROI.</li>
        <li><code>05_payload.py</code> — pacchetto dati compatto per questa dashboard.</li>
      </ol>
    </div>
    <div class="card">
      <h3>Ipotesi del calcolo SROI</h3>
      <div class="sub">Rendimento sociale dell'investimento</div>
      <table style="font-size:13px"><tbody>
        <tr><td>Reddito annuo atteso (PIL pro-capite Nigeria)</td><td class="num">${fm(I.pil_procapite_usd,0)} $</td></tr>
        <tr><td>Rendimento per anno di scuola primaria</td><td class="num">${fm(I.rendimento_annuo*100,1)}%</td></tr>
        <tr><td>Anni di vita lavorativa considerati</td><td class="num">${fm(I.anni_lavorativi)}</td></tr>
        <tr><td>Tasso di sconto reale</td><td class="num">${fm(I.tasso_sconto*100,1)}%</td></tr>
      </tbody></table>
      <div class="note">Lo SROI è il valore attuale del maggior reddito atteso dei bambini reinseriti,
      diviso per il costo del programma. Le stime di costo unitario degli interventi sono ordini di
      grandezza tratti dalla letteratura su trasferimenti condizionati, refezione scolastica e programmi WASH,
      non preventivi.</div>
    </div>
  </div>

  <div style="margin-top:14px;display:grid;gap:10px">
    <details class="meth"><summary>Come è costruito il target: regressione o classificazione?</summary>
      <div class="body"><p><b>Entrambi, in sequenza — e la distinzione conta.</b></p>
      <p>Lo stadio 1 è una <b>regressione</b>. Il target è una variabile continua: il tasso reale di bambini
      6-11 anni fuori dalla scuola nella LGA <b>nell'anno successivo</b> (<code>t+1</code>), ricavato dalla
      serie storica. Non è una classe costruita a posteriori: è il valore che si osserverà davvero, e
      questo rende la validazione onesta — il modello vede i dati fino al 2023 e viene giudicato su un
      anno che non ha mai visto.</p>
      <p>Il <b>punteggio di rischio 0-100</b> è una trasformazione deterministica della previsione:
      <code>punteggio = min(100, tasso_previsto / 60 × 100)</code>. Un tasso del 60% o superiore vale 100.
      La scala è fissa e dichiarata, quindi il punteggio resta confrontabile fra anni diversi.</p>
      <p>Lo stadio 2 è una <b>classificazione ordinale</b> ottenuta discretizzando il punteggio in tre
      fasce. Non serve a predire meglio, serve a <b>decidere</b>: le fasce corrispondono a tre trattamenti
      di budget diversi. Per questo la metrica che conta è il <b>recall sulla fascia alta</b>.</p></div></details>

    <details class="meth"><summary>Perché la soglia operativa non coincide con il 70 nominale</summary>
      <div class="body"><p>Un <b>falso negativo</b> è una LGA realmente critica che il modello colloca in
      fascia media: non riceve fondi, e i bambini restano fuori. Un <b>falso positivo</b> è una LGA meno
      critica che riceve fondi comunque: spreco, ma nessun danno diretto. I due errori non hanno lo stesso
      costo, quindi non ha senso usare la soglia che massimizza l'accuratezza.</p>
      <p>La soglia viene scelta scorrendo la griglia 55-75 e prendendo quella che <b>massimizza il recall
      sulla fascia alta</b> sotto il vincolo <b>precision ≥ 0,80</b> — un livello di spreco che un'agenzia
      può accettare. Il grafico nella scheda Modello mostra il compromesso per intero.</p></div></details>

    <details class="meth"><summary>Perché due modelli e non uno</summary>
      <div class="body"><p>Il modello <b>early-warning</b> usa anche la memoria storica della LGA (tasso
      dell'anno precedente e sua variazione): è il più accurato e produce la classifica operativa.</p>
      <p>Il modello <b>strutturale</b> usa solo variabili socio-economiche, geografiche, climatiche e di
      sicurezza. Serve a due cose che il primo non può fare: <b>spiegare</b> perché una LGA è a rischio
      (se il fattore dominante fosse "l'anno scorso era messa male", non si saprebbe cosa finanziare), e
      <b>coprire le LGA senza serie storica affidabile</b>, situazione ordinaria nei sistemi statistici
      sub-nazionali. Le sue previsioni sono solo leggermente meno accurate, il che è di per sé un
      risultato utile.</p></div></details>

    <details class="meth"><summary>Permutation importance a blocchi e valori SHAP</summary>
      <div class="body"><p>Le variabili sono fortemente correlate fra loro: povertà, alfabetizzazione
      femminile e distanza dalla scuola si muovono insieme. Con la permutation importance classica, una
      variabile può sembrare irrilevante solo perché il modello recupera la stessa informazione da una
      "gemella". Permutando <b>insieme</b> i blocchi tematici il problema sparisce, e il risultato è
      leggibile in termini di politica pubblica.</p>
      <p>Per la spiegazione della singola LGA si usano i <b>valori SHAP</b> del modello strutturale,
      espressi direttamente in punti percentuali di tasso fuori-scuola: la somma dei contributi più il
      valore base ricostruisce esattamente la previsione. Sono esatti perché il modello di produzione è
      lineare regolarizzato.</p></div></details>

    <details class="meth"><summary>Limiti dichiarati</summary>
      <div class="body"><ul style="padding-left:18px">
        <li>I dati LGA sono simulati: le metriche misurano che la pipeline funziona, non che funzionerebbe
        con questa accuratezza su dati reali. Su dati veri ci si aspetta un R² sensibilmente più basso,
        per errore di misura, dati mancanti e cambi di definizione fra rilevazioni.</li>
        <li>I contributi SHAP sono <b>associazioni</b>, non effetti causali. L'intervento suggerito è
        un'ipotesi da testare, idealmente con una valutazione randomizzata, non una promessa di risultato.</li>
        <li>L'efficacia degli interventi è modellata con una funzione di risposta al deficit locale
        parametrizzata a mano: è la parte più fragile della catena e andrebbe stimata da valutazioni d'impatto reali.</li>
        <li>Le LGA in fascia bassa sono escluse dall'ottimizzatore: efficiente sul totale, ma può lasciare
        indietro minoranze concentrate dentro aree mediamente sane. Una versione operativa avrebbe bisogno
        di un vincolo di equità esplicito.</li>
        <li>Rischio di <b>feedback</b>: se le risorse seguono le previsioni, i dati futuri riflettono le
        decisioni passate. Serve un disegno di valutazione che preservi un gruppo di controllo.</li>
        <li>La demo non tratta dati personali: lavora su aggregati territoriali. Un sistema reale che
        scendesse a livello di singola scuola o famiglia richiederebbe una valutazione d'impatto sulla
        protezione dei dati.</li>
      </ul></div></details>
  </div>`;
}
