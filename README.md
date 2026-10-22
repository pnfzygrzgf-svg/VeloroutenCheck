# VeloroutenCheck

VeloroutenCheck bewertet die Qualität von Veloinfrastruktur mit einem **Erfüllungsgrad** von **Gar nicht erfüllt** bis **Vollständig erfüllt**; dahinter steht jeweils die **Schulnote von 1 bis 6**, aus der er entsteht. Grundlage sind zwei Quellen:

- die **Veloinfrastruktur-Standards der jeweiligen Stadt**. Welche Führungsform ist wo vorgesehen, welche Querschnitts- und Haltestellen-Vorgaben usw. gelten.
  - Bern: **[Standards Masterplan Veloinfrastruktur Stadt Bern](https://www.bern.ch/velohauptstadt/infrastruktur/masterplan-veloinfrastruktur)**
  - Zürich: **[Velostandards Stadt Zürich](https://www.stadt-zuerich.ch/content/dam/web/de/aktuell/publikationen/2024/velostandards-stadt-zuerich/velostandards-stadt-zuerich.pdf)**
  - Basel: **[Standards Fuss- und Velo-Verkehrsinfrastruktur Basel-Stadt](https://media.bs.ch/original_file/72373a2c610e23b19ae61cd148ad22f35b3d1fe2/2024-09-27-standards-fvv-is-bs.pdf)**
  - Luzern: **[Standards Veloverkehr Stadt Luzern](https://www.stadtluzern.ch/_docn/2965064/Standards_Veloverkehr.pdf)**
- die empirisch gemessene **subjektive Sicherheit** aus der Befragung von radwege-check / FixMyCity (wie sicher sich Velofahrende in einer Situation fühlen, „feel-safe %").

Bewertet wird eine **Strecke**, die aus einem oder mehreren **Abschnitten** besteht. Jeder Abschnitt erhält eine eigene Note; die Strecke erhält die Note ihres schlechtesten Abschnitts.

**Web-VeloroutenCheck** https://veloroutencheck.ch/

**Ergebnisbericht Bildumfrage Bern 2026** — [docs/09_Umfrage_Subjektive_Sicherheit_Bern_2026/Ergebnisbericht.md](docs/09_Umfrage_Subjektive_Sicherheit_Bern_2026/Ergebnisbericht.md). 5 900 Bewertungen von 51 Bildern aus 14 Berner Strassenabschnitten: Feel-Safe-Anker, Breiteneffekte und was daraus für die Werte im Rechner folgt.

> **Beta** — Resultate mit Vorsicht verwenden und durch eine Fachperson prüfen lassen.

Vibecoding. Don't trust, verify!

## Repo-Struktur

| Ordner | Inhalt |
|---|---|
| [`VeloroutenCheckWeb/`](VeloroutenCheckWeb/) | Die Web-App (React + Vite + TypeScript). |
| [`tools/`](tools/) | Offline-Skripte: `oev_takt.py` (GTFS → Bus-Takt-Snapshots je Stadt), `dtv_basel.py` (DTV-Snapshot Basel), `verify_06.py` (Nachrechnung der feel-safe-Anker), `generiere_dokumentation.py` und `generiere_stadt_pdf.py` (Regelwerk-Dokumente aus `docs/regelwerk.json`), `visualisierung_template.html`. |
| [`docs/`](docs/) | Methodik-Notizen, Herleitungen, das Regelwerk (`regelwerk.json`/`.md`) und der [Ergebnisbericht der Berner Bildumfrage 2026](docs/09_Umfrage_Subjektive_Sicherheit_Bern_2026/Ergebnisbericht.md). Die zugrunde liegenden Rohdaten liegen lokal und sind nicht im Repo. |

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

- **Strasse suchen** oben auf der Karte, neben der Stadtwahl (seit 17.10.2026, wie in fgsCheck): Beim Tippen erscheinen ab drei Zeichen Vorschläge aus den Adressen von swisstopo (SearchServer, nur Adressen der gewählten Stadt, je Strassenname einmal; [`strassenvorschlaege.ts`](VeloroutenCheckWeb/src/strassenvorschlaege.ts), [`Strassensuche.tsx`](VeloroutenCheckWeb/src/Strassensuche.tsx)). Ein Vorschlag oder Enter lädt alle Segmente der Strasse aus OpenStreetMap; Enter lädt auch Namen ohne Vorschlag (Strassen ohne Adressen, etwa Brücken). Während einer Breitenmessung steht an dieser Stelle deren Werkzeugleiste.
- **Klick auf die Karte**. Dies fügt das nächstgelegene Strassensegment hinzu (eine Strecke lässt sich rein per Klick aufbauen). Der Knopf «Zum eigenen Standort» unter den Zoom-Knöpfen (seit 17.10.2026, wie fgsCheck) zeigt den Standort des Geräts mit Genauigkeitskreis und zoomt hin; er wird nur auf der Karte gezeigt, nirgends gespeichert oder gesendet, und braucht https.

**Segment teilen.** Ein OSM-Segment (Way) ist oft länger als ein gleichartiger Strassenabschnitt. „✂ Segment teilen" schaltet einen Teil-Modus ein; Karte und Anleitung zeigen dann, was zu tun ist. Der nächste Klick auf eine Linie schneidet sie am nächstgelegenen Punkt der Linie in zwei Teile (`teileInListe` in [`osm.ts`](VeloroutenCheckWeb/src/osm.ts)). Esc oder der Knopf brechen ab, „Teilen rückgängig" stellt den Stand vor dem Schnitt wieder her. Ein Teil ist mindestens 5 m lang (`MIN_TEIL_M`). Beide Teile übernehmen die OSM-Werte des Ways; die übrige Anreicherung (amtliche Werte, ÖV, Markierung, OpenBikeSensor) wird je Teil neu abgefragt. Die Karte zeigt jeden Schnitt als weissen Punkt, Tooltip und Abschnitts-Beschriftung nennen „Teil n/m". Ein erneutes „Strasse laden" ersetzt die geteilten Segmente durch die ganzen Ways.

Mit „In Strecke übernehmen" werden die gewählten Segmente entlang der Strasse geordnet und benachbarte Segmente zu Abschnitten zusammengefasst, soweit sie gleich bewertet werden: gleiche Führungsform, gleiches Tempo, gleicher Routentyp und gleiche Soll-Führungsform (`mergeSegs` in [`strecke.ts`](VeloroutenCheckWeb/src/strecke.ts)); dazu gleiche Erfassung der Seiten, Seite A in derselben Fahrtrichtung und, wo beide Seiten zählen, dieselbe Führungsform auf Seite B. Ein Wechsel des DTV über eine Soll-Grenze oder des Routentyps ergibt also einen eigenen Abschnitt; unbestimmte Werte trennen nicht. Stummel unter 25 m gehen im Nachbarn auf. Ein von Hand gesetzter Schnitt trennt immer, und ein geteiltes Stück gilt nie als Stummel. Je Abschnitt und Seite gilt die schmalste bekannte Breite gleicher Führungsform; fehlt dem längsten Segment ein DTV, Routentyp oder Strassentyp, wird er von einem anderen Segment des Abschnitts übernommen. Solange die Anreicherung läuft, ist das Übernehmen gesperrt.

**Eingaben je Abschnitt.** Für beide Seiten gemeinsam: DTV MIV, zulässige Höchstgeschwindigkeit, Routentyp (Velohauptroute / Veloroute), **bei Basel zusätzlich der Strassentyp** (verkehrs- / siedlungsorientiert, da dort die Soll-Wahl strassentyp-basiert ist), Tram in der Fahrbahn, das ÖV-Angebot und die Fahrbahnbreite als Information. Je Seite: vorhandene Führungsform (Ist) und deren Breite; bei fahrbahnnahen Führungsformen, ob rechts längs geparkt wird (Dooring); bei der Umweltspur der öV-Takt; bei vorhandener Haltestelle der Haltestellentyp (Auswahl je Stadt) oder „keine Haltestelle auf dieser Seite".

**Seiten (Fahrtrichtungen).** Jeder Abschnitt hat zwei Seiten (`Seite` in [`strecke.ts`](VeloroutenCheckWeb/src/strecke.ts)). **Seite A** ist die Fahrtrichtung entlang der Strecke, auf einer Einbahn die Fahrtrichtung des Verkehrs. **Seite B** ist die Gegenrichtung. Gemeint ist jeweils die rechte Fahrbahnseite in Fahrtrichtung. Seite A ist immer bewertet. Für Seite B gibt es drei Zustände, die Knöpfe dazu stehen in den Kopfzeilen der Kästen:

- **Beide Seiten gleich** (Standard): Ein gemeinsamer Kasten „Seite A und Seite B" erfasst beide Fahrtrichtungen in einem Schritt, mit einer gemeinsamen Note. Knöpfe „Seite B anders erfassen" und „Seite B nicht bewerten".
- **Seite B mit eigenen Werten:** Seite A und Seite B stehen in je einem Kasten. Seite B ist mit den Werten von Seite A vorbelegt, sofern die Daten keine andere Gegenseite liefern. Knöpfe „Wie Seite A", der zur gemeinsamen Erfassung zurückkehrt und die eigenen Werte verwirft, und „Seite B nicht bewerten".
- **Seite B nicht bewertet:** Seite B zählt nicht, etwa auf einer Einbahn. Knopf „Seite B bewerten".

Sind die Seiten getrennt, vertauscht „⇄ Seiten tauschen" im Kasten von Seite A die beiden Seiten samt Herkunft. So lässt sich auf einer Einbahn auch die Gegenrichtung als Seite A bewerten.

Die Überschriften nennen die Fahrtrichtung als ausgeschriebene Himmelsrichtung, etwa „Seite A · Richtung Süden" (Sehne des Abschnitts). Ein kleiner Pfeil am Nummern-Marker der Karte zeigt die Fahrtrichtung der Seite A an dieser Stelle. Die Fahrtrichtung der Strecke ergibt sich aus der Reihenfolge der Segmente; jedes Segment wird an das vorige angehängt, auch wenn sein Way in OSM andersherum gezeichnet ist (`ausrichtung`).

Vorbelegt wird je Seite aus OSM (`istSeiten` in [`osm.ts`](VeloroutenCheckWeb/src/osm.ts)): `cycleway:right` gehört zur Fahrtrichtung des Ways, `cycleway:left` zur Gegenrichtung, `cycleway:both` und `cycleway` zu beiden; ebenso die Breite (`cycleway:right:width` usw.). Velostrasse, Radweg und Fussweg gelten für beide Seiten gleich. Eine OSM-Einbahn (`oneway`, auch Kreisel) ergibt Seite A in Fahrtrichtung und eine Seite B, die nicht bewertet wird. Ist die Einbahn fürs Velo in der Gegenrichtung offen (`oneway:bicycle=no`), weist die Maske darauf hin; die Form der Gegenrichtung wird wie bisher von Hand gewählt. In Bern ordnet die lokale Markierung die Striche zusätzlich einer Seite zu (`naechsteLinieJeSeite` in [`geo.ts`](VeloroutenCheckWeb/src/geo.ts)): Eine Seite mit Strichen auf mindestens der Hälfte ihrer Länge wird Radstreifen, ein OSM-Radstreifen auf der Seite ohne Striche wird Mischverkehr. Lassen sich die Striche keiner Seite eindeutig zuordnen, gilt die Markierung wie bisher für beide Seiten.

**Automatische Befüllung und Herkunft.** Wo Daten vorliegen, werden die Felder beim Laden automatisch gefüllt. Ein kleiner **Chip** am Feld zeigt die Herkunft des Werts:

- **Geoportal** (zum Beispiel Geoinformation Stadt Bern, blau),
- **OSM** (OpenStreetMap, grau),
- **opentransportdata** (Fahrplan, für den Bus-Takt, grün),
- **Markierung** (nur Bern, nur lokal: Velostreifen-Snapshot, siehe [`velostreifen.ts`](VeloroutenCheckWeb/src/velostreifen.ts)),
- **angenommen ≤ 2000** (nur Bern: DTV-Annahme, siehe [Bern](#bern)),
- **Luftbild** (Bern, Zürich, Basel: Form aus dem Luftbild-Hinweis übernommen, siehe unten),
- **gemessen** (Bern, Zürich, Basel: Breite am Luftbild gemessen, siehe unten),
- kein Chip, sobald das Feld manuell geändert wurde.

Leere Pflichtfelder zeigen „Eingabe nötig".

**Luftbild-Hinweis (Bern, Zürich, Basel).** Zeigt das Luftbild auf einer Seite einen Radstreifen, den die Maske noch nicht kennt, erscheint über den Seiten-Kästen ein Hinweis mit dem Anteil der Länge, auf dem der Streifen erkannt wurde. Grundlage sind die Snapshots `luftbild_bern.json`, `luftbild_zurich.json` und `luftbild_basel.json` aus einer automatischen Erkennung auf SWISSIMAGE, siehe [Bern](#bern). Der Hinweis setzt keine Werte. Ein Knopf übernimmt auf Wunsch „Radstreifen" für die betroffenen Seiten, mit dem Chip **Luftbild**; gilt der Hinweis nur für eine von zwei gleichen Seiten, werden die Seiten dabei verschieden. Die Breite bleibt offen, weil das Luftbild keine liefert. Bedingungen (`luftbildHinweis` in [`strecke.ts`](VeloroutenCheckWeb/src/strecke.ts)): Die Form der Seite ist noch offen oder Mischverkehr, und Funde liegen auf mindestens 30 % ihrer Länge (`LUFTBILD_SCHWELLE` in [`luftbild.ts`](VeloroutenCheckWeb/src/luftbild.ts)). Seite B zählt nur, wenn sie bewertet wird. Eine Seite ohne Fund wird nicht erwähnt, weil Schatten und parkierte Autos Streifen verdecken.

**Parkierung je Seite (Bern, Zürich, Luzern).** «Parkierung rechts (Dooring)» wird je Seite aus den amtlichen Parkplatzdaten der Stadt vorbelegt, mit dem Chip **Geoportal** ([`parkierung.ts`](VeloroutenCheckWeb/src/parkierung.ts)). Regel wie im lokalen Berner Rechner: Eine Seite hat Parkierung, wenn auf mindestens 30 % ihrer Länge Parkfelder bis 9 m neben der Achse liegen, gemessen in 10-m-Abschnitten; sonst wird «Nein» vorbelegt. Jede Parkierung zählt, auch Quer- und Schrägparkierung (Nutzerentscheid 16.10.2026), obwohl der Abzug mit Dooring begründet ist. In Bern zählen Parkfelder, Parkverbotsfelder und Spezialfelder ohne Polizei, Lastwagen und Sanität, in Zürich alle Felder ausser Motorrad und Velo, in Luzern alle Parkflächen ausser Zweirad und Blaulicht. Hat nur eine Seite Parkierung, werden die Seiten verschieden. Beim Zusammenfassen gilt der nach Länge gewichtete Anteil. Basel fehlt, weil seine Parkfelder ohne Geometrie veröffentlicht sind. Der Sicherheitsstreifen bleibt eine Eingabe von Hand.

**Fahrbahnbreite aus der AV (Bern, Zürich, Basel).** In den Grunddaten steht das Feld «Fahrbahnbreite (Bordstein–Bordstein)». Es ist eine Information und fliesst nicht in die Note ein. Bei Abschnitten von der Karte ermittelt „aus AV ermitteln" die Breite aus der amtlichen Vermessung (`fahrbahnbreite` in [`breitenmessung.ts`](VeloroutenCheckWeb/src/breitenmessung.ts)): Querschnitte alle 5 m entlang der OSM-Geometrie, je ein Strahl nach links und rechts bis zur ersten Bordsteinkante, höchstens 20 m je Seite; eingetragen wird der Median auf 0,1 m, mit dem Chip **AV**. Ausgelassen werden die Segment-Enden (je 12 m, bei kurzen Segmenten je ein Achtel der Länge), Punkte ausserhalb der Strassenfläche und Querschnitte ohne Kante; es braucht mindestens drei Querschnitte. Die Statusmeldung nennt Anzahl und Spannweite der Querschnitte. Gemessen wird die ganze AV-Fläche «Strasse_Weg»: Parkierung, Busbuchten und Tramgleise zählen mit, eine Verkehrsinsel begrenzt den Querschnitt. Abgefragt wird nur auf Knopfdruck, in Ausschnitten von 500 m, höchstens sechs.

**Breite am Luftbild messen (Bern, Zürich, Basel, Luzern).** Neben dem Feld «Breite der Führungsform» startet „📏 Am Luftbild messen" eine Messung für diese Seite. Die Karte wechselt aufs Orthofoto und zeigt die Bordsteinkanten der amtlichen Vermessung orange. Bordsteinkante heisst hier: eine Kante der AV-Fläche «Strasse_Weg», hinter der keine weitere Strassenfläche liegt (`bordkanten` in [`breitenmessung.ts`](VeloroutenCheckWeb/src/breitenmessung.ts)). Gemessen wird **ab der Bordsteinkante bis zur Stelle der Markierung, die man anklickt**, rechtwinklig zur nächsten Kante im Umkreis von 8 m (`messeAbKante`). Der Messwert ist die Breite an dieser Stelle; „übernehmen" trägt ihn auf Zentimeter gerundet ins Feld ein, mit dem Chip **gemessen**. Passt die AV-Kante nicht zum Bord, etwa wenn Parkfelder zwischen Bord und Streifen liegen, misst „Zwei Punkte" von Hand: zuerst die Bordsteinkante, dann die Markierung. Bei Velostrasse und Wegen (Fussweg, Fuss-/Radweg, Zweirichtungsradweg, abgesetzter Radweg) ist «Ganze Fläche» vorgewählt (seit 20.10.2026, `messeFlaeche`): In die Fläche klicken, gemessen wird rechtwinklig von der nächsten Kante bis zur gegenüberliegenden; bei der Velostrasse zieht «übernehmen» die Parkierung ab (1,90 m je Seite). Vorher ergab ein Klick auf die gegenüberliegende Kante 0 m. Zoom und Ausschnitt bleiben, solange der Abschnitt ganz oder teilweise im Bild ist; nur wenn er nicht zu sehen ist, springt die Karte zu ihm. Die Werkzeugleiste auf der Karte zeigt Messart, Ergebnis und die Quellen; Esc oder „Abbrechen" beenden die Messung. Das Orthofoto bleibt danach eingeschaltet, damit die Karte nicht auf die tiefere Höchststufe eines anderen Hintergrunds herauszoomt; gewechselt wird oben rechts. Das Orthofoto lässt sich dafür eine Stufe über seine 10-cm-Auflösung vergrössern. Die AV kommt live vom WFS von geodienste.ch ([`av.ts`](VeloroutenCheckWeb/src/av.ts)), nur während einer Messung und nur für den sichtbaren Ausschnitt, höchstens ±300 m; wird die Karte weit verschoben, lädt sie für den neuen Ausschnitt nach. Luzern gibt die AV über geodienste.ch nur mit Freigabe ab; dort dienen seit 17.10.2026 die offenen Strassenflächen der Stadt als Ersatz (siehe «Vorgaben je Stadt»). Gerechnet wird in LV95 ([`lv95.ts`](VeloroutenCheckWeb/src/lv95.ts), strenge Umrechnung aus fgsCheck).

**Aufteilung planen (Bern, Zürich, Basel, Luzern).** Im Reiter «Planen» eines Abschnitts oder mit «Aufteilung planen» in seiner Kopfzeile lässt sich der Querschnitt neu aufteilen ([`aufteilung.ts`](VeloroutenCheckWeb/src/aufteilung.ts)). Die App schlägt dabei nichts vor; welche Elemente wie breit werden, legt man selbst fest. Ausgangslage ist der Querschnitt von heute (`startAufteilung`): je Seite eine Parkierung von 1,90 m (Basel 2,00 m), wenn «Parkierung rechts» Ja ist, mit Sicherheitsstreifen von 0,80 m (Zürich und Basel 0,75 m), wenn er angegeben ist; dann der Velostreifen bzw. Radweg mit Trennstreifen in der heutigen Breite. Ist diese unbekannt, was online häufig ist (OSM ohne Breite, nicht am Luftbild gemessen; der Berner Markierungsplan liegt nur lokal), steht die Vorgabe je Routentyp darin, gekennzeichnet als «angenommen», bis eine Breite eingetragen wird. Vorher zählte die fehlende Breite als 0 m, und die Fahrspuren bekamen den ganzen Rest (Laubeggstrasse: 2 × 4,90 m); dazwischen eine Fahrspur auf der Einbahn, sonst zwei, mit Tram als «Fahrspur mit Tramgleis». Die Fahrspuren teilen sich den Rest der Fahrbahnbreite, auf 5 cm gerundet; ohne Fahrbahnbreite gilt der Richtwert. Reicht der Rest bei Gegenverkehr nicht für zwei Spuren zum Richtwert (unter 6,00 m, in Luzern 6,50 m), steht stattdessen eine «Fahrbahn ohne Mittellinie (Gegenverkehr)» mit dem ganzen Rest. Sie hat in Bern keine Vorgabe (Zürich, Basel und Luzern siehe unten), wird wie eine Fahrspur als Mischverkehr bewertet und zeigt in der Skizze ein Auto. Ganz aussen stehen die Trottoirs, sobald sie aus der AV gemessen sind (siehe unten). Die Elemente stehen von links nach rechts, in Fahrtrichtung der Seite A gesehen: links der Rand der Seite B, rechts der Rand der Seite A. Jedes Element lässt sich in Art und Breite ändern und entfernen. Verschieben lässt es sich am Griff ⠿ per Drag and Drop oder mit den Pfeilen; die Pfeile helfen auf Touch-Geräten, wo Drag and Drop je nach Browser fehlt. Die Querschnittselemente heissen in der App «Element» (seit 22.10.2026, Nutzerentscheid; vorher «Teil»; im Code bleibt `Teil`). «＋» in einer Zeile fügt ein neues Element direkt hinter dieser Zeile ein, also zwischen ihr und der nächsten, in der Skizze rechts davon; die Art wird dort gewählt. Ein weiteres «＋» unter der Liste fügt es an den Anfang ein, ganz links am Rand der Seite B. Ein neues Element hat keine Breite (seit 22.10.2026, Nutzerwunsch; vorher stand die Vorgabe darin, etwa 2,50 m für ein Trottoir), und ein Wechsel der Art behält die eingetragene Breite. „Auf heute zurücksetzen" verwirft die eigenen Änderungen und beginnt wieder mit der Ausgangslage. Die App zeigt vier Dinge:
- **Skizze** ([`Querschnitt.tsx`](VeloroutenCheckWeb/src/Querschnitt.tsx)): der Querschnitt heute und mit der Planung untereinander, im selben Massstab, mit dem Mass jedes Elements und der Fahrbahn Bordstein–Bordstein. Gezeichnet wird in Zentimetern, wie die Streetmix-Illustrationen (1 px = 1 cm). Die Illustrationen (Fussgängerinnen und Fussgänger, Sitzbank, Wartehäuschen, Baum, Strauch, Blumen, Velos, Veloständer, Parklet, Pfosten, Auto, Lastwagen, Bus, Tram) stehen mittig auf ihrem Element, sofern es breit genug ist; auf einem Trottoir ab 1,50 m stehen zwei Personen, weiblich und männlich gelesen (weiblich gelesen nur mit Hose oder langem Rock bzw. Kleid). Grünstreifen sind wie Trottoirs erhöht. Pfeilmarkierungen erscheinen in einem Streifen mit Draufsicht unter dem Querschnitt, auch kombiniert (links und geradeaus, geradeaus und rechts, links und rechts, alle drei). Für Seite B wird der Pfeil um 180° gedreht, weil die Streetmix-Dateien «…-inbound» gespiegelt sind (ihr Linkspfeil zeigt für Entgegenkommende nach rechts). Seite B kommt entgegen, Seite A fährt weg; auf der Einbahn fährt alles weg. Die Blickrichtung steht seit dem 21.10.2026 in der Skizze selbst (Nutzerwunsch): oben links «← Seite B · Richtung … · kommt entgegen», oben rechts «Seite A · Richtung … · Blickrichtung →» (Himmelsrichtungen aus `peilungA`; auf der Einbahn links «Rand der Seite B»). Welche Richtung Seite A ist, legt die Ausrichtung der Strecke fest (das erste Segment); mit anderen Segmenten oder «⇄ Seiten tauschen» kann sie wechseln, Pfeil am Marker, Titel «Seite A · Richtung …» und Skizze drehen dann gemeinsam. Der Sicherheitsstreifen ist schraffiert, die Trottoirs sind erhöht. Gelbe Striche markieren die Ränder der Velostreifen, weisse die Grenze zwischen zwei Fahrspuren und zwischen Parkierung und Fahrbahn. Schrägparkierung zeigt ein schräg stehendes Auto (Streetmix `car-angled`: Seite B mit der Front, Seite A und die Einbahn mit dem Heck, die Nase zum Rand), Senkrechtparkierung und «schräg oder senkrecht» ein Auto von der Seite (`car-sideways`). Die Striche sind 20 cm breit, damit sie auch klein sichtbar bleiben. Passt der Name nicht unter ein Element, steht ein Kurzwort; passt auch das Mass nicht, rückt es eine Zeile tiefer. Jedes Element trägt seine Nummer aus der Liste der Planung in einem Kreis auf dem Bodenstreifen (schmale Elemente darüber; seit 21.10.2026, Nutzerwunsch), auch im Bericht.
- **Bilanz** (`bilanz`, `bilanzText`, Nutzerentscheid 16.10.2026): über den ganzen Querschnitt. Verfügbar sind die Fahrbahn (Feld «Verfügbare Fahrbahnbreite») und die Breite ausserhalb der Fahrbahn von heute (Feld «Heute ausserhalb der Fahrbahn», vorbelegt mit den Trottoirs beider Seiten aus der AV, `seitenraumVon`). Es zählen alle Elemente, auch Trottoirs, Haltestelle und Grünstreifen; der Bordstein darf also wandern, ein breiteres Trottoir geht zulasten der Fahrbahn. Angezeigt werden Rest oder Fehlmass und zur Information die Summe der Fahrbahnteile. Ist die Breite ausserhalb der Fahrbahn unbekannt, gilt die Bilanz nur für die Fahrbahnteile, mit Hinweis. Bei Abschnitten von der Karte holt „aus AV ermitteln" die verfügbare Fahrbahnbreite gleich wie in den Grunddaten aus der amtlichen Vermessung, trägt sie aber nur in die Planung ein. Die Elemente passt die App dabei nicht an; die Änderung zeigt sich im Rest.
- **Prüfung je Element** (`pruefeTeil`, Entscheide vom 16.10.2026):
  - Velostreifen und Radweg: Soll-Breite der Bewertung je Routentyp (`sollBreite` in [`fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts)).
  - Velostrasse: Band der Bewertung, 4,50–6,50 m.
  - Fahrspur: Richtwert 3,00 m, neben einem Radweg 3,25 m (Masterplan Q 2a/2b). Mit Lastwagen oder Bus gilt der Lichtraum nach SN 640 201, wenn er grösser ist (`lichtraum`): 2,50 m Grundbreite plus je Seite Bewegungsspielraum nach Tempo und Sicherheitszuschlag 0,30 m, das ergibt 3,30 m bis Tempo 40 und 3,50 m bis Tempo 70; ohne Tempo gilt 50. Zu schmal ist jede Fahrspur erst unter 3,00 m; dazwischen heisst es «unter dem Richtwert».
  - Fahrspur mit Tramgleis: 3,00 m bei Gegenverkehr, 3,25 m auf der Einbahn (eigene Herleitung: sonst bleiben nur 0,65 m zwischen Schiene und Velostreifen); zu schmal unter dem Lichtraum von 2,80 m (1,40 m ab Gleisachse, Masterplan Kaphaltestelle).
  - Kernfahrbahn 4,50–5,50 m, Parkierung 1,90 m, Sicherheitsstreifen 0,80 m (zu schmal unter 0,50 m), Trennstreifen 0,15 m, Trennung mit Pfosten 0,70 m, Haltestelle (Wartehäuschen samt Warteraum davor, zwischen Bordstein und Trottoir) mindestens 3,10 m.
  - Trottoir nach dem Fussverkehrsnetz, das in der Planung gewählt wird (Masterplan Fussverkehr Stadt Bern): Basisnetz publikumsintensiv mindestens 3,50 m, Basisnetz 2,50 m, Feinverteilernetz publikumsintensiv 2,50 m, Feinverteilernetz 2,00 m. Ohne gewähltes Netz keine Vorgabe. Das Netz gilt für beide Seiten. Vorbelegt wird es bei Abschnitten von der Karte aus dem Geoportal-Produkt «Richtplan Fussverkehr» ([`fussnetz.ts`](VeloroutenCheckWeb/src/fussnetz.ts), Layer «Basisnetz Fussweg bestehend»). Der Dienst führt nur das Basisnetz, als Linien auf der Strassenachse. Liegt eine solche Linie auf mindestens der Hälfte der Länge bis 6 m neben der Achse (in 10-m-Abschnitten, `anteilNahe`), gilt Basisnetz, sonst Feinverteilernetz. «Publikumsintensiv» steht nicht in den Daten und wird von Hand gewählt; eine Wahl von Hand bleibt, „Auf heute zurücksetzen" stellt den Geoportal-Wert wieder her.
  - Ohne Vorgabe, mit vorbelegter Breite: Veloabstellplatz 1,90 m, Parklet 1,90 m, Grünstreifen 1,50 m, Fahrbahn ohne Mittellinie.
- **Neue Elemente in der Bewertung** (`formJeSeite`): Ein Velostreifen direkt neben einer Trennung mit Pfosten gilt als geschützter Radstreifen. Veloabstellplatz und Parklet zählen nicht als Parkierung, lösen also keinen Abzug für Dooring aus. Eine Velostrasse über die ganze Fahrbahn gilt für beide Seiten. Grünstreifen und Haltestellen liegen wie Trottoirs ausserhalb der Fahrbahn; die Bewertung der Haltestelle bleibt wie im Rechner eingegeben.
- **Bild und Markierung je Element:** Fahrspuren und die Fahrbahn ohne Mittellinie tragen ein Auto, einen Lastwagen oder einen Bus; das Fahrzeug bestimmt die Vorgabe, und die Breite folgt ihm, solange sie noch vorbelegt ist. Trottoirs zeigen Fussgänger*innen oder eine Sitzbank; das Wartehäuschen gehört zur Haltestelle, mit einer wartenden Person davor, Grünstreifen einen Baum, einen Strauch oder Blumen. Fahrspuren, Velostreifen, Radweg, Kernfahrbahn, Velostrasse und Tram können eine Markierung tragen: Pfeil geradeaus, links oder rechts. Elemente mit Verkehr haben eine Richtung (`richtungVon`): Seite A (von hinten gesehen) oder Seite B (von vorne), vorbelegt nach der Lage links oder rechts der Fahrbahnmitte, auf der Einbahn immer Seite A. Elemente ohne Mittellinie (Fahrbahn ohne Mittellinie, Kernfahrbahn, Velostrasse) haben ausser auf der Einbahn auch «beide Richtungen»; dann zeigt die Skizze je ein Fahrzeug von vorne (links) und von hinten (rechts), sofern zwei Platz haben, und die Pfeile in beide Richtungen. Die Richtung wirkt nur auf die Skizze, nicht auf die Bewertung. Ein Velo-Piktogramm gibt es nicht: Das Streetmix-Bild ist ein Sharrow, keine Schweizer Markierung.
- **Kernfahrbahn** (`pruefeKernfahrbahn`, Masterplan Q 5): Fahrbahn ohne Mittellinie, der Kern trägt beide Richtungen. Nicht zulässig ohne Velostreifen auf beiden Seiten, auf der Einbahn, neben weiteren Fahrspuren, ab DTV 10 000 und über Tempo 50. Hinweise gibt es bei DTV zwischen 5 000 und 10 000 (über dem Optimalbereich), bei fehlendem DTV oder Tempo und mit Tramgleis. Die Note ändert die Kernfahrbahn nicht; bewertet werden die Velostreifen an ihren Rändern.
- **Note mit dieser Aufteilung neben der von heute** (`bewerteAufteilung`): dieselbe Bewertung, nur mit Führungsform, Breite, Parkierung und Sicherheitsstreifen je Seite sowie Tram aus den Elementen (`formJeSeite`, vom Rand nach innen gelesen). DTV, Tempo, Routentyp und Haltestelle bleiben wie eingegeben.

**Vorgaben je Stadt (Etappe 4, Nutzerentscheide 17.10.2026).** Zürich, Basel und Luzern prüfen mit den Massen ihrer eigenen Standards (`STADT_VORGABE`, `vorgabe`). Wo eine Stadt für ein Element kein Mass nennt, gilt der Berner Wert; die Quelle heisst dann «Ersatz Bern: Masterplan Veloinfrastruktur Stadt Bern», in der Liste wie im Bericht. Die Trennung mit Pfosten bleibt überall die eigene Festlegung.

| Element | Zürich (Velostandards, 22.03.2024) | Basel (Standards FVV, 27.09.2024) | Luzern (Standards Veloverkehr Stadt, 12.01.2021) |
|---|---|---|---|
| Fahrspur | Ersatz Bern | Ersatz Bern | 3,25 m, mindestens 3,00 m (Q1a) |
| Parkierung | Ersatz Bern | 2,00 m (Abb. 29/30) | 1,90 m |
| Sicherheitsstreifen | 0,75 m, auch als Mindestmass | 0,75 m, mindestens 0,50 m (Tab. 5) | 0,80 m, mindestens 0,50 m |
| Trennstreifen zum Radweg | Ersatz Bern | 0,50 m, mindestens 0,30 m (Tab. 5) | Ersatz Bern |
| Kernfahrbahn | ab 4,50 m | ab 4,50 m | 4,50–5,50 m (Q5) |
| Haltestelle | Ersatz Bern | Ersatz Bern | mindestens 3,10 m (Perron mit Witterungsschutz) |

**Umweltspur in der Planung (seit 21.10.2026, Masterplan Q 4, S. 20; Nutzerbefund Schwarzenburgstrasse).** Erkannt wird die Umweltspur nur aus OSM (`cycleway=share_busway`, auch je Seite), das Geoportal hat keinen Layer dazu. Neues Element «Umweltspur (Bus und Velo)» mit der Vorgabe der Bewertung (Bern/Luzern 4,50 / 3,75 m, Zürich 4,80 / 4,50, Basel 4,50 / 3,00; `sollBreite('Umweltspur')`) und den Hinweisen des Masterplans: Bus-Takt unter 7,5 Min nicht vorgesehen (Takt aus `Umfeld.oevTakt`), Steigung über 2 % nicht prüfbar. Ausgangslage: Auf der Seite mit Umweltspur liegt sie am Rand, mit der Breite von heute oder der Vorgabe (angenommen); nennt OSM dort eine Busspur (`lanes:bus:forward/backward` → `Spuren.busVor/busRueck`, `Section.spuren.busA/busB`), ersetzt sie die äusserste Spur dieser Seite (way 1568298241: Seite B Umweltspur + Fahrspur, Seite A eine Fahrspur), und es gibt keine Fahrbahn ohne Mittellinie. Skizze: Bus und daneben ein Velo. `formJeSeite` liest das Element als Führungsform «Umweltspur»; der Vorschlag behält sie als Element (vorher stand ein Hinweis, die Planung kenne sie nicht). **Bus-Takt vorbelegt** (nur Bern; wie `linien_takt.py` im lokalen Rechner): `loadOev` in [`bern.ts`](VeloroutenCheckWeb/src/bern.ts) sucht je Segment mit Buslinien die nächste Haltestelle mit Takt (bis 250 m, Haltestellenabstand), die an einer Buslinie des Segments liegt (bis 30 m), und liefert ihre Fahrten pro Stunde (`streckePerH`, Abendspitze, stärkste Richtung; der lokale Rechner summiert je Linie an deren Haltekante). Für Seiten mit Umweltspur wird der Takt (60 / Fahrten, auf halbe Minuten) vorbelegt, Chip «Fahrplan», von Hand änderbar; beim Zusammenfassen vom längsten Segment, das ihn kennt. Ohne Takt gilt der Takt wie bisher als zulässig.

**Haltestellen in der Planung (seit 20.10.2026, Masterplan HS 1–5, S. 64–73).** Der Wartebereich (Element «Haltestelle: Wartebereich») braucht mit Wartehalle mindestens 3,10 m, ohne mindestens 2,00 m (Bild «ohne Wartehalle»); das Element «Haltestelle: Ein- und Ausstieg» (Perron an der Haltekante ohne Wartehalle) mindestens 2,00 m. Neben einer Haltestelle prüft die App nach dem Haltestellentyp der Seite (`haltUmfeld`): das Trottoir dahinter 2,50 m, mindestens 2,00 m (verlangt das Fussverkehrsnetz mehr, gilt dieses); die Velofläche nach dem Typ (HS 1 und 4: 1,80, minimal 1,60; HS 2: 1,80/1,50; HS 5: 2,50/1,50); das neue Element «Abstand zur Haltestelle» (HS 1: 0,50, minimal 0,30; HS 2 zur Haltekante 0,80, minimal 0,50; sonst 0,30); bei der Inselhaltestelle die Fahrspur neben der Insel mit 3,50, mindestens 3,00 m. Ausser Bern gelten die Werte als «Ersatz Bern». «Haltestelle einfügen» setzt auf einer Seite die Elemente von HS 1, 2, 4 oder 5 (`haltestelleEinfuegen`; nur Typen, die die Stadt kennt) und den Typ der Seite für die Planung (`Aufteilung.haltestellentyp`); die Seite behält für die Bewertung ihre Führungsform von heute.
| Fahrspur mit Tramgleis | Ersatz Bern | Ersatz Bern | (kein Tram) |
| Fahrbahn ohne Mittellinie | 4,40 m, auf Velovorzugsrouten 4,80 m, bis 6,00 m | 4,50 m, reduziert 4,30 m, unter 1 000 Fz/Tag 4,00 m (Tab. 4) | 4,50–7,50 m (Kanton; Stadt Q6: darüber Kernfahrbahn oder Radstreifen prüfen) |

Die Fahrbahn ohne Mittellinie wird nur dort geprüft, wo die Stadt ein Mass nennt; in Bern bleibt sie ohne Vorgabe. Die Grenzen der Kernfahrbahn (`pruefeKernfahrbahn`) folgen ebenfalls der Stadt: Zürich nur bei Tempo 30, bis DTV 5 000, mit einem Kern ab 5,20 m bis 7 500; Basel nicht ab 7 500 Fahrzeugen pro Tag; Luzern nicht ab DTV 10 000, über Tempo 30 ein Hinweis (der Kanton empfiehlt Tempo 30). Velostreifen, Radweg und Velostrasse prüfen wie bisher mit den Breiten-Sollwerten der Stadt.

Trottoirs je Stadt:
- Zürich nach der Bedeutung des Stadtraums (Leitfaden «Standards Fussverkehr», Teil 1, Tiefbauamt 2020, S. 13; Bedeutungsplan öffentliche Stadträume 2019): international/landesweit 3,00 m, regional/stadtweit und quartierweit 2,40 m, nachbarschaftlich 2,00 m, als lichte Breite ohne die Umfeldzuschläge des Leitfadens (etwa neben Tempo 50 ohne Radstreifen oder an ÖV-Haltestellen; darauf weist die Planung hin). Die Bedeutung wird von Hand gewählt; sie ist nicht als offener Dienst greifbar.
- Basel nach dem Fusswegnetz (Standards FVV, Tab. 1): kantonales Netz 2,40 m, mindestens 2,00 m; Stadtnetz 2,20 m, mindestens 2,00 m; übrige 2,00 m, mindestens 1,80 m. Vorbelegt aus dem Teilrichtplan Fuss- und Wanderwege (`ladeFussnetzBasel` in [`fussnetz.ts`](VeloroutenCheckWeb/src/fussnetz.ts), WFS `wfs.geo.bs.ch`, Layer `TF_Fusswegnetz_KantonBS_…` und `TF_Fusswegnetz_Basel_…`): Liegt eine kantonale Linie auf mindestens der Hälfte der Länge nahe der Achse, gilt das kantonale Netz, sonst mit einer kommunalen Linie das Stadtnetz, sonst «übrige». Die kantonalen Linien liegen wie in Bern auf der Strassenachse (geprüft an fünf Strassen, Median rund 1 m daneben).
- Luzern kennt kein Netz: 3,00 m bei Tempo 50 und mehr ohne Velostreifen oder Radweg in der Planung, sonst 2,50 m; mindestens 2,00 m (Standards Fuss- und Veloverkehr Kanton Luzern; Stadt Luzern mindestens 2,00 m).

Luzern ohne AV: Fahrbahnbreite, Trottoirbreiten, Breitenmessung und die Flächen auf der Karte stammen aus den Strassenflächen der Stadt (`ladeAvLuzern` in [`av.ts`](VeloroutenCheckWeb/src/av.ts), ArcGIS REST `map.stadtluzern.ch`, `OGD/strassenflaeche`, Layer 3). Die Flächen folgen der AV-Systematik (Feld `ART_BB`): Strasse und Weg werden zu «Strasse_Weg», dazu Trottoir, Verkehrsinsel, übrige befestigte Fläche und Gebäude (`luArt`). Sie decken den Strassenraum der Stadt samt Littau ab, nicht die ganze Bodenbedeckung. Probe vom 17.10.2026: Fahrbahnbreiten von 8,35 bis 16,27 m und Trottoirs von 1,86 bis 4,96 m an Luzerner Strassen.

**Massnahmenvorschlag (seit 17.10.2026 Bern, seit 20.10.2026 alle Städte mit Planung)** ([`vorschlag.ts`](VeloroutenCheckWeb/src/vorschlag.ts)). Nutzerentscheid vom 17.10.2026 (ersetzt den vom 16.10., keine Vorschläge zu machen): Der Kasten «Vorschlag» in der Planung nennt die erste Massnahme, die die Note auf mindestens 4,5 bringt; «Als Planung übernehmen» ersetzt die Elemente, danach ist alles frei änderbar. Der Rechner ist eine Portierung des lokalen Zielbild-Rechners (`Rechner/zielbild/massnahmen.py`, `querschnitt.py`) mit derselben Rangfolge: 1 Markierung (Sicherheitsstreifen, Radstreifen verbreitern oder markieren, Velo vom Fussweg in die Fahrbahn), 2 Kernfahrbahn (Q 5; der schmale Kern nur als Alternative), 3 Parkierung aufheben (zuerst eine Seite, dann beide) mit Rang 1/2, 4 Velostrasse (Q 9), 6 Radweg bauen (Q 2a/2b), 7 Tempo 30, nur wenn nichts anderes reicht. Unter gleichem Rang zählt weniger Parkierung weg, weniger Eingriffe, eine Seite vor beiden, dann die bessere Note. Platz nach den Querschnittsblättern: Fahrspuren 2 × 3,00 m (Radweg 2 × 3,25 m, Einbahn 3,00 m, mit Gleis 3,25 m), Radstreifen Standard 2,50/1,80 m und Minimal 1,80/1,50 m, Parkierung 1,90 m mit Sicherheitsstreifen 0,80 m (minimal 0,50 m), Trennung zum Radweg 0,15 m; eine Parkierung auf Trottoirniveau braucht keine Fahrbahnbreite. Die Kernfahrbahn gilt wie lokal nur mit belegtem DTV (nicht mit «≤ 2000 angenommen»). Je zwei Zeilen: **ohne Randsteinanpassung** (verfügbar ist das Feld «Verfügbare Fahrbahnbreite») und **mit Randsteinanpassung** (`trottoirAnpassung`): die Trottoirs kommen auf die Vorgabe des gewählten Fussverkehrsnetzes. Schmalere werden auf die Vorgabe verbreitert, zulasten der Fahrbahn (Nutzerentscheid 17.10.2026, Kirchenfeldstrasse); breitere werden nur um den nötigen Teil schmaler, anteilig nach ihrem Überschuss, nie unter die Vorgabe. Die Trottoirs rechnen auf 5 cm gerundet wie der Seitenraum der Bilanz (vorher blieb ein Fehlmass von 0,01 m, Jungfraustrasse). Tempo 30 trägt die Planung als eigenes Feld (`Aufteilung.tempo`, mit Knopf «Tempo wie heute»); Note, Prüfung und Kernfahrbahn rechnen damit. Der Bericht nennt den übernommenen Vorschlag als «Ausgangspunkt».

Abweichungen zum lokalen Rechner: Rang 5 (Haltestelle umbauen, seit 20.10.2026 auch online) prüft zusätzlich den Platz: An der Haltestelle liegt auf der Seite alles ausserhalb der Haltekante, mindestens 3,10 + 0,30 + 1,60 + 2,00 = 7,00 m (Standard 7,90 m), aus Trottoir und Fahrbahn ohne MIV und Gegenseite; fehlt es, kein Umbau, ist es unbekannt, ein Vermerk; «Übernehmen» baut HS 1 in die Planung; die Velostrasse ohne die Bedingung «Quartierstrasse» (die Hierarchie fehlt online); keine Parkplatzzahl und keine Hinweise zu Steigung, Schwerverkehr und Sicht; die Note rechnet die Online-Bewertung. Fehlt eine Ist-Breite, rechnet der Vorschlag trotzdem (Nutzerentscheid 20.10.2026): Für die Note gilt wie in der Ausgangslage die Vorgabe, vermerkt als «Ist nicht vollständig erfasst … angenommen»; für Platz und Regeln gilt die Breite als unbekannt wie im lokalen Rechner. Abgleich vom 20.10.2026 mit den Eingaben und Vorschlägen des lokalen Rechners (1 681 Berner Segmente): Wo die Note von heute online gleich ist und die Daten sich gleich abbilden lassen (787 Segmente ohne Haltestelle, Einbahn oder unbekannte Parkseite), stimmen Rang und Text bei 774 überein; die übrigen 13 wählen wegen der anderen Notenrechnung eine andere Breite oder Stufe. Bei 329 Segmenten weicht schon die Note von heute ab (lokal die verfeinerte Note). Übernommene Vorschläge ergeben in der Planung bei 512 von 517 dieselbe Note; die übrigen haben eine Umweltspur oder eine Einbahn mit Velogegenverkehr, die die Planung nicht als eigenes Element kennt, und der Kasten weist darauf hin. Jede Alternative lässt sich wie der Vorschlag übernehmen («Alternative übernehmen»).

**Andere Städte (seit 20.10.2026).** Zürich, Basel und Luzern haben denselben Vorschlag. Die Rangfolge ist eine normative Festlegung (Nutzerentscheid 20.10.2026) und gilt überall; die Städte unterscheiden sich über ihre Note (Soll-Führungsform, Breiten, in Basel der Strassentyp) und über die Masse der Platzprüfung (`masseFuer`): die der Stadt, wo ihre Standards etwas nennen (`vorgabe()` und die Breiten der Stadt: Radstreifen, Radweg, Sicherheitsstreifen, Längsparkierung, Fahrstreifen, Trennstreifen, Kernfahrbahn, Velostrasse), sonst die Berner als Ersatz; welche, nennt der Vermerk des Vorschlags. Immer nach Bern: die Restbreite neben Radweg und Tram, der Velostreifen neben der Kernfahrbahn und die Grenzen der Kernfahrbahn (DTV, Tempo). Das reduzierte Mass einer Stadt ist ihr Minimum für beide Routentypen; ist es gleich dem Standard, gibt es keine Stufe «minimal». Die Kernfahrbahn hat die Obergrenze der Stadt (Zürich und Basel keine), den schmalen Kern (Pilot) gibt es nur in Bern. Die Velostrasse ist auch dort möglich, wo die Stadt sie als Soll nennt (Basel). Die Hinweise auf die Berner Querschnittsblätter (Q …) fallen weg. Die Randsteinanpassung braucht ein Fussverkehrsnetz der Stadt (Zürich: Bedeutung des Stadtraums, Basel: Teilrichtplan); Luzern hat keines. Für Bern bleibt alles gleich (Abgleich unverändert); für die anderen Städte gibt es keinen lokalen Rechner zum Abgleich.

**Ergänzungen vom 20.10.2026** (Nutzerliste mit 15 Punkten):
- **Bedienung der Elemente:** «−»/«+» ändern die Breite um 10 cm (auf 5 cm gerundet). Der Pfeil auf einem Element ist eine Knopfgruppe «← ↑ →»; jede Richtung lässt sich einzeln ein- und ausschalten, damit auch kombinierte Pfeile gehen (keine gedrückt = kein Pfeil). Die Auswahl der Elemente ist thematisch gruppiert (Fussverkehr, Velo, Wege ausserhalb der Fahrbahn, Trennung, Fahrbahn, Parkierung und Aufenthalt, Grün), innerhalb der Gruppe alphabetisch (`TEIL_GRUPPEN`). Wird eine Fahrspur zur Kernfahrbahn, fallen die übrigen Fahrspuren, Fahrbahnen ohne Mittellinie und Tramspuren weg; ihre Breite geht in den Kern (4,50–5,50 m), mit Hinweis.
- **Neue Elemente:** «Mittelinsel» (Standard 2,00 m, gehört zur Fahrbahn, erhöht gezeichnet) und die Wege ausserhalb der Fahrbahn «Kombinierter Fuss-/Radweg» (bis 21.10.2026 «Fuss-/Radweg (gemeinsam)»; jetzt wie die Führungsform benannt), «Zweirichtungsradweg», «Radweg abgesetzt», «Fussweg, Velo gestattet» (`WEG_FORM`); sie prüfen gegen die Breitenvorgabe der Bewertung und werden in der Note als diese Führungsform gelesen.
- **Skizze:** unter der Fahrbahn das Mass «Ganzer Querschnitt», heute wie Planung. Eine Velostrasse steht in der Ausgangslage als Velostrasse über die Fahrbahn (vorher Fahrspuren).
- **Wege ohne Fahrbahn** (OSM `highway` ohne Strasse, `Section.ohneFahrbahn`): Die Ausgangslage ist nur der Weg; seine Breite ist die Breite der Führungsform oder die aus der AV ermittelte Fläche. Der Vorschlag kennt hier, nicht im lokalen Katalog: «Als Fuss-/Radweg signalisieren (Q 11)», wenn der Weg die Vorgabe schon hat (Rang 1), «Fuss-/Radweg auf … verbreitern (Q 11)» und «Fuss- und Veloverkehr trennen: Zweirichtungsradweg … + Fussweg 2,00 m» (Rang 6, mit dem Vermerk, dass der Platz daneben nicht geprüft ist). Ohne DTV und Tempo rechnet er ohne Motorfahrzeugverkehr. «Velo in die Fahrbahn» gibt es dort nicht.
- **Schräg- und Senkrechtparkierung** (`parkierungTiefe` in [`breitenmessung.ts`](VeloroutenCheckWeb/src/breitenmessung.ts)): Die Tiefe je Seite wird aus den Parkfeldflächen quer zur Achse gemessen (längengewichteter Median der vorherrschenden Anordnung); ab 2,60 m ist sie schräg oder senkrecht. Unterschieden wird mit der Länge je Feld entlang der Achse, wo die Daten die Anzahl Felder der Reihe nennen (Bern `ANZAHL_PARKFELDER`): ab 2,85 m je Feld schräg, darunter senkrecht; schräg ab 3,20 m je Feld 45°, darunter 60°. Die Schwelle liegt zwischen der gemessenen Senkrechtparkierung (bis 2,8 m) und dem Feld schräg 60° der Normalien Stadt Bern 2.10.22 «Parkfelder» (2,90 m; senkrecht 2,50 m, schräg 45° 3,55 m) (Probe Kirchenfeld: längs 5,0–6,5 m, senkrecht 2,4–2,8 m, schräg rund 3,5 m; Egghölzlistrasse: schräg 45°, 3,5–3,8 m je Feld, Tiefe 5,05 und 5,25 m). Ohne Anzahl bleibt «Schräg- oder Senkrechtparkierung». In Zürich kommt die Anordnung aus den Daten (`orientierung`), die Tiefe ist dort nach den Berner Normalien angenommen (schräg 5,25 m wie 60°, senkrecht 5,00 m; 45° wären 4,90 m). Die Längsparkierung behält die Vorgabe. Für Schräg- und Senkrechtparkierung gilt keine Vorgabe; Ausgangslage und Vorschlag rechnen mit der Tiefe. In der Planung lässt sich die Anordnung jeder Parkierung wählen (längs, schräg 60°, schräg 45°, senkrecht; «schräg (Winkel offen)» für die Zürcher Daten). Eine gemessene Tiefe bleibt beim Umstellen zwischen schräg und senkrecht stehen; nur ohne Messung (von längs her, Zürich) wird nach den Normalien vorbelegt: schräg 60° 5,25 m, 45° 4,90 m, senkrecht 5,00 m. Bei der Messart «Zwei Punkte» bleiben die AV-Kanten sichtbar.
- **Fahrspuren aus OSM** (`spurenAusTags` in [`osm.ts`](VeloroutenCheckWeb/src/osm.ts), Nutzerbefund Kirchenfeldstrasse 20.10.2026): Die Ausgangslage übernimmt die Anzahl Fahrspuren je Richtung (`lanes:forward`/`lanes:backward`, sonst `lanes`, bei Gegenverkehr hälftig, nur bei gerader Zahl) und ihre Pfeile (`turn:lanes:forward`/`:backward`, auf der Einbahn `turn:lanes`). Seite A ist die Way-Richtung, wenn der Abschnitt mit ihr läuft. Die Spuren teilen sich die Fahrbahn zu gleichen Teilen; ab drei Spuren bekommt die erste den Rundungsrest. Mit Tram fährt es auf der innersten Spur jeder Richtung. Busspuren zählt OSM in `lanes` mit; sie werden nicht abgezogen. Beim Zusammenfassen gelten die Spuren des massgebenden Segments. Der Vorschlag rechnet weiter mit zwei Fahrspuren (Nutzerentscheid 20.10.2026: Abbiegestreifen sind eine Knotenfrage).
- **Haltestelleninsel** (seit 21.10.2026, Nutzerentscheid; Befund Monbijoustrasse; `haltestelleninsel` in [`breitenmessung.ts`](VeloroutenCheckWeb/src/breitenmessung.ts), `haltestelleninselUebernehmen` in [`aufteilung.ts`](VeloroutenCheckWeb/src/aufteilung.ts)): Hat der Abschnitt eine Haltestelle (ÖV-Angebot, erkannte Haltestelle oder gewählter Typ) und Gegenverkehr, sucht die App beim Laden der AV eine Verkehrsinsel bis 10 m neben der Achse, mindestens 15 m lang, hinter der auf der achsfernen Seite nur ein Streifen Strasse von höchstens 4,50 m bis zum Bord liegt. Sie gilt dann als Wartebereich statt als Mittelinsel: Die Fahrbahn misst nur bis zur Insel, das Trottoir der Seite liegt hinter dem Streifen, die Ausgangslage zeigt Trottoir · Streifen · Haltestelle (Insel) und daneben die Fahrbahn. Ein Streifen unter 3,00 m ist eine Veloumfahrung (Element «Radweg abgesetzt», seine Breite füllt «Breite Veloführung Haltestelle»), sonst eine Fahrspur (Inselhaltestelle). Der Haltestellentyp wird vorbelegt, wo keiner gewählt ist, mit dem Chip «angenommen»: auf der Seite der Insel «Haltestelle mit Veloumfahrung» bzw. «Inselhaltestelle», gegenüber mit Tram «Kaphaltestelle» (bei Bus bleibt die Wahl offen). Steht auf der Insel keine Wartehalle, ist sie nur Ein- und Ausstieg (eigenes Element «Haltestelle: Ein- und Ausstieg», Perron mindestens 2,00 m, Masterplan S. 65 «Wartehalle hinter Veloumfahrung»), und die Fläche hinter der Veloumfahrung ist der Wartebereich statt eines Trottoirs (Nutzerbefund Monbijoustrasse 21.10.2026). Wo die Wartehalle steht, liest die App aus OSM (`ladeWartehallen` in [`osm.ts`](VeloroutenCheckWeb/src/osm.ts), `wartehalleLage`): Wartehalle auf der Insel (`amenity=shelter` mit `shelter_type=public_transport` oder Perron mit `shelter=yes`, bis 0,5 m neben der Insel) → die Insel ist der Wartebereich; sonst Wartehalle hinter dem Streifen oder Perron mit `shelter=no` auf der Insel → Ein- und Ausstieg. Fehlt beides in OSM, gilt eine Insel unter 2,50 m als Ein- und Ausstieg (`HS_INSEL_WARTEHALLE_MIN_M`, Annahme; die 3,10 m des Masterplans sind in der Wirklichkeit zu viel). Gegenüber, bei einer Kap- oder Fahrbahnhaltestelle, ist das Trottoir an der Haltestelle der Wartebereich; dasselbe gilt im Haltestellenbereich. Gemessen wird an mehreren Querschnitten über die Länge der Insel (alle 4 m, Mediane), an den Kanten; nach innen läuft der Strahl über eine Schutzinsel hinweg (Schwarzenburgstrasse: ein einzelner Querschnitt durch den Schwerpunkt traf die Schutzinsel des Fussgängerstreifens und ergab 3,6 statt 10,2 m Fahrbahn). Probe Monbijoustrasse: Insel 2,20 m, Veloumfahrung 1,65 m, Fahrbahn 7,90 m, Trottoir 2,90 m; Schwarzenburgstrasse: Insel 3,15 m, Veloumfahrung 1,85 m, Fahrbahn 10,20 m, Trottoir 2,35 m. Den Helvetiaplatz (Perron als «Platz» in der AV) deckt die Regel nicht ab; dafür gibt es «Querschnitt am Luftbild».
- **Parallele Wege als Veloführung der Strasse** (`parallelwege.ts`, seit 21.10.2026, Nutzerbefund Schwarzenburgstrasse: der Radweg 26177986 lief als eigener Abschnitt neben der Strasse 1568298241, deren Seite «Mischverkehr» zeigte): Beim Übernehmen prüft die App jeden Weg ohne Fahrbahn (Radweg, Fuss-/Radweg, Fussweg mit Velo) gegen die Strassen: Liegt er auf mindestens 60 % seiner Länge höchstens 20 m neben einer Strasse, ist er deren Veloführung. Ein Einbahn-Weg gilt für die Seite der Richtung, in die er läuft (gleich wie der Way → Way-Seite rechts, entgegen → links); ein Weg in beide Richtungen (Zweirichtungsradweg, Fuss-/Radweg, Fussweg mit Velo) für beide Seiten. Form und Breite der Seite kommen aus dem Weg (`Cand.parallel`, `Section.parallelWeg`, Hinweis im Abschnitt), der Weg wird abgewählt und ist kein eigener Abschnitt; wählt man ihn wieder an, ist er wieder einer. Liegt der Weg auf der AV-Fläche «Trottoir» (`wegAufTrottoir`, mindestens die Hälfte seiner Punkte; `trottoir.wegA/wegB`), misst die Trottoirmessung ihn mit, und die Ausgangslage zieht seine Breite vom Trottoir ab (Schwarzenburgstrasse: Trottoir 5,0 → 3,5 m + Radweg 1,5 m). Trottoirs ohne Velofreigabe (`highway=footway` ohne `bicycle`) lädt der Rechner nicht; ihre Breite kommt aus der AV (Trottoirmessung).
- **OSM «separate»:** Ist der Radweg in OSM als eigener Weg neben der Strasse erfasst (`cycleway:*=separate`), zeigt die Abschnittskarte einen Hinweis je Seite (`radwegSeparat`); die Führungsform setzt der Rechner daraus nicht.
- **Tram in der Fahrbahn enger erkannt** (seit 21.10.2026, `TRAM_OVERLAP_M` 8 m statt 20 m in [`cityShared.ts`](VeloroutenCheckWeb/src/cityShared.ts); Nutzerbefund Bubenbergplatz): Das Tram auf dem Trassee hinter dem Mittelstreifen, rund 12 m neben der Achse, machte die MIV-Fahrbahn zur Tramstrasse. Gleise in der eigenen Fahrbahn liegen bis rund 5 m neben der Achse.
- **Einbahn mit Bus bzw. Tram im Gegenverkehr** (seit 21.10.2026, Nutzerbefund Helvetiaplatz): Ist eine Strasse für Autos und Velos eine Einbahn, Bus oder ÖV fahren aber in beide Richtungen (OSM `oneway:bus=no`, `oneway:psv=no` oder `oneway:tram=no` → `oevGegen`), hat die Ausgangslage zur Spur in Richtung A eine Gegenspur in Richtung B: mit Tram beide als Tramspur (je ein Tram pro Richtung in der Skizze), sonst eine Fahrspur mit Bus. Auf der Einbahn lassen sich Fahrspur und Tram auch von Hand in Richtung B stellen. Der Vorschlag rechnet dann mit zwei Spuren wie bei Gegenverkehr. Die Bewertung bleibt: Für das Velo ist es eine Einbahn, bewertet wird Seite A.
- **Versetzte Parkierung** (`parkierungVersetzt` in [`breitenmessung.ts`](VeloroutenCheckWeb/src/breitenmessung.ts)): Liegen die Parkfelder beider Seiten an verschiedenen Stellen (abwechselnd Seite A und B), steht in einem Querschnitt nur eine Seite. Erkannt wird das beim Laden der AV in Schritten von 1 m entlang der Achse: beide Seiten mindestens 10 m Parkierung, gegenüber höchstens auf einem Viertel der kürzeren. Die weniger tiefe Seite (bei gleicher Tiefe die kürzere) wird «versetzt» (`parkVersetzt`, Element `versetzt`): Sie zählt weiter für die Bewertung (Dooring), aber nicht in der Bilanz und nicht für die Fahrspuren, und die Skizze zeigt sie nur als Hinweis unter dem Querschnitt. Der Vorschlag rechnet ebenso, solange gegenüber parkiert wird. In der Planung lässt sich «versetzt» je Parkierung von Hand setzen.
- **Mittelinsel aus der AV** (`mittelinsel`): Jede AV-Verkehrsinsel bis 30 m Länge (`MITTELINSEL_MAX_LAENGE_M`) und bis 10 m neben der Achse, die quer auf beiden Seiten an Strasse grenzt, auch eine kurze Schutzinsel am Fussgängerstreifen. Nur solche kurzen Inseln gehören zur Fahrbahn und werden von den Strahlen der Fahrbahn- und Trottoirmessung überquert. **Längere Inseln sind ein Mittelstreifen** (`mittelstreifen`, seit 21.10.2026, Nutzerbefund Bubenbergplatz: 161 m langer Streifen zwischen der MIV-Fahrbahn mit Umweltspur und dem Tram-/Bustrassee): Die Fahrbahn reicht nur bis zum Streifen (Bubenbergplatz 14,5 statt 29,7 m); dahinter liegt ein zweiter Fahrbahnteil (Gegenfahrbahn oder ÖV-Trassee), der nicht zum Abschnitt gehört. Das steht als Hinweis in der Statusmeldung und unter dem Abschnitt (`Section.mittelstreifen`); ist der Streifen dahinter unter 3 m, ist es vermutlich eine Haltestelleninsel mit Veloumfahrung, und der Hinweis sagt, ÖV-Angebot und Haltestellentyp zu wählen. Den ganzen Strassenraum nimmt «Querschnitt am Luftbild» auf. Die Inselbreite wird seit dem 21.10.2026 genau an den Kanten der Insel gemessen (vorher in 5-cm-Schritten, bis 10 cm zu breit; Probe Monbijoustrasse 2,25 → 2,20 m); die Fahrbahn über die Insel war schon genau. Gemessen werden Breite, Länge und die Fahrbahn von Bord zu Bord samt Insel (Probe Laubeggstrasse: 2,10 m breit, 7 m lang, 10,1 m). Sie steht als Hinweis bei der Fahrbahnbreite (nicht in der Note) und im Bericht; die Ausgangslage der Planung zeigt den Querschnitt durch die Insel mit je einer Fahrspur daneben. Die Fahrbahnbreite aus der AV läuft seither über eine Mittelinsel hinweg bis zum Bord der Gegenseite. Mit Insel schlägt der Vorschlag keine Kernfahrbahn und keine Velostrasse vor.
- **Layout:** Im Breitbild lässt sich der Eingabebereich mit dem Trenner zwischen Karte und Panel verbreitern (ein Balken wie in fgsCheck, der beim Überfahren, mit der Tastatur und beim Ziehen in der Akzentfarbe aufleuchtet) (Standardbreite bis doppelt so breit, höchstens 70 % des Fensters; Pfeiltasten, Doppelklick = Standard); bei offener Planung ist er automatisch breiter. Die gezogene Breite merkt sich der Browser je Modus.

Einbahn (Korrektur 17.10.2026): Die Ausgangslage spiegelte die Seite A an den linken Rand, samt Velostreifen. Jetzt steht links nur eine Parkierung, wenn die amtlichen Parkfelder dort eine zeigen (`einbahnParkLinks`, Anteil ≥ 30 % wie «Parkierung rechts»).

**AV auf der Karte.** Bei Abschnitten von der Karte zeigt die Planung die Bodenbedeckung der amtlichen Vermessung über dem Orthofoto, wie in fgsCheck: Strasse, Trottoir, Verkehrsinsel und Gebäude als Flächen, mit Legende und Quellenangabe. Geladen wird beim Öffnen der Planung oder mit „AV auf der Karte zeigen", in denselben Ausschnitten wie die Fahrbahnbreite (höchstens sechs zu 500 m). Beide teilen sich einen Zwischenspeicher je Abschnitt, damit nichts doppelt abgefragt wird. Gezeigt wird höchstens ein Abschnitt; Zoom und Ausschnitt bleiben, wenn er im Bild ist. Dazu kommen die amtlichen Parkfelder der Stadt (`ladeParkflaechen` in [`parkierung.ts`](VeloroutenCheckWeb/src/parkierung.ts); Bern, Zürich, Luzern): dieselben Felder, die «Parkierung rechts» vorbelegen. Zürich veröffentlicht Längsstreifen als Linien und Einzelfelder als Punkte; gezeichnet werden die Linien als 2 m breite Streifen (`streifen`), die Punkte als Quadrate von 2 × 2 m, weil die Daten nur Längs-, Quer- oder Schrägparkierung nennen, nicht den Winkel zur Strasse. Basel hat keine Parkfelder mit Geometrie. Parkfelder sind blau, Parkverbotsfelder orange; sie werden parallel zur AV geladen, pro Abschnitt zwischengespeichert und mit Quellenangabe gezeigt. Sind sie nicht erreichbar, bleibt die AV allein stehen.

**Querschnitt am Luftbild aufnehmen** (seit 20.10.2026, [`querschnittAufnahme.ts`](VeloroutenCheckWeb/src/querschnittAufnahme.ts); Nutzerbefunde Monbijoustrasse, Helvetiaplatz). Wo die Messung aus der AV nicht trifft (Insel an einer Haltestelle mit Veloumfahrung dahinter, Perron als «Platz», Busbucht), legt man den Querschnitt von Hand fest: «📐 Querschnitt am Luftbild» im Menü «📏 Messen» der Planung, dann quer über die Strasse von Rand B nach Rand A an jeder Grenze klicken (Hauswand oder Trottoirrand, Bord, Markierung, Insel, Gleismitte). Die Punkte liegen auf der Linie quer zur Achse am ersten Punkt (`querLinie`), die Breiten sind also echte Querschnittsmasse. Nahe einer Kante der AV rastet ein Punkt auf die Stelle ein, an der die Querlinie sie schneidet (`grenzenAufLinie`, `fangeLage`; Fangradius 12 Bildschirmpunkte, höchstens 3 m — wie in fgsCheck, dort auf Stützpunkte). Jedes Stück wird ein Element, vorbelegt nach der AV-Fläche unter seiner Mitte (`artVorschlag`: Trottoir und übrige befestigte → Trottoir, Verkehrsinsel → Haltestelle, wenn der Abschnitt eine hat, sonst Mittelinsel, Grünflächen → Grünstreifen, Strasse → Fahrspur) und in der Werkzeugleiste änderbar. Der Schalter «Ziel» (Heute · Planung · Beides, seit 22.10.2026 wie beim Element-für-Element-Messen; vorher drei Knöpfe) bestimmt, was «Übernehmen» tut: «Heute» ersetzt die gemessene Ausgangslage (`Section.querschnittHeute`, von `startAufteilung` genommen; die Fahrbahnbreite wird die Summe der Fahrbahnteile, Herkunft «gemessen»), «Planung» die Elemente der Planung, «Beides» beide. Unter der Skizze steht dann «von Hand am Luftbild aufgenommen» mit «Verwerfen». In der Liste gibt es zusätzlich «Ganzer Querschnitt (nur die Gesamtbreite)» (seit 21.10.2026): Ein so bezeichnetes Stück, etwa Hauswand bis Hauswand, wird kein Element, sein Mass ist die verfügbare Breite. Allein übernommen bleiben die Elemente, und die Breite ausserhalb der Fahrbahn ist der Rest bis zur Gesamtbreite (`Section.gesamtbreite` für heute, `Aufteilung.seitenraum` für die Planung); zusammen mit Elementen gilt dasselbe für die aufgenommenen Elemente.

**Element für Element messen** (seit 22.10.2026, Nutzerwunsch Neubrückstrasse: «ich messe, sage das ist Trottoir; ich messe und sage dies ist Fahrbahn»). «📏 Element für Element» im Menü «📏 Messen» der Planung öffnet die Messung «Zwei Punkte» am Luftbild und lässt mehrere Messungen nacheinander zu: Jede Messung wird mit «Anfügen» als neues Element der gewählten Art angefügt (rechts, am Rand der Seite A) oder mit «Übertragen» als Breite auf ein bestehendes Element gesetzt; die Messung bleibt offen bis «Fertig». Der Schalter «Ziel» bestimmt, ob die Elemente in die Planung oder in den Querschnitt von heute gehen (`Section.querschnittHeute`, wie «Querschnitt am Luftbild · als heute»: die Fahrbahnbreite wird die Summe der Fahrbahnteile, Herkunft «gemessen»; eine unveränderte Planung wird daraus neu aufgebaut). Daneben hat jedes Breitenfeld in der Teileliste einen Knopf «📏»: Er startet die Messung gleich mit diesem Element als Ziel. Vorher ersetzte jede neue Messung die vorherige, und nur die letzte kam als Element an.

**Street View.** Jeder Abschnitt von der Karte hat in der Kopfzeile und in der Werkzeugleiste der Planung den Knopf «Street View ↗»: Google Maps (`map_action=pano`) an der Stelle des Karten-Markers, mit Blick in Fahrtrichtung der Seite A; Google wählt das nächste Panorama.

**Trottoirs aus der AV.** Mit dem Laden misst die App die Trottoirbreite je Seite (`trottoirbreiten` in [`breitenmessung.ts`](VeloroutenCheckWeb/src/breitenmessung.ts)). Sie verwendet dieselben Querschnitte alle 5 m wie die Fahrbahnbreite. Der Strahl läuft bis zur Bordsteinkante und von dort über die AV-Fläche «Trottoir» bis zu ihrem Ende; aneinanderstossende Trottoirflächen zählen als eine. Liegt hinter dem Bord etwas anderes (Grünfläche, Vorplatz, Bahn), zählt der Querschnitt als «ohne Trottoir». **Grünstreifen** (seit 20.10.2026, Nutzerbefund Spöndlistrasse Zürich: hinter dem Bord 0,30 m Trottoir, dann eine Grünfläche als Loch in der Trottoirfläche, dahinter der Fussweg): Endet das Trottoir an einer Grünfläche (Gartenanlage, übrige humusierte, Acker/Wiese) von höchstens 4 m und folgt dahinter wieder Trottoir, misst die App weiter; ebenso, wenn die Grünfläche direkt hinter dem Bord liegt und erst dahinter das Trottoir (Schwarzenburgstrasse, 21.10.2026: Grün 2,44 m, Trottoir 2,97 m). Der Strahl zum Bord läuft wie bei der Fahrbahnbreite über eine kurze Mittel- oder Schutzinsel hinweg. Liegt direkt hinter dem Bord ein schmaler befestigter Streifen (Bankett, «übrige befestigte Fläche», bis 1,50 m) und dahinter das Trottoir, zählt der Streifen zum Trottoir (Schwarzenburgstrasse 1568298241: beidseits 1,0 m Bankett, dann 4,0 bzw. 3,0 m Trottoir). Das Trottoir ist dann der Fussweg dahinter; ein Trottoirstreifen davor unter 0,50 m zählt zum Grünstreifen. Der Grünstreifen gilt, wenn er auf mindestens der Hälfte der Querschnitte mit Trottoir liegt, sonst sind es einzelne Baumscheiben. Er steht in der Ausgangslage und im Vorschlag als eigenes Element «Grünstreifen» zwischen Fahrbahn und Trottoir und zählt zum Seitenraum (`trottoir.gruenA/gruenB`). Eine Seite hat ein Trottoir, wenn es auf mindestens der Hälfte ihrer Querschnitte gefunden wird und mindestens drei Werte vorliegen; dann gilt der Median. Breiter als 8 m (Platz) zählt nicht; steht auf dem Trottoir eine Parkierung (siehe «Parkierung auf Trottoirniveau»), gilt die Grenze um deren Tiefe plus 0,50 m höher (`zuschlag`; Neubrückstrasse 75984517 zwischen Mittel-/Engestrasse und Bonstettenstrasse, 22.10.2026: beidseits 8,7 bzw. 8,9 m Trottoir mit Längsparkierung darauf, Fahrbahn 6,50 m; vorher fehlten beide Trottoirs). Ist die Fahrbahnbreite des Abschnitts noch leer, wird sie mit derselben Abfrage gemessen. Ist die Planung noch die unveränderte Ausgangslage, wird sie mit den Messwerten neu aufgebaut. Hat eine schon geänderte Planung kein Trottoir, kommen die gemessenen an die Ränder (`mitTrottoirs`), damit die bestehenden Trottoirs beim Planen nicht verloren gehen. Stichprobe vom 16.10.2026 an 14 Berner Strassenachsen: An 18 von 28 Seiten fand die Messung ein Trottoir von 1,40 bis 6,61 m. An den zwei Achsen ohne jeden Fund liegt hinter dem Bord in der AV tatsächlich kein Trottoir, sondern Bahn, Grünfläche oder übrige befestigte Fläche; die übrigen Seiten ohne Fund sind nicht einzeln geprüft.

**Parkierung auf Trottoirniveau** (seit 17.10.2026, Nutzerbefund Kanzleistrasse Zürich): Manche Längsparkierung liegt hinter dem Randstein auf der Fläche, die die AV als «Trottoir» führt. Die Messung zählte sie zum Trottoir, und die Ausgangslage setzte sie zusätzlich auf die Fahrbahn. Jetzt prüft `parkierungAufTrottoir` ([`breitenmessung.ts`](VeloroutenCheckWeb/src/breitenmessung.ts)) mit den Parkfeldern der Karte je Seite: Liegen die Felder bis 9 m neben der Achse nach Fläche mindestens zur Hälfte mit ihrem Schwerpunkt auf einer Trottoirfläche, steht die Parkierung dieser Seite auf Trottoirniveau (Felder neben den Achsenenden zählen nicht). Ist dort «Parkierung rechts» Ja, setzt die Ausgangslage die Parkierung mit dem Merkmal «auf Trottoirniveau» zwischen Fahrbahn und Trottoir, und das Trottoir wird um ihre Breite schmaler (Kanzleistrasse: 6,00 m → Trottoir 4,10 m + Parkierung 1,90 m). Eine solche Parkierung liegt ausserhalb der Fahrbahn (`istFahrbahnTeil`): Sie zählt nicht zur Summe der Fahrbahnteile, aber zur Bilanz über den ganzen Querschnitt, ist in der Skizze erhöht und zählt in der Bewertung weiter als Parkierung (Dooring). Das Merkmal lässt sich je Parkierung in der Planung an- und abwählen. Probe vom 17.10.2026: Kanzleistrasse Nordseite erkannt, Südseite (Felder auf der Fahrbahn) nicht; an sechs Berner Achsen (Manuel-, Brunnadern-, Länggass-, Seftigenstrasse) nur eine Seite, mit einem einzelnen Feld auf der Trottoirfläche; wirksam wird der Befund nur, wo «Parkierung rechts» Ja ist.

**Bericht / PDF** ([`Bericht.tsx`](VeloroutenCheckWeb/src/Bericht.tsx)). „Bericht / PDF" oben im Panel (seit 22.10.2026, Nutzerbefund «musste ich lange suchen») oder in der Werkzeugleiste der Planung öffnet eine Druckansicht über der App, als PDF über den Druckdialog des Browsers (A4 hoch, Muster aus fgsCheck). Sie enthält:
- die Angaben zum Abschnitt, mit einer Bezeichnung, die sich nur für den Bericht eintragen lässt;
- das Kartenbild: ein einziges Luftbild SWISSIMAGE per WMS in LV95 (`wmsBildUrl`, `ausschnitt` in [`kartenbild.ts`](VeloroutenCheckWeb/src/kartenbild.ts)), kein Leaflet-Ausschnitt, weil Kacheln beim Drucken oft nicht fertig laden; darüber als SVG die Achse als rote Linie und, wenn in der Planung geladen, die AV-Flächen und Parkfelder;
- die Skizzen «Heute» und «Planung» mit der Quellenangabe der Illustrationen direkt darunter, die Elemente mit Prüfung, die Bilanz und die Befunde zur Kernfahrbahn;
- die Bewertung je Seite heute und mit der Planung, mit der Beurteilung des Abschnitts, immer als Erfüllungsgrad mit der Note in Klammern («Gar nicht erfüllt (Note 2,0)», seit 22.10.2026; vorher je nach Schalter «2,0 (Gar nicht erfüllt)» oder nur der Erfüllungsgrad);
- Annahmen, Grenzen und Quellen.

Unter den Skizzen steht die Quellenangabe der Illustrationen; die Annahmen nennen die Genauigkeit der Masse (Mediane aus der AV, Klickgenauigkeit am Luftbild, angenommene Breiten). Seite 1 zeigt immer die Angaben zum Abschnitt und das Kartenbild (Seitenverhältnis höchstens 0,75, damit beides Platz hat); ab Seite 2 folgen Querschnitt (Skizzen auf 80 % der Breite), Elemente, Bewertung, Annahmen und Quellen. Der Bericht kann mehr als zwei Seiten umfassen.

Der Bericht druckt ohne Seitenrand (`@page { margin: 0 }`); den Rand bildet ein Rahmen, dessen Kopf und Fuss sich auf jeder Seite wiederholen (`.bericht-rahmen`). So setzt der Browser keine eigene Kopf- und Fusszeile mit Titel, Adresse, Seitenzahl und Datum dazu.

Oben im Panel öffnet «Bericht / PDF» die Planung direkt, wenn es genau eine gibt; bei mehreren klappt eine Wahl des Abschnitts auf, ohne Planung ein Hinweis mit «Planung für Abschnitt n beginnen». Fehlt die AV des Abschnitts auf der Karte, lädt sie mit, damit das Kartenbild die Flächen zeigt.

«Drucken» wird frei, sobald das Luftbild geladen ist, nicht geladen werden konnte oder nach 20 s nicht da ist; dann ohne Hintergrund. Der Titel des Dokuments schlägt den Dateinamen vor (`VeloroutenCheck_Aufteilung_Abschnitt-<Nr>_<Datum>`).

Abbiegespuren prüft die Aufteilung nicht. Sie lebt nur in der Sitzung und steht nicht im CSV. Sie geht verloren, wenn die Seite neu geladen wird oder die Abschnitte neu entstehen, etwa beim Übernehmen oder beim Teilen eines Segments. „⇄ Seiten tauschen" spiegelt sie.

**Abschnitte als Akkordeon, Reiter «Bewerten» und «Planen»** (seit 22.10.2026, UI/UX-Review; vorher waren nach dem Übernehmen alle Abschnitte offen, bei 11 Abschnitten eine Seite von 16 000 px). Nach «Segmente in Strecke übernehmen» ist nur der erste Abschnitt offen. Die Kopfzeile jedes Abschnitts zeigt Nummer, Beurteilung (oder «Eingabe nötig»), die Beurteilung mit der Planung, Name mit Länge und Segmenten, «Aufteilung planen» und «Street View ↗»; ein Klick auf sie, auf die Nummer auf der Karte (Marker, seit 22.10.2026 anklickbar) oder der Sprung aus der Strecken-Leiste öffnet den Abschnitt und klappt die anderen zu. Im offenen Abschnitt gibt es zwei Reiter: **Bewerten** (Grunddaten, ÖV-Haltestelle, Seiten, Ergebnis je Seite, OpenBikeSensor) und **Planen** (Vorschlag, Skizze, Elemente, Bilanz, Note); der Reiter «Planen» legt die Planung an, wenn noch keine da ist. Die Reiter tragen seit dem 22.10.2026 abends keine Note mehr (sie stand doppelt zur Kopfzeile). Der Werbekasten «Neue Aufteilung der Strasse planen» unter jedem Ergebnis und die Knöpfe oben neben «Anzeige» sind weg. Über der Abschnittsliste misst «Fahrbahnbreiten aus AV (n Abschnitte)» die Fahrbahnbreite nacheinander für alle Abschnitte von der Karte, die noch keine haben (vorher je Abschnitt «aus AV ermitteln»; der Knopf im Abschnitt bleibt). Meldungen erscheinen zusätzlich als Toast unten im Panel (5 s, Fehler 9 s), damit sie auch beim Arbeiten tief in der Planung sichtbar sind.

**Kopf: Bewerten | Planen und Bericht / PDF; der Erfüllungsgrad vorne** (seit 22.10.2026 abends, Nutzerwünsche). Oben im Panel stehen die beiden Hauptfunktionen: **Bewerten | Planen** stellt alle Abschnitte auf den gleichnamigen Reiter; «Planen» öffnet dazu den massgebenden Abschnitt (sonst den ersten) und legt dort die Planung an, wie ein Klick auf seinen Reiter. Daneben **Bericht / PDF** (siehe oben). Der frühere Schalter «Anzeige: Schulnote | Erfüllungsgrad» (Standard Schulnote) ist weg: Überall steht der Erfüllungsgrad vorne und die Note klein dahinter («Gar nicht erfüllt · Note 2,0»; `Beurteilung` in App.tsx), im Bericht als «Gar nicht erfüllt (Note 2,0)».

Die Beurteilung steht an **drei** Stellen mit je eigener Aufgabe (vorher an fünf): in der **Strecken-Leiste** oben (bleibt beim Scrollen stehen; Klick springt zum massgebenden Abschnitt; «Abschnitte ▾» klappt die Beurteilung jedes Abschnitts auf, ein Klick öffnet ihn; mit einer Planung dahinter «→ mit der Planung», je Abschnitt die Planung, wo es eine gibt, sonst heute), in der **Kopfzeile jedes Abschnitts** und im **Ergebnis jeder Seite**. Weggefallen sind der zweite Strecken-Kasten über der Abschnittsliste (seine Einzelnoten stehen jetzt in der aufgeklappten Leiste) und die Note an den Reitern.

Im **Ergebnis jeder Seite** heissen die Zeilen «Vorgabe» und «Heute» statt «Soll» und «Ist», ohne Querschnittstyp (Q1 …). «Details zur Note» heisst «Wie die Beurteilung entsteht» und ist eine Abzugsliste (`Herleitung` in App.tsx): Ausgangspunkt 6,0 (Umweltspur und Fussweg mit ihrem eigenen), «Führungsform: Mischverkehr statt Radstreifen oder Radweg» mit dem Abzug 6 − Form-Note, Breite, Parkierung rechts (Dooring), Haltestelle, Tram-Deckel, darunter die gerundete Note mit dem Erfüllungsgrad. Vorher stand dort «feel-safe-Defizit 41 Pkt. → Form-Note 3,1» (Nutzerbefund: nur für Kundige verständlich). Der Link «wie dieser Abzug entsteht» klappt den Referenzteil unten auf und springt zu **«Wie die Note entsteht»** (`HerleitungNote`): Feel-Safe-Werte je Form und Tempo, 14,2 Punkte je Note mit Beispiel, Sonderregeln, weitere Abzüge und die Tabelle Note → Erfüllungsgrad. Alle Zahlen dort kommen aus den Konstanten in `fuehrungsform.ts` (`FEELSAFE`, `SCORE_PRO_NOTE`, `BREITE_SATZ`, `PARKEN_ABZUG`, `HALTESTELLE_ABZUG`, `TRAM_DECKEL`, `FUSSWEG_BASIS`). Auf den lokalen Anhang zur Feel-Safe-Herleitung verweist die öffentliche App bewusst nicht.

**Planung aufgeräumt** (seit 22.10.2026). Die Werkzeugleiste hat drei Gruppen statt sieben gleichwertiger Knöpfe (die auf dem Handy aus dem Panel liefen): das Menü «📏 Messen» (Querschnitt am Luftbild, Element für Element), die Ansicht (AV zeigen/ausblenden, Street View, Bericht/PDF) und rechts das Menü «Zurücksetzen» (Auf heute zurücksetzen, Planung verwerfen). Jedes Element hat zwei Zeilen: oben Griff ⠿, Nummer, Art, Breite mit «−»/«+»/«📏» und «✕»; darunter gedämpft Bild, Pfeil, Anordnung der Parkierung, «auf Trottoirniveau», «versetzt», Richtung, auf Touch-Geräten die Pfeile zum Verschieben (sonst Drag and Drop) und «＋ dahinter». «✕» entfernt ein Element; der Hinweis darunter nimmt es mit «↩ Rückgängig» zurück (ebenso den Wechsel auf eine Kernfahrbahn). Die Skizze hat einen Umschalter Heute · Planung · Beide; solange die Planung wie heute ist, steht nur «Heute» (mit dem Vermerk «Die Planung ist noch wie heute»). Der Kasten «Vorschlag» nennt zuerst das Ergebnis je Variante, die Erklärung der Rangfolge steht als Fussnote. Erklärsätze unter Feldern (Fussverkehrsnetz, Seiten) stehen hinter einem «ⓘ» (Tooltip, auf Klick ausgeklappt). Zahlenfelder zeigen Meter beim Verlassen mit zwei Nachkommastellen («3,60»), DTV und Tempo ohne; getippt wird frei (vorher auch Gleitkomma-Reste wie «2,405000000000»). Die Beschriftung der Blickrichtung in der Skizze wird auf schmalen Bildschirmen in drei Stufen kürzer («← B» / «A →»), statt sich zu überlagern. Die Werkzeugleisten auf der Karte (Breite einer Seite, Element für Element, Querschnitt) haben denselben Rahmen: Titel mit «✕» (auch Esc), Anleitung, Ergebnis, Ziel, Aktionen, Quellenzeile. Der Kartenhintergrund wird unten links auf der Karte gewählt (Luftbild · Karte · CyclOSM, beim Luftbild dazu das Kästchen «Strassennamen», standardmässig aus) statt über die Leaflet-Ebenenwahl oben rechts.

**Ein- und ausklappen.** Damit weniger gescrollt werden muss, lassen sich einklappen: die Legende der Führungsformen unter der Karte, die Abschnitte in der Strecken-Leiste, jeder Abschnitt (▾ in der Kopfzeile), darin die Grunddaten und die Seiten, und die Herleitung der Note («Wie die Beurteilung entsteht»; Vorgabe und Heute bleiben sichtbar).

**Karten-Hilfen.** Mehrere Abschnitte sind auf der Karte **nummeriert** (passend zu „Abschnitt 1/2/3" im Rechner); der Pfeil am Marker zeigt die Fahrtrichtung der Seite A. Beim Überfahren einer Abschnittskarte mit der Maus werden die zugehörigen Segmente hervorgehoben — so lassen sich automatisch befüllte Werte gezielt pro Abschnitt prüfen und korrigieren. ÖV-Haltestellen erscheinen als Marker. Die Linienfarben zeigen die Ist-Führungsform (aus OSM).

**Wann erscheint die Note?** Erst wenn die nötigen Felder jeder bewerteten Seite gefüllt sind (`seiteKomplett` in [`bewertung.ts`](VeloroutenCheckWeb/src/bewertung.ts)): die **Führungsform** immer; **DTV und Tempo** bei allen Formen ausser Umweltspur und Fussweg Velo gestattet (`brauchtDtvTempo`); die **Breite** bei allen Formen mit Breitenvorgabe — nicht bei Mischverkehr und nicht bei «Einbahn Velogegenverkehr ohne Markierung» (`brauchtBreite`). Stadtspezifisch: In **Bern** gilt ein fehlender DTV bei bekanntem Tempo als ≤ 2'000, sofern der Abschnitt von der Karte stammt und der Verkehrsdaten-Layer für ihn abgefragt werden konnte (siehe [Bern](#bern)); bei von Hand angelegten Abschnitten ist der DTV einzugeben; in **Basel** ist der DTV nie Pflicht, dafür der **Strassentyp**. Bis dahin steht „Eingabe nötig" mit den Feldern, die noch fehlen (`fehlendeEingaben` in [`bewertung.ts`](VeloroutenCheckWeb/src/bewertung.ts)). Solange ein Abschnitt unvollständig ist, bleibt auch die Strecken-Note offen.

**Abschnitts- und Strecken-Note.** Weicht Seite B ab, erhält jede Seite ihre eigene Note mit Erklärung; der Abschnitt erhält die Note der **schlechteren Seite**, die als „massgebend für den Abschnitt" markiert ist (`bewerteAbschnitt` in [`bewertung.ts`](VeloroutenCheckWeb/src/bewertung.ts)). Ist Seite B wie Seite A, gilt eine Note für beide. Die Strecke erhält die Note ihres **schlechtesten Abschnitts**. Angezeigt werden jede Abschnitts-Note einzeln, die Strecken-Note und der massgebende (schlechteste) Abschnitt.

**Andere Standards.** Unter der Note steht dieselbe Bewertung nach den Standards der drei anderen Städte (Kürzel + Note, `vergleichsNoten` in [`fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts)); ein aufklappbares „Warum?" nennt die Treiber einer Abweichung (andere Soll-Führungsform, andere Umweltspur-Regel, andere Soll-Breite, andere Haltestellen-Regel, stadtspezifischer Hinweis). Die Soll-Führungsform wird nur genannt, wo sie die Note trägt — nicht bei Umweltspur und Fussweg Velo gestattet. Reine Zusatzinformation. Fehlt der Basler Strassentyp, wird er aus dem Verkehr geschätzt (`baselStrassentypAusVerkehr`: Tempo > 30 oder DTV ≥ 5'000 → verkehrsorientiert), was in der Zeile ausgewiesen wird.

**CSV-Export.** „Als CSV exportieren" lädt alle Abschnitte mit Eingaben, Herkunft, Soll-Führungsform, Note und den OpenBikeSensor-Überholabständen als `.csv` herunter (`buildCsv` in [`csv.ts`](VeloroutenCheckWeb/src/csv.ts)). Die Spalten «ÖV-Takt [Min]» und «Breite Haltestelle [m]» stehen am Ende. Die seitenbezogenen Spalten davor beschreiben Seite A; «Note» und «Erfüllungsgrad» sind die Abschnittsnote. Danach folgen die Seiten: «Seiten» (beide/eine), «Fahrtrichtung Seite A», «Note Seite A» und die Felder von Seite B mit «Note Seite B». Wird Seite B nicht bewertet, bleiben ihre Spalten leer. Ganz am Ende stehen «Fahrbahnbreite [m]» mit ihrer Quelle und «OBS Stand», der Stand des OpenBikeSensor-Exports. Text, der mit `=`, `+`, `-` oder `@` beginnt, erhält einen vorangestellten Apostroph, damit eine Tabellenkalkulation ihn nicht als Formel liest.

---

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

*Zürich* (Velostandards, Abb. 1 S. 14) — je Routentyp; Tempo > 50 immer Radweg:

```
Velovorzugsroute (→ Velohauptroute)      ≤ 30 km/h                 31–50 km/h
  DTV < 2'500                            Mischverkehr              Radstr./Radweg
  DTV 2'500–7'500                        Radstr./Radweg            Radstr./Radweg
  DTV ≥ 7'500                            Radstr./Radweg            Radweg
Hauptnetz (→ Veloroute)
  DTV < 5'000                            Mischverkehr              Radstr./Radweg
  DTV ≥ 5'000                            Radstr./Radweg            Radstr./Radweg
```

*Luzern* (Anwendungshilfe S. 29, auf die Berner Formen vereinfacht: Markierung = Radstreifen) — Radweg ab DTV ≥ 15'000, bei 41–50 km/h schon ab 10'000 und immer bei > 50 km/h; Mischverkehr nur bei ≤ 30 km/h und DTV < 5'000 bzw. bei 31–40 km/h und DTV < 2'000; dazwischen Radstreifen (`fuehrungsartLuzern`).

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

radwege-check / FixMyCity, **tram-bereinigt**. Gezählt wird jede Bewertung der **Velo-Foto-Szenen** (Szenen-Merkmal `Kamera = C` — der Blickwinkel des Fotos bestimmt, welche Rolle bewertet wird), unabhängig von der Befragtengruppe; auch die Urteile der potenziellen Velofahrenden sind enthalten. Werte **unabhängig aus den Einzelantworten nachgerechnet** (`tools/verify_06.py`, §5; Kreuzvalidierung gegen den offiziellen `voteScore`: Abweichung höchstens 0,01 Punkte über 1'700 Szenen), je Tempo-Kontext, grosse Fallzahlen (N je Wert ≈ 2'000–22'000):

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
Radstreifen                   3.0            6.0         6.0
Radstreifen oder Radweg       2.0            5.0         6.0
Radweg                        1.0            4.0         6.0
```

Bei Tempo ≤ 30 (ruhig) fallen dieselben Abweichungen milder aus:

```
Soll \ Ist                Mischverkehr   Radstreifen   Radweg
Radstreifen                   3.0            6.0         6.0
Radstreifen oder Radweg       2.0            5.0         6.0
Radweg                        1.5            4.0         6.0
```

<sub>Nachgerechnet am 07.09.2026 mit den Ankern 24/13 · 65/58 · 90/84 und Kurs 14,2 (Übergang = Mittel 77,5 / 71); vor Breiten-, Parkierungs- und Haltestellen-Abzügen. Die bis dahin abgedruckten Tabellen stammten noch aus der Kette 77/73 mit Kurs 14,4.</sub>

### 3. Breiten-Abzug und Parkierung

Nach der Führungsform-Note wird die **Breite** der Anlage gegen die **Soll-Regelbreiten der jeweiligen Stadt** geprüft (Fallback je Feld: Bern-Regelbreiten). Massgeblich ist je nach Routentyp **Optimal** (Velohauptroute) oder **Minimal** (Veloroute). Der Abzug-Mechanismus ist stadtübergreifend; nur die Sollwerte unterscheiden sich — die stadtspezifischen Tabellen stehen unter [Datenherkunft je Stadt](#datenherkunft-je-stadt).

*Bern-Regelbreiten (zugleich Fallback für nicht abgedeckte Felder):*

```
Ist-Form (Querschnittstyp)        Optimal   Minimal
Radstreifen                  Q1     2.50      1.80
Radweg strassenbegl. / Gesch. Radstreifen  Q2  2.50   1.80
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
                 auf der Fahrbahn                 1,0         1,0     (Radstreifen, Einbahn mit Markierung)
                 hinter baulicher Trennung        0,24        0,38    (Radwege, Zweirichtungsradweg, Fuss-/Radwege, Einbahn mit baulicher Trennung)
                 Fahrgassen-Bänder                0,9         0,9     (Velostrasse, Umweltspur)
Endnote      = runde_0,5( Führungsform-Note − Breitenabzug , begrenzt 1…6 )
```

##### Woher die drei Sätze kommen

**Fahrbahn: 1,0 Notenstufen je Meter — vorläufige Kalibrierung aus zwei Erhebungen** (seit 22.09.2026). Zwei Befragungen haben gemessen, wie viel Feel-Safe-Punkte ein Meter Radstreifenbreite bringt, in unterschiedlichen Breitenbereichen:

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

**Beispiel** (Fortsetzung: DTV 12'000 / 50 km/h / Ist Radstreifen → Form-Note ungerundet 4,17):

```
Velohauptroute, Radstreifen, Breite 1,80 m
  Sollbreite   = Optimal 2,50 m
  Defizit      = 2,50 − 1,80 = 0,70 m
  Breitenabzug = 0,70 × 1,0 = 0,70
  Endnote      = 4,17 − 0,70 = 3,47 → 3,5
```

Das Tempo steckt weiterhin in der Note — über die feel-safe-Anker der Führungsform und, hinter baulicher Trennung, über den Satz. Bei erfüllter Breite (Ist ≥ Vorgabe) gibt es keinen Abzug.

**Chronik des Fahrbahn-Satzes:** bis 10.08.2026 ein einzelner gepoolter Wert (0,6; mischte die Parkierungswirkung in den Breiteneffekt), dann tempoabhängig aus dem sauber geschnittenen Berliner Gestrichelt-Pool (0,65/0,74, P10-U/P13), seit 22.09.2026 die Kalibrierung 1,0 unter Einbezug der Berner Bildumfrage.

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

→ **Deckel: höchstens Note 3**, nur Mischverkehr, tempo-unabhängig, **nicht an einer Haltestelle mit separater Velofläche** (seit 29.09.2026: dort fährt das Velo an der Schiene vorbei). Konstante `TRAM_DECKEL`, tunbar. Auf einem Niveau von 9,4 % bzw. 5,4 % feel-safe lässt sich keine bessere Note begründen — und ein Deckel kappt nur nach oben, statt eine ohnehin schlechte Note weiter zu drücken. Dazu: **Kaphaltestelle an einer Tram-Haltestelle** ohne bauliche Trennung → **Note 1** (`KAP_NOTE`), weil das Velo dort über die Schienen an die Haltekante gedrängt wird, während Fahrgäste ein- und aussteigen. Auslöser ist der Berner Typ «Kaphaltestelle» (HS3) zusammen mit **einem** der beiden Tram-Merkmale, «Tram in der Fahrbahn» oder ÖV-Angebot «Tram»; der Basler Typ «Kap» löst die Regel nicht aus.

> _Seit 14.08.2026._ Vorher wirkte der Befund als tempoabhängiger Abzug (−1,2 / −0,7, `TRAM_MALUS`). Die Umstellung gleicht den Online-Rechner an den lokalen Berner Rechner an; der Befund selbst ist unverändert. Vollständiger Rechenweg und Reproduktion: `tools/verify_06.py` (§2) bzw. `docs/07_Tram_in_der_Fahrbahn.md`.

### 4. Sonderfälle (Umweltspur, Velostrasse, Fussweg)

#### Umweltspur (Q4, Bus+Velo)

DTV und Tempo sind **nicht massgebend**, sondern der **Bus-Takt** (zusätzliches Feld öV-Takt [Min]) und die Breite. Die Eignung sinkt mit steigender Busfrequenz (kürzerem Takt) und ist nach oben gedeckelt, davon der Breiten-Abzug (× 0,9). **Decke und Takt-Modell sind stadtspezifisch** (Konstanten `UMWELTSPUR_DECKE` und `UMWELTSPUR_TAKT`): Bern rechnet mit **Stufen**, Zürich und Luzern mit einer **Rampe** (`umweltspurBasis()`) — Note 1 bei Takt ≤ `taktNote1`, die Decke ab Takt ≥ `taktOk`, linear dazwischen. Ohne Takt-Angabe gilt die Decke — ein eingetragener Takt kann die Note nur senken; ein Takt ≤ 0 zählt als «nicht erfasst».

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

#### Einbahn mit Velogegenverkehr (Q7)

Dreistufig, je nach Sicherung der Gegenrichtung (`GEGENVERKEHR_FORMEN`): **ohne Markierung** = Rang wie Mischverkehr, keine Breitenvorgabe; **mit Markierung** = Rang wie Radstreifen (Fahrbahn-Satz); **mit baulicher Trennung** = Rang wie Radweg. Regelbreiten Bern 2,00 / 1,80 m, Stadt-Überschreibungen: Zürich 1,80 / 1,80, Basel 2,50 / 1,80, Luzern 2,50 / 2,00. Wird **nicht** automatisch aus OSM erkannt (ein Contraflow-Streifen fällt auf die zugrunde liegende Anlage zurück), sondern im Dropdown von Hand gewählt; Vorgabe «mit Markierung». Auf einer OSM-Einbahn mit `oneway:bicycle=no` weist die Maske darauf hin; die Gegenrichtung lässt sich dann als Seite B erfassen.

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
  `Defizit_m × Fahrbahn-Satz` (markierte Velofläche auf Fahrbahnniveau → Radstreifen-Satz `BREITE_SATZ`, seit dem 22.09.2026 einheitlich **1,0** bei > 30 km/h). Der Masterplan nennt für
  HS1/HS4 den Bereich 1,8–2,5 m (Standard 1,80, situativ bis 2,50, minimal 1,60); der Rechner rechnet mit 1,8 als Sollwert
  und 1,6 als Minimum (HS4 bis 20.10.2026 mit 2,5; Nutzerentscheid: Minimum 1,60, anzustreben 1,80 bis 2,50 — `HALTESTELLEN` in [`fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts)).

> Normativ: zu Haltestellen gibt es keine FixMyCity-Daten → Schwellen aus dem Masterplan bzw.
> gesetzt. Parameter `HALTESTELLE_ABZUG` (1,0) und `BREITE_SATZ`, tunbar.

**Haltestellenbereich (nur Bern, seit 20.10.2026, Nutzerentscheide; nur online, der lokale Rechner bleibt unverändert).** Prägt die Haltestelle den Abschnitt (Schalter «Haltestellenbereich» in der ÖV-Haltestelle), zählt für die Note je Seite mit Haltestelle allein die Haltestelle (`haltestellenbereichNote` in [`fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts)): der Haltestellentyp, von Hand erfasst, gegen die Soll-Lösung oben. Führungsform, DTV, Tempo, Parkierung und Tram-Deckel zählen dort nicht; eine Seite ohne Haltestelle wird normal bewertet.

| Fall | Note |
|---|---|
| erfüllt: separater Typ, wo separate Velofläche verlangt ist; im Übergang und im Mischverkehr jeder Typ (auch Fahrbahnhaltestelle, Busbucht, Kaphaltestelle ohne Tram) | **6**, minus Abzug für eine zu schmale Velofläche (wie oben) |
| separate Velofläche verlangt, Typ der Familie Mischverkehr | **2** (`HALTESTELLENBEREICH_NICHT_ERFUELLT`) |
| Kaphaltestelle an einer Tramhaltestelle | **1** (`KAP_NOTE`) |

Die App schlägt den Schalter vor, wenn die ÖV-Erkennung eine Haltestelle im Abschnitt findet und er höchstens 60 m lang ist (`HALTESTELLENBEREICH_MAX_M`, Länge aus den Segmenten), mit dem Grund und «Nein» zum Ablehnen. Im CSV steht er in der letzten Spalte «Haltestellenbereich».

---

## Datenquellen und Herkunft

Beim Laden liefert **OpenStreetMap** die Basis; wo amtliche Quellen verfügbar sind, werden die Felder daraus **angereichert** (vorausgefüllt, nicht ersetzt). Prinzip und Zuordnung sind stadtübergreifend; welche Quelle je Stadt welches Feld füllt, zeigt die Matrix unten, die Stadt-Details folgen darunter.

### Prinzip der Anreicherung

**OSM als Basis (alle Städte).** OpenStreetMap (Overpass API) liefert die Geometrie, den Strassennamen und — wo getaggt — Tempo (`maxspeed`), Breite (`width`/`cycleway:*:width`) und die Ist-Führungsform. Die Strassensuche ist gross-/kleinschreibungsunabhängig.

**Amtliche Anreicherung.** Zusätzliche Quellen (Geoportale, WFS/ArcGIS-Dienste, gebündelte Snapshots) füllen einzelne Felder. Live-Dienste werden bei jedem Laden einer Strasse / „Segmente im Kartenausschnitt laden" dazugeladen — bewusst so, damit die Daten automatisch aktuell bleiben. Schlägt eine einzelne Quelle fehl (Server kurz nicht erreichbar), wird sie übersprungen und der Import läuft mit den übrigen weiter.

**Zuordnung über Überlappung statt Nähe.** Jedes OSM-Segment wird dem Geodaten-Feature zugeordnet, das tatsächlich *entlang* des Segments verläuft — gemessen am Anteil der (verdichteten) Segmentpunkte innerhalb 20 m der Feature-Linie (≥ 50 %; Velostrassen strenger mit ≥ 60 %, da sie die Ist-Führungsform setzen). Das verhindert, dass eine bloss **kreuzende** Strasse fälschlich zugeordnet wird (was eine reine Mittelpunkt-/Nächste-Punkt-Suche z. B. bei der Jungfraustrasse tat, wo Tempo/DTV/Routentyp dadurch leer blieben oder von der Querstrasse stammten). Implementiert in [`VeloroutenCheckWeb/src/geo.ts`](VeloroutenCheckWeb/src/geo.ts) und [`cityShared.ts`](VeloroutenCheckWeb/src/cityShared.ts).

**Vorrang amtlich > OSM.** Liegt ein Wert sowohl amtlich als auch aus OSM vor (z. B. Tempo), gilt der amtliche Wert. Die Herkunft ist nach dem Übernehmen feldweise am Chip erkennbar (siehe [Bedienung](#bedienung)). Der bauliche **Haltestellentyp** (HS1–7) steht in keiner Quelle → bleibt immer manuell.

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
| Hinweis Radstreifen je Seite | Luftbild-Snapshot `luftbild_bern.json` (nur Hinweis) | `luftbild_zurich.json` (seit 16.10.2026) | `luftbild_basel.json` (seit 16.10.2026) | – |
| Breite am Luftbild messen | Orthofoto + Bordsteinkante der AV (geodienste.ch, live beim Messen) | wie Bern | wie Bern | Ersatz: Strassenflächen der Stadt (ArcGIS, live) |
| Fahrbahnbreite | AV (geodienste.ch, live auf Knopfdruck) | wie Bern | wie Bern | Ersatz: Strassenflächen der Stadt (ArcGIS, live) |
| Parkierung je Seite | Parkplätze öffentlich (Geoportal, live) | Parkplätze DAV (WFS, live) | – (keine Geometrie) | öffentliche Parkplätze (ArcGIS, live) |
| Fussverkehrsnetz (Trottoir-Vorgabe der Planung) | Richtplan Fussverkehr (live) | – (Bedeutung von Hand) | Teilrichtplan Fuss- und Wanderwege (WFS, live) | – (Regel nach Tempo und Velostreifen) |
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

**DTV-Annahme.** Weil der Layer alle Strassen mit DTV > 2'000 und alle Altstadt-Strassen führt, gilt **kein Eintrag** bei bekanntem Tempo als **DTV ≤ 2'000**: Der Rechner rechnet dann mit dem Repräsentanten `DTV_ANGENOMMEN = 1000` (jeder Wert < 2'000 ergibt dasselbe Soll) und zeigt den Chip „angenommen ≤ 2000". Das gilt **je Abschnitt** und nur, wenn nachgesehen wurde (`dtvGeprueft`, gesetzt in [`bern.ts`](VeloroutenCheckWeb/src/bern.ts), ausgewertet von `dtvAssumed` in [`strecke.ts`](VeloroutenCheckWeb/src/strecke.ts)): Der Abschnitt stammt von der Karte, der Verkehrsdaten-Layer hat für jedes seiner Segmente vollständig geantwortet, und höchstens 20 % der Segmentlänge liegen an einer Verkehrsdaten-Linie. Von Hand angelegte Abschnitte, Segmente mit gescheiterter Abfrage und Segmente, die nur teilweise an einer erfassten Strasse liegen, zeigen „Eingabe nötig". Fehler, die der Dienst mit HTTP 200 ausliefert, und gekappte Ergebnisse gelten als gescheiterte Abfrage.

**Luftbild-Hinweis.** Der Snapshot [`luftbild_bern.json`](VeloroutenCheckWeb/public/luftbild_bern.json) enthält die Radstreifen-Funde einer automatischen Erkennung auf **SWISSIMAGE 10 cm, Flugjahr 2024**. Erkannt hat sie das Modell **remote_velo der ETH Zürich** (Papini, Zani, Adey 2026, MIT-Lizenz) in einem eigenen Lauf über die Stadt Bern, mit beiden veröffentlichten Modellen. Gespeichert ist je Fund die Mittellinie des Fund-Rechtecks, ohne Sicherheitswert ([`tools/luftbild_bern.py`](tools/luftbild_bern.py)). Aus der Lage zur Strassenachse liest der Rechner die Seite (`naechsteLinieJeSeite` in [`geo.ts`](VeloroutenCheckWeb/src/geo.ts), 12 m). Gegen die handverifizierten Seiten des lokalen Berner Rechners geprüft (14.10.2026), traf die Erkennung bei 50 einseitigen Radstreifen 41-mal die richtige Seite und nie die falsche; von 247 beidseitigen erkannte sie 179 auf beiden Seiten. Umweltspuren sieht das Modell meist als Radstreifen, darum erhalten sie keinen Hinweis. Eine Breite lässt sich aus den Funden nicht ablesen.

Seit dem 16.10.2026 gibt es denselben Hinweis für **Zürich** (`luftbild_zurich.json`, SWISSIMAGE Flugjahr 2025, 10 934 Funde) und **Basel** (`luftbild_basel.json`, Flugjahr 2024, 2 784 Funde), aus eigenen Läufen mit beiden Modellen über die ganze Gemeinde ([`tools/luftbild_stadt.py`](tools/luftbild_stadt.py) aus den Funden von `_lokal/luftbild_erkennung`). Handverifizierte Seiten wie in Bern gibt es dort nicht. Grobe Gegenprobe mit den Radstreifen und Radwegen in OpenStreetMap (16.10.2026, 15 m): In Zürich liegen 88 % der Funde nahe an einem OSM-Velostreifen oder -Radweg, und 81 % der OSM-Länge haben einen Fund; in Basel 82 % und 59 %; in Bern zum Vergleich 86 % und 81 %.

**ÖV: Tram und Bus-Takt.** Der Layer **Haltestellen** liefert die Marker, **OeV_Linien** den Modus entlang des Segments (`Verkehrsmittel_typ`). Verläuft eine **Tram**-Linie entlang und liegt eine Haltestelle im Abschnitt (nächste Haltestelle ≤ 30 m vom Segment, `STOP_DIST_M`), wird das ÖV-Angebot automatisch auf „Tram" gesetzt. Für **Bus** kommt der **Takt** aus dem GTFS-Snapshot (`oev_takt_bern.json`, flach `{ BPUIC → Bus-Fahrten/h }`, via [`tools/oev_takt.py`](tools/oev_takt.py)): Bus-Abfahrten in der Abendspitze 17:00–18:00 an einem Werktag (Di), in der stärksten Einzelrichtung; Join über die Haltestellen-`Id_opendata` (= BPUIC). Frequenzband: ≤ 4/h → `bus_ab15`, 5–12/h → `bus_5_15`, > 12/h → `bus_unter5`. OSM kennt zwar Linien und Haltestellen, aber keinen Takt — daher der Fahrplan.

### Zürich

Quellen je Feld siehe [Matrix](#datenherkunft-je-stadt): **Routentyp** live aus der **Velonetzplanung** (WFS `ogd.stadt-zuerich.ch`, `view_velonetz`); **DTV** live aus den **Verkehrsmessstellen** des Kantons ZH (OGD-WFS `ogd-0223_..._verkehrsmessstellen_p`, Feld `dtv`, partiell); Tempo/Ist-Führungsform/Breite aus OSM (Breite nur bei seltenem `cycleway:*:width`-Tag); Tram/Haltestelle aus OSM (nur Halte von Bus, Trolleybus und Tram — Bahn-, Schiffs- und Seilbahnhalte zählen nicht, `istStrassenHalt`); **Bus-Takt** aus dem georeferenzierten GTFS-Snapshot (`oev_takt_zurich.json`, der OSM-Haltestelle per nächstem Punkt ≤ 80 m zugeordnet).

**Routentyp-Mapping Zürich → Masterplan.** Der Zürcher Velonetzplan kennt drei Netzkategorien (Velostandards Stadt Zürich, S. 7); sie werden auf die beiden Masterplan-Routentypen übersetzt; der Routentyp steuert in Zürich die Soll-Führungsform (eigene Matrix je Routentyp, siehe [Soll-Führungsform](#1-soll-führungsform)), die massgebliche Breiten-Untergrenze (Optimal/Minimal) und die Haltestellen-Typenliste:

| Zürich `kategorie` | → Routentyp |
|---|---|
| `Vorzugsroute` | Velohauptroute |
| `Hauptnetz` | Veloroute |
| `Basisnetz` | *(kein Routentyp — manuell)* |

**Stadtspezifische Breiten-Sollwerte (Zürich).** Für Zürich gelten die **Standardmasse der Velostandards Stadt Zürich** (Tab. 1, S. 16) statt der Berner Regelbreiten — Velovorzugsroute → Velohauptroute (Optimal), Hauptnetz → Veloroute (Minimal):

| Führungsform | Velohauptroute | Veloroute |
|---|---|---|
| Radstreifen · Radweg strassenbegl./gesch. · Radweg abgesetzt | 2,50 m | 2,20 m |
| Zweirichtungsradweg | 4,80 m | 3,50 m |
| Umweltspur | 4,80 m | 4,50 m |
| Kombinierter Fuss-/Radweg | 3,50 m | 3,50 m |
| Einbahn mit Velogegenverkehr (markiert / baulich) | 1,80 m | 1,80 m |

Wo Zürich keine eigene Vorgabe hat (Velostrasse-Band 4,50–6,50 m, Fussweg Velo gestattet, Mischverkehr), gelten weiterhin die **Berner Werte** (Fallback je Feld). Implementiert als `BREITEN_ZUERICH` in [`fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts), übergeben über den `breiten`-Eintrag der Stadt-Registry. Die **Soll-Führungsform** folgt der **Zürcher** Tabelle (je Routentyp eine DTV × Tempo-Matrix, `fuehrungsartZuerich`); die feel-safe-Logik bleibt stadtübergreifend.



### Basel

Routentyp live aus dem **Teilrichtplan Velo** (WFS `wfs.geo.bs.ch`, Bestandsnetz mit den Flags `tv_pendlerroute`/`tv_basisroute`). Zusätzlich setzt der **Velostadtplan** (data.bs.ch, Datensatz `100426` «Velostadtplan: Eignung», `klassifikation = Velostrasse`, 87 Segmente) die **Ist-Führungsform = Velostrasse**, analog Berns Velostrassen-Layer. **Strassentyp** und **signalisierte Höchstgeschwindigkeit** kommen amtlich aus dem Datensatz **„Strassen und Wege"** (data.bs.ch, Dataset `100250`, Felder `strassenkategorie` / `geschwindigkeit`, geometrisch zugeordnet) — der Strassentyp ist für die Basler Soll-Wahl massgebend (verkehrs- vs. siedlungsorientiert), das Tempo hat als amtliche Quelle Vorrang vor OSM (nur reale Werte 20–60; 0/5 = Fussgängerzone/Schritttempo werden ignoriert). Übrige Ist-Führungsform aus OSM; Breite aus OSM nur bei seltenem `cycleway:*:width`-Tag (de facto meist manuell); Tram/Haltestelle aus OSM; **Bus-Takt** aus dem gebündelten GTFS-Snapshot (`oev_takt_basel.json`, via `tools/oev_takt.py`; der OSM-Haltestelle per nächstem Punkt zugeordnet); **DTV** aus dem gebündelten Zählstellen-Snapshot (`dtv_basel.json`, via `tools/dtv_basel.py`; data.bs.ch liefert nur Stundenwerte → offline zum Werktags-Mittel aggregiert, partiell je Zählstelle). Die übrigen Klassen der „Eignung" des Velostadtplans („gut befahrbares Velonetz", „sonstige für Velos geeignete Strassen") sind eine Komfortbewertung und werden **nicht** als Routentyp übernommen.

**Soll-Führungsform Basel.** Nicht DTV-, sondern **strassentyp**-basiert (× Routentyp; Tab. 3, S. 15). Auf **siedlungsorientierten** (nicht verkehrsorientierten) Tempo-30-Strassen: Vorzugsroute (Velohauptroute) → **Velostrasse** (DWV-Deckel 2'500); Pendler-/Basisroute (Veloroute) → **Mischverkehr** (DWV-Deckel 5'000, empfohlen) **oder Velostrasse** (mögliche Form, **kein** DWV-Deckel). «Einbahn Velogegenverkehr ohne Markierung» gilt auf Pendler-/Basisrouten wie Mischverkehr (zulässig, DWV-Deckel 5'000). Jede andere Ist-Form ist dort **nicht vorgesehen** → Note max. 4. Auf **verkehrsorientierten** Strassen → Vorzugsroute «Radstreifen oder Radweg», Pendler-/Basisroute «Radstreifen» (`fuehrungsartBasel`); eine **Velostrasse gibt es dort nicht** (nicht zulässig → Note max. 4). Der **Strassentyp** ist im Rechner ein eigenes Feld (nur bei Basel sichtbar, amtlich vorbefüllt) und für die Bewertung erforderlich. **DWV-Deckel** (form-abhängig): übersteigt der DTV den Höchstwert (Velostrasse·Vorzugsroute 2'500, Mischverkehr·Pendler-Basis 5'000; Velostrasse·Pendler-Basis kein Deckel), zeigt der Rechner eine **Warnung** zusätzlich zur Erklärung der Note (kein Notenabzug). **Velostrasse-Breite:** Nettobreite der Fahrgasse 4,50/4,30 m, bei **DWV < 1'000** reduziert **4,00 m** zulässig.

| Basel-Kategorie | → Routentyp |
|---|---|
| Velovorzugsrouten | Velohauptroute — *aber nicht als offene Geodaten verfügbar → manuell* |
| Basis-/Pendlerrouten (`tv_basisroute=ja` oder `tv_pendlerroute=ja`) | Veloroute |
| übriges Strassennetz | *(kein Routentyp — manuell)* |

Gemäss Velokonzept Basel-Stadt sind Basis- und Pendlerrouten **nicht** hierarchisiert (verschiedene Nutzergruppen, gleiche Stufe) → beide werden zur **Veloroute**. Die qualitativ höherwertigen **Velovorzugsrouten** (= Velohauptroute) sind weder im WFS/WMS noch auf data.bs.ch als Geodaten publiziert und können daher nicht automatisch gesetzt werden.

**Breiten-Sollwerte (Basel).** Standards Fuss- und Veloverkehrsinfrastruktur Basel-Stadt (2024), Tab. 4 — Standardmass (→ Velohauptroute) / reduziertes Standardmass (→ Veloroute); Fussweg und das Velostrassen-Maximum 6,50 m → Bern-Fallback (`BREITEN_BASEL` in [`fuehrungsform.ts`](VeloroutenCheckWeb/src/fuehrungsform.ts)):

| Führungsform | Velohauptroute | Veloroute |
|---|---|---|
| Radstreifen | 2,50 m | 1,80 m |
| Radweg strassenbegl./gesch. · Radweg abgesetzt | 2,50 m | 2,20 m |
| Zweirichtungsradweg | 4,00 m | 3,40 m |
| Umweltspur | 4,50 m | 3,00 m |
| Kombinierter Fuss-/Radweg | 6,00 m | 4,80 m |
| Velostrasse (Nettobreite Fahrgasse) | 4,50 m | 4,30 m |
| Einbahn mit Velogegenverkehr (markiert / baulich) | 2,50 m | 1,80 m |

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
| Kombinierter Fuss-/Radweg | 3,50 m | 3,50 m |
| Fussweg Velo gestattet | 3,50 m | 3,50 m |
| Einbahn mit Velogegenverkehr (markiert / baulich) | 2,50 m | 2,00 m |

### OpenBikeSensor (gemessene Überholabstände)

Wo vorhanden, werden je Abschnitt **gemessene Überholabstände** angezeigt (Median, Anteil unter 1,5 m gesetzlichem Mindestabstand, Anzahl Messungen, Befahrungen). Quelle ist ein Export aus dem [OpenBikeSensor-Portal](https://portal.openbikesensor.org/), als gebündelter Snapshot **pro Stadt** abgelegt (`VeloroutenCheckWeb/public/obs_bern.json`, `obs_zurich.json`) und client-seitig nachgeschlagen — kein Live-Bezug. Welche Datei geladen wird, bestimmt die Stadt-Auswahl (Städte ohne Snapshot, z. B. Basel, zeigen keine OBS-Werte). Aktualisierung: Datei durch einen neuen Portal-Export ersetzen.

**Zuordnung über Geometrie statt `way_id`.** OBS nutzt einen eigenen OSM-Schnappschuss und teilt lange Strassen in feinere Mess-Abschnitte; ausserdem werden OSM-Ways laufend geteilt/neu nummeriert. Ein reiner `way_id`-Join verfehlt darum Teilstücke (Beispiel: von 12 OBS-`way_id`s der Schosshaldenstrasse existiert eine nicht mehr im aktuellen OSM). Deshalb wird jedes OBS-Teilstück per **Überlappung** ([`VeloroutenCheckWeb/src/geo.ts`](VeloroutenCheckWeb/src/geo.ts)) genau dem am besten passenden OSM-Segment zugeordnet und alle Teilstücke eines Segments werden zusammengeführt (Median/Mittel aus dem kombinierten Messwert-Array, Anzahlen summiert) — schnappschuss-unabhängig und pro Segment.

**Befahren ohne Überholung sichtbar.** Hat ein Segment OBS-Befahrungen, aber keine aufgezeichnete Überholung (`overtaking_event_count` = 0), wird das ausgewiesen („befahren (n Befahrungen), aber keine Überholmessung aufgezeichnet") statt nichts anzuzeigen.

Die Überholabstände sind **reine Zusatzinformation** und fliessen **nicht** in die Führungsform-Note ein.

**Stand des Exports.** Die Werte kommen nicht live vom Portal, sondern aus gebündelten Exporten. Hinweis, Karten-Tooltip und CSV nennen darum den Stand je Stadt (`obsStand` in [`App.tsx`](VeloroutenCheckWeb/src/App.tsx)): Bern und Zürich «Juni 2026». Die Exporte tragen selbst kein Datum, weder Exportdatum noch Zeitraum der Fahrten; der Stand stützt sich auf die Dateidaten (Bern 22.06., Zürich 27.06.2026). Beim Ersetzen eines Exports ist `obsStand` nachzuführen.

### Datenlizenzen und Quellenangaben

| Quelle | Verwendung | Bezug | Lizenz / Quellenangabe |
|---|---|---|---|
| **OpenStreetMap** | Geometrie, Name, teils Tempo/Breite/Ist-Führungsform | Overpass API (live) | **ODbL** — „© OpenStreetMap-Mitwirkende", Attribution Pflicht |
| **Stadt Bern Geoportal** (Flächendeckende Verkehrsdaten, Signalisierte Höchstgeschwindigkeit, Veloroutennetz Masterplan, Velostrassen, Haltestellen, OeV_Linien, Parkplätze öffentlich) | DTV, Tempo, Routentyp, Velostrasse, ÖV (Tram/Haltestellen) | [opendata.swiss](https://opendata.swiss/) / `map.bern.ch` (ArcGIS REST, live) | **„Freie Nutzung. Quellenangabe ist Pflicht."** — Quellenangabe: „Geodaten Stadt Bern" |
| **Stadt Zürich Velonetzplanung** | Routentyp (Zürich) | OGD Stadt Zürich, WFS `ogd.stadt-zuerich.ch` (`view_velonetz`, live) | **Open Government Data** — Quellenangabe: „Stadt Zürich" |
| **Teilrichtplan Velo + Velostadtplan Basel-Stadt** | Routentyp + Velostrasse (Basel) | OGD Kanton Basel-Stadt, WFS `wfs.geo.bs.ch` + data.bs.ch (live) | **Open Government Data** — Quellenangabe: „Geodaten Kanton Basel-Stadt" |
| **Strassen und Wege Basel-Stadt** (Dataset `100250`) | Strassentyp + signalisierte Höchstgeschwindigkeit (Basel) | OGD Kanton Basel-Stadt, data.bs.ch (live) | **Open Government Data** — Quellenangabe: „Geodaten Kanton Basel-Stadt" |
| **Verkehrszähldaten Basel-Stadt** | DTV (Basel) | OGD Kanton Basel-Stadt, data.bs.ch (Snapshot `dtv_basel.json`, via `tools/dtv_basel.py`) | **Open Government Data** — Quellenangabe: „Geodaten Kanton Basel-Stadt" |
| **Velonetz Stadt Luzern** | Routentyp (Luzern) | OGD Stadt Luzern, ArcGIS REST `map.stadtluzern.ch` (live) | **Open Government Data** — Quellenangabe: „Geodaten Stadt Luzern" |
| **Öffentlich zugängliche Parkplätze DAV, Stadt Zürich** | Parkierung je Seite; Parkfelder auf der Karte in «Aufteilung planen» (Zürich) | WFS `ogd.stadt-zuerich.ch` (live) | **CC0** — Quellenangabe empfohlen: «Quelle: Stadt Zürich» |
| **Parkplätze auf öffentlichem Grund, Stadt Luzern** | Parkierung je Seite; Parkfelder auf der Karte in «Aufteilung planen» (Luzern) | ArcGIS REST `map.stadtluzern.ch` (`OGD/oeffentlicher_parkplatz`, live) | Freie Nutzung — «© Geoinformationszentrum Stadt Luzern» |
| **GTFS Fahrplan** | Bus-Takt (Abendspitze) → ÖV-Angebot-Band | [opentransportdata.swiss](https://opentransportdata.swiss/), Snapshots `VeloroutenCheckWeb/public/oev_takt_{bern,zurich,basel,luzern}.json` (via `tools/oev_takt.py`) | Open data — opentransportdata.swiss |
| **OpenBikeSensor** | Gemessene Überholabstände (Info, nicht in der Note) | Portal-Export, Snapshots `VeloroutenCheckWeb/public/obs_bern.json`, `obs_zurich.json` | „© OpenBikeSensor-Mitwirkende" |
| **CyclOSM** | Kartenhintergrund (wählbar) | Tile-Server (live) | © OpenStreetMap-Mitwirkende · Stil: CyclOSM |
| **swisstopo SWISSIMAGE** | Kartenhintergrund „Orthofoto" (Standard); Kartenbild im Bericht der Planung | WMTS `wmts.geo.admin.ch`, im Bericht WMS `wms.geo.admin.ch` (live) | © swisstopo |
| **swisstopo SearchServer** (Adressen) | Vorschläge der Strassensuche | `api3.geo.admin.ch/rest/services/api/SearchServer` (live, nach einer Tipp-Pause; übermittelt wird der Suchtext mit dem Stadtnamen) | © swisstopo |
| **Amtliche Vermessung** (Bodenbedeckung LCSF, Kantone Bern, Zürich, Basel-Stadt) | Bordsteinkante für die Breitenmessung und die Fahrbahnbreite; Trottoirbreiten und Flächen auf der Karte in «Aufteilung planen» | WFS `geodienste.ch/db/av_0` (live, nur während einer Messung, sichtbarer Ausschnitt bis ±300 m) | Nutzungsbedingungen von geodienste.ch und des jeweiligen Kantons; Fair Use der WFS-Abfragen — Quellenangabe «Amtliche Vermessung, Kanton …, geodienste.ch» je Stadt (in der Werkzeugleiste und am Chip) |
| **Luftbild-Erkennung** (SWISSIMAGE 2024/2025, Modell remote_velo der ETH Zürich) | Hinweis Radstreifen je Seite (Bern, Zürich, Basel; nicht in der Note) | Snapshots `VeloroutenCheckWeb/public/luftbild_{bern,zurich,basel}.json` (via `tools/luftbild_bern.py` bzw. `tools/luftbild_stadt.py`, eigene Läufe) | Luftbild © swisstopo; Modell MIT-Lizenz — Quellenangabe im Hinweis. Das Feld `in_2021` des ETH-Datensatzes (nicht-kommerzielle Lizenz) ist nicht enthalten |
| **Richtplan Fussverkehr Stadt Bern** (Layer «Basisnetz Fussweg bestehend») | Fussverkehrsnetz für die Trottoir-Vorgabe in «Aufteilung planen» | ArcGIS REST `map.bern.ch` (live, beim Öffnen der Planung) | Quellenangabe «Geodaten Stadt Bern» |
| **Teilrichtplan Fuss- und Wanderwege Basel-Stadt** (kantonales und kommunales Fusswegnetz, Bestand) | Fusswegnetz für die Trottoir-Vorgabe in «Aufteilung planen» (Basel) | WFS `wfs.geo.bs.ch` (live, beim Öffnen der Planung) | Quellenangabe «Geodaten Kanton Basel-Stadt» |
| **Strassenflächen Stadt Luzern** (`OGD/strassenflaeche`, Layer 3) | Ersatz für die AV in Luzern: Fahrbahn- und Trottoirbreite, Breitenmessung, Flächen auf der Karte | ArcGIS REST `map.stadtluzern.ch` (live, seitenweise zu 2 000 Flächen) | Open Government Data — «© Geoinformationszentrum Stadt Luzern» |
| **Streetmix-Illustrationen** (`@streetmix/illustrations` 2.1.3, Art direction Katie Lewis u. a.) | Illustrationen der Querschnitt-Skizze: Personen, Velos, Fahrzeuge vom Auto bis zum Tram (auch schräg und seitlich parkierte Autos), Ausstattung und Pfeilmarkierungen (44 Dateien); Boden, Masse und Markierungsstriche zeichnet der Rechner selbst | Dateien unverändert in `VeloroutenCheckWeb/public/streetmix/` | **CC BY-SA 4.0** — Quellenangabe unter der Skizze; Urheber und Lizenztext in `public/streetmix/README.txt` und `LICENSE.txt` |
| **swisstopo Landeskarte grau** | Kartenhintergrund „Landeskarte grau" (wählbar; seit 22.10.2026 statt CARTO Positron, dessen Kacheln ohne API-Schlüssel nur noch «API key required» zeigen) | WMTS `ch.swisstopo.pixelkarte-grau` (live) | © swisstopo |
| **swisstopo amtliches Strassenverzeichnis** | Strassennamen über dem Luftbild (Kästchen «Strassennamen» unten links auf der Karte, nur beim Luftbild, standardmässig aus; ab Zoomstufe 17, darunter deckten weisse Strassenflächen das Bild zu) | WMS `ch.swisstopo.amtliches-strassenverzeichnis` (live) | © swisstopo |

Die Pflicht-Attributionen werden in der App angezeigt: die Karten-Attribution des gewählten Hintergrunds unten rechts auf der Karte, die Herkunft der übrigen Werte über die Feld-Chips und die Status-/Lade-Meldung.

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

- **Parken × Breite** — der Effekt ist gemessen (0,6 Noten bei 3,5 m, 2,0 bei 2,0 m), aber **nicht umgesetzt**: Die Befragung kennt nur diese zwei Breiten, der reale Bestand liegt fast vollständig darunter, und ein dritter Messpunkt (Mischverkehr ≈ 0,15) widerspricht der Verlängerung nach unten. Es braucht Szenen unter 2,0 m Streifenbreite; bis dahin gilt die Pauschale −1,0 (Stand 09.08.2026, siehe Kapitel «Parkierung rechts»). Die Breitensätze selbst bleiben davon unberührt (1,0 auf der Fahrbahn, 0,24/0,38 hinter baulicher Trennung).
- **«Velo rechts vom Parken»** als eigene, bessere Parken-Lage aufnehmen (empirisch ≈ 92, aber nur 6 Szenen → erst mit besserer Datenlage).
- **Velostrasse «zu breit»:** der Abzug über der Maximalbreite (6,50 m) ist normativ gesetzt (gleicher Satz wie «zu schmal») — bei Bedarf eigener Satz/Schwelle.
- **«Radweg abgesetzt» (Q3) — nicht der Anker, sondern die Feel-Safe-Anzeige prüfen:** Im Seitenraum wird dieselbe Bauform tiefer beurteilt (76,9 % über alle Kameras, 81,6 % im Velo-Schnitt) als auf Poller-Niveau (≈ 90). Für die **Note** ist das folgenlos: Der Anker wirkt dort nur als Zielwert, und ein Radweg erfüllt jedes Soll, bevor ein Anker gelesen wird. Seit P11-A (13.08.2026) enthält der «schnell»-Anker (84) den Seitenraum bereits — die **Feel-Safe-Anzeige** liest für Seitenraum-Formen bei «ruhig» (90) weiterhin einen eher zu hohen Ist-Wert. <sub>Formulierung korrigiert am 10.08.2026: Zuvor stand hier ein «Berliner Abschlag», den man für Bern nicht übernehme — es gibt keine getrennte Berliner Quelle, die ganze Befragung ist Berlin, und die Begründung über den Berner Bestand war eine Annahme.</sub>
- **Einfärbung des Belags:** empirisch ein eigener, positiver Effekt (farbig vs. grau ≈ +7 feel-safe-Punkte; im Paper signifikant, Tab. 2) — bisher **nicht** im Modell. Könnte als eigener, datengestützter Faktor aufgenommen werden. Siehe [docs/08](docs/08_Studie_Subjektive_Sicherheit_2022.md).
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
| [`VeloroutenCheckWeb/src/App.tsx`](VeloroutenCheckWeb/src/App.tsx) | UI, Eingaben, Import-Wege, Herkunft/Chips, Entscheidungstabellen |
| [`VeloroutenCheckWeb/src/strecke.ts`](VeloroutenCheckWeb/src/strecke.ts) | Abschnitte: Eingabezustand mit Seite A/B, Kandidat → Abschnitt, Ordnen, Ausrichten und Zusammenfassen, Seiten tauschen, DTV-Annahme |
| [`VeloroutenCheckWeb/src/bewertung.ts`](VeloroutenCheckWeb/src/bewertung.ts) | Bewertung eines Abschnitts je Seite (Vollständigkeit, Note, Vergleichsnoten); Abschnittsnote = schlechtere Seite |
| [`VeloroutenCheckWeb/src/osm.ts`](VeloroutenCheckWeb/src/osm.ts) | OSM-Import über Overpass: Tags → Ist-Führungsform je Seite, Einbahn, Laden nach Name/Ausschnitt/Klick, Segment teilen |
| [`VeloroutenCheckWeb/src/csv.ts`](VeloroutenCheckWeb/src/csv.ts) | Zahlen-Ein-/Ausgabe (de-CH) und Aufbau des CSV-Exports |
| [`VeloroutenCheckWeb/src/netz.ts`](VeloroutenCheckWeb/src/netz.ts) | Abrufe mit Timeout, ArcGIS-Abfragen (Fehler mit HTTP 200, Nachladen gekappter Ergebnisse), HTML-Maskierung |
| [`VeloroutenCheckWeb/src/VeloMap.tsx`](VeloroutenCheckWeb/src/VeloMap.tsx) | Leaflet-Karte: Segmente, Nummern mit Richtungspfeil, Schnittpunkte, Haltestellen-Marker, Highlight |
| [`VeloroutenCheckWeb/src/bern.ts`](VeloroutenCheckWeb/src/bern.ts) | Bern: Geoportal-Layer (DTV-Formel, Matching, ÖV) |
| [`VeloroutenCheckWeb/src/zurich.ts`](VeloroutenCheckWeb/src/zurich.ts) | Zürich: Velonetzplanung-WFS (Routentyp) + ÖV aus OSM |
| [`VeloroutenCheckWeb/src/basel.ts`](VeloroutenCheckWeb/src/basel.ts) | Basel: Teilrichtplan-Velo-WFS (Routentyp) + Velostrasse + Strassentyp/Tempo (Dataset 100250) + ÖV aus OSM |
| [`VeloroutenCheckWeb/src/luzern.ts`](VeloroutenCheckWeb/src/luzern.ts) | Luzern: Velonetz-ArcGIS (Routentyp) + ÖV aus OSM |
| [`VeloroutenCheckWeb/src/stgallen.ts`](VeloroutenCheckWeb/src/stgallen.ts) | St. Gallen: Veloplan-Opendatasoft (Routentyp) + ÖV aus OSM — *Adapter vorhanden, aber derzeit nicht auswählbar* |
| [`VeloroutenCheckWeb/src/cityShared.ts`](VeloroutenCheckWeb/src/cityShared.ts) | Geteilte Stadt-Helfer: Geo-Matching + ÖV-Erkennung aus OSM |
| [`VeloroutenCheckWeb/src/obs.ts`](VeloroutenCheckWeb/src/obs.ts) | OpenBikeSensor-Überholabstände |
| [`VeloroutenCheckWeb/src/velostreifen.ts`](VeloroutenCheckWeb/src/velostreifen.ts) | Bern: lokaler Velostreifen-Snapshot (`public/velostreifen_bern.json`, **gitignored**) → Ist-Führungsform + Breite je Seite mit Chip **„Markierung"**. Fehlt die Datei (öffentlicher Build/Prod), ist die Quelle stumm — Dev und Prod können sich hier unterscheiden |
| [`VeloroutenCheckWeb/src/luftbild.ts`](VeloroutenCheckWeb/src/luftbild.ts) | Bern, Zürich, Basel: Luftbild-Snapshots (`public/luftbild_<stadt>.json`, öffentlich) → Anteil mit Radstreifen-Fund je Seite, nur als Hinweis |
| [`VeloroutenCheckWeb/src/aufteilung.ts`](VeloroutenCheckWeb/src/aufteilung.ts) | Aufteilung planen (Vorgaben je Stadt, sonst Ersatz Bern) — Querschnitt aus Elementen, Bilanz gegen die Fahrbahnbreite, Prüfung je Element, Kernfahrbahn, Note mit der Aufteilung, Ausgangslage aus heute |
| [`VeloroutenCheckWeb/src/vorschlag.ts`](VeloroutenCheckWeb/src/vorschlag.ts) | Massnahmenvorschlag für die Aufteilung (Portierung des lokalen Zielbild-Rechners; Bern, Zürich, Basel, Luzern mit den Massen der Stadt), ohne und mit Randsteinanpassung |
| [`VeloroutenCheckWeb/src/Bericht.tsx`](VeloroutenCheckWeb/src/Bericht.tsx) · [`kartenbild.ts`](VeloroutenCheckWeb/src/kartenbild.ts) | Bericht der Planung als Druckansicht (PDF): Kartenbild per WMS in LV95, Skizzen, Prüfung, Bewertung, Quellen |
| [`VeloroutenCheckWeb/src/fussnetz.ts`](VeloroutenCheckWeb/src/fussnetz.ts) | Bern: Fussverkehrsnetz (Basisnetz oder Feinverteilernetz) aus dem Richtplan Fussverkehr, Vorgabe der Trottoirs |
| [`VeloroutenCheckWeb/src/Querschnitt.tsx`](VeloroutenCheckWeb/src/Querschnitt.tsx) | Skizze des Querschnitts (SVG, massstäblich, Streetmix-Illustrationen) für heute und die Planung |
| [`VeloroutenCheckWeb/src/parkierung.ts`](VeloroutenCheckWeb/src/parkierung.ts) | Bern, Zürich, Luzern: amtliche Parkfelder → Anteil der Länge mit Parkierung je Seite, Vorbelegung «Parkierung rechts» |
| [`VeloroutenCheckWeb/src/breitenmessung.ts`](VeloroutenCheckWeb/src/breitenmessung.ts) · [`av.ts`](VeloroutenCheckWeb/src/av.ts) · [`lv95.ts`](VeloroutenCheckWeb/src/lv95.ts) | Bern, Zürich, Basel: Breite am Luftbild messen — Bordsteinkanten aus der AV (geodienste.ch), Messung ab Kante oder mit zwei Punkten, Fahrbahnbreite aus Querschnitten, Umrechnung WGS84 ↔ LV95 |
| [`VeloroutenCheckWeb/src/geo.ts`](VeloroutenCheckWeb/src/geo.ts) | Geometrie-Helfer (Überlappungs-Matching, Linie teilen, Peilung, Seitenzuordnung) |
| [`VeloroutenCheckWeb/src/fuehrungsform.test.ts`](VeloroutenCheckWeb/src/fuehrungsform.test.ts) | Vitest-Tests der Bewertungslogik (`npm test`; Stand 22.10.2026: 549 Tests in einundzwanzig Dateien) |
| [`VeloroutenCheckWeb/src/geo.test.ts`](VeloroutenCheckWeb/src/geo.test.ts) | Vitest-Tests der Geometrie-Helfer (Matching, Überlappung, mehrteilige Linien, Zählstellen-Zuordnung) |
| [`VeloroutenCheckWeb/src/strecke.test.ts`](VeloroutenCheckWeb/src/strecke.test.ts) · [`osm.test.ts`](VeloroutenCheckWeb/src/osm.test.ts) · [`csv.test.ts`](VeloroutenCheckWeb/src/csv.test.ts) | Vitest-Tests der Abschnittsbildung, des OSM-Imports und des CSV-Exports |
| [`VeloroutenCheckWeb/src/regelwerk.drift.test.ts`](VeloroutenCheckWeb/src/regelwerk.drift.test.ts) | Drift-Wächter: `docs/regelwerk.json` gegen die Code-Konstanten — bricht `npm test`, bis die Doku nachgezogen und neu generiert ist |
| [`tools/oev_takt.py`](tools/oev_takt.py) | GTFS → `oev_takt_{bern,zurich,basel,luzern}.json` (Bus-Takt, offline; Bern flach `{BPUIC→n}`, übrige georeferenziert `[{lat,lon,n,name}]` mit einem Punkt je Bus-Haltekante, der den Wert seiner Haltestelle trägt) |
| [`tools/dtv_basel.py`](tools/dtv_basel.py) | data.bs.ch Stundenwerte der letzten 28 Tage → Werktags-Mittel-DTV je Zählstelle → `VeloroutenCheckWeb/public/dtv_basel.json`; es zählen nur vollständige Werktage (lokaler Kalendertag, alle Spuren mit 24 Stundenwerten) mit Verkehr — Tage mit Tagessumme 0 gelten als Zählerausfall |
| [`tools/luftbild_bern.py`](tools/luftbild_bern.py) | Luftbild-Erkennung (GeoPackage aus dem lokalen Lauf) → Mittellinien der Radstreifen-Funde → `VeloroutenCheckWeb/public/luftbild_bern.json`; braucht GDAL |
| [`tools/luftbild_stadt.py`](tools/luftbild_stadt.py) | Dasselbe für weitere Städte direkt aus den Funden (`funde_*.jsonl`) → `public/luftbild_<stadt>.json` (Zürich, Basel); braucht GDAL |
| [`tools/verify_06.py`](tools/verify_06.py) | Nachrechnung der feel-safe-Anker (Reproduzierbarkeit, siehe unten) |
| [`tools/generiere_dokumentation.py`](tools/generiere_dokumentation.py) | Generiert `docs/regelwerk.md` aus dem handgepflegten `docs/regelwerk.json` |
| [`tools/generiere_stadt_pdf.py`](tools/generiere_stadt_pdf.py) | Generiert die vier Stadt-Regelwerk-PDFs und ein stadtübergreifendes Grundlagen-PDF aus `docs/regelwerk.json` (benötigt `weasyprint`) |

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
GitHub Pages. Vite ist dafür auf `base: '/'` (eigene Domain) eingestellt. Einmalig nötig: in den
Repo-Einstellungen unter **Settings → Pages → Source = „GitHub Actions"** aktivieren und unter
**Custom domain** `veloroutencheck.ch` eintragen. Die Seite erscheint dann unter `https://veloroutencheck.ch/`.

---

## Lizenz

Code und eigene Inhalte dieses Projekts: **[CC BY-NC 4.0](LICENSE)** (Namensnennung,
nicht-kommerziell). Ausgenommen ist der [Ergebnisbericht der Berner Bildumfrage 2026](docs/09_Umfrage_Subjektive_Sicherheit_Bern_2026/):
Text, PDF und Bilder stehen unter **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.de)**
(Namensnennung, auch kommerziell). Die eingebundenen **Dritt-Daten** behalten ihre eigenen Lizenzen und
Quellenangaben — siehe [Datenlizenzen und Quellenangaben](#datenlizenzen-und-quellenangaben)
(u. a. Geodaten Stadt Bern, OpenStreetMap/ODbL, opentransportdata.swiss, OpenBikeSensor, swisstopo).
Das gilt auch für die gebündelten **Daten-Snapshots** `VeloroutenCheckWeb/public/*.json`, die aus solchen
Quellen stammen oder abgeleitet sind (eigene Ausnahme in der [LICENSE](LICENSE)); so verlangen die aus
SWISSIMAGE abgeleiteten Luftbild-Snapshots `luftbild_bern.json`, `luftbild_zurich.json` und `luftbild_basel.json` die Angabe «© swisstopo».
