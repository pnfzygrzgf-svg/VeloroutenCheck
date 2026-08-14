#!/usr/bin/env python3
# ════════════════════════════════════════════════════════════════════════════
# VeloroutenCheck — Markdown-Generator für das konsolidierte Regelwerk
# ════════════════════════════════════════════════════════════════════════════
#
# Liest die zentrale Datenquelle docs/regelwerk.json und schreibt daraus ein
# menschenlesbares Referenzdokument docs/regelwerk.md (Tabellen pro Stadt,
# Parameter, feel-safe-Anker).
#
# Reine Ergänzung/Dokumentation — verändert keinen App-Code. Manuell ausführen:
#   python3 tools/generiere_dokumentation.py
# ════════════════════════════════════════════════════════════════════════════

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JSON_PFAD = ROOT / "docs" / "regelwerk.json"
MD_PFAD = ROOT / "docs" / "regelwerk.md"

# v-Spalten-Reihenfolge für die Soll-Matrizen (km/h-Bänder).
V_BAENDER = [(0, 30, "≤ 30"), (31, 40, "31–40"), (41, 50, "41–50"), (51, 80, "51–80")]


def fmt_m(x):
    """Meter-Wert formatieren (None → «–», sonst 2 Nachkommastellen mit Komma)."""
    if x is None:
        return "–"
    return f"{x:.2f}".replace(".", ",")


def dtv_label(rmin, rmax):
    if rmin == 0 and rmax is not None:
        return f"< {rmax:,}".replace(",", "'")
    if rmax is None:
        return f"≥ {rmin:,}".replace(",", "'")
    return f"{rmin:,}–{rmax:,}".replace(",", "'")


def md_table(header, rows):
    """Eine Markdown-Tabelle aus Header-Liste und Zeilen-Listen bauen."""
    out = ["| " + " | ".join(header) + " |"]
    out.append("|" + "|".join(["---"] * len(header)) + "|")
    for r in rows:
        out.append("| " + " | ".join(str(c) for c in r) + " |")
    return "\n".join(out)


def render_dtv_matrix(regeln):
    """dtvXvMatrix-Regeln als DTV×v-Tabelle rendern."""
    # DTV-Bänder in Reihenfolge des ersten Auftretens.
    bands, seen = [], set()
    for r in regeln:
        key = (r["dtvMin"], r["dtvMax"])
        if key not in seen:
            seen.add(key)
            bands.append(key)
    header = ["DTV MIV \\ km/h"] + [lbl for _, _, lbl in V_BAENDER]
    rows = []
    for dmin, dmax in bands:
        row = [dtv_label(dmin, dmax)]
        for vmin, vmax, _ in V_BAENDER:
            form = next(
                (r["form"] for r in regeln
                 if r["dtvMin"] == dmin and r["dtvMax"] == dmax
                 and r["vMin"] == vmin and r["vMax"] == vmax),
                "–")
            row.append(form)
        rows.append(row)
    return md_table(header, rows)


def render_soll(soll):
    typ = soll["typ"]
    parts = [f"*Quelle:* {soll.get('quelle', '')}"]
    if soll.get("hinweis"):
        parts.append(f"*Hinweis:* {soll['hinweis']}")
    if typ == "dtvXvMatrix":
        parts.append(render_dtv_matrix(soll["regeln"]))
    elif typ == "nachRoutentyp":
        for key, regeln in soll.items():
            if isinstance(regeln, list):
                parts.append(f"**{key}**\n\n" + render_dtv_matrix(regeln))
    elif typ == "nachStrassentyp":
        for key, regeln in soll.items():
            if isinstance(regeln, list):
                rows = []
                for r in regeln:
                    vlabel = f"{r['vMin']}–{r['vMax']} km/h" if r["vMax"] != r["vMin"] else f"{r['vMin']} km/h"
                    form = r["form"]
                    if r.get("hinweis"):
                        form += f" ({r['hinweis']})"
                    rows.append([r["strassentyp"], vlabel, form])
                parts.append(f"**{key}**\n\n" + md_table(["Strassentyp", "Tempo", "Führungsform"], rows))
    return "\n\n".join(parts)


def render_breiten(breiten):
    parts = [f"*Quelle:* {breiten.get('quelle', '')}"]
    if breiten.get("hinweis"):
        parts.append(f"*Hinweis:* {breiten['hinweis']}")
    rows = []
    for form, b in breiten["werte"].items():
        rows.append([
            form,
            fmt_m(b.get("optimal")),
            fmt_m(b.get("minimal")),
            fmt_m(b.get("minimum")),
            fmt_m(b.get("maximal")) if b.get("maximal") is not None else "–",
        ])
    parts.append(md_table(
        ["Führungsform / Querschnitt", "Optimal", "Minimal", "Minimum", "Maximal"], rows))
    return "\n\n".join(parts)


def render_haltestellen(hs):
    parts = [f"*Quelle:* {hs.get('quelle', '')}"]
    rows = []
    for name, t in hs["typen"].items():
        rows.append([
            t.get("code", "–"),
            name,
            t.get("familie", "–"),
            fmt_m(t.get("optimal")),
            fmt_m(t.get("minimal")),
            fmt_m(t.get("minimum")),
        ])
    parts.append(md_table(
        ["Code", "Typ", "Einsatzfamilie", "Optimal", "Minimal", "Minimum"], rows))

    soll = hs.get("sollLoesung")
    if soll:
        if soll["typ"] == "taktXRoute":
            matrix = soll["matrix"]
            # Spalten aus dem ersten Eintrag bestimmen.
            routen = list(next(iter(matrix.values())).keys())
            header = ["ÖV-Angebot"] + routen
            order = ["tram", "bus_unter5", "bus_5_15", "bus_ab15"]
            labels = {"tram": "Tram", "bus_unter5": "Bus < 5 Min",
                      "bus_5_15": "Bus 5–15 Min", "bus_ab15": "Bus ≥ 15 Min"}
            rows = []
            for k in order:
                if k in matrix:
                    rows.append([labels[k]] + [matrix[k].get(r, "–") for r in routen])
            parts.append("**Soll-Veloverkehrslösung (Takt × Route)**\n\n"
                         + md_table(header, rows))
            if soll.get("hinweis"):
                parts.append(f"*Hinweis:* {soll['hinweis']}")
        elif soll["typ"] == "kriterienbasiert":
            parts.append(f"**Soll-Veloverkehrslösung:** {soll.get('hinweis', '')}")
    return "\n\n".join(parts)


def render_parameter(parameter):
    rows = []
    for key, p in parameter.items():
        # 14.08.2026: `tramMalus` (Paar ruhig/schnell) brauchte hier einen Sonderfall. Der
        # Nachfolger `tramDeckel` und die neue `kapNote` sind gewöhnliche {wert, einheit,
        # herleitung}-Parameter und laufen über den else-Zweig.
        if key == "parkenRelevant":
            rows.append(["parkenRelevant", ", ".join(p["formen"]), "Führungsformen", p.get("hinweis", "")])
        else:
            rows.append([key, p.get("wert", ""), p.get("einheit", ""), p.get("herleitung", "")])
    return md_table(["Parameter", "Wert", "Einheit", "Herleitung"], rows)


def render_feelsafe(fs):
    rows = []
    for form, w in fs["werte"].items():
        rows.append([form, w["ruhig"], w["schnell"], w.get("verifiziert", "")])
    out = [f"*Hinweis:* {fs.get('hinweis', '')}",
           md_table(["Führungsform", "ruhig (V ≤ 30)", "schnell (V > 30)", "verifiziert"], rows)]
    return "\n\n".join(out)


def render_velostrassen(v):
    parts = [f"*Quelle:* {v.get('quelle', '')}"]
    r = v["regelnAlleStaedte"]
    bullets = [
        "**Regeln für alle Städte:**",
        "",
        f"- {r['hinweisTempo']}",
        f"- {r['hinweisMischverkehr']}",
        f"- Parkierung rechts (Dooring) relevant: {'ja' if r.get('dooringRelevant') else 'nein'}",
    ]
    parts.append("\n".join(bullets))
    rows = []
    for stadt, s in v["proStadt"].items():
        rows.append([
            stadt,
            fmt_m(s.get("breiteMin")),
            fmt_m(s.get("breiteMax")),
            fmt_m(s.get("breiteBeiParkierung")) if s.get("breiteBeiParkierung") is not None else "–",
            s.get("routentyp") or "–",
            f"{s['maxDtv']:,}".replace(",", "'") if s.get("maxDtv") is not None else "–",
            s.get("einsatzbereich", "–"),
            s.get("hinweis", ""),
        ])
    parts.append(md_table(
        ["Stadt", "Breite min", "Breite max", "Bei Parkierung", "Routentyp", "Max DTV",
         "Einsatzbereich", "Hinweis"],
        rows))
    return "\n\n".join(parts)


def render_umweltspuren(u):
    parts = [f"*Quelle:* {u.get('quelle', '')}"]
    r = u["regelnAlleStaedte"]
    bullets = [
        "**Regeln für alle Städte:**",
        "",
        f"- {r['hinweisTakt']}",
        f"- feel-safe-Klasse: {r['feelClass']}.",
        f"- Parkierung rechts (Dooring) relevant: {'ja' if r.get('dooringRelevant') else 'nein'}",
    ]
    parts.append("\n".join(bullets))
    rows = []
    for stadt, s in u["proStadt"].items():
        rows.append([
            stadt,
            fmt_m(s.get("breiteOptimal")),
            fmt_m(s.get("breiteMinimal")),
            s.get("decke", "–"),
            s.get("taktModell", "–"),
            s.get("hinweis", ""),
        ])
    parts.append(md_table(
        ["Stadt", "Breite optimal", "Breite minimal", "Decke (max. Note)", "Takt-Modell", "Hinweis"],
        rows))
    return "\n\n".join(parts)


def render_typ_mapping(m):
    spalten = m["spalten"]
    rows = []
    for stadt, codes in m["zeilen"].items():
        rows.append([stadt] + [c if c else "–" for c in codes])
    # Spaltenüberschriften kürzen (sonst zu breit).
    header = ["Stadt"] + spalten
    out = [f"*Hinweis:* {m.get('hinweis', '')}", md_table(header, rows)]
    return "\n\n".join(out)


def main():
    data = json.loads(JSON_PFAD.read_text(encoding="utf-8"))
    meta = data["meta"]
    L = []
    L.append(f"# {meta['titel']}")
    L.append("")
    L.append(f"> **Automatisch generiert** aus `docs/regelwerk.json` durch "
             f"`tools/generiere_dokumentation.py`. Nicht von Hand bearbeiten — "
             f"stattdessen die JSON ändern und das Skript erneut ausführen.")
    L.append("")
    L.append(f"Stand: {meta['erstellt']}")
    L.append("")
    L.append(meta["hinweis"])
    L.append("")
    L.append("**Quellen:**")
    L.append("")
    for q in meta["quellen"]:
        L.append(f"- {q}")
    L.append("")

    L.append("## Stadtübergreifende Parameter")
    L.append("")
    L.append(render_parameter(data["parameter"]))
    L.append("")

    L.append("## Feel-safe-Anker")
    L.append("")
    L.append(render_feelsafe(data["feelSafe"]))
    L.append("")

    L.append("## Velostrassen (Q9) — Sonderfall")
    L.append("")
    L.append(render_velostrassen(data["velostrassen"]))
    L.append("")

    L.append("## Umweltspuren (Q4) — Sonderfall")
    L.append("")
    L.append(render_umweltspuren(data["umweltspuren"]))
    L.append("")

    L.append("## Haltestellen-Typ-Bezeichnungen (stadtübergreifend)")
    L.append("")
    L.append(render_typ_mapping(data["haltestellenTypMapping"]))
    L.append("")

    for stadt, d in data["staedte"].items():
        L.append(f"## {stadt}")
        L.append("")
        L.append(f"**Routentypen:** {', '.join(d['routentypen'])}")
        L.append("")
        if d.get("routentypMapping"):
            rows = [[k, v if v else "*(kein Routentyp — manuell)*"]
                    for k, v in d["routentypMapping"].items()]
            L.append("**Routentyp-Mapping → Masterplan:**")
            L.append("")
            L.append(md_table(["Stadt-Kategorie", "→ Masterplan-Typ"], rows))
            L.append("")

        L.append("### Soll-Führungsform (DTV × Tempo)")
        L.append("")
        L.append(render_soll(d["sollTabelle"]))
        L.append("")

        L.append("### Breiten-Sollwerte")
        L.append("")
        L.append(render_breiten(d["breiten"]))
        L.append("")

        L.append("### Haltestellen")
        L.append("")
        L.append(render_haltestellen(d["haltestellen"]))
        L.append("")

    MD_PFAD.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"Geschrieben: {MD_PFAD.relative_to(ROOT)} ({len(L)} Zeilen)")


if __name__ == "__main__":
    main()
