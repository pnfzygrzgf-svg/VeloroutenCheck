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
# TAGESGRENZE: massgebend ist der LOKALE Kalendertag (Feld `date`, TT.MM.JJJJ, mit `hourfrom`),
#   nicht `datetimefrom` — das ist UTC, der UTC-Tag läuft lokal von 02:00 bis 02:00 (Sommerzeit)
#   und schöbe die ersten Stunden des Samstags in den Freitag.
# VOLLSTÄNDIGKEIT: Der Datensatz führt je Zählstelle eine Zeile pro SPUR und Stunde. Ein Tag
#   zählt nur, wenn JEDE Spur der Zählstelle an diesem Tag alle 24 Stundenwerte liefert —
#   sonst wäre die Tagessumme zu tief und zöge das Mittel nach unten.
# NULL-TAGE: Ein Werktag mit Tagessumme 0 ist ein Zählerausfall, kein verkehrsfreier Tag — er
#   zählt nicht (seit 29.09.2026; vorher drückten solche Tage das Mittel einzelner Stationen um
#   6 bis 15 %, z. B. LSA 144 Arnold Böcklin-Strasse mit 2 von 15 Tagen auf 0).
# DEFEKTE ZÄHLER: Zählstellen ohne einen einzigen Tag mit Verkehr kommen nicht in den Snapshot
#   (der Rechner nähme die 0 sonst als gemessenen Wert).
#
# Nur Python-stdlib. Aufruf: python3 tools/dtv_basel.py
# ─────────────────────────────────────────────────────────────────────────────
import json, os, sys, urllib.request, urllib.parse, datetime
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "VeloroutenCheckWeb", "public", "dtv_basel.json")
BASE = "https://data.bs.ch/api/explore/v2.1/catalog/datasets/100006"
FENSTER_TAGE = 28
FELDER = "sitecode,sitename,geo_point_2d,date,hourfrom,directionname,lanecode,total"


def get(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        return json.load(r)


def q(path, **params):
    return f"{BASE}/{path}?" + urllib.parse.urlencode(params)


def lokaler_tag(text):
    """Feld `date` (TT.MM.JJJJ, Lokalzeit) → datetime.date; None bei unlesbarem Wert."""
    try:
        return datetime.datetime.strptime(text, "%d.%m.%Y").date()
    except (TypeError, ValueError):
        return None


def lade():
    """Stundenwerte des jüngsten 28-Tage-Fensters laden → (Datensätze, erster lokaler Tag)."""
    # 1) Jüngstes Datum bestimmen → 28-Tage-Fenster.
    m = get(q("records", select="max(datetimefrom) as m", limit=1))["results"][0]["m"]
    end = datetime.datetime.fromisoformat(m.replace("Z", "+00:00")).date()
    start = end - datetime.timedelta(days=FENSTER_TAGE)
    # Der Filter läuft über `datetimefrom` (UTC), ausgewertet wird der lokale Tag: einen Tag
    # früher abholen, damit der erste lokale Tag des Fensters ab 00:00 vollständig ist.
    ab = start - datetime.timedelta(days=1)
    where = f"datetimefrom >= date'{ab.isoformat()}' and traffictype = 'MIV'"
    print(f"Fenster {start} … {end} (lokale Tage)", file=sys.stderr)

    # 2) Alle Stundenwerte im Fenster in EINEM Export ziehen (keine Pagination nötig).
    recs = get(q("exports/json", select=FELDER, where=where))
    print(f"Datensätze: {len(recs)}", file=sys.stderr)
    return recs, start


def berechne(recs, start=None):
    """Stundenwerte → Liste [{lat, lon, dtv, name}], absteigend nach DTV. Schreibt nichts."""
    # 3) Je (Station, lokaler Tag, Spur) Stundenwerte sammeln; Koordinate/Name behalten.
    stunden = defaultdict(list)      # (sitecode, Tag, Spur) → [hourfrom, …]
    summe = defaultdict(float)       # (sitecode, Tag) → Summe total
    spuren = defaultdict(set)        # sitecode → alle Spuren im Fenster
    meta = {}                        # sitecode → (lat, lon, name)
    for r in recs:
        sc = r.get("sitecode")
        tag = lokaler_tag(r.get("date"))
        std = r.get("hourfrom")
        tot = r.get("total")
        if not sc or tag is None or std is None or tot is None:
            continue
        if start is not None and tag < start:
            continue                 # Vorlauf-Tag des UTC-Filters (s. lade)
        if tag.weekday() >= 5:       # nur Mo–Fr
            continue
        spur = (r.get("directionname"), r.get("lanecode"))
        stunden[(sc, tag, spur)].append(int(std))
        summe[(sc, tag)] += float(tot)
        spuren[sc].add(spur)
        if sc not in meta:
            g = r.get("geo_point_2d") or {}
            lat = g.get("lat") if isinstance(g, dict) else None
            lon = g.get("lon") if isinstance(g, dict) else None
            if lat is None and isinstance(g, (list, tuple)) and len(g) == 2:
                lat, lon = g[0], g[1]
            meta[sc] = (lat, lon, (r.get("sitename") or "").strip())

    # 4) Nur vollständige Tage: jede Spur der Zählstelle mit genau den Stunden 0…23.
    #    Tage mit Tagessumme 0 sind Zählerausfälle und zählen ebenfalls nicht.
    voll = list(range(24))
    per_station = defaultdict(list)
    unvollstaendig = null_tage = 0
    for (sc, tag), s in summe.items():
        if not all(sorted(stunden.get((sc, tag, spur), [])) == voll for spur in spuren[sc]):
            unvollstaendig += 1
        elif s <= 0:
            null_tage += 1
        else:
            per_station[sc].append(s)
    print(f"Werktage: {len(summe)} Stations-Tage, davon unvollständig verworfen: {unvollstaendig}, "
          f"mit Tagessumme 0 verworfen: {null_tage}", file=sys.stderr)

    # 5) Wochentags-Mittel je Zählstelle; defekte Zähler (DTV 0) und Stationen ohne
    #    vollständigen Tag auslassen — mit Meldung, damit der Ausfall nicht still bleibt.
    out = []
    for sc in sorted(spuren):
        lat, lon, name = meta.get(sc, (None, None, ""))
        days = per_station.get(sc, [])
        if lat is None or lon is None:
            print(f"  ausgelassen (keine Koordinate): {name or sc}", file=sys.stderr)
            continue
        if not days:
            print(f"  ausgelassen (kein vollständiger Werktag mit Verkehr — Zähler defekt?): {name or sc}",
                  file=sys.stderr)
            continue
        dtv = round(sum(days) / len(days))     # Mittel der Werktags-Tagesverkehre
        out.append({"lat": round(lat, 6), "lon": round(lon, 6), "dtv": dtv, "name": name})

    out.sort(key=lambda x: -x["dtv"])
    return out


def main():
    recs, start = lade()
    out = berechne(recs, start)
    if not out:
        sys.exit("FEHLER: keine Zählstelle mit DTV — Snapshot wird NICHT überschrieben.")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"→ {os.path.relpath(OUT, ROOT)}: {len(out)} Zählstellen mit DTV", file=sys.stderr)
    print(f"  Top: {out[0]['name']} DTV={out[0]['dtv']}", file=sys.stderr)


if __name__ == "__main__":
    main()
