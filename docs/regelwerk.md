# VeloroutenCheck — Regelwerk (konsolidierte Datenquelle)

> **Automatisch generiert** aus `docs/regelwerk.json` durch `tools/generiere_dokumentation.py`. Nicht von Hand bearbeiten — stattdessen die JSON ändern und das Skript erneut ausführen.

Stand: 2026-06-29

Parallel-Dokumentation. Wird (noch) NICHT von der App geladen; der App-Code (fuehrungsform.ts, Stadt-Adapter) bleibt unverändert die massgebliche Implementierung. Diese Datei fasst die Grundlagen-CSVs und die im Code hinterlegten Anker/Parameter an einem Ort zusammen.

**Quellen:**

- Masterplan Veloinfrastruktur Stadt Bern (Okt. 2025) — Bericht & Standards (Q-Blätter)
- Velostandards Stadt Zürich (Tab. 1, S. 16/17; S. 7 Netzkategorien)
- Standards Fuss- und Veloverkehrsinfrastruktur Kanton Basel-Stadt (2024), Tab. 4 S. 20
- Standards Veloverkehr Stadt Luzern (Q-Blätter S. 30–57)
- Arbeitshilfe Haltestellen mit Veloinfrastruktur
- radwege-check.de / FixMyCity (subjektive Sicherheit, feel-safe %)
- Grundlagen/*.csv (DTV_KMH_Fuehrungsform, Fueherungsform_Breiten_Staedte, Routentypologie_Staedte, Haltestelle_Typen_Breiten_*, Haltestellen_Typen_Bezeichnung_Staedte, Haltestellen_veloverkehrsloesung)
- VeloroutenCheckWeb/src/fuehrungsform.ts (Parameter, feel-safe-Anker)

## Stadtübergreifende Parameter

| Parameter | Wert | Einheit | Herleitung |
|---|---|---|---|
| feelSafeProNote | 14.2 | feel-safe-Punkte pro Notenstufe | NEU GEEICHT 13.08.2026 (P13): Spanne = eigene Maximal-Lücke der Kette (Radweg−Mischverkehr schnell: 84−13 = 71 Punkte) ÷ 5 Stufen = 14,2 — der schlimmste Fall landet exakt auf Note 1,0; der Boden ist nur noch Reserve für Pauschalen-Kumulation. Einmalig geeicht, wieder eingefroren; die Basis des lokalen Rechners behält die Ersteichung 72 ÷ 5 = 14,4. |
| breiteSatz |  | Notenstufen Abzug pro fehlendem Meter Breite, je feel-safe-Klasse und Tempo (ruhig ≤ 30, schnell > 30) | Szenen, die sich NUR in der Breite unterscheiden (Velo-Foto-Bewertungen), je Tempo getrennt. Fahrbahn seit dem 12.08.2026 im GESTRICHELT-Schnitt (P10-U: nur graue Szenen mit schmaler gestrichelter Führungslinie, das Berner Markierungsbild; 2 Fotos je Zelle — bewusster Preis): 9,3 Pkt/m bei Tempo 30 und 10,5 bei Tempo 50, seit 13.08.2026 ÷ eigenen Kurs 14,2 (P13) ≈ 0,65/0,74 Noten/m (unter 14,4: 0,65/0,73; Grau-Zwischenfassung 0,59/0,75). Hinter baulicher Trennung seit dem 13.08.2026 im POLLER-ONLY-Grau-Schnitt (P14: nur Sperrpfosten-Szenen, keine Blumenkästen — derselbe Pool wie der Radweg-Anker aus P11-A; ebenfalls ÷ 14,2): 3,4 bzw. 5,3 Pkt/m ≈ 0,24 / 0,38 (Zwischenfassung grau alle Trennungsarten, P3: 4,4/6,1 ≈ 0,31/0,43; gepoolte Zwischenfassung bis 11.08.2026: 0,58/0,70 und 0,35/0,38). Tempoabhängig seit 10.08.2026; die Fahrbahn-Tempo-Spanne (0,09) ist kleiner als die bauliche (0,14). Fahrgassen-Bänder (Velostrasse, Umweltspur; feel-safe-Klasse Mischverkehr) bleiben normativ bei 0,9 für beide Tempi — die Befragung liefert dafür keinen Gradienten. |
| parkenRechtsAbzug | 1.0 | Notenstufen, pauschal | Pauschal für jede Führungsform und jede Breite. OFFENER PUNKT: Bis zum 09.08.2026 galt eine breitenabhängige Formel 0,6 + 0,9 × (3,5 − Streifenbreite). Der Befund bleibt gültig (Parken-Offset bei gleicher Breite/Tempo, Velo-Foto-Bewertungen: 3,5 m ≈ 8,5–9,6 Pkt = 0,6 Noten, 2,0 m ≈ 28,8–29,7 Pkt = 2,0 Noten), die Skala trägt den Bestand aber nicht: Die Befragung kennt nur diese zwei Breiten, der breiteste real erfasste Radstreifen misst 2,50 m, und 282 von 340 sind schmaler als der kleinste Messpunkt — dort war die Formel reine Verlängerung (1,50 m ergäbe −2,40, mehr als je gemessen). Ein dritter Messpunkt widerspricht ihr zudem: im Mischverkehr kostet die Parkierung nur ≈ 0,15 Noten. Es fehlen Szenen unter 2,0 m Streifenbreite. Ausnahme unverändert: Sicherheitsstreifen gegenüber den Parkplätzen (SN 640 060) → KEIN Abzug (stadtübergreifend, Norm). |
| haltestelleAbzug | 1.0 | Notenstufen | Normativ: Soll verlangt Separate Velofläche, Ist-Typ aber Mischverkehr-Familie. |
| fusswegBasis | 4 | Note (Maximum) | Fussweg Velo gestattet (Mischfläche) höchstens «genügend». Normativ. |
| tramDeckel | 3 | Notendeckel (nur Mischverkehr) | Schienen in der Fahrbahn deckeln die Note auf höchstens 3 — seit 14.08.2026 in Angleichung an den lokalen Berner Rechner (TRAM_NOTE), vorher ein tempoabhängiger Malus von 1,2 (≤30) bzw. 0,7 (>30). Die Messung bleibt gültig: Mischverkehr mit vs. ohne Tram (Velo-Foto-Bewertungen) T30 27,1 → 9,4 %, T50 15,2 → 5,4 %; auf dem Radstreifen ≈ 0 → dort kein Deckel. Neu ist die Regelform: Der Deckel kappt gute Noten (6 → 3), drückt eine schlechte aber nicht weiter. |
| kapNote | 1 | fixe Note (überschreibt alles) | Kaphaltestelle an einer Tram-Haltestelle ohne bauliche Trennung (Separationsrang < 2) → Note 1: Schiene im schmalen Abstand zur hohen Haltekante; dort ist eine separate Velofläche zwingend. Seit 14.08.2026, aus dem lokalen Rechner übernommen (KAP_NOTE/KAP_TRENNUNG_AB). Auslöser online: Schienen in der Fahrbahn ODER ÖV-Angebot «tram». |
| parkenRelevant | Mischverkehr, Radstreifen, Velostrasse, Umweltspur, Einbahn Velogegenverkehr mit Markierung | Führungsformen | Führungsformen, bei denen Parken rechts (Dooring) relevant ist (Velo auf Fahrbahn neben Längsparken). Bei «Parkierung rechts = ja» kann zusätzlich ein Sicherheitsstreifen ggü. den Parkplätzen (SN 640 060) angegeben werden; ist er vorhanden, entfällt der Abzug. |

## Feel-safe-Anker

*Hinweis:* radwege-check / FixMyCity, tram-bereinigt. Gezählt wird jede Bewertung der VELO-FOTO-Szenen (Kamera C), unabhängig von der Befragtengruppe — massgebend ist, was das Foto zeigt. Radstreifen-Anker = Referenzkonfiguration (Sollbreite 2,5 m ohne Parkierung, interpoliert aus den 2,0/3,5-Zellen — seit 12.08.2026 NUR GRAUE Szenen, P1; Mischverkehr-Anker seit demselben Tag parkbereinigt, P4; gepoolte Zwischenfassung: 77/73 und 22); Breite und Parkierung werden separat abgezogen. Reproduktion: tools/verify_06.py. ruhig = V ≤ 30, schnell = V > 30.

| Führungsform | ruhig (V ≤ 30) | schnell (V > 30) | verifiziert |
|---|---|---|---|
| Mischverkehr | 24 | 13 | T30 22.3 / T50 12.8 |
| Radstreifen | 65 | 58 | Referenz gestrichelt (P10-U): 60.8+0.5×9.3=65.5 / 52.4+0.5×10.5=57.6 |
| Radweg | 90 | 84 | P11-A (13.08.2026), Berner Radweg-Gruppe: G1 Poller-grau 90.2/89.7; schnell gewichtet mit G3 Seitenraum-ohne-Geschäfte 83.7 → 83.9 |

## Velostrassen (Q9) — Sonderfall

*Quelle:* Grundlagen/Velostrassen_Staedte.csv; VeloroutenCheckWeb/src/fuehrungsform.ts (IST['Velostrasse'], Sonderfall-Logik)

**Regeln für alle Städte:**

- Nur bei Tempo 30 zulässig; bei v > 30 → Note 1.
- Velostrasse zählt als Mischverkehr (feel-safe-Klasse Mischverkehr).
- Parkierung rechts (Dooring) relevant: ja

| Stadt | Breite min | Breite max | Bei Parkierung | Routentyp | Max DTV | Einsatzbereich | Hinweis |
|---|---|---|---|---|---|---|---|
| Bern | 4,50 | 6,50 | – | Velohauptroute | – | Nebenstrasse mit übergeordneter Velobedeutung, viel Veloverkehr, wenig MIV und ohne ÖV. | Breitenrange 4,50–6,50 m. |
| Basel | 4,50 | – | 7,00 | Velovorzugsroute | 2'500 | Nicht verkehrsorientierte (siedlungsorientierte) Tempo-30-Strasse (Tab. 3, S. 15): auf Vorzugsrouten einzige vorgesehene Form (≤ 2'500 DWV); auf Pendler-/Basisrouten mögliche Form zusätzlich zum Mischverkehr (kein DWV-Deckel). Auf verkehrsorientierten Strassen nicht vorgesehen. | Nettobreite 4,50 m (Vorzugsroute) / 4,30 m (Pendler-Basis); bei Parkierung 7,00 m; bei DWV < 1'000 reduziert 4,00 m. DWV-Deckel 2'500 nur Vorzugsroute (Hinweis). |
| Zürich | – | – | – | – | – | Im Zürcher Grundlagenpapier nicht vorgesehen. | Im relevanten Dokument steht nichts dazu. |
| Luzern | 4,50 | 4,50 | – | – | – | Bei gebündelter Velonutzung auf Quartierstrassen in Tempo-30-Zonen; bei geringer MIV-Belastung und hohem Veloanteil (> 50 %). | Breite 4,50 m. |

## Umweltspuren (Q4) — Sonderfall

*Quelle:* Grundlagen/Umweltspuren_Staedte.csv; VeloroutenCheckWeb/src/fuehrungsform.ts (IST['Umweltspur'], Sonderfall-Logik, UMWELTSPUR_TAKT/UMWELTSPUR_DECKE, umweltspurBasis())

**Regeln für alle Städte:**

- DTV/Tempo nicht massgebend, sondern der Bus-Takt. Die Eignung als Velo-Führung sinkt mit steigender Busfrequenz (kürzerem Takt); die Decke (Maximum) ist stadtabhängig: Bern Note 5 («weitgehend»), Zürich/Luzern/Basel Note 4 («genügend»). Schwellen stadtspezifisch, siehe Tabelle.
- feel-safe-Klasse: Mischverkehr.
- Parkierung rechts (Dooring) relevant: ja

| Stadt | Breite optimal | Breite minimal | Decke (max. Note) | Takt-Modell | Hinweis |
|---|---|---|---|---|---|
| Bern | 4,50 | 3,75 | 5 | Stufen: Takt < 7,5 Min → Note 2 (mit Warnung «nicht zulässig»), 7,5–15 Min → Note 4, ≥ 15 Min → Note 5 (Decke). | Tiefe–mittlere Busfrequenz (max. 7,5-Min-Takt) als Schwellwert; darunter nennt der Standard die Umweltspur als unzulässig — Warnung neben der Note, kein Zwang auf Note 1. Dreistufige Tabelle wie im lokalen Batch-Rechner. |
| Luzern | 4,50 | 3,75 | 4 | Rampe: Takt ≤ 5 Min → Note 1, ≥ 15 Min → Decke 4, linear dazwischen (gleiche Anker wie Zürich). | Breiten aus Bern übernommen. Eigene Takt-Bewertung 1–5: Takt < 5 → Bewertung 1, ≥ 15 → Bewertung 3 (= Umweltspur-Decke); normiert fällt Bewertung 1↔3 auf Note 1↔4 → Rampe 5↔15. |
| Zürich | 4,80 | 4,50 | 4 | Rampe: Takt ≤ 5 Min → Note 1, ≥ 15 Min → Decke 4, linear dazwischen. | ≥ 4,80 m auf Velovorzugsrouten; ≥ 4,50 m auf Hauptnetz. Takt: < 5 Min keine Anwendung, < 15 Min kritisch → Rampe 5↔15. |
| Basel | 4,50 | 3,00 | 4 | Keine Takt-Abhängigkeit (qualitativ). | Standardmass 4,50 m (Vorzugsroute); reduziertes Standardmass 3,00 m (Pendler-/Basisrouten). Kein Takt-Schwellwert: Eignung qualitativ (Busspur-Breite, Anzahl Buslinien, Taktdichte, Velofrequenz) → Note rein breitengetrieben. |

## Haltestellen-Typ-Bezeichnungen (stadtübergreifend)

*Hinweis:* Stadtübergreifende Zuordnung der Haltestellen-Bezeichnungen (Quelle: Haltestellen_Typen_Bezeichnung_Staedte.csv).

| Stadt | Haltestelle mit Veloumfahrung | Kaphaltestelle mit Veloüberfahrt | Kaphaltestelle | Haltestelle mit rückwärtigem Radweg | Inselhaltestelle (Umfahrung für MIV und Velo) | Fahrbahnhaltestelle Bus | Busbucht |
|---|---|---|---|---|---|---|---|
| Bern | B HS 1 | B HS 2 | B HS 3 | B HS 4 | B HS 5 | B HS 6 | B HS 7 |
| Luzern | L HS 1 | – | – | L HS 2 | – | L HS 3 und L HS 4 | L HS 5 |
| Zürich | Z HS1 | Z HS2 | Z HS3 | – | – | – | – |
| Basel | BS HS 2 | BS HS 3 | BS HS  1 | BS HS 2 | BS HS 4 | – | – |

## Bern

**Routentypen:** Velohauptroute, Veloroute

**Routentyp-Mapping → Masterplan:**

| Stadt-Kategorie | → Masterplan-Typ |
|---|---|
| Velohauptroute | Velohauptroute |
| Veloroute | Veloroute |

### Soll-Führungsform (DTV × Tempo)

*Quelle:* DTV_KMH_Fuehrungsform.csv (Bern); Masterplan Bericht S. 11 (vier ineinander liegende Rechtecke — die strengere der beiden Achsen entscheidet)

*Hinweis:* v in km/h. GRENZEN: Untergrenze inklusive; die Obergrenze 2'000 ist exklusive, die Obergrenzen 5'000 und 10'000 sind INKLUSIVE — so steht es im Fliesstext des Masterplans («verkehrsarme Strassen (DTV < 2'000)», «stark belastete Strassen (DTV > 10'000)»); zu 5'000 schweigt der Text, dort gilt die Bandgrenze des Schemas. Das Band 41–50 km/h ist durchgehend «Radstreifen oder Radweg» (waagrechter Schenkel der Schraffur), unabhängig vom DTV-Band. Implementiert in fuehrungsart() (fuehrungsform.ts); deckungsgleich mit soll_bern() des lokalen Rechners seit 10.08.2026.

| DTV MIV \ km/h | ≤ 30 | 31–40 | 41–50 | 51–80 |
|---|---|---|---|---|
| < 2'000 | Mischverkehr | Radstreifen | Radstreifen oder Radweg | Radweg |
| 2'000–5'000 | Radstreifen | Radstreifen | Radstreifen oder Radweg | Radweg |
| 5'000–10'000 | Radstreifen oder Radweg | Radstreifen oder Radweg | Radstreifen oder Radweg | Radweg |
| ≥ 10'000 | Radweg | Radweg | Radweg | Radweg |

### Breiten-Sollwerte

*Quelle:* Fueherungsform_Breiten_Staedte.csv (Bern); Masterplan Standards Q-Blätter ab S. 12

*Hinweis:* optimal = Velohauptroute, minimal = Veloroute, minimum = absolute Untergrenze (nicht für die Note).

| Führungsform / Querschnitt | Optimal | Minimal | Minimum | Maximal |
|---|---|---|---|---|
| Q1 Radstreifen | 2,50 | 1,80 | 1,50 | – |
| Q2a Radweg strassenbegl. A | 2,50 | 1,80 | 1,80 | – |
| Q2b Radweg strassenbegl. B | 2,50 | 1,80 | 1,80 | – |
| Q3 Radweg abgesetzt | 2,50 | 1,50 | 1,50 | – |
| Q4 Umweltspur (Bus+Velo) | 4,50 | 3,75 | 3,00 | – |
| Q5 Kernfahrbahn | 2,50 | 1,80 | 1,50 | – |
| Q6 Mischverkehr Hauptachse | – | – | – | – |
| Q7 Einbahn Velogegenverkehr | 2,00 | 1,80 | 1,80 | – |
| Q8 Quartierstrasse T30/T20 | – | – | – | – |
| Q9 Velostrasse | 4,50 | 4,50 | – | 6,50 |
| Q10 Zweirichtungsradweg | 4,50 | 3,20 | 3,20 | – |
| Q12 Fussweg Velo gestattet | 3,50 | 3,50 | 3,50 | – |
| Q11 Kombinierter Fuss-/Radweg | 3,50 | 3,50 | – | – |

### Haltestellen

*Quelle:* Haltestelle_Typen_Breiten_Bern.csv; Haltestellen_veloverkehrsloesung.csv

| Code | Typ | Einsatzfamilie | Optimal | Minimal | Minimum |
|---|---|---|---|---|---|
| HS1 | Haltestelle mit Veloumfahrung | Separate | 1,80 | 1,60 | 1,60 |
| HS2 | Kaphaltestelle mit Veloüberfahrt | Separate | 1,80 | 1,50 | 1,50 |
| HS3 | Kaphaltestelle | Mischverkehr | – | – | – |
| HS4 | Haltestelle mit rückwärtigem Radweg | Separate | 2,50 | 1,80 | 1,60 |
| HS5 | Inselhaltestelle | Separate | 2,50 | 1,50 | 1,50 |
| HS6 | Fahrbahnhaltestelle Bus | Mischverkehr | – | – | – |
| HS7 | Busbucht | Mischverkehr | – | – | – |

**Soll-Veloverkehrslösung (Takt × Route)**

| ÖV-Angebot | Veloroute | Velohauptroute |
|---|---|---|
| Tram | Separate Velofläche | Separate Velofläche |
| Bus < 5 Min | Übergang | Separate Velofläche |
| Bus 5–15 Min | Mischverkehr | Übergang |
| Bus ≥ 15 Min | Mischverkehr | Mischverkehr |

## Zürich

**Routentypen:** Velovorzugsroute, Hauptroute

**Routentyp-Mapping → Masterplan:**

| Stadt-Kategorie | → Masterplan-Typ |
|---|---|
| Velovorzugsroute | Velohauptroute |
| Hauptroute | Veloroute |
| Basisnetz | *(kein Routentyp — manuell)* |

### Soll-Führungsform (DTV × Tempo)

*Quelle:* DTV_KMH_Fuehrungsform.csv (Zürich)

*Hinweis:* Je Routentyp eigene Matrix (Velostandards Abb. 1, S. 14). Mischverkehr nur ≤30 km/h und unter DWV-Deckel: Velovorzugsroute <2'500, Hauptroute <5'000.

**Velovorzugsroute**

| DTV MIV \ km/h | ≤ 30 | 31–40 | 41–50 | 51–80 |
|---|---|---|---|---|
| < 2'500 | Mischverkehr | Radstreifen oder Radweg | Radstreifen oder Radweg | Radweg |
| 2'500–5'000 | Radstreifen oder Radweg | Radstreifen oder Radweg | Radstreifen oder Radweg | Radweg |
| 5'000–7'500 | Radstreifen oder Radweg | Radstreifen oder Radweg | Radstreifen oder Radweg | Radweg |
| ≥ 7'500 | Radstreifen oder Radweg | Radweg | Radweg | Radweg |

**Hauptroute**

| DTV MIV \ km/h | ≤ 30 | 31–40 | 41–50 | 51–80 |
|---|---|---|---|---|
| < 2'500 | Mischverkehr | Radstreifen oder Radweg | Radstreifen oder Radweg | Radweg |
| 2'500–5'000 | Mischverkehr | Radstreifen oder Radweg | Radstreifen oder Radweg | Radweg |
| 5'000–7'500 | Radstreifen oder Radweg | Radstreifen oder Radweg | Radstreifen oder Radweg | Radweg |
| ≥ 7'500 | Radstreifen oder Radweg | Radstreifen oder Radweg | Radstreifen oder Radweg | Radweg |

### Breiten-Sollwerte

*Quelle:* Fueherungsform_Breiten_Staedte.csv (Zürich); Velostandards Stadt Zürich Tab. 1 S. 16/17

*Hinweis:* optimal = Velovorzugsroute, minimal = Hauptroute, minimum = Minimalmass. Wo leer → Bern-Fallback (im Code).

| Führungsform / Querschnitt | Optimal | Minimal | Minimum | Maximal |
|---|---|---|---|---|
| Q1 Radstreifen | 2,50 | 2,20 | 1,80 | – |
| Q2a Radweg strassenbegl. A | 2,50 | 2,20 | 1,80 | – |
| Q2b Radweg strassenbegl. B | 2,50 | 2,20 | 1,80 | – |
| Q3 Radweg abgesetzt | 2,50 | 2,20 | 1,80 | – |
| Q4 Umweltspur (Bus+Velo) | 4,80 | 4,50 | – | – |
| Q10 Zweirichtungsradweg | 4,80 | 3,50 | 3,00 | – |
| Q11 Kombinierter Fuss-/Radweg | 3,50 | 3,50 | 3,50 | – |

### Haltestellen

*Quelle:* Haltestelle_Typen_Breiten_Zuerich.csv (Velostandards S. 80, anderes Prinzip als Bern)

| Code | Typ | Einsatzfamilie | Optimal | Minimal | Minimum |
|---|---|---|---|---|---|
| Z HS1 | Fahrbahnhaltestelle mit Veloumfahrung | – | 1,80 | 1,50 | 1,50 |
| Z HS2 | Fahrbahnhaltestelle mit Veloüberfahrt | – | 1,80 | 1,50 | 1,50 |
| Z HS3 | Fahrbahnhaltestelle mit Veloführung auf Fahrbahn | – | – | – | – |

**Soll-Veloverkehrslösung:** Massgebliche Kriterien: städtebauliches Umfeld, Platzangebot, Bedeutung Fuss-/Veloverkehr, ÖV-Frequenzen. Kein Takt×Route-Schema wie Bern (Velostandards S. 80).

## Basel

**Routentypen:** Vorzugsroute, Pendler-/Basisrouten

**Routentyp-Mapping → Masterplan:**

| Stadt-Kategorie | → Masterplan-Typ |
|---|---|
| Vorzugsroute | Velohauptroute |
| Pendler-/Basisrouten | Veloroute |

### Soll-Führungsform (DTV × Tempo)

*Quelle:* DTV_KMH_Fuehrungsform.csv (Basel). Strasseneinteilung: data.bs.ch/explore/assets/100250. DWV als DTV verwenden.

*Hinweis:* Kein DTV-Bänder-System, sondern Strassentyp × Tempo × Netzhierarchie (Tab. 3, S. 15). Auf nicht verkehrsorientierten (siedlungsorientierten) Tempo-30-Strassen: Vorzugsroute → Velostrasse (DWV ≤ 2'500); Pendler-/Basisrouten → Mischverkehr (DWV ≤ 5'000) ODER Velostrasse (kein DWV-Deckel). Auf verkehrsorientierten Strassen gibt es keine Velostrasse; empfohlen sind dort Vorzugsroute → Radstreifen oder Radweg, Pendler-/Basisrouten → Radstreifen (die «Radspur» der Tabelle wird der Einfachheit halber als breiter Radstreifen behandelt, keine eigene Form). Jede nicht vorgesehene Form → Note max. 4. DWV-Deckel bleibt Hinweis ohne Notenabzug. Velostrasse: bei DWV < 1'000 reduzierte Breite 4,00 m zulässig.

**Vorzugsroute**

| Strassentyp | Tempo | Führungsform |
|---|---|---|
| nicht verkehrsorientierte Strasse | 0–30 km/h | Velostrasse (einzige vorgesehene Form; Hinweis ab DWV 2500; bei DWV < 1000 Breite 4,00 m möglich) |
| verkehrsorientierte Strasse | 0–30 km/h | Radstreifen oder Radweg |
| verkehrsorientierte Strasse | 31–50 km/h | Radstreifen oder Radweg |

**Pendler-/Basisrouten**

| Strassentyp | Tempo | Führungsform |
|---|---|---|
| nicht verkehrsorientierte Strasse | 0–30 km/h | Mischverkehr (empfohlen ≤ DWV 5000; zusätzlich Velostrasse als mögliche Form (ohne DWV-Deckel)) |
| verkehrsorientierte Strasse | 0–30 km/h | Radstreifen |
| verkehrsorientierte Strasse | 31–50 km/h | Radstreifen |

### Breiten-Sollwerte

*Quelle:* Fueherungsform_Breiten_Staedte.csv (Basel); Standards FVV Basel-Stadt (2024) Tab. 4 S. 20

*Hinweis:* optimal = Vorzugsroute (Standardmass), minimal = Pendler-/Basisrouten (reduziert), minimum = Minimalmass. Wo leer → Bern-Fallback (im Code).

| Führungsform / Querschnitt | Optimal | Minimal | Minimum | Maximal |
|---|---|---|---|---|
| Q1 Radstreifen | 2,50 | 1,80 | 1,60 | – |
| Q2a Radweg strassenbegl. A | 2,50 | 2,20 | – | – |
| Q2b Radweg strassenbegl. B | 2,50 | 2,20 | – | – |
| Q3 Radweg abgesetzt | 2,50 | 2,20 | – | – |
| Q4 Umweltspur (Bus+Velo) | 4,50 | 3,00 | – | – |
| Q5 Kernfahrbahn | 1,80 | 1,80 | 1,80 | – |
| Q9 Velostrasse | 4,50 | 4,30 | – | – |
| Q10 Zweirichtungsradweg | 4,00 | 3,40 | 2,80 | – |
| Q11 Kombinierter Fuss-/Radweg | 6,00 | 4,80 | – | – |

### Haltestellen

*Quelle:* Haltestelle_Typen_Breiten_Basel.csv (Arbeitshilfe Haltestellen mit Veloinfrastruktur)

| Code | Typ | Einsatzfamilie | Optimal | Minimal | Minimum |
|---|---|---|---|---|---|
| BS HS 1 | Kap | – | – | – | – |
| BS HS 2 | Velobypass | – | 1,60 | 1,20 | 1,20 |
| BS HS 3 | Velo-Zeitinsel | – | 2,05 | 1,65 | 1,65 |
| BS HS 4 | Inselhaltestelle | – | 1,80 | 1,60 | 1,60 |

## Luzern

**Routentypen:** Velohauptroute, Veloroute

**Routentyp-Mapping → Masterplan:**

| Stadt-Kategorie | → Masterplan-Typ |
|---|---|
| Velohauptroute | Velohauptroute |
| Hauptroute | Veloroute |
| Nebenroute | *(kein Routentyp — manuell)* |
| keine Velonetz-Route | *(kein Routentyp — manuell)* |
| unbekannt | *(kein Routentyp — manuell)* |

### Soll-Führungsform (DTV × Tempo)

*Quelle:* DTV_KMH_Fuehrungsform.csv (Luzern)

*Hinweis:* Drei Zonen (Mischverkehr / Markierung / bauliche Trennung), auf die Berner Logik vereinfacht — Markierung = Radstreifen. DTV-Obergrenze exklusive.

| DTV MIV \ km/h | ≤ 30 | 31–40 | 41–50 | 51–80 |
|---|---|---|---|---|
| < 2'000 | Mischverkehr | Mischverkehr | Radstreifen | Radweg |
| 2'000–5'000 | Mischverkehr | Radstreifen | Radstreifen | Radweg |
| 5'000–10'000 | Radstreifen | Radstreifen | Radstreifen | Radweg |
| 10'000–15'000 | Radstreifen | Radstreifen | Radweg | Radweg |
| ≥ 15'000 | Radweg | Radweg | Radweg | Radweg |

### Breiten-Sollwerte

*Quelle:* Fueherungsform_Breiten_Staedte.csv (Luzern); Standards Veloverkehr Stadt Luzern Q-Blätter S. 30–57

*Hinweis:* optimal = Optimalfall (Velohauptroute), minimal = Minimalfall (Veloroute), minimum = absolute Untergrenze.

| Führungsform / Querschnitt | Optimal | Minimal | Minimum | Maximal |
|---|---|---|---|---|
| Q1 Radstreifen | 2,50 | 1,80 | – | – |
| Q2a Radweg strassenbegl. A | 2,50 | 1,80 | – | – |
| Q2b Radweg strassenbegl. B | 2,50 | 1,80 | – | – |
| Q3 Radweg abgesetzt | 2,50 | 1,80 | 1,60 | – |
| Q4 Umweltspur (Bus+Velo) | 4,50 | 3,75 | – | – |
| Q5 Kernfahrbahn | 1,80 | 1,50 | – | – |
| Q7 Einbahn Velogegenverkehr | 2,50 | 2,00 | 1,80 | – |
| Q9 Velostrasse | 4,50 | 4,50 | – | – |
| Q10 Zweirichtungsradweg | 4,50 | 3,20 | 3,20 | – |
| Q12 Fussweg Velo gestattet | 3,50 | 3,50 | 3,50 | – |
| Q11 Kombinierter Fuss-/Radweg | 3,50 | 3,50 | – | – |

### Haltestellen

*Quelle:* Haltestelle_Typen_Breiten_Luzern.csv; Haltestellen_veloverkehrsloesung.csv

| Code | Typ | Einsatzfamilie | Optimal | Minimal | Minimum |
|---|---|---|---|---|---|
| L HS 1 | Haltestelle mit Veloumfahrung | Separate | 1,80 | 1,50 | 1,50 |
| L HS 2 | Haltestelle mit rückwärtigem Radweg | Separate | 2,50 | 1,60 | 1,60 |
| L HS 3 | Fahrbahnhaltestelle | Mischverkehr | – | – | – |
| L HS 4 | Fahrbahnhaltestelle in der Umweltspur | Mischverkehr | – | – | – |
| L HS 5 | Busbucht | Mischverkehr | – | – | – |

**Soll-Veloverkehrslösung (Takt × Route)**

| ÖV-Angebot | Veloroute | Velohauptroute |
|---|---|---|
| Bus < 5 Min | Mischverkehr oder separate Velofläche | separate Velofläche |
| Bus 5–15 Min | Mischverkehr | Mischverkehr oder separate Velofläche |
| Bus ≥ 15 Min | Mischverkehr | Mischverkehr |

*Hinweis:* Separate Velofläche = Veloumfahrung, Haltestelle mit rückwärtigem Radweg. Mischverkehr = Fahrbahnhaltestelle, Fahrbahnhaltestelle in der Umweltspur, Busbucht.

