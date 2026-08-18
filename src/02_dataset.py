"""
EduScout - Step 2: costruzione del dataset panel a livello LGA (2020-2025).

METODO
------
La geografia (774 LGA, 37 stati) e' REALE (geoBoundaries ADM2, Nigeria).
Gli indicatori a livello LGA sono SIMULATI ma ancorati a valori reali pubblicati
a livello nazionale e di zona geopolitica (UNICEF Nigeria, UNESCO UIS, World Bank).
Nessun dato micro-territoriale qui riportato deve essere usato come dato reale:
serve a dimostrare il funzionamento della pipeline EduScout.

ANCORE REALI USATE
------------------
- Tasso netto di frequenza primaria nazionale: 61%  (UNICEF Nigeria)
- Frequenza netta nel Nord: 53%                     (UNICEF Nigeria)
- Frequenza netta femminile: NE 47,7% / NW 47,3%    (UNICEF Nigeria)
- Bambini 5-14 fuori dalla scuola: ~10,5 mln        (UNICEF Nigeria)
- Bambini 6-11 fuori dalla scuola (% eta' primaria, 2023): 24,3%  (World Bank SE.PRM.UNER.ZS)
- Alfabetizzazione adulti 2024: 70,4%               (World Bank SE.ADT.LITR.ZS)
- Poverta' minorile multidimensionale: >90% NE/NW vs 65-74% Sud (UNICEF/NBS MPI)
- Educazione coranica esclusiva: 29% NE, 35% NW     (UNICEF Nigeria)
"""
import numpy as np, pandas as pd

BASE = "/root/eduscout"
RNG = np.random.default_rng(42)
YEARS = [2020, 2021, 2022, 2023, 2024, 2025]

idx = pd.read_csv(f"{BASE}/data/lga_index.csv")

# --- profili per zona geopolitica (ancorati ai dati reali citati sopra) -------
# oos = tasso di bambini 6-11 fuori dalla scuola (%), media di zona
ZP = {
    'North West':    dict(oos=50.5, pov=91, flit=35, dist=4.6, ptr=62, san=28, road=38, cl=32, conf=1.4, clim=58, qur=35, urb=0.24),
    'North East':    dict(oos=45.2, pov=90, flit=39, dist=4.2, ptr=58, san=31, road=41, cl=29, conf=3.6, clim=62, qur=29, urb=0.27),
    'North Central': dict(oos=28.0, pov=74, flit=57, dist=3.1, ptr=45, san=46, road=57, cl=21, conf=1.9, clim=45, qur=11, urb=0.38),
    'South West':    dict(oos=13.3, pov=65, flit=81, dist=1.7, ptr=36, san=68, road=79, cl=12, conf=0.5, clim=33, qur=3,  urb=0.68),
    'South East':    dict(oos= 7.6, pov=67, flit=84, dist=1.5, ptr=33, san=71, road=76, cl=10, conf=0.6, clim=31, qur=1,  urb=0.55),
    'South South':   dict(oos=15.0, pov=70, flit=78, dist=2.2, ptr=39, san=61, road=64, cl=15, conf=0.9, clim=52, qur=2,  urb=0.51),
}

def draw(mu, sd, n, lo, hi):
    return np.clip(RNG.normal(mu, sd, n), lo, hi)

n = len(idx)
zones = idx.zone.values

# effetto fisso di stato: cattura la varianza sub-zonale reale (es. Kano vs Kaduna)
state_fx = {s: RNG.normal(0, 5.0) for s in idx.state.unique()}
idx['state_fx'] = idx.state.map(state_fx)
# effetto fisso di LGA: eterogeneita' persistente non osservata
idx['lga_fx'] = RNG.normal(0, 4.2, n)

def zv(key):
    return np.array([ZP[z][key] for z in zones])

# popolazione 6-11 per LGA: log-normale, calibrata a ~34 mln di bambini in eta' primaria
pop = np.exp(RNG.normal(np.log(38000), 0.62, n))
pop = pop * (34_000_000 / pop.sum())
idx['pop_6_11'] = pop.round().astype(int)
idx['urban'] = (RNG.random(n) < zv('urb')).astype(int)

records = []
for yi, year in enumerate(YEARS):
    t = yi - 2.5
    d = pd.DataFrame(dict(year=year, lga_id=idx.lga_id, lga=idx.lga, state=idx.state,
                          zone=idx.zone, lat=idx.lat, lon=idx.lon,
                          pop_6_11=idx.pop_6_11, urban=idx.urban))

    urb = idx.urban.values
    # --- variabili esplicative ------------------------------------------------
    d['poverta_minorile']   = np.clip(draw(zv('pov'), 6.5, n, 30, 99) - 9*urb - 0.55*yi + idx.state_fx*0.5, 25, 99)
    d['alfab_femminile']    = np.clip(draw(zv('flit'), 9.0, n, 8, 98) + 11*urb + 0.75*yi + idx.state_fx*0.7, 5, 99)
    d['distanza_scuola_km'] = np.clip(draw(zv('dist'), 1.15, n, 0.3, 12) - 0.9*urb - 0.03*yi, 0.2, 12)
    d['rapporto_alunni_ins']= np.clip(draw(zv('ptr'), 9.5, n, 15, 110) + 4*urb - 0.35*yi, 14, 115)
    d['servizi_igienici_f'] = np.clip(draw(zv('san'), 12.0, n, 2, 98) + 9*urb + 1.1*yi, 1, 99)
    d['accesso_stradale']   = np.clip(draw(zv('road'), 13.0, n, 5, 99) + 15*urb + 0.9*yi, 3, 99)
    d['lavoro_minorile']    = np.clip(draw(zv('cl'), 6.5, n, 1, 60) - 5*urb - 0.3*yi, 0.5, 62)
    d['eventi_conflitto']   = np.clip(RNG.poisson(np.maximum(zv('conf')*(1+0.10*np.sin(yi)), 0.05)) + RNG.poisson(1.1*(zv('conf')>2)), 0, 40)
    d['shock_climatico']    = np.clip(draw(zv('clim'), 11.0, n, 0, 100) + 1.4*yi + 7*np.sin(yi*1.3), 0, 100)
    d['scuola_coranica']    = np.clip(draw(zv('qur'), 8.5, n, 0, 70) - 4*urb - 0.4*yi, 0, 72)
    d['acqua_potabile']     = np.clip(draw(np.array([ZP[z]['road'] for z in zones])+6, 12.0, n, 5, 99) + 12*urb + 1.0*yi, 3, 99)
    d['spesa_edu_procapite']= np.clip(np.exp(RNG.normal(np.log(np.maximum(9 + 0.16*zv('flit'), 3)), 0.42, n)) + 1.1*yi, 2, 120)

    # --- equazione strutturale del tasso di abbandono/non iscrizione ----------
    z = (
          0.310 * (d.poverta_minorile - 78)
        - 0.105 * (d.alfab_femminile - 60)
        + 2.750 * (d.distanza_scuola_km - 2.9)
        + 0.125 * (d.rapporto_alunni_ins - 46)
        - 0.175 * (d.servizi_igienici_f - 50)
        - 0.075 * (d.accesso_stradale - 59)
        + 0.330 * (d.lavoro_minorile - 20)
        + 0.980 * d.eventi_conflitto
        + 0.080 * (d.shock_climatico - 47)
        + 0.230 * (d.scuola_coranica - 14)
        - 0.055 * (d.acqua_potabile - 62)
        - 0.055 * (d.spesa_edu_procapite - 22)
        # interazioni non lineari (giustificano un modello ad alberi)
        + 0.055 * (d.distanza_scuola_km - 2.9) * np.maximum(0, 70 - d.alfab_femminile) / 10
        + 0.100 * np.maximum(0, d.poverta_minorile - 85) * (d.lavoro_minorile > 25)
        + idx.lga_fx.values * 0.55
    )
    # Il tasso NON riceve un livello di zona imposto dall'esterno: emerge dalle
    # variabili esplicative (e' esattamente la tesi di EduScout - il divario
    # Nord/Sud e' il risultato di poverta', distanza, alfabetizzazione femminile,
    # insicurezza, non una caratteristica geografica in se').
    # Si applica una sola calibrazione affine GLOBALE (a + b*z), stimata ai minimi
    # quadrati sulle 6 medie di zona pubblicate, per riportare la scala a valori
    # reali senza introdurre effetti fissi di zona.
    zser = pd.Series(np.asarray(z, dtype=float))
    zz_mean = zser.groupby(pd.Series(zones)).mean()
    anchors = pd.Series({k: ZP[k]['oos'] for k in zz_mean.index})
    b_cal, a_cal = np.polyfit(zz_mean.values, anchors.values, 1)
    oos = a_cal + b_cal * zser.values + RNG.normal(0, 4.0, n)  # rumore idiosincratico
    oos = oos - 0.65 * (yi - 2.5)                              # lieve trend nazionale in calo
    d['tasso_fuori_scuola'] = np.clip(oos, 0.8, 92)
    if yi == 0:
        print(f"  calibrazione affine globale: oos = {a_cal:.2f} + {b_cal:.3f} * z"
              f"  (R2 sulle 6 medie di zona: {np.corrcoef(zz_mean, anchors)[0,1]**2:.3f})")

    # divario di genere: piu' marcato dove mancano servizi igienici e alfab. femminile e' bassa
    gap = np.clip(0.30*(60 - d.alfab_femminile)/10 + 0.22*(60 - d.servizi_igienici_f)/10
                  + 0.12*d.scuola_coranica/10 + RNG.normal(0, 1.4, n), -3, 26)
    d['divario_genere_pp'] = gap.round(2)
    d['tasso_fuori_scuola_f'] = np.clip(d.tasso_fuori_scuola + gap*0.55, 0.5, 96)
    d['tasso_fuori_scuola_m'] = np.clip(d.tasso_fuori_scuola - gap*0.45, 0.3, 96)
    records.append(d)

panel = pd.concat(records, ignore_index=True)

# target predittivo: tasso dell'ANNO SUCCESSIVO (validazione temporale reale)
panel = panel.sort_values(['lga_id', 'year'])
panel['target_oos_t1'] = panel.groupby('lga_id')['tasso_fuori_scuola'].shift(-1)
panel['bambini_fuori_scuola'] = (panel.pop_6_11 * panel.tasso_fuori_scuola / 100).round().astype(int)

panel.round(3).to_csv(f"{BASE}/data/eduscout_panel.csv", index=False)

print(f"Righe: {len(panel)}  |  LGA: {panel.lga_id.nunique()}  |  anni: {sorted(panel.year.unique())}")
print(f"\nBambini 6-11 fuori dalla scuola (2025, simulato): "
      f"{panel[panel.year==2025].bambini_fuori_scuola.sum()/1e6:.2f} mln su "
      f"{panel[panel.year==2025].pop_6_11.sum()/1e6:.1f} mln")
print("\nTasso medio ponderato per zona (2025) vs ancora reale:")
p = panel[panel.year == 2025]
chk = p.groupby('zone').apply(
    lambda g: pd.Series({'simulato_%': np.average(g.tasso_fuori_scuola, weights=g.pop_6_11),
                         'ancora_%': ZP[g.name]['oos']}), include_groups=False)
print(chk.round(1))
print(f"\nNazionale simulato: {np.average(p.tasso_fuori_scuola, weights=p.pop_6_11):.1f}% "
      f"(World Bank 2023: 24,3% | UNICEF: 39% dei 6-11 non frequenta regolarmente)")
