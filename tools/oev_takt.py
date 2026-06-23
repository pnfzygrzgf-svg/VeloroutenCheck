#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────────────────────
# Bus-Takt je Haltestelle (Abendspitze) aus dem Schweizer GTFS → kompakte Bern-Tabelle.
#
# Erzeugt VeloroutenCheckWeb/public/oev_takt_bern.json: { "<BPUIC/didok>": busPerH, ... }
# busPerH = Anzahl Bus-Abfahrten 17:00–18:00 an der Haltestelle, in der STAERKSTEN (meistbefahrenen) EINZELRICHTUNG
# (per GTFS direction_id) — NICHT beide Richtungen summiert (sonst Verdopplung; die zwei
# Richtungs-Quays teilen sich dieselbe didok-Nummer = Join-Schlüssel zur Geoportal-Id_opendata).
#
# Bezug: ein repräsentativer Werktag (Di), kein Feiertag/Ferien. Snapshot — bei neuem GTFS neu laufen.
# Nur Python-stdlib. Aufruf:
#   python3 tools/oev_takt.py "<GTFS-Ordner>" [ZIELDATEI] [YYYYMMDD]
# ─────────────────────────────────────────────────────────────────────────────
import csv, json, sys, os, datetime

GTFS = sys.argv[1] if len(sys.argv) > 1 else \
    "/Users/dmnk/Documents/VeloroutenCheck/Fahrplan/gtfs_fp2026_20260620"
OUT = sys.argv[2] if len(sys.argv) > 2 else \
    "/Users/dmnk/Documents/VeloroutenCheck/VeloroutenCheckWeb/public/oev_takt_bern.json"
TARGET = sys.argv[3] if len(sys.argv) > 3 else "20260915"   # repräsentativer Di

# Bern (Gemeindegebiet, grosszügig); Haltestellen ausserhalb werden ohnehin nie nachgeschlagen.
LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = 46.90, 47.00, 7.33, 7.55
PEAK_H = 17   # Abendspitze 17:00–18:00

def is_bus(rt: str) -> bool:
    try: n = int(rt)
    except ValueError: return False
    return n == 3 or (700 <= n <= 799)

# 1) Bern-Stops aus stops.txt: stop_id → didok (BPUIC). Departures liegen an den Quays.
stop_didok = {}
with open(os.path.join(GTFS, "stops.txt"), encoding="utf-8-sig", newline="") as f:
    for r in csv.DictReader(f):
        try:
            lat, lon = float(r["stop_lat"]), float(r["stop_lon"])
        except (ValueError, KeyError):
            continue
        if LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX:
            didok = (r.get("didok") or "").strip()
            if didok:
                stop_didok[r["stop_id"]] = didok
print(f"Bern-Stops (Quays/Stationen): {len(stop_didok)}", file=sys.stderr)

# 2) stop_times.txt (gross) streamen: Abfahrten 17–18 h an Bern-Stops. Felder sind gequotet,
#    ohne eingebettete Kommas → schnelles split statt csv.
need_trip_stop = []   # (trip_id, stop_id)
need_trips = set()
with open(os.path.join(GTFS, "stop_times.txt"), encoding="utf-8-sig") as f:
    f.readline()  # Header
    for line in f:
        p = line.rstrip("\n").split(",")
        if len(p) < 4:
            continue
        dep = p[2].strip('"')
        if dep[:3] != f"{PEAK_H:02d}:":   # nur 17:xx:xx
            continue
        sid = p[3].strip('"')
        if sid in stop_didok:
            tid = p[0].strip('"')
            need_trip_stop.append((tid, sid))
            need_trips.add(tid)
print(f"Abfahrten 17–18 h an Bern-Stops: {len(need_trip_stop)} (Trips: {len(need_trips)})", file=sys.stderr)

# 3) trips.txt: für benötigte Trips route_id/service_id/direction_id.
trip_info = {}
with open(os.path.join(GTFS, "trips.txt"), encoding="utf-8-sig", newline="") as f:
    for r in csv.DictReader(f):
        if r["trip_id"] in need_trips:
            trip_info[r["trip_id"]] = (r["route_id"], r["service_id"], r.get("direction_id", "0") or "0")

# 4) routes.txt: route_id → ist Bus?
route_bus = {}
with open(os.path.join(GTFS, "routes.txt"), encoding="utf-8-sig", newline="") as f:
    for r in csv.DictReader(f):
        route_bus[r["route_id"]] = is_bus(r["route_type"])

# 5) Aktive service_ids am Stichtag (calendar.txt + calendar_dates.txt-Ausnahmen).
d = datetime.datetime.strptime(TARGET, "%Y%m%d").date()
wd = d.weekday()   # Mo=0 … So=6
wdcol = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][wd]
need_services = {si for (_, si, _) in trip_info.values()}
active = set()
with open(os.path.join(GTFS, "calendar.txt"), encoding="utf-8-sig", newline="") as f:
    for r in csv.DictReader(f):
        if r["service_id"] in need_services and r[wdcol] == "1" \
           and r["start_date"] <= TARGET <= r["end_date"]:
            active.add(r["service_id"])
with open(os.path.join(GTFS, "calendar_dates.txt"), encoding="utf-8-sig") as f:
    f.readline()
    for line in f:
        p = line.rstrip("\n").split(",")
        if len(p) < 3:
            continue
        si, dt, ex = p[0].strip('"'), p[1].strip('"'), p[2].strip('"')
        if dt != TARGET or si not in need_services:
            continue
        if ex == "1": active.add(si)        # zusätzlich verkehrend
        elif ex == "2": active.discard(si)  # ausfallend
print(f"Stichtag {TARGET} ({wdcol}), aktive benötigte Services: {len(active)}", file=sys.stderr)

# 6) Aggregation: je (didok, Richtung) Bus-Abfahrten zählen; busPerH = staerkste Richtung.
from collections import defaultdict
per_dir = defaultdict(int)   # (didok, direction_id) → Anzahl
for tid, sid in need_trip_stop:
    info = trip_info.get(tid)
    if not info:
        continue
    route_id, service_id, direction = info
    if service_id not in active or not route_bus.get(route_id):
        continue
    per_dir[(stop_didok[sid], direction)] += 1

bus_per_h = defaultdict(int)
for (didok, _), n in per_dir.items():
    if n > bus_per_h[didok]:
        bus_per_h[didok] = n   # staerkste Einzelrichtung

out = {k: v for k, v in sorted(bus_per_h.items()) if v > 0}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print(f"→ {OUT}: {len(out)} Haltestellen mit Bus-Takt", file=sys.stderr)
# Stichprobe Tavelweg
if "8590037" in out:
    print(f"  Tavelweg (8590037): busPerH={out['8590037']}", file=sys.stderr)
