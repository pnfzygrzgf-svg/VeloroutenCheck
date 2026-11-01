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
#                        EIN PUNKT JE HALTEKANTE (Quay), an der 17–18 h ein Bus abfährt — jeder trägt
#                          den Wert seiner Haltestelle. Bis zum 29.09.2026 stand je Haltestelle nur
#                          EIN Punkt (meist die Stationsmitte); an grossen Knoten liegen die Bus-
#                          kanten aber bis 200 m davon entfernt (Luzern Bahnhof 194 m, Zürich Messe/
#                          Hallenstadion 207 m), weit über der Zuordnungsgrenze von 80 m im Rechner —
#                          die OSM-Haltestelle bekam dort keinen oder den Takt einer Nachbarhaltestelle.
#
# busPerH = Bus-Abfahrten 17:00–18:00 an der Haltestelle in der STÄRKSTEN Einzelrichtung
# (GTFS direction_id) — NICHT beide Richtungen summiert (die zwei Richtungs-Quays teilen dieselbe
# didok-Nummer). Repräsentativer Werktag (Di), kein Feiertag/Ferien. Snapshot — bei neuem GTFS neu laufen.
# Halte ohne Einstieg (pickup_type = 1) sind keine Abfahrt und zählen nicht. ENDHALTESTELLEN
# erfasst das kaum: Der Schweizer Feed führt den letzten Halt eines Kurses in aller Regel mit
# pickup_type = 0 (FP2026: 1'454 Endhalte 17–18 h in den vier Städten, keiner mit 1). Ein Bus,
# der am Knoten seine Fahrt beendet, zählt darum als Abfahrt — Bahnhof Luzern 110 statt 74,
# Bern Bahnhof 87 statt 73. Bewusst so belassen (Nutzerentscheid 29.09.2026): an den grossen
# Umsteigeknoten ist der Takt zu hoch, bleibt aber meist im selben Band «Bus < 5 Min».
#
# SICHERUNG: Das Skript rechnet zuerst ALLES und schreibt erst am Schluss. Es bricht mit
# Exit-Code 1 ab, BEVOR eine Ausgabedatei angefasst wird, wenn der Stichtag ausserhalb der
# Feed-Gültigkeit liegt, kein Service aktiv ist oder eine Stadt keine Haltestelle ergäbe —
# sonst überschriebe ein falscher Stichtag die Snapshots still mit leeren Tabellen.
#
# Nur Python-stdlib. Aufruf:
#   python3 tools/oev_takt.py [GTFS-Ordner] [YYYYMMDD]     # generiert ALLE Städte
# ─────────────────────────────────────────────────────────────────────────────
import csv, json, sys, os, datetime
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GTFS_DEFAULT = os.path.join(ROOT, "Fahrplan", "gtfs_fp2026_20260620")
TARGET_DEFAULT = "20260915"   # repräsentativer Di
PUBLIC = os.path.join(ROOT, "VeloroutenCheckWeb", "public")

PEAK_H = 17   # Abendspitze 17:00–18:00
NUR_MIT_EINSTIEG = True   # Halte mit pickup_type = 1 (kein Einstieg) nicht als Abfahrt zählen

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


def abbruch(text):
    """Mit klarer Meldung und Exit-Code 1 abbrechen (sys.exit mit Text → stderr, Code 1)."""
    sys.exit(f"FEHLER: {text}")


def is_bus(rt: str) -> bool:
    try: n = int(rt)
    except ValueError: return False
    return n == 3 or (700 <= n <= 799)


def city_of(lat: float, lon: float):
    for name, (la, lb, lo, le, _) in CITIES.items():
        if la <= lat <= lb and lo <= lon <= le:
            return name
    return None


# ── Schnelles Lesen der grossen Dateien ──────────────────────────────────────
# stop_times.txt (> 2 GB) und calendar_dates.txt laufen über split(",") statt csv — aber die
# Spaltenpositionen kommen aus der KOPFZEILE (Spaltennamen), nicht aus festen Indizes: eine
# geänderte Spaltenreihenfolge ergäbe sonst still falsche Werte.
def spalten_index(kopfzeile, datei, pflicht, optional=()):
    """Kopfzeile → ({Spaltenname: Index}, Spaltenzahl). Fehlende Pflichtspalte → Abbruch."""
    namen = [n.strip().strip('"').strip()
             for n in kopfzeile.lstrip("﻿").rstrip("\r\n").split(",")]
    fehlt = [n for n in pflicht if n not in namen]
    if fehlt:
        abbruch(f"{datei}: Spalte(n) {', '.join(fehlt)} fehlen in der Kopfzeile "
                f"({', '.join(namen) or 'leer'}).")
    idx = {n: namen.index(n) for n in pflicht}
    for n in optional:
        idx[n] = namen.index(n) if n in namen else None
    return idx, len(namen)


def felder(line, n_spalten):
    """Eine Datenzeile → Feldliste (Anführungszeichen noch dran).

    Normalfall: Felder gequotet, ohne eingebettete Kommas → schnelles split. Stimmt die
    Feldzahl nicht mit der Kopfzeile überein (Komma in einem Feld), liest csv die Zeile korrekt.
    """
    p = line.rstrip("\r\n").split(",")
    if len(p) != n_spalten:
        p = next(csv.reader([line.rstrip("\r\n")]), [])
    return p


def pruefe_feed(gtfs, target):
    """Stichtag gegen feed_info.txt (feed_start_date … feed_end_date) prüfen, falls vorhanden."""
    pfad = os.path.join(gtfs, "feed_info.txt")
    if not os.path.isfile(pfad):
        print("feed_info.txt fehlt — Gültigkeit des Stichtags nicht geprüft.", file=sys.stderr)
        return
    with open(pfad, encoding="utf-8-sig", newline="") as f:
        info = next(csv.DictReader(f), None) or {}
    von = (info.get("feed_start_date") or "").strip()
    bis = (info.get("feed_end_date") or "").strip()
    if not von and not bis:
        print("feed_info.txt ohne feed_start_date/feed_end_date — Stichtag nicht geprüft.",
              file=sys.stderr)
        return
    if (von and target < von) or (bis and target > bis):
        abbruch(f"Stichtag {target} liegt ausserhalb der Feed-Gültigkeit "
                f"{von or '…'}–{bis or '…'} ({pfad}). Anderen Stichtag oder passendes GTFS wählen.")
    print(f"Feed gültig {von or '…'}–{bis or '…'}, Stichtag {target} liegt darin.", file=sys.stderr)


def berechne(gtfs, target, nur_mit_einstieg=None):
    """GTFS → {stadt: Ausgabeobjekt} für alle CITIES. Schreibt nichts; bricht bei Lücken ab."""
    if nur_mit_einstieg is None:
        nur_mit_einstieg = NUR_MIT_EINSTIEG
    try:
        d = datetime.datetime.strptime(target, "%Y%m%d").date()
    except ValueError:
        abbruch(f"Stichtag «{target}» ist kein Datum im Format YYYYMMDD.")
    pruefe_feed(gtfs, target)

    # 1) Stops in einer der Stadt-Bboxen: stop_id → didok; didok → repräsentativer Punkt/Name/Stadt.
    stop_didok = {}          # stop_id → didok
    stop_pt = {}             # stop_id → (lat, lon)  — Lage der einzelnen Haltekante
    didok_pt = {}            # didok → [lat, lon, name, city, is_station]
    with open(os.path.join(gtfs, "stops.txt"), encoding="utf-8-sig", newline="") as f:
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
            stop_pt[r["stop_id"]] = (lat, lon)
            is_station = r.get("location_type", "") == "1"
            cur = didok_pt.get(didok)
            if cur is None or (is_station and not cur[4]):   # Station bevorzugen, sonst erster Quay
                didok_pt[didok] = [lat, lon, (r.get("stop_name") or "").strip(), city, is_station]
    print(f"Stops in Stadt-Bboxen: {len(stop_didok)} (didok: {len(didok_pt)})", file=sys.stderr)

    # 2) stop_times.txt (gross) streamen: Abfahrten 17–18 h an diesen Stops.
    need_trip_stop = []
    need_trips = set()
    ohne_einstieg = 0
    peak = f"{PEAK_H:02d}:"
    with open(os.path.join(gtfs, "stop_times.txt"), encoding="utf-8-sig") as f:
        idx, n_sp = spalten_index(f.readline(), "stop_times.txt",
                                  ("trip_id", "departure_time", "stop_id"), ("pickup_type",))
        i_trip, i_dep, i_stop, i_pick = (idx["trip_id"], idx["departure_time"],
                                         idx["stop_id"], idx["pickup_type"])
        if i_pick is None:
            print("stop_times.txt ohne Spalte pickup_type — Endhalte werden mitgezählt.",
                  file=sys.stderr)
        for line in f:
            p = line.rstrip("\r\n").split(",")
            if len(p) != n_sp:
                p = felder(line, n_sp)
                if len(p) != n_sp:
                    continue
            if p[i_dep].strip('"')[:3] != peak:   # nur 17:xx:xx
                continue
            sid = p[i_stop].strip('"')
            if sid in stop_didok:
                # pickup_type = 1: kein Einstieg (Endhaltestelle) → keine Abfahrt.
                if nur_mit_einstieg and i_pick is not None and p[i_pick].strip('"') == "1":
                    ohne_einstieg += 1
                    continue
                tid = p[i_trip].strip('"')
                need_trip_stop.append((tid, sid))
                need_trips.add(tid)
    print(f"Abfahrten 17–18 h an diesen Stops: {len(need_trip_stop)} (Trips: {len(need_trips)}; "
          f"ohne Einstieg ausgelassen: {ohne_einstieg})", file=sys.stderr)

    # 3) trips.txt: route_id/service_id/direction_id.
    trip_info = {}
    with open(os.path.join(gtfs, "trips.txt"), encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            if r["trip_id"] in need_trips:
                trip_info[r["trip_id"]] = (r["route_id"], r["service_id"], r.get("direction_id", "0") or "0")

    # 4) routes.txt: route_id → ist Bus?
    route_bus = {}
    with open(os.path.join(gtfs, "routes.txt"), encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            route_bus[r["route_id"]] = is_bus(r["route_type"])

    # 5) Aktive service_ids am Stichtag (calendar.txt + calendar_dates.txt-Ausnahmen).
    wdcol = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][d.weekday()]
    need_services = {si for (_, si, _) in trip_info.values()}
    active = set()
    with open(os.path.join(gtfs, "calendar.txt"), encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            if r["service_id"] in need_services and r[wdcol] == "1" \
               and r["start_date"] <= target <= r["end_date"]:
                active.add(r["service_id"])
    with open(os.path.join(gtfs, "calendar_dates.txt"), encoding="utf-8-sig") as f:
        idx, n_sp = spalten_index(f.readline(), "calendar_dates.txt",
                                  ("service_id", "date", "exception_type"))
        i_si, i_dt, i_ex = idx["service_id"], idx["date"], idx["exception_type"]
        for line in f:
            p = line.rstrip("\r\n").split(",")
            if len(p) != n_sp:
                p = felder(line, n_sp)
                if len(p) != n_sp:
                    continue
            if p[i_dt].strip('"') != target:
                continue
            si = p[i_si].strip('"')
            if si not in need_services:
                continue
            ex = p[i_ex].strip('"')
            if ex == "1": active.add(si)
            elif ex == "2": active.discard(si)
    print(f"Stichtag {target} ({wdcol}), aktive benötigte Services: {len(active)}", file=sys.stderr)
    if not active:
        abbruch(f"Am Stichtag {target} ist kein einziger benötigter Service aktiv — "
                "Stichtag und GTFS-Stand passen nicht zusammen. Es wurde nichts geschrieben.")

    # 6) Aggregation: je (didok, Richtung) Bus-Abfahrten zählen; busPerH = stärkste Einzelrichtung.
    #    Nebenbei: welche Haltekanten (stop_id) bedienen diese Bus-Abfahrten? → Punkte der Ausgabe.
    per_dir = defaultdict(int)
    bus_kanten = defaultdict(set)   # didok → {stop_id der Kanten mit Bus-Abfahrt}
    for tid, sid in need_trip_stop:
        info = trip_info.get(tid)
        if not info:
            continue
        route_id, service_id, direction = info
        if service_id not in active or not route_bus.get(route_id):
            continue
        per_dir[(stop_didok[sid], direction)] += 1
        bus_kanten[stop_didok[sid]].add(sid)
    bus_per_h = defaultdict(int)
    for (didok, _), n in per_dir.items():
        if n > bus_per_h[didok]:
            bus_per_h[didok] = n

    # 7) Ausgabeobjekt je Stadt — noch OHNE Schreibzugriff.
    ergebnis = {}
    for city, (la, lb, lo, le, fmt) in CITIES.items():
        items = {dk: n for dk, n in bus_per_h.items()
                 if n > 0 and didok_pt.get(dk) and didok_pt[dk][3] == city}
        if fmt == "flat":
            ergebnis[city] = {k: v for k, v in sorted(items.items())}
        else:
            # Ein Punkt je Bus-Haltekante (gleiche Lage nur einmal); der Wert ist der der Haltestelle.
            punkte = []
            for dk, n in sorted(items.items()):
                lagen = sorted({(round(stop_pt[sid][0], 6), round(stop_pt[sid][1], 6))
                                for sid in bus_kanten[dk] if sid in stop_pt})
                if not lagen:   # (kommt nicht vor: jede gezählte Abfahrt hat eine Kante)
                    lagen = [(round(didok_pt[dk][0], 6), round(didok_pt[dk][1], 6))]
                punkte += [{"lat": la_, "lon": lo_, "n": n, "name": didok_pt[dk][2]} for la_, lo_ in lagen]
            ergebnis[city] = punkte
    leer = [city for city, data in ergebnis.items() if not data]
    if leer:
        abbruch(f"Keine Haltestelle mit Bus-Abfahrten für: {', '.join(leer)} "
                f"(Stichtag {target}). Es wurde nichts geschrieben.")
    return ergebnis


def main():
    gtfs = sys.argv[1] if len(sys.argv) > 1 else GTFS_DEFAULT
    target = sys.argv[2] if len(sys.argv) > 2 else TARGET_DEFAULT

    # Der Default-Pfad ist ein lokaler Snapshot und liegt nicht im Repo — ohne klare Meldung
    # endete ein frischer Checkout hier in einem FileNotFoundError tief im CSV-Code.
    if not os.path.isdir(gtfs):
        sys.exit(
            f"GTFS-Ordner nicht gefunden: {gtfs}\n"
            "Aufruf: python3 tools/oev_takt.py <GTFS-Ordner> [YYYYMMDD]\n"
            "Jahres-GTFS von https://opentransportdata.swiss/ laden und entpackt angeben."
        )

    ergebnis = berechne(gtfs, target)     # bricht bei Lücken ab, bevor geschrieben wird

    os.makedirs(PUBLIC, exist_ok=True)
    for city, data in ergebnis.items():
        out = os.path.join(PUBLIC, f"oev_takt_{city}.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        einheit = "Haltestellen" if CITIES[city][4] == "flat" else \
            f"Haltekanten-Punkte von {len({(x['name'], x['n']) for x in data})} Haltestellen"
        print(f"→ {os.path.relpath(out, ROOT)}: {len(data)} {einheit} ({CITIES[city][4]})",
              file=sys.stderr)


if __name__ == "__main__":
    main()
