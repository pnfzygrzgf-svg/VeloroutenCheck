# VeloroutenCheck

VeloroutenCheck bewertet die Qualität von Veloinfrastruktur und vergibt dafür eine **Schulnote von 1 bis 6** oder wahlweise eine Bewertung von **Gar nicht erfüllt** bis **Vollständig erfüllt**. Grundlage sind zwei Quellen:

- die **Veloinfrastruktur-Standards der jeweiligen Stadt**. Welche Führungsform ist wo vorgesehen, welche Querschnitts- und Haltestellen-Vorgaben usw. gelten.
  - Bern: **[Standards Masterplan Veloinfrastruktur Stadt Bern](https://www.bern.ch/velohauptstadt/infrastruktur/masterplan-veloinfrastruktur)**
  - Zürich: **[Velostandards Stadt Zürich](https://www.stadt-zuerich.ch/content/dam/web/de/aktuell/publikationen/2024/velostandards-stadt-zuerich/velostandards-stadt-zuerich.pdf)**
  - Basel: **[Standards Fuss- und Velo-Verkehrsinfrastruktur Basel-Stadt](https://media.bs.ch/original_file/72373a2c610e23b19ae61cd148ad22f35b3d1fe2/2024-09-27-standards-fvv-is-bs.pdf)**
  - Luzern: **[Standards Veloverkehr Stadt Luzern](https://www.stadtluzern.ch/_docn/2965064/Standards_Veloverkehr.pdf)**
- die empirisch gemessene **subjektive Sicherheit** aus der Befragung von radwege-check / FixMyCity (wie sicher sich Velofahrende in einer Situation fühlen, „feel-safe %").

Bewertet wird eine **Strecke**, die aus einem oder mehreren **Abschnitten** besteht. Jeder Abschnitt erhält eine eigene Note; die Strecke erhält die Note ihres schlechtesten Abschnitts.

**Web-VeloroutenCheck** https://pnfzygrzgf-svg.github.io/VeloroutenCheck/

> **Beta** — Resultate mit Vorsicht verwenden und durch eine Fachperson prüfen lassen.

Vibecoding. Don't trust, verify!

## Repo-Struktur

| Ordner | Inhalt |
|---|---|
| [`VeloroutenCheckWeb/`](VeloroutenCheckWeb/) | Die Web-App (React + Vite + TypeScript). |
| [`tools/`](tools/) | Offline-Skripte: `oev_takt.py` (GTFS → Bus-Takt-Snapshots je Stadt), `dtv_basel.py` (DTV-Snapshot Basel), `verify_06.py` (Nachrechnung der feel-safe-Anker), `visualisierung_template.html`. |
| [`docs/`](docs/) | Methodik-Notizen, Herleitungen und das Regelwerk (`regelwerk.json`/`.md`). Die zugrunde liegenden Rohdaten liegen lokal und sind nicht im Repo. |

---

## Inhalt

- [Bedienung](#bedienung)
- [Bewertung (Methodik)](#bewertung-methodik)
  - [1. Soll-Führungsform](#1-soll-führungsform)
  - [2. Führungsform-Note (Ist gegen Soll)](#2-führungsform-note-ist-gegen-soll)
    - [Subjektive Sicherheit (feel-safe)](#subjektive-sicherheit-feel-safe)
  - [3. Breiten-Abzug und Parkierung](#3-breiten-abzug-und-parkierung)
  - [4. Sonderfälle (Umweltspur, Velostrasse, Fussweg)](#4-sonderfälle-umweltspur-velostrasse-fussweg)
  - [5. Haltestellen (ÖV)](#5-haltestellen-öv)
- [Datenquellen und Herkunft](#datenquellen-und-herkunft)
  - [Prinzip der Anreicherung](#prinzip-der-anreicherung)
  - [Datenherkunft je Stadt](#datenherkunft-je-stadt) (Bern · Zürich · Basel · Luzern)
  - [OpenBikeSensor](#openbikesensor-gemessene-überholabstände)
  - [Datenlizenzen und Quellenangaben](#datenlizenzen-und-quellenangaben)
- [Offene Punkte](#offene-punkte)
- [Entwicklung und Code-Übersicht](#entwicklung-und-code-übersicht)
- [Deployment (GitHub Pages)](#deployment-github-pages)
- [Lizenz](#lizenz)

---

## Bedienung

**Strecke zusammenstellen.** Abschnitte lassen sich beliebig hinzufügen und entfernen. Segmente werden auf zwei Wegen geladen:

- **Strassenname** eingeben und „Strasse laden". Dies lädt alle Segmente der Strasse aus OpenStreetMap.
- **Klick auf die Karte**. Dies fügt das nächstgelegene Strassensegment hinzu (eine Strecke lässt sich rein per Klick aufbauen).

Mit „In Strecke übernehmen" werden die gewählten Segmente entlang der Strasse geordnet und benachbarte Segmente gleicher Führungsform und gleichen Tempos zu Abschnitten zusammengefasst.

**Eingaben je Abschnitt.** DTV MIV, zulässige Höchstgeschwindigkeit, vorhandene Führungsform (Ist) und deren Breite; Routentyp (Velohauptroute / Veloroute); **bei Basel zusätzlich der Strassentyp** (verkehrs- / siedlungsorientiert, da dort die Soll-Wahl strassentyp-basiert ist); bei fahrbahnnahen Führungsformen, ob rechts längs geparkt wird (Dooring); das ÖV-Angebot und bei vorhandener Haltestelle der Haltestellentyp (Auswahl je Stadt).

**Automatische Befüllung und Herkunft.** Wo Daten vorliegen, werden die Felder beim Laden automatisch gefüllt. Ein kleiner **Chip** am Feld zeigt die Herkunft des Werts:

- **Geoportal** (zum Beispiel Geoinformation Stadt Bern, blau),
- **OSM** (OpenStreetMap, grau),
- **opentransportdata** (Fahrplan, für den Bus-Takt, grün),
- kein Chip, sobald das Feld manuell geändert wurde.

Leere Pflichtfelder zeigen „Eingabe nötig".

**Karten-Hilfen.** Mehrere Abschnitte sind auf der Karte **nummeriert** (passend zu „Abschnitt 1/2/3" im Rechner). Beim Überfahren einer Abschnittskarte mit der Maus werden die zugehörigen Segmente hervorgehoben — so lassen sich automatisch befüllte Werte gezielt pro Abschnitt prüfen und korrigieren. ÖV-Haltestellen erscheinen als Marker. Die Linienfarben zeigen die Ist-Führungsform (aus OSM).

**Wann erscheint die Note?** Erst wenn die nötigen Felder gefüllt sind: **DTV, Tempo, Führungsform und Breite** — ausser bei **Mischverkehr**, da diese Führungsform keine Breiten-Vorgabe hat. Bis dahin steht „Eingabe nötig". Solange ein Abschnitt unvollständig ist, bleibt auch die Strecken-Note offen.

**Strecken-Note.** Die Strecke erhält die Note ihres **schlechtesten Abschnitts**. Angezeigt werden jede Abschnitts-Note einzeln, die Strecken-Note und der massgebende (schlechteste) Abschnitt.

**CSV-Export.** „Als CSV exportieren" lädt alle Abschnitte mit Eingaben, Herkunft, Soll-Führungsform, Note und den OpenBikeSensor-Überholabständen als `.csv` herunter.

---

## Bewertung (Methodik)

### 1. Soll-Führungsform

Welche Führungsform ist vorgesehen? **Jede Stadt hat ihre eigene Soll-Tabelle** — sie folgt dem jeweiligen Standard-Dokument und wird über `fuehrungsart(dtv, v, stadt, route, strassentyp)` in [`fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts) ausgewählt. Die Eingangsgrössen unterscheiden sich je Stadt:

- **Bern & Luzern** — DTV MIV × Tempo (Luzern vereinfacht auf drei Zonen: Mischverkehr / Markierung / bauliche Trennung).
- **Zürich** — je **Routentyp** (Vorzugsroute / Hauptnetz), nicht DTV-basiert.
- **Basel** — **strassentyp**-basiert (verkehrs- vs. siedlungsorientiert) × Routentyp (Tab. 3, S. 15).

Die stadtspezifischen Soll-Regeln und die zugrunde liegenden Dokumente stehen unter [Datenherkunft je Stadt](#datenherkunft-je-stadt). Die **feel-safe-Anker und die Note-Mechanik** (Kap. 2–3) sind dagegen **stadtübergreifend** identisch.

*Beispiel Bern* — Entscheidung über DTV MIV × zulässige Höchstgeschwindigkeit:

```
DTV MIV \ km/h     ≤ 30           31–40         41–50               51–80
< 2'000            Mischverkehr   Radstreifen   Radstr./Radweg      Radweg
2'000–5'000        Radstreifen    Radstreifen   Radstr./Radweg      Radweg
5'000–10'000       Radstreifen oder Radweg (Übergang)               Radweg
> 10'000           Radweg         Radweg        Radweg              Radweg
```

Gelesen wird die Tabelle als **vier ineinander liegende Rechtecke** (Masterplan S. 11): Man landet
im kleinsten, das den Abschnitt enthält — die **strengere der beiden Achsen** entscheidet. Das Band
41–50 km/h ist im Schema durchgehend schraffiert («Radstreifen oder Radweg»), unabhängig vom
DTV-Band. Die drei DTV-Grenzen folgen dem Fliesstext, nicht der Pixelkante: 2'000 ist **schon**
Radstreifen («verkehrsarme Strassen (DTV < 2'000)»), 10'000 ist **noch** Übergang («stark belastete
Strassen (DTV > 10'000)»), und zu 5'000 schweigt der Text — dort gilt die Bandgrenze des Schemas.

### 2. Führungsform-Note (Ist gegen Soll)

**Skala:** Schulnote, 6 = beste, 1 = schlechteste.

**Darstellung umschaltbar:** In der App lässt sich die Anzeige zwischen der Schulnote (1–6) und
einer vierstufigen verbalen **Erfüllungsskala** umschalten. Diese ist eine reine Nachklassierung
der Endnote (kein Einfluss auf die Berechnung); die Grenzen folgen der Schulnoten-Logik
(4 = «genügend» = Vorgabe gerade erfüllt; ungenügend ≤ 3 = nicht erfüllt):

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
   Mischverkehr  <  Radstreifen  <  «Radstreifen oder Radweg»  <  Radweg
      (keine        (Markierung      (Übergangsbereich)           (baulich
      Trennung)     auf Fahrbahn)                                  getrennt)
   ```

   Ist die vorhandene Form mindestens so weit oben wie die empfohlene → **Note 6** (mehr Trennung als nötig schadet nie). Nur wenn sie *schwächer* ist, geht es weiter.
3. **Tempo-Kontext wählen:** `ruhig` bei V ≤ 30 km/h, sonst `schnell`.
4. **Zielwert** = feel-safe % der **Soll**-Form im gewählten Tempo-Kontext. (Beim Übergangsfall «Radstreifen oder Radweg» das Mittel aus Radstreifen und Radweg.)
5. **Defizit** = Zielwert minus feel-safe % der **Ist**-Form (gleicher Tempo-Kontext) = der gemessene Verlust an gefühlter Sicherheit.
6. **Defizit in eine Note umrechnen:** `Note = 6 − Defizit / 14,2` (auf 1…6 begrenzt, auf 0,5 gerundet). Pro 14,2 fehlende feel-safe-Punkte eine ganze Notenstufe — Herleitung siehe unten.

#### Empirische Anker (feel-safe %, verifiziert)

radwege-check / FixMyCity, **tram-bereinigt**. Gezählt wird jede Bewertung der **Velo-Foto-Szenen** (Szenen-Merkmal `Kamera = C` — der Blickwinkel des Fotos bestimmt, welche Rolle bewertet wird), unabhängig von der Befragtengruppe; auch die Urteile der potenziellen Velofahrenden sind enthalten. Werte **unabhängig aus den Einzelantworten nachgerechnet** (`tools/verify_06.py`, §5; Kreuzvalidierung gegen den offiziellen `voteScore`, ø 1,8 Punkte), je Tempo-Kontext, grosse Fallzahlen (N je Wert ≈ 2'000–22'000):

> **tram-bereinigt:** Befragungs-Szenen mit Tram (Schienen in der Fahrbahn) sind ausgeschlossen.
> Tramschienen senken das Sicherheitsempfinden unabhängig von der Veloanlage (Sturzrisiko,
> Spurrillen) und würden die feel-safe-Werte der Führungsformen sonst verzerren. Ausgeschlossen
> über das Szenen-Merkmal `FS-Art = Tram`.

```
                       ruhig (V ≤ 30)   schnell (V > 30)
Mischverkehr                 24               13
Radstreifen                  65               58
Radweg (baulich getrennt)    90               84
```

Zuordnung der Ist-Formen zu den Befragungsdaten:

- **Mischverkehr** → keine Radverkehrsanlage; seit dem 12.08.2026 **parkbereinigt** (24 statt 22 «ruhig» — ohne die parkierten Szenen, deren Wirkung der Parkierungs-Abzug separat trägt; «schnell» bleibt 13).
- **Radstreifen** → die **Referenzkonfiguration**: Sollbreite 2,5 m ohne Parkierung, seit dem 12.08.2026 aus **grauen Szenen mit schmaler gestrichelter Führungslinie** — dem Berner Markierungsbild (keine Einfärbung im Netz, kaum breite Trennlinien) —, linear aus den 2,0/3,5-m-Zellen interpoliert (60,8 + 0,5 × 9,3 ≈ 65 · 52,4 + 0,5 × 10,5 ≈ 58). Bewusst NICHT das Mittel über alle Szenen: Breite und Parkierung werden unten separat abgezogen — ein gepoolter Anker zählte sie doppelt und rechnete eine Ausstattung mit, die es im Bestand nicht gibt. <sub>Fassungs-Kette: gepoolt 77/73 (bis 11.08.2026) → grau 71/66 (Zwischenfassung vom 12.08.2026) → gestrichelt 65/58 (2 Fotos je Zelle — bewusster Preis, lokales Regelwerk 15.7, P10-Kasten).</sub>
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

Abschnitt: **DTV 12'000 · 50 km/h · Ist = Radstreifen**

```
Soll      = fuehrungsart(12000, 50)            = Radweg        (DTV > 10'000)
Ist < Soll (Radstreifen < Radweg)              → Abzug
Tempo     = schnell                            (50 > 30)
Zielscore = feel-safe(Radweg, schnell)         = 84
Defizit   = 84 − feel-safe(Radstreifen,schnell)= 84 − 58 = 26
Note      = 6 − 26 / 14,2 = 6 − 1,83 = 4,17    → 4,0 (vor Breitenabzug, s. unten)
```

#### Resultierende Noten

Bei Tempo > 30 (schnell):

```
Soll \ Ist                Mischverkehr   Radstreifen   Radweg
Radstreifen                   2.0            6.0         6.0
Radstreifen oder Radweg       1.0            5.5         6.0
Radweg                        1.0            5.0         6.0
```

Bei Tempo ≤ 30 (ruhig) fallen dieselben Abweichungen milder aus:

```
Soll \ Ist                Mischverkehr   Radstreifen   Radweg
Radstreifen                   2.0            6.0         6.0
Radstreifen oder Radweg       1.5            5.5         6.0
Radweg                        1.0            5.0         6.0
```

### 3. Breiten-Abzug und Parkierung

Nach der Führungsform-Note wird die **Breite** der Anlage gegen die **Soll-Regelbreiten der jeweiligen Stadt** geprüft (Fallback je Feld: Bern-Regelbreiten). Massgeblich ist je nach Routentyp **Optimal** (Velohauptroute) oder **Minimal** (Veloroute). Der Abzug-Mechanismus (unten) ist stadtübergreifend; nur die Sollwerte unterscheiden sich — die stadtspezifischen Tabellen stehen unter [Datenherkunft je Stadt](#datenherkunft-je-stadt).

*Bern-Regelbreiten (zugleich Fallback für nicht abgedeckte Felder):*

```
Ist-Form (Querschnittstyp)        Optimal   Minimal
Radstreifen                  Q1     2.50      1.80
Radweg strassenbegl. / Gesch. Radstreifen  Q2  2.50   1.80
Radweg abgesetzt                           Q3  2.50   1.50
Umweltspur (Bus+Velo)        Q4     4.50      3.75   (DTV/Tempo n.r.; siehe Bus-Takt)
Velostrasse                  Q9     Band 4.50–6.50 m (Min u. Max, beide Routentypen; nur Tempo 30)
Kombinierter Fuss-/Radweg    Q11    3.50      3.50   (Bern/Luzern; Basel 6.00/4.80; KEIN Note-4-Deckel)
Fussweg Velo gestattet       Q12    3.50      3.50   (DTV/Tempo n.r.; Mischfläche, max. Note 4)
Mischverkehr                 Q6     –         –      (keine Breitenvorgabe)
```

**Abzug (Variante A, linear, datengestützt):**

```
Sollbreite   = Optimal (Velohauptroute) bzw. Minimal (Veloroute)
Defizit_m    = max(0, Sollbreite − Ist-Breite)
Breitenabzug = Defizit_m × Satz der feel-safe-Klasse UND des Tempos:
                                              ≤ 30 km/h   > 30 km/h
                 auf der Fahrbahn                 0,65        0,74    (Radstreifen, Einbahn mit Markierung)
                 hinter baulicher Trennung        0,24        0,38    (Radwege, Fuss-/Radwege)
                 Fahrgassen-Bänder                0,9         0,9     (Velostrasse, Umweltspur; normativ)
Endnote      = runde_0,5( Führungsform-Note − Breitenabzug , begrenzt 1…6 )
```

##### Herleitung der Breitensätze

Die Sätze skalieren **linear** aus dem gemessenen Breiten-Effekt — verglichen werden Szenen, die sich **nur in der Breite** unterscheiden (gleiche Parkierung, gleiches Tempo; `tools/verify_06.py`, §4):

```
Fahrbahn (markierter Radstreifen, ohne Parken,  T30:  9,3 Pkt/m ÷ 14,2 ≈ 0,65 Noten/m
          grau + gestrichelte Führungslinie —   T50: 10,5 Pkt/m ÷ 14,2 ≈ 0,74
          seit 12.08.2026, P10-U)
hinter baulicher Trennung (Poller-only grau —   T30:  3,4 Pkt/m ÷ 14,2 ≈ 0,24
          nur Sperrpfosten-Szenen, derselbe     T50:  5,3 Pkt/m ÷ 14,2 ≈ 0,38
          Pool wie der Radweg-Anker; seit
          13.08.2026, P14)
```

Zwei Befunde stecken darin. Erstens: Hinter der Trennung schützt die **Trennung**, nicht die Breite — Breite ist dort Komfort. Zweitens: **Tempo wirkt umso stärker, je weniger Schutz da ist.** Auf der Fahrbahn kostet der fehlende Meter an einer schnellen Strasse rund ein Viertel mehr; hinter der Trennung bleibt der Satz in beiden Tempi klar tiefer. Das ist dieselbe Logik, nach der auch die feel-safe-Anker tempoabhängig sind — und beides stammt aus derselben Geraden: Der Anker ist ihr Wert bei der Sollbreite, der Satz ihre Steigung.

Ein einziger gepoolter Satz (früher 0,9, aus «alle 2,0-m- gegen alle 3,5-m-Szenen») mischte die Parkierungswirkung in den Breiteneffekt; die sauber geschnittenen Sätze trennen beides.

**Vorbehalte:**

- **Scheingenauigkeit:** Die Daten liefern nur **zwei** Breiten-Stützpunkte (2,0 und 3,5 m). Der Effekt über diese 1,5 m ist belegt, die Linearität auf Zentimeter-Ebene ist eine Modellannahme (Interpolation).
- **Rundung relativiert kleine Defizite:** Da die Endnote auf 0,5 gerundet wird, kippt ein kleines Defizit die Stufe nur nahe einer Rundungsgrenze; sicher eine Stufe kostet beim Satz 0,65 erst ein Defizit ab ≈ 0,77 m, beim Satz 0,74 ab ≈ 0,68 m.
- **Bis zum 10.08.2026 galt je Klasse ein einzelner Satz** (0,6 / 0,35). Nachgerechnet waren das die Tempo-30-Werte, ohne dass das dokumentiert war — die Kette war damit in sich widersprüchlich, weil ihr Anker schon tempoabhängig war. Die Umstellung macht Anker und Satz wieder konsistent.

Tunbar über `BREITE_SATZ`.

**Beispiel** (Fortsetzung: DTV 12'000 / 50 km/h / Ist Radstreifen → Form-Note ungerundet 4,17):

```
Velohauptroute, Radstreifen, Breite 1,80 m
  Sollbreite   = Optimal 2,50 m
  Defizit      = 2,50 − 1,80 = 0,70 m
  Breitenabzug = 0,70 × 0,74 = 0,52      (50 km/h → Fahrbahn-Satz «schnell»)
  Endnote      = 4,17 − 0,52 = 3,65 → 3,5
```

Derselbe Streifen an einer Tempo-30-Strasse käme mit `0,70 × 0,65 = 0,46` (und dem Radweg-Anker 90) auf einen kleineren Abzug — das Tempo steckt hier zweimal in der Note: einmal im feel-safe-Anker der Führungsform, einmal im Breitensatz.

Bei erfüllter Breite (Ist ≥ Vorgabe) gibt es keinen Abzug.

#### Parkierung rechts (Dooring)

Wo das Velo **auf der Fahrbahn neben möglichem Längsparken** fährt, kann angegeben werden, ob rechts längs geparkt wird (Dooring-Lage). Das betrifft die Fahrbahn-Führungsformen **Mischverkehr, Radstreifen, Velostrasse, Umweltspur und Einbahn mit Velogegenverkehr (markiert)** (Konstante `PARKEN_RELEVANT` in [`VeloroutenCheckWeb/src/fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts)); bei baulich abgesetzten Radwegen und beim Fussweg greift der Dooring-Mechanismus nicht, dort wird das Feld nicht angezeigt. Auswahl **Ja / Nein / Egal**:

- **Ja** → Abzug **1,0 Notenstufe**, pauschal für jede Führungsform und jede Breite. In jedem Fall keine Note 6, sobald Parken rechts vorhanden ist.
- **Nein / Egal** → kein Abzug.

Bei **Ja** kann zusätzlich angegeben werden, ob ein **Sicherheitsstreifen gegenüber den Parkplätzen** (SN 640 060; im Basler Standard-Papier genannt) vorhanden ist. Ist er vorhanden, entschärft er die Dooring-Gefahr → **kein Abzug**. Da SN 640 060 eine CH-Norm ist, gilt das in allen Stadt-Rechnern.

**Offener Punkt: der Schaden ist gemessen breitenabhängig — die Skala trägt aber nicht.** Bis zum 09.08.2026 rechnete der Abzug `0,6 + 0,9 × (3,5 − Streifenbreite)`. Der Befund dahinter bleibt gültig (Radstreifen, ungeschützt, tram-bereinigt; Vergleich bei **gleicher Breite und gleichem Tempo**, `tools/verify_06.py` §5):

```
Parken-Offset bei 3,5 m Streifen:    8,5–9,6 Pkte  ≈ 0,6 Noten   (man kann der Türzone ausweichen)
Parken-Offset bei 2,0 m Streifen:  28,8–29,6 Pkte  ≈ 2,0 Noten   (man fährt zwangsläufig darin)
```

Zurückgenommen wurde die Formel, weil die Befragung **genau diese zwei Streifenbreiten** kennt und der reale Bestand fast vollständig darunter liegt: Der breiteste in Bern erfasste Radstreifen misst **2,50 m**, und **282 von 340** sind schmaler als der *kleinste* Messpunkt — dort war die Formel reine Verlängerung (1,50 m ergäbe −2,40 Noten, mehr als je gemessen). Ein dritter, vorhandener Messpunkt widerspricht ihr zudem: Im **Mischverkehr** kostet die Parkierung nur ≈ 0,15 Noten, weil dort keine Markierung den Platz in die Türzone weist — der Schaden hat sein Maximum bei ≈ 2,0 m und fällt zu beiden Seiten ab. Was fehlt, sind Szenen mit Streifenbreiten **unter 2,0 m**; solange sie fehlen, ist die Pauschale die ehrlichere Zahl.

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

→ **Deckel: höchstens Note 3**, nur Mischverkehr, tempo-unabhängig. Konstante `TRAM_DECKEL`, tunbar. Auf einem Niveau von 9,4 % bzw. 5,4 % feel-safe lässt sich keine bessere Note begründen — und ein Deckel kappt nur nach oben, statt eine ohnehin schlechte Note weiter zu drücken. Dazu: **Kaphaltestelle an einer Tram-Haltestelle** ohne bauliche Trennung → **Note 1** (`KAP_NOTE`), weil das Velo dort über die Schienen an die Haltekante gedrängt wird, während Fahrgäste ein- und aussteigen.

> _Seit 14.08.2026._ Vorher wirkte der Befund als tempoabhängiger Abzug (−1,2 / −0,7, `TRAM_MALUS`). Die Umstellung gleicht den Online-Rechner an den lokalen Berner Rechner an; der Befund selbst ist unverändert. Vollständiger Rechenweg und Reproduktion: `tools/verify_06.py` (§2) bzw. `docs/07_Tram_in_der_Fahrbahn.md`.

### 4. Sonderfälle (Umweltspur, Velostrasse, Fussweg)

#### Umweltspur (Q4, Bus+Velo)

DTV und Tempo sind **nicht massgebend**, sondern der **Bus-Takt** (zusätzliches Feld öV-Takt [Min]) und die Breite. Die Eignung sinkt mit steigender Busfrequenz (kürzerem Takt) und ist nach oben gedeckelt, davon der Breiten-Abzug (× 0,9). **Decke und Takt-Modell sind stadtspezifisch** (Konstanten `UMWELTSPUR_DECKE` und `UMWELTSPUR_TAKT`): Bern rechnet mit **Stufen**, Zürich und Luzern mit einer **Rampe** (`umweltspurBasis()`) — Note 1 bei Takt ≤ `taktNote1`, die Decke ab Takt ≥ `taktOk`, linear dazwischen. Ohne Takt-Angabe gilt die Decke — ein eingetragener Takt kann die Note nur senken.

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

Nur **bei Tempo 30** zulässig; sonst entspricht die Führungsform nicht den Vorgaben → **Note 1** mit Hinweis. Bei Tempo 30 gilt die Form als erfüllt (Basis-Note 6); anschliessend wirkt die Breite. Die Breite ist ein **Band 4,50–6,50 m** (Min und Max, identisch für beide Routentypen): Abzug bei zu schmal (< 4,50 m) *oder* zu breit (> 6,50 m), je `Abweichung × 0,9`.

#### Kombinierter Fuss-/Radweg (Q11)

Gemeinsam genutzter, baulich **vom MIV abgesetzter** Geh-/Radweg (OSM: `path`/`footway` mit `bicycle=designated` + `foot=designated`, nicht `segregated`). Anders als der «Fussweg Velo gestattet» **keine Note-4-Deckelung**: hohe Separation (Rang wie Radweg) → erfüllt die Soll-Form (Basis-Note 6), die Note ist dann **breitengesteuert**. Breitenvorgabe stadtspezifisch: **Bern/Luzern/Zürich ≥ 3,50 m** (beide Routentypen; Zürich vermeidet die Form in aktuellen Planungen, Ausnahme bei geringer Frequenz, Mindestbreite 3,50 m gemäss VSS-Leitfaden); **Basel** frequenz-/routenabhängig **6,00 m** (Velohauptroute, mittlere–hohe Frequenz) bzw. **4,80 m** (Veloroute, geringe Frequenz; reduziert 5,00 / 4,20 m).

#### Fussweg Velo gestattet (Q12)

Mischfläche Fuss/Velo, Kompromiss-/Restlösung → höchstens **Note 4 («genügend»)**, davon Breiten-Abzug (Vorgabe ≥ 3,50 m, beide Routentypen). Die situativen **Voraussetzungen** werden als Hinweis-Checkliste angezeigt (kein Noteneinfluss): erhöhtes Schutzbedürfnis Velo (z. B. Schulwege), geringe Fuss-/Velofrequenz, Steigung oder kein Gefälle, etablierte/konfliktarme Situation, ausreichende Breite (≥ 3,50 m), fehlende Alternativen; zusätzlich der Hinweis: **bei Gefälle besondere Vorsicht** (hohe Differenzgeschwindigkeit Velo ↔ Fuss). Normativ (keine FixMyCity-Daten für Mischflächen verwendet).

### 5. Haltestellen (ÖV)

Zum Abschnitt gehört der Umgang mit **ÖV-Haltestellen**. Eingabe **ÖV-Angebot**: keine Haltestelle / Bus ≥ 15 Min / Bus 5–15 Min / Bus < 5 Min / Tram; bei vorhandener Haltestelle zusätzlich der **Haltestellentyp**.

Die Haltestellen-Logik unten (Soll-Lösung, Typologie, Abzüge) folgt dem **Berner** Masterplan. Stadtspezifisch: **Bern/Luzern** mit automatischer Soll-Lösung (Takt × Route, Luzern ohne Tram), **Zürich/Basel** ohne automatischen Abzug — dort nur Typ-Auswahl + Breite.

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
HS4  Haltestelle mit rückw. Radweg       Separate Velofläche  2.5       1.6
HS5  Inselhaltestelle                    Separate Velofläche  2.5       1.5
HS6  Fahrbahnhaltestelle Bus             Mischverkehr         –         –
HS7  Busbucht                            Mischverkehr         –         –
```

**Noteneinfluss (zwei unabhängige Abzüge):**

- **Einsatzbereich:** Abzug **−1,0**, wenn die Soll-Lösung *Separate Velofläche* verlangt, der vorhandene Typ aber aus der **Mischverkehr-Familie** (HS3/HS6/HS7) stammt. Über-Erfüllung und der Übergangsbereich geben keinen Abzug.
- **Breite der Veloführung an der Haltestelle:** nur bei HS1/HS2/HS4/HS5. Zu schmal → Abzug
  `Defizit_m × 0,6` (Satz der markierten Velofläche auf Fahrbahnniveau). Der Masterplan nennt für
  HS1/HS4 den Bereich 1,8–2,5 m; der Rechner rechnet mit einem konkreten Sollwert je Typ
  (HS1: 1,8 · HS4: 2,5 — `HALTESTELLEN` in [`fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts)).

> Normativ: zu Haltestellen gibt es keine FixMyCity-Daten → Schwellen aus dem Masterplan bzw.
> gesetzt. Parameter `HALTESTELLE_ABZUG` und `NOTE_PRO_METER`, tunbar.

---

## Datenquellen und Herkunft

Beim Laden liefert **OpenStreetMap** die Basis; wo amtliche Quellen verfügbar sind, werden die Felder daraus **angereichert** (vorausgefüllt, nicht ersetzt). Prinzip und Zuordnung sind stadtübergreifend; welche Quelle je Stadt welches Feld füllt, zeigt die Matrix unten, die Stadt-Details folgen darunter.

### Prinzip der Anreicherung

**OSM als Basis (alle Städte).** OpenStreetMap (Overpass API) liefert die Geometrie, den Strassennamen und — wo getaggt — Tempo (`maxspeed`), Breite (`width`/`cycleway:*:width`) und die Ist-Führungsform. Die Strassensuche ist gross-/kleinschreibungsunabhängig.

**Amtliche Anreicherung.** Zusätzliche Quellen (Geoportale, WFS/ArcGIS-Dienste, gebündelte Snapshots) füllen einzelne Felder. Live-Dienste werden bei jedem „Strasse laden" / „Segmente im Kartenausschnitt laden" dazugeladen — bewusst so, damit die Daten automatisch aktuell bleiben. Schlägt eine einzelne Quelle fehl (Server kurz nicht erreichbar), wird sie übersprungen und der Import läuft mit den übrigen weiter.

**Zuordnung über Überlappung statt Nähe.** Jedes OSM-Segment wird dem Geodaten-Feature zugeordnet, das tatsächlich *entlang* des Segments verläuft — gemessen am Anteil der (verdichteten) Segmentpunkte innerhalb 20 m der Feature-Linie (≥ 50 %; Velostrassen strenger mit ≥ 60 %, da sie die Ist-Führungsform setzen). Das verhindert, dass eine bloss **kreuzende** Strasse fälschlich zugeordnet wird (was eine reine Mittelpunkt-/Nächste-Punkt-Suche z. B. bei der Jungfraustrasse tat, wo Tempo/DTV/Routentyp dadurch leer blieben oder von der Querstrasse stammten). Implementiert in [`VeloroutenCheckWeb/src/geo.ts`](VeloroutenCheckWeb/src/geo.ts) und [`cityShared.ts`](VeloroutenCheckWeb/src/cityShared.ts).

**Vorrang amtlich > OSM.** Liegt ein Wert sowohl amtlich als auch aus OSM vor (z. B. Tempo), gilt der amtliche Wert. Die Herkunft ist nach dem Übernehmen feldweise am Chip erkennbar (siehe [Bedienung](#bedienung)). Der bauliche **Haltestellentyp** (HS1–7) steht in keiner Quelle → bleibt immer manuell.

### Datenherkunft je Stadt

Über die **Stadt-Auswahl** im Lade-Bereich lassen sich **Bern**, **Zürich**, **Basel** und **Luzern** wählen. Modus je Zelle: **live** (Dienst bei jedem Laden), **Snapshot** (gebündelte Datei), **OSM**, **amtlich** bzw. **–** (keine Quelle → manuell). „partiell" = nur wo eine Zählstelle (≤ 25 m) auf der geladenen Strasse liegt.

| Feld | Bern | Zürich | Basel | Luzern |
|---|---|---|---|---|
| Geometrie, Name, Ist-Führungsform, Breite | OSM | OSM | OSM | OSM |
| Tempo | Geoportal (live) | OSM | amtlich (Dataset 100250, live) | OSM |
| DTV MIV | Geoportal-Formel (live, partiell) | Verkehrsmessstellen-WFS (live, partiell) | Snapshot `dtv_basel.json` (partiell) | ArcGIS `DTV_ANZAHL` (live, partiell) |
| Routentyp | Masterplan-Layer (live) | Velonetzplanung-WFS (live) | Teilrichtplan Velo-WFS (live) | Velonetz-ArcGIS (live) |
| Strassentyp | – | – | amtlich (Dataset 100250, live) | – |
| Ist = Velostrasse | Velostrassen-Layer (live) | – | Velostadtplan (live) | – |
| ÖV Tram / Haltestelle | Geoportal (live) | OSM | OSM | OSM (kein Tram) |
| Bus-Takt (ÖV-Band) | GTFS-Snapshot | GTFS-Snapshot | GTFS-Snapshot | GTFS-Snapshot |

Jede Stadt ist ein eigener Adapter ([`bern.ts`](VeloroutenCheckWeb/src/bern.ts), [`zurich.ts`](VeloroutenCheckWeb/src/zurich.ts), [`basel.ts`](VeloroutenCheckWeb/src/basel.ts), [`luzern.ts`](VeloroutenCheckWeb/src/luzern.ts)); gemeinsame Helfer (geometrisches Matching, ÖV/Takt aus OSM) liegen in [`cityShared.ts`](VeloroutenCheckWeb/src/cityShared.ts). Der Adapter `stgallen.ts` existiert noch, St. Gallen ist aber **derzeit nicht auswählbar** (nicht weiterverfolgt). Das massgebende Grundlagendokument der Stadt ist im Lade-Bereich verlinkt; die Herkunft jeder Vorgabe steht im Rechner beim Abschnitt.

### Bern

Geodaten aus dem Geoportal der Stadt Bern (`map.bern.ch`, ArcGIS REST, GeoJSON, live): DTV, Tempo (`V_sig`), Routentyp ([Veloroutennetz Masterplan](https://opendata.swiss/de/dataset/veloroutennetz-masterplan-veloinfrastruktur-2020)), [Velostrassen](https://opendata.swiss/de/dataset/velostrassen) (setzt Ist-Führungsform, nur 7 Strassen, Stand 2026) sowie ÖV (Haltestellen + OeV_Linien).

**DTV-Formel.** Das Live-Service liefert kein `DTV`-Feld (das existiert nur im Datei-Export GDB/GPKG der Stadt Bern), sondern `Nt`/`Nn` — die Verkehrsmenge in der Tagstunde (06–22 Uhr, 16 h) bzw. Nachtstunde (22–06 Uhr, 8 h). Daraus:

```
DTV = round(16 × Nt + 8 × Nn)
```

Empirisch per Least-Squares-Regression gegen einen GeoPackage-Export hergeleitet (1186 Segmente, max. Abweichung 1,2 Fahrzeuge, Mittel 0,42) und cross-validiert gegen die Jahresauswertung der Messstelle Thunstrasse 100 (gemessen 17'191, Formel 17'190). DTV ist **partiell** — er greift nur auf Strassen mit DTV > 2'000 Mfz/Tag bzw. im Stadtteil 1 (Altstadt); die Werte sind „nur eine Grössenordnung, keine verbindlichen Zählresultate".

**ÖV: Tram und Bus-Takt.** Der Layer **Haltestellen** liefert die Marker, **OeV_Linien** den Modus entlang des Segments (`Verkehrsmittel_typ`). Verläuft eine **Tram**-Linie entlang und liegt eine Haltestelle im Abschnitt, wird das ÖV-Angebot automatisch auf „Tram" gesetzt. Für **Bus** kommt der **Takt** aus dem GTFS-Snapshot (`oev_takt_bern.json`, flach `{ BPUIC → Bus-Fahrten/h }`, via [`tools/oev_takt.py`](tools/oev_takt.py)): Bus-Abfahrten in der Abendspitze 17:00–18:00 an einem Werktag (Di), in der stärksten Einzelrichtung; Join über die Haltestellen-`Id_opendata` (= BPUIC). Frequenzband: ≤ 4/h → `bus_ab15`, 5–12/h → `bus_5_15`, > 12/h → `bus_unter5`. OSM kennt zwar Linien und Haltestellen, aber keinen Takt — daher der Fahrplan.

### Zürich

Quellen je Feld siehe [Matrix](#datenherkunft-je-stadt): **Routentyp** live aus der **Velonetzplanung** (WFS `ogd.stadt-zuerich.ch`, `view_velonetz`); **DTV** live aus den **Verkehrsmessstellen** des Kantons ZH (OGD-WFS `ogd-0223_..._verkehrsmessstellen_p`, Feld `dtv`, partiell); Tempo/Ist-Führungsform/Breite aus OSM (Breite nur bei seltenem `cycleway:*:width`-Tag); Tram/Haltestelle aus OSM; **Bus-Takt** aus dem georeferenzierten GTFS-Snapshot (`oev_takt_zurich.json`, der OSM-Haltestelle per nächstem Punkt ≤ 80 m zugeordnet).

**Routentyp-Mapping Zürich → Masterplan.** Der Zürcher Velonetzplan kennt drei Netzkategorien (Velostandards Stadt Zürich, S. 7); sie werden auf die beiden Masterplan-Routentypen übersetzt, weil der Routentyp im Modell nur die massgebliche Breiten-Untergrenze (Optimal/Minimal) und die Haltestellen-Soll-Lösung steuert:

| Zürich `kategorie` | → Routentyp |
|---|---|
| `Vorzugsroute` | Velohauptroute |
| `Hauptnetz` | Veloroute |
| `Basisnetz` | *(kein Routentyp — manuell)* |

**Stadtspezifische Breiten-Sollwerte (Zürich).** Für Zürich gelten die **Standardmasse der Velostandards Stadt Zürich** (Tab. 1, S. 16) statt der Berner Regelbreiten — Velovorzugsroute → Velohauptroute (Optimal), Hauptnetz → Veloroute (Minimal):

| Führungsform | Velohauptroute | Veloroute |
|---|---|---|
| Radstreifen · Radweg strassenbegl./gesch. · Radweg abgesetzt | 2,50 m | 2,20 m |
| Umweltspur | 4,80 m | 4,50 m |

Wo Zürich keine eigene Vorgabe hat (Velostrasse-Band 4,50–6,50 m, Fussweg Velo gestattet, Mischverkehr), gelten weiterhin die **Berner Werte** (Fallback je Feld). Implementiert als `BREITEN_ZUERICH` in [`fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts), übergeben über den `breiten`-Eintrag der Stadt-Registry. Die **Soll-Führungsform** folgt der **Zürcher** Tabelle (je Routentyp, `fuehrungsartZuerich`); die feel-safe-Logik bleibt stadtübergreifend.



### Basel

Routentyp live aus dem **Teilrichtplan Velo** (WFS `wfs.geo.bs.ch`, Bestandsnetz mit den Flags `tv_pendlerroute`/`tv_basisroute`). Zusätzlich setzt der **Velostadtplan** (data.bs.ch, `gml_id=Velostrasse`, 87 Segmente) die **Ist-Führungsform = Velostrasse**, analog Berns Velostrassen-Layer. **Strassentyp** und **signalisierte Höchstgeschwindigkeit** kommen amtlich aus dem Datensatz **„Strassen und Wege"** (data.bs.ch, Dataset `100250`, Felder `strassenkategorie` / `geschwindigkeit`, geometrisch zugeordnet) — der Strassentyp ist für die Basler Soll-Wahl massgebend (verkehrs- vs. siedlungsorientiert), das Tempo hat als amtliche Quelle Vorrang vor OSM (nur reale Werte 20–60; 0/5 = Fussgängerzone/Schritttempo werden ignoriert). Übrige Ist-Führungsform aus OSM; Breite aus OSM nur bei seltenem `cycleway:*:width`-Tag (de facto meist manuell); Tram/Haltestelle aus OSM; **Bus-Takt** aus dem gebündelten GTFS-Snapshot (`oev_takt_basel.json`, via `tools/oev_takt.py`; der OSM-Haltestelle per nächstem Punkt zugeordnet); **DTV** aus dem gebündelten Zählstellen-Snapshot (`dtv_basel.json`, via `tools/dtv_basel.py`; data.bs.ch liefert nur Stundenwerte → offline zum Werktags-Mittel aggregiert, partiell je Zählstelle). Die „Eignung" des Velostadtplans („gut befahrbares Velonetz") ist eine Komfortbewertung und wird **nicht** als Routentyp übernommen.

**Soll-Führungsform Basel.** Nicht DTV-, sondern **strassentyp**-basiert (× Routentyp; Tab. 3, S. 15). Auf **siedlungsorientierten** (nicht verkehrsorientierten) Tempo-30-Strassen: Vorzugsroute (Velohauptroute) → **Velostrasse** (DWV-Deckel 2'500); Pendler-/Basisroute (Veloroute) → **Mischverkehr** (DWV-Deckel 5'000, empfohlen) **oder Velostrasse** (mögliche Form, **kein** DWV-Deckel). Jede andere Ist-Form ist dort **nicht vorgesehen** → Note max. 4. Auf **verkehrsorientierten** Strassen → Vorzugsroute «Radstreifen oder Radweg», Pendler-/Basisroute «Radstreifen» (`fuehrungsartBasel`); eine **Velostrasse gibt es dort nicht** (nicht zulässig → Note max. 4). Der **Strassentyp** ist im Rechner ein eigenes Feld (nur bei Basel sichtbar, amtlich vorbefüllt) und für die Bewertung erforderlich. **DWV-Deckel** (form-abhängig): übersteigt der DTV den Höchstwert (Velostrasse·Vorzugsroute 2'500, Mischverkehr·Pendler-Basis 5'000; Velostrasse·Pendler-Basis kein Deckel), zeigt der Rechner einen **Hinweis** (kein Notenabzug). **Velostrasse-Breite:** Nettobreite der Fahrgasse 4,50/4,30 m, bei **DWV < 1'000** reduziert **4,00 m** zulässig.

| Basel-Kategorie | → Routentyp |
|---|---|
| Velovorzugsrouten | Velohauptroute — *aber nicht als offene Geodaten verfügbar → manuell* |
| Basis-/Pendlerrouten (`tv_basisroute=ja` oder `tv_pendlerroute=ja`) | Veloroute |
| übriges Strassennetz | *(kein Routentyp — manuell)* |

Gemäss Velokonzept Basel-Stadt sind Basis- und Pendlerrouten **nicht** hierarchisiert (verschiedene Nutzergruppen, gleiche Stufe) → beide werden zur **Veloroute**. Die qualitativ höherwertigen **Velovorzugsrouten** (= Velohauptroute) sind weder im WFS/WMS noch auf data.bs.ch als Geodaten publiziert und können daher nicht automatisch gesetzt werden.

**Breiten-Sollwerte (Basel).** Standards Fuss- und Veloverkehrsinfrastruktur Basel-Stadt (2024), Tab. 4 — Standardmass (→ Velohauptroute) / reduziertes Standardmass (→ Veloroute); Velostrasse-Band und Fussweg → Bern-Fallback (`BREITEN_BASEL` in [`fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts)):

| Führungsform | Velohauptroute | Veloroute |
|---|---|---|
| Radstreifen | 2,50 m | 1,80 m |
| Radweg strassenbegl./gesch. · Radweg abgesetzt | 2,50 m | 2,20 m |
| Umweltspur | 4,50 m | 3,00 m |

### Luzern

Routentyp live aus dem städtischen **Velonetz** (ArcGIS REST `map.stadtluzern.ch`, Layer 7, Feld `VELO_ROUTENTYP`). Tempo und Ist-Führungsform aus OSM; Breite aus OSM nur bei seltenem `cycleway:*:width`-Tag (de facto meist manuell); ÖV aus OSM — **Luzern hat kein Tram**, nur Bus → praktisch nur „Haltestelle vorhanden"; **Bus-Takt** aus dem gebündelten GTFS-Snapshot (`oev_takt_luzern.json`, via `tools/oev_takt.py`); **DTV** live aus der Stadt-Luzern-ArcGIS (`OGD/verkehrszaehldaten`, Feld `DTV_ANZAHL`), partiell je Zählstelle (≤ 25 m).

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
| Radstreifen · Radweg strassenbegl./gesch. · Radweg abgesetzt | 2,50 m | 1,80 m |
| Umweltspur | 4,50 m | 3,75 m |
| Velostrasse | 4,50 m | 4,50 m |
| Fussweg Velo gestattet | 3,50 m | 3,50 m |

### OpenBikeSensor (gemessene Überholabstände)

Wo vorhanden, werden je Abschnitt **gemessene Überholabstände** angezeigt (Median, Anteil unter 1,5 m gesetzlichem Mindestabstand, Anzahl Messungen, Befahrungen). Quelle ist ein Export aus dem [OpenBikeSensor-Portal](https://portal.openbikesensor.org/), als gebündelter Snapshot **pro Stadt** abgelegt (`VeloroutenCheckWeb/public/obs_bern.json`, `obs_zurich.json`) und client-seitig nachgeschlagen — kein Live-Bezug. Welche Datei geladen wird, bestimmt die Stadt-Auswahl (Städte ohne Snapshot, z. B. Basel, zeigen keine OBS-Werte). Aktualisierung: Datei durch einen neuen Portal-Export ersetzen.

**Zuordnung über Geometrie statt `way_id`.** OBS nutzt einen eigenen OSM-Schnappschuss und teilt lange Strassen in feinere Mess-Abschnitte; ausserdem werden OSM-Ways laufend geteilt/neu nummeriert. Ein reiner `way_id`-Join verfehlt darum Teilstücke (Beispiel: von 12 OBS-`way_id`s der Schosshaldenstrasse existiert eine nicht mehr im aktuellen OSM). Deshalb wird jedes OBS-Teilstück per **Überlappung** ([`VeloroutenCheckWeb/src/geo.ts`](VeloroutenCheckWeb/src/geo.ts)) genau dem am besten passenden OSM-Segment zugeordnet und alle Teilstücke eines Segments werden zusammengeführt (Median/Mittel aus dem kombinierten Messwert-Array, Anzahlen summiert) — schnappschuss-unabhängig und pro Segment.

**Befahren ohne Überholung sichtbar.** Hat ein Segment OBS-Befahrungen, aber keine aufgezeichnete Überholung (`overtaking_event_count` = 0), wird das ausgewiesen („befahren (n Befahrungen), aber keine Überholmessung aufgezeichnet") statt nichts anzuzeigen.

Die Überholabstände sind **reine Zusatzinformation** und fliessen **nicht** in die Führungsform-Note ein.

### Datenlizenzen und Quellenangaben

| Quelle | Verwendung | Bezug | Lizenz / Quellenangabe |
|---|---|---|---|
| **OpenStreetMap** | Geometrie, Name, teils Tempo/Breite/Ist-Führungsform | Overpass API (live) | **ODbL** — „© OpenStreetMap-Mitwirkende", Attribution Pflicht |
| **Stadt Bern Geoportal** (Flächendeckende Verkehrsdaten, Signalisierte Höchstgeschwindigkeit, Veloroutennetz Masterplan, Velostrassen, Haltestellen, OeV_Linien) | DTV, Tempo, Routentyp, Velostrasse, ÖV (Tram/Haltestellen) | [opendata.swiss](https://opendata.swiss/) / `map.bern.ch` (ArcGIS REST, live) | **„Freie Nutzung. Quellenangabe ist Pflicht."** — Quellenangabe: „Geodaten Stadt Bern" |
| **Stadt Zürich Velonetzplanung** | Routentyp (Zürich) | OGD Stadt Zürich, WFS `ogd.stadt-zuerich.ch` (`view_velonetz`, live) | **Open Government Data** — Quellenangabe: „Stadt Zürich" |
| **Teilrichtplan Velo + Velostadtplan Basel-Stadt** | Routentyp + Velostrasse (Basel) | OGD Kanton Basel-Stadt, WFS `wfs.geo.bs.ch` + data.bs.ch (live) | **Open Government Data** — Quellenangabe: „Geodaten Kanton Basel-Stadt" |
| **Strassen und Wege Basel-Stadt** (Dataset `100250`) | Strassentyp + signalisierte Höchstgeschwindigkeit (Basel) | OGD Kanton Basel-Stadt, data.bs.ch (live) | **Open Government Data** — Quellenangabe: „Geodaten Kanton Basel-Stadt" |
| **Verkehrszähldaten Basel-Stadt** | DTV (Basel) | OGD Kanton Basel-Stadt, data.bs.ch (Snapshot `dtv_basel.json`, via `tools/dtv_basel.py`) | **Open Government Data** — Quellenangabe: „Geodaten Kanton Basel-Stadt" |
| **Velonetz Stadt Luzern** | Routentyp (Luzern) | OGD Stadt Luzern, ArcGIS REST `map.stadtluzern.ch` (live) | **Open Government Data** — Quellenangabe: „Geodaten Stadt Luzern" |
| **GTFS Fahrplan** | Bus-Takt (Abendspitze) → ÖV-Angebot-Band | [opentransportdata.swiss](https://opentransportdata.swiss/), Snapshots `VeloroutenCheckWeb/public/oev_takt_{bern,zurich,basel,luzern}.json` (via `tools/oev_takt.py`) | Open data — opentransportdata.swiss |
| **OpenBikeSensor** | Gemessene Überholabstände (Info, nicht in der Note) | Portal-Export, Snapshots `VeloroutenCheckWeb/public/obs_bern.json`, `obs_zurich.json` | „© OpenBikeSensor-Mitwirkende" |
| **CyclOSM** | Kartenhintergrund | Tile-Server (live) | © OpenStreetMap-Mitwirkende · Stil: CyclOSM |

Die Pflicht-Attributionen werden in der App angezeigt: die Karten-Attribution (OSM/CyclOSM) unten rechts auf der Karte, die Herkunft der übrigen Werte über die Feld-Chips und die Status-/Lade-Meldung.

### Nutzungsstatistik (GoatCounter)

Seitenaufrufe werden mit [GoatCounter](https://www.goatcounter.com/) gezählt (Einbindung in
[`VeloroutenCheckWeb/index.html`](VeloroutenCheckWeb/index.html), Zähl-Endpunkt `vrc.goatcounter.com`).
Datenschutzfreundlich: **cookielos**, keine Personendaten, privates Dashboard; auf `localhost`
zählt das Skript nicht, Dev/Preview verfälschen die Statistik also nicht. Zusätzlich zum
automatischen Seitenaufruf zählt die App den Wechsel in den Rechner als eigenen Pfad `/rechner`
(`zaehleRechner()` in [`App.tsx`](VeloroutenCheckWeb/src/App.tsx)); der Hinweis für Nutzende steht
auf der Einstiegsseite.

---

## Offene Punkte

- **Parken × Breite** — der Effekt ist gemessen (0,6 Noten bei 3,5 m, 2,0 bei 2,0 m), aber **nicht umgesetzt**: Die Befragung kennt nur diese zwei Breiten, der reale Bestand liegt fast vollständig darunter, und ein dritter Messpunkt (Mischverkehr ≈ 0,15) widerspricht der Verlängerung nach unten. Es braucht Szenen unter 2,0 m Streifenbreite; bis dahin gilt die Pauschale −1,0 (Stand 09.08.2026, siehe Kapitel «Parkierung rechts»). Die Breitensätze selbst bleiben parken-bereinigt geschnitten (0,6/0,35).
- **«Velo rechts vom Parken»** als eigene, bessere Parken-Lage aufnehmen (empirisch ≈ 92, aber nur 6 Szenen → erst mit besserer Datenlage).
- **Velostrasse «zu breit»:** der Abzug über der Maximalbreite (6,50 m) ist normativ gesetzt (gleicher Satz wie «zu schmal») — bei Bedarf eigener Satz/Schwelle.
- **«Radweg abgesetzt» (Q3) — nicht der Anker, sondern die Feel-Safe-Anzeige prüfen:** Im Seitenraum wird dieselbe Bauform tiefer beurteilt (76,9 % über alle Kameras, 81,6 % im Velo-Schnitt) als auf Poller-Niveau (≈ 90). Für die **Note** ist das folgenlos: Der Anker wirkt dort nur als Zielwert, und ein Radweg erfüllt jedes Soll, bevor ein Anker gelesen wird. Seit P11-A (13.08.2026) enthält der «schnell»-Anker (84) den Seitenraum bereits — die **Feel-Safe-Anzeige** liest für Seitenraum-Formen bei «ruhig» (90) weiterhin einen eher zu hohen Ist-Wert. <sub>Formulierung korrigiert am 10.08.2026: Zuvor stand hier ein «Berliner Abschlag», den man für Bern nicht übernehme — es gibt keine getrennte Berliner Quelle, die ganze Befragung ist Berlin, und die Begründung über den Berner Bestand war eine Annahme.</sub>
- **Einfärbung des Belags:** empirisch ein eigener, positiver Effekt (farbig vs. grau ≈ +7 feel-safe-Punkte; im Paper signifikant, Tab. 2) — bisher **nicht** im Modell. Könnte als eigener, datengestützter Faktor aufgenommen werden (analog zum Tram-Malus). Siehe [docs/08](docs/08_Studie_Subjektive_Sicherheit_2022.md).
- **Mindestmasse (Untergrenzen) im ganzen Rechner:** Heute gibt es nur eine Soll-Regelbreite je Führungsform/Routentyp; eine Unterschreitung wirkt linear über den Breiten-Abzug. Velostandards-Dokumente definieren zusätzlich **absolute Minimalmasse, die nicht unterschritten werden dürfen**. Deren Unterschreitung müsste die Note härter kappen (eigene Schwelle/Deckelung) statt nur linear abzuziehen. Stadtübergreifend zu konzipieren.
- Velostrassen sind Mischverkehr, was zur feelClass: 'Mischverkehr' passt. Im Code ist die Basisnote bei Tempo 30 aber aktuell 6 (Form akzeptiert), nicht die Mischverkehr-Bewertung. Soll das so bleiben? Die Note ändert sich aktuelle wenn die breiten nicht eingehalten werden oder wenn es parkierung gibt.

---

## Entwicklung und Code-Übersicht

```
cd VeloroutenCheckWeb
npm install
npm run dev      # Dev-Server (Vite)
npm run build    # tsc --noEmit && vite build
npm test         # Vitest (Bewertungslogik)
```

Stack: React 18, Vite 5, TypeScript (strict).

| Datei | Zweck |
|---|---|
| [`VeloroutenCheckWeb/src/fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts) | Bewertungslogik: Soll-Wahl, Führungsform-Note, Breiten-/Parkier-/Haltestellen-Abzug |
| [`VeloroutenCheckWeb/src/App.tsx`](VeloroutenCheckWeb/src/App.tsx) | UI, Eingaben, Import-Wege, Herkunft/Chips, CSV-Export, Entscheidungstabellen |
| [`VeloroutenCheckWeb/src/VeloMap.tsx`](VeloroutenCheckWeb/src/VeloMap.tsx) | Leaflet-Karte: Segmente, Nummern, Haltestellen-Marker, Highlight |
| [`VeloroutenCheckWeb/src/bern.ts`](VeloroutenCheckWeb/src/bern.ts) | Bern: Geoportal-Layer (DTV-Formel, Matching, ÖV) |
| [`VeloroutenCheckWeb/src/zurich.ts`](VeloroutenCheckWeb/src/zurich.ts) | Zürich: Velonetzplanung-WFS (Routentyp) + ÖV aus OSM |
| [`VeloroutenCheckWeb/src/basel.ts`](VeloroutenCheckWeb/src/basel.ts) | Basel: Teilrichtplan-Velo-WFS (Routentyp) + Velostrasse + Strassentyp/Tempo (Dataset 100250) + ÖV aus OSM |
| [`VeloroutenCheckWeb/src/luzern.ts`](VeloroutenCheckWeb/src/luzern.ts) | Luzern: Velonetz-ArcGIS (Routentyp) + ÖV aus OSM |
| [`VeloroutenCheckWeb/src/stgallen.ts`](VeloroutenCheckWeb/src/stgallen.ts) | St. Gallen: Veloplan-Opendatasoft (Routentyp) + ÖV aus OSM — *Adapter vorhanden, aber derzeit nicht auswählbar* |
| [`VeloroutenCheckWeb/src/cityShared.ts`](VeloroutenCheckWeb/src/cityShared.ts) | Geteilte Stadt-Helfer: Geo-Matching + ÖV-Erkennung aus OSM |
| [`VeloroutenCheckWeb/src/obs.ts`](VeloroutenCheckWeb/src/obs.ts) | OpenBikeSensor-Überholabstände |
| [`VeloroutenCheckWeb/src/velostreifen.ts`](VeloroutenCheckWeb/src/velostreifen.ts) | Bern: lokaler Velostreifen-Snapshot (`public/velostreifen_bern.json`, **gitignored**) → Ist-Führungsform + Breite mit Chip **„Markierung"**. Fehlt die Datei (öffentlicher Build/Prod), ist die Quelle stumm — Dev und Prod können sich hier unterscheiden |
| [`VeloroutenCheckWeb/src/geo.ts`](VeloroutenCheckWeb/src/geo.ts) | Geometrie-Helfer (Überlappungs-Matching) |
| [`VeloroutenCheckWeb/src/fuehrungsform.test.ts`](VeloroutenCheckWeb/src/fuehrungsform.test.ts) | Vitest-Tests der Bewertungslogik (`npm test`) |
| [`VeloroutenCheckWeb/src/geo.test.ts`](VeloroutenCheckWeb/src/geo.test.ts) | Vitest-Tests der Geometrie-Helfer (Matching, Überlappung) |
| [`VeloroutenCheckWeb/src/regelwerk.drift.test.ts`](VeloroutenCheckWeb/src/regelwerk.drift.test.ts) | Drift-Wächter: `docs/regelwerk.json` gegen die Code-Konstanten — bricht `npm test`, bis die Doku nachgezogen und neu generiert ist |
| [`tools/oev_takt.py`](tools/oev_takt.py) | GTFS → `oev_takt_{bern,zurich,basel,luzern}.json` (Bus-Takt, offline; Bern flach `{BPUIC→n}`, übrige georeferenziert `[{lat,lon,n,name}]`) |
| [`tools/dtv_basel.py`](tools/dtv_basel.py) | data.bs.ch Stundenwerte → Werktags-Mittel-DTV je Zählstelle → `VeloroutenCheckWeb/public/dtv_basel.json` |
| [`tools/verify_06.py`](tools/verify_06.py) | Nachrechnung der feel-safe-Anker (Reproduzierbarkeit, siehe unten) |
| [`tools/generiere_dokumentation.py`](tools/generiere_dokumentation.py) | Generiert `docs/regelwerk.json` + `docs/regelwerk.md` aus den exportierten Konstanten (Regelwerk-Snapshot) |
| [`tools/generiere_stadt_pdf.py`](tools/generiere_stadt_pdf.py) | Generiert die 5 Stadt-Regelwerk-PDFs aus `docs/regelwerk.json` (benötigt `weasyprint`) |

> **Reproduzierbarkeit der feel-safe-Anker.** `tools/verify_06.py` rechnet die feel-safe-Werte aus
> den Rohdaten nach. Es liest aus `FixMyCity_Daten/` (im Repo-Root): `SurveyResults_200414.json`
> (alle Einzelantworten), `scenes_ms.csv` / `scenes_cp.csv` / `scenes_se.csv` (Szenen-Merkmale) und
> `radwege_hauptstrassen.csv` (offizielle Aggregate zur Kreuzvalidierung); ausserdem
> `tools/visualisierung_template.html`. Die App selbst braucht diese Dateien **nicht** zur Laufzeit
> — die Anker sind in `fuehrungsform.ts` fest hinterlegt; das Skript dient nur der Herleitung/Prüfung.
> Die Rohdaten sind **nicht im Repo** (gross/Dritt-Daten); sie sind über
> [FixMyCity / radwege-check](https://radwege-check.de/) zu beziehen und lokal in `FixMyCity_Daten/`
> abzulegen.

---

## Deployment (GitHub Pages)

Bei jedem Push auf `main`, der `VeloroutenCheckWeb/**` ändert, baut der Workflow
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) die App und veröffentlicht sie auf
GitHub Pages. Vite ist dafür auf `base: '/VeloroutenCheck/'` (Build) eingestellt. Einmalig nötig: in den
Repo-Einstellungen unter **Settings → Pages → Source = „GitHub Actions"** aktivieren. Die Seite
erscheint dann unter `https://pnfzygrzgf-svg.github.io/VeloroutenCheck/`.

---

## Lizenz

Code und eigene Inhalte dieses Projekts: **[CC BY-NC 4.0](LICENSE)** (Namensnennung,
nicht-kommerziell). Die eingebundenen **Dritt-Daten** behalten ihre eigenen Lizenzen und
Quellenangaben — siehe [Datenlizenzen und Quellenangaben](#datenlizenzen-und-quellenangaben)
(Geodaten Stadt Bern, OpenStreetMap/ODbL, opentransportdata.swiss, OpenBikeSensor).
