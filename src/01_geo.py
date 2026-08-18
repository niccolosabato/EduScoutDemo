"""EduScout - Step 1: geografia reale (774 LGA / 37 stati) + semplificazione poligoni."""
import json, math
from shapely.geometry import shape, Point, mapping
from shapely.ops import unary_union

BASE = "/root/eduscout"

ZONE = {
 'North West': ['Jigawa','Kaduna','Kano','Katsina','Kebbi','Sokoto','Zamfara'],
 'North East': ['Adamawa','Bauchi','Borno','Gombe','Taraba','Yobe'],
 'North Central': ['Benue','Kogi','Kwara','Nasarawa','Niger','Plateau','FCT'],
 'South West': ['Ekiti','Lagos','Ogun','Ondo','Osun','Oyo'],
 'South East': ['Abia','Anambra','Ebonyi','Enugu','Imo'],
 'South South': ['Akwa Ibom','Bayelsa','Cross River','Delta','Edo','Rivers'],
}
STATE2ZONE = {s: z for z, ss in ZONE.items() for s in ss}

adm1 = json.load(open(f"{BASE}/adm1.geojson"))
adm2 = json.load(open(f"{BASE}/adm2.geojson"))

states = []
for f in adm1['features']:
    name = f['properties']['shapeName']
    if name.startswith('Abuja'):
        name = 'FCT'
    states.append((name, shape(f['geometry'])))

def assign(geom):
    """Assegna l'LGA allo stato con maggiore sovrapposizione di area."""
    c = geom.representative_point()
    for n, g in states:
        if g.contains(c):
            return n
    best, ba = None, -1.0
    for n, g in states:
        if not g.intersects(geom):
            continue
        a = g.intersection(geom).area
        if a > ba:
            best, ba = n, a
    if best:
        return best
    return min(states, key=lambda ng: ng[1].distance(c))[0]

def simplify(geom, tol):
    g = geom.simplify(tol, preserve_topology=True)
    if g.is_empty or not g.is_valid:
        g = geom.simplify(tol / 2, preserve_topology=True).buffer(0)
    return g

def round_geom(gj, nd=3):
    def r(c):
        if isinstance(c[0], (int, float)):
            return [round(c[0], nd), round(c[1], nd)]
        return [r(x) for x in c]
    gj['coordinates'] = r(gj['coordinates'])
    return gj

out_feats, rows = [], []
for f in adm2['features']:
    geom = shape(f['geometry'])
    if not geom.is_valid:
        geom = geom.buffer(0)
    lga = f['properties']['shapeName']
    st = assign(geom)
    simp = simplify(geom, 0.012)
    if simp.is_empty:
        simp = geom
    c = geom.representative_point()
    rows.append(dict(lga_id=f['properties']['shapeID'], lga=lga, state=st,
                     zone=STATE2ZONE[st], lon=round(c.x, 4), lat=round(c.y, 4),
                     area_km2=round(geom.area * 111.32 * 111.32 * math.cos(math.radians(c.y)), 1)))
    out_feats.append({"type": "Feature",
                      "properties": {"id": f['properties']['shapeID']},
                      "geometry": round_geom(mapping(simp))})

json.dump({"type": "FeatureCollection", "features": out_feats},
          open(f"{BASE}/data/lga_shapes.geojson", 'w'), separators=(',', ':'))

# contorni di stato semplificati per il layer di riferimento
st_feats = []
for n, g in states:
    st_feats.append({"type": "Feature", "properties": {"state": n, "zone": STATE2ZONE[n]},
                     "geometry": round_geom(mapping(simplify(g, 0.03)))})
json.dump({"type": "FeatureCollection", "features": st_feats},
          open(f"{BASE}/data/state_shapes.geojson", 'w'), separators=(',', ':'))

import pandas as pd
df = pd.DataFrame(rows)
df.to_csv(f"{BASE}/data/lga_index.csv", index=False)
print("LGA totali:", len(df))
print(df.groupby('zone').agg(lga=('lga', 'size'), stati=('state', 'nunique')))
print("\nControllo conteggi per stato (top 6):")
print(df.state.value_counts().head(6).to_dict())
import os
print("geojson LGA:", os.path.getsize(f"{BASE}/data/lga_shapes.geojson") // 1024, "KB")
