# VeloroutenCheck — Datengrundlage „Radwege-Check" (subjektive Sicherheit)

Empirische Datenquelle zur **subjektiv empfundenen Velo-Sicherheit** je Führungs-/Strassen­konfiguration.
Kandidat für die **Kalibrierung der Führungsformnote** (subjektive Sicherheit) in VeloroutenCheck.

## 1. Herkunft
- **Projekt:** Straßencheck / radwege-check.de — FixMyCity (Berlin).
- **Erhebung:** fotorealistische 3D-Strassenszenen, Bewertung der gefühlten Sicherheit.
  ~22'000 Teilnehmende, ~400'000 Bewertungen, ø 22 Szenen/Person; 3 Perspektiven
  (Velo / Auto / Fuss); Zeitraum Dez 2019 – Apr 2020.
- **Skala (rating):** 0 = unsicher · 1 = eher unsicher · 2 = eher sicher · 3 = sicher.
- **Lizenz:** Daten **ODbL** (share-alike), Namensnennung **„© FixMyCity, radwege-check.de"**.
  Fotos/Grafiken/Texte CC BY-NC 4.0; Quellcode AGPL-3.0.
- **Wiss. Publikation:** von Stülpnagel et al., „How safe do you feel?" (Accident Analysis and
  Prevention, 2022).

## 2. Dateien im VeloroutenCheck-Ordner

```
Datei                          Inhalt                                         Granularität
-----------------------------  ---------------------------------------------  ------------------
SurveyResults_200414.json      Roh-Bewertungen + Teilnehmerprofile            pro Session/Rating
scenes_cp.csv                  Szene -> Merkmale (RVA auf Fahrbahn/Seitenr.)  pro Szene (roh)
scenes_ms.csv                  Szene -> Merkmale (Hauptstrasse MIV +/- RVA)   pro Szene (roh)
scenes_se.csv                  Szene -> Merkmale (Nebenstrasse)               pro Szene (roh)
radwege_hauptstrassen.csv      AGGREGIERT: Konfiguration + Sicherheitswerte   pro Konfiguration
radwege_nebenstrassen.csv      AGGREGIERT: Konfiguration + Sicherheitswerte   pro Konfiguration
```
Join-Schlüssel roh: `SurveyResults…ratings[].scene_id` ⋈ `SceneID` in `scenes_*.csv`.
Codes im scene_id: **CP / MS / SE** (= die drei Experimente).

## 3. JSON-Eckdaten (SurveyResults_200414.json)
- 21'481 Sessions · 468'370 Bewertungen · 3'018 verschiedene Szenen.
- `userGroup`: potentialBicycle 9'988 · pedestrian 5'352 · bicycle 4'102 · car 2'039.
- `perspective`: C (Velo) 14'090 · P (Fuss) 5'352 · A (Auto) 2'039.
- Rating-Verteilung 0/1/2/3: 37'883 / 98'526 / 163'628 / 168'333.
- Felder: `session_id, created, project(=1), profile{…}, ratings[{scene_id,duration,rating}], stopped_at_scene_id`.
- (Format-Spezifikation: `Spezifikation-Ausgabeformat-des-Strassenchecks.pdf`.)

## 4. Aggregierte CSVs — Schema

### radwege_hauptstrassen.csv  (1'700 Konfigurationen, 50 Spalten)
```
Beschreibung   Szenentitel, Illustration(Bild-URL), location, path,
               sceneId, sceneIdCar, sceneIdPedestrian
Merkmale       bicycleLaneSurface, bicycleLaneWidth(+Number),
               bicycleLaneWidthWithoutBufferNumber,
               bicycleLaneWidthWithoutBufferAndDooringZoneNumber,
               bufferHasPhysicalProtection,
               bufferLeftMarking, bufferLeftPhysicalProtection, bufferLeftWidth(+Number),
               bufferRightMarking, bufferRightWidth(+Number), bufferRightDooringZoneNumber,
               leftOfBicycleLane, parking,
               pavementWidth(+Number), pavementHasShops,
               vehicleLaneMaxspeed, vehicleLaneUsage, vehicleTrafficVolume
Ergebnis       je Perspektive Velo / Auto(Car) / Fuss(Pedestrian):
               vote0Unsafe, vote1RatherUnsafe, vote2Save, vote3VerySave,
               voteCount, voteMeans, voteScore
```

### radwege_nebenstrassen.csv  (78 Konfigurationen, 25 Spalten)
```
Beschreibung   Szenentitel, Illustration, path, sceneId, sceneIdCar
Merkmale       bicycleStreetType, carriagewayDirection,
               carriagewayWidth(+Number), motorVehicleTrafficVolumen, parkingCategory
Ergebnis       je Perspektive Velo / Auto(Car):
               vote0Unsafe…vote3VerySave, voteCount, voteMeans, voteScore
               (keine Fuss-Perspektive)
```

### Bedeutung der Wertespalten
```
voteMeans    Mittelwert auf Skala 0-3 (0 unsicher … 3 sicher)   Bereich 0.32 – 2.92
voteScore    "feel-safe"-Score 0-100 (höher = sicherer)         Bereich 4.6 – 100
voteCount    Anzahl Bewertungen dieser Konfiguration
```

## 5. Roh-Szenen-CSVs — Schema (Merkmale je Szene)
```
scenes_cp.csv  Experiment, Kamera, SR_lD, SceneID, weight, Basisszenario,
               Links_RVA, Tr_li-Breite, Tr_li-Art, Tr_li_baulTrennung,
               RVA-Breite, Tr_re-Breite, Tr_re-Art, GW-Breite,
               GW-Geschaeftsnutzung, Haeuserfront
scenes_ms.csv  …, FS-Art, FS-Aufkommen, FS-Geschwindigkeit, RVA-Breite, RVA-Lage,
               RVA-Oberflaeche, Tr_li-Breite/-Markierung/-baulTrennung,
               Tr_re-Breite/-Markierung, Parken
scenes_se.csv  …, FS-Art, besondere Merkmale (Fahrradstrasse/Spielstrasse…),
               FS-Breite, Parken, Verkehrsaufkommen
```

## 6. Bezug zu VeloroutenCheck
- Die erhobenen **Merkmale decken sich mit den VeloroutenCheck-Kriterien** (Führungsform +
  Anhang B.1/B.2): Breite, Lage (Fahrbahn/Seitenraum), bauliche Trennung, Parken
  (vorhanden/Position), Oberfläche, Kfz-Geschwindigkeit/-Aufkommen, Sonderform.
- Nutzbar als **empirische Basis der Führungsformnote**: `voteScore` bzw. `voteMeans`
  (Velo-Perspektive) → Schulnote; Merkmals-Effekte (z. B. 2 m vs. 3,5 m, Poller, Parken)
  quantifizieren die Abzüge/Zuschläge.
- Filterbar nach **Nutzergruppe** (z. B. `potentialBicycle` = Zielgruppe Velohauptrouten)
  und Perspektive.

## 7. Vorbehalte
- **Berlin/DE-Kontext**: Begriffe und Konfigurationen müssen auf die CH-Führungsformen
  (Q1–Q11, Masterplan Bern) gemappt werden; CH-Sonderformen (Kernfahrbahn, Velostrasse,
  Velogegenverkehr, Zweirichtung) sind **nicht** abgedeckt.
- Nur **subjektive Sicherheit** (eine der zwei VeloroutenCheck-Noten) — nicht objektive Unfall-
  sicherheit, nicht die Geschwindigkeits-/Attraktivitätsnote.
- Szenenbasiert (konkrete Konfigurationen), nicht 1:1 eine Führungsform.

## 8. Quellen (URLs)
- https://radwege-check.de/  ·  https://radwege-check.de/auswertung/  ·  https://radwege-check.de/open-data/
- Aggregierte Exporte: https://radwege-check.de/hauptstrassen/export/  ·  https://radwege-check.de/nebenstrassen/export/
- Roh-Szenen (GitHub): https://github.com/FixMyBerlin/fixmy.survey-results  (`data/raw/scenes_*.csv`)
- Code radwege-check: https://github.com/FixMyBerlin/fixmy.safetycheck
