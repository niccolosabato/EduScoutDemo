# EduScout — piattaforma demo

Simulazione funzionante della piattaforma descritta nella presentazione del progetto:
una pipeline data-driven che **prevede** dove i bambini usciranno dal sistema scolastico in
Nigeria, **spiega** perché, e **ottimizza** l'allocazione di un budget limitato.

Apri **`index.html`** nel browser: nessuna dipendenza, nessun server, funziona
anche offline (doppio click sul file).

---

## Cosa contiene

| | |
|---|---|
| **Dashboard** | `index.html` + `css/` + `js/` — 6 schede: panoramica, mappa delle 774 LGA, scheda LGA, modello ML, allocazione budget, dati e metodo |
| **Pipeline** | `src/01…05` — cinque script Python riproducibili |
| **Dati generati** | `data/` — panel, previsioni, valori SHAP, metriche, scenari |

Struttura della dashboard:

```
index.html                  markup delle 6 schede
css/style.css                tutti gli stili
js/data.js                    dati (774 LGA, storico, metriche, scenari)
js/core.js                    helper condivisi e primitive dei grafici
js/view-panoramica.js
js/view-mappa.js
js/view-lga.js
js/view-modello.js
js/view-budget.js
js/view-dati.js
js/main.js                    navigazione a schede e bootstrap
```

## Risultati del modello

Validazione temporale: addestramento sugli anni ≤ 2023, test sull'anno 2024 → target 2025,
mai visto in addestramento. 774 LGA nel test set.

**Stadio 1 — regressione** (target: tasso di bambini 6-11 fuori dalla scuola in `t+1`)

| Modello | R² | MAE | RMSE |
|---|---|---|---|
| Baseline (media) | −0,002 | 15,99 pp | 17,91 pp |
| HistGradientBoosting | 0,863 | 5,19 pp | 6,53 pp |
| Random Forest | 0,881 | 4,85 pp | 6,09 pp |
| **Ridge regolarizzata — in produzione** | **0,890** | **4,66 pp** | **5,85 pp** |
| Strutturale (senza memoria storica) | 0,874 | 5,00 pp | 6,27 pp |

Cross-validation temporale (TimeSeriesSplit, 4 split): **R² = 0,888 ± 0,003**.

**Stadio 2 — classificazione** in tre fasce di rischio (soglia operativa calibrata: punteggio > 68)

| Fascia | Precision | Recall | F1 | LGA |
|---|---|---|---|---|
| **Alto** | 0,812 | **0,880** | 0,844 | 225 |
| Medio | 0,674 | 0,553 | 0,608 | 161 |
| Basso | 0,935 | 0,959 | 0,947 | 388 |

Accuratezza complessiva 0,851 · macro-F1 0,800 · **27 falsi negativi in fascia alta su 225**.

Il recall sulla fascia alta è la metrica prioritaria: un falso negativo è una LGA critica che
non riceve fondi. La soglia operativa non è il 70 nominale ma quella che massimizza il recall
sotto il vincolo `precision ≥ 0,80`.

**Ottimizzatore** — scenario da 200 milioni di dollari: 589.115 bambini riportati a scuola in
248 LGA, 340 $ per bambino, SROI 5,26×.

## Riprodurre

```bash
pip install numpy pandas scikit-learn shapely shap
python src/01_geo.py           # 774 poligoni LGA -> stato/zona
python src/02_dataset.py       # panel 774 LGA x 6 anni
python src/03_model.py         # regressione + classificazione + SHAP
python src/04_ottimizzatore.py # allocazione budget + SROI
python src/05_payload.py       # pacchetto dati per la dashboard
```

I confini geografici (`adm1.geojson`, `adm2.geojson`) vanno scaricati da geoBoundaries:

```bash
curl -L -o adm2.geojson https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/NGA/ADM2/geoBoundaries-NGA-ADM2_simplified.geojson
curl -L -o adm1.geojson https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/NGA/ADM1/geoBoundaries-NGA-ADM1_simplified.geojson
```

---

## Cosa è reale e cosa è simulato

**Reale.** I confini delle 774 LGA e dei 37 stati sono le geometrie ufficiali geoBoundaries: il
numero di LGA per stato coincide con la ripartizione ufficiale (Kano 44, Katsina 34, Oyo 33,
Akwa Ibom 31…). Tutte le ancore statistiche sono pubblicate e linkate:

- Bambini in età primaria fuori dalla scuola, 24,3% (2023) — World Bank [`SE.PRM.UNER.ZS`](https://data.worldbank.org/indicator/SE.PRM.UNER.ZS?locations=NG)
- Alfabetizzazione adulta 70,4% (2024) — World Bank [`SE.ADT.LITR.ZS`](https://data.worldbank.org/indicator/SE.ADT.LITR.ZS?locations=NG)
- 10,5 mln di bambini 5-14 fuori dalla scuola; 61% dei 6-11 frequenta regolarmente; frequenza
  netta al Nord 53%; frequenza femminile 47,7% (NE) e 47,3% (NW); istruzione coranica esclusiva
  29% NE e 35% NW — [UNICEF Nigeria · Education](https://www.unicef.org/nigeria/education)
- [UNICEF Data · Education overview](https://data.unicef.org/topic/education/overview/)
- [UNESCO UIS Data Browser](https://databrowser.uis.unesco.org/browser) · [Out-of-school children](https://www.unesco.org/en/education/view/outofschool)
- Rendimento dell'istruzione, +9-10% di reddito per anno di scuola primaria (World Bank) — usato nello SROI

**Simulato.** Non esiste una serie storica pubblica, annuale e completa di indicatori
socio-economici disaggregati su tutte le 774 LGA: è esattamente il problema di data engineering
che EduScout dovrebbe risolvere sul campo. I valori a livello di LGA sono generati da un modello
strutturale con rumore idiosincratico, poi ricalibrati con **una singola trasformazione affine
globale** stimata ai minimi quadrati sulle medie di zona pubblicate.

Scelta metodologica importante: **il livello di rischio di una zona non è imposto dall'esterno,
emerge dalle variabili esplicative.** È la tesi stessa del progetto — il divario Nord/Sud è il
risultato di povertà, distanza dalla scuola, alfabetizzazione femminile e insicurezza, non una
caratteristica geografica in sé. Per questo il modello non contiene nessuna dummy di zona.

> **I valori delle singole LGA non sono dati reali.** Sono plausibili e coerenti con le medie
> pubblicate, ma non descrivono la situazione effettiva di nessuna specifica LGA.

## Scelte metodologiche

**Il target è continuo, il punteggio è una trasformazione, le fasce sono una decisione.**
Lo stadio 1 è una regressione sul tasso reale di bambini fuori dalla scuola nell'anno successivo,
ricavato dalla serie storica — non una classe costruita a posteriori. Il punteggio 0-100 è
deterministico: `min(100, tasso_previsto / 60 × 100)`. Le tre fasce servono a decidere il budget,
non a predire meglio.

**Due modelli.** L'*early-warning* usa anche la memoria storica della LGA ed è il più accurato:
produce la classifica operativa. Lo *strutturale* usa solo variabili socio-economiche,
geografiche, climatiche e di sicurezza: serve a spiegare perché una LGA è a rischio (se il
fattore dominante fosse "l'anno scorso era messa male" non si saprebbe cosa finanziare) e a
coprire le LGA senza serie storica affidabile.

**Permutation importance a blocchi.** Le variabili sono fortemente correlate. Permutandole una
alla volta, una variabile può sembrare irrilevante solo perché il modello recupera la stessa
informazione da una "gemella". Permutando insieme i blocchi tematici il problema sparisce.

**SHAP per la singola LGA**, in punti percentuali di tasso fuori-scuola. Esatti, perché il
modello di produzione è lineare regolarizzato.

**L'ottimizzatore** è un knapsack multi-scelta: ogni coppia (LGA, intervento) è un item con costo
e beneficio, il beneficio dipende dal deficit locale sul driver che l'intervento aggredisce.
Vincoli: budget, massimo 3 interventi per LGA, rendimenti decrescenti (0,7^k). Risolto con greedy
su rapporto beneficio/costo più una passata di scambio locale.

## Limiti

- I dati LGA sono simulati: le metriche misurano che la pipeline funziona, non che funzionerebbe
  con questa accuratezza su dati reali. Su dati veri ci si aspetta un R² sensibilmente più basso,
  per errore di misura, dati mancanti e cambi di definizione fra rilevazioni.
- I contributi SHAP sono **associazioni, non effetti causali**. L'intervento suggerito è
  un'ipotesi da testare, idealmente con una valutazione randomizzata.
- L'efficacia degli interventi usa una funzione di risposta al deficit locale parametrizzata a
  mano: è l'anello più fragile della catena e andrebbe stimato da valutazioni d'impatto reali.
- Le LGA in fascia bassa sono escluse dall'ottimizzatore: efficiente sul totale, ma può lasciare
  indietro minoranze concentrate dentro aree mediamente sane. Servirebbe un vincolo di equità.
- Rischio di **feedback**: se le risorse seguono le previsioni, i dati futuri riflettono le
  decisioni passate. Serve un disegno di valutazione che preservi un gruppo di controllo.
- La demo lavora su aggregati territoriali, non su dati personali. Un sistema reale a livello di
  singola scuola o famiglia richiederebbe una valutazione d'impatto sulla protezione dei dati.
