# VeloroutenCheck — Verifikation der Empirie-Ergebnisse (06)

Unabhängige Neuberechnung **aus den Einzelantworten** (`SurveyResults_200414.json`, nur Velo-Perspektive) ⋈ decodierte Szenen-Merkmale (`scenes_ms/cp/se.csv`). feel-safe % = Anteil Bewertungen mit `rating ≥ 2`; N = Anzahl Einzelbewertungen. Tram-Szenen ausgeschlossen.

Velo-Bewertungen total: **321488** · tram-bereinigt: **295177** · nicht zuordenbar: 0.

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
Mischverkehr              T30/wenig       29.6    27   +2.6      947
Mischverkehr              T30/viel+SV     24.7    20   +4.7     1976
Mischverkehr              T50/wenig       20.6    15   +5.6      946
Mischverkehr              T50/viel+SV     16.2    12   +4.2     1897
Radstreifen ungeschützt   T30/wenig       75.6    70   +5.6     9093
Radstreifen ungeschützt   T30/viel+SV     73.2    67   +6.2    17936
Radstreifen ungeschützt   T50/wenig       69.4    63   +6.4     8937
Radstreifen ungeschützt   T50/viel+SV     68.4    64   +4.4    17869
Radstreifen breit 3.5m    T30/wenig       83.7    80   +3.7     5068
Radstreifen breit 3.5m    T30/viel+SV     81.7    78   +3.7    10179
Radstreifen breit 3.5m    T50/wenig       78.4    72   +6.4     5087
Radstreifen breit 3.5m    T50/viel+SV     77.1    75   +2.1    10154
geschützt                 T30/wenig       92.6    92   +0.6     3131
geschützt                 T30/viel+SV     91.2    91   +0.2     6163
geschützt                 T50/wenig       90.8    92   -1.2     3023
geschützt                 T50/viel+SV     89.8    91   -1.2     6273
Seitenraum                T50/wenig       76.5    82   -5.5   173152
```

## §2 Anlagentyp-Leiter — feel-safe % (Velo gesamt) | MD | Δ | N

```
Anlagentyp             neu    MD      Δ        N
Mischverkehr          25.4    15  +10.4     6378
Radstreifen 2m        60.2    51   +9.2    23347
Radstreifen 3.5m      80.3    77   +3.3    31412
Seitenraum            76.5    81   -4.5   173152
geschützt 2m          88.2    87   +1.2     9185
geschützt 3.5m        93.7    95   -1.3    10947
```

## §2 Tempo-Effekt 30→50 (Δ feel-safe, Velo gesamt)

```
Führungsform            T30    T50      Δ
Mischverkehr           26.3   17.7   -8.6
Radstreifen 2m         63.3   57.2   -6.1
Radstreifen 3.5m       82.3   77.6   -4.7
geschützt              91.7   90.1   -1.6
```

## §3 RVA-Breite 2,0 vs 3,5 m (Fahrbahn, unterbrochen, ungeschützt)

feel-safe % (neu) mit N, plus MD-Wert. Filter ggf. enger als 06 → Δ/N transparent.

```
Kontext         2.0 neu     (N)  2.0 MD  3.5 neu     (N)  3.5 MD
ALLE               57.1    6650    46.7     77.0    6812    73.4
T30                60.8    3321    49.8     80.3    3394    75.8
T50                53.3    3329    43.7     73.7    3418    70.9
T30/wenig          65.0    1143    53.3     82.1    1141    78.2
T30/viel+SV        58.6    2178    48.1     79.4    2253    74.5
T50/wenig          54.6    1114    43.0     76.1    1187    73.9
T50/viel+SV        52.7    2215    44.0     72.4    2231    69.4
```

## §4 Breite × Parken (Fahrbahn, ungeschützt) — feel-safe % (N)

```
Fall                  2.0m     (N)    3.5m     (N)  Δ Breite
ohne Parken           75.2    7430    86.1    8451     +10.9
mit Parken            53.3   15917    78.1   22961     +24.8
T30 ohne Parken       77.9    3698    88.0    3735     +10.1
T30 mit Parken        56.6    8084    80.5   11512     +23.9
T50 ohne Parken       72.5    3732    83.0    3792     +10.5
T50 mit Parken        49.8    7833    75.8   11449     +26.0
```

## §2 Tram in der Fahrbahn — feel-safe % (N) mit vs. ohne Tram

Δ = feel-safe(ohne) − feel-safe(mit) = Verlust durch Schienen in der Fahrbahn. Malus [Notenstufen] = Δ / 14,4 (feel-safe-Punkte pro Note, wie in `fuehrungsform.ts`).

**Mischverkehr**
```
Kontext            mit (N)      ohne (N)      Δ  Malus
Gesamt         12.1 (1907)   25.4 (6378)   13.3   0.92
Tempo 30        14.4 (964)   26.3 (2923)   11.9   0.83
Tempo 50         9.7 (943)   17.7 (2843)    8.0   0.56
```
**Radstreifen**  _(Referenz: eigene RVA → kaum Effekt)_
```
Kontext            mit (N)      ohne (N)      Δ  Malus
Gesamt        71.3 (18334)  71.7 (54759)    0.4   0.03
Tempo 30       73.4 (9193)  74.0 (27029)    0.6   0.04
Tempo 50       69.1 (9141)  68.8 (26806)   -0.3  -0.02
```

**Im Tool verdrahtet** (nur Mischverkehr): −0.8 bei Tempo ≤ 30, −0.55 bei Tempo > 30 — gerundete Tempo-Werte aus obiger Tabelle. Der „Gesamt"-Malus ist durch die Tempo-Mischung leicht überzeichnet; massgebend sind die tempo-kontrollierten Zeilen.
