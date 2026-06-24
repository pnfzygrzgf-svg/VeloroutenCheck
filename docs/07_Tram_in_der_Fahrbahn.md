# 07 — Tram in der Fahrbahn: empirischer Malus (Mischverkehr)

**Frage:** Wie stark senken Tramschienen in der Fahrbahn das subjektive Sicherheitsempfinden
(feel-safe), wenn das Velo im **Mischverkehr** fährt? Daraus wird ein Noten-Malus abgeleitet.

Dieses Dokument zeigt den **Rechenweg** so, dass er nachvollzogen (und auf Fehler geprüft)
werden kann. Alle Zahlen sind mit `tools/verify_06.py` reproduzierbar — sie erscheinen dort in
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

1. Alle Velo-Bewertungen zu **Mischverkehr**-Szenen auswählen.
2. Aufteilen in **mit Tram** (`tram == True`) und **ohne Tram** (`tram == False`).
3. Je Gruppe feel-safe % berechnen — gesamt und getrennt nach Tempo 30 / Tempo 50.
4. **Δ feel-safe** = feel-safe(ohne) − feel-safe(mit) = Verlust durch die Schienen.
5. **Malus [Notenstufen]** = Δ / **14,4**. Die 14,4 sind die feel-safe-Punkte pro Notenstufe
   (`SCORE_PRO_NOTE` in `src/fuehrungsform.ts`), hergeleitet in `06_…Fuehrungsformwahl.md` —
   so ist der Tram-Malus mit allen anderen Abzügen (Breite, Parken) in derselben Einheit.

## Ergebnis (Stand der aktuellen Daten)

**Mischverkehr**

| Kontext | mit Tram | ohne Tram | Δ feel-safe | Malus (Δ/14,4) |
|---|---|---|---|---|
| Gesamt | 12,1 % (N=1 907) | 25,4 % (N=6 378) | 13,3 | 0,92 |
| Tempo 30 | 14,4 % (N=964) | 26,3 % (N=2 923) | 11,9 | **0,83** |
| Tempo 50 | 9,7 % (N=943) | 17,7 % (N=2 843) | 8,0 | **0,56** |

**Radstreifen** (Referenz — eigene RVA): Δ ≈ 0,4 / 0,6 / −0,3 → Malus ≈ 0 → **kein** Tram-Effekt.

## Entscheidung / im Tool verdrahtet

- Malus **nur bei Mischverkehr** (bei Radstreifen empirisch ~0).
- **Tempo-abhängig**, gerundet: **−0,8** bei Tempo ≤ 30, **−0,55** bei Tempo > 30.
- Bewusst **nicht** der „Gesamt"-Wert (0,92): Er ist durch die unterschiedliche Tempo-Mischung
  zwischen Tram- und Nicht-Tram-Szenen leicht überzeichnet. Massgebend sind die
  **tempo-kontrollierten** Zeilen.
- Konstante: `TRAM_MALUS` in `src/fuehrungsform.ts`; greift, wenn „Tram in der Fahrbahn" gesetzt
  ist **und** Ist-Führungsform = Mischverkehr.

## Vorbehalte

- Querschnittsvergleich (keine kausale Identifikation): Tram-Strassen unterscheiden sich evtl.
  systematisch (Lage, Breite, Verkehr). Die Tempo-Kontrolle mildert das, eliminiert es nicht.
- Der Effekt gilt für **Schienen in der Fahrbahn**; bei baulich getrennter Veloführung ist Tram
  irrelevant (im Modell kein Malus dort).
- Tunbar über `TRAM_MALUS`.

## Reproduzieren

```
python3 tools/verify_06.py
# → 06_verifikation.md  (§2 Tram in der Fahrbahn)
# → 06_visualisierung.html  (Abschnitt 9)
```
