#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────────────────────
# Bus-Takt je Haltestelle (Abendspitze) aus dem Schweizer GTFS → kompakte Stadt-Tabellen.
#
# Erzeugt pro Stadt eine Datei unter VeloroutenCheckWeb/public/:
#   Bern:                oev_takt_bern.json   = { "<didok/BPUIC>": busPerH }
#                        → Join im Rechner über den Geoportal-Haltestellen-Layer (Id_opendata = didok).
#   Zürich/Basel/Luzern: oev_takt_<stadt>.json = [ {"lat":.., "lon":.., "n": busPerH, "name":".."} ]
#                        → georeferenziert, weil dort die Haltestellen aus OSM stammen: Zuordnung im
#                          Rechner per NÄCHSTER Punkt (kein didok auf OSM-Seite).
#
# busPerH = Bus-Abfahrten 17:00–18:00 an der Haltestelle in der STÄRKSTEN Einzelrichtung
# (GTFS direction_id) — NICHT beide Richtungen summiert (die zwei Richtungs-Quays teilen dieselbe
# didok-Nummer). Repräsentativer Werktag (Di), kein Feiertag/Ferien. Snapshot — bei neuem GTFS neu laufen.
#
# Nur Python-stdlib. Aufruf:
#   python3 tools/oev_takt.py [GTFS-Ordner] [YYYYMMDD]     # generiert ALLE Städte
# ─────────────────────────────────────────────────────────────────────────────
import csv, json, sys, os, datetime
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GTFS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "Fahrplan", "gtfs_fp2026_20260620")
TARGET = sys.argv[2] if len(sys.argv) > 2 else "20260915"   # repräsentativer Di
PUBLIC = os.path.join(ROOT, "VeloroutenCheckWeb", "public")

# Der Default-Pfad ist ein lokaler Snapshot und liegt nicht im Repo — ohne klare Meldung
# endete ein frischer Checkout hier in einem FileNotFoundError tief im CSV-Code.
if not os.path.isdir(GTFS):
    sys.exit(
        f"GTFS-Ordner nicht gefunden: {GTFS}\n"
        "Aufruf: python3 tools/oev_takt.py <GTFS-Ordner> [YYYYMMDD]\n"
        "Jahres-GTFS von https://opentransportdata.swiss/ laden und entpackt angeben."
    )
PEAK_H = 17   # Abendspitze 17:00–18:00

# Stadt → (lat_min, lat_max, lon_min, lon_max, format).
#   'flat' = {didok: busPerH}  (Bern, Join über Geoportal-didok)
#   'geo'  = [{lat,lon,n,name}] (OSM-Städte, Zuordnung per Nächster-Punkt)
# Bbox grosszügig (Gemeindegebiet); Haltestellen ausserhalb werden im Rechner nie nachgeschlagen.
CITIES = {
    "bern":   (46.90, 47.00, 7.33, 7.55, "flat"),
    "zurich": (47.32, 47.43, 8.44, 8.63, "geo"),
    "basel":  (47.51, 47.60, 7.55, 7.66, "geo"),
    "luzern": (47.02, 47.09, 8.25, 8.36, "geo"),
}


def is_bus(rt: str) -> bool:
    try: n = int(rt)
    except ValueError: return False
    return n == 3 or (700 <= n <= 799)


def city_of(lat: float, lon: float):
    for name, (la, lb, lo, le, _) in CITIES.items():
        if la <= lat <= lb and lo <= lon <= le:
            return name
    return None


# 1) Stops in einer der Stadt-Bboxen: stop_id → didok; didok → repräsentativer Punkt/Name/Stadt.
stop_didok = {}          # stop_id → didok
didok_pt = {}            # didok → [lat, lon, name, city, is_station]
with open(os.path.join(GTFS, "stops.txt"), encoding="utf-8-sig", newline="") as f:
    for r in csv.DictReader(f):
        try:
            lat, lon = float(r["stop_lat"]), float(r["stop_lon"])
        except (ValueError, KeyError):
            continue
        city = city_of(lat, lon)
        if not city:
            continue
        didok = (r.get("didok") or "").strip()
        if not didok:
            continue
        stop_didok[r["stop_id"]] = didok
        is_station = r.get("location_type", "") == "1"
        cur = didok_pt.get(didok)
        if cur is None or (is_station and not cur[4]):   # Station bevorzugen, sonst erster Quay
            didok_pt[didok] = [lat, lon, (r.get("stop_name") or "").strip(), city, is_station]
print(f"Stops in Stadt-Bboxen: {len(stop_didok)} (didok: {len(didok_pt)})", file=sys.stderr)

# 2) stop_times.txt (gross) streamen: Abfahrten 17–18 h an diesen Stops. Felder gequotet, ohne
#    eingebettete Kommas → schnelles split statt csv.
need_trip_stop = []
need_trips = set()
with open(os.path.join(GTFS, "stop_times.txt"), encoding="utf-8-sig") as f:
    f.readline()
    for line in f:
        p = line.rstrip("\n").split(",")
        if len(p) < 4:
            continue
        if p[2].strip('"')[:3] != f"{PEAK_H:02d}:":   # nur 17:xx:xx
            continue
        sid = p[3].strip('"')
        if sid in stop_didok:
            tid = p[0].strip('"')
            need_trip_stop.append((tid, sid))
            need_trips.add(tid)
print(f"Abfahrten 17–18 h an diesen Stops: {len(need_trip_stop)} (Trips: {len(need_trips)})", file=sys.stderr)

# 3) trips.txt: route_id/service_id/direction_id.
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
wdcol = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][d.weekday()]
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
        if ex == "1": active.add(si)
        elif ex == "2": active.discard(si)
print(f"Stichtag {TARGET} ({wdcol}), aktive benötigte Services: {len(active)}", file=sys.stderr)

# 6) Aggregation: je (didok, Richtung) Bus-Abfahrten zählen; busPerH = stärkste Einzelrichtung.
per_dir = defaultdict(int)
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
        bus_per_h[didok] = n

# 7) Ausgabe je Stadt.
os.makedirs(PUBLIC, exist_ok=True)
for city, (la, lb, lo, le, fmt) in CITIES.items():
    items = {dk: n for dk, n in bus_per_h.items()
             if n > 0 and didok_pt.get(dk) and didok_pt[dk][3] == city}
    out = os.path.join(PUBLIC, f"oev_takt_{city}.json")
    if fmt == "flat":
        data = {k: v for k, v in sorted(items.items())}
        json.dump(data, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    else:
        arr = [{"lat": round(didok_pt[dk][0], 6), "lon": round(didok_pt[dk][1], 6),
                "n": n, "name": didok_pt[dk][2]}
               for dk, n in sorted(items.items())]
        json.dump(arr, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"→ {os.path.relpath(out, ROOT)}: {len(items)} Haltestellen ({fmt})", file=sys.stderr)
