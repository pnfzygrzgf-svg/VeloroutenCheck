#!/usr/bin/env python3
# ════════════════════════════════════════════════════════════════════════════
# VeloroutenCheck — Verifikation der Empirie-Ergebnisse aus
#   06_Empirische_Erkenntnisse_Fuehrungsformwahl.md
#
# Rechnet alle Kennzahlen aus 06 NEU und unabhängig nach — direkt aus den
# Einzelantworten der Befragung — und vergleicht sie mit den im MD notierten
# Werten. Zusätzlich werden alle Auswertungen je Velofahrenden-Typ
# (userGroup / bicycleUse / ageGroup / gender) aufgeschlüsselt.
#
# DATENBASIS (read-only)
#   Primär:
#     SurveyResults_200414.json   – ALLE Einzelantworten + Befragten-Profile.
#                                   rating 0..3; feel-safe := rating >= 2.
#                                   Nur Velo-Perspektive (profile.perspective == 'C').
#     scenes_ms.csv / _cp.csv / _se.csv – decodierte Szenen-Merkmale.
#                                   Join: ratings[].scene_id == SceneID (direkt, 100 %).
#   Kreuzvalidierung:
#     radwege_hauptstrassen.csv   – offizielle Aggregate (voteScore). Das aus der
#                                   JSON je Konfiguration berechnete feel-safe muss
#                                   im Rundungsrahmen mit voteScore übereinstimmen.
#
# METRIK
#   feel-safe % einer Gruppe = 100 * (Anzahl Bewertungen mit rating>=2) / (Anzahl Bewertungen).
#   N = Anzahl Einzelbewertungen (nicht Konfigurationen) — daher höhere N als im MD,
#   das teils auf Konfig-/Aggregat-Ebene gezählt hatte.
#
# TRAM
#   Standard: Tram-Szenen ausgeschlossen (FS-Art == 'Tram'); separat in §2 ausgewiesen.
#
# Aufruf:  python3 tools/verify_06.py     (schreibt 06_verifikation.json + .md)
# ════════════════════════════════════════════════════════════════════════════

import csv, json, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, 'FixMyCity_Daten')      # radwege-/scenes-CSVs + SurveyResults JSON


def p(name):
    """Ausgabe-/Projektpfad (VeloroutenCheck-Root): 06_verifikation.* , 06_visualisierung.html."""
    return os.path.join(ROOT, name)


def d(name):
    """FixMyCity-Datenpfad (FixMyCity_Daten/): radwege_*.csv , scenes_*.csv."""
    return os.path.join(DATA, name)


# ── Codebücher (Spezifikation + radwege-check.de/auswertung) ──────────────────
AGEGROUP = {0: 'unter 18', 1: '18–24', 2: '25–29', 3: '30–39',
            4: '40–49', 5: '50–64', 6: '65–74', 7: 'über 74'}
BICYCLEUSE = {0: '≤10 min', 1: '≤20 min', 2: '≤30 min', 3: '>30 min', 4: 'weiß nicht'}
USERGROUP = {'bicycle': 'habituell', 'potentialBicycle': 'potenziell',
             'car': 'Auto', 'pedestrian': 'Fuss'}
# Nutzungshäufigkeit Fahrrad = transportRatings.bicycle («Wie häufig nutzen Sie diese Verkehrsmittel?»)
#   0 Nie · 1 seltener als monatlich · 2 1–3×/Monat · 3 1–3×/Woche · 4 4–5×/Woche · 5 (fast) täglich
# Kategorien 0–2 sind selten (kleine N) → zu «selten (≤ monatl.)» gebündelt.
FREQBIKE = {'selten': 'selten (≤ monatl.)', 'w13': '1–3×/Woche',
            'w45': '4–5×/Woche', 'taeglich': '(fast) täglich'}


def freq_bucket(v):
    if v is None:
        return None
    v = int(v)
    if v <= 2:
        return 'selten'
    return {3: 'w13', 4: 'w45', 5: 'taeglich'}.get(v)


# ── Szenen-Merkmale aus scenes_*.csv → normalisierte Attribute je SceneID ─────
#
# Führungsform-Ableitung (siehe 06 / Datenkodierung):
#   Mischverkehr     : MS, RVA-Breite == 0
#   Radstreifen      : RVA-Breite in {2.0, 3.5}, KEINE bauliche Trennung, auf Fahrbahn
#   geschützt        : bauliche Trennung vorhanden (Tr_li-baulTrennung != '-')
#   Seitenraum       : CP, Radweg im Seitenraum, ohne bauliche Trennung
#
# Kontext (Tempo×Aufkommen): nur MS variiert ihn. CP ist per Experiment-Vorgabe
# Hauptverkehrsstrasse 50 km/h / wenig Verkehr (bestätigt durch radwege-Decode:
# alle CP-Konfigurationen = vehicleLaneMaxspeed 50 / low_traffic_volumen).
def fnum(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def load_scenes():
    scenes = {}

    # MS — Führung auf der Fahrbahn (Mischverkehr / Radstreifen / geschützt)
    for r in csv.DictReader(open(d('scenes_ms.csv'))):
        w = fnum(r['RVA-Breite'])
        prot = r['Tr_li-baulTrennung'] not in ('-', '', None)
        tram = r['FS-Art'] == 'Tram'
        if w == 0:
            ff = 'Mischverkehr'
        elif prot:
            ff = 'geschützt'
        else:
            ff = 'Radstreifen'
        vol = {'normal': 'wenig', 'viel': 'viel+SV'}.get(r['FS-Aufkommen'])
        spd = r['FS-Geschwindigkeit'] if r['FS-Geschwindigkeit'] in ('30', '50') else None
        scenes[r['SceneID']] = dict(
            exp='MS', fuehrungsform=ff, lage='Fahrbahn',
            width=w, protected=prot, tram=tram,
            speed=spd, volume=vol,
            marking=r['Tr_li-Markierung'],
            parking=(r['Parken'] not in ('-', 'nein', '', None)),
            surface=r['RVA-Oberfläche'],
        )

    # CP — Radweg/RVA im Seitenraum (Experiment-Vorgabe: Hauptstr. 50 / wenig).
    # «Seitenraum» fasst das gesamte CP-Experiment: bauliche Trennung wirkt hier
    # empirisch kaum (Velo ist ohnehin von der Fahrbahn abgesetzt) → kein eigenes
    # «geschützt». «geschützt» bleibt damit der fahrbahn-seitige Poller-Streifen (MS).
    for r in csv.DictReader(open(d('scenes_cp.csv'))):
        w = fnum(r['RVA-Breite'])
        prot = r['Tr_li_baulTrennung'] not in ('-', '', None)
        scenes[r['SceneID']] = dict(
            exp='CP', fuehrungsform='Seitenraum', lage='Seitenraum',
            width=w, protected=prot, tram=False,
            speed='50', volume='wenig',
            marking=r['Tr_li-Art'],
            parking=(r['Links_RVA'] == 'Parken'),
            surface=None,
        )

    # SE — Nebenstrassen (Quartier/Velostrasse) — für §1 nicht zentral; mitgeführt.
    for r in csv.DictReader(open(d('scenes_se.csv'))):
        scenes[r['SceneID']] = dict(
            exp='SE', fuehrungsform='Nebenstrasse', lage='Nebenstrasse',
            width=None, protected=False, tram=False,
            speed=None, volume=r.get('Verkehrsaufkommen'),
            marking=None, parking=(r['Parken'] != 'nein'), surface=None,
        )
    return scenes


# ── Einzelantworten (Velo) mit Szenen-Merkmalen + Befragten-Typ verknüpfen ────
def load_records(scenes):
    data = json.load(open(d('SurveyResults_200414.json')))
    recs = []
    miss = 0
    for s in data:
        prof = s.get('profile') or {}
        if prof.get('perspective') != 'C':
            continue
        typ = dict(
            userGroup=prof.get('userGroup'),
            bicycleUse=prof.get('bicycleUse'),
            ageGroup=prof.get('ageGroup'),
            gender=prof.get('gender'),
            freqBike=freq_bucket((prof.get('transportRatings') or {}).get('bicycle')),
        )
        for rt in (s.get('ratings') or []):
            sc = scenes.get(rt['scene_id'])
            if sc is None:
                miss += 1
                continue
            rating = rt.get('rating')
            if rating is None:
                continue
            rec = dict(sc)
            rec['feelsafe'] = 1 if int(rating) >= 2 else 0
            rec.update(typ)
            recs.append(rec)
    return recs, miss


# ── Aggregation ───────────────────────────────────────────────────────────────
def share(rows):
    n = len(rows)
    if n == 0:
        return (None, 0)
    return (round(100 * sum(r['feelsafe'] for r in rows) / n, 1), n)


# Typ-Dimensionen: Funktion liefert (Label, Reihenfolge) je Datensatz; None = ausschliessen
def dim_categories(dim):
    if dim == 'userGroup':
        return [('bicycle', 'habituell'), ('potentialBicycle', 'potenziell')]
    if dim == 'bicycleUse':
        return [(k, BICYCLEUSE[k]) for k in (0, 1, 2, 3)]
    if dim == 'ageGroup':
        return [(k, AGEGROUP[k]) for k in range(8)]
    if dim == 'gender':
        return [('m', 'm'), ('w', 'w'), ('d', 'd')]
    if dim == 'freqBike':
        return [(k, FREQBIKE[k]) for k in ('selten', 'w13', 'w45', 'taeglich')]
    return []


DIMS = ['userGroup', 'bicycleUse', 'freqBike', 'ageGroup', 'gender']


def split(rows, dim):
    """rows → {kategorie_label: (share, n)} für die Typ-Dimension dim, plus 'Gesamt'."""
    out = {'Gesamt': share(rows)}
    for key, label in dim_categories(dim):
        sub = [r for r in rows if r.get(dim) == key]
        out[label] = share(sub)
    return out


def all_splits(rows):
    """rows → {'Gesamt':(s,n), 'userGroup':{...}, 'bicycleUse':{...}, ...}"""
    res = {'Gesamt': share(rows)}
    for d in DIMS:
        res[d] = {label: share([r for r in rows if r.get(d) == key])
                  for key, label in dim_categories(d)}
    return res


# ── Selektoren (Filterdefinitionen, explizit & dokumentiert) ──────────────────
def sel(recs, **cond):
    def ok(r):
        for k, v in cond.items():
            if callable(v):
                if not v(r.get(k)):
                    return False
            elif r.get(k) != v:
                return False
        return True
    return [r for r in recs if ok(r)]


def main():
    scenes = load_scenes()
    recs, miss = load_records(scenes)
    nontram = [r for r in recs if not r['tram']]
    print(f'Bewertungen (Velo): {len(recs)}  | nicht zuordenbar: {miss}  | tram-bereinigt: {len(nontram)}')

    out = {'meta': {}, 'sections': {}}
    out['meta'] = dict(
        n_ratings=len(recs), n_nontram=len(nontram), n_miss=miss,
        agegroup=AGEGROUP, bicycleuse=BICYCLEUSE, usergroup=USERGROUP, freqbike=FREQBIKE,
    )

    CTX = [('30', 'wenig'), ('30', 'viel+SV'), ('50', 'wenig'), ('50', 'viel+SV')]

    # ── §1 Kontextmatrix (MS: Tempo×Aufkommen) ──────────────────────────────
    forms = {
        'Mischverkehr': dict(fuehrungsform='Mischverkehr'),
        'Radstreifen ungeschützt': dict(fuehrungsform='Radstreifen'),
        'Radstreifen breit 3.5m': dict(fuehrungsform='Radstreifen', width=3.5),
        'geschützt': dict(fuehrungsform='geschützt'),
    }
    sec1 = {}
    for fname, cond in forms.items():
        cells = {}
        for spd, vol in CTX:
            rows = sel(nontram, speed=spd, volume=vol, **cond)
            cells[f'T{spd}/{vol}'] = all_splits(rows)
        sec1[fname] = cells
    # Seitenraum nur 50/wenig (CP-Vorgabe)
    sec1['Seitenraum'] = {'T50/wenig': all_splits(sel(nontram, fuehrungsform='Seitenraum'))}
    out['sections']['kontextmatrix'] = sec1

    # ── §2 Anlagentyp-Leiter (gesamt, tram-bereinigt) ───────────────────────
    ladder = {
        'Mischverkehr': dict(fuehrungsform='Mischverkehr'),
        'Radstreifen 2m': dict(fuehrungsform='Radstreifen', width=2.0),
        'Radstreifen 3.5m': dict(fuehrungsform='Radstreifen', width=3.5),
        'Seitenraum': dict(fuehrungsform='Seitenraum'),
        'geschützt 2m': dict(fuehrungsform='geschützt', width=2.0),
        'geschützt 3.5m': dict(fuehrungsform='geschützt', width=3.5),
    }
    out['sections']['anlagentyp_leiter'] = {
        k: all_splits(sel(nontram, **c)) for k, c in ladder.items()}

    # ── §2 Tempo-Effekt 30→50 je Führungsform (gesamt) ──────────────────────
    tempo = {}
    for k, c in {'Mischverkehr': dict(fuehrungsform='Mischverkehr'),
                 'Radstreifen 2m': dict(fuehrungsform='Radstreifen', width=2.0),
                 'Radstreifen 3.5m': dict(fuehrungsform='Radstreifen', width=3.5),
                 'geschützt': dict(fuehrungsform='geschützt')}.items():
        s30 = share(sel(nontram, speed='30', **c))
        s50 = share(sel(nontram, speed='50', **c))
        tempo[k] = {'T30': s30, 'T50': s50,
                    'delta': (None if s30[0] is None or s50[0] is None
                              else round(s50[0] - s30[0], 1))}
    out['sections']['tempo_effekt'] = tempo

    # ── §3 RVA-Breite 2.0 vs 3.5 (Fahrbahn, unterbrochen, ungeschützt) ───────
    def width_block(extra):
        base = dict(fuehrungsform='Radstreifen', protected=False,
                    marking='unterbrochen')
        b = {}
        for w in (2.0, 3.5):
            b[f'{w}m'] = all_splits(sel(nontram, width=w, **base, **extra))
        return b
    sec3 = {
        'ALLE': width_block({}),
        'T30': width_block(dict(speed='30')),
        'T50': width_block(dict(speed='50')),
        'T30/wenig': width_block(dict(speed='30', volume='wenig')),
        'T30/viel+SV': width_block(dict(speed='30', volume='viel+SV')),
        'T50/wenig': width_block(dict(speed='50', volume='wenig')),
        'T50/viel+SV': width_block(dict(speed='50', volume='viel+SV')),
    }
    out['sections']['rva_breite'] = sec3

    # ── §4 Breite × Parken (Fahrbahn, ungeschützt) ──────────────────────────
    def wp(parking, extra=None):
        base = dict(fuehrungsform='Radstreifen', protected=False)
        if extra:
            base.update(extra)
        return {f'{w}m': all_splits(sel(nontram, width=w, parking=parking, **base))
                for w in (2.0, 3.5)}
    sec4 = {
        'ohne Parken': wp(False),
        'mit Parken': wp(True),
        'T30 ohne Parken': wp(False, dict(speed='30')),
        'T30 mit Parken': wp(True, dict(speed='30')),
        'T50 ohne Parken': wp(False, dict(speed='50')),
        'T50 mit Parken': wp(True, dict(speed='50')),
    }
    out['sections']['breite_parken'] = sec4

    # ── §2 Tram-Effekt (Vergleich mit/ohne Tram, Mischverkehr & mit RVA) ─────
    def tram_pair(cond):
        with_t = share(sel(recs, tram=True, **cond))
        without = share(sel(recs, tram=False, **cond))
        d = (None if with_t[0] is None or without[0] is None
             else round(with_t[0] - without[0], 1))
        return {'mit Tram': with_t, 'ohne Tram': without, 'delta': d}
    out['sections']['tram_effekt'] = {
        'Mischverkehr': tram_pair(dict(fuehrungsform='Mischverkehr')),
        'Radstreifen': tram_pair(dict(fuehrungsform='Radstreifen')),
    }

    # ── Kreuzvalidierung: JSON-feel-safe je Konfiguration vs radwege voteScore ─
    xval = crossvalidate(scenes, recs)
    out['sections']['kreuzvalidierung'] = xval

    json.dump(out, open(p('06_verifikation.json'), 'w'), ensure_ascii=False, indent=1)
    write_md(out)
    write_html(out)
    print('geschrieben: 06_verifikation.json , 06_verifikation.md , 06_visualisierung.html')
    print_summary(out)


def write_html(out):
    """Daten in das HTML-Template injizieren → eigenständige Seite (offline)."""
    tpl = open(os.path.join(HERE, 'visualisierung_template.html'), encoding='utf-8').read()
    payload = json.dumps(out, ensure_ascii=False)
    html = tpl.replace('__DATA__', payload)
    open(p('06_visualisierung.html'), 'w', encoding='utf-8').write(html)


def crossvalidate(scenes, recs):
    """JSON-feel-safe je SceneID gegen radwege voteScore (Join via sceneId, '01_' weg)."""
    # JSON: feel-safe je scene_id
    agg = defaultdict(lambda: [0, 0])
    for r in recs:
        pass  # recs lost scene_id; recompute from raw below
    # Re-derive per scene_id directly from JSON (recs dropped the id)
    data = json.load(open(d('SurveyResults_200414.json')))
    for s in data:
        if (s.get('profile') or {}).get('perspective') != 'C':
            continue
        for rt in (s.get('ratings') or []):
            sid = rt['scene_id']
            rating = rt.get('rating')
            if rating is None:
                continue
            a = agg[sid]
            a[0] += 1 if int(rating) >= 2 else 0
            a[1] += 1
    # radwege voteScore je sceneId
    rw = {}
    for row in csv.DictReader(open(d('radwege_hauptstrassen.csv'))):
        sid = row['sceneId']
        vs = fnum(row['voteScore'])
        if sid and vs is not None:
            rw[sid] = vs
    diffs = []
    matched = 0
    for sid, (safe, n) in agg.items():
        key = sid[3:] if sid.startswith('01_') else sid  # '01_MS_C_5' -> 'MS_C_5'
        if key in rw and n > 0:
            mine = 100 * safe / n
            diffs.append(abs(mine - rw[key]))
            matched += 1
    diffs.sort()
    if diffs:
        mean = sum(diffs) / len(diffs)
        med = diffs[len(diffs) // 2]
        p95 = diffs[int(len(diffs) * 0.95)]
        return dict(matched=matched, mean_abs_diff=round(mean, 2),
                    median_abs_diff=round(med, 2), p95_abs_diff=round(p95, 2),
                    max_abs_diff=round(diffs[-1], 2))
    return dict(matched=0)


# ── 06-Referenzwerte (aus dem MD, Velo) zum Soll/Ist-Vergleich ───────────────
REF06 = {
    'kontextmatrix': {  # form -> {ctx: wert}
        'Mischverkehr': {'T30/wenig': 27, 'T30/viel+SV': 20, 'T50/wenig': 15, 'T50/viel+SV': 12},
        'Radstreifen ungeschützt': {'T30/wenig': 70, 'T30/viel+SV': 67, 'T50/wenig': 63, 'T50/viel+SV': 64},
        'Radstreifen breit 3.5m': {'T30/wenig': 80, 'T30/viel+SV': 78, 'T50/wenig': 72, 'T50/viel+SV': 75},
        'geschützt': {'T30/wenig': 92, 'T30/viel+SV': 91, 'T50/wenig': 92, 'T50/viel+SV': 91},
        'Seitenraum': {'T50/wenig': 82},
    },
    'anlagentyp_leiter': {'Mischverkehr': 15, 'Radstreifen 2m': 51, 'Radstreifen 3.5m': 77,
                          'Seitenraum': 81, 'geschützt 2m': 87, 'geschützt 3.5m': 95},
    'rva_breite': {  # ctx -> {2.0m, 3.5m}
        'ALLE': {'2.0m': 46.7, '3.5m': 73.4}, 'T30': {'2.0m': 49.8, '3.5m': 75.8},
        'T50': {'2.0m': 43.7, '3.5m': 70.9}, 'T30/wenig': {'2.0m': 53.3, '3.5m': 78.2},
        'T30/viel+SV': {'2.0m': 48.1, '3.5m': 74.5}, 'T50/wenig': {'2.0m': 43.0, '3.5m': 73.9},
        'T50/viel+SV': {'2.0m': 44.0, '3.5m': 69.4},
    },
}


def write_md(out):
    L = []
    A = L.append
    A('# VeloroutenCheck — Verifikation der Empirie-Ergebnisse (06)\n')
    A('Unabhängige Neuberechnung **aus den Einzelantworten** '
      '(`SurveyResults_200414.json`, nur Velo-Perspektive) ⋈ decodierte Szenen-Merkmale '
      '(`scenes_ms/cp/se.csv`). feel-safe % = Anteil Bewertungen mit `rating ≥ 2`; '
      'N = Anzahl Einzelbewertungen. Tram-Szenen ausgeschlossen.\n')
    m = out['meta']
    A(f'Velo-Bewertungen total: **{m["n_ratings"]}** · tram-bereinigt: **{m["n_nontram"]}** · '
      f'nicht zuordenbar: {m["n_miss"]}.\n')

    xv = out['sections']['kreuzvalidierung']
    A('## Kreuzvalidierung gegen radwege `voteScore`\n')
    A('JSON-feel-safe je Szene vs. offizieller `voteScore` (gleiche Szene). '
      'Geringe Differenz = Join + Metrik korrekt.\n')
    A('```')
    A(f'verglichene Szenen : {xv.get("matched")}')
    A(f'mittlere |Differenz|: {xv.get("mean_abs_diff")}  Punkte')
    A(f'Median  |Differenz|: {xv.get("median_abs_diff")}  Punkte')
    A(f'95%-Perzentil      : {xv.get("p95_abs_diff")}  Punkte')
    A(f'max |Differenz|    : {xv.get("max_abs_diff")}  Punkte')
    A('```\n')

    def g(splits):  # Gesamt-Wert (share,n)
        return splits['Gesamt']

    # §1
    A('## §1 Kontextmatrix — feel-safe % (Velo gesamt) | MD-Wert | Δ | N\n')
    A('```')
    A(f'{"Führungsform":<26}{"Kontext":<14}{"neu":>6}{"MD":>6}{"Δ":>7}{"N":>9}')
    for form, cells in out['sections']['kontextmatrix'].items():
        ref = REF06['kontextmatrix'].get(form, {})
        for ctx, splits in cells.items():
            v, n = g(splits)
            r = ref.get(ctx)
            d = '' if (v is None or r is None) else f'{v - r:+.1f}'
            A(f'{form:<26}{ctx:<14}{("" if v is None else v):>6}{("" if r is None else r):>6}{d:>7}{n:>9}')
    A('```\n')

    # §2 Leiter
    A('## §2 Anlagentyp-Leiter — feel-safe % (Velo gesamt) | MD | Δ | N\n')
    A('```')
    A(f'{"Anlagentyp":<20}{"neu":>6}{"MD":>6}{"Δ":>7}{"N":>9}')
    for k, splits in out['sections']['anlagentyp_leiter'].items():
        v, n = g(splits)
        r = REF06['anlagentyp_leiter'].get(k)
        d = '' if (v is None or r is None) else f'{v - r:+.1f}'
        A(f'{k:<20}{("" if v is None else v):>6}{("" if r is None else r):>6}{d:>7}{n:>9}')
    A('```\n')

    # §2 Tempo-Effekt
    A('## §2 Tempo-Effekt 30→50 (Δ feel-safe, Velo gesamt)\n')
    A('```')
    A(f'{"Führungsform":<20}{"T30":>7}{"T50":>7}{"Δ":>7}')
    for k, d in out['sections']['tempo_effekt'].items():
        A(f'{k:<20}{str(d["T30"][0]):>7}{str(d["T50"][0]):>7}{str(d["delta"]):>7}')
    A('```\n')

    # §3 RVA-Breite
    A('## §3 RVA-Breite 2,0 vs 3,5 m (Fahrbahn, unterbrochen, ungeschützt)\n')
    A('feel-safe % (neu) mit N, plus MD-Wert. Filter ggf. enger als 06 → Δ/N transparent.\n')
    A('```')
    A(f'{"Kontext":<14}{"2.0 neu":>9}{"(N)":>8}{"2.0 MD":>8}{"3.5 neu":>9}{"(N)":>8}{"3.5 MD":>8}')
    for ctx, b in out['sections']['rva_breite'].items():
        v2, n2 = g(b['2.0m']); v3, n3 = g(b['3.5m'])
        r = REF06['rva_breite'].get(ctx, {})
        A(f'{ctx:<14}{str(v2):>9}{n2:>8}{str(r.get("2.0m","")):>8}'
          f'{str(v3):>9}{n3:>8}{str(r.get("3.5m","")):>8}')
    A('```\n')

    # §4 Breite×Parken
    A('## §4 Breite × Parken (Fahrbahn, ungeschützt) — feel-safe % (N)\n')
    A('```')
    A(f'{"Fall":<18}{"2.0m":>8}{"(N)":>8}{"3.5m":>8}{"(N)":>8}{"Δ Breite":>10}')
    for fall, b in out['sections']['breite_parken'].items():
        v2, n2 = g(b['2.0m']); v3, n3 = g(b['3.5m'])
        dd = '' if (v2 is None or v3 is None) else f'{v3 - v2:+.1f}'
        A(f'{fall:<18}{str(v2):>8}{n2:>8}{str(v3):>8}{n3:>8}{dd:>10}')
    A('```\n')

    # §2 Tram
    A('## §2 Tram-Effekt (mit − ohne Tram)\n')
    A('```')
    A(f'{"Kontext":<16}{"mit Tram":>10}{"ohne Tram":>11}{"Δ":>7}')
    for k, d in out['sections']['tram_effekt'].items():
        A(f'{k:<16}{str(d["mit Tram"][0]):>10}{str(d["ohne Tram"][0]):>11}{str(d["delta"]):>7}')
    A('```\n')

    open(p('06_verifikation.md'), 'w').write('\n'.join(L))


def print_summary(out):
    print('\n— Anlagentyp-Leiter (neu | MD) —')
    for k, splits in out['sections']['anlagentyp_leiter'].items():
        v, n = splits['Gesamt']
        r = REF06['anlagentyp_leiter'].get(k)
        print(f'  {k:<18} {str(v):>6} | {str(r):>4}  (N={n})')
    xv = out['sections']['kreuzvalidierung']
    print(f'\nKreuzvalidierung: {xv.get("matched")} Szenen, '
          f'mittlere |Diff| {xv.get("mean_abs_diff")} Pkt, Median {xv.get("median_abs_diff")} Pkt')


if __name__ == '__main__':
    main()
