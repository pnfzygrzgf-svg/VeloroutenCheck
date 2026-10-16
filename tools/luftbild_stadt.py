#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────────────────────
# Radstreifen aus dem Luftbild (beliebige Stadt) → gebündelter Snapshot für den Rechner.
#
# Wie tools/luftbild_bern.py, aber direkt aus den Funden von _lokal/luftbild_erkennung/erkennen.py
# (funde_curriculum.jsonl, funde_paper.jsonl in einem Ordner je Stadt), ohne GeoPackage. Quelle:
# eigener Lauf des Modells «remote_velo» (ETH Zürich, Papini/Zani/Adey 2026, MIT-Lizenz) auf
# SWISSIMAGE 10 cm (© swisstopo), beide Modelle.
#
# Übernommen werden die Klassen «bike_lane» und «red_colored_bike_lane»; je Fund die MITTELLINIE
# des Fund-Rechtecks entlang der langen Seite (luftbild.ts liest daraus die Seite). Keine Breite,
# keine Sicherheitswerte, kein Abgleich mit dem ETH-Datensatz 2021 (InC-NC, nicht öffentlich).
#
# Erzeugt VeloroutenCheckWeb/public/luftbild_<stadt>.json =
#   { "quelle": "...", "flugjahre": [..], "linien": [[lon1, lat1, lon2, lat2], ...] }
#
# Braucht GDAL (osgeo). Aufruf:
#   python3 tools/luftbild_stadt.py <stadt> <ordner mit funde_*.jsonl>
#   z. B. python3 tools/luftbild_stadt.py zurich _lokal/luftbild_erkennung/zuerich
# ─────────────────────────────────────────────────────────────────────────────
import json, math, os, sys
from osgeo import osr

osr.UseExceptions()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KLASSEN = ("bike_lane", "red_colored_bike_lane")
MODELLE = ("curriculum", "paper")


def mittellinie(p):
    """Mittellinie eines Rechtecks (4 Ecken) entlang seiner langen Seite."""
    if math.dist(p[0], p[1]) >= math.dist(p[1], p[2]):
        return ((p[0][0] + p[3][0]) / 2, (p[0][1] + p[3][1]) / 2), ((p[1][0] + p[2][0]) / 2, (p[1][1] + p[2][1]) / 2)
    return ((p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2), ((p[3][0] + p[2][0]) / 2, (p[3][1] + p[2][1]) / 2)


def main():
    if len(sys.argv) != 3:
        sys.exit("Aufruf: python3 tools/luftbild_stadt.py <stadt> <ordner mit funde_*.jsonl>")
    stadt, ordner = sys.argv[1], sys.argv[2]
    lv95 = osr.SpatialReference(); lv95.ImportFromEPSG(2056)
    wgs = osr.SpatialReference(); wgs.ImportFromEPSG(4326)
    wgs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)   # lon, lat
    tr = osr.CoordinateTransformation(lv95, wgs)
    linien, jahre = [], set()
    for m in MODELLE:
        pfad = os.path.join(ordner, f"funde_{m}.jsonl")
        if not os.path.exists(pfad):
            sys.exit(f"{pfad} fehlt")
        for z in open(pfad, encoding="utf-8"):
            f = json.loads(z)
            if f["cls"] not in KLASSEN or len(f["poly"]) < 4:
                continue
            a, b = mittellinie(f["poly"][:4])
            (lon1, lat1, _), (lon2, lat2, _) = tr.TransformPoint(*a), tr.TransformPoint(*b)
            linien.append([round(lon1, 6), round(lat1, 6), round(lon2, 6), round(lat2, 6)])
            if f.get("jahr"):
                jahre.add(int(f["jahr"]))
    out = {
        "quelle": "Luftbild SWISSIMAGE 10 cm © swisstopo; Erkennung: Modell remote_velo, ETH Zürich "
                  "(MIT-Lizenz), eigener Lauf mit den Modellen curriculum und paper",
        "flugjahre": sorted(jahre),
        "linien": linien,
    }
    ziel = os.path.join(ROOT, "VeloroutenCheckWeb", "public", f"luftbild_{stadt}.json")
    with open(ziel, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(linien)} Radstreifen-Funde (Flugjahre {sorted(jahre)}) → {ziel}")


if __name__ == "__main__":
    main()
