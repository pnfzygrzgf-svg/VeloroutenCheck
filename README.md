# VeloroutenCheck

VeloroutenCheck bewertet die Qualität von Veloinfrastruktur mit einem **Erfüllungsgrad** von **Gar nicht erfüllt** bis **Vollständig erfüllt**; dahinter steht jeweils die **Schulnote von 1 bis 6**, aus der er entsteht. Grundlage sind zwei Quellen:

- die **Veloinfrastruktur-Standards der jeweiligen Stadt**. Welche Führungsform ist wo vorgesehen, welche Querschnitts- und Haltestellen-Vorgaben usw. gelten.
  - Bern: **[Standards Masterplan Veloinfrastruktur Stadt Bern](https://www.bern.ch/velohauptstadt/infrastruktur/masterplan-veloinfrastruktur)**
  - Zürich: **[Velostandards Stadt Zürich](https://www.stadt-zuerich.ch/content/dam/web/de/aktuell/publikationen/2024/velostandards-stadt-zuerich/velostandards-stadt-zuerich.pdf)**
  - Basel: **[Standards Fuss- und Velo-Verkehrsinfrastruktur Basel-Stadt](https://media.bs.ch/original_file/72373a2c610e23b19ae61cd148ad22f35b3d1fe2/2024-09-27-standards-fvv-is-bs.pdf)**
  - Luzern: **[Standards Veloverkehr Stadt Luzern](https://www.stadtluzern.ch/_docn/2965064/Standards_Veloverkehr.pdf)**
- die empirisch gemessene **subjektive Sicherheit** aus der Befragung von radwege-check / FixMyCity (wie sicher sich Velofahrende in einer Situation fühlen, „feel-safe %").

Bewertet wird eine **Strecke**, die auf der Karte aus OpenStreetMap-Segmenten aufgebaut wird und aus einem oder mehreren **Abschnitten** besteht. Jeder Abschnitt erhält je Fahrtrichtung eine Note; die Strecke erhält die Note ihres schlechtesten Abschnitts. Führungsform, Tempo, Verkehrsmenge, Routentyp, Parkierung und Haltestellen kommen aus OpenStreetMap und den Geoportalen der Städte, Fahrbahn- und Trottoirbreiten aus der amtlichen Vermessung; jede Angabe trägt ihre Herkunft und lässt sich von Hand ändern oder am Luftbild messen.

Seit Oktober 2026 **plant** VeloroutenCheck auch: Der Reiter «Planen» eines Abschnitts teilt den Strassenquerschnitt neu auf, Element für Element (Fahrspuren, Velostreifen, Parkierung, Trottoirs, Grünstreifen, Umweltspur, Haltestellen nach Masterplan). Jedes Element wird gegen die Vorgaben der Stadt geprüft, die Bilanz zeigt, was im Querschnitt Platz hat, und die Note der Planung steht neben der von heute. Ein Vorschlag nennt die erste Massnahme, die den Erfüllungsgrad «Vollständig erfüllt» (Note 5,5) erreicht; Breiten lassen sich am Luftbild messen, der Querschnitt als Skizze und Bericht (PDF) ausgeben. Alles läuft im Browser, ohne Konto und ohne Upload.

**Web-VeloroutenCheck** https://veloroutencheck.ch/

**Ergebnisbericht Bildumfrage Bern 2026** — [docs/09_Umfrage_Subjektive_Sicherheit_Bern_2026/Ergebnisbericht.md](docs/09_Umfrage_Subjektive_Sicherheit_Bern_2026/Ergebnisbericht.md). 5 900 Bewertungen von 51 Bildern aus 14 Berner Strassenabschnitten: Feel-Safe-Anker, Breiteneffekte und was daraus für die Werte im Rechner folgt.

> Resultate mit Vorsicht verwenden und durch eine Fachperson prüfen lassen.

Vibecoding. Don't trust, verify!

Die Bedienung steht in der App unter «So funktioniert's».

## Repo-Struktur

| Ordner | Inhalt |
|---|---|
| [`VeloroutenCheckWeb/`](VeloroutenCheckWeb/) | Die Web-App (React + Vite + TypeScript). |
| [`tools/`](tools/) | Offline-Skripte: `oev_takt.py` (GTFS → Bus-Takt-Snapshots je Stadt), `dtv_basel.py` (DTV-Snapshot Basel), `verify_06.py` (Nachrechnung der feel-safe-Anker), `generiere_dokumentation.py` und `generiere_stadt_pdf.py` (Regelwerk-Dokumente aus `docs/regelwerk.json`), `visualisierung_template.html`. |
| [`docs/`](docs/) | Methodik-Notizen, Herleitungen, das Regelwerk (`regelwerk.json`/`.md`) und der [Ergebnisbericht der Berner Bildumfrage 2026](docs/09_Umfrage_Subjektive_Sicherheit_Bern_2026/Ergebnisbericht.md). Die zugrunde liegenden Rohdaten liegen lokal und sind nicht im Repo. |

## Start

```bash
cd VeloroutenCheckWeb
npm install
npm run dev      # Entwicklungsserver, Adresse steht in der Ausgabe
npm test         # Tests (vitest)
npm run build    # Typprüfung und Build nach dist/
```

## Inhalt

- [Bewertung (Methodik)](#bewertung-methodik)
- [Datenquellen und Herkunft](#datenquellen-und-herkunft)
- [Offene Punkte](#offene-punkte)
- [Aufbau](#aufbau)
- [Veröffentlichung](#veröffentlichung)
- [Lizenz](#lizenz)

## Bewertung (Methodik)

### 1. Soll-Führungsform

Welche Führungsform ist vorgesehen? **Jede Stadt hat ihre eigene Soll-Tabelle** — sie folgt dem jeweiligen Standard-Dokument und wird über `fuehrungsart(dtv, v, stadt, route, strassentyp)` in [`fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts) ausgewählt. Die Eingangsgrössen unterscheiden sich je Stadt:

- **Bern & Luzern** — DTV MIV × Tempo (Luzern vereinfacht auf drei Zonen: Mischverkehr / Markierung / bauliche Trennung).
- **Zürich** — je **Routentyp** (Vorzugsroute / Hauptnetz) eine eigene Matrix aus DTV × Tempo (`fuehrungsartZuerich`).
- **Basel** — **strassentyp**-basiert (verkehrs- vs. siedlungsorientiert) × Routentyp (Tab. 3, S. 15); DTV und Tempo spielen für die Soll-Wahl keine Rolle.

Die stadtspezifischen Soll-Regeln und die zugrunde liegenden Dokumente stehen unter [Datenherkunft je Stadt](#datenherkunft-je-stadt). Die **feel-safe-Anker und die Note-Mechanik** (Kap. 2–3) sind dagegen **stadtübergreifend** identisch.

*Beispiel Bern* — Entscheidung über DTV MIV × zulässige Höchstgeschwindigkeit:

```
DTV MIV \ km/h     ≤ 30           31–40         41–50               51–80
< 2'000            Mischverkehr   Velostreifen  Velostr./Radweg     Radweg
2'000–5'000        Velostreifen   Velostreifen  Velostr./Radweg     Radweg
5'000–10'000       Velostreifen oder Radweg (Übergang)               Radweg
> 10'000           Radweg         Radweg        Radweg              Radweg
```

Gelesen wird die Tabelle als **vier ineinander liegende Rechtecke** (Masterplan S. 11): Man landet
im kleinsten, das den Abschnitt enthält — die **strengere der beiden Achsen** entscheidet. Das Band
41–50 km/h ist im Schema durchgehend schraffiert («Velostreifen oder Radweg»), unabhängig vom
DTV-Band. Die drei DTV-Grenzen folgen dem Fliesstext, nicht der Pixelkante: 2'000 ist **schon**
Velostreifen («verkehrsarme Strassen (DTV < 2'000)»), 10'000 ist **noch** Übergang («stark belastete
Strassen (DTV > 10'000)»), und zu 5'000 schweigt der Text — dort gilt die Bandgrenze des Schemas.

*Zürich* (Velostandards, Abb. 1 S. 14) — je Routentyp; Tempo > 50 immer Radweg:

```
Velovorzugsroute (→ Velohauptroute)      ≤ 30 km/h                 31–50 km/h
  DTV < 2'500                            Mischverkehr              Velostr./Radweg
  DTV 2'500–7'500                        Velostr./Radweg           Velostr./Radweg
  DTV ≥ 7'500                            Velostr./Radweg           Radweg
Hauptnetz (→ Veloroute)
  DTV < 5'000                            Mischverkehr              Velostr./Radweg
  DTV ≥ 5'000                            Velostr./Radweg           Velostr./Radweg
```

*Luzern* (Anwendungshilfe S. 29, auf die Berner Formen vereinfacht: Markierung = Velostreifen) — Radweg ab DTV ≥ 15'000, bei 41–50 km/h schon ab 10'000 und immer bei > 50 km/h; Mischverkehr nur bei ≤ 30 km/h und DTV < 5'000 bzw. bei 31–40 km/h und DTV < 2'000; dazwischen Velostreifen (`fuehrungsartLuzern`).

*Basel* — siehe [Basel](#basel) (`fuehrungsartBasel`).

### 2. Führungsform-Note (Ist gegen Soll)

**Skala:** Schulnote, 6 = beste, 1 = schlechteste.

**Darstellung:** Die App zeigt vorne den vierstufigen **Erfüllungsgrad** und dahinter die Schulnote
(seit 22.10.2026; vorher liess sich zwischen beiden umschalten, Standard Schulnote). Der Erfüllungsgrad
ist eine reine Nachklassierung der Endnote (kein Einfluss auf die Berechnung); die Grenzen folgen der
Schulnoten-Logik (4 = «genügend» = Vorgabe gerade erfüllt; ungenügend ≤ 3 = nicht erfüllt):

| Note | Erfüllungsgrad |
|---|---|
| 5,5 – 6,0 | Vollständig erfüllt |
| 4,5 – 5,0 | Weitgehend erfüllt |
| 3,5 – 4,0 | Teilweise erfüllt |
| ≤ 3,0 | Gar nicht erfüllt |

**Rundung:** Die Note wird **immer auf die nächste 0,5 gerundet** (1,0 · 1,5 · 2,0 … 6,0). Gerundet wird kaufmännisch. Die Rundung erfolgt **einmalig auf die Endnote** (nach dem Breiten-Abzug); alle Zwischenwerte bleiben ungerundet.

#### Grundidee

Die Note misst, **wie nahe die subjektive Sicherheit der vorhandenen (Ist-)Form an das herankommt, was die empfohlene (Soll-)Form im selben Tempo-Kontext bieten würde.** Ist die vorhandene Form mindestens so stark vom Autoverkehr getrennt wie gefordert → beste Note. Liegt sie darunter, sinkt die Note proportional zum empirisch gemessenen *feel-safe*-Defizit.

Warum feel-safe? Die Soll-Wahl sagt nur, **welche** Form geeignet *wäre*. Wie viel eine schwächere Form an gefühlter Sicherheit kostet, lässt sich nicht aus der Tabelle ableiten — dafür dient die radwege-check-Befragung (FixMyCity).

Diese Note-Mechanik (feel-safe-Anker, Note-Formel, Rundung) ist **für alle Städte identisch**; stadtspezifisch sind nur die Soll-Wahl (Kap. 1) und die Breiten-Sollwerte (Kap. 3).

#### Subjektive Sicherheit (feel-safe)

In der Befragung beurteilte jede Person eine Szene auf einer **4-stufigen Skala**:

```
0  unsicher        1  eher unsicher        2  (eher) sicher        3  (sehr) sicher
```

Der **feel-safe %** ist der **Anteil der Bewertungen in den oberen zwei Klassen** (2 oder 3):

```
feel-safe %  =  Anteil(Klasse 2)  +  Anteil(Klasse 3)
```

Die vier Klassen-Anteile summieren sich je Szene auf 100. *Beispiel:* antworten 100 Personen mit 0 / 30 / 50 / 20, dann ist feel-safe % = 50 + 20 = **70**.

#### Schritt für Schritt

1. **Empfohlene Form bestimmen** aus DTV und Tempo. Beispiel:
   DTV 12'000 / 50 km/h → Soll = *Radweg*.
2. **Prüfen, ob die vorhandene Form ausreicht.** Die Formen bilden eine Rangfolge nach zunehmender Trennung vom Autoverkehr:

   ```
   Mischverkehr  <  Velostreifen <  «Velostreifen oder Radweg»  <  Radweg
      (keine        (Markierung      (Übergangsbereich)           (baulich
      Trennung)     auf Fahrbahn)                                  getrennt)
   ```

   Ist die vorhandene Form mindestens so weit oben wie die empfohlene → **Note 6** (mehr Trennung als nötig schadet nie). Nur wenn sie *schwächer* ist, geht es weiter.
3. **Tempo-Kontext wählen:** `ruhig` bei V ≤ 30 km/h, sonst `schnell`.
4. **Zielwert** = feel-safe % der **Soll**-Form im gewählten Tempo-Kontext. (Beim Übergangsfall «Velostreifen oder Radweg» das Mittel aus Velostreifen und Radweg.)
5. **Defizit** = Zielwert minus feel-safe % der **Ist**-Form (gleicher Tempo-Kontext) = der gemessene Verlust an gefühlter Sicherheit.
6. **Defizit in eine Note umrechnen:** `Note = 6 − Defizit / 14,2` (auf 1…6 begrenzt, auf 0,5 gerundet). Pro 14,2 fehlende feel-safe-Punkte eine ganze Notenstufe — Herleitung siehe unten.

#### Empirische Anker (feel-safe %, verifiziert)

radwege-check / FixMyCity, **tram-bereinigt**. Gezählt wird jede Bewertung der **Velo-Foto-Szenen** (Szenen-Merkmal `Kamera = C` — der Blickwinkel des Fotos bestimmt, welche Rolle bewertet wird), unabhängig von der Befragtengruppe; auch die Urteile der potenziellen Velofahrenden sind enthalten. Werte **unabhängig aus den Einzelantworten nachgerechnet** (`tools/verify_06.py`, §5; Kreuzvalidierung gegen den offiziellen `voteScore`: Abweichung höchstens 0,01 Punkte über 1'700 Szenen), je Tempo-Kontext, grosse Fallzahlen (N je Wert ≈ 2'000–22'000):

> **tram-bereinigt:** Befragungs-Szenen mit Tram (Schienen in der Fahrbahn) sind ausgeschlossen.
> Tramschienen senken das Sicherheitsempfinden unabhängig von der Veloanlage (Sturzrisiko,
> Spurrillen) und würden die feel-safe-Werte der Führungsformen sonst verzerren. Ausgeschlossen
> über das Szenen-Merkmal `FS-Art = Tram`.

```
                       ruhig (V ≤ 30)   schnell (V > 30)
Mischverkehr                 24               13
Velostreifen                 65               58
Radweg (baulich getrennt)    90               84
```

Zuordnung der Ist-Formen zu den Befragungsdaten:

- **Mischverkehr** → keine Radverkehrsanlage; seit dem 12.08.2026 **parkbereinigt** (24 statt 22 «ruhig» — ohne die parkierten Szenen, deren Wirkung der Parkierungs-Abzug separat trägt; «schnell» bleibt 13).
- **Velostreifen** → die **Referenzkonfiguration**: Sollbreite 2,5 m ohne Parkierung, seit dem 12.08.2026 aus **grauen Szenen mit schmaler gestrichelter Führungslinie** — dem Berner Markierungsbild (keine Einfärbung im Netz, kaum breite Trennlinien) —, linear aus den 2,0/3,5-m-Zellen interpoliert (60,8 + 0,5 × 9,3 ≈ 65 · 52,4 + 0,5 × 10,5 ≈ 58). Bewusst NICHT das Mittel über alle Szenen: Breite und Parkierung werden unten separat abgezogen — ein gepoolter Anker zählte sie doppelt und rechnete eine Ausstattung mit, die es im Bestand nicht gibt. <sub>Fassungs-Kette: gepoolt 77/73 (bis 11.08.2026) → grau 71/66 (Zwischenfassung vom 12.08.2026) → gestrichelt 65/58 (2 Fotos je Zelle — bewusster Preis, lokales Regelwerk 15.7, P10-Kasten).</sub>
- **Radweg** → seit dem 13.08.2026 die **Berner Radweg-Gruppe** im Klassen-Mittel (P11-A, lokales Regelwerk 15.7): Sperrpfosten-getrennte Fahrbahn-Radwege in Grau (G1: ruhig 90,2 → **90**; schnell 89,7) und — nur bei «schnell», dem Messdesign des Seitenraum-Experiments folgend — der **Seitenraum ohne Geschäftsnutzung** (G3: 83,7; gewichtet 83,9 → **84**). Die 18 «rechts vom Parken»-Szenen sind ohne Tempo-Codierung und bleiben aussen vor. Der Anker beschreibt damit den Bern-typischen Radweg-Bestand statt des reinen Poller-Zielwerts; Q2 und Q3 tragen weiterhin denselben Anker. <sub>Bis 13.08.2026: 91/91, gepoolt über Poller und Blumenkästen («Zielwert»-Lesart).</sub> <sub>Bis 10.08.2026 stand hier, in «Berliner Daten» lägen abgesetzte Radwege tiefer und der Abschlag werde für Bern nicht übernommen, weil Berns Seitenraum weniger von Geschäften geprägt sei. Beides war falsch: Die ganze Befragung ist Berlin (auch die Anker 91, 67/63, 22/13), und die Aussage über den Berner Bestand war eine Annahme — tatsächlich kommen beide Bauformen vor.</sub>

#### Warum 14,2 Punkte pro Notenstufe?

Der Faktor koppelt die feel-safe-Skala an die fünf Notenstufen von 6 bis 1. **Neu geeicht am 13.08.2026** (P13): Die Spanne ist die eigene Maximal-Lücke der Kette (Soll Radweg / Ist Mischverkehr, schnell: 84 − 13 = **71 Punkte**), also 71 / 5 = **14,2 Punkte pro Stufe** (`SCORE_PRO_NOTE`, tunbar) — der schlimmste Fall landet damit exakt auf Note 1,0, der Notenboden ist nur noch Reserve für Pauschalen-Kumulation. Einmalig geeicht und wieder eingefroren; die Basis-Kette des lokalen Rechners behält ihre Ersteichung 72 / 5 = 14,4 (Herleitung und Abwägung: lokales Regelwerk A4).

#### Warum kontext-sensitiv nach Tempo?

Dieselbe Fehlentscheidung wiegt bei hohem Tempo schwerer:

- **Empirisch** kostet höheres Tempo *ohne* Separation am meisten (Mischverkehr Tempo 30 → 50: −9; die Verkehrsmenge wirkt nur etwa halb so stark, −5). Baulich getrennte Formen bleiben dagegen kontext-robust (≈ 0).
- **Im Modell** wirken DTV und Tempo an unterschiedlichen Stellen:
  - das **DTV** bestimmt (zusammen mit dem Tempo), *welche* Führungsform vorgesehen ist — über die Soll-Tabelle (Kap. 1);
  - das **Tempo** beeinflusst *zusätzlich*, *wie stark* eine zu schwache Form abgewertet wird — weil die feel-safe-Werte der Formen tempoabhängig sind (Spalten „ruhig"/„schnell" in der Anker-Tabelle).

  So fliesst das Tempo **zweifach** ein (in die Soll-Wahl *und* in die Abzugshöhe), das DTV nur in die Soll-Wahl.

→ Eine zu schwache Form bei hohem Tempo wird stärker abgewertet als dieselbe bei tiefem Tempo.

#### Durchgerechnetes Beispiel

Abschnitt: **DTV 12'000 · 50 km/h · Ist = Velostreifen**

```
Soll      = fuehrungsart(12000, 50)            = Radweg        (DTV > 10'000)
Ist < Soll (Velostreifen < Radweg)              → Abzug
Tempo     = schnell                            (50 > 30)
Zielscore = feel-safe(Radweg, schnell)         = 84
Defizit   = 84 − feel-safe(Velostreifen,schnell)= 84 − 58 = 26
Note      = 6 − 26 / 14,2 = 6 − 1,83 = 4,17    → 4,0 (vor Breitenabzug, s. unten)
```

#### Resultierende Noten

Bei Tempo > 30 (schnell):

```
Soll \ Ist                Mischverkehr   Velostreifen  Radweg
Velostreifen                  3.0            6.0         6.0
Velostreifen oder Radweg       2.0            5.0         6.0
Radweg                        1.0            4.0         6.0
```

Bei Tempo ≤ 30 (ruhig) fallen dieselben Abweichungen milder aus:

```
Soll \ Ist                Mischverkehr   Velostreifen  Radweg
Velostreifen                  3.0            6.0         6.0
Velostreifen oder Radweg       2.0            5.0         6.0
Radweg                        1.5            4.0         6.0
```

<sub>Nachgerechnet am 07.09.2026 mit den Ankern 24/13 · 65/58 · 90/84 und Kurs 14,2 (Übergang = Mittel 77,5 / 71); vor Breiten-, Parkierungs- und Haltestellen-Abzügen. Die bis dahin abgedruckten Tabellen stammten noch aus der Kette 77/73 mit Kurs 14,4.</sub>

### 3. Breiten-Abzug und Parkierung

Nach der Führungsform-Note wird die **Breite** der Anlage gegen die **Soll-Regelbreiten der jeweiligen Stadt** geprüft (Fallback je Feld: Bern-Regelbreiten). Massgeblich ist je nach Routentyp **Optimal** (Velohauptroute) oder **Minimal** (Veloroute). Der Abzug-Mechanismus ist stadtübergreifend; nur die Sollwerte unterscheiden sich — die stadtspezifischen Tabellen stehen unter [Datenherkunft je Stadt](#datenherkunft-je-stadt).

*Bern-Regelbreiten (zugleich Fallback für nicht abgedeckte Felder):*

```
Ist-Form (Querschnittstyp)        Optimal   Minimal
Velostreifen                 Q1     2.50      1.80
Radweg strassenbegl. / Gesch. Velostreifen Q2  2.50   1.80
Radweg abgesetzt                           Q3  2.50   1.50
Umweltspur (Bus+Velo)        Q4     4.50      3.75   (DTV/Tempo n.r.; siehe Bus-Takt)
Einbahn mit Velogegenverkehr Q7     2.00      1.80   (mit Markierung bzw. baulicher Trennung; ohne Markierung keine Breite)
Velostrasse                  Q9     Band 4.50–6.50 m (Min u. Max, beide Routentypen; nur Tempo 30)
Zweirichtungsradweg          Q10    4.50      3.20   (baulich getrennt, beide Richtungen; Rang wie Radweg)
Kombinierter Fuss-/Radweg    Q11    3.50      3.50   (Bern/Luzern; Basel 6.00/4.80; KEIN Note-4-Deckel)
Fussweg Velo gestattet       Q12    3.50      3.50   (DTV/Tempo n.r.; Mischfläche, max. Note 4)
Mischverkehr                 Q6     –         –      (keine Breitenvorgabe)
```

```
Sollbreite   = Optimal (Velohauptroute) bzw. Minimal (Veloroute)
Defizit_m    = max(0, Sollbreite − Ist-Breite)
Breitenabzug = Defizit_m × Satz der feel-safe-Klasse:
                                              ≤ 30 km/h   > 30 km/h
                 auf der Fahrbahn                 1,0         1,0     (Velostreifen, Einbahn mit Markierung)
                 hinter baulicher Trennung        0,24        0,38    (Radwege, Zweirichtungsradweg, Fuss-/Radwege, Einbahn mit baulicher Trennung)
                 Fahrgassen-Bänder                0,9         0,9     (Velostrasse, Umweltspur)
Endnote      = runde_0,5( Führungsform-Note − Breitenabzug , begrenzt 1…6 )
```

##### Woher die drei Sätze kommen

**Fahrbahn: 1,0 Notenstufen je Meter — vorläufige Kalibrierung aus zwei Erhebungen** (seit 22.09.2026). Zwei Befragungen haben gemessen, wie viel Feel-Safe-Punkte ein Meter Velostreifenbreite bringt, in unterschiedlichen Breitenbereichen:

```
Berliner Strassencheck   2,0 → 3,5 m:   9,3 Pkt/m (T30) · 10,5 (T50)   ≈ 0,65 / 0,74 Noten/m
Berner Bildumfrage 2026  1,5 → 1,8 m:  18,9 Pkt/m                      ≈ 1,33 Noten/m (0,50…2,20)
                         1,5 → 2,0 m:  21,2 Pkt/m                      ≈ 1,49 Noten/m (0,74…2,25)
```

Der Rechner zieht fast ausschliesslich **unterhalb von 2,0 m** ab (1,5 statt 1,8 m auf Velorouten, Abweichungen von 2,5 m auf Velohauptrouten) — also genau dort, wo die Berner Umfrage misst und die Berliner Werte nur extrapoliert sind. Beide Berner Schätzwerte liegen deutlich über den Berliner. Als Satz gilt **1,0**: der gerundete Durchschnitt der vier Schätzwerte, zugleich im Fenster **0,74–1,05**, das mit allen vier Vertrauensbereichen verträglich ist. **Für beide Tempoklassen derselbe Wert**, weil die Berner Umfrage nach Verkehrsmenge statt Tempo unterscheidet und darum keine Tempo-Differenzierung stützt. Eine begründete Modellentscheidung, kein eindeutig aus den Daten bestimmter Wert — Herleitung und Einordnung im [Ergebnisbericht](docs/09_Umfrage_Subjektive_Sicherheit_Bern_2026/Ergebnisbericht.md), Kapitel 5.4/5.5.

**Hinter baulicher Trennung: 0,24 / 0,38 — gemessen** (Berliner Poller-Szenen, derselbe Pool wie der Radweg-Anker; `tools/verify_06.py` §4/§5). Der Satz ist ein Bruchteil des Fahrbahn-Satzes: Hinter der Trennung schützt die **Trennung**, Breite ist dort Komfort. Er bleibt tempoabhängig — Tempo wirkt umso stärker, je weniger Schutz da ist.

**Fahrgassen-Bänder: 0,9 — normativ.** Für Velostrasse und Umweltspur ist die «Breite» die Fahrbahn bzw. Spur, nicht ein Velostreifen; keine der Befragungen liefert dafür einen Gradienten.

**Vorbehalte:**

- **Linearität ist eine Modellannahme.** Gemessen sind Breiten*schritte* (Berlin 1,5 m, Bern 0,3 und 0,5 m); der Abzug auf Zentimeter-Ebene ist Interpolation. Für Streifen deutlich unter 1,5 m ist auch die Berner Grundlage nicht mehr gedeckt.
- **Die Kalibrierung mischt zwei Erhebungen** mit unterschiedlichen Breitenbereichen, und die beiden Berner Schätzwerte teilen sich einen Teil der Bewertungen — der Durchschnitt ist eine Orientierung, kein statistisch zusammengeführter Wert.
- **Rundung relativiert kleine Defizite:** Sicher eine halbe Notenstufe kostet ein Defizit erst ab 0,5 m (Fahrbahn), ab ≈ 1,3–2,1 m (baulich); darunter kippt die Stufe nur nahe einer Rundungsgrenze.

Tunbar über `BREITE_SATZ`.

**Beispiel** (Fortsetzung: DTV 12'000 / 50 km/h / Ist Velostreifen → Form-Note ungerundet 4,17):

```
Velohauptroute, Velostreifen, Breite 1,80 m
  Sollbreite   = Optimal 2,50 m
  Defizit      = 2,50 − 1,80 = 0,70 m
  Breitenabzug = 0,70 × 1,0 = 0,70
  Endnote      = 4,17 − 0,70 = 3,47 → 3,5
```

Das Tempo steckt weiterhin in der Note — über die feel-safe-Anker der Führungsform und, hinter baulicher Trennung, über den Satz. Bei erfüllter Breite (Ist ≥ Vorgabe) gibt es keinen Abzug.

**Chronik des Fahrbahn-Satzes:** bis 10.08.2026 ein einzelner gepoolter Wert (0,6; mischte die Parkierungswirkung in den Breiteneffekt), dann tempoabhängig aus dem sauber geschnittenen Berliner Gestrichelt-Pool (0,65/0,74, P10-U/P13), seit 22.09.2026 die Kalibrierung 1,0 unter Einbezug der Berner Bildumfrage.

#### Parkierung rechts (Dooring)

Wo das Velo **auf der Fahrbahn neben möglichem Längsparken** fährt, kann angegeben werden, ob rechts längs geparkt wird (Dooring-Lage). Das betrifft die Fahrbahn-Führungsformen **Mischverkehr, Velostreifen, Velostrasse, Umweltspur und Einbahn mit Velogegenverkehr (markiert)** (Konstante `PARKEN_RELEVANT` in [`VeloroutenCheckWeb/src/fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts)); bei baulich abgesetzten Radwegen und beim Fussweg greift der Dooring-Mechanismus nicht, dort wird das Feld nicht angezeigt. Auswahl **Ja / Nein / Egal**:

- **Ja** → Abzug **1,0 Notenstufe**, pauschal für jede Führungsform und jede Breite. In jedem Fall keine Note 6, sobald Parken rechts vorhanden ist.
- **Nein / Egal** → kein Abzug.

Bei **Ja** kann zusätzlich angegeben werden, ob ein **Sicherheitsstreifen gegenüber den Parkplätzen** (SN 640 060; im Basler Standard-Papier genannt) vorhanden ist. Ist er vorhanden, entschärft er die Dooring-Gefahr → **kein Abzug**. Da SN 640 060 eine CH-Norm ist, gilt das in allen Stadt-Rechnern.

**Offener Punkt: der Schaden ist gemessen breitenabhängig — die Skala trägt aber nicht.** Bis zum 09.08.2026 rechnete der Abzug `0,6 + 0,9 × (3,5 − Streifenbreite)`. Der Befund dahinter bleibt gültig (Velostreifen, ungeschützt, tram-bereinigt; Vergleich bei **gleicher Breite und gleichem Tempo**, `tools/verify_06.py` §5):

```
Parken-Offset bei 3,5 m Streifen:    8,5–9,6 Pkte  ≈ 0,6 Noten   (man kann der Türzone ausweichen)
Parken-Offset bei 2,0 m Streifen:  28,8–29,6 Pkte  ≈ 2,0 Noten   (man fährt zwangsläufig darin)
```

Zurückgenommen wurde die Formel, weil die Befragung **genau diese zwei Streifenbreiten** kennt und der reale Bestand fast vollständig darunter liegt: Der breiteste in Bern erfasste Velostreifen misst **2,50 m**, und **282 von 340** sind schmaler als der *kleinste* Messpunkt — dort war die Formel reine Verlängerung (1,50 m ergäbe −2,40 Noten, mehr als je gemessen). Ein dritter, vorhandener Messpunkt widerspricht ihr zudem: Im **Mischverkehr** kostet die Parkierung nur ≈ 0,15 Noten, weil dort keine Markierung den Platz in die Türzone weist — der Schaden hat sein Maximum bei ≈ 2,0 m und fällt zu beiden Seiten ab. Was fehlt, sind Szenen mit Streifenbreiten **unter 2,0 m**; solange sie fehlen, ist die Pauschale die ehrlichere Zahl.

Zum Vergleich: liegt das Velo **rechts vom Parken** (Parken schirmt vom Verkehr ab), steigt der Wert auf ≈ 92 %; diese günstige Lage ist im Datensatz aber nur schwach belegt (6 Szenen) und derzeit nicht als eigene Option umgesetzt. Parameter `PARKEN_ABZUG`, tunbar.

#### Tram in der Fahrbahn

Liegen **Tramschienen in der Fahrbahn**, sinkt das Sicherheitsempfinden unabhängig von einer Haltestelle (Sturzrisiko, Spurrillen). Das Feld „Tram in der Fahrbahn" ist daher **von der Haltestelle entkoppelt** und wird automatisch aus dem Geoportal (`oevTram`) gesetzt. Die Regel greift **nur bei Mischverkehr** (wo das Velo die Fahrbahn mit den Gleisen teilt); bei eigener Radverkehrsanlage ist der Effekt empirisch ~0.

**Befund** (verifizierte radwege-Werte, Mischverkehr, mit vs. ohne Tram):

```
                    feel-safe ohne Tram   feel-safe mit Tram   Δ        Δ in Notenstufen (Δ/14,4)
Tempo 30                  27,1 %                9,4 %         17,7     ≈ 1,2
Tempo 50                  15,2 %                5,4 %          9,8     ≈ 0,7
(N je Zelle ≈ 800–2'900; Vergleich bei gleichem Aufkommen)
```

→ **Deckel: höchstens Note 3**, nur Mischverkehr, tempo-unabhängig, **nicht an einer Haltestelle mit separater Velofläche** (seit 29.09.2026: dort fährt das Velo an der Schiene vorbei). Konstante `TRAM_DECKEL`, tunbar. Auf einem Niveau von 9,4 % bzw. 5,4 % feel-safe lässt sich keine bessere Note begründen — und ein Deckel kappt nur nach oben, statt eine ohnehin schlechte Note weiter zu drücken. Dazu: **Kaphaltestelle an einer Tram-Haltestelle** ohne bauliche Trennung → **Note 1** (`KAP_NOTE`), weil das Velo dort über die Schienen an die Haltekante gedrängt wird, während Fahrgäste ein- und aussteigen. Auslöser ist der Berner Typ «Kaphaltestelle» (HS3) zusammen mit **einem** der beiden Tram-Merkmale, «Tram in der Fahrbahn» oder ÖV-Angebot «Tram»; der Basler Typ «Kap» löst die Regel nicht aus.

> _Seit 14.08.2026._ Vorher wirkte der Befund als tempoabhängiger Abzug (−1,2 / −0,7, `TRAM_MALUS`). Die Umstellung gleicht den Online-Rechner an den lokalen Berner Rechner an; der Befund selbst ist unverändert. Vollständiger Rechenweg und Reproduktion: `tools/verify_06.py` (§2) bzw. `docs/07_Tram_in_der_Fahrbahn.md`.

### 4. Sonderfälle (Umweltspur, Velostrasse, Fussweg)

#### Umweltspur (Q4, Bus+Velo)

DTV und Tempo sind **nicht massgebend**, sondern der **Bus-Takt** (zusätzliches Feld öV-Takt [Min]) und die Breite. Die Eignung sinkt mit steigender Busfrequenz (kürzerem Takt) und ist nach oben gedeckelt, davon der Breiten-Abzug (× 0,9). **Decke und Takt-Modell sind stadtspezifisch** (Konstanten `UMWELTSPUR_DECKE` und `UMWELTSPUR_TAKT`): Bern rechnet mit **Stufen**, Zürich und Luzern mit einer **Rampe** (`umweltspurBasis`) — Note 1 bei Takt ≤ `taktNote1`, die Decke ab Takt ≥ `taktOk`, linear dazwischen. Ohne Takt-Angabe gilt die Decke — ein eingetragener Takt kann die Note nur senken; ein Takt ≤ 0 zählt als «nicht erfasst».

| Stadt | Takt-Modell | Quelle / Herleitung |
|---|---|---|
| **Bern** | Drei Stufen: < 7,5 → **2**, 7,5 bis < 15 → **4**, ≥ 15 → **Decke 5** | Deckungsgleich mit dem lokalen Batch-Rechner. Unter 7,5 Min nennt der Standard die Umweltspur als Führungsform unzulässig — das erscheint als Warnung, erzwingt die Note aber nicht. |
| **Zürich** | Rampe 5↔15: ≤ 5 → Note 1, ≥ 15 → Decke 4 (unverändert) | Velostandards: «< 5 Min keine Anwendung, < 15 Min kritisch». |
| **Luzern** | Rampe 5↔15 (gleiche Anker wie Zürich) | Eigene Bewertung 1–5: Takt < 5 → Bew. 1, ≥ 15 → Bew. 3 (Decke); normiert = Note 1↔4. |
| **Basel** | keine Takt-Abhängigkeit | Basel nennt keinen Schwellwert; Eignung qualitativ (Busspur-Breite, Anzahl Linien, Taktdichte, Velofrequenz) → Note rein breitengetrieben + Hinweis. |

Breiten-Vorgaben je Stadt: Bern/Luzern 4,50 / 3,75 m; Zürich 4,80 / 4,50 m; Basel 4,50 / 3,00 m.

> Datenlage: FixMyCity enthält praktisch keine Umweltspur-Szenen (nur 2 Bus-Szenen) → Decke und
> Takt-Schwellen sind **normativ** (aus den jeweiligen Stadt-Standards). Parameter `UMWELTSPUR_DECKE`,
> `UMWELTSPUR_TAKT`, tunbar.

#### Velostrasse (Q9)

Die **Breite** der Velostrasse ist die Nettobreite der Fahrbahn: das Fahrband ohne Parkierung (Masterplan Q 9; Basel zusätzlich ohne Sicherheitsabstand zur Parkierung), nicht die Breite einer Seite. Sie gehört zu keiner Fahrtrichtung: Haben beide Seiten die Form «Velostrasse» mit eigenen Werten (etwa Parkierung nur auf einer Seite), gilt eine Breite für beide (`velostrasseGleich` in [`strecke.ts`](VeloroutenCheckWeb/src/strecke.ts), seit 23.10.2026, Beispiel Militärstrasse): von Hand, gemessen («Ganze Fläche» zieht je Seite mit Parkierung 1,90 m ab) oder abgeleitet (`velostrasseBreiteAusFahrbahn`: Fahrbahnbreite minus Parkierung je Seite mit «Parkierung rechts: Ja», Vorgabe der Stadt, auf 5 cm; Militärstrasse 6,2 − 1,9 = 4,30 m). Abgeleitet wird, sobald die Fahrbahnbreite bekannt ist, aus der AV, gemessen, aus OSM oder von Hand, und bei jeder Änderung von Fahrbahnbreite, Parkierung, Form oder Seite B; eine von Hand eingetragene oder gemessene Breite bleibt, eine abgeleitete folgt nach. Herkunft «AV» (Chip), wenn die Fahrbahnbreite aus der AV oder gemessen ist, sonst ohne Chip. Damit das schon in der Bewertung geschieht und nicht erst in der Planung, holt die App für Abschnitte von der Karte mit Velostrasse und ohne Fahrbahnbreite diese von selbst aus der AV (`velostrasseAvHolen`): nach «Segmente in Strecke übernehmen» und wenn die Form von Hand auf Velostrasse wechselt; die Meldung beginnt mit «Velostrasse:».

Nur **bei Tempo 30** zulässig; sonst entspricht die Führungsform nicht den Vorgaben → **Note 1** mit Hinweis. **Parkierung rechts (Dooring)** zählt auch auf der Velostrasse, je Fahrtrichtung (`PARKEN_RELEVANT`): Liegen die Parkfelder nur auf einer Seite, haben die beiden Richtungen bei gleicher Breite verschiedene Noten (Militärstrasse 46711435). bewusst belassen, obwohl auf der Velostrasse mittig gefahren wird und Q 9 Parkierung vorsieht; ein Sicherheitsstreifen nach SN 640 060 hebt den Abzug auf. Bei Tempo 30 gilt die Form als erfüllt (Basis-Note 6); anschliessend wirkt die Breite. Die Breite ist ein **Band 4,50–6,50 m** (Min und Max, identisch für beide Routentypen): Abzug bei zu schmal (< 4,50 m) *oder* zu breit (> 6,50 m), je `Abweichung × 0,9`.

#### Kombinierter Fuss-/Radweg (Q11)

Gemeinsam genutzter, baulich **vom MIV abgesetzter** Geh-/Radweg (OSM: `path`/`footway` mit `bicycle=designated` + `foot=designated`, nicht `segregated`). Anders als der «Fussweg Velo gestattet» **keine Note-4-Deckelung**: hohe Separation (Rang wie Radweg) → erfüllt die Soll-Form (Basis-Note 6), die Note ist dann **breitengesteuert**. Breitenvorgabe stadtspezifisch: **Bern/Luzern/Zürich ≥ 3,50 m** (beide Routentypen; Zürich vermeidet die Form in aktuellen Planungen, Ausnahme bei geringer Frequenz, Mindestbreite 3,50 m gemäss VSS-Leitfaden); **Basel** frequenz-/routenabhängig **6,00 m** (Velohauptroute, mittlere–hohe Frequenz) bzw. **4,80 m** (Veloroute, geringe Frequenz; reduziert 5,00 / 4,20 m).

#### Fussweg Velo gestattet (Q12)

Mischfläche Fuss/Velo, Kompromiss-/Restlösung → höchstens **Note 4 («genügend»)**, davon Breiten-Abzug (Vorgabe ≥ 3,50 m, beide Routentypen). Die situativen **Voraussetzungen** werden als Hinweis-Checkliste angezeigt (kein Noteneinfluss): erhöhtes Schutzbedürfnis Velo (z. B. Schulwege), geringe Fuss-/Velofrequenz, Steigung oder kein Gefälle, etablierte/konfliktarme Situation, ausreichende Breite (≥ 3,50 m), fehlende Alternativen; zusätzlich der Hinweis: **bei Gefälle besondere Vorsicht** (hohe Differenzgeschwindigkeit Velo ↔ Fuss). Normativ (keine FixMyCity-Daten für Mischflächen verwendet).

#### Einbahn mit Velogegenverkehr (Q7)

Dreistufig, je nach Sicherung der Gegenrichtung (`GEGENVERKEHR_FORMEN`): **ohne Markierung** = Rang wie Mischverkehr, keine Breitenvorgabe; **mit Markierung** = Rang wie Velostreifen (Fahrbahn-Satz); **mit baulicher Trennung** = Rang wie Radweg. Regelbreiten Bern 2,00 / 1,80 m, Stadt-Überschreibungen: Zürich 1,80 / 1,80, Basel 2,50 / 1,80, Luzern 2,50 / 2,00. Wird **nicht** automatisch aus OSM erkannt (ein Contraflow-Streifen fällt auf die zugrunde liegende Anlage zurück), sondern im Dropdown von Hand gewählt; Vorgabe «mit Markierung». Auf einer OSM-Einbahn mit `oneway:bicycle=no` weist die Maske darauf hin; die Gegenrichtung lässt sich dann als Seite B erfassen.

#### Zweirichtungsradweg (Q10)

Baulich vom MIV getrennt und in beiden Richtungen befahrbar → höchste Separation (Rang wie Radweg), erfüllt jedes Soll; die Note steuert allein die Breite, 4,50 (Velohauptroute) / 3,20 m (Veloroute). Aus OSM nur bei ausdrücklichem `oneway=no` bzw. `oneway:bicycle=no` an einem `cycleway` erkannt; ein `cycleway` ohne Angabe bleibt «Radweg abgesetzt».

### 5. Haltestellen (ÖV)

Zum Abschnitt gehört der Umgang mit **ÖV-Haltestellen**. Eingabe **ÖV-Angebot**: keine Haltestelle / Bus ≥ 15 Min / Bus 5–15 Min / Bus < 5 Min / Tram; bei vorhandener Haltestelle zusätzlich der **Haltestellentyp**.

Die Haltestellen-Logik unten (Soll-Lösung, Typologie, Abzüge) folgt dem **Berner** Masterplan. Stadtspezifisch: **Bern/Luzern** mit automatischer Soll-Lösung (Takt × Route, Luzern ohne Tram), **Zürich/Basel** ohne automatischen Abzug — dort nur Typ-Auswahl + Breite. Jede Stadt hat ihre **eigene Typenliste** (`HALTESTELLEN`), mit Einsatzfamilie und Breitenvorgabe (Optimal / Minimal):

| Stadt | Separate Velofläche (mit Breite) | Mischverkehr-Familie |
|---|---|---|
| **Bern** | HS1 Veloumfahrung 1,8/1,6 · HS2 Kap mit Veloüberfahrt 1,8/1,5 · HS4 rückwärtiger Radweg 1,8/1,6 · HS5 Inselhaltestelle 2,5/1,5 | HS3 Kaphaltestelle · HS6 Fahrbahnhaltestelle Bus · HS7 Busbucht |
| **Zürich** | Fahrbahnhaltestelle mit Veloumfahrung 1,8/1,5 · mit Veloüberfahrt 1,8/1,5 | Fahrbahnhaltestelle mit Veloführung auf Fahrbahn |
| **Basel** | Velobypass 1,6/1,2 · Velo-Zeitinsel 2,05/1,65 · Inselhaltestelle 1,8/1,6 | Kap |
| **Luzern** | Veloumfahrung 1,8/1,5 · rückwärtiger Radweg 2,5/1,6 | Fahrbahnhaltestelle · Fahrbahnhaltestelle in der Umweltspur · Busbucht |

**Soll-Veloverkehrslösung** (Bern, aus dem Masterplan-Diagramm, S. 63):

```
ÖV-Angebot \ Route     Veloroute        Velohauptroute
Tram                   Separate         Separate
Bus  < 5 Min           Übergang*        Separate
Bus  5–15 Min          Mischverkehr     Übergang*
Bus  ≥ 15 Min          Mischverkehr     Mischverkehr
```

Scoring: ÖV (Tram 3 / Bus<5 2 / Bus5–15 1 / Bus≥15 0) + Route (Velohauptroute 1 / Veloroute 0); Summe ≥ 3 → Separate Velofläche, = 2 → Übergang (\*Einzelfallprüfung), ≤ 1 → Mischverkehr.

**Haltestellentypen, Einsatzbereich und Breite der Veloführung** (Velohauptroute → Optimal, Veloroute → Minimal):

```
Typ                                      Einsatzbereich       Optimal   Minimal
HS1  Haltestelle mit Veloumfahrung       Separate Velofläche  1.8       1.6
HS2  Kaphaltestelle mit Veloüberfahrt    Separate Velofläche  1.8       1.5
HS3  Kaphaltestelle (Ausnahme)           Mischverkehr         –         –
HS4  Haltestelle mit rückw. Radweg       Separate Velofläche  1.8       1.6
HS5  Inselhaltestelle                    Separate Velofläche  2.5       1.5
HS6  Fahrbahnhaltestelle Bus             Mischverkehr         –         –
HS7  Busbucht                            Mischverkehr         –         –
```

**Noteneinfluss (zwei unabhängige Abzüge):**

- **Einsatzbereich:** Abzug **−1,0**, wenn die Soll-Lösung *Separate Velofläche* verlangt, der vorhandene Typ aber aus der **Mischverkehr-Familie** (HS3/HS6/HS7) stammt. Über-Erfüllung und der Übergangsbereich geben keinen Abzug.
- **Breite der Veloführung an der Haltestelle:** nur bei Typen mit Breitenvorgabe (Bern: HS1/HS2/HS4/HS5) und nur, solange ein ÖV-Angebot gewählt ist. Zu schmal → Abzug
  `Defizit_m × Fahrbahn-Satz` (markierte Velofläche auf Fahrbahnniveau → Velostreifen-Satz `BREITE_SATZ`, seit dem 22.09.2026 einheitlich **1,0** bei > 30 km/h). Der Masterplan nennt für
  HS1/HS4 den Bereich 1,8–2,5 m (Standard 1,80, situativ bis 2,50, minimal 1,60); der Rechner rechnet mit 1,8 als Sollwert
  und 1,6 als Minimum (HS4 bis 20.10.2026 mit 2,5; Minimum 1,60, anzustreben 1,80 bis 2,50 — `HALTESTELLEN` in [`fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts)).

> Normativ: zu Haltestellen gibt es keine FixMyCity-Daten → Schwellen aus dem Masterplan bzw.
> gesetzt. Parameter `HALTESTELLE_ABZUG` (1,0) und `BREITE_SATZ`, tunbar.

**Haltestellenbereich (nur Bern, seit 20.10.2026; nur online, der lokale Rechner bleibt unverändert).** Prägt die Haltestelle den Abschnitt (Schalter «Haltestellenbereich» in der ÖV-Haltestelle), zählt für die Note je Seite mit Haltestelle allein die Haltestelle (`haltestellenbereichNote` in [`fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts)): der Haltestellentyp, von Hand erfasst, gegen die Soll-Lösung oben. Führungsform, DTV, Tempo, Parkierung und Tram-Deckel zählen dort nicht; eine Seite ohne Haltestelle wird normal bewertet.

| Fall | Note |
|---|---|
| erfüllt: separater Typ, wo separate Velofläche verlangt ist; im Übergang und im Mischverkehr jeder Typ (auch Fahrbahnhaltestelle, Busbucht, Kaphaltestelle ohne Tram) | **6**, minus Abzug für eine zu schmale Velofläche (wie oben) |
| separate Velofläche verlangt, Typ der Familie Mischverkehr | **2** (`HALTESTELLENBEREICH_NICHT_ERFUELLT`) |
| Kaphaltestelle an einer Tramhaltestelle | **1** (`KAP_NOTE`) |

Die App schlägt den Schalter vor, wenn die ÖV-Erkennung eine Haltestelle im Abschnitt findet und er höchstens 60 m lang ist (`HALTESTELLENBEREICH_MAX_M`, Länge aus den Segmenten), mit dem Grund und «Nein» zum Ablehnen. Im CSV steht er in der letzten Spalte «Haltestellenbereich».

### 6. Note von Abschnitt und Strecke

**Wann erscheint die Note?** Erst wenn die nötigen Felder jeder bewerteten Seite gefüllt sind (`seiteKomplett` in [`bewertung.ts`](VeloroutenCheckWeb/src/bewertung.ts)): die **Führungsform** immer; **DTV und Tempo** bei allen Formen ausser Umweltspur und Fussweg Velo gestattet (`brauchtDtvTempo`); die **Breite** bei allen Formen mit Breitenvorgabe — nicht bei Mischverkehr und nicht bei «Einbahn Velogegenverkehr ohne Markierung» (`brauchtBreite`). Stadtspezifisch: In **Bern** gilt ein fehlender DTV bei bekanntem Tempo als ≤ 2'000, sofern der Abschnitt von der Karte stammt und der Verkehrsdaten-Layer für ihn abgefragt werden konnte (siehe [Bern](#bern)); bei von Hand angelegten Abschnitten ist der DTV einzugeben; in **Basel** ist der DTV nie Pflicht, dafür der **Strassentyp**. Bis dahin steht „Eingabe nötig" mit den Feldern, die noch fehlen (`fehlendeEingaben` in [`bewertung.ts`](VeloroutenCheckWeb/src/bewertung.ts)). Solange ein Abschnitt unvollständig ist, bleibt auch die Strecken-Note offen.

**Abschnitts- und Strecken-Note.** Weicht Seite B ab, erhält jede Seite ihre eigene Note mit Erklärung; der Abschnitt erhält die Note der **schlechteren Seite**, die als „massgebend für den Abschnitt" markiert ist (`bewerteAbschnitt` in [`bewertung.ts`](VeloroutenCheckWeb/src/bewertung.ts)). Ist Seite B wie Seite A, gilt eine Note für beide. Die Strecke erhält die Note ihres **schlechtesten Abschnitts**. Angezeigt werden jede Abschnitts-Note einzeln, die Strecken-Note und der massgebende (schlechteste) Abschnitt.

**Andere Standards.** Unter der Note steht dieselbe Bewertung nach den Standards der drei anderen Städte (Kürzel + Note, `vergleichsNoten` in [`fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts)); ein aufklappbares „Warum?" nennt die Treiber einer Abweichung (andere Soll-Führungsform, andere Umweltspur-Regel, andere Soll-Breite, andere Haltestellen-Regel, stadtspezifischer Hinweis). Die Soll-Führungsform wird nur genannt, wo sie die Note trägt — nicht bei Umweltspur und Fussweg Velo gestattet. Reine Zusatzinformation. Fehlt der Basler Strassentyp, wird er aus dem Verkehr geschätzt (`baselStrassentypAusVerkehr`: Tempo > 30 oder DTV ≥ 5'000 → verkehrsorientiert), was in der Zeile ausgewiesen wird.

### 7. Vorgaben je Stadt

#### Bern

**DTV-Formel.** Das Live-Service liefert kein `DTV`-Feld (das existiert nur im Datei-Export GDB/GPKG der Stadt Bern), sondern `Nt`/`Nn` — die Verkehrsmenge in der Tagstunde (06–22 Uhr, 16 h) bzw. Nachtstunde (22–06 Uhr, 8 h). Daraus:

```
DTV = round(16 × Nt + 8 × Nn)
```

Empirisch per Least-Squares-Regression gegen einen GeoPackage-Export hergeleitet (1186 Segmente, max. Abweichung 1,2 Fahrzeuge, Mittel 0,42) und cross-validiert gegen die Jahresauswertung der Messstelle Thunstrasse 100 (gemessen 17'191, Formel 17'190). DTV ist **partiell** — er greift nur auf Strassen mit DTV > 2'000 Mfz/Tag bzw. im Stadtteil 1 (Altstadt); die Werte sind „nur eine Grössenordnung, keine verbindlichen Zählresultate".

**DTV-Annahme.** Weil der Layer alle Strassen mit DTV > 2'000 und alle Altstadt-Strassen führt, gilt **kein Eintrag** bei bekanntem Tempo als **DTV ≤ 2'000**: Der Rechner rechnet dann mit dem Repräsentanten `DTV_ANGENOMMEN = 1000` (jeder Wert < 2'000 ergibt dasselbe Soll) und zeigt den Chip „angenommen ≤ 2000". Das gilt **je Abschnitt** und nur, wenn nachgesehen wurde (`dtvGeprueft`, gesetzt in [`bern.ts`](VeloroutenCheckWeb/src/bern.ts), ausgewertet von `dtvAssumed` in [`strecke.ts`](VeloroutenCheckWeb/src/strecke.ts)): Der Abschnitt stammt von der Karte, der Verkehrsdaten-Layer hat für jedes seiner Segmente vollständig geantwortet, und höchstens 20 % der Segmentlänge liegen an einer Verkehrsdaten-Linie. Von Hand angelegte Abschnitte, Segmente mit gescheiterter Abfrage und Segmente, die nur teilweise an einer erfassten Strasse liegen, zeigen „Eingabe nötig". Fehler, die der Dienst mit HTTP 200 ausliefert, und gekappte Ergebnisse gelten als gescheiterte Abfrage.

#### Zürich

**Routentyp-Mapping Zürich → Masterplan.** Der Zürcher Velonetzplan kennt drei Netzkategorien (Velostandards Stadt Zürich, S. 7); sie werden auf die beiden Masterplan-Routentypen übersetzt; der Routentyp steuert in Zürich die Soll-Führungsform (eigene Matrix je Routentyp, siehe [Soll-Führungsform](#1-soll-führungsform)), die massgebliche Breiten-Untergrenze (Optimal/Minimal) und die Haltestellen-Typenliste:

| Zürich `kategorie` | → Routentyp |
|---|---|
| `Vorzugsroute` | Velohauptroute |
| `Hauptnetz` | Veloroute |
| `Basisnetz` | *(kein Routentyp — manuell)* |

**Stadtspezifische Breiten-Sollwerte (Zürich).** Für Zürich gelten die **Standardmasse der Velostandards Stadt Zürich** (Tab. 1, S. 16) statt der Berner Regelbreiten — Velovorzugsroute → Velohauptroute (Optimal), Hauptnetz → Veloroute (Minimal):

| Führungsform | Velohauptroute | Veloroute |
|---|---|---|
| Velostreifen · Radweg strassenbegl./gesch. · Radweg abgesetzt | 2,50 m | 2,20 m |
| Zweirichtungsradweg | 4,80 m | 3,50 m |
| Umweltspur | 4,80 m | 4,50 m |
| Kombinierter Fuss-/Radweg | 3,50 m | 3,50 m |
| Einbahn mit Velogegenverkehr (markiert / baulich) | 1,80 m | 1,80 m |

Wo Zürich keine eigene Vorgabe hat (Velostrasse-Band 4,50–6,50 m, Fussweg Velo gestattet, Mischverkehr), gelten weiterhin die **Berner Werte** (Fallback je Feld). Implementiert als `BREITEN_ZUERICH` in [`fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts), übergeben über den `breiten`-Eintrag der Stadt-Registry. Die **Soll-Führungsform** folgt der **Zürcher** Tabelle (je Routentyp eine DTV × Tempo-Matrix, `fuehrungsartZuerich`); die feel-safe-Logik bleibt stadtübergreifend.

#### Basel

**Soll-Führungsform Basel.** Nicht DTV-, sondern **strassentyp**-basiert (× Routentyp; Tab. 3, S. 15). Auf **siedlungsorientierten** (nicht verkehrsorientierten) Tempo-30-Strassen: Vorzugsroute (Velohauptroute) → **Velostrasse** (DWV-Deckel 2'500); Pendler-/Basisroute (Veloroute) → **Mischverkehr** (DWV-Deckel 5'000, empfohlen) **oder Velostrasse** (mögliche Form, **kein** DWV-Deckel). «Einbahn Velogegenverkehr ohne Markierung» gilt auf Pendler-/Basisrouten wie Mischverkehr (zulässig, DWV-Deckel 5'000). Jede andere Ist-Form ist dort **nicht vorgesehen** → Note max. 4. Auf **verkehrsorientierten** Strassen → Vorzugsroute «Velostreifen oder Radweg», Pendler-/Basisroute «Velostreifen» (`fuehrungsartBasel`); eine **Velostrasse gibt es dort nicht** (nicht zulässig → Note max. 4). Der **Strassentyp** ist im Rechner ein eigenes Feld (nur bei Basel sichtbar, amtlich vorbefüllt) und für die Bewertung erforderlich. **DWV-Deckel** (form-abhängig): übersteigt der DTV den Höchstwert (Velostrasse·Vorzugsroute 2'500, Mischverkehr·Pendler-Basis 5'000; Velostrasse·Pendler-Basis kein Deckel), zeigt der Rechner eine **Warnung** zusätzlich zur Erklärung der Note (kein Notenabzug). **Velostrasse-Breite:** Nettobreite der Fahrgasse 4,50/4,30 m, bei **DWV < 1'000** reduziert **4,00 m** zulässig.

| Basel-Kategorie | → Routentyp |
|---|---|
| Velovorzugsrouten | Velohauptroute — *aber nicht als offene Geodaten verfügbar → manuell* |
| Basis-/Pendlerrouten (`tv_basisroute=ja` oder `tv_pendlerroute=ja`) | Veloroute |
| übriges Strassennetz | *(kein Routentyp — manuell)* |

Gemäss Velokonzept Basel-Stadt sind Basis- und Pendlerrouten **nicht** hierarchisiert (verschiedene Nutzergruppen, gleiche Stufe) → beide werden zur **Veloroute**. Die qualitativ höherwertigen **Velovorzugsrouten** (= Velohauptroute) sind weder im WFS/WMS noch auf data.bs.ch als Geodaten publiziert und können daher nicht automatisch gesetzt werden.

**Breiten-Sollwerte (Basel).** Standards Fuss- und Veloverkehrsinfrastruktur Basel-Stadt (2024), Tab. 4 — Standardmass (→ Velohauptroute) / reduziertes Standardmass (→ Veloroute); Fussweg und das Velostrassen-Maximum 6,50 m → Bern-Fallback (`BREITEN_BASEL` in [`fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts)):

| Führungsform | Velohauptroute | Veloroute |
|---|---|---|
| Velostreifen | 2,50 m | 1,80 m |
| Radweg strassenbegl./gesch. · Radweg abgesetzt | 2,50 m | 2,20 m |
| Zweirichtungsradweg | 4,00 m | 3,40 m |
| Umweltspur | 4,50 m | 3,00 m |
| Kombinierter Fuss-/Radweg | 6,00 m | 4,80 m |
| Velostrasse (Nettobreite Fahrgasse) | 4,50 m | 4,30 m |
| Einbahn mit Velogegenverkehr (markiert / baulich) | 2,50 m | 1,80 m |

#### Luzern

Das OGD-Feld `VELO_ROUTENTYP` (Stadt Luzern) hat drei Werte; sie werden auf die zwei Masterplan-Routentypen übersetzt (analog Zürich: oben → Velohaupt, Mitte → Velo, unten → manuell):

| `VELO_ROUTENTYP` | → Routentyp |
|---|---|
| `Velohauptroute` | Velohauptroute |
| `Hauptroute` | Veloroute |
| `Nebenroute` | *(kein Routentyp — manuell)* |
| `keine Velonetz-Route`, `unbekannt` | *(kein Routentyp — manuell)* |

**Breiten-Sollwerte (Luzern).** Standards Veloverkehr **Stadt** Luzern (Q-Blätter, S. 30–57) — Optimalfall (→ Velohauptroute) / Minimalfall (→ Veloroute); Grundsatz: auf Velohauptrouten gilt der Optimalfall, auf übrigen Velorouten ist mindestens der Minimalfall zu gewährleisten (`BREITEN_LUZERN` in [`fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts)):

| Führungsform | Velohauptroute | Veloroute |
|---|---|---|
| Velostreifen · Radweg strassenbegl./gesch. · Radweg abgesetzt | 2,50 m | 1,80 m |
| Umweltspur | 4,50 m | 3,75 m |
| Velostrasse | 4,50 m | 4,50 m |
| Kombinierter Fuss-/Radweg | 3,50 m | 3,50 m |
| Fussweg Velo gestattet | 3,50 m | 3,50 m |
| Einbahn mit Velogegenverkehr (markiert / baulich) | 2,50 m | 2,00 m |

### 8. Festlegungen in der Planung

**Massnahmenvorschlag (seit 17.10.2026 Bern, seit 20.10.2026 alle Städte mit Planung)** ([`vorschlag.ts`](VeloroutenCheckWeb/src/vorschlag.ts)). Der Kasten «Vorschlag» in der Planung nennt die erste Massnahme, die die Note auf mindestens 5,5 bringt («vollständig erfüllt», vorher 4,5 «weitgehend erfüllt» wie im lokalen Zielbild-Rechner, der bei 4,5 bleibt; `ZIEL` in [`vorschlag.ts`](VeloroutenCheckWeb/src/vorschlag.ts), die Tests des Katalogs rechnen weiter mit 4,5). Probe des lokalen Rechners über das Berner Netz (1681 Segmente): Mit 5,5 brauchen 533 statt 782 Segmente keine Massnahme, Markierung 67 statt 191, Kernfahrbahn 30 statt 69, Parkierung aufheben 182 statt 122, Haltestelle umbauen 14 statt 49, Radweg bauen 299 statt 117, Tempo 30 99 statt 49, kein Vorschlag 457 statt 302 (davon 254 «Fahrbahn zu schmal»), 1520 statt 1027 Parkplätze weg. Die Rangfolge und der Katalog sind gleich geblieben; mit 5,5 fallen Parkierung rechts (eine Note Abzug), Minimalbreiten und die festen Deckel (Tram im Mischverkehr 3, Fussweg Velo gestattet 4, Kaphaltestelle am Tram 1) stärker ins Gewicht. Der Abgleich online gegen lokal gilt seither nur noch mit `vorschlagRechnen(…, 4.5)`. **Bestmögliche Verbesserung** (seit 24.10.2026): Erreicht keine Massnahme 5,5, nennt der Kasten statt «kein Vorschlag» die Massnahme mit der höchsten Note über der von heute (ohne Pilot; bei gleicher Note nach Rang, Parkierung, Eingriffen), mit dem Erfüllungsgrad, den sie erreicht, und dem Grund, warum 5,5 nicht geht; sie lässt sich übernehmen (`Vorschlag.teilweise`). Beispiele: Mischverkehr mit Tram, 9 m: Velostreifen beidseitig 1,50 m, 2 → 5 («weitgehend erfüllt»); Mischverkehr 6,5 m mit Parkierung: Parkierung beidseitig aufheben, 1 → 2. Darunter steht, mit Knopf zum Übernehmen und mit Erfüllungsgrad, **«Oder im Pilot»** mit der besten schmalen Kernfahrbahn (Kern unter 4,50 m, nur Bern), wenn sie mehr bringt als die bestmögliche Verbesserung (Mischverkehr 7,5 m auf einer Velohauptroute: Kernfahrbahn mit Velostreifen 1,50 m → 4, im Pilot mit Velostreifen 2,25 m und Kern 3,00 m → 5). Gibt es keine Verbesserung, bleibt es bei «kein Vorschlag». Hebt ohne Pilot keine Massnahme den Erfüllungsgrad, wohl aber eine mit schmalem Kern, wird der **Pilot der Vorschlag**, mit dem Vermerk, was ohne Pilot höchstens ginge; erreicht er das Ziel, gilt es als erreicht (Aargauerstalden mit 7,0 m Fahrbahn: Parkierung aufheben + Kernfahrbahn mit schmalem Kern 3,40 m (Pilot) → 5,0 statt «Parkierung Seite A aufheben» → 2,0). **Alle Varianten** (seit 27.10.2026; `Vorschlag.alle`): Unter jeder Zeile lässt sich «Alle Varianten (n)» aufklappen, je mit Note, Erfüllungsgrad, Stufe und «Übernehmen». Ungefiltert wären es zu viele (geprüft werden je Zeile 5 bis 37 Varianten, am Aargauerstalden verbessern 32 die Note, meist fast gleich), darum: nur Varianten, die den Erfüllungsgrad von heute heben; je Stufe der Rangfolge, Parkierung (bleibt, eine Seite, alle) und Pilot ja/nein die beste; «Tempo 30 + …» und Piloten nur, wenn sie mehr bringen als dieselbe Parkierung ohne sie; nach Note geordnet. Am Aargauerstalden mit 10,0 m bleiben zwei: der Minimalfall mit Parkierung und «Parkierung Seite A aufheben + Velostreifen beidseitig 1,80 m als Kernfahrbahn (Kern 5,50 m)», beide 5,0. Sie ersetzt die Zusatzzeilen «Oder günstiger» (24. bis 27.10.2026: die erste Verbesserung in der gewohnten Rangfolge; zeigte auch Massnahmen wie «Parkierung Seite A aufheben → 2,0 («Gar nicht erfüllt»)») und «Oder mit Parkierungsabbau» (27.10.2026); «Alternative», «Oder im Pilot» und «Nur im Pilot möglich» bleiben. Dabei aufgefallen: Der Haltestellen-Umbau (Rang 5) prüfte bei unbekanntem Trottoir den Platz nicht und nahm in der Planung alles aus der Fahrbahn; seither gilt dann die Annahme, das heutige Trottoir bleibe als Trottoir hinter der Veloumfahrung (2,00 m), und die übrigen 5,00 m müssen neben dem Autoverkehr in der Fahrbahn Platz haben; «Als Planung übernehmen» ersetzt die Elemente, danach ist alles frei änderbar. Der Rechner ist eine Portierung des lokalen Zielbild-Rechners (`Rechner/zielbild/massnahmen.py`, `querschnitt.py`) mit derselben Rangfolge: 1 Markierung (Sicherheitsstreifen, Velostreifen verbreitern oder markieren, Velo vom Fussweg in die Fahrbahn), 2 Kernfahrbahn (Q 5; der schmale Kern nur als Alternative), 3 Parkierung aufheben (zuerst eine Seite, dann beide) mit Rang 1/2, 4 Velostrasse (Q 9), 5 Haltestelle umbauen (Typ «Haltestelle mit Veloumfahrung», mit Platzprüfung), 6 Radweg bauen (Q 2a/2b), 7 Tempo 30, nur wenn nichts anderes reicht. Unter gleichem Rang zählt weniger Parkierung weg, weniger Eingriffe, eine Seite vor beiden, dann die bessere Note. Platz nach den Querschnittsblättern: Fahrspuren 2 × 3,00 m (Radweg 2 × 3,25 m, Einbahn 3,00 m, mit Gleis 3,25 m), Velostreifen Standard 2,50/1,80 m und Minimal 1,80/1,50 m, Parkierung 1,90 m mit Sicherheitsstreifen 0,80 m (minimal 0,50 m), Trennung zum Radweg 0,15 m; eine Parkierung auf Trottoirniveau braucht keine Fahrbahnbreite. Die Kernfahrbahn gilt wie lokal nur mit belegtem DTV (nicht mit «≤ 2000 angenommen»). Je zwei Zeilen: **ohne Randsteinanpassung** (verfügbar ist das Feld «Verfügbare Fahrbahnbreite») und **mit Randsteinanpassung** (`trottoirAnpassung`): die Trottoirs kommen auf die Vorgabe des gewählten Fussverkehrsnetzes. Schmalere werden auf die Vorgabe verbreitert, zulasten der Fahrbahn (Kirchenfeldstrasse); breitere werden nur um den nötigen Teil schmaler, anteilig nach ihrem Überschuss, nie unter die Vorgabe. Die Trottoirs rechnen auf 5 cm gerundet wie der Seitenraum der Bilanz (vorher blieb ein Fehlmass von 0,01 m, Jungfraustrasse). Tempo 30 trägt die Planung als eigenes Feld (`Aufteilung.tempo`, mit Knopf «Tempo wie heute»); Note, Prüfung und Kernfahrbahn rechnen damit. Der Bericht nennt den übernommenen Vorschlag als «Ausgangspunkt». **Randsteinanpassung so weit wie möglich** (seit 24.10.2026, Beispiel Kirchenfeldstrasse 307351482): Erreicht mit den Trottoirs auf der Vorgabe keine Massnahme das Ziel, verbreitert die Zeile «Mit Randsteinanpassung» die Trottoirs nur so weit, dass eine Massnahme es noch erreicht (`vorschlagMitRandstein`: grösste Verbreiterung in 5-cm-Schritten, auf die Seiten im Verhältnis dessen, was ihnen fehlt). Was danach noch fehlt, steht beim Vorschlag («Trottoirs so weit wie möglich: Seite A 1,45 → 1,80 m (Vorgabe 2,50 m um 0,70 m verfehlt)») und im Vermerk; die Planung übernimmt genau diese Trottoirs. Kirchenfeldstrasse: Radweg beidseitig 1,80 m braucht 10,40 m der 11,10 m Fahrbahn, für die Trottoirs bleiben zusammen 0,70 m (vorher kein Vorschlag, weil Radweg und zwei Trottoirs zu 2,50 m 1,45 m mehr brauchen, als der Strassenraum hat). Geht es auch ohne Verbreiterung nicht, bleibt es bei der vollen Anpassung.

Abweichungen zum lokalen Rechner: Rang 5 (Haltestelle umbauen, seit 20.10.2026 auch online) prüft zusätzlich den Platz: An der Haltestelle liegt auf der Seite alles ausserhalb der Haltekante, mindestens 3,10 + 0,30 + 1,60 + 2,00 = 7,00 m (Standard 7,90 m), aus Trottoir und Fahrbahn ohne MIV und Gegenseite; fehlt es, kein Umbau, ist es unbekannt, ein Vermerk; «Übernehmen» baut HS 1 in die Planung; die Velostrasse mit der Bedingung «Quartierstrasse» nur in Bern (seit 01.11.2026; Geoportal-Dienst **Strassenhierarchie**, je Segment der Wert, der die Mehrheit abdeckt, in der Kurzform des lokalen Rechners, `hierarchieKurz` in `bern.ts`, `Section.hierarchie`; ohne Angabe keine Bedingung, wie in den übrigen Städten); keine Parkplatzzahl und keine Hinweise zu Steigung, Schwerverkehr und Sicht; die Note rechnet die Online-Bewertung. Fehlt eine Ist-Breite, rechnet der Vorschlag trotzdem: Für die Note gilt wie in der Ausgangslage die Vorgabe, vermerkt als «Ist nicht vollständig erfasst … angenommen»; für Platz und Regeln gilt die Breite als unbekannt wie im lokalen Rechner. Abgleich vom 20.10.2026 mit den Eingaben und Vorschlägen des lokalen Rechners (1 681 Berner Segmente): Wo die Note von heute online gleich ist und die Daten sich gleich abbilden lassen (787 Segmente ohne Haltestelle, Einbahn oder unbekannte Parkseite), stimmen Rang und Text bei 774 überein; die übrigen 13 wählen wegen der anderen Notenrechnung eine andere Breite oder Stufe. Bei 329 Segmenten weicht schon die Note von heute ab (lokal die verfeinerte Note). Übernommene Vorschläge ergeben in der Planung bei 512 von 517 dieselbe Note; die übrigen haben eine Umweltspur oder eine Einbahn mit Velogegenverkehr, die die Planung nicht als eigenes Element kennt, und der Kasten weist darauf hin. Jede Alternative lässt sich wie der Vorschlag übernehmen («Alternative übernehmen»).

**Andere Städte (seit 20.10.2026).** Zürich, Basel und Luzern haben denselben Vorschlag. Die Rangfolge ist eine normative Festlegung und gilt überall; die Städte unterscheiden sich über ihre Note (Soll-Führungsform, Breiten, in Basel der Strassentyp) und über die Masse der Platzprüfung (`masseFuer`): die der Stadt, wo ihre Standards etwas nennen (`vorgabe` und die Breiten der Stadt: Velostreifen, Radweg, Sicherheitsstreifen, Längsparkierung, Fahrstreifen, Trennstreifen, Kernfahrbahn, Velostrasse), sonst die Berner als Ersatz; welche, nennt der Vermerk des Vorschlags. Immer nach Bern: die Restbreite neben Radweg und Tram, der Velostreifen neben der Kernfahrbahn und die Grenzen der Kernfahrbahn (DTV, Tempo). Das reduzierte Mass einer Stadt ist ihr Minimum für beide Routentypen; ist es gleich dem Standard, gibt es keine Stufe «minimal». Die Kernfahrbahn hat die Obergrenze der Stadt (Zürich und Basel keine), den schmalen Kern (Pilot) gibt es nur in Bern. Die Velostrasse ist auch dort möglich, wo die Stadt sie als Soll nennt (Basel). Die Hinweise auf die Berner Querschnittsblätter (Q …) fallen weg. Die Randsteinanpassung braucht ein Fussverkehrsnetz der Stadt (Zürich: Bedeutung des Stadtraums, Basel: Teilrichtplan); Luzern hat keines. Für Bern bleibt alles gleich (Abgleich unverändert); für die anderen Städte gibt es keinen lokalen Rechner zum Abgleich.

**Haltestelleninsel** (seit 21.10.2026; Beispiel Monbijoustrasse; `haltestelleninsel` in [`breitenmessung.ts`](VeloroutenCheckWeb/src/breitenmessung.ts), `haltestelleninselUebernehmen` in [`aufteilung.ts`](VeloroutenCheckWeb/src/aufteilung.ts)): Hat der Abschnitt eine Haltestelle (ÖV-Angebot, erkannte Haltestelle oder gewählter Typ) und Gegenverkehr, sucht die App beim Laden der AV eine Verkehrsinsel bis 10 m neben der Achse, mindestens 15 m lang, hinter der auf der achsfernen Seite nur ein Streifen Strasse von höchstens 4,50 m bis zum Bord liegt. Sie gilt dann als Wartebereich statt als Mittelinsel: Die Fahrbahn misst nur bis zur Insel, das Trottoir der Seite liegt hinter dem Streifen, die Ausgangslage zeigt Trottoir · Streifen · Haltestelle (Insel) und daneben die Fahrbahn. Ein Streifen unter 3,00 m ist eine Veloumfahrung (Element «Radweg abgesetzt», seine Breite füllt «Breite Veloführung Haltestelle»), sonst eine Fahrspur (Inselhaltestelle). Der Haltestellentyp wird vorbelegt, wo keiner gewählt ist, mit dem Chip «angenommen»: auf der Seite der Insel «Haltestelle mit Veloumfahrung» bzw. «Inselhaltestelle», gegenüber mit Tram «Kaphaltestelle» (bei Bus bleibt die Wahl offen). Steht auf der Insel keine Wartehalle, ist sie nur Ein- und Ausstieg (eigenes Element «Haltestelle: Ein- und Ausstieg», Perron mindestens 2,00 m, Masterplan S. 65 «Wartehalle hinter Veloumfahrung»), und die Fläche hinter der Veloumfahrung ist der Wartebereich statt eines Trottoirs (Beispiel Monbijoustrasse). Wo die Wartehalle steht, liest die App aus OSM (`ladeWartehallen` in [`osm.ts`](VeloroutenCheckWeb/src/osm.ts), `wartehalleLage`): Wartehalle auf der Insel (`amenity=shelter` mit `shelter_type=public_transport` oder Perron mit `shelter=yes`, bis 0,5 m neben der Insel) → die Insel ist der Wartebereich; sonst Wartehalle hinter dem Streifen oder Perron mit `shelter=no` auf der Insel → Ein- und Ausstieg. Fehlt beides in OSM, gilt eine Insel unter 2,50 m als Ein- und Ausstieg (`HS_INSEL_WARTEHALLE_MIN_M`, Annahme; die 3,10 m des Masterplans sind in der Wirklichkeit zu viel). Gegenüber, bei einer Kap- oder Fahrbahnhaltestelle, ist das Trottoir an der Haltestelle der Wartebereich; dasselbe gilt im Haltestellenbereich. Gemessen wird an mehreren Querschnitten über die Länge der Insel (alle 4 m, Mediane), an den Kanten; nach innen läuft der Strahl über eine Schutzinsel hinweg (Schwarzenburgstrasse: ein einzelner Querschnitt durch den Schwerpunkt traf die Schutzinsel des Fussgängerstreifens und ergab 3,6 statt 10,2 m Fahrbahn). Probe Monbijoustrasse: Insel 2,20 m, Veloumfahrung 1,65 m, Fahrbahn 7,90 m, Trottoir 2,90 m; Schwarzenburgstrasse: Insel 3,15 m, Veloumfahrung 1,85 m, Fahrbahn 10,20 m, Trottoir 2,35 m. **Perron als Trottoirfläche** (seit 23.10.2026, Beispiel Helvetiaplatz; `haltestellenperron`): Am Helvetiaplatz führt die AV das Perron nicht als Verkehrsinsel, sondern als Teil einer 285 m langen Trottoirfläche über den ganzen Platz, 6 bis 16 m breit, dahinter die zweite Strasse (Tramtrassee). Gesucht wird deshalb kein Polygon, sondern ein Muster in den Querschnitten alle 5 m: hinter dem Bord Trottoir von höchstens 12 m (`HS_PERRON_MAX_M`), unmittelbar dahinter wieder Strasse, auf mindestens 15 m. Pflicht ist eine Wartehalle oder ein Perron aus OSM in einem dieser Querschnitte, weil breite Trottoirs zwischen zwei Strassen auch an Plätzen ohne Haltestelle liegen. Das Perron steht in der Ausgangslage als «Haltestelle: Wartebereich» ohne Streifen dahinter; die Strasse dahinter gehört nicht zum Abschnitt, die Fahrbahn reicht bis zum Perron. Der Typ wird als «Inselhaltestelle» angenommen. Die Haltestelleninsel und das Perron gelten seither auch auf der **Einbahn** (vorher nur bei Gegenverkehr): dort bekommt nur die Seite A einen Typ, und nur wenn Insel oder Perron auf ihrer Seite liegen. Probe Helvetiaplatz (498934010, Einbahn mit ÖV im Gegenverkehr): Perron Seite B 8,90 m, Fahrbahn 7,4 m, Ausgangslage «Wartebereich 8,90 | Tram 3,70 | Tram 3,70 | Trottoir 2,10»; vorher nur «Tram | Tram | Trottoir». Monbijoustrasse bleibt unverändert (Verkehrsinsel, Veloumfahrung 1,65 m).

**Trennung mit Pfosten.** Die App legt dafür 0,70 m fest.

**Neue Elemente in der Bewertung** (`formJeSeite`): Ein Velostreifen direkt neben einer Trennung mit Pfosten gilt als geschützter Velostreifen. Veloabstellplatz und Parklet zählen nicht als Parkierung, lösen also keinen Abzug für Dooring aus. Eine Velostrasse über die ganze Fahrbahn gilt für beide Seiten. Grünstreifen und Haltestellen liegen wie Trottoirs ausserhalb der Fahrbahn; die Bewertung der Haltestelle bleibt wie im Rechner eingegeben.

### 9. Reproduzierbarkeit

> **Reproduzierbarkeit der feel-safe-Anker.** `tools/verify_06.py` rechnet die feel-safe-Werte aus
> den Rohdaten nach. Es liest aus `FixMyCity_Daten/` (im Repo-Root): `SurveyResults_200414.json`
> (alle Einzelantworten), `scenes_ms.csv` / `scenes_cp.csv` / `scenes_se.csv` (Szenen-Merkmale) und
> `radwege_hauptstrassen.csv` (offizielle Aggregate zur Kreuzvalidierung); ausserdem
> `tools/visualisierung_template.html`. Die App selbst braucht diese Dateien **nicht** zur Laufzeit
> — die Anker sind in `fuehrungsform.ts` fest hinterlegt; das Skript dient nur der Herleitung/Prüfung.
> Die Rohdaten sind **nicht im Repo** (gross/Dritt-Daten); sie sind über
> [FixMyCity / radwege-check](https://radwege-check.de/) zu beziehen und lokal in `FixMyCity_Daten/`
> abzulegen.

## Datenquellen und Herkunft

OpenStreetMap liefert die Basis, amtliche Quellen füllen einzelne Felder vor. Liegt ein Wert amtlich und aus OSM vor, gilt der amtliche
Wert; jede Angabe zeigt ihre Herkunft und lässt sich von Hand ändern. Ausserhalb der vier Stadtprofile gilt der Berner Standard als
gekennzeichneter Ersatz. Quellen je Stadt nennt die App unter «Grundlagen und Quellen», die Pflicht-Attributionen stehen auf der Karte
und an den Feldern.

### Datenherkunft je Stadt

Über die **Stadt-Auswahl** oben auf der Karte lassen sich **Bern**, **Zürich**, **Basel** und **Luzern** wählen. Modus je Zelle: **live** (Dienst bei jedem Laden), **Snapshot** (gebündelte Datei), **OSM**, **amtlich** bzw. **–** (keine Quelle → manuell). „partiell" = nur wo eine Zählstelle (≤ 25 m) auf der geladenen Strasse liegt.

| Feld | Bern | Zürich | Basel | Luzern |
|---|---|---|---|---|
| Geometrie, Name, Ist-Führungsform, Breite | OSM | OSM | OSM | OSM |
| Tempo | Geoportal (live) | OSM | amtlich (Dataset 100250, live) | OSM |
| DTV MIV | Geoportal-Formel (live, partiell) | Verkehrsmessstellen-WFS (live, partiell) | Snapshot `dtv_basel.json` (partiell) | ArcGIS `DTV_ANZAHL` (live, partiell) |
| Routentyp | Masterplan-Layer (live) | Velonetzplanung-WFS (live) | Teilrichtplan Velo-WFS (live) | Velonetz-ArcGIS (live) |
| Strassentyp | – | – | amtlich (Dataset 100250, live) | – |
| Ist = Velostrasse | Velostrassen-Layer (live) | – | Velostadtplan (live) | – |
| Hinweis Velostreifen je Seite | Luftbild-Snapshot `luftbild_bern.json` (nur Hinweis) | `luftbild_zurich.json` (seit 16.10.2026) | `luftbild_basel.json` (seit 16.10.2026) | – |
| Breite am Luftbild messen | Orthofoto + Bordsteinkante der AV (geodienste.ch, live beim Messen) | wie Bern | wie Bern | Ersatz: Strassenflächen der Stadt (ArcGIS, live) |
| Fahrbahnbreite | AV (geodienste.ch, live auf Knopfdruck) | wie Bern | wie Bern | Ersatz: Strassenflächen der Stadt (ArcGIS, live) |
| Parkierung je Seite | Parkplätze öffentlich (Geoportal, live) | Parkplätze DAV (WFS, live) | – (keine Geometrie) | öffentliche Parkplätze (ArcGIS, live) |
| Fussverkehrsnetz (Trottoir-Vorgabe der Planung) | Richtplan Fussverkehr (live) | – (Bedeutung von Hand) | Teilrichtplan Fuss- und Wanderwege (WFS, live) | – (Regel nach Tempo und Velostreifen) |
| ÖV Tram / Haltestelle | Geoportal (live) | OSM | OSM | OSM (kein Tram) |
| Bus-Takt (ÖV-Band) | GTFS-Snapshot | GTFS-Snapshot | GTFS-Snapshot | GTFS-Snapshot |

### Lizenzen und Quellenangaben

- Strassennetz: © OpenStreetMap-Mitwirkende, ODbL; Kartenstil CyclOSM
- Luftbild, Landeskarten, Adressen, Höhenmodell und weitere Bundesdaten: © swisstopo und die jeweiligen Bundesämter über geo.admin.ch
- Bodenbedeckung: Amtliche Vermessung der Kantone über geodienste.ch
- Städte: Geodaten Stadt Bern; Stadt Zürich (Open Government Data, Parkplätze CC0); Geodaten Kanton Basel-Stadt; © Geoinformationszentrum Stadt Luzern
- Fahrplan: opentransportdata.swiss
- Überholabstände: © OpenBikeSensor-Mitwirkende
- Velostreifen-Hinweis: Modell remote_velo der ETH Zürich auf SWISSIMAGE, in Bern dazu Orthofoto Stadt Bern 2026
- Illustrationen der Querschnitt-Skizze: Streetmix, CC BY-SA 4.0

## Nutzungsstatistik (GoatCounter)

Seitenaufrufe werden mit [GoatCounter](https://www.goatcounter.com/) gezählt (Einbindung in
[`VeloroutenCheckWeb/index.html`](VeloroutenCheckWeb/index.html), Zähl-Endpunkt `vrc.goatcounter.com`).
Datenschutzfreundlich: **cookielos**, keine Personendaten, privates Dashboard; auf `localhost`
zählt das Skript nicht, Dev/Preview verfälschen die Statistik also nicht. Zusätzlich zum
automatischen Seitenaufruf zählt die App den Wechsel in den Rechner als eigenen Pfad `/rechner`
(`zaehleRechner` in [`App.tsx`](VeloroutenCheckWeb/src/App.tsx)); der Hinweis für Nutzende steht
auf der Einstiegsseite.

## Offene Punkte

- **Parken × Breite** — der Effekt ist gemessen (0,6 Noten bei 3,5 m, 2,0 bei 2,0 m), aber **nicht umgesetzt**: Die Befragung kennt nur diese zwei Breiten, der reale Bestand liegt fast vollständig darunter, und ein dritter Messpunkt (Mischverkehr ≈ 0,15) widerspricht der Verlängerung nach unten. Es braucht Szenen unter 2,0 m Streifenbreite; bis dahin gilt die Pauschale −1,0 (Stand 09.08.2026, siehe Kapitel «Parkierung rechts»). Die Breitensätze selbst bleiben davon unberührt (1,0 auf der Fahrbahn, 0,24/0,38 hinter baulicher Trennung).
- **«Velo rechts vom Parken»** als eigene, bessere Parken-Lage aufnehmen (empirisch ≈ 92, aber nur 6 Szenen → erst mit besserer Datenlage).
- **Velostrasse «zu breit»:** der Abzug über der Maximalbreite (6,50 m) ist normativ gesetzt (gleicher Satz wie «zu schmal») — bei Bedarf eigener Satz/Schwelle.
- **«Radweg abgesetzt» (Q3) — nicht der Anker, sondern die Feel-Safe-Anzeige prüfen:** Im Seitenraum wird dieselbe Bauform tiefer beurteilt (76,9 % über alle Kameras, 81,6 % im Velo-Schnitt) als auf Poller-Niveau (≈ 90). Für die **Note** ist das folgenlos: Der Anker wirkt dort nur als Zielwert, und ein Radweg erfüllt jedes Soll, bevor ein Anker gelesen wird. Seit P11-A (13.08.2026) enthält der «schnell»-Anker (84) den Seitenraum bereits — die **Feel-Safe-Anzeige** liest für Seitenraum-Formen bei «ruhig» (90) weiterhin einen eher zu hohen Ist-Wert. <sub>Formulierung korrigiert am 10.08.2026: Zuvor stand hier ein «Berliner Abschlag», den man für Bern nicht übernehme — es gibt keine getrennte Berliner Quelle, die ganze Befragung ist Berlin, und die Begründung über den Berner Bestand war eine Annahme.</sub>
- **Einfärbung des Belags:** empirisch ein eigener, positiver Effekt (farbig vs. grau ≈ +7 feel-safe-Punkte; im Paper signifikant, Tab. 2) — bisher **nicht** im Modell. Könnte als eigener, datengestützter Faktor aufgenommen werden. Siehe [docs/08](docs/08_Studie_Subjektive_Sicherheit_2022.md).
- **Mindestmasse (Untergrenzen) im ganzen Rechner:** Heute gibt es nur eine Soll-Regelbreite je Führungsform/Routentyp; eine Unterschreitung wirkt linear über den Breiten-Abzug. Velostandards-Dokumente definieren zusätzlich **absolute Minimalmasse, die nicht unterschritten werden dürfen**. Deren Unterschreitung müsste die Note härter kappen (eigene Schwelle/Deckelung) statt nur linear abzuziehen. Stadtübergreifend zu konzipieren.
- Velostrassen sind Mischverkehr, was zu `feelClass: 'Mischverkehr'` passt. Im Code ist die Basisnote bei Tempo 30 aber aktuell 6 (Form akzeptiert), nicht die Mischverkehr-Bewertung. Soll das so bleiben? Die Note ändert sich aktuell, wenn die Breiten nicht eingehalten werden oder wenn es Parkierung gibt.

## Aufbau

React, TypeScript und Vite, Karte mit Leaflet. Jede Stadt ist ein eigener Adapter, die Bewertung läuft ohne Server im Browser.

| Ort in `VeloroutenCheckWeb/src/` | Inhalt |
|---|---|
| `fuehrungsform.ts`, `bewertung.ts` | Bewertungslogik und Note je Abschnitt und Seite |
| `strecke.ts`, `osm.ts`, `overpass.ts` | Abschnitte, OSM-Import, Overpass-Anbindung |
| `bern.ts`, `zurich.ts`, `basel.ts`, `luzern.ts`, `cityShared.ts` | Stadt-Adapter und gemeinsame Helfer |
| `gebiet.ts`, `e5.ts`, `e6.ts`, `datenstand.ts` | Datenort, örtliche Quellen, Kartenkontext, Quellenstände |
| `aufteilung.ts`, `vorschlag.ts`, `Querschnitt.tsx` | Aufteilung planen und Massnahmenvorschlag |
| `quellen.ts` | Quellenverzeichnis |
| `Bericht.tsx`, `csv.ts`, `fallDatei.ts` | Bericht, CSV-Export und Fall-Datei |
| `regelwerk.drift.test.ts` | prüft `docs/regelwerk.json` gegen die Code-Konstanten |

`public/velostreifen_bern.json` ist lokal und nicht im Repository; ohne die Datei entfällt diese Quelle.

## Veröffentlichung

`.github/workflows/deploy.yml` baut bei jedem Push auf `main`, der `VeloroutenCheckWeb/**` ändert, die App und veröffentlicht sie auf
GitHub Pages unter https://veloroutencheck.ch/.

## Lizenz

Der Rechner ist frei nutzbar. Wer die Weiterentwicklung unterstützen möchte, kann über Ko-fi spenden: [ko-fi.com/pnfzygrzgfsvg](https://ko-fi.com/pnfzygrzgfsvg).

Code: **[MIT](LICENSE)** (Copyright (c) 2026 pnfzygrzgf-svg). Eigene Inhalte (Texte, Dokumentation, Berichte, eigene Grafiken,
auch der [Ergebnisbericht der Berner Bildumfrage 2026](docs/09_Umfrage_Subjektive_Sicherheit_Bern_2026/)):
**[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.de)**. Name und Logo sind ausgenommen; Überblick und Ausnahmen in
[LICENSE-INHALTE.md](LICENSE-INHALTE.md). Bis zur Version 1.0.0 (31.10.2026) galt CC BY-NC 4.0. Die Illustrationen der Skizze
(Streetmix) stehen unter CC BY-SA 4.0. Die eingebundenen **Dritt-Daten** behalten ihre eigenen Lizenzen und
Quellenangaben — siehe [Lizenzen und Quellenangaben](#lizenzen-und-quellenangaben)
(u. a. Geodaten Stadt Bern, OpenStreetMap/ODbL, opentransportdata.swiss, OpenBikeSensor, swisstopo).
Das gilt auch für die gebündelten **Daten-Snapshots** `VeloroutenCheckWeb/public/*.json`, die aus solchen
Quellen stammen oder abgeleitet sind (Ausnahme in [LICENSE-INHALTE.md](LICENSE-INHALTE.md)); so verlangen die aus
SWISSIMAGE abgeleiteten Luftbild-Snapshots `luftbild_bern.json`, `luftbild_zurich.json` und `luftbild_basel.json` die Angabe «© swisstopo».
