# VeloroutenCheck — CH-Führungsformen (Breiten) + Führungsart-Diagramm

Quelle: **Masterplan Veloinfrastruktur Stadt Bern (Oktober 2025)** — Diagramm S. 11,
Querschnittstypen Q1–Q11 ab S. 12.
Status: **Entwurf zur Gegenprüfung.** Mit „(prüfen)" markierte Werte am PDF verifizieren.



## 1. Querschnittstypen — Velo-Breiten [m]

```
Q     Führungsform               Optimal   Minimal
----  -------------------------  --------  --------
Q1    Radstreifen                2.50      1.80
Q2a   Radweg strassenbegl. A     2.50      1.80
Q2b   Radweg strassenbegl. B     2.50      1.80
Q3    Radweg abgesetzt           2.50      1.50
Q4    Umweltspur (Bus+Velo)      >=4.50    3.75     
Q5    Kernfahrbahn               2.50      1.50     
Q6    Mischverkehr Hauptachse    –         –
Q7    Einbahn Velogegenverkehr   2.00      1.80
Q8    Quartierstrasse T30/T20    –         –
Q9    Velostrasse                –         –
Q10   Zweirichtungsradweg        4.50      3.20
Q11   Komb. Fuss-/Radweg         >=3.50    –        
Q12   Fussweg Velo gestattet     –         3.50
```

Bemerkungen:
- **Q1** Velohauptroute 2.50 (mind. 1.80); 1.50 abseits von Hauptrouten.
- **Q4** kein eigener Velostreifen (Bus + Velo gemeinsam); Spur ≥ 4.50, 3.75 bei Taxiverkehr.
- **Q6 / Q8 / Q9** kein separater Velostreifen → Wert = Fahrbahn/Fahrgasse, nicht Velo-Optimal/Minimal:
  - Q9 Fahrbahn 4.50–6.50 m und nur bei 30 km/h
- **Q7** Optimal/Minimal = Velo-Gegenrichtung; Hauptrichtung 1.80 (min. 1.50).
- **Q11** Mischfläche ≥ 3.50 m; ab grösserer Breite Trennung Fuss/Velo.
- **Fussweg, Velo gestattet** Ausnahmesignalisation (keine Q-Nr.); nur bei Breite ≥ 3.50 m
  zulässig (kein Optimalwert). Zusatztafel «Velo gestattet» = keine Benützungspflicht.


## 2. Führungsart-Diagramm (S. 11)

Achsen: **DTV MIV** (x) und **zul. Höchstgeschwindigkeit V** [km/h] (y).
Grenzen DTV: 2'000 / 5'000 / 10'000 · V: 30 / 40 / 50.

### 2.1 Entscheidungstabelle

```
DTV MIV         V <= 30          V 31-40          V 41-50          V 51-80
--------------  ---------------  ---------------  ---------------  -------
< 2'000         Mischverkehr     Radstreifen      Radstreifen      Radweg
2'000 - 5'000   Radstreifen      Radstreifen      Radweg           Radweg
5'000 - 10'000  Radstr./Radweg   Radstr./Radweg   Radstr./Radweg   Radweg
> 10'000        Radweg           Radweg           Radweg           Radweg
```
„Radstr./Radweg" = Übergangszone „Radstreifen oder Radweg".

### 2.2 Entscheidungsregel (Pseudocode, priorisiert)

```
fuehrungsart(DTV, V):              # V = zul. Höchstgeschwindigkeit [km/h]
  wenn V > 50  oder DTV >= 10000:  -> "Radweg"
  wenn DTV >= 5000:                -> "Radstreifen oder Radweg"
  wenn DTV >= 2000:                -> (V <= 40) ? "Radstreifen" : "Radweg"
  sonst (DTV < 2000):              -> (V <= 30) ? "Mischverkehr" : "Radstreifen"
```

### 2.3 Sonderfälle / Zusatzregeln (Text S. 11)
- **Velostrasse** (Q9): auf Velohauptrouten im Mischverkehrs-Bereich prüfen und nur bei Tempo 30 möglich..
- **Kernfahrbahn** (Q5) mit Radstreifen ≥ 1.80 m: bis max. Tempo 50 und DTV 5'000 möglich.
- **Radweg** stets als höherer Standard möglich/anzustreben (bauliche Abtrennung).
- Weitere Wahlkriterien (nicht im Diagramm): Längsneigung, ÖV, Strassenraumbreite.
- **Velohauptrouten** = Optimalfall-Standard · **übrige Routen** = Minimalfall-Standard.

### 2.4 Verwendung im Rechner (Bezug zur Basisnote)
Vorhandene Führungsart mit empfohlener (Tabelle 2.1) vergleichen: stimmt überein → Basisnote 1;
je Stufe Abweichung (Separationsbedarf nicht erfüllt) → Notenabzug. Abzugslogik noch zu definieren.


## 3. Haltestellen (ÖV) — Entscheidungstabelle

Quelle: Masterplan Veloinfrastruktur, Diagramm «Veloverkehrslösung gemäss Masterplan».
Achsen: **Bedeutung Velonetz** (Veloroute / Velohauptroute) × **ÖV-Angebot** (Bus-Takt / Tram).

### 3.1 Entscheidungstabelle (Soll-Veloverkehrslösung)

```
ÖV-Angebot \ Route   Veloroute        Velohauptroute
Tram                 Separate         Separate
Bus  < 5 Min         Übergang*        Separate
Bus  5-15 Min        Mischverkehr     Übergang*
Bus  >= 15 Min       Mischverkehr     Mischverkehr
```
`*Übergang` = schraffierter Bereich → Einzelfallprüfung (beide Lösungen möglich).

Entscheidungsregel (Score): ÖV (Tram 3 / Bus<5 2 / Bus5-15 1 / Bus>=15 0) + Route
(Velohauptroute 1 / Veloroute 0). Summe **>= 3 → Separate Velofläche · = 2 → Übergang ·
<= 1 → Mischverkehr**.

### 3.2 Haltestellentypen, Einsatzbereich und Velo-Breite [m]

Breite der Veloführung an der Haltestelle (Velohauptroute → Optimal, Veloroute → Minimal;
bei Optimal-Bereich gilt die Untergrenze als Schwelle). HS3/HS6/HS7 ohne Breitenkriterium.

```
Typ                                    Einsatzbereich       Optimal   Minimal
HS1  Haltestelle mit Veloumfahrung     Separate Velofläche  1.8-2.5   1.6
HS2  Kaphaltestelle mit Veloüberfahrt  Separate Velofläche  1.8       1.5
HS3  Kaphaltestelle (Ausnahme)         Mischverkehr         –         –
HS4  Haltestelle mit rückw. Radweg     Separate Velofläche  1.8-2.5   1.6
HS5  Inselhaltestelle                  Separate Velofläche  2.5       1.5
HS6  Fahrbahnhaltestelle Bus           Mischverkehr         –         –
HS7  Busbucht                          Mischverkehr         –         –
```

### 3.3 Verwendung im Rechner (Bezug zur Note)
- **Einsatzbereich:** Soll-Lösung «Separate Velofläche», aber Ist-Typ aus der Mischverkehr-Familie
  (HS3/HS6/HS7) → Abzug. Über-Erfüllung (separater Typ bei Soll Mischverkehr) und Übergang → kein Abzug.
- **Velo-Breite an der Haltestelle:** nur HS1/HS2/HS4/HS5; zu schmal → Breiten-Abzug (× 0,9/m).
- Normativ (keine FixMyCity-Daten zu Haltestellen). Details/Parameter: README `VeloroutenCheckWeb`, Kap. 4.
