# VeloroutenCheck — Mapping radwege-check → Führungsformen + Kontextanalyse

Empirische Basis: **radwege-check.de** (FixMyCity), Velo-Perspektive, mengengewichtet
(`voteScore` 0–100 = feel-safe; `voteMeans` 0–3). Quelle/Schema siehe `04_Radwege-Check_Daten.md`.
Status: **Vorschlag zur Gegenprüfung.**

Daten-Dateien: `radwege_hauptstrassen.csv`, `radwege_nebenstrassen.csv`,
`analyse_fuehrungsform_kontext.csv` (Führungsform × Tempo × Aufkommen).

**Methodenhinweis (Tram):** Szenen mit Tram in der Mischfläche (`vehicleLaneUsage =
motor_vehicle_and_tram`) sind in **allen** Auswertungen hier **ausgeschlossen** — sie werden
stark abweichend (sehr tief) bewertet und sind ungleich über die Vergleichsfelder verteilt,
würden Vergleiche also verzerren. Der **Tram-Effekt separat** (informativ): Mischverkehr ~−10,
bei vorhandener RVA ~−6. (Tram ist für Bern real relevant — bei Bedarf als eigener Faktor führen.)

---

## 1. Mapping Führungsform → empirischer Sicherheitswert

Vorgeschlagene Skala **Score → Note**: ≥90→1 · 75–89→2 · 60–74→3 · 45–59→4 · 30–44→5 · <30→6.

```
Führungsform (VeloroutenCheck)        radwege-Filter                               Score  Means  Note
------------------------------  -------------------------------------------  -----  -----  ----
Q6 Mischverkehr Hauptachse      keine RVA (Breite 0)                           18   0.70    6
Q1 Radstreifen schmal (2 m)     primary_road, 2 m, ungeschützt, neben Kfz      51   1.48    4
Q1 Radstreifen breit (3.5 m)    primary_road, 3.5 m, ungeschützt, neben Kfz    76   2.00    2
Q1 Variante rechts vom Parken   leftOfBicycleLane = parking_lane               93   2.60    1
Q2a/Q2b strassenbegl.(geschützt) primary_road, baul. Trennung (Poller/Hecke/   91   2.51    1
                                 Kasten)  [nur 3.5 m: 95]
Q3 abgesetzter Radweg           pavement, "mit Trennung z. Fussverkehr"        81   2.22    2
Q11 komb. Fuss-/Radweg  (!)      pavement, "ohne Trennung z. Fussverkehr"      81   2.19    2 (!)
Q7 Einbahn Velogegenverkehr     NVS, one_way_for_cars_only                     27   0.97    6
Q8 Quartierstrasse T30/T20      NVS, ohne Markierung / Spielstrasse            38   1.22    5
Q9 Velostrasse                  NVS, Fahrradstr./Sondermark./grün              48   1.48    4
```

(!) Q11: die radwege-Szene „Seitenraum ohne Trennung" ist eine *breite Velofläche*, nicht ein
schmaler gemeinsamer Fuss-/Velo-Weg → 81 ist vermutlich **zu hoch**; tiefer ansetzen.

### Lücken (keine direkten Daten)
- **Q4 Umweltspur (Bus+Velo)** — kein Pendant; Anker „Mischverkehr inkl. Tram/Bus" tief → ~Note 5–6.
- **Q5 Kernfahrbahn** — kein sauberes Pendant; ~schmaler Radstreifen (~51 → Note 4). prüfen.
- **Q10 Zweirichtungsradweg** — nicht erhoben; Seitenraum als Proxy, real eher schlechter (Knoten).
- **Q2a vs Q2b** — Daten trennen A/B nicht → gleicher Wert (~91).
- **Fussweg, Velo gestattet** — nicht erhoben.

---

## 2. Kontextanalyse — Tempo × Verkehrsaufkommen

Score (Velo, tram-bereinigt) je Führungsform × Verkehrskontext — *innerhalb* einer Spalte
(= fester Kontext) die Führungsformen vergleichen:
```
Führungsform                  T30/wenig  T30/viel+SV  T50/wenig  T50/viel+SV
Mischverkehr (keine RVA)         27          20          15          12
Radstreifen ungeschützt          70          67          63          64
  davon breit 3.5 m              80          78          72          75
geschützte RVA (Poller…)         92          91          92          91
Seitenraum-Radweg                 –           –          82           –
```
Lesart (Validierung der 2-Dimensionen-Wahl): Kontext **T50/viel+SV** → Mischverkehr 12 ≪
Radstreifen 64 ≪ geschützt 91 — wird die geeignetere (separierte) Führungsform gewählt,
**steigt der Score deutlich**. Mischverkehr fällt mit steigendem Tempo/Verkehr (27→12),
separierte Formen bleiben hoch.

Effekt **Tempo 30 → 50** (ohne Tram-Szenen, je Führungsform):
```
Mischverkehr             -10   (22 -> 13)
Radstreifen schmal 2 m    -4   (53 -> 48)
Radstreifen breit 3.5 m   -5   (79 -> 74)
geschützt                ~0    (kontext-robust)
```

### Ergebnis zur Hypothese
- **Bestätigt:** Je weniger Separation, desto **stärker sinkt die Bewertung** bei steigendem
  Tempo/Aufkommen; baulich getrennte Formen bleiben **kontext-robust**. → stützt die Masterplan-
  Logik (mehr Separation nötig bei höherem DTV/Tempo).
- **Nuance:** Die Daten zeigen **nicht**, dass Mischverkehr im „passenden" Kontext *gut* wird —
  er bleibt selbst bei T30/wenig tief (27) gegenüber Radweg (91). Subjektive Sicherheit favorisiert
  Separation **stärker** als die Masterplan-Eignung (die Mischverkehr ≤30 / DTV<2'000 zulässt).

---

## 3. Einzeleffekte auf den feel-safe % (robuste Subgruppen-Vergleiche)

Methode: **je ein Faktor isoliert**, alle anderen grossen Merkmale konstant gehalten.
*Nicht* aus der additiven Regression — diese mittelt Wechselwirkungen weg und ist nur grobe
Orientierung (R² = 0,74); Einzel-Koeffizienten wie Tram/Tempo sind dort irreführend.

Anlagentyp-Leiter (feel-safe %, Velo):
```
Mischverkehr ~15  <  Radstreifen 2m ~51  <  Radstreifen 3.5m ~77
                  <  Seitenraum ~81  <  geschützt 2m 87 / 3.5m 95
```

Isolierte Effekte (Δ feel-safe %, sonst gleiche Konfiguration):
```
Breite 2 -> 3.5 m (Fahrbahn, ungeschützt)        +26    (51 -> 77)
Bauliche Trennung (Poller/Hecke/Kasten) @ 2 m    +35    (51 -> 87)
Bauliche Trennung @ 3.5 m                        +18    (77 -> 95)
Velo rechts vom Parken (statt daneben)        sehr gross (~93 vs ~41)
Parken neben dem Velo vorhanden (3.5 m)           -8    (83 -> 75)
Tempo 30 -> 50   Mischverkehr                    -10
                 Radstreifen schmal 2 m           -4
                 Radstreifen breit 3.5 m          -5
                 geschützt                        ~0    (kontext-robust)
Verkehrsmenge    Mischverkehr                     -5    (wenig -> viel+SV)
wenig->viel+SV   Radstreifen schmal 2 m           -2
Tram             im Mischverkehr                 -10
                 bei vorhandener RVA              -6
grüne Einfärbung                                 ~+10   (nur Regression, nicht subgruppen-geprüft)
```

**Rangordnung der Hebel:** Separation/Anlagentyp ≫ Breite ≫ Parken-Position ≫ Tempo ≫
Verkehrsmenge. **Tempo und Menge wirken v. a. ohne bauliche Trennung** (Wechselwirkung —
bei geschützter Führung ≈ 0).

---

## 4. Bedeutung für VeloroutenCheck
- **Eignung** (Masterplan DTV×Tempo) und **gefühlte Sicherheit** (radwege) sind **zwei verschiedene
  Dinge** — passt zu den **zwei Noten**: Eignung → Wahl/Geschwindigkeitsseite; radwege-Score →
  **Führungsformnote**.
- Die **Führungsformnote** sollte **Separation stark gewichten**; Tempo/Aufkommen v. a. bei
  *ungeschützten* Formen als Abzug, bei baulicher Trennung kaum.
- Merkmals-Effekte (Breite, Parken-Position, Trennung) liefern empirische Grössen für die
  **Abzüge/Zuschläge (Anhang B.2 bzw. Kriterien-Matrix B.1)**.

## 5. Vorbehalte
- Kontexte **nicht für alle Formen voll gekreuzt** (Seitenraum nur T50/gering; RVA überwiegend
  T50/gering) → Tempo-/Aufkommen-Effekt am saubersten für Mischverkehr + Radstreifen auf Fahrbahn.
- **Berlin/DE-Kontext**, Begriffe/Geometrie weichen von CH ab.
- Nur **subjektive Sicherheit** (Velo-Perspektive, inkl. potenzieller Radfahrender) — nicht objektive
  Unfallsicherheit, nicht die Geschwindigkeits-/Attraktivitätsnote.
- Score→Note-Skala (Abschnitt 1) ist ein **Vorschlag** und muss fachlich festgelegt werden.
