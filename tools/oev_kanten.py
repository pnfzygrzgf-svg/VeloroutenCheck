#!/usr/bin/env python3
# ──────────────────────────────────────────────
# Bediente Haltekanten aus dem Schweizer GTFS → kompakte Tabellen für Zürich, Basel und Luzern.
#
# Erzeugt je Stadt VeloroutenCheckWeb/public/oev_kanten_<stadt>.json = { "<SLOID ohne ch:1:sloid:>": "b" | "t" | "bt" }.
# Die stop_id des Feeds ist die SLOID der Haltekante, dieselbe Nummer wie im BAV-Layer ch.bav.haltestellen-oev (nummer_text). Der Rechner
# nimmt nur Kanten aus dieser Tabelle: Der BAV-Layer führt auch Kanten ohne Fahrplan und Bahnkanten.
#   b = Bus oder Trolleybus, t = Tram, bt = beides. Gezählt wird jeder Halt im Feed, kein Stichtag.
# Snapshot: bei neuem GTFS neu laufen lassen. Rechnet zuerst alles und schreibt erst am Schluss.
#
# Nur Python-stdlib. Aufruf: python3 tools/oev_kanten.py [GTFS-Ordner]
# ──────────────────────────────────────────────
import csv, json, os, sys
from oev_takt import GTFS_DEFAULT, PUBLIC, city_of, is_bus

PREFIX = 'ch:1:sloid:'
TRAM = {'0', '900', '901', '902', '903', '904', '905', '906'}
STAEDTE = ('zurich', 'basel', 'luzern')


def zeilen(pfad):
    with open(pfad, encoding='utf-8-sig', newline='') as f:
        yield from csv.DictReader(f)


def main():
    gtfs = sys.argv[1] if len(sys.argv) > 1 else GTFS_DEFAULT
    stadt_von = {}
    for s in zeilen(os.path.join(gtfs, 'stops.txt')):
        if not s['stop_id'].startswith(PREFIX):
            continue
        c = city_of(float(s['stop_lat']), float(s['stop_lon']))
        if c in STAEDTE:
            stadt_von[s['stop_id']] = c
    art_route = {}
    for r in zeilen(os.path.join(gtfs, 'routes.txt')):
        t = r['route_type']
        art_route[r['route_id']] = 't' if t in TRAM else 'b' if is_bus(t) else ''
    art_trip = {}
    for t in zeilen(os.path.join(gtfs, 'trips.txt')):
        a = art_route.get(t['route_id'], '')
        if a:
            art_trip[t['trip_id']] = a
    kanten = {c: {} for c in STAEDTE}
    with open(os.path.join(gtfs, 'stop_times.txt'), encoding='utf-8-sig', newline='') as f:
        kopf = next(csv.reader(f))
        i_trip, i_stop = kopf.index('trip_id'), kopf.index('stop_id')
        for z in csv.reader(f):
            c = stadt_von.get(z[i_stop])
            a = art_trip.get(z[i_trip]) if c else None
            if a:
                k = z[i_stop][len(PREFIX):]
                alt = kanten[c].get(k, '')
                if a not in alt:
                    kanten[c][k] = ''.join(sorted(alt + a))
    for c in STAEDTE:
        if not kanten[c]:
            sys.exit(f'{c}: keine Kante gefunden, nichts geschrieben')
    for c in STAEDTE:
        with open(os.path.join(PUBLIC, f'oev_kanten_{c}.json'), 'w', encoding='utf-8') as f:
            json.dump(dict(sorted(kanten[c].items())), f, separators=(',', ':'))
        print(c, len(kanten[c]))


if __name__ == '__main__':
    main()
