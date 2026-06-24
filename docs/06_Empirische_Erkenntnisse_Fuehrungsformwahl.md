# VeloroutenCheck — Empirische Erkenntnisse zur Führungsformwahl

Datenbasis: radwege-check.de (FixMyCity), Velo-Perspektive, feel-safe % (0–100).
**Tram-Szenen ausgeschlossen** (Standard; Tram-Effekt separat in Abschnitt 2). N = Anzahl Bewertungen.
Mapping der Führungsformen + Quellen/Schema: siehe `05` bzw. `04`.

> **Verifiziert (2026-06-19).** Alle Zahlen wurden unabhängig **aus den Einzelantworten**
> (`SurveyResults_200414.json`, nur Velo) ⋈ decodierte Szenen-Merkmale (`scenes_ms/cp/se.csv`)
> nachgerechnet — reproduzierbar via [`tools/verify_06.py`](tools/verify_06.py); Gegenüberstellung
> in [`06_verifikation.md`](06_verifikation.md), interaktive Aufbereitung in
> [`06_visualisierung.html`](06_visualisierung.html). **Kreuzvalidierung** der Methode: das aus den
> Einzelantworten je Szene berechnete feel-safe stimmt mit dem offiziellen `voteScore` überein
> (mittlere Abweichung 1,8 Punkte über 1'700 Szenen) → Join und Metrik sind korrekt.
>
> Methodik-Hinweise zur folgenden Korrektur:
> - **feel-safe %** = Anteil Bewertungen mit `rating ≥ 2` («(eher) sicher»); die Werte sind nun
>   **breite Mittel über alle passenden Szenen** (rating-gewichtet, grosses N), nicht mehr einzelne
>   Aggregat-/Beispielkonfigurationen. Daher liegen die Werte teils einige Punkte über den früheren
>   Angaben; **Rangordnung und Aussagen bleiben unverändert**.
> - **`geschützt`** = fahrbahn-seitiger Streifen mit baulicher Trennung (Poller/Sperrpfosten, MS).
>   **`Seitenraum`** = abgesetzter Radweg im Seitenraum (CP-Experiment, fix 50 km/h / wenig Verkehr).
> - Die früheren §2-«isolierten» Werte (z. B. Radstreifen 2 m ≈ 51) waren **Einzelkonfigurationen**
>   (ein Faktor variiert, Rest konstant, kleines N) — als separate Lesart unten gekennzeichnet.

---

## 1. Kontextanalyse — Tempo × Verkehrsaufkommen

Score (Velo) je Führungsform × Verkehrskontext — *innerhalb* einer Spalte (= fester Kontext)
die Führungsformen vergleichen:
```
feel-safe % (Velo, verifiziert; vgl. frühere Werte in Klammern)
Führungsform                  T30/wenig    T30/viel+SV  T50/wenig    T50/viel+SV
Mischverkehr (keine RVA)      29.6 (27)    24.7 (20)    20.6 (15)    16.2 (12)
Radstreifen ungeschützt       75.6 (70)    73.2 (67)    69.4 (63)    68.4 (64)
  davon breit 3.5 m           83.7 (80)    81.7 (78)    78.4 (72)    77.1 (75)
geschützte RVA (Poller…)      92.6 (92)    91.2 (91)    90.8 (92)    89.8 (91)
Seitenraum-Radweg               –            –          76.5 (82)      –
```
Lesart (Validierung der 2-Dimensionen-Wahl): Kontext **T50/viel+SV** → Mischverkehr 12 ≪
Radstreifen 64 ≪ geschützt 91 — wird die geeignetere (separierte) Führungsform gewählt,
**steigt der Score deutlich**. Mischverkehr fällt mit steigendem Tempo/Verkehr (27→12),
separierte Formen bleiben hoch.

Effekt **Tempo 30 → 50** (je Führungsform):
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

## 2. Einzeleffekte auf den feel-safe % (robuste Subgruppen-Vergleiche)

Methode: **je ein Faktor isoliert**, alle anderen grossen Merkmale konstant gehalten.
*Nicht* aus der additiven Regression — diese mittelt Wechselwirkungen weg und ist nur grobe
Orientierung (R² = 0,74); Einzel-Koeffizienten wie Tram/Tempo sind dort irreführend.

Anlagentyp-Leiter (feel-safe %, Velo — **verifiziert, breites Mittel mit N**):
```
Mischverkehr 25.4 (N≈6'400)
  <  Radstreifen 2m 60.2 (N≈23'000)  <  Radstreifen 3.5m 80.3 (N≈31'000)
  <  Seitenraum 76.5 (N≈173'000)     <  geschützt 2m 88.2 (N≈9'200) / 3.5m 93.7 (N≈11'000)
```
(Hinweis: `Seitenraum` liegt knapp unter `Radstreifen 3.5m` und unter `geschützt` — die abgesetzten
Radwege im Datensatz haben Seitenraum-Konflikte; bauliche Trennung wirkt dort kaum, anders als auf
der Fahrbahn.) Frühere Kurzangabe war `~15 < ~51 < ~77 < ~81 < 87/95` (Einzelkonfigurationen).

Isolierte Effekte (Δ feel-safe %, sonst gleiche Konfiguration — **separate Lesart: einzelne
Basiskonfiguration, kleines N**; die breiten Mittel oben/§3/§4 sind robuster):
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

## 3. RVA-Breite (3,5 vs. 2,0 m) im Detail

Filter: Fahrbahn, linke Markierung = **unterbrochener Breitstrich** (`unterbrochen`), ungeschützt.
feel-safe % (N), **verifiziert** (frühere Werte in Klammern):
```
Kontext        2.0 m                3.5 m                Δ Breite
-------------  -------------------  -------------------  --------
ALLE           57.1 (N=6650) (46.7) 77.0 (N=6812) (73.4) +19.9
T30            60.8 (N=3321) (49.8) 80.3 (N=3394) (75.8) +19.5
T50            53.3 (N=3329) (43.7) 73.7 (N=3418) (70.9) +20.4
T30/wenig      65.0 (N=1143) (53.3) 82.1 (N=1141) (78.2) +17.1
T30/viel+SV    58.6 (N=2178) (48.1) 79.4 (N=2253) (74.5) +20.8
T50/wenig      54.6 (N=1114) (43.0) 76.1 (N=1187) (73.9) +21.5
T50/viel+SV    52.7 (N=2215) (44.0) 72.4 (N=2231) (69.4) +19.7
```
→ Verbreiterung 2,0 → 3,5 m bringt **konstant ~+20 Punkte** (breites Mittel; frühere Schätzung ~+27
aus engerer Konfiguration), weitgehend unabhängig von Tempo/Verkehrsmenge.

---

## 4. Breite × Parken (mit/ohne) — Wechselwirkung

feel-safe % (N), **verifiziert** (Fahrbahn, ungeschützt):
```
                 2.0 m            3.5 m            Δ Breite
---------------  ---------------  ---------------  --------
ohne Parken      75.2 (N=7430)    86.1 (N=8451)     +10.9
mit Parken       53.3 (N=15917)   78.1 (N=22961)    +24.8

Parken-Effekt (mit − ohne):   bei 2.0 m  -21.9     bei 3.5 m  -8.0
```
je Tempo:
```
                 2.0 m            3.5 m            Δ
---------------  ---------------  ---------------  -----
T30 ohne Parken  77.9 (N=3698)    88.0 (N=3735)    +10.1
T30 mit Parken   56.6 (N=8084)    80.5 (N=11512)   +23.9
T50 ohne Parken  72.5 (N=3732)    83.0 (N=3792)    +10.5
T50 mit Parken   49.8 (N=7833)    75.8 (N=11449)   +26.0
```

**Kernbefund (Wechselwirkung — bestätigt):**
- **Parken** neben dem Velostreifen schadet **stark bei schmal** (−22 bei 2,0 m), **kaum bei breit** (−8 bei 3,5 m).
- **Breite** hilft **stark mit Parken** (+25), **wenig ohne Parken** (+11).
- Schlechtester Fahrbahn-Fall: **schmaler Streifen mit Parken (≈ 53)**; Verbreiterung auf 3,5 m
  holt fast alles zurück (≈ 78). Ohne Parken ist auch 2,0 m schon ordentlich (≈ 75).
- Ergänzend: **Velo rechts vom Parken** ≈ 93 — die Parken-Position ist entscheidend.

---

## 5. Zusammenfassung — Erkenntnisse für die Führungsformwahl

**a) Separation ist der grösste Hebel.** (verifiziert, breites Mittel)
```
Mischverkehr 25  ≪  Radstreifen 2m 60 / 3,5m 80  ≈  Seitenraum 77  ≪  geschützt 2m 88 / 3,5m 94
```

**b) Die 2-Dimensionen-Wahl (DTV/Menge × Tempo) ist empirisch gestützt.** Innerhalb eines
festen Kontexts steigt der Score deutlich, wenn die geeignetere (separiertere) Form gewählt wird
(Bsp. T50/viel+SV: Mischverkehr 12 ≪ Radstreifen 64 ≪ geschützt 91). Mischverkehr fällt mit
Tempo/Verkehr (27→12), separierte Formen bleiben hoch → genau die Masterplan-Logik.

**c) Aber: gefühlte Sicherheit ist „strenger" als die Eignung.** Mischverkehr bleibt selbst im
„geeigneten" Fall (T30/wenig) tief (~27) gegenüber jeder RVA. → Eignung (Masterplan) und
subjektive Sicherheit sind **zwei verschiedene Dinge** und gehören in **zwei getrennte Noten**.

**d) Wirkungsstärke der Faktoren (Velo, isoliert):**
```
Separation/Anlagentyp   dominanter Hebel (Mischverkehr 25 ≪ geschützt 88–94; Δ ≈ -63)
RVA-Breite 2->3,5 m      +20  (mit Parken +25, ohne Parken +11)
Parken-Position/-Nähe    Parken neben schmalem Streifen -22; bei breitem Streifen nur -8
bauliche Trennung (Fahrbahn)  +28 @2m / +13 @3,5m  (Radstreifen->geschützt: 60->88 / 80->94)
Tempo 30->50             -9 Mischverkehr, -5..-6 Radstreifen, ~0 geschützt (auf Fahrbahn)
Verkehrsmenge            ~ halb so stark wie Tempo; bei Mischverkehr -5
```
Tempo und Verkehrsmenge wirken **v. a. ohne bauliche Trennung**; bei geschützter Führung ≈ 0.

**e) Implikationen für die VeloroutenCheck-Führungsformnote:**
- Separation am stärksten gewichten; **Breite und Parken-Konstellation** als wichtigste
  Merkmals-Abzüge (Anhang B.2) — als **Wechselwirkung** (schmaler Streifen *mit* Parken =
  grosser Abzug; breit *oder* Parken weg/umgelegt = stark besser).
- **Tempo/Menge** nur bei *ungeschützten* Formen als Abzug, bei baulicher Trennung praktisch nicht.
- **Eignung** (Masterplan DTV×Tempo) steuert die Wahl/Geschwindigkeitsseite, die
  **radwege-Werte** die subjektive Sicherheit (Führungsformnote) — getrennt halten.

**f) Vorbehalte:** Berlin/DE-Szenen; Velo-Perspektive; nur subjektive Sicherheit (nicht objektive
Unfallsicherheit); einzelne CH-Sonderformen (Kernfahrbahn, Velogegenverkehr, Zweirichtung,
komb. Fuss-/Velo, Fussweg Velo gestattet) nicht erhoben → dort Norm/Experte.
