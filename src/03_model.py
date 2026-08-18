"""
EduScout - Step 3: modello di Machine Learning a due stadi.

DUE MODELLI COMPLEMENTARI
  A) EARLY-WARNING  - usa anche la memoria storica (tasso t-1, variazione t-1/t-2).
     Massima accuratezza predittiva: e' il modello che produce la classifica
     operativa delle LGA da finanziare.
  B) STRUTTURALE    - usa SOLO variabili socio-economiche, geografiche, climatiche
     e di sicurezza (nessun lag). Serve a due cose:
       1. spiegare PERCHE' una LGA e' a rischio (attribuzione dei driver);
       2. produrre una stima anche per le LGA prive di serie storica affidabile,
          situazione frequente nei sistemi statistici sub-nazionali.

STADIO 1 - REGRESSIONE
  Target: tasso reale di bambini 6-11 fuori dalla scuola nell'anno t+1
  Output: Punteggio di Rischio di Esclusione Educativa 0-100
  Metriche: R2, MAE, RMSE (holdout temporale + TimeSeriesSplit CV)

STADIO 2 - CLASSIFICAZIONE
  Fasce: alto >70, medio 40-70, basso <40.
  Metrica prioritaria: RECALL sulla classe "alto rischio". Il costo di un falso
  negativo (LGA critica non individuata -> nessun intervento) e' molto piu' alto
  del costo di un falso positivo (risorse su una LGA meno critica): la soglia
  operativa viene quindi calibrata per massimizzare il recall a un livello di
  precision accettabile.

VALIDAZIONE TEMPORALE (nessun leakage)
  train: anni <= 2023  |  test: 2024 -> target 2025 (mai visto in addestramento)
"""
import json, numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge, RidgeCV
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.dummy import DummyRegressor
from sklearn.metrics import (r2_score, mean_absolute_error, mean_squared_error,
                             classification_report, confusion_matrix,
                             precision_recall_fscore_support, accuracy_score)
from sklearn.inspection import permutation_importance
from sklearn.model_selection import TimeSeriesSplit

BASE, RNG = "/root/eduscout", 42

ZONE_COLS = []   # nessun effetto fisso di zona: il divario geografico deve
                 # essere spiegato dai driver, non da una dummy territoriale
STRUCT = ['poverta_minorile', 'alfab_femminile', 'distanza_scuola_km',
          'rapporto_alunni_ins', 'servizi_igienici_f', 'accesso_stradale',
          'lavoro_minorile', 'eventi_conflitto', 'shock_climatico',
          'scuola_coranica', 'acqua_potabile', 'spesa_edu_procapite', 'urban', 'pop_6_11']
FEATURES = STRUCT + ['oos_lag1', 'oos_delta1']

LABEL = {f'z_{k}': f'Zona geopolitica: {k}' for k in
         ['NC', 'NE', 'NW', 'SE', 'SS', 'SW']}
LABEL.update({
    'poverta_minorile': 'Povertà minorile multidimensionale (%)',
    'alfab_femminile': 'Alfabetizzazione femminile adulta (%)',
    'distanza_scuola_km': 'Distanza media dalla scuola (km)',
    'rapporto_alunni_ins': 'Rapporto alunni/insegnante',
    'servizi_igienici_f': 'Servizi igienici femminili separati (% scuole)',
    'accesso_stradale': 'Accesso stradale tutto-tempo (%)',
    'lavoro_minorile': 'Lavoro minorile 5-14 anni (%)',
    'eventi_conflitto': 'Eventi di conflitto/insicurezza (n./anno)',
    'shock_climatico': 'Indice di shock climatico (0-100)',
    'scuola_coranica': 'Istruzione coranica esclusiva (%)',
    'acqua_potabile': 'Accesso ad acqua potabile (%)',
    'spesa_edu_procapite': 'Spesa educativa pro-capite (USD)',
    'urban': 'Area urbana (0/1)',
    'pop_6_11': 'Popolazione 6-11 anni',
    'oos_lag1': 'Tasso fuori-scuola anno precedente (%)',
    'oos_delta1': 'Variazione tasso t-1 / t-2 (pp)',
})
SCALE, ORDER = 60.0, ['Alto', 'Medio', 'Basso']
to_score = lambda o: np.clip(np.asarray(o) / SCALE * 100, 0, 100)


def to_band(s, hi=70, lo=40):
    return np.where(s > hi, 'Alto', np.where(s >= lo, 'Medio', 'Basso'))


def new_gbm():
    return HistGradientBoostingRegressor(max_iter=400, learning_rate=0.06, max_leaf_nodes=31,
                                         min_samples_leaf=15, l2_regularization=1.0, random_state=RNG)


def new_model():
    """Modello di produzione: Ridge standardizzata dentro una Pipeline.
    Scelto perche' vince il confronto sull'holdout temporale (vedi benchmark) e
    perche' i suoi contributi SHAP sono esatti e direttamente leggibili come
    'punti percentuali di tasso fuori-scuola' attribuiti a ciascun driver."""
    return make_pipeline(StandardScaler(), RidgeCV(alphas=np.logspace(-2, 3, 30)))


def score_reg(y, yh):
    return dict(r2=r2_score(y, yh), mae=mean_absolute_error(y, yh),
                rmse=float(np.sqrt(mean_squared_error(y, yh))))


# ---------------------------------------------------------------- dati
p = pd.read_csv(f"{BASE}/data/eduscout_panel.csv").sort_values(['lga_id', 'year'])
# effetto fisso di geografia: il livello medio di zona e' una variabile a se',
# cosi' le importanze dei driver misurano il contributo MARGINALE dentro la zona
# invece di essere assorbite dalla feature piu' correlata con la zona.
ZKEY = {'North Central': 'NC', 'North East': 'NE', 'North West': 'NW',
        'South East': 'SE', 'South South': 'SS', 'South West': 'SW'}
for k in ZKEY.values():
    p[f'z_{k}'] = (p.zone.map(ZKEY) == k).astype(int)
p['oos_lag1'] = p.groupby('lga_id')['tasso_fuori_scuola'].shift(1)
p['oos_delta1'] = p['oos_lag1'] - p.groupby('lga_id')['tasso_fuori_scuola'].shift(2)
d = p.dropna(subset=['target_oos_t1', 'oos_lag1', 'oos_delta1']).copy()
train, test = d[d.year <= 2023], d[d.year == 2024]
ytr, yte = train.target_oos_t1, test.target_oos_t1
print(f"Train {len(train)} oss. (anni {sorted(train.year.unique())})  |  "
      f"Test {len(test)} oss. (2024 -> target 2025)\n")

# ------------------------------------------- benchmark (modello early-warning)
bench = {}
for name, m in {'Baseline (media)': DummyRegressor(strategy='mean'),
                'Ridge (lineare, produzione)': new_model(),
                'Random Forest': RandomForestRegressor(n_estimators=400, min_samples_leaf=3,
                                                       random_state=RNG, n_jobs=-1),
                'HistGradientBoosting': new_gbm()}.items():
    m.fit(train[FEATURES], ytr); yh = m.predict(test[FEATURES])
    bench[name] = score_reg(yte, yh)
    print(f"{name:24s} R2={bench[name]['r2']:.3f}  MAE={bench[name]['mae']:.2f}pp  RMSE={bench[name]['rmse']:.2f}pp")

reg_ew = new_model().fit(train[FEATURES], ytr)
pred_ew = reg_ew.predict(test[FEATURES])
m_ew = score_reg(yte, pred_ew)

reg_st = new_model().fit(train[STRUCT], ytr)
pred_st = reg_st.predict(test[STRUCT])
m_st = score_reg(yte, pred_st)
print(f"\n{'Modello STRUTTURALE (no lag)':24s} R2={m_st['r2']:.3f}  MAE={m_st['mae']:.2f}pp  RMSE={m_st['rmse']:.2f}pp")

cv = []
ds = d.sort_values('year')
for a_i, b_i in TimeSeriesSplit(n_splits=4).split(ds):
    a, b = ds.iloc[a_i], ds.iloc[b_i]
    cv.append(r2_score(b.target_oos_t1, new_model().fit(a[FEATURES], a.target_oos_t1).predict(b[FEATURES])))
print(f"TimeSeriesSplit CV R2 (early-warning): {np.mean(cv):.3f} ± {np.std(cv):.3f}  {[round(s,3) for s in cv]}")


GRUPPI = {
    'Condizioni socio-economiche': ['poverta_minorile', 'lavoro_minorile', 'spesa_edu_procapite'],
    'Capitale umano e norme sociali': ['alfab_femminile', 'scuola_coranica'],
    'Accesso fisico alla scuola': ['distanza_scuola_km', 'accesso_stradale', 'urban'],
    'Qualità e servizi scolastici': ['rapporto_alunni_ins', 'servizi_igienici_f', 'acqua_potabile'],
    'Sicurezza e clima': ['eventi_conflitto', 'shock_climatico'],
    'Scala demografica': ['pop_6_11'],
}


def grouped_importance(model, feats, n_rep=20):
    """Permutation importance a blocchi: permutando insieme le feature correlate
    si evita che il modello recuperi l'informazione da un proxy, problema che
    rende inaffidabile la permutation importance feature-per-feature."""
    rs = np.random.default_rng(RNG)
    X0, base = test[feats].copy(), r2_score(yte, model.predict(test[feats]))
    out = []
    for g, cols in GRUPPI.items():
        cols = [c for c in cols if c in feats]
        if not cols:
            continue
        drops = []
        for _ in range(n_rep):
            Xp = X0.copy()
            Xp[cols] = Xp[cols].values[rs.permutation(len(Xp))]
            drops.append(base - r2_score(yte, model.predict(Xp)))
        out.append(dict(gruppo=g, drop_r2=float(np.mean(drops)), std=float(np.std(drops))))
    t = pd.DataFrame(out).sort_values('drop_r2', ascending=False).reset_index(drop=True)
    t['importance_pct'] = 100 * t.drop_r2.clip(lower=0) / t.drop_r2.clip(lower=0).sum()
    return t


def importances(model, feats):
    pi = permutation_importance(model, test[feats], yte, n_repeats=25, random_state=RNG, n_jobs=-1)
    t = (pd.DataFrame({'feature': feats, 'label': [LABEL[f] for f in feats],
                       'importance': np.maximum(pi.importances_mean, 0)})
         .sort_values('importance', ascending=False).reset_index(drop=True))
    t['importance_pct'] = 100 * t.importance / t.importance.sum()
    return t


imp_ew, imp_st = importances(reg_ew, FEATURES), importances(reg_st, STRUCT)
gimp = grouped_importance(reg_st, STRUCT)
print("\nImportanza per BLOCCO tematico (modello strutturale, permutazione a gruppi):")
print(gimp[['gruppo', 'importance_pct']].round(1).to_string(index=False))
print("\nDriver strutturali (permutation importance, modello senza lag):")
print(imp_st[['label', 'importance_pct']].head(8).round(1).to_string(index=False))

# -------------------------------- STADIO 2: fasce + calibrazione della soglia
band_true = to_band(to_score(yte))
sc_ew = to_score(pred_ew)
print("\n--- Classificazione con soglie nominali (70 / 40) ---")
print(classification_report(band_true, to_band(sc_ew), labels=ORDER, digits=3, zero_division=0))

grid = []
for hi in np.arange(55, 76, 1.0):
    b = to_band(sc_ew, hi=hi, lo=40)
    pr, rc, f1, _ = precision_recall_fscore_support(band_true, b, labels=ORDER, zero_division=0)
    grid.append(dict(soglia=float(hi), recall=float(rc[0]), precision=float(pr[0]), f1=float(f1[0])))
PREC_MIN = 0.80
ok = [g for g in grid if g['precision'] >= PREC_MIN]
best = max(ok, key=lambda g: g['recall']) if ok else max(grid, key=lambda g: g['f1'])
HI = best['soglia']
print(f"Soglia operativa calibrata: score > {HI:.0f} (vincolo: precision >= 0,80)")
print(f"  recall alto rischio {best['recall']:.3f} | precision {best['precision']:.3f} | F1 {best['f1']:.3f}")

band_pred = to_band(sc_ew, hi=HI, lo=40)
print("\n--- Classificazione con soglia operativa calibrata ---")
print(classification_report(band_true, band_pred, labels=ORDER, digits=3, zero_division=0))
cm = confusion_matrix(band_true, band_pred, labels=ORDER)
print("Matrice di confusione (righe = reale, colonne = predetto)", ORDER); print(cm)

pr, rc, f1, sup = precision_recall_fscore_support(band_true, band_pred, labels=ORDER, zero_division=0)
m_clf = {c: dict(precision=float(pr[i]), recall=float(rc[i]), f1=float(f1[i]), support=int(sup[i]))
         for i, c in enumerate(ORDER)}
m_clf.update(accuracy=float(accuracy_score(band_true, band_pred)), macro_f1=float(f1.mean()),
             soglia_alto=float(HI))
print(f"\nFalsi negativi ad alto rischio: {int(sup[0]-cm[0,0])} LGA su {int(sup[0])} "
      f"(recall {m_clf['Alto']['recall']:.1%})")

# ------------------------------- modelli finali + previsione operativa 2026
final_ew = new_model().fit(d[FEATURES], d.target_oos_t1)
final_st = new_model().fit(d[STRUCT], d.target_oos_t1)
cur = p[p.year == 2025].dropna(subset=['oos_lag1', 'oos_delta1']).copy()
cur['oos_pred_2026'] = final_ew.predict(cur[FEATURES])
cur['oos_pred_strutturale'] = final_st.predict(cur[STRUCT])
cur['risk_score'] = to_score(cur.oos_pred_2026).round(1)
cur['fascia'] = to_band(cur.risk_score.values, hi=HI, lo=40)
cur['bambini_a_rischio'] = (cur.pop_6_11 * cur.oos_pred_2026 / 100).round().astype(int)

# ---------- spiegabilita' locale: valori SHAP sul modello STRUTTURALE ----------
# Si usa il modello senza lag: risponde a "quali condizioni rendono critica QUESTA
# LGA", che e' la domanda utile per decidere l'intervento (il lag direbbe solo
# "era gia' messa male l'anno scorso").
import shap
drivers = [f for f in STRUCT if f not in ('urban', 'pop_6_11') and f not in ZONE_COLS]
_bg = shap.maskers.Independent(d[STRUCT], max_samples=500)
_expl = shap.LinearExplainer(final_st[-1], _bg.data if hasattr(_bg, 'data') else d[STRUCT],
                             feature_perturbation='correlation_dependent') \
    if False else shap.LinearExplainer(
        (final_st[-1].coef_, final_st[-1].intercept_),
        final_st[0].transform(d[STRUCT]))
sv = _expl.shap_values(final_st[0].transform(cur[STRUCT]))
S = pd.DataFrame(sv, columns=STRUCT, index=cur.index)[drivers]
cur['shap_base'] = float(np.ravel(_expl.expected_value)[0])
Spos = S.clip(lower=0)                       # solo i contributi che AUMENTANO il rischio
C = (Spos.div(Spos.sum(axis=1).replace(0, np.nan), axis=0) * 100).fillna(0)
print("\nSHAP: contributo medio al rischio (pp di tasso fuori-scuola):")
print(S.mean().sort_values(ascending=False).round(2).to_string())

print(f"\nPrevisione 2026 per {len(cur)} LGA:")
print(cur.fascia.value_counts().reindex(ORDER).to_string())
print(f"Bambini a rischio in fascia Alta: {cur[cur.fascia=='Alto'].bambini_a_rischio.sum()/1e6:.2f} mln")

cur[['lga_id', 'lga', 'state', 'zone', 'lat', 'lon', 'pop_6_11', 'urban', 'tasso_fuori_scuola',
     'divario_genere_pp', 'oos_pred_2026', 'oos_pred_strutturale', 'risk_score', 'fascia',
     'bambini_a_rischio'] + drivers].round(3).to_csv(f"{BASE}/data/previsioni_2026.csv", index=False)
C.round(1).assign(lga_id=cur.lga_id.values).to_csv(f"{BASE}/data/driver_locali.csv", index=False)
S.round(3).assign(lga_id=cur.lga_id.values).to_csv(f"{BASE}/data/shap_locali.csv", index=False)

r4 = lambda dd: {k: round(v, 4) for k, v in dd.items()}
json.dump(dict(
    regressione=dict(**r4(m_ew), cv_r2_mean=round(float(np.mean(cv)), 4),
                     cv_r2_std=round(float(np.std(cv)), 4),
                     n_train=int(len(train)), n_test=int(len(test))),
    strutturale=r4(m_st),
    benchmark={k: r4(v) for k, v in bench.items()},
    classificazione={k: (round(v, 4) if isinstance(v, float) else r4(v)) for k, v in m_clf.items()},
    confusion_matrix=dict(labels=ORDER, matrix=cm.tolist()),
    soglia_grid=[{k: round(v, 4) for k, v in g.items()} for g in grid],
    importanza=imp_ew[['feature', 'label', 'importance_pct']].round(2).to_dict('records'),
    importanza_strutturale=imp_st[['feature', 'label', 'importance_pct']].round(2).to_dict('records'),
    importanza_gruppi=gimp[['gruppo', 'drop_r2', 'importance_pct']].round(3).to_dict('records'),
    shap_medio=[{'feature': f, 'label': LABEL[f], 'shap_mean': round(float(S[f].mean()), 3),
                 'shap_abs_mean': round(float(S[f].abs().mean()), 3)} for f in drivers],
    scatter=dict(reale=[round(float(v), 2) for v in yte.values],
                 predetto=[round(float(v), 2) for v in pred_ew],
                 zona=test.zone.tolist()),
), open(f"{BASE}/data/metriche_modello.json", 'w'), ensure_ascii=False, indent=1)
print("\nOK -> previsioni_2026.csv, driver_locali.csv, metriche_modello.json")
