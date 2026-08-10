# VeloroutenCheck — Verifikation der Empirie-Ergebnisse (06)

Unabhängige Neuberechnung **aus den Einzelantworten** (`SurveyResults_200414.json`) ⋈ decodierte Szenen-Merkmale (`scenes_ms/cp/se.csv`). Gezählt wird jede Bewertung der **Velo-Foto-Szenen** (Kamera C) — unabhängig von der Befragtengruppe; massgebend ist, was das Foto zeigt. feel-safe % = Anteil Bewertungen mit `rating ≥ 2`; N = Anzahl Einzelbewertungen. Tram-Szenen ausgeschlossen.

Velo-Bewertungen total: **261876** · tram-bereinigt: **240529** · nicht zuordenbar: 206494.

## Kreuzvalidierung gegen radwege `voteScore`

JSON-feel-safe je Szene vs. offizieller `voteScore` (gleiche Szene). Geringe Differenz = Join + Metrik korrekt.

```
verglichene Szenen : 1700
mittlere |Differenz|: 1.76  Punkte
Median  |Differenz|: 1.24  Punkte
95%-Perzentil      : 4.92  Punkte
max |Differenz|    : 10.83  Punkte
```

## §1 Kontextmatrix — feel-safe % (Velo gesamt) | MD-Wert | Δ | N

```
Führungsform              Kontext          neu    MD      Δ        N
Mischverkehr              T30/wenig       27.1    27   +0.1      801
Mischverkehr              T30/viel+SV     20.0    20   +0.0     1692
Mischverkehr              T50/wenig       15.2    15   +0.2      774
Mischverkehr              T50/viel+SV     11.6    12   -0.4     1618
Radstreifen ungeschützt   T30/wenig       68.6    70   -1.4     7366
Radstreifen ungeschützt   T30/viel+SV     65.6    67   -1.4    14669
Radstreifen ungeschützt   T50/wenig       64.1    63   +1.1     7312
Radstreifen ungeschützt   T50/viel+SV     62.7    64   -1.3    14673
Radstreifen breit 3.5m    T30/wenig       79.7    80   -0.3     4171
Radstreifen breit 3.5m    T30/viel+SV     77.3    78   -0.7     8306
Radstreifen breit 3.5m    T50/wenig       76.4    72   +4.4     4177
Radstreifen breit 3.5m    T50/viel+SV     74.6    75   -0.4     8259
geschützt                 T30/wenig       91.7    92   -0.3     2519
geschützt                 T30/viel+SV     90.5    91   -0.5     4950
geschützt                 T50/wenig       90.9    92   -1.1     2511
geschützt                 T50/viel+SV     91.0    91   +0.0     5006
Seitenraum                T50/wenig       81.6    82   -0.4   135800
```

## §2 Anlagentyp-Leiter — feel-safe % (Velo gesamt) | MD | Δ | N

```
Anlagentyp             neu    MD      Δ        N
Mischverkehr          22.8    15   +7.8     5681
Radstreifen 2m        49.5    51   -1.5    19107
Radstreifen 3.5m      77.4    77   +0.4    26145
Seitenraum            81.6    81   +0.6   135800
geschützt 2m          86.8    87   -0.2     7406
geschützt 3.5m        94.8    95   -0.2     9647
```

## §2 Tempo-Effekt 30→50 (Δ feel-safe, Velo gesamt)

```
Führungsform            T30    T50      Δ
Mischverkehr           22.3   12.8   -9.5
Radstreifen 2m         51.6   47.5   -4.1
Radstreifen 3.5m       78.1   75.2   -2.9
geschützt              90.9   90.9    0.0
```

## §3 RVA-Breite 2,0 vs 3,5 m (Fahrbahn, unterbrochen, ungeschützt)

feel-safe % (neu) mit N, plus MD-Wert. Filter ggf. enger als 06 → Δ/N transparent.

```
Kontext         2.0 neu     (N)  2.0 MD  3.5 neu     (N)  3.5 MD
ALLE               46.5    5416    46.7     73.3    5540    73.4
T30                49.6    2669    49.8     75.5    2801    75.8
T50                43.4    2747    43.7     71.1    2739    70.9
T30/wenig          52.8     864    53.3     78.0     940    78.2
T30/viel+SV        48.0    1805    48.1     74.3    1861    74.5
T50/wenig          43.1     928    43.0     74.1     937    73.9
T50/viel+SV        43.6    1819    44.0     69.5    1802    69.4
```

## §4 Breite × Parken (Fahrbahn, ungeschützt) — feel-safe % (N)

```
Fall                  2.0m     (N)    3.5m     (N)  Δ Breite
ohne Parken           69.1    6027    85.0    7406     +15.9
mit Parken            40.5   13080    74.3   18739     +33.8
T30 ohne Parken       70.7    2937    85.0    3077     +14.3
T30 mit Parken        43.1    6621    75.9    9400     +32.8
T50 ohne Parken       67.7    3090    82.4    3097     +14.7
T50 mit Parken        37.8    6459    72.8    9339     +35.0
```

## §2 Tram in der Fahrbahn — feel-safe % (N) mit vs. ohne Tram

Δ = feel-safe(ohne) − feel-safe(mit) = Verlust durch Schienen in der Fahrbahn. Malus [Notenstufen] = Δ / 14,4 (feel-safe-Punkte pro Note, wie in `fuehrungsform.ts`).

**Mischverkehr**
```
Kontext            mit (N)      ohne (N)      Δ  Malus
Gesamt          7.5 (1635)   21.3 (1575)   13.8   0.96
Tempo 30         9.4 (839)    27.1 (801)   17.7   1.23
Tempo 50         5.4 (796)    15.2 (774)    9.8   0.68
```
**Radstreifen**  _(Referenz: eigene RVA → kaum Effekt)_
```
Kontext            mit (N)      ohne (N)      Δ  Malus
Gesamt        67.0 (14775)  66.4 (14678)   -0.6  -0.04
Tempo 30       68.5 (7437)   68.6 (7366)    0.1   0.01
Tempo 50       65.5 (7338)   64.1 (7312)   -1.4   -0.1
```

**Im Tool verdrahtet** (nur Mischverkehr): −1.2 bei Tempo ≤ 30, −0.7 bei Tempo > 30 — gerundete Tempo-Werte aus obiger Tabelle. Der „Gesamt"-Malus ist durch die Tempo-Mischung leicht überzeichnet; massgebend sind die tempo-kontrollierten Zeilen.


## §5 Kalibrierung der Notenkette — jede Konstante aus `fuehrungsform.ts`

Zellen: markierte Radstreifen auf der Standard-Kfz-Strasse (FS-Art «Kfz»), tram-bereinigt, beide Aufkommen gepoolt — Szenen, die sich sonst NUR im genannten Merkmal unterscheiden.

```
RS 2.0 m · ohne Parken · T30           73.0 %  (N=1960)
RS 2.0 m · ohne Parken · T50           68.1 %  (N=2049)
RS 2.0 m · mit Parken · T30            44.2 %  (N=4429)
RS 2.0 m · mit Parken · T50            38.5 %  (N=4348)
RS 3.5 m · ohne Parken · T30           85.5 %  (N=2048)
RS 3.5 m · ohne Parken · T50           83.3 %  (N=2050)
RS 3.5 m · mit Parken · T30            77.0 %  (N=6240)
RS 3.5 m · mit Parken · T50            73.7 %  (N=6231)

Anker gepoolt (Klassen-Mittel, wie FEELSAFE Mischverkehr/Radweg):
  Mischverkehr T30       22.3 %  (N=2493)
  Mischverkehr T50       12.8 %  (N=2392)
  Radstreifen T30        66.6 %  (N=22035)
  Radstreifen T50        63.2 %  (N=21985)
  geschützt T30          90.9 %  (N=7469)
  geschützt T50          90.9 %  (N=7517)

Referenz-Anker Radstreifen (2,5 m ohne Parken, interpoliert): T30 77.2 · T50 73.1 → Code {'ruhig': 77, 'schnell': 73}
Breitensatz Fahrbahn: (8.3, 10.1) Pkt/m (T30/T50) = (0.58, 0.7) Noten/m → Code 0.58 / 0.7
Breitensatz baulich:  (5.0, 5.5) Pkt/m (T30/T50) = (0.35, 0.38) Noten/m → Code 0.35 / 0.38
Parken-Offset T30 (3,5/2,0 m): (8.5, 28.8) Pkte = (0.59, 2.0) Noten · T50: (9.6, 29.6)
→ Code: pauschal 1,0 (PARKEN_ABZUG) — breitenabhängige Formel zurückgenommen, offener Punkt
```
