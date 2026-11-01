# 08 — Peer-reviewte Primärquelle & Abgleich mit dem Rechner

**Quelle:** R. von Stülpnagel & N. Binnig (2022): *How safe do you feel? – A large-scale survey
concerning the subjective safety associated with different kinds of cycling lanes.*
**Accident Analysis and Prevention 167: 106577.** DOI:
[10.1016/j.aap.2022.106577](https://doi.org/10.1016/j.aap.2022.106577). Daten: ODbL (FixMyCity).

Diese Studie ist die **peer-reviewte Auswertung genau des Datensatzes**, den `tools/verify_06.py`
neu berechnet (`SurveyResults_200414.json`). Sie dient hier als unabhängige Plausibilisierung der
feel-safe-Anker des Rechners.

---

## 1. Datenbasis & Bereinigung (Abgrenzung beachten)

- Berliner Online-Befragung (Tagesspiegel, Winter 2019/20); 4-stufige Skala 0–3,
  **feel-safe := Rating ≥ 2** (identisch zu unserer Definition).
- Das Paper analysiert die Teilmenge **„major streets"**, Velo-Perspektive.
- **Bereinigung (Paper, S. 4):** entfernt wurden „incomplete cases" = fehlende demografische
  Angaben, Fälle ganz ohne bewertete Bilder, technische Fehler → **N = 92 526** Bewertungen von
  **13 735** Personen.
- **Wichtig:** Das Paper verlangt **keine** abgeschlossenen 10er-Blöcke (S. 4, Fussnote: eine
  Mindestzahl bewerteter Bilder hätte die Resultate nur in der 2. Nachkommastelle verändert; im
  Mittel 6,75 Bilder/Block).

## 2. Direkter Anker: feel-safe-Gesamtquote

| | feel-safe gesamt |
|---|---|
| Paper (Tabelle 1, S. 4: Rating-Verteilung 7 609 / 17 762 / 35 071 / 32 084) | **72,6 %** |
| Rechner (`verify_06.py`, Experiment „MS") | **72,5 %** |

Praktisch deckungsgleich → **gleiche Daten, gleiche Kennzahl**. (Die Fallzahlen unterscheiden sich:
unser MS-Total 107 580 vs. 92 526, v. a. weil wir Personen mit fehlender Demografie **nicht**
ausschliessen und „major streets" anders abgrenzen. Ein Anteil wie feel-safe ist davon robust.)

## 3. Faktor-Abgleich (Richtung & Rangordnung)

Das Paper berichtet **multivariat-adjustierte ordinale GLM-Koeffizienten (Logit B)**; wir berichten
**bivariate feel-safe-Differenzen (%-Punkte)** aus denselben Daten. → Vergleichbar sind **Vorzeichen
und Rangordnung**, nicht die Absolutwerte.

| Faktor | Paper (Logit B, Fundstelle) | Rechner (Δ feel-safe, bivariat) | Richtung |
|---|---|---|---|
| Breite 2,0 → 3,5 m | +0,90 (Tab. 2, S. 5) | +20,5 Pkt | ✓ stark + |
| Bauliche Trennung (Radstreifen → geschützt) | +1,14 (Left buffer „physical separation", Tab. 2, S. 5) | +19,3 Pkt | ✓ stark + |
| Farbiger Belag | +0,67 (CL surface coloured, Tab. 2, S. 5) | +7,1 Pkt | ✓ + |
| Tempo 30 → 50 | −0,19 (Tab. 2, S. 5) | −5,0 … −7,6 Pkt | ✓ − |
| Parken (ohne → mit) | ≈ −0,79 (Right buffer „no buffer" +0,79, Tab. 2, S. 5) | −13,1 Pkt | ✓ − |
| Tram (Radstreifen-Kontext) | −0,10 (Street type „tram tracks", Tab. 2, S. 5) | Radstreifen ~0 · Mischverkehr −13,3 | ✓ |

Beide Analysen sehen **Breite** und **bauliche Trennung** als stärkste Hebel — genau die Grössen,
auf denen die Kern-Konstanten des Rechners beruhen.

## 4. Confounder-/Orthogonalitäts-Prüfung (Breite × Farbe)

Frage: Ist der Breiten-Effekt (+20,5) teilweise durch die Farbe getrieben? Test = Breite 2,0 → 3,5 m
**je Belag getrennt**:

| | 2,0 m | 3,5 m | Δ |
|---|---|---|---|
| gepoolt | 56,4 % | 76,9 % | +20,5 |
| nur grau (Asphalt) | 49,7 % | 71,4 % | +21,7 |
| nur farbig | 63,2 % | 82,4 % | +19,2 |

Farb-Zusammensetzung: in **beiden** Breiten-Gruppen **50 % grau / 50 % farbig** → die Faktoren sind
durch das **gekreuzte Versuchsdesign orthogonal**. Der Breiten-Effekt bleibt mit Farbkontrolle
praktisch unverändert (~20,5).

**Folgerung:** Weil die Befragung ein **faktorielles Experiment** ist (Faktoren systematisch
unabhängig variiert), liegen unsere **bivariaten** Differenzen sehr nahe an den **adjustierten**
Paper-Koeffizienten — die Confounder-Sorge gilt v. a. für beobachtende, nicht für diese
experimentell balancierten Vergleiche.

**Nebenbefund (Nicht-Additivität):** Der Breiten-Effekt ist auf grauem Belag grösser (+21,7) als auf
farbigem (+19,2) — Farbe und Breite wirken leicht **sub-additiv**, konsistent mit der Kernaussage
des Papers (mehrere positive Merkmale addieren sich nicht voll; eine markante Massnahme genügt;
S. 6–7).

## 5. Grenzen des Abgleichs

- **Einheiten:** Logit-B ≠ %-Punkte → keine Wert-für-Wert-Gleichheit.
- **Adjustiert vs. bivariat:** im Mittel durch das Design wenig relevant (siehe §4), aber nicht null.
- **Nur Strecken, keine Knoten** (Paper S. 7, §4.3) → die Anker sind **nicht** auf Kreuzungen
  übertragbar.
- **Berliner Stichprobe**, statische 2D-Bilder, Vielfahrende überrepräsentiert → Übertrag auf Bern
  mit Vorsicht (vgl. Diskussion „Seitenraum" in [02](02_CH_Querschnitte_und_Fuehrungsdiagramm.md) /
  README, Offene Punkte).

## 6. Reproduktion

```
python3 tools/verify_06.py     # feel-safe je Faktor, §-Tabellen, Kreuzvalidierung
```
Die Zahlen in §2–4 stammen aus denselben Loadern (`load_scenes`, `load_records`, `share`).
