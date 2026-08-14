#!/usr/bin/env python3
# ════════════════════════════════════════════════════════════════════════════
# VeloroutenCheck — Stadt-PDF zur fachlichen Prüfung
# ════════════════════════════════════════════════════════════════════════════
#
# Erzeugt aus der zentralen Datenquelle docs/regelwerk.json ein sauberes,
# fachlich lesbares PDF PRO STADT (für die Kontrolle durch Fachpersonen der
# jeweiligen Stadt). Bewusst OHNE technische Interna (Code-Pfade, JSON-Schlüssel,
# interne Parameter, Generierungs-Hinweise) — nur die prüfbaren Vorgaben mit
# Quellenangabe.
#
# Aufruf:
#   python3 tools/generiere_stadt_pdf.py            # alle Städte
#   python3 tools/generiere_stadt_pdf.py Luzern     # nur eine Stadt
#
# Ausgabe: docs/pruefung/VeloroutenCheck_Pruefung_<Stadt>.pdf
#
# Abhängigkeit: weasyprint (HTML/CSS → PDF). Installation z. B. via Homebrew/pip.
# ════════════════════════════════════════════════════════════════════════════

import json
import sys
from html import escape
from pathlib import Path

from weasyprint import HTML

ROOT = Path(__file__).resolve().parent.parent
JSON_PFAD = ROOT / "docs" / "regelwerk.json"
OUT_DIR = ROOT / "docs" / "pruefung"

V_BAENDER = [(0, 30, "≤ 30"), (31, 40, "31–40"), (41, 50, "41–50"), (51, 80, "51–80")]


# ── Formatierung ──────────────────────────────────────────────────────────────
def fmt_m(x):
    if x is None:
        return "–"
    return f"{x:.2f}".replace(".", ",")


def dtv_label(rmin, rmax):
    if rmin == 0 and rmax is not None:
        return f"< {rmax:,}".replace(",", "'")
    if rmax is None:
        return f"≥ {rmin:,}".replace(",", "'")
    return f"{rmin:,}–{rmax:,}".replace(",", "'")


def thousands(n):
    return f"{n:,}".replace(",", "'")


# Interne CSV-/Code-Verweise aus einer Quellenangabe entfernen (für Fachpersonen nicht relevant);
# nur die fachliche Standards-Quelle behalten. Beispiel:
#   "Fueherungsform_Breiten_Staedte.csv (Luzern); Standards Veloverkehr Stadt Luzern Q-Blätter S. 30–57"
#   → "Standards Veloverkehr Stadt Luzern Q-Blätter S. 30–57"
def saubere_quelle(text):
    if not text:
        return ""
    teile = [t.strip() for t in text.split(";")]
    behalten = [t for t in teile
                if ".csv" not in t.lower() and ".ts" not in t.lower()
                and "fuehrungsform" not in t.lower()]
    return "; ".join(behalten).strip()


# Massgebendes Standards-Dokument je Stadt (für die Fusszeile des Stadt-PDFs).
STADT_QUELLE = {
    "Bern": "Masterplan Veloinfrastruktur Stadt Bern (Standards, Q-Blätter)",
    "Zürich": "Velostandards Stadt Zürich",
    "Basel": "Standards Fuss- und Veloverkehrsinfrastruktur Kanton Basel-Stadt (2024)",
    "Luzern": "Standards Veloverkehr Stadt Luzern",
}


# ── HTML-Bausteine ────────────────────────────────────────────────────────────
class Raw(str):
    """Zelleninhalt, der bereits HTML ist und NICHT escaped werden soll."""


def _cell(c):
    return str(c) if isinstance(c, Raw) else escape(str(c))


def table(headers, rows, *, first_col_head=True):
    out = ['<table>', '<thead><tr>']
    for h in headers:
        out.append(f"<th>{escape(str(h))}</th>")
    out.append('</tr></thead><tbody>')
    for r in rows:
        out.append('<tr>')
        for i, c in enumerate(r):
            tag = 'th' if (first_col_head and i == 0) else 'td'
            cls = ' class="rowhead"' if tag == 'th' else ''
            out.append(f"<{tag}{cls}>{_cell(c)}</{tag}>")
        out.append('</tr>')
    out.append('</tbody></table>')
    return "\n".join(out)


def h2(t):
    return f"<h2>{escape(t)}</h2>"


def note(t):
    return f'<p class="quelle">{escape(t)}</p>'


# ── Soll-Führungsform ─────────────────────────────────────────────────────────
def render_dtv_matrix(regeln):
    bands, seen = [], set()
    for r in regeln:
        key = (r["dtvMin"], r["dtvMax"])
        if key not in seen:
            seen.add(key)
            bands.append(key)
    headers = ["DTV MIV \\ km/h"] + [lbl for _, _, lbl in V_BAENDER]
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
    return table(headers, rows)


def render_soll(soll):
    typ = soll["typ"]
    parts = []
    if typ == "dtvXvMatrix":
        parts.append(render_dtv_matrix(soll["regeln"]))
    elif typ == "nachRoutentyp":
        for key, regeln in soll.items():
            if isinstance(regeln, list):
                parts.append(f"<h3>{escape(key)}</h3>")
                parts.append(render_dtv_matrix(regeln))
    elif typ == "nachStrassentyp":
        for key, regeln in soll.items():
            if isinstance(regeln, list):
                rows = []
                for r in regeln:
                    vlabel = (f"{r['vMin']}–{r['vMax']} km/h"
                              if r["vMax"] != r["vMin"] else f"{r['vMin']} km/h")
                    form = r["form"]
                    if r.get("hinweis"):
                        form += f" ({r['hinweis']})"
                    rows.append([r["strassentyp"], vlabel, form])
                parts.append(f"<h3>{escape(key)}</h3>")
                parts.append(table(["Strassentyp", "Tempo", "Führungsform"], rows))
    q = saubere_quelle(soll.get("quelle", ""))
    if q:
        parts.append(note(f"Quelle: {q}"))
    return "\n".join(parts)


# Markierung für aus Bern übernommene (nicht stadteigene) Werte.
BERN_BADGE = ' <span class="bern">①</span>'
BERN_LEGENDE = ('<p class="legende"><span class="bern">①</span> = aus den Berner Vorgaben '
                'übernommen (kein eigener Standardwert dieser Stadt).</p>')


# ── Breiten ───────────────────────────────────────────────────────────────────
def render_breiten(breiten, stadt):
    rows = []
    bern_uebernahme = False
    for form, b in breiten["werte"].items():
        ist_bern = b.get("herkunft") == "bern" and stadt != "Bern"
        if ist_bern:
            bern_uebernahme = True
        rows.append([
            Raw(escape(form) + (BERN_BADGE if ist_bern else "")),
            fmt_m(b.get("optimal")),
            fmt_m(b.get("minimal")),
            fmt_m(b.get("minimum")),
            fmt_m(b.get("maximal")) if b.get("maximal") is not None else "–",
        ])
    out = [table(["Führungsform / Querschnitt", "Velohauptroute (optimal)",
                  "Veloroute (minimal)", "Absolutes Minimum", "Maximal"], rows)]
    if bern_uebernahme:
        out.append(BERN_LEGENDE)
    if breiten.get("hinweis"):
        out.append(note(breiten["hinweis"]))
    q = saubere_quelle(breiten.get("quelle", ""))
    if q:
        out.append(note(f"Quelle: {q}"))
    return "\n".join(out)


# ── Haltestellen ──────────────────────────────────────────────────────────────
def render_haltestellen(hs):
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
    parts = [table(["Code", "Typ", "Einsatzfamilie", "Velohauptroute (optimal)",
                    "Veloroute (minimal)", "Absolutes Minimum"], rows)]

    soll = hs.get("sollLoesung")
    if soll and soll["typ"] == "taktXRoute":
        matrix = soll["matrix"]
        routen = list(next(iter(matrix.values())).keys())
        labels = {"tram": "Tram", "bus_unter5": "Bus < 5 Min",
                  "bus_5_15": "Bus 5–15 Min", "bus_ab15": "Bus ≥ 15 Min"}
        order = ["tram", "bus_unter5", "bus_5_15", "bus_ab15"]
        rows = []
        for k in order:
            if k in matrix:
                rows.append([labels[k]] + [matrix[k].get(r, "–") for r in routen])
        parts.append("<h3>Soll-Veloverkehrslösung (ÖV-Takt × Route)</h3>")
        parts.append(table(["ÖV-Angebot"] + routen, rows))
        if soll.get("hinweis"):
            parts.append(note(soll["hinweis"]))
    elif soll and soll["typ"] == "kriterienbasiert":
        parts.append(f"<p>Soll-Veloverkehrslösung: {escape(soll.get('hinweis', ''))}</p>")

    q = saubere_quelle(hs.get("quelle", ""))
    if q:
        parts.append(note(f"Quelle: {q}"))
    return "\n".join(parts)


# ── Sonderfälle (Velostrasse / Umweltspur) für die Stadt ──────────────────────
def render_velostrasse(data, stadt):
    v = data["velostrassen"]
    s = v["proStadt"].get(stadt)
    r = v["regelnAlleStaedte"]
    items = [
        "<ul>",
        f"<li>{escape(r['hinweisTempo'])}</li>",
        f"<li>{escape(r['hinweisMischverkehr'])}</li>",
        f"<li>Parkierung rechts (Dooring) relevant: {'ja' if r.get('dooringRelevant') else 'nein'}</li>",
        "</ul>",
    ]
    if s:
        rows = [[
            "Breite min", fmt_m(s.get("breiteMin")),
        ], [
            "Breite max", fmt_m(s.get("breiteMax")),
        ], [
            "Bei Parkierung", fmt_m(s.get("breiteBeiParkierung")) if s.get("breiteBeiParkierung") is not None else "–",
        ], [
            "Routentyp", s.get("routentyp") or "–",
        ], [
            "Max DTV", thousands(s["maxDtv"]) if s.get("maxDtv") is not None else "–",
        ]]
        items.append(table(["Vorgabe (Velostrasse)", stadt], rows))
        if s.get("einsatzbereich"):
            items.append(note(f"Einsatzbereich: {s['einsatzbereich']}"))
        if s.get("hinweis"):
            items.append(note(s["hinweis"]))
    return "\n".join(items)


def render_umweltspur(data, stadt):
    u = data["umweltspuren"]
    s = u["proStadt"].get(stadt)
    r = u["regelnAlleStaedte"]
    items = [
        "<ul>",
        f"<li>{escape(r['hinweisTakt'])}</li>",
        f"<li>feel-safe-Klasse: {escape(r['feelClass'])}.</li>",
        f"<li>Parkierung rechts (Dooring) relevant: {'ja' if r.get('dooringRelevant') else 'nein'}</li>",
        "</ul>",
    ]
    if s:
        breite_bern = s.get("breiteHerkunft") == "bern" and stadt != "Bern"
        b_badge = BERN_BADGE if breite_bern else ""
        rows = [[
            Raw("Breite Velohauptroute (optimal)" + b_badge), fmt_m(s.get("breiteOptimal")),
        ], [
            Raw("Breite Veloroute (minimal)" + b_badge), fmt_m(s.get("breiteMinimal")),
        ], [
            "Takt-Modell", s.get("taktModell", "–"),
        ], [
            "Höchstens Note (Decke)", _numde(s["decke"]) if s.get("decke") is not None else "–",
        ]]
        items.append(table(["Vorgabe (Umweltspur)", stadt], rows))
        if breite_bern:
            items.append(BERN_LEGENDE)
        if s.get("hinweis"):
            items.append(note(s["hinweis"]))
    return "\n".join(items)


# ── Seitenstil ────────────────────────────────────────────────────────────────
CSS = """
@page { size: A4; margin: 18mm 16mm 20mm 16mm;
        @bottom-center { content: "VeloroutenCheck — Prüfdokument · Seite " counter(page) " / " counter(pages);
                         font-size: 8pt; color: #888; } }
* { box-sizing: border-box; }
body { font-family: "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; font-size: 10.5pt; line-height: 1.45; }
h1 { font-size: 20pt; margin: 0 0 2mm; color: #0b5; }
.sub { color: #555; font-size: 11pt; margin: 0 0 6mm; }
h2 { font-size: 13pt; margin: 8mm 0 2mm; padding-bottom: 1mm; border-bottom: 2px solid #0b5; color: #0a4; }
h3 { font-size: 11pt; margin: 4mm 0 1.5mm; color: #333; }
p { margin: 1.5mm 0; }
ul { margin: 1.5mm 0 1.5mm 5mm; padding: 0; }
li { margin: 0.5mm 0; }
.quelle { color: #777; font-size: 8.5pt; font-style: italic; margin: 1mm 0 3mm; }
.intro { background: #f3faf5; border: 1px solid #bfe6cd; border-radius: 3px; padding: 3mm 4mm; font-size: 9.5pt; }
table { border-collapse: collapse; width: 100%; margin: 2mm 0 1mm; font-size: 9pt; }
th, td { border: 1px solid #cdd6cf; padding: 2.2mm 2.5mm; text-align: left; vertical-align: top; }
thead th { background: #0a4; color: #fff; font-weight: 600; }
tbody th.rowhead { background: #eef4ef; font-weight: 600; }
tbody tr:nth-child(even) td { background: #f8faf8; }
.bern { display: inline-block; background: #fde68a; color: #7c4a02; border-radius: 3px;
        padding: 0 1.4mm; font-size: 8pt; font-weight: 700; }
.legende { color: #7c4a02; font-size: 8.5pt; margin: 1mm 0 3mm; }
.foot { margin-top: 8mm; color: #777; font-size: 8pt; border-top: 1px solid #ddd; padding-top: 2mm; }
"""


# ── Grundlagen-Dokument (stadtübergreifend): feel-safe + Bewertungsparameter ───
def _numde(x):
    if isinstance(x, float) and x.is_integer():
        x = int(x)
    return str(x).replace(".", ",")


# Stadtübergreifende Parameter (nur die wirklich städteunabhängigen; taktabhängige Umweltspur-
# Schwellen sind stadtspezifisch und stehen im jeweiligen Stadt-Prüfdokument).
GRUND_PARAMETER = [
    ("feelSafeProNote", "feel-safe-Punkte pro Notenstufe"),
    ("noteProMeter", "Breiten-Abzug pro fehlendem Meter"),
    ("parkenRechtsAbzug", "Abzug Parkierung rechts (Dooring)"),
    ("haltestelleAbzug", "Abzug Haltestelle (Soll «Separate Velofläche», Ist Mischverkehr-Typ)"),
    ("fusswegBasis", "Fussweg Velo gestattet: höchstens Note (Decke)"),
    # 14.08.2026: Tram ist vom tempoabhängigen Malus auf einen Deckel umgestellt und um die
    # Kap-Regel ergänzt (Angleichung an den lokalen Berner Rechner). Beides sind gewöhnliche
    # {wert, einheit, herleitung}-Parameter — der frühere Sonderfall unten entfällt.
    ("tramDeckel", "Schienen in der Fahrbahn: höchstens Note (nur Mischverkehr)"),
    ("kapNote", "Kaphaltestelle an Tram-Haltestelle ohne bauliche Trennung: feste Note"),
]


def render_feelsafe(data):
    fs = data["feelSafe"]
    rows = [[form, f"{_numde(w['ruhig'])} %", f"{_numde(w['schnell'])} %", w.get("verifiziert", "")]
            for form, w in fs["werte"].items()]
    hinweis = fs.get("hinweis", "").replace(" (tools/verify_06.py)", "")
    parts = [
        "<p>Die <b>feel-safe %</b> geben an, wie sicher sich Velofahrende in einer Situation fühlen "
        "(Anteil der Bewertungen in den zwei besten von vier Klassen). Quelle: Befragung "
        "radwege-check.de / FixMyCity, Velo-Perspektive, tram-bereinigt; unabhängig aus den "
        "Einzelantworten nachgerechnet. «ruhig» = Tempo ≤ 30, «schnell» = Tempo > 30.</p>",
        table(["Führungsform", "ruhig (V ≤ 30)", "schnell (V > 30)", "Verifiziert (radwege-check)"], rows),
        note(hinweis),
        "<p>Die Note misst, wie nahe die vorhandene Führungsform an die feel-safe % der geforderten "
        "Form herankommt: pro <b>14,4</b> fehlende feel-safe-Punkte sinkt die Note um eine ganze "
        "Stufe (6 → 1). Baulich getrennte Formen (Radweg) erfüllen den Soll und erhalten die Bestnote.</p>",
    ]
    return "\n".join(parts)


def render_grund_parameter(data):
    p = data["parameter"]
    rows = []
    for key, label in GRUND_PARAMETER:
        e = p.get(key, {})
        rows.append([label, _numde(e.get("wert", "")), e.get("einheit", ""), e.get("herleitung", "")])
    pr = p.get("parkenRelevant", {})
    rows.append(["Führungsformen mit Dooring-Relevanz", ", ".join(pr.get("formen", [])),
                 "—", pr.get("hinweis", "")])
    return table(["Parameter", "Wert", "Einheit", "Herleitung / Bemerkung"], rows)


def build_grundlagen_html(data):
    meta = data["meta"]
    body = [
        "<h1>VeloroutenCheck — Grundlagen: subjektive Sicherheit (feel-safe)</h1>",
        '<p class="sub">Stadtübergreifende Bewertungsgrundlage</p>',
        '<div class="intro">Dieses Dokument beschreibt die <b>stadtübergreifende</b> Grundlage der '
        'VeloroutenCheck-Bewertung: die empirisch gemessene subjektive Sicherheit (feel-safe %) und '
        'die daraus abgeleiteten Parameter. Diese Werte gelten für <b>alle Städte gleich</b> '
        '(Bern, Zürich, Basel, Luzern …); die stadtspezifischen Vorgaben stehen im jeweiligen '
        'Prüfdokument der Stadt.</div>',
        h2("Feel-safe-Anker (empirisch, verifiziert)"),
        render_feelsafe(data),
        h2("Stadtübergreifende Bewertungsparameter"),
        render_grund_parameter(data),
        '<div class="foot">Subjektive Sicherheit (feel-safe %): radwege-check.de / FixMyCity. '
        f'· Stand: {escape(meta.get("erstellt", ""))}</div>',
    ]
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body>" \
           + "\n".join(body) + "</body></html>"


def build_html(data, stadt):
    d = data["staedte"][stadt]
    meta = data["meta"]
    routentypen = ", ".join(d["routentypen"])

    # Routentyp-Mapping (nur Zeilen mit Ziel anzeigen).
    map_rows = [[k, v if v else "— (manuell, kein Routentyp)"]
                for k, v in d.get("routentypMapping", {}).items()]

    body = []
    body.append(f"<h1>VeloroutenCheck — Prüfdokument {escape(stadt)}</h1>")
    body.append(f'<p class="sub">Veloinfrastruktur-Vorgaben für die fachliche Kontrolle</p>')
    body.append(
        '<div class="intro">Dieses Dokument fasst die im VeloroutenCheck hinterlegten '
        f'Bewertungs-Vorgaben für <b>{escape(stadt)}</b> zusammen. Bitte prüf die Werte '
        'gegen die massgebenden Standards deiner Stadt und meld Abweichungen zurück. '
        'Die feel-safe-Werte (subjektive Sicherheit) sind stadtübergreifend und stehen im separaten '
        'Grundlagen-Dokument «Subjektive Sicherheit (feel-safe)».</div>')

    body.append(f"<p><b>Routentypen:</b> {escape(routentypen)}</p>")
    if map_rows:
        body.append(h2("Routentyp-Zuordnung"))
        body.append(table(["Kategorie der Stadt", "im VeloroutenCheck als"], map_rows))

    body.append(h2("Soll-Führungsform (welche Form ist wo vorgesehen)"))
    body.append(render_soll(d["sollTabelle"]))

    body.append(h2("Breiten-Vorgaben je Führungsform"))
    body.append(render_breiten(d["breiten"], stadt))

    body.append(h2("Haltestellen"))
    body.append(render_haltestellen(d["haltestellen"]))

    body.append(h2("Sonderfall Velostrasse"))
    body.append(render_velostrasse(data, stadt))

    body.append(h2("Sonderfall Umweltspur (Bus + Velo)"))
    body.append(render_umweltspur(data, stadt))

    stadt_q = STADT_QUELLE.get(stadt, "")
    body.append('<div class="foot">Massgebende Grundlage: '
                + escape(stadt_q)
                + '. Subjektive Sicherheit (feel-safe %, stadtübergreifend): siehe Grundlagen-Dokument (radwege-check.de / FixMyCity).'
                + f' · Stand: {escape(meta.get("erstellt", ""))}</div>')

    return f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body>" \
           + "\n".join(body) + "</body></html>"


def main():
    data = json.loads(JSON_PFAD.read_text(encoding="utf-8"))
    staedte = list(data["staedte"].keys())
    if len(sys.argv) > 1:
        wanted = sys.argv[1:]
        unknown = [s for s in wanted if s not in staedte]
        if unknown:
            print(f"Unbekannte Stadt/Städte: {', '.join(unknown)}. Verfügbar: {', '.join(staedte)}")
            sys.exit(1)
        staedte = wanted

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stadt in staedte:
        html = build_html(data, stadt)
        out = OUT_DIR / f"VeloroutenCheck_Pruefung_{stadt.replace('ü', 'ue')}.pdf"
        HTML(string=html).write_pdf(str(out))
        print(f"Geschrieben: {out.relative_to(ROOT)}")

    # Stadtübergreifendes Grundlagen-Dokument (feel-safe) — immer mitgenerieren.
    grund = build_grundlagen_html(data)
    gout = OUT_DIR / "VeloroutenCheck_Grundlagen_subjektive-Sicherheit.pdf"
    HTML(string=grund).write_pdf(str(gout))
    print(f"Geschrieben: {gout.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
