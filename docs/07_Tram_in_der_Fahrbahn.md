# 07 — Tram in der Fahrbahn: empirischer Befund und Noten-Deckel (Mischverkehr)

**Frage:** Wie stark senken Tramschienen in der Fahrbahn das subjektive Sicherheitsempfinden
(feel-safe), wenn das Velo im **Mischverkehr** fährt? Der Befund begründet, dass Schienen im
Mischverkehr die Note **deckeln** (höchstens 3).

> **Regelform seit 14.08.2026:** Der Befund ist unverändert; die daraus gezogene Regel ist neu.
> Bis dahin wirkte er als tempoabhängiger **Abzug** (−1,2 bei Tempo ≤ 30, −0,7 bei Tempo > 30);
> seither wirkt er als **Deckel auf Note 3** — gleich wie im lokalen Berner Rechner
> (`TRAM_NOTE = 3.0`), mit dem der Online-Rechner damit deckungsgleich ist. Der Unterschied in
> der Sache: Ein Deckel kappt nur nach oben (Rohnote 6 → 3), ein Abzug zieht auch von einer
> ohnehin schlechten Note noch ab (2,5 → 1,3). Beide Fassungen sind unten dokumentiert.

Dieses Dokument zeigt den **Rechenweg** so, dass er nachvollzogen (und auf Fehler geprüft) werden kann. Alle Zahlen sind mit `tools/verify_06.py` reproduzierbar — sie erscheinen dort in
`06_verifikation.md` (Abschnitt „§2 Tram in der Fahrbahn") und in `06_visualisierung.html`
(Abschnitt 9).

---

## Datengrundlage

- **Befragung:** radwege-check / FixMyCity, Roh-Einzelantworten `SurveyResults_200414.json`,
  nur **Velo-Perspektive** (`profile.perspective == 'C'`).
- **Szenen-Merkmale:** `scenes_ms.csv` (Führung auf der Fahrbahn). Relevant:
  - **Mischverkehr** := `RVA-Breite == 0` (keine Radverkehrsanlage).
  - **Tram** := `FS-Art == 'Tram'` (Schienen in der Fahrbahn).
  - **Tempo** := `FS-Geschwindigkeit ∈ {30, 50}`.
- (Die Rohdaten liegen aus Lizenz-/Grössengründen nicht im Repo; Bezug siehe Haupt-README.)

## Kennzahl

**feel-safe %** einer Gruppe = Anteil der Einzelbewertungen mit Rating ≥ 2 (also „(eher) sicher"
oder „(sehr) sicher") auf der 4-stufigen Skala 0–3. Identische Definition wie für alle anderen
Anker (Funktion `share()` in `verify_06.py`).

> Wichtig: Diese Auswertung ist **bewusst nicht „tram-bereinigt"** — der Vergleich mit/ohne Tram
> *ist* ja der gesuchte Effekt. Alle übrigen Anker (Führungsform-Note, Breite, Parken) sind
> dagegen tram-bereinigt, damit Tram sie nicht verzerrt.

## Rechenweg

1. Alle Bewertungen der **Velo-Foto**-Mischverkehr-Szenen auswählen (Kamera C; die
   Befragtengruppe wird nicht gefiltert — es zählt, was das Foto zeigt).
2. Aufteilen in **mit Tram** (`tram == True`) und **ohne Tram** (`tram == False`).
3. Je Gruppe feel-safe % berechnen — gesamt und getrennt nach Tempo 30 / Tempo 50.
4. **Δ feel-safe** = feel-safe(ohne) − feel-safe(mit) = Verlust durch die Schienen.
5. **Δ in Notenstufen** = Δ / **14,4**. Die 14,4 sind die feel-safe-Punkte pro Notenstufe
   (`SCORE_PRO_NOTE` in `src/fuehrungsform.ts`), hergeleitet in `06_…Fuehrungsformwahl.md` —
   so ist der Tram-Effekt mit allen anderen Abzügen (Breite, Parken) in derselben Einheit
   lesbar. Diese Umrechnung war bis 14.08.2026 die Regel selbst (Malus); heute dient sie nur
   noch dazu, die **Grössenordnung** des Effekts einzuordnen.

## Ergebnis (Stand der aktuellen Daten)

**Mischverkehr**

| Kontext | mit Tram | ohne Tram | Δ feel-safe | Δ in Notenstufen (Δ/14,4) |
|---|---|---|---|---|
| Gesamt | 7,5 % (N=1 635) | 21,3 % (N=1 575) | 13,8 | 0,96 |
| Tempo 30 | 9,4 % (N=839) | 27,1 % (N=801) | 17,7 | **1,23** |
| Tempo 50 | 5,4 % (N=796) | 15,2 % (N=774) | 9,8 | **0,68** |

**Radstreifen** (Referenz — eigene RVA): Δ ≈ -0,6 / 0,1 / -1,4 → praktisch 0 → **kein**
Tram-Effekt.

Auf einem Niveau von 7,5 % feel-safe im Mischverkehr mit Schienen ist die Lage nicht bloss
„etwas schlechter": Nicht einmal jede zehnte Bewertung nennt eine solche Situation sicher. Das
ist die Begründung für einen **Deckel** — eine Rohnote von 5 oder 6 lässt sich für diese
Situation unabhängig davon nicht rechtfertigen, wie breit die Fahrbahn ist oder ob rechts
parkiert wird.

## Entscheidung / im Tool verdrahtet

**Geltende Fassung (seit 14.08.2026)**

- **Deckel Note 3** (`TRAM_DECKEL = 3` in `src/fuehrungsform.ts`): greift, wenn „Tram in der
  Fahrbahn" gesetzt ist **und** Ist-Führungsform = Mischverkehr. Er kappt nur nach oben; eine
  ohnehin schlechtere Note bleibt unverändert.
- **Nur bei Mischverkehr** (bei Radstreifen empirisch ~0), **nicht mehr tempo-abhängig**: Der
  Deckel gilt bei Tempo 30 wie bei Tempo 50. Das gemessene Niveau ist in beiden Fällen weit
  unter jeder Note-3-Schwelle (9,4 % bzw. 5,4 %).
- **Kaphaltestelle an einer Tram-Haltestelle** ohne bauliche Trennung → **Note 1**
  (`KAP_NOTE = 1`, Rangschwelle `KAP_TRENNUNG_AB = 2`). Diese Regel überschreibt alles
  Übrige — sie beschreibt keine Komfort-, sondern eine Konfliktsituation: Das Velo wird über
  die Schienen an die Haltekante gedrängt, während Fahrgäste ein- und aussteigen. Online
  löst sie aus, wenn „Tram in der Fahrbahn" gesetzt ist **oder** das ÖV-Angebot «Tram» lautet.
- Beides gilt in **allen Städten** — die Grundlage ist die Messung bzw. die physische
  Konfliktlage, nicht ein städtischer Standard.

**Abgelöste Fassung (bis 13.08.2026): tempoabhängiger Malus**

- Abzug **−1,2** bei Tempo ≤ 30, **−0,7** bei Tempo > 30 (`TRAM_MALUS`), aus den
  tempo-kontrollierten Zeilen der Tabelle gerundet.
- Bewusst **nicht** der „Gesamt"-Wert (0,96): Er mischt die Tempi. Massgebend waren die
  **tempo-kontrollierten** Zeilen (Vergleich zudem bei gleichem Aufkommen — Tram-Szenen
  existieren nur mit Aufkommen «wenig»).
- Abgelöst, weil ein Abzug bei bereits schlechten Ausgangslagen doppelt bestraft und der
  lokale Berner Rechner seit je den Deckel führt; die Angleichung beseitigt den letzten
  Regel-Unterschied zwischen den beiden Rechnern.

## Vorbehalte

- Querschnittsvergleich (keine kausale Identifikation): Tram-Strassen unterscheiden sich evtl.
  systematisch (Lage, Breite, Verkehr). Die Tempo-Kontrolle mildert das, eliminiert es nicht.
- Der Effekt gilt für **Schienen in der Fahrbahn**; bei baulich getrennter Veloführung ist Tram
  irrelevant (im Modell kein Deckel dort).
- Die Höhe des Deckels (3) ist eine **Setzung**, keine Messung: Der Befund begründet, dass die
  Situation nicht gut sein kann, nicht die genaue Stufe. Übernommen aus dem lokalen Rechner,
  damit beide Fassungen dieselbe Note liefern.
- Die Kap-Regel (Note 1) ist ebenfalls eine Setzung aus der Konfliktlage und stützt sich nicht
  auf die Befragungsdaten — in den Szenen kommen Kaphaltestellen nicht als eigenes Merkmal vor.
- Tunbar über `TRAM_DECKEL` und `KAP_NOTE` / `KAP_TRENNUNG_AB`.

## Reproduzieren

```
python3 tools/verify_06.py
# → 06_verifikation.md  (§2 Tram in der Fahrbahn)
# → 06_visualisierung.html  (Abschnitt 9)
```
