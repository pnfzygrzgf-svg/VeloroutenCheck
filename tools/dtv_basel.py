#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────────────────────
# DTV je Verkehrszählstelle Basel-Stadt → gebündelter Snapshot für den Rechner.
#
# Quelle: data.bs.ch Dataset 100006 „Verkehrszähldaten MIV" (Opendatasoft, CORS-offen).
# Basel liefert Stundenwerte (kein fertiger DTV-Layer) → hier zu einem Wochentags-Mittel des
# Tagesverkehrs je Zählstelle aggregiert. Zürich/Luzern beziehen ihr DTV live (Punkt-Layer mit
# DTV-Feld); Basel nur, weil die In-Browser-Aggregation zu fragil wäre.
#
# Erzeugt VeloroutenCheckWeb/public/dtv_basel.json = [ {"lat":.., "lon":.., "dtv":.., "name":".."} ]
# → im Rechner der geladenen Strasse per nächster Station (≤ 25 m) zugeordnet.
#
# Nur Python-stdlib. Aufruf: python3 tools/dtv_basel.py
# ─────────────────────────────────────────────────────────────────────────────
import json, os, sys, urllib.request, urllib.parse, datetime
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "VeloroutenCheckWeb", "public", "dtv_basel.json")
BASE = "https://data.bs.ch/api/explore/v2.1/catalog/datasets/100006"


def get(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        return json.load(r)


def q(path, **params):
    return f"{BASE}/{path}?" + urllib.parse.urlencode(params)


# 1) Jüngstes Datum bestimmen → 28-Tage-Fenster.
m = get(q("records", select="max(datetimefrom) as m", limit=1))["results"][0]["m"]
end = datetime.datetime.fromisoformat(m.replace("Z", "+00:00")).date()
start = end - datetime.timedelta(days=28)
where = f"datetimefrom >= date'{start.isoformat()}' and traffictype = 'MIV'"
print(f"Fenster {start} … {end}", file=sys.stderr)

# 2) Alle Stundenwerte im Fenster in EINEM Export ziehen (keine Pagination nötig).
url = q("exports/json", select="sitecode,sitename,geo_point_2d,datetimefrom,total", where=where)
recs = get(url)
print(f"Datensätze: {len(recs)}", file=sys.stderr)

# 3) Je (Station, Tag) Tagesverkehr summieren; Wochentags-Mittel bilden; Koordinate/Name behalten.
day_sum = defaultdict(float)     # (sitecode, date) → Summe total
meta = {}                        # sitecode → (lat, lon, name)
for r in recs:
    sc = r.get("sitecode")
    dt = r.get("datetimefrom")
    tot = r.get("total")
    if not sc or not dt or tot is None:
        continue
    d = dt[:10]
    wd = datetime.date.fromisoformat(d).weekday()
    if wd >= 5:                  # nur Mo–Fr
        continue
    day_sum[(sc, d)] += float(tot)
    if sc not in meta:
        g = r.get("geo_point_2d") or {}
        lat = g.get("lat") if isinstance(g, dict) else None
        lon = g.get("lon") if isinstance(g, dict) else None
        if lat is None and isinstance(g, (list, tuple)) and len(g) == 2:
            lat, lon = g[0], g[1]
        meta[sc] = (lat, lon, (r.get("sitename") or "").strip())

per_station = defaultdict(list)
for (sc, _), s in day_sum.items():
    per_station[sc].append(s)

out = []
for sc, days in per_station.items():
    lat, lon, name = meta.get(sc, (None, None, ""))
    if lat is None or lon is None or not days:
        continue
    dtv = round(sum(days) / len(days))     # Mittel der Werktags-Tagesverkehre
    out.append({"lat": round(lat, 6), "lon": round(lon, 6), "dtv": dtv, "name": name})

out.sort(key=lambda x: -x["dtv"])
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"→ {os.path.relpath(OUT, ROOT)}: {len(out)} Zählstellen mit DTV", file=sys.stderr)
if out:
    print(f"  Top: {out[0]['name']} DTV={out[0]['dtv']}", file=sys.stderr)
