#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────────────────────
# Radstreifen aus dem Luftbild (Stadt Bern) → gebündelter Snapshot für den Rechner.
#
# Quelle: eigener Lauf des Modells «remote_velo» (ETH Zürich, Papini/Zani/Adey 2026, MIT-Lizenz)
# auf SWISSIMAGE 10 cm (© swisstopo), beide Modelle (curriculum und paper). Erzeugt wird das
# GeoPackage lokal mit _lokal/luftbild_erkennung (erkennen.py, schreiben.py); dieses Skript liest
# es und schreibt nur, was der Rechner braucht.
#
# Übernommen werden die Klassen «bike_lane» und «red_colored_bike_lane». Jeder Fund ist ein
# schmales Rechteck entlang des Streifens (Median 41 × 2,2 m); gespeichert wird seine
# MITTELLINIE entlang der langen Seite. Aus ihrer Lage zur Strassenachse liest der Rechner die
# Seite (luftbild.ts). Eine Breite lässt sich aus den Rechtecken nicht ablesen.
#
# NICHT übernommen: das Feld `in_2021`. Es stammt aus dem ETH-Datensatz 2021 (Research
# Collection, Lizenz «In Copyright – Non-Commercial Use Permitted») und darf nicht in den
# öffentlichen Snapshot. Ebenso keine Sicherheitswerte je Fund: der Rechner wertet nur die Lage.
#
# Erzeugt VeloroutenCheckWeb/public/luftbild_bern.json =
#   { "quelle": "...", "flugjahre": [..], "linien": [[lon1, lat1, lon2, lat2], ...] }
#
# Braucht GDAL (osgeo). Aufruf:
#   python3 tools/luftbild_bern.py <Bern_aktuell.gpkg>
# ─────────────────────────────────────────────────────────────────────────────
import json, math, os, sys
from osgeo import ogr, osr

ogr.UseExceptions(); osr.UseExceptions()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "VeloroutenCheckWeb", "public", "luftbild_bern.json")
LAYER = ("Bern_2024_curriculum", "Bern_2024_paper")
KLASSEN = ("bike_lane", "red_colored_bike_lane")


def mittellinie(p):
    """Mittellinie eines Rechtecks (4 Ecken) entlang seiner langen Seite."""
    if math.dist(p[0], p[1]) >= math.dist(p[1], p[2]):
        return ((p[0][0] + p[3][0]) / 2, (p[0][1] + p[3][1]) / 2), ((p[1][0] + p[2][0]) / 2, (p[1][1] + p[2][1]) / 2)
    return ((p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2), ((p[3][0] + p[2][0]) / 2, (p[3][1] + p[2][1]) / 2)


def main():
    if len(sys.argv) != 2:
        sys.exit("Aufruf: python3 tools/luftbild_bern.py <Bern_aktuell.gpkg>")
    ds = ogr.Open(sys.argv[1])
    wgs = osr.SpatialReference(); wgs.ImportFromEPSG(4326)
    wgs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)   # lon, lat
    linien, jahre = [], set()
    for name in LAYER:
        lyr = ds.GetLayerByName(name)
        if lyr is None:
            sys.exit(f"Layer {name} fehlt im GeoPackage")
        tr = osr.CoordinateTransformation(lyr.GetSpatialRef(), wgs)
        lyr.SetAttributeFilter("class_type IN (%s)" % ",".join(f"'{k}'" for k in KLASSEN))
        for f in lyr:
            ring = f.GetGeometryRef().GetGeometryRef(0)
            if ring.GetPointCount() < 4:
                continue
            a, b = mittellinie([ring.GetPoint_2D(i) for i in range(4)])
            (lon1, lat1, _), (lon2, lat2, _) = tr.TransformPoint(*a), tr.TransformPoint(*b)
            linien.append([round(lon1, 6), round(lat1, 6), round(lon2, 6), round(lat2, 6)])
            if f.GetField("year"):
                jahre.add(int(f.GetField("year")))
    out = {
        "quelle": "Luftbild SWISSIMAGE 10 cm © swisstopo; Erkennung: Modell remote_velo, ETH Zürich "
                  "(MIT-Lizenz), eigener Lauf mit den Modellen curriculum und paper",
        "flugjahre": sorted(jahre),
        "linien": linien,
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(linien)} Radstreifen-Funde (Flugjahre {sorted(jahre)}) → {OUT}")


if __name__ == "__main__":
    main()
