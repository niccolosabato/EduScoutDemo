"""
EduScout - Step 4: ottimizzatore di allocazione delle risorse.

PROBLEMA
  Dato un budget B e un catalogo di interventi, scegliere QUALI interventi
  attivare in QUALI LGA per massimizzare i bambini reinseriti/mantenuti a scuola.

FORMULAZIONE
  Knapsack multi-scelta: ogni coppia (LGA, intervento) e' un item con costo c_ij
  e beneficio b_ij (bambini reinseriti). Il beneficio dipende dal DEFICIT della
  LGA sul driver che l'intervento aggredisce - un programma di servizi igienici
  femminili rende molto dove i servizi mancano, quasi nulla dove ci sono gia'.
  Vincoli: budget totale, massimo 3 interventi per LGA, rendimenti decrescenti
  sugli interventi successivi nella stessa LGA (fattore 0,7^k).

RISOLUZIONE
  Greedy per rapporto beneficio/costo (ottimo entro (1-1/e) per knapsack
  submodulare) + passata di scambio locale che prova a sostituire item marginali
  con item scartati, finche' il miglioramento e' nullo.

SROI
  Banca Mondiale: ogni anno aggiuntivo di scuola primaria aumenta il reddito
  futuro dell'individuo di circa il 9-10%. Si assume un reddito annuo atteso
  pari al PIL pro-capite nigeriano, 40 anni di vita lavorativa a partire dai
  18 anni, tasso di sconto reale 5%.
"""
import json, numpy as np, pandas as pd

BASE = "/root/eduscout"
pred = pd.read_csv(f"{BASE}/data/previsioni_2026.csv")
shap_l = pd.read_csv(f"{BASE}/data/shap_locali.csv").set_index('lga_id')

# ------------------------------------------------ catalogo interventi
# costo_unitario = USD per bambino in eta' scolare nella LGA (stime d'ordine di
# grandezza da programmi reali di trasferimenti condizionati, feeding e WASH).
CATALOGO = [
    dict(id='cct',      nome='Trasferimenti monetari condizionati',
         driver=['poverta_minorile', 'lavoro_minorile'], costo=34.0, eff_max=9.5,
         desc='Sussidio alle famiglie condizionato alla frequenza scolastica.'),
    dict(id='feeding',  nome='Programma di refezione scolastica',
         driver=['poverta_minorile'], costo=21.0, eff_max=5.5,
         desc='Un pasto al giorno a scuola: riduce il costo-opportunità della frequenza.'),
    dict(id='wash',     nome='Servizi igienici femminili separati + acqua',
         driver=['servizi_igienici_f', 'acqua_potabile'], costo=15.0, eff_max=6.0,
         desc='Blocchi sanitari separati per genere e punto acqua nelle scuole.'),
    dict(id='trasporto', nome='Trasporto scolastico e aule satellite',
         driver=['distanza_scuola_km', 'accesso_stradale'], costo=27.0, eff_max=8.0,
         desc='Navette e aule decentrate per ridurre la distanza casa-scuola.'),
    dict(id='docenti',  nome='Reclutamento e formazione docenti',
         driver=['rapporto_alunni_ins'], costo=19.0, eff_max=4.5,
         desc='Nuovi insegnanti dove le classi sono sovraffollate.'),
    dict(id='almajiri', nome='Integrazione scuola coranica-curriculum formale',
         driver=['scuola_coranica'], costo=12.0, eff_max=7.0,
         desc='Inserimento di matematica e alfabetizzazione nelle scuole coraniche.'),
    dict(id='resilienti', nome='Scuole mobili e resilienti',
         driver=['eventi_conflitto', 'shock_climatico'], costo=41.0, eff_max=7.5,
         desc='Strutture temporanee/mobili per aree di conflitto o soggette a shock climatici.'),
    dict(id='alfabet',  nome='Alfabetizzazione femminile adulta e mobilitazione comunitaria',
         driver=['alfab_femminile'], costo=16.0, eff_max=5.0,
         desc='Corsi per madri e sensibilizzazione: leva più forte sull\'iscrizione delle bambine.'),
]

# deficit normalizzato 0-1 per driver: 1 = peggiore LGA del paese
NEG = {'alfab_femminile', 'servizi_igienici_f', 'accesso_stradale',
       'acqua_potabile', 'spesa_edu_procapite'}
DRIVERS = [c for c in shap_l.columns]
defc = {}
for f in DRIVERS:
    v = pred[f].astype(float)
    lo, hi = v.quantile(0.05), v.quantile(0.95)
    x = ((v - lo) / max(hi - lo, 1e-9)).clip(0, 1)
    defc[f] = (1 - x) if f in NEG else x
DEF = pd.DataFrame(defc, index=pred.index)

# quota di rischio attribuita dal modello a quel driver (SHAP positivi normalizzati)
Sp = shap_l.clip(lower=0)
QUOTA = (Sp.div(Sp.sum(axis=1).replace(0, np.nan), axis=0)).fillna(0)
QUOTA = QUOTA.reindex(pred.lga_id).reset_index(drop=True)

# ------------------------------------------------ generazione degli item
items = []
for iv in CATALOGO:
    dv = [d for d in iv['driver'] if d in DEF.columns]
    deficit = DEF[dv].mean(axis=1)
    quota = QUOTA[dv].sum(axis=1)
    # efficacia = massimo dell'intervento x quanto il problema e' presente x
    #             quanto il modello attribuisce il rischio a quel driver
    eff_pp = iv['eff_max'] * deficit * (0.45 + 0.55 * np.minimum(quota * 2.2, 1.0))
    eff_pp = np.minimum(eff_pp, pred.oos_pred_2026 * 0.55)   # non oltre il 55% del gap
    bambini = pred.pop_6_11 * eff_pp / 100
    costo = iv['costo'] * pred.pop_6_11
    ok = (bambini > 150) & (pred.fascia != 'Basso')
    t = pd.DataFrame(dict(lga_id=pred.lga_id, lga=pred.lga, state=pred.state, zone=pred.zone,
                          intervento=iv['id'], nome=iv['nome'], costo=costo,
                          eff_pp=eff_pp, bambini=bambini))[ok]
    items.append(t)
IT = pd.concat(items, ignore_index=True)
IT['ratio'] = IT.bambini / IT.costo
print(f"Item candidati (LGA x intervento): {len(IT)} su {pred.lga_id.nunique()} LGA")


def ottimizza(budget_usd, max_per_lga=3, decay=0.7):
    """Greedy su beneficio/costo con rendimenti decrescenti + scambio locale."""
    pool = IT.sort_values('ratio', ascending=False).to_dict('records')
    conta, scelti, speso, resa = {}, [], 0.0, 0.0
    for r in pool:
        k = conta.get(r['lga_id'], 0)
        if k >= max_per_lga:
            continue
        f = decay ** k
        c, b = r['costo'], r['bambini'] * f
        if speso + c > budget_usd:
            continue
        conta[r['lga_id']] = k + 1
        speso += c; resa += b
        scelti.append({**r, 'bambini_eff': b, 'ordine': k + 1})
    # scambio locale: prova a liberare l'item peggiore per farne entrare di migliori
    for _ in range(3):
        if not scelti:
            break
        scelti.sort(key=lambda r: r['bambini_eff'] / r['costo'])
        worst = scelti[0]
        residuo = budget_usd - speso + worst['costo']
        ids = {(s['lga_id'], s['intervento']) for s in scelti}
        cand = [r for r in pool if (r['lga_id'], r['intervento']) not in ids
                and r['costo'] <= residuo and r['bambini'] > worst['bambini_eff']]
        if not cand:
            break
        best = max(cand, key=lambda r: r['bambini'])
        scelti.pop(0)
        speso += best['costo'] - worst['costo']
        resa += best['bambini'] - worst['bambini_eff']
        scelti.append({**best, 'bambini_eff': best['bambini'], 'ordine': 1})
    return pd.DataFrame(scelti), speso, resa


# ------------------------------------------------ SROI
PIL_PC, RENDIMENTO, ANNI, SCONTO, ETA = 1_620.0, 0.095, 40, 0.05, 18


def sroi(bambini, costo):
    """Valore attuale del maggior reddito atteso / costo del programma."""
    va = sum(PIL_PC * RENDIMENTO / (1 + SCONTO) ** (ETA - 9 + t) for t in range(ANNI))
    beneficio = bambini * va
    return beneficio, (beneficio / costo if costo else 0)


# ------------------------------------------------ scenari
scenari = {}
for B in [50, 100, 200, 400, 800]:
    sel, speso, resa = ottimizza(B * 1e6)
    ben, r = sroi(resa, speso)
    per_int = (sel.groupby(['intervento', 'nome'])
               .agg(lga=('lga_id', 'nunique'), costo=('costo', 'sum'), bambini=('bambini_eff', 'sum'))
               .reset_index().sort_values('bambini', ascending=False))
    per_zona = (sel.groupby('zone').agg(lga=('lga_id', 'nunique'), costo=('costo', 'sum'),
                                        bambini=('bambini_eff', 'sum')).reset_index())
    scenari[str(B)] = dict(
        budget_mln=B, speso=round(speso / 1e6, 2), lga_coperte=int(sel.lga_id.nunique()),
        interventi=int(len(sel)), bambini=int(round(resa)),
        costo_per_bambino=round(speso / max(resa, 1), 1),
        sroi=round(r, 2), beneficio_mln=round(ben / 1e6, 1),
        per_intervento=[dict(id=x.intervento, nome=x.nome, lga=int(x.lga),
                             costo_mln=round(x.costo / 1e6, 2), bambini=int(round(x.bambini)))
                        for x in per_int.itertuples()],
        per_zona=[dict(zona=x.zone, lga=int(x.lga), costo_mln=round(x.costo / 1e6, 2),
                       bambini=int(round(x.bambini))) for x in per_zona.itertuples()],
        top_lga=[dict(lga=x.lga, state=x.state, intervento=x.nome,
                      costo_mln=round(x.costo / 1e6, 2), bambini=int(round(x.bambini_eff)))
                 for x in sel.nlargest(15, 'bambini_eff').itertuples()],
    )
    print(f"Budget {B:>4} M$ -> {sel.lga_id.nunique():>3} LGA | {len(sel):>3} interventi | "
          f"{resa:>10,.0f} bambini | {speso/max(resa,1):>5.1f} $/bambino | SROI {r:.2f}x")

# piano dettagliato dello scenario di riferimento
sel200, speso200, resa200 = ottimizza(200e6)
sel200.round(2).to_csv(f"{BASE}/data/piano_200M.csv", index=False)
json.dump(dict(scenari=scenari,
               catalogo=[{k: v for k, v in c.items() if k != 'driver'} for c in CATALOGO],
               ipotesi=dict(pil_procapite_usd=PIL_PC, rendimento_annuo=RENDIMENTO,
                            anni_lavorativi=ANNI, tasso_sconto=SCONTO)),
          open(f"{BASE}/data/scenari_budget.json", 'w'), ensure_ascii=False, indent=1)
print("\nOK -> data/scenari_budget.json, data/piano_200M.csv")
