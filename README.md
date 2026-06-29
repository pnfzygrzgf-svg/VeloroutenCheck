# VeloroutenCheck

VeloroutenCheck bewertet die Qualität von Veloinfrastruktur und vergibt dafür eine **Schulnote von 1 bis 6** (6 = beste). Grundlage sind zwei Quellen:

- die **Veloinfrastruktur-Standards der jeweiligen Stadt** (welche Führungsform ist wo vorgesehen, welche Querschnitts- und Haltestellen-Vorgaben gelten) — je Stadt ein eigenes Grundlagendokument:
  - Bern: **[Standards Masterplan Veloinfrastruktur Stadt Bern](https://www.bern.ch/velohauptstadt/infrastruktur/masterplan-veloinfrastruktur)**
  - Zürich: **[Velostandards Stadt Zürich](https://www.stadt-zuerich.ch/content/dam/web/de/aktuell/publikationen/2024/velostandards-stadt-zuerich/velostandards-stadt-zuerich.pdf)**
  - Basel: **[Standards Fuss- und Velo-Verkehrsinfrastruktur Basel-Stadt](https://media.bs.ch/original_file/72373a2c610e23b19ae61cd148ad22f35b3d1fe2/2024-09-27-standards-fvv-is-bs.pdf)**
  - Luzern: **[Standards Veloverkehr Stadt Luzern](https://www.stadtluzern.ch/_docn/2965064/Standards_Veloverkehr.pdf)**
- die empirisch gemessene **subjektive Sicherheit** aus der Befragung von radwege-check / FixMyCity (wie sicher sich Velofahrende in einer Situation fühlen, „feel-safe %").

Das massgebende Grundlagendokument der gewählten Stadt ist im Rechner verlinkt.

Bewertet wird eine **Strecke**, die aus einem oder mehreren **Abschnitten** besteht. Jeder Abschnitt erhält eine eigene Note; die Strecke erhält die Note ihres schlechtesten Abschnitts.

**Web-VeloroutenCheck** https://pnfzygrzgf-svg.github.io/VeloroutenCheck/

> **Beta** — Resultate mit Vorsicht verwenden und durch eine Fachperson prüfen lassen.

Vibecoding. Don't trust, verify!

## Repo-Struktur

| Ordner | Inhalt |
|---|---|
| [`VeloroutenCheckWeb/`](VeloroutenCheckWeb/) | Die Web-App (React + Vite + TypeScript). |
| [`tools/`](tools/) | Offline-Skripte: `oev_takt.py` (GTFS → Bus-Takt-Snapshot), `verify_06.py` (Nachrechnung der feel-safe-Anker), `visualisierung_template.html`. |
| `docs/` | Methodik-Notizen und Herleitungen (lokal, nicht im Repo). |

---

## Inhalt

- [Bedienung](#bedienung)
- [Bewertung (Methodik)](#bewertung-methodik)
  - [1. Soll-Führungsform](#1-soll-führungsform)
  - [2. Führungsform-Note (Ist gegen Soll)](#2-führungsform-note-ist-gegen-soll)
  - [3. Breiten-Abzug und Parkierung](#3-breiten-abzug-und-parkierung)
  - [4. Sonderfälle (Umweltspur, Velostrasse, Fussweg)](#4-sonderfälle-umweltspur-velostrasse-fussweg)
  - [5. Haltestellen (ÖV)](#5-haltestellen-öv)
- [Datenquellen und Herkunft](#datenquellen-und-herkunft)
- [Offene Punkte](#offene-punkte)
- [Entwicklung und Code-Übersicht](#entwicklung-und-code-übersicht)
- [Deployment (GitHub Pages)](#deployment-github-pages)
- [Lizenz](#lizenz)

---

## Bedienung

**Strecke zusammenstellen.** Abschnitte lassen sich beliebig hinzufügen und entfernen. Segmente werden auf zwei Wegen geladen:

- **Strassenname** eingeben und „Strasse laden" — lädt alle Segmente der Strasse aus OpenStreetMap.
- **Klick auf die Karte** — fügt das nächstgelegene Strassensegment hinzu (eine Strecke lässt sich rein per Klick aufbauen).

Mit „In Strecke übernehmen" werden die gewählten Segmente entlang der Strasse geordnet und benachbarte Segmente gleicher Führungsform und gleichen Tempos zu Abschnitten zusammengefasst.

**Eingaben je Abschnitt.** DTV MIV, zulässige Höchstgeschwindigkeit, vorhandene Führungsform (Ist) und — ausser bei Mischverkehr — deren Breite; Routentyp (Velohauptroute / Veloroute); **bei Basel zusätzlich der Strassentyp** (verkehrs- / siedlungsorientiert, da dort die Soll-Wahl strassentyp-basiert ist); bei fahrbahnnahen Führungsformen, ob rechts längs geparkt wird (Dooring); das ÖV-Angebot und bei vorhandener Haltestelle der Haltestellentyp (Auswahl je Stadt).

**Automatische Befüllung und Herkunft.** Wo Daten vorliegen, werden die Felder beim Laden automatisch gefüllt. Ein kleiner **Chip** am Feld zeigt die Herkunft des Werts:

- **Geoportal** (Geoinformation Stadt Bern, blau),
- **OSM** (OpenStreetMap, grau),
- **opentransportdata** (Fahrplan, für den Bus-Takt, grün),
- kein Chip, sobald das Feld manuell geändert wurde.

Leere Pflichtfelder zeigen „Eingabe nötig".

**Karten-Hilfen.** Mehrere Abschnitte sind auf der Karte **nummeriert** (passend zu „Abschnitt 1/2/3" im Rechner). Beim Überfahren einer Abschnittskarte mit der Maus werden die zugehörigen Segmente hervorgehoben — so lassen sich automatisch befüllte Werte gezielt pro Abschnitt prüfen und korrigieren. ÖV-Haltestellen erscheinen als Marker. Die Linienfarben zeigen die Ist-Führungsform (aus OSM).

**Wann erscheint die Note?** Erst wenn die nötigen Felder gefüllt sind: **DTV, Tempo, Führungsform und Breite** — ausser bei **Mischverkehr**, das keine Breiten-Vorgabe hat (dort entfällt das Breite-Feld). Bis dahin steht „Eingabe nötig". Solange ein Abschnitt unvollständig ist, bleibt auch die Strecken-Note offen.

**Strecken-Note.** Die Strecke erhält die Note ihres **schlechtesten Abschnitts**. Angezeigt werden jede Abschnitts-Note einzeln, die Strecken-Note und der massgebende (schlechteste) Abschnitt.

**CSV-Export.** „Als CSV exportieren" lädt alle Abschnitte mit Eingaben, Herkunft, Soll-Führungsform, Note und den OpenBikeSensor-Überholabständen als `.csv` herunter.

---

## Bewertung (Methodik)

### 1. Soll-Führungsform

Welche Führungsform ist vorgesehen? Quelle: **Masterplan Veloinfrastruktur Stadt Bern (Okt. 2025), S. 11** — Entscheidung über DTV MIV × zulässige Höchstgeschwindigkeit:

```
DTV MIV \ km/h     ≤ 30           31–40         41–50               51–80
< 2'000            Mischverkehr   Radstreifen   Radstreifen         Radweg
2'000–5'000        Radstreifen    Radstreifen   Radweg              Radweg
5'000–10'000       Radstreifen oder Radweg (Übergang)               Radweg
> 10'000           Radweg         Radweg        Radweg              Radweg
```

Implementiert in `fuehrungsart(dtv, v)`.

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

**Rundung:** Die Note wird **immer auf die nächste 0,5 gerundet** (1,0 · 1,5 · 2,0 … 6,0). Gerundet wird kaufmännisch — genau zwischen zwei Stufen wird **aufgerundet** (z. B. 4,25 → 4,5; 4,24 → 4,0; 4,75 → 5,0). Die Rundung erfolgt **einmalig auf die Endnote** (nach dem Breiten-Abzug); alle Zwischenwerte bleiben ungerundet (`roundToHalf` = `Math.round(x · 2) / 2`).

#### Grundidee

Die Note misst, **wie nahe die subjektive Sicherheit der vorhandenen (Ist-)Form an das herankommt, was die empfohlene (Soll-)Form im selben Tempo-Kontext bieten würde.** Ist die vorhandene Form mindestens so stark vom Autoverkehr getrennt wie gefordert → beste Note. Liegt sie darunter, sinkt die Note proportional zum empirisch gemessenen *feel-safe*-Defizit.

Warum feel-safe? Die Soll-Wahl sagt nur, **welche** Form geeignet *wäre*. Wie viel eine schwächere Form an gefühlter Sicherheit kostet, lässt sich nicht aus der Tabelle ableiten — dafür dient die radwege-check-Befragung (FixMyCity).

#### Was ist feel-safe %?

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

1. **Empfohlene Form bestimmen** aus DTV und Tempo (`fuehrungsart`, Kap. 1). Beispiel:
   DTV 3'000 / 50 km/h → Soll = *Radweg*.
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
6. **Defizit in eine Note umrechnen:** `Note = 6 − Defizit / 14,4` (auf 1…6 begrenzt, auf 0,5 gerundet). Pro 14,4 fehlende feel-safe-Punkte eine ganze Notenstufe — Herleitung siehe unten.

#### Empirische Anker (feel-safe %, verifiziert)

radwege-check / FixMyCity, Velo-Perspektive, **tram-bereinigt**. Werte **unabhängig aus den Einzelantworten nachgerechnet** (`tools/verify_06.py`; Kreuzvalidierung gegen den offiziellen `voteScore`, ø 1,8 Punkte), je Tempo-Kontext, grosse Fallzahlen (N je Wert ≈ 3'000–27'000):

> **tram-bereinigt:** Befragungs-Szenen mit Tram (Schienen in der Fahrbahn) sind ausgeschlossen.
> Tramschienen senken das Sicherheitsempfinden unabhängig von der Veloanlage (Sturzrisiko,
> Spurrillen) und würden die feel-safe-Werte der Führungsformen sonst verzerren. Ausgeschlossen
> über das Szenen-Merkmal `FS-Art = Tram`.

```
                       ruhig (V ≤ 30)   schnell (V > 30)
Mischverkehr                 26               18
Radstreifen                  74               69
Radweg (baulich getrennt)    92               90
```

Zuordnung der Ist-Formen zu den Befragungsdaten:

- **Mischverkehr** → keine Radverkehrsanlage.
- **Radstreifen** → markierter Streifen auf der Fahrbahn (über alle Breiten gemittelt; 3,5 m liegt deutlich höher als 2,0 m, siehe [Offene Punkte](#offene-punkte)).
- **Radweg** → baulich getrennt, angesetzt auf dem robusten Poller-/Trennungs-Niveau (≈ 91, kaum tempoabhängig). Dieser Wert gilt für **alle baulich getrennten Formen**: den *strassenbegleitenden Radweg / geschützten Radstreifen* (beide werden gleich behandelt) **und** den *abgesetzten Radweg* (Q3). *Hinweis:* In Berliner Daten liegen abgesetzte Seitenraum-Radwege tiefer (≈ 77, Konflikte mit Geschäften/Gastronomie im Seitenraum); dieser Abschlag wird **bewusst nicht** übernommen, da Berns abgesetzte Radwege deutlich weniger durch Seitenraum-Nutzungen geprägt sind. Q2 und Q3 unterscheiden sich daher nur in der Breitenvorgabe, nicht im feel-safe-Wert.

#### Warum 14,4 Punkte pro Notenstufe?

Die grösste mögliche Abweichung ist **Soll Radweg / Ist Mischverkehr bei hohem Tempo**:
Defizit = 90 − 18 = **72 Punkte**. Verteilt auf die **5 Notenstufen** von 6 bis 1 ergibt das 72 / 5 = **14,4 Punkte pro Stufe** — so entspricht genau dieser ungünstigste Fall der Note 1 (`SCORE_PRO_NOTE`, tunbar).

#### Warum kontext-sensitiv nach Tempo?

Dieselbe Fehlentscheidung wiegt bei hohem Tempo schwerer:

- **Empirisch** kostet höheres Tempo *ohne* Separation am meisten (Mischverkehr Tempo 30 → 50: −9; die Verkehrsmenge wirkt nur etwa halb so stark, −5). Baulich getrennte Formen bleiben dagegen kontext-robust (≈ 0).
- **Im Modell** wirken DTV und Tempo an unterschiedlichen Stellen:
  - das **DTV** bestimmt (zusammen mit dem Tempo), *welche* Führungsform vorgesehen ist — über die Soll-Tabelle (Kap. 1);
  - das **Tempo** beeinflusst *zusätzlich*, *wie stark* eine zu schwache Form abgewertet wird — weil die feel-safe-Werte der Formen tempoabhängig sind (Spalten „ruhig"/„schnell" in der Anker-Tabelle).

  So fliesst das Tempo **zweifach** ein (in die Soll-Wahl *und* in die Abzugshöhe), das DTV nur in die Soll-Wahl.

→ Eine zu schwache Form bei hohem Tempo wird stärker abgewertet als dieselbe bei tiefem Tempo.

#### Durchgerechnetes Beispiel

Abschnitt: **DTV 3'000 · 50 km/h · Ist = Radstreifen**

```
Soll      = fuehrungsart(3000, 50)             = Radweg        (DTV 2'000–5'000, V > 40)
Ist < Soll (Radstreifen < Radweg)              → Abzug
Tempo     = schnell                            (50 > 30)
Zielscore = feel-safe(Radweg, schnell)         = 90
Defizit   = 90 − feel-safe(Radstreifen,schnell)= 90 − 69 = 21
Note      = 6 − 21 / 14,4 = 6 − 1,46 = 4,54    → 4,5
```

#### Resultierende Noten

Bei Tempo > 30 (schnell):

```
Soll \ Ist                Mischverkehr   Radstreifen   Radweg
Radstreifen                   2.5            6.0         6.0
Radstreifen oder Radweg       1.5            5.5         6.0
Radweg                        1.0            4.5         6.0
```

Bei Tempo ≤ 30 (ruhig) fallen dieselben Abweichungen milder aus:

```
Soll \ Ist                Mischverkehr   Radstreifen   Radweg
Radstreifen                   2.5            6.0         6.0
Radstreifen oder Radweg       2.0            5.5         6.0
Radweg                        1.5            5.0         6.0
```

### 3. Breiten-Abzug und Parkierung

Nach der Führungsform-Note wird die **Breite** der Anlage gegen die Masterplan-Regelbreiten geprüft. Massgeblich ist je nach Routentyp **Optimal** (Velohauptroute) oder **Minimal** (Veloroute):

```
Ist-Form (Querschnittstyp)        Optimal   Minimal
Radstreifen                  Q1     2.50      1.80
Radweg strassenbegl. / Gesch. Radstreifen  Q2  2.50   1.80
Radweg abgesetzt                           Q3  2.50   1.50
Umweltspur (Bus+Velo)        Q4     4.50      3.75   (DTV/Tempo n.r.; siehe Bus-Takt)
Velostrasse                  Q9     Band 4.50–6.50 m (Min u. Max, beide Routentypen; nur Tempo 30)
Fussweg Velo gestattet       Q12    3.50      3.50   (DTV/Tempo n.r.; Mischfläche, max. Note 4)
Mischverkehr                 Q6     –         –      (keine Breitenvorgabe)
```

**Abzug (Variante A, linear, datengestützt):**

```
Sollbreite   = Optimal (Velohauptroute) bzw. Minimal (Veloroute)
Defizit_m    = max(0, Sollbreite − Ist-Breite)
Breitenabzug = Defizit_m × 0,9        (Notenstufen pro fehlendem Meter)
Endnote      = runde_0,5( Führungsform-Note − Breitenabzug , begrenzt 1…6 )
```

##### Herleitung der 0,9 Notenstufen pro Meter

Der Abzug ist kein gesetzter Schwellenwert, sondern skaliert **linear** aus dem empirisch gemessenen Breiten-Effekt auf die gefühlte Sicherheit:

```
1. Empirie:  Radstreifen 2,0 → 3,5 m (= 1,5 m mehr)  =  +20 feel-safe-Punkte
             (verifizierter Breitenmittelwert, tools/verify_06.py)
2. pro Meter Breite:        20 ÷ 1,5            ≈  13,3 feel-safe-Punkte / m
3. eine Notenstufe:                                14,4 feel-safe-Punkte   (SCORE_PRO_NOTE)
4. Abzug pro Meter Breite:  13,3 ÷ 14,4         ≈  0,9 Notenstufen / m     (NOTE_PRO_METER)
```

**Vorbehalte:**

- **Scheingenauigkeit:** Die Daten liefern nur **zwei** Breiten-Stützpunkte (2,0 und 3,5 m). Der +20-Effekt über diese 1,5 m ist belegt, die Linearität auf Zentimeter-Ebene ist eine Modellannahme (Interpolation).
- **Rundung relativiert kleine Defizite:** Da die Endnote auf 0,5 gerundet wird, kippt eine Stufe erst ab ≈ 0,28 m Defizit (Abzug > 0,25); kleine Defizite wirken nur kumulativ oder an einer Rundungsgrenze.

Tunbar über `NOTE_PRO_METER`.

**Beispiel** (Fortsetzung: DTV 3'000 / 50 km/h / Ist Radstreifen → Form-Note 4,5):

```
Velohauptroute, Radstreifen, Breite 1,80 m
  Sollbreite   = Optimal 2,50 m
  Defizit      = 2,50 − 1,80 = 0,70 m
  Breitenabzug = 0,70 × 0,9 = 0,63
  Endnote      = 4,5 − 0,63 = 3,87 → 4,0
```

Bei erfüllter Breite (Ist ≥ Vorgabe) gibt es keinen Abzug.

#### Parkierung rechts (Dooring)

Wo das Velo **auf der Fahrbahn neben möglichem Längsparken** fährt, kann angegeben werden, ob rechts längs geparkt wird (Dooring-Lage). Das betrifft die Fahrbahn-Führungsformen **Mischverkehr, Radstreifen, Velostrasse und Umweltspur** (Konstante `PARKEN_RELEVANT` in [`VeloroutenCheckWeb/src/fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts)); bei baulich abgesetzten Radwegen und beim Fussweg greift der Dooring-Mechanismus nicht, dort wird das Feld nicht angezeigt. Auswahl **Ja / Nein / Egal**:

- **Ja** → **−1,0 Notenstufe** (damit nie Note 6, sobald Parken rechts vorhanden ist).
- **Nein / Egal** → kein Abzug.

**Herleitung des −1,0** (verifizierte radwege-Werte, Radstreifen, ungeschützt, tram-bereinigt):

```
kein Parken                         75,9 %   (N ≈ 6'800)
Parken rechts vom Velo (Dooring)    61,4 %   (N ≈ 16'800)
Differenz                          −14,5 feel-safe-Punkte
−14,5 ÷ 14,4 Pkt/Notenstufe       ≈ −1,0 Notenstufe
```

**Wichtig:** Der Wert ist empirisch **am Radstreifen** kalibriert und wird auf die übrigen Fahrbahn-Führungsformen **bewusst gleich** angewandt — für diese Konstellationen liegt kein eigener verifizierter Koeffizient vor, das Dooring-Risiko besteht aber auch dort.

Zum Vergleich: liegt das Velo **rechts vom Parken** (Parken schirmt vom Verkehr ab), steigt der Wert auf ≈ 92 %; diese günstige Lage ist im Datensatz aber nur schwach belegt (6 Szenen) und derzeit nicht als eigene Option umgesetzt. Parameter `PARKEN_RECHTS_ABZUG`, tunbar.

#### Tram in der Fahrbahn

Liegen **Tramschienen in der Fahrbahn**, sinkt das Sicherheitsempfinden unabhängig von einer Haltestelle (Sturzrisiko, Spurrillen). Das Feld „Tram in der Fahrbahn" ist daher **von der Haltestelle entkoppelt** und wird automatisch aus dem Geoportal (`oevTram`) gesetzt. Der Malus greift **nur bei Mischverkehr** (wo das Velo die Fahrbahn mit den Gleisen teilt); bei eigener Radverkehrsanlage ist der Effekt empirisch ~0.

**Herleitung** (verifizierte radwege-Werte, Mischverkehr, mit vs. ohne Tram):

```
                    feel-safe ohne Tram   feel-safe mit Tram   Δ        Malus (Δ/14,4)
Tempo 30                  26,3 %               14,4 %         11,9     ≈ 0,8
Tempo 50                  17,7 %                9,7 %          8,0     ≈ 0,55
(N je Zelle ≈ 900–2'900)
```

→ **tempo-abhängiger Abzug −0,8 (Tempo ≤ 30) / −0,55 (Tempo > 30)**, nur Mischverkehr. Konstante `TRAM_MALUS`, tunbar. Vollständiger Rechenweg und Reproduktion: `tools/verify_06.py` (§2) bzw. `docs/07_Tram_in_der_Fahrbahn.md`.

### 4. Sonderfälle (Umweltspur, Velostrasse, Fussweg)

#### Umweltspur (Q4, Bus+Velo)

DTV und Tempo sind **nicht massgebend**, sondern der **Bus-Takt** (zusätzliches Feld öV-Takt [Min]) und die Breite.

- **Takt < 7,5 Min** (hohe Busfrequenz) → **Note 1** mit Hinweis (zu viele Busse für eine gemeinsame Spur mit dem Velo).
- **Takt ≥ 7,5 Min** → zulässig: höchstens **Note 4 («genügend»)** als Basis, davon der
  Breiten-Abzug (× 0,9; Vorgabe Optimal 4,50 m / Minimal 3,75 m).

> Datenlage: FixMyCity enthält praktisch keine Umweltspur-Szenen (nur 2 Bus-Szenen) → Note 4 und
> Takt-Schwelle 7,5 Min sind **normativ gesetzt**. Parameter `UMWELTSPUR_BASIS`,
> `UMWELTSPUR_MIN_TAKT`, tunbar.

#### Velostrasse (Q9)

Nur **bei Tempo 30** zulässig; sonst entspricht die Führungsform nicht den Vorgaben → **Note 1** mit Hinweis. Bei Tempo 30 gilt die Form als erfüllt (Basis-Note 6); anschliessend wirkt die Breite. Die Breite ist ein **Band 4,50–6,50 m** (Min und Max, identisch für beide Routentypen): Abzug bei zu schmal (< 4,50 m) *oder* zu breit (> 6,50 m), je `Abweichung × 0,9`.

#### Fussweg Velo gestattet (Q12)

Mischfläche Fuss/Velo, Kompromiss-/Restlösung → höchstens **Note 4 («genügend»)**, davon Breiten-Abzug (Vorgabe ≥ 3,50 m, beide Routentypen). Die situativen **Voraussetzungen** werden als Hinweis-Checkliste angezeigt (kein Noteneinfluss): erhöhtes Schutzbedürfnis Velo (z. B. Schulwege), geringe Fuss-/Velofrequenz, Steigung oder kein Gefälle, etablierte/konfliktarme Situation, ausreichende Breite (≥ 3,50 m), fehlende Alternativen; zusätzlich der Hinweis: **bei Gefälle besondere Vorsicht** (hohe Differenzgeschwindigkeit Velo ↔ Fuss). Normativ (keine FixMyCity-Daten für Mischflächen verwendet).

### 5. Haltestellen (ÖV)

Zum Abschnitt gehört der Umgang mit **ÖV-Haltestellen**. Eingabe **ÖV-Angebot**: keine Haltestelle / Bus ≥ 15 Min / Bus 5–15 Min / Bus < 5 Min / Tram; bei vorhandener Haltestelle zusätzlich der **Haltestellentyp**.

**Soll-Veloverkehrslösung** (aus dem Masterplan-Diagramm, S. 63):

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
HS1  Haltestelle mit Veloumfahrung       Separate Velofläche  1.8–2.5   1.6
HS2  Kaphaltestelle mit Veloüberfahrt    Separate Velofläche  1.8       1.5
HS3  Kaphaltestelle (Ausnahme)           Mischverkehr         –         –
HS4  Haltestelle mit rückw. Radweg       Separate Velofläche  1.8–2.5   1.6
HS5  Inselhaltestelle                    Separate Velofläche  2.5       1.5
HS6  Fahrbahnhaltestelle Bus             Mischverkehr         –         –
HS7  Busbucht                            Mischverkehr         –         –
```

**Noteneinfluss (zwei unabhängige Abzüge):**

- **Einsatzbereich:** Abzug **−1,0**, wenn die Soll-Lösung *Separate Velofläche* verlangt, der vorhandene Typ aber aus der **Mischverkehr-Familie** (HS3/HS6/HS7) stammt. Über-Erfüllung und der Übergangsbereich geben keinen Abzug.
- **Breite der Veloführung an der Haltestelle:** nur bei HS1/HS2/HS4/HS5. Zu schmal → Abzug
  `Defizit_m × 0,9` (gleicher Satz wie die Führungsform-Breite).

> Normativ: zu Haltestellen gibt es keine FixMyCity-Daten → Schwellen aus dem Masterplan bzw.
> gesetzt. Parameter `HALTESTELLE_ABZUG` und `NOTE_PRO_METER`, tunbar.

---

## Datenquellen und Herkunft

Beim Laden werden die OSM-Segmente, wo verfügbar, automatisch mit weiteren Quellen **angereichert** (Felder werden vorausgefüllt, nicht ersetzt). Welche Quelle welches Feld füllt:

| Datensatz | Layer / Feld | Befüllt | Einschränkung |
|---|---|---|---|
| [Flächendeckende Verkehrsdaten](https://opendata.swiss/de/dataset/flachendeckende-verkehrsdaten) | `Verkehr_Strasse` (`Nt`, `Nn`) | DTV MIV | nur Strassen mit DTV > 2'000 Mfz/Tag bzw. Stadtteil 1 Altstadt; „nur eine Grössenordnung, keine verbindlichen Zählresultate" |
| [Signalisierte Höchstgeschwindigkeit](https://opendata.swiss/de/dataset/signalisierte-hochstgeschwindigkeit) | `V_sig` | Zulässige Höchstgeschwindigkeit | — |
| [Veloroutennetz Masterplan](https://opendata.swiss/de/dataset/veloroutennetz-masterplan-veloinfrastruktur-2020) | `Velorouten_beschrieb` | Routentyp (Velohauptroute/Veloroute) | nur auf dem Masterplan-Netz |
| [Velostrassen](https://opendata.swiss/de/dataset/velostrassen) | `Velostrasse` (Name) | Ist-Führungsform = Velostrasse | nur 7 Strassen (Stand 2026) |
| Haltestellen + OeV_Linien | `Punktname` / `Id_opendata` / `Verkehrsmittel_typ` | ÖV-Angebot (Tram + Bus-Band), Haltestellen-Marker | **Haltestellentyp** (HS1–7) nicht in den Daten → manuell |
| GTFS Fahrplan (opentransportdata.swiss) | Bus-Abfahrten 17–18 h je Haltestelle (BPUIC) | Bus-Takt → ÖV-Angebot-Band | gebündelter Snapshot (`VeloroutenCheckWeb/public/oev_takt_bern.json`, via `tools/oev_takt.py`) |

### Geoportal und OSM

OpenStreetMap (Overpass API) liefert die Geometrie, den Strassennamen und — wo getaggt — Tempo (`maxspeed`), Breite (`width`/`cycleway:*:width`) und die Ist-Führungsform. Die Geoportal-Layer der Stadt Bern (`map.bern.ch`, ArcGIS REST, GeoJSON) werden **live** dazugeladen (bei jedem „Strasse laden" / „Segmente im Kartenausschnitt laden") — bewusst so, damit die Daten automatisch aktuell bleiben. Schlägt ein einzelner Layer fehl (z. B. Server kurz nicht erreichbar), wird er übersprungen und der Import läuft mit den übrigen Quellen weiter. Die Strassensuche ist gross-/kleinschreibungsunabhängig (`jungfraustrasse` = `Jungfraustrasse`).

**Zuordnung OSM ↔ Geodaten (Überlappung statt Nähe).** Jedes OSM-Segment wird dem Bern-Feature zugeordnet, das tatsächlich *entlang* des Segments verläuft — gemessen am Anteil der (verdichteten) Segmentpunkte innerhalb 20 m der Feature-Linie (≥ 50 %; Velostrassen strenger mit ≥ 60 %, da sie die Ist-Führungsform setzen). Das verhindert, dass eine bloss **kreuzende** Strasse fälschlich zugeordnet wird (was eine reine Mittelpunkt-/Nächste-Punkt-Suche z. B. bei der Jungfraustrasse tat, wo Tempo/DTV/Routentyp dadurch leer blieben oder von der Querstrasse stammten). Implementiert in [`VeloroutenCheckWeb/src/geo.ts`](VeloroutenCheckWeb/src/geo.ts).

**Vorrang Geoportal > OSM.** Liegt ein Wert sowohl amtlich als auch aus OSM vor (z. B. Tempo), gilt der amtliche Wert. Die Herkunft ist nach dem Übernehmen feldweise am Chip erkennbar (siehe [Bedienung](#bedienung)).

**DTV-Formel.** Das Live-Service liefert kein `DTV`-Feld (das existiert nur im Datei-Export GDB/GPKG der Stadt Bern), sondern `Nt`/`Nn` — die Verkehrsmenge in der Tagstunde (06–22 Uhr, 16 h) bzw. Nachtstunde (22–06 Uhr, 8 h). Daraus:

```
DTV = round(16 × Nt + 8 × Nn)
```

Empirisch per Least-Squares-Regression gegen einen GeoPackage-Export hergeleitet (1186 Segmente, max. Abweichung 1,2 Fahrzeuge, Mittel 0,42) und cross-validiert gegen die Jahresauswertung der Messstelle Thunstrasse 100 (gemessen 17'191, Formel 17'190).

### ÖV: Haltestellen, Linien und Fahrplan-Takt

Der Layer **Haltestellen** (Punkte) liefert, wo Haltestellen liegen (Marker auf der Karte), der Layer **OeV_Linien** den Modus entlang des Segments (`Verkehrsmittel_typ`). Verläuft eine **Tram**-Linie entlang und liegt eine Haltestelle im Abschnitt, wird das **ÖV-Angebot automatisch auf „Tram"** gesetzt.

Für **Bus** wird zusätzlich der **Takt aus dem Fahrplan** bestimmt: Das Skript [`tools/oev_takt.py`](tools/oev_takt.py) verdichtet das Schweizer **GTFS** (opentransportdata.swiss) offline zu `VeloroutenCheckWeb/public/oev_takt_bern.json` (`{ BPUIC → Bus-Fahrten/h }`). Gezählt werden Bus-Abfahrten in der **Abendspitze 17:00–18:00** an einem repräsentativen Werktag (Di), in der **stärksten (meistbefahrenen) Einzelrichtung** — nicht beide Richtungen summiert (die zwei Richtungs-Quays teilen sich dieselbe **BPUIC**, gleich der Haltestellen-`Id_opendata`, dem Join-Schlüssel). Daraus das Frequenzband: ≤ 4/h → `bus_ab15`, 5–12/h → `bus_5_15`, > 12/h → `bus_unter5`; das ÖV-Angebot wird automatisch gesetzt (Chip „opentransportdata"). Snapshot — bei neuem Fahrplan `oev_takt.py` erneut ausführen.

**Warum Geoportal + GTFS statt OSM:** OSM kennt zwar Linien und Haltestellen, aber **keinen Takt** (Frequenz gibt es nur im Fahrplan); die Haltestellen-`Id_opendata` ist der saubere Fahrplan-Join, während OSM-Routenrelationen aufwendiger und der DiDok-Bezug dort uneinheitlich wären. Der bauliche **Haltestellentyp** (HS1–7) steht in keiner Quelle → bleibt manuell.

### OpenBikeSensor (gemessene Überholabstände)

Wo vorhanden, werden je Abschnitt **gemessene Überholabstände** angezeigt (Median, Anteil unter 1,5 m gesetzlichem Mindestabstand, Anzahl Messungen, Befahrungen). Quelle ist ein Export aus dem [OpenBikeSensor-Portal](https://portal.openbikesensor.org/), als gebündelter Snapshot **pro Stadt** abgelegt (`VeloroutenCheckWeb/public/obs_bern.json`, `obs_zurich.json`) und client-seitig nachgeschlagen — kein Live-Bezug. Welche Datei geladen wird, bestimmt die Stadt-Auswahl (Städte ohne Snapshot, z. B. Basel, zeigen keine OBS-Werte). Aktualisierung: Datei durch einen neuen Portal-Export ersetzen.

**Zuordnung über Geometrie statt `way_id`.** OBS nutzt einen eigenen OSM-Schnappschuss und teilt lange Strassen in feinere Mess-Abschnitte; ausserdem werden OSM-Ways laufend geteilt/neu nummeriert. Ein reiner `way_id`-Join verfehlt darum Teilstücke (Beispiel: von 12 OBS-`way_id`s der Schosshaldenstrasse existiert eine nicht mehr im aktuellen OSM). Deshalb wird jedes OBS-Teilstück per **Überlappung** ([`VeloroutenCheckWeb/src/geo.ts`](VeloroutenCheckWeb/src/geo.ts)) genau dem am besten passenden OSM-Segment zugeordnet und alle Teilstücke eines Segments werden zusammengeführt (Median/Mittel aus dem kombinierten Messwert-Array, Anzahlen summiert) — schnappschuss-unabhängig und pro Segment.

**Befahren ohne Überholung sichtbar.** Hat ein Segment OBS-Befahrungen, aber keine aufgezeichnete Überholung (`overtaking_event_count` = 0), wird das ausgewiesen („befahren (n Befahrungen), aber keine Überholmessung aufgezeichnet") statt nichts anzuzeigen.

Die Überholabstände sind **reine Zusatzinformation** und fliessen **nicht** in die Führungsform-Note ein.

### Weitere Städte (Zürich, Basel, Luzern)

Über die **Stadt-Auswahl** im Lade-Bereich lassen sich neben Bern auch **Zürich**, **Basel** und **Luzern** wählen. Stadtspezifisch sind sowohl die **Datenquellen** für die Anreicherung als auch die **Bewertungsvorgaben**:

- **Soll-Führungsform** (Wahl aus DTV × Tempo): jede Stadt hat ihre eigene Entscheidungstabelle (`fuehrungsart(dtv, v, stadt, …)`). Bern und Luzern DTV-basiert (Luzern mit feineren Stufen und der Übergangsklasse «Mischverkehr oder Radstreifen»), Zürich je Routentyp, **Basel strassentyp-basiert** (verkehrs- vs. siedlungsorientiert). Die feel-safe-Anker sind stadtübergreifend.
- **Breiten-Sollwerte**: je Stadt eigene Standardmasse (alle nicht abgedeckten Fälle → Bern-Fallback je Feld).
- **Haltestellen**: Typen, Familien und Soll-Lösung je Stadt (Bern/Luzern Takt×Route, Luzern ohne Tram; Zürich/Basel ohne automatischen Abzug — nur Typ-Auswahl + Breite).

Die **Herkunft jeder Vorgabe** steht im Rechner beim Abschnitt; das massgebende Grundlagendokument der Stadt ist im Lade-Bereich verlinkt. Die Referenz-Entscheidungstabellen unten im Rechner zeigen die **Berner** Tabelle (mit Notiz). Jede Stadt ist ein eigener Adapter ([`zurich.ts`](VeloroutenCheckWeb/src/zurich.ts), [`basel.ts`](VeloroutenCheckWeb/src/basel.ts), [`luzern.ts`](VeloroutenCheckWeb/src/luzern.ts)), der die Schnittstellen von `bern.ts` spiegelt; gemeinsame Helfer (geometrisches Matching, ÖV aus OSM) liegen in [`cityShared.ts`](VeloroutenCheckWeb/src/cityShared.ts). Der Adapter `stgallen.ts` existiert noch, St. Gallen ist aber **derzeit nicht auswählbar** (nicht weiterverfolgt).

#### Zürich

| Feld | Quelle Zürich | Hinweis |
|---|---|---|
| Geometrie, Name, Tempo, Ist-Führungsform | **OSM** | stadtneutral, identisch zu Bern |
| Breite | **OSM** (selten) | nur bei `cycleway:*:width`-Tag → de facto **meist manuell** |
| **Routentyp** | **Velonetzplanung** (WFS `view_velonetz`, live) | Zuordnung geometrisch; Mapping siehe unten |
| Tram in der Fahrbahn, Haltestelle im Abschnitt | **OSM** (`railway=tram`, `public_transport`) | Herkunft daher *OSM* |
| **DTV MIV** | — *(manuell)* | keine offene flächendeckende Quelle; nur ~100 DAV-Zählstellen (Punktmessungen) → späterer Baustein |
| **Bus-Takt** (ÖV-Angebot-Band) | — *(manuell)* | OSM kennt keinen Takt, OSM→GTFS-Join offen → späterer Baustein |

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



#### Basel

Routentyp live aus dem **Teilrichtplan Velo** (WFS `wfs.geo.bs.ch`, Bestandsnetz mit den Flags `tv_pendlerroute`/`tv_basisroute`). Zusätzlich setzt der **Velostadtplan** (data.bs.ch, `gml_id=Velostrasse`, 87 Segmente) die **Ist-Führungsform = Velostrasse**, analog Berns Velostrassen-Layer. **Strassentyp** und **signalisierte Höchstgeschwindigkeit** kommen amtlich aus dem Datensatz **„Strassen und Wege"** (data.bs.ch, Dataset `100250`, Felder `strassenkategorie` / `geschwindigkeit`, geometrisch zugeordnet) — der Strassentyp ist für die Basler Soll-Wahl massgebend (verkehrs- vs. siedlungsorientiert), das Tempo hat als amtliche Quelle Vorrang vor OSM (nur reale Werte 20–60; 0/5 = Fussgängerzone/Schritttempo werden ignoriert). Übrige Ist-Führungsform aus OSM; Breite aus OSM nur bei seltenem `cycleway:*:width`-Tag (de facto meist manuell); Tram/Haltestelle aus OSM; DTV und Bus-Takt manuell. Die „Eignung" des Velostadtplans („gut befahrbares Velonetz") ist eine Komfortbewertung und wird **nicht** als Routentyp übernommen.

**Soll-Führungsform Basel.** Nicht DTV-, sondern **strassentyp**-basiert (× Routentyp): siedlungsorientierte Strasse → Mischverkehr (Velostrassen-Ausgestaltung, DWV-Deckel); verkehrsorientierte Strasse → Vorzugsroute «Radstreifen oder Radweg», Pendler-/Basisroute «Radstreifen» (`fuehrungsartBasel`). Der **Strassentyp** ist im Rechner ein eigenes Feld (nur bei Basel sichtbar, amtlich vorbefüllt) und für die Bewertung erforderlich.

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


#### Luzern

Routentyp live aus dem städtischen **Velonetz** (ArcGIS REST `map.stadtluzern.ch`, Layer 7, Feld `VELO_ROUTENTYP`). Tempo und Ist-Führungsform aus OSM; Breite aus OSM nur bei seltenem `cycleway:*:width`-Tag (de facto meist manuell); ÖV aus OSM — **Luzern hat kein Tram**, nur Bus → praktisch nur „Haltestelle vorhanden"; DTV/Bus-Takt manuell.

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

### Datenlizenzen und Quellenangaben

| Quelle | Verwendung | Bezug | Lizenz / Quellenangabe |
|---|---|---|---|
| **OpenStreetMap** | Geometrie, Name, teils Tempo/Breite/Ist-Führungsform | [Overpass API](https://overpass-api.de/) (live) | **ODbL** — „© OpenStreetMap-Mitwirkende", Attribution Pflicht |
| **Stadt Bern Geoportal** (Flächendeckende Verkehrsdaten, Signalisierte Höchstgeschwindigkeit, Veloroutennetz Masterplan, Velostrassen, Haltestellen, OeV_Linien) | DTV, Tempo, Routentyp, Velostrasse, ÖV (Tram/Haltestellen) | [opendata.swiss](https://opendata.swiss/) / `map.bern.ch` (ArcGIS REST, live) | **„Freie Nutzung. Quellenangabe ist Pflicht."** — Quellenangabe: „Geodaten Stadt Bern" |
| **Stadt Zürich Velonetzplanung** | Routentyp (Zürich) | OGD Stadt Zürich, WFS `ogd.stadt-zuerich.ch` (`view_velonetz`, live) | **Open Government Data** — Quellenangabe: „Stadt Zürich" |
| **Teilrichtplan Velo + Velostadtplan Basel-Stadt** | Routentyp + Velostrasse (Basel) | OGD Kanton Basel-Stadt, WFS `wfs.geo.bs.ch` + data.bs.ch (live) | **Open Government Data** — Quellenangabe: „Geodaten Kanton Basel-Stadt" |
| **Strassen und Wege Basel-Stadt** (Dataset `100250`) | Strassentyp + signalisierte Höchstgeschwindigkeit (Basel) | OGD Kanton Basel-Stadt, data.bs.ch (live) | **Open Government Data** — Quellenangabe: „Geodaten Kanton Basel-Stadt" |
| **Velonetz Stadt Luzern** | Routentyp (Luzern) | OGD Stadt Luzern, ArcGIS REST `map.stadtluzern.ch` (live) | **Open Government Data** — Quellenangabe: „Geodaten Stadt Luzern" |
| **GTFS Fahrplan** | Bus-Takt (Abendspitze) → ÖV-Angebot-Band | [opentransportdata.swiss](https://opentransportdata.swiss/), Snapshot `VeloroutenCheckWeb/public/oev_takt_bern.json` | Open data — opentransportdata.swiss |
| **OpenBikeSensor** | Gemessene Überholabstände (Info, nicht in der Note) | Portal-Export, Snapshots `VeloroutenCheckWeb/public/obs_bern.json`, `obs_zurich.json` | „© OpenBikeSensor-Mitwirkende" |
| **CyclOSM** | Kartenhintergrund | Tile-Server (live) | © OpenStreetMap-Mitwirkende · Stil: CyclOSM |

Die Pflicht-Attributionen werden in der App angezeigt: die Karten-Attribution (OSM/CyclOSM) unten rechts auf der Karte, die Herkunft der übrigen Werte über die Feld-Chips und die Status-/Lade-Meldung.

---

## Offene Punkte

- **Parken × Breite verfeinern:** der Breiten-Effekt ist mit Parken deutlich stärker (≈ 1,16 statt ≈ 0,5 Noten/m) — den Breiten-Abzug parken-abhängig machen statt fixem Parken-Abzug (Daten 06, §4).
- **«Velo rechts vom Parken»** als eigene, bessere Parken-Lage aufnehmen (empirisch ≈ 92, aber nur 6 Szenen → erst mit besserer Datenlage).
- **Velostrasse «zu breit»:** der Abzug über der Maximalbreite (6,50 m) ist normativ gesetzt (gleicher Satz wie «zu schmal») — bei Bedarf eigener Satz/Schwelle.
- **«Radweg abgesetzt» (Q3):** In Berliner Daten tiefer (Seitenraum ≈ 77) als Poller-Niveau (≈ 91). Dieser Abschlag wird **bewusst nicht** angewandt (Berns Seitenraum ist weniger durch Geschäfte/Gastronomie geprägt als Berlins); Q3 trägt denselben feel-safe-Wert wie Q2 und unterscheidet sich nur in der Minimalbreite (1,50 m). Bei künftigen Berner Auswertungen überprüfen.
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
| [`VeloroutenCheckWeb/src/geo.ts`](VeloroutenCheckWeb/src/geo.ts) | Geometrie-Helfer (Überlappungs-Matching) |
| [`VeloroutenCheckWeb/src/fuehrungsform.test.ts`](VeloroutenCheckWeb/src/fuehrungsform.test.ts) | Vitest-Tests der Bewertungslogik (`npm test`) |
| [`tools/oev_takt.py`](tools/oev_takt.py) | GTFS → `VeloroutenCheckWeb/public/oev_takt_bern.json` (Bus-Takt, offline) |
| [`tools/verify_06.py`](tools/verify_06.py) | Nachrechnung der feel-safe-Anker (Reproduzierbarkeit, siehe unten) |

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
