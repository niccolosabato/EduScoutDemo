"""EduScout - Step 5: pacchetto dati compatto per la dashboard (JSON inline)."""
import json, numpy as np, pandas as pd

B = "/root/eduscout"
pred = pd.read_csv(f"{B}/data/previsioni_2026.csv")
shap_l = pd.read_csv(f"{B}/data/shap_locali.csv").set_index('lga_id').reindex(pred.lga_id)
met = json.load(open(f"{B}/data/metriche_modello.json"))
sce = json.load(open(f"{B}/data/scenari_budget.json"))
geo = json.load(open(f"{B}/data/lga_shapes.geojson"))
stg = json.load(open(f"{B}/data/state_shapes.geojson"))
panel = pd.read_csv(f"{B}/data/eduscout_panel.csv")

DRIVERS = list(shap_l.columns)
LBL = {r['feature']: r['label'] for r in met['importanza_strutturale']}

# --- tabella LGA in formato colonnare (molto piu' compatto del JSON a oggetti)
pred = pred.sort_values('risk_score', ascending=False).reset_index(drop=True)
shap_l = shap_l.reindex(pred.lga_id)
ids = pred.lga_id.tolist()
states = sorted(pred.state.unique()); zones = sorted(pred.zone.unique())
FASCE = ['Alto', 'Medio', 'Basso']

lga = dict(
    id=ids,
    nome=pred.lga.tolist(),
    st=[states.index(s) for s in pred.state],
    zn=[zones.index(z) for z in pred.zone],
    pop=pred.pop_6_11.tolist(),
    urb=pred.urban.tolist(),
    oos=[round(v, 1) for v in pred.tasso_fuori_scuola],
    pre=[round(v, 1) for v in pred.oos_pred_2026],
    score=[round(v, 1) for v in pred.risk_score],
    fa=[FASCE.index(f) for f in pred.fascia],
    kids=pred.bambini_a_rischio.tolist(),
    gap=[round(v, 1) for v in pred.divario_genere_pp],
    feat={d: [round(float(v), 2) for v in pred[d]] for d in DRIVERS},
    shap={d: [round(float(v), 2) for v in shap_l[d]] for d in DRIVERS},
)

# serie storica nazionale e per zona
hist = (panel.groupby(['year', 'zone'])
        .apply(lambda g: np.average(g.tasso_fuori_scuola, weights=g.pop_6_11), include_groups=False)
        .unstack().round(2))
naz = (panel.groupby('year')
       .apply(lambda g: np.average(g.tasso_fuori_scuola, weights=g.pop_6_11), include_groups=False).round(2))

# distribuzione dei driver principali
top_driver = shap_l.clip(lower=0).idxmax(axis=1).value_counts()

payload = dict(
    meta=dict(anno_previsione=2026, n_lga=len(pred), stati=states, zone=zones, fasce=FASCE,
              drivers=DRIVERS, driver_label=LBL,
              soglia_alto=met['classificazione']['soglia_alto'],
              tot_bambini=int(pred.pop_6_11.sum()),
              tot_fuori=int(pred.bambini_a_rischio.sum())),
    lga=lga,
    metriche=met,
    scenari=sce,
    storico=dict(anni=[int(y) for y in naz.index], nazionale=naz.tolist(),
                 zone={c: hist[c].tolist() for c in hist.columns}),
    top_driver=[dict(feature=k, label=LBL.get(k, k), n=int(v)) for k, v in top_driver.items()],
    geo=geo, stati_geo=stg,
)
json.dump(payload, open(f"{B}/data/payload.json", 'w'), ensure_ascii=False, separators=(',', ':'))
import os
print(f"payload.json: {os.path.getsize(f'{B}/data/payload.json')/1024:.0f} KB")
print(f"LGA {len(pred)} | fasce {pred.fascia.value_counts().to_dict()}")
print(f"Bambini fuori dalla scuola (previsti 2026): {pred.bambini_a_rischio.sum()/1e6:.2f} mln")
