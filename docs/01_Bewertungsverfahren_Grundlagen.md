# VeloroutenCheck — Grundlagen des Bewertungsverfahrens

**Projekt:** Schweizer Adaption des Bewertungsverfahrens für Gemeindedurchfahrten im
Radverkehr

**Quelle des Ausgangsverfahrens:** Fuhr, A. & Wettengel, V. (2025): *Entwicklung und
Anwendung eines Bewertungsverfahrens für Gemeindedurchfahrten im Radverkehr.*
Bachelorarbeit Nr. 196 & 199, Universität Stuttgart, Institut für Straßen- und Verkehrswesen.
(PDF derzeit unter `…/Documents/KnotenCheck/Bericht_169_199_Fuhr_Wettengel_V2.pdf`.)

> Dieses Dokument hält den Stand der Recherche fest. Werte/Quellen aus dem DE-Verfahren
> sind als Referenz dokumentiert; die **CH-Adaption** ist in den markierten Punkten noch offen.

Gedanken:
Wenn die Wartezeit an einem Knoten nicht berechnet werden kann, weil keine daten vorliegen, dann benötigt es eine Grundannahme. sind diese in Ausgangspaper drin?
---

## 1. Grundprinzip

- Ideale Strecke = **20 km/h** befahrbar. Jede Störung erzeugt **Verlustsekunden**.
- Umrechnung Verlustsekunden ↔ Geschwindigkeit (H EBRA 2021):
  - `v = 3600 / (t_v,km + 120)`  [km/h]   (Gl. 3.1)
  - `t_v,km = 3600/v − 120`  [s/km]      (Gl. 3.2)
  - Zusammenhang **nicht linear** → langsame Abschnitte gewichten überproportional.
- Ergebnis: **zwei unabhängige Endnoten** (Schulnoten 1–6):
  - **Geschwindigkeitsnote** = Σ Verlustsekunden ÷ Gesamtlänge → Notentabelle (≈ 5 km/h je Notenstufe).
  - **Führungsformnote** = längengewichtetes Mittel der Abschnitts-Führungsformnoten.

---

## 2. Geschwindigkeitsnote — drei zeitbasierte Komponenten

### 2.1 Abschnitte / Anlagenzustand (Kap. 3.1)
Inputs je Abschnitt: Länge, Führungsform, Belag + Zustand, nutzbare Breite, zul. Höchstgeschw., (Kommentar: Die zulässige Höchstgeschwindigkeit ist nur relevant, wenn diese unter 20 km/h ist, da ich annehme, dass die ideal strecke mit 20km/h befahren werden kann.)
Punkt-/Längsmängel, Fuss-/Radverkehrsstärke.

| Kriterium | Formel / Werte | Quelle |
|---|---|---|
| Punktmängel | feste s je Mangel; **Knoten-Punktmängel × 1,5** | H EBRA 2021, S. 13 (Tab. 1) + Anhang A |
| Längsmängel | s/km × Länge | H EBRA 2021, S. 14 (Tab. 2) |
| Fuss-Interaktion (gem. Geh-/Radweg) | Kat. sehr gering/gering/mittel/hoch → 0/24/120/600 s/km × Länge | H EBRA 2021, S. 20 (Tab. 3) |
| Oberfläche | Belagsart × Zustand (gut/mittel/schlecht) → s/km | H EBRA 2021, S. 19 (Tab. 4) |
| Breite | s/km je Führungsform; nutzbare Breite **− 0,75 m** Abstand zu ruhendem Verkehr | H EBRA 2021 S. 15 (Tab. 5) + E Klima 2022 |
| Zul. Höchstgeschwindigkeit | deckelt die fahrbare Geschwindigkeit | StVO / ERA |

### 2.2 Knotenpunkte (Kap. 3.2) — alle mittleren Wartezeiten aus **HBS 2015**
Knoten gelten als längenlos; Verlustsekunden = mittlere Wartezeit + Knoten-Punktmängel (×1,5).

| Knotentyp | Formel mittlere Wartezeit t_w [s] | Inputs | Quelle |
|---|---|---|---|
| **Rechts-vor-Links** | Kreuzung: `t_w = (61/700000)·q_ges² − (503/7000)·q_ges + 152/7` (Gl. 3.3); Einmündung: `t_w = (1/108000)·q_ges² − (1/600)·q_ges + 17/3` (Gl. 3.4); < 300 Kfz/h: Tab. 6 (gerade 3/2, links 6/4); Richtung: rechts ×0, gerade ×½, links ×1 | q_ges, Knotenform, Fahrtrichtung | HBS 2015, S5-49 |
| **Vorfahrtsbeschilderung** | Grundkapazität (Siegloch): `G = (3600/t_f)·e^(−(q_p/3600)·(t_g − t_f/2))` (Gl. 3.6); `R = G/f_PE − q_i` (Gl. 3.5/3.7), f_PE = 1,1; `t_w = 5000/(R+40) − 3` (Gl. 3.8/3.9) | Schild, Richtung, q_p, q_i; t_g/t_f aus Tab. 7/8 | HBS 2015 S5-11/S5-21/S5-43/S5-9 |
| **Kreisverkehr** | `G = 1200 − (12/16)·q_PE,K` (Gl. 3.10), q_PE,K = 1,1·q_Kfz,K; `t_w = 5000/(G/1,1 − q_i + 40) − 3` (Gl. 3.12) | q_K (Kreisbahn), q_i | HBS 2015, S5-34 |
| **LSA** | `t_w = t_U·(1−f_A)² / [2·(1 − min(1;x)·f_A)]` (Gl. 3.13/3.18); f_A = (t_F+1)/t_U; x = q_i/C; C = f_A·q_s; **q_s = 2000 Kfz/h**; Bedarfsampel → als Punktmangel | t_U (Umlauf), t_F (Freigabe), q_i | HBS 2015 S4-40/S4-15/S4-12 |
| **Querung mit Fussverkehr** | `t_w = 3,1·e^(0,0015·q_p) − 3` (Gl. 3.19) | q_p (Hauptstrom) | HBS 2015, S5-47/48 |

**t_g / t_f bei Vorfahrtsbeschilderung (DE-Werte):**

| Schild (eigener Strom) | t_g links / gerade / rechts [s] | t_f links / gerade / rechts [s] |
|---|---|---|
| Vorfahrtsstraße | 5,5 / – / – | 2,8 / – / – |
| Vorfahrt gewähren (Z205) | 6,5 / 6,7 / 5,9 | 3,3 / 3,2 / 3,0 |
| Stopp (Z206) | 6,5 / 6,7 / 5,9 | 3,8 / 3,8 / 3,9 |

### 2.3 Umwegigkeit (Kap. 3.3)
`t_Um = (Δs / v)·3600`  (Gl. 3.20), Δs = bewertete Route − **kürzeste Kfz-Vergleichsroute**;
negativ = Gutschrift. v aus den Gesamt-Verlustsekunden (Gl. 3.1). Motiv-Quelle: Alrutz et al. 1998.

---

## 3. Führungsformnote (Kap. 3.4)

`Gesamtnote = Basisnote + Abzüge`  (Gl. 3.21), Schulnoten 1–6. **10 Führungsformen.**

**Basisnote:**
- **Fahrbahn** (Mischverkehr/Schutzstreifen/Radfahrstreifen/Bussonderstreifen/gegen Einbahn):
  aus **Kfz-Spitzenstärke × zul. V**. Note 1 nach NL-Regelwerk (Rik de Groot 2016 / CROW);
  Note 2 wenn nur ERA erfüllt; Verkehrsstärkenstufen **400 / 1000 / 1800 Kfz/h** (RASt 2006)
  + > 1800 + 4-streifig; je Stufe bzw. 10 km/h Abweichung −1 Note. (Tab. 12 Mischverkehr, Tab. 13 Schutzstreifen …)
  - *Mischverkehr*-Sonderfall: Basisnote = Tab. 12 (Kfz) + Tab. 9 (Fuss) − 1.
- **Fussführung** (gem. Fuss-/Radweg, Gehweg „Fahrrad frei"): aus **Fuss- × Radverkehrsstärke**
  (Tab. 9 / 10; Kategorien Tab. 11, H EBRA S. 9). ERA-Ausschlusskriterien (ERA 2010, S. 27, Abb. 13).
- **Selbständige Radwege**: Einrichtung = 1, Zweirichtung = 2.

**Abzüge / Gutschrift (Kriterien):**
- Breite < ERA-Regelbreite → max **−1** (Anhang B.2)
- SV-Anteil > 5 % → −1
- Parkwechselvorgänge: mittel −1, hoch −2
- Steigung > 3 % → −1 (ausser Radfahrstreifen)
- Gefälle > 3 % → −1 (Fussführung)
- „Fahrrad frei" als Alternativführung → **+1 Gutschrift** (max. Endnote 1)

Kriterien-Quellen: ERA 2010, Rik de Groot 2016 (NL), FixMyCity 2020, Merk et al. 2021,
Mekuria et al. 2012 (LTS).

---

## 4. Anhang B.1 — Kriterien-Matrix (welche Kriterien wirken je Führungsform)

**Lesart:** 1 = Kriterium wird berücksichtigt (Basisnote oder Ab-/Zuschlag); 0 = ignoriert.

| Führungsform | Verk.stärke | Geschw. | Fussv. | Radv. | SV | Parken | Steig. | Fahrrad frei | Gefälle | Breite |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Mischverkehr | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 1 |
| Schutzstreifen | 1 | 1 | 0 | 0 | 1 | 1 | 1 | 1 | 0 | 1 |
| Radfahrstreifen | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 1 | 0 | 1 |
| Baulich angelegter Radweg | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| Zweirichtungsradweg | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| Gemischter Fuss- und Radweg | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 1 | 1 |
| Gehweg / Fahrrad frei | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 1 | 1 |
| Bussonderstreifen | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 1 |
| Fahrradstrasse | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Radverkehr gegen Einbahn | 1 | 1 | 0 | 0 | 1 | 1 | 1 | 1 | 0 | 1 |

Spaltengruppen: **Basisnote Fahrbahn** = Verk.stärke + Geschw.; **Basisnote Fuss** = Fussv. + Radv.;
**Abzüge** = SV, Parken, Steigung, Gefälle, Breite; **Gutschrift** = Fahrrad frei.

---

## 5. Anhang B.2 — Breitenabhängige Notenabzüge

**Lesart:** Zeile = Führungsform, Spalte = nutzbares Breitenintervall [m]; 1 = ein Breiten-Abzug
(Breite unter ERA-Regelwert bzw. „gefährliches Überhol-Intervall"), 0 = kein Abzug. Max −1 Note.

Breitenintervalle: `<0,7 | (0,7;1] | (1;1,3] | (1,3;1,6] | (1,6;2] | (2;2,3] | (2,3;2,6] | (2,6;3] | (3;3,5] | (3,5;4,75] | (4,75;6] | (6;7] | >7`

| Führungsform | <0,7 | 0,7–1 | 1–1,3 | 1,3–1,6 | 1,6–2 | 2–2,3 | 2,3–2,6 | 2,6–3 | 3–3,5 | 3,5–4,75 | 4,75–6 | 6–7 | >7 |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Mischverkehr | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | **1** | 0 |
| Schutzstreifen | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| Radfahrstreifen | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| Baulich angelegter Radweg | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| Zweirichtungsradweg | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| Gemischter Fuss-/Radweg | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| Gehweg / Fahrrad frei | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| Bussonderstreifen | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | **1** | 0 | 0 | 0 |
| Fahrradstrasse | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Radverkehr gegen Einbahn | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |

Besonderheiten (Gefahren-Überhol-Intervalle, ERA 2010): **Mischverkehr 6–7 m** und
**Bussonderstreifen 3,5–4,75 m** erhalten trotz „grosser" Breite einen Abzug.

---

## 6. Erhebungs-Inputs (Datengewinnung, Kap. 3.6 / 4.1)
Befahrung (GoPro 1 Bild/s → Mapillary; Garmin-GPS für Abschnittslängen via Rundentaste);
Breiten via Satellit; LSA-Zeiten per Stoppuhr; Kfz-Stärken aus Hochrechnungen/Schätzung
(Knoten daher mit Vorsicht); Vergleichsroute via Routing-Dienst (kürzeste Kfz-Route).
Abschnittsgrenzen bei Wechsel von Führungsform / Belag / zul. V.

---

## 7. Quellen → Schweizer Entsprechungen (zu prüfen)

| DE-Quelle | wofür im Verfahren | CH-Pendant (Recherche offen) |
|---|---|---|
| **HBS 2015** (FGSV) | Knoten-Wartezeiten (RvL, Vorfahrt, Kreisel, LSA, FG-Querung) | SN 640 022 (RvL/Vorfahrt), VSS 40 024a (Kreisel), VSS 40 023a (LSA) — bereits in *KnotenCheck* implementiert |
| **H EBRA 2021** (FGSV) | Verlustsekunden-Logik, Mängel, Oberfläche, Breite | VSS-Radverkehr / ASTRA-Vollzugshilfe Veloverkehr |
| **ERA 2010** (FGSV) | Führungsformen, Regelbreiten, Ausschlusskriterien, Belastungsbereiche, Sicherheitstrennstreifen | **VSS 40 237** „Radverkehr; Radverkehrsanlagen"; SN-640-06x-Reihe „Leichter Zweiradverkehr" |
| **RASt 2006** (FGSV) | Verkehrsstärken-Stufengrenzen | VSS-Strassenquerschnitte (SN 640 201 ff.) |
| **Rik de Groot 2016** (CROW, NL) | Grenzwerte Führungsform-Wahl (Note 1) | CROW NL nutzbar; CH: VSS 40 237 |
| Mekuria 2012 (LTS), FixMyCity 2020, Merk 2021, Alrutz 1998, E Klima 2022 | subjektive Sicherheit/Stress, Umweg-Motiv, Klima-Regelbreiten | international / nach Bedarf |

---

## 8. ERA 2010 — Inhalt (Empfehlungen für Radverkehrsanlagen, FGSV, Nr. 284)

> Hinweis: ERA 2010 liegt **nicht** als PDF vor; Beschreibung aus Fachwissen + dem, was die
> Bachelorarbeit daraus zitiert. Exakte Regelbreiten/Seitenzahlen am Originaldokument verifizieren.

Deutsches Standard-Regelwerk für **Planung und Entwurf von Radverkehrsanlagen** (innerorts
und ausserorts), Nachfolger der ERA 1995. Grober Aufbau:
1. Grundlagen / Anforderungen (Verkehrssicherheit, Netz: Verbindungsfunktion, Direktheit, Komfort, soziale Sicherheit).
2. Radverkehrsnetz / Netzplanung.
3. **Führung auf der Strecke** (für unser Verfahren zentral): Mischverkehr, Tempo-30/Fahrradstrasse,
   Schutzstreifen, Radfahrstreifen, baulicher Radweg (Ein-/Zweirichtung), gemeinsame/getrennte
   Geh- und Radwege, Gehweg „Radfahrer frei", Bussonderstreifen-Freigabe; **Regelbreiten/Mindestbreiten**
   je Form; **Sicherheitstrennstreifen 0,75 m** zum ruhenden Verkehr; **Belastungsbereiche** zur
   Wahl der Führungsform (Diagramm Kfz-Stärke × zul. V_kfz, 2-/4-streifig).
4. **Knotenpunkte**: Radführung an LSA (aufgeweitete Radaufstellstreifen ARAS, direktes/indirektes
   Linksabbiegen, Radfahrerfurten), Kreisverkehre, Einmündungen, Grundstückszufahrten.
5. Querungsstellen / Querungshilfen (Mittelinseln, Furten).
6. Fahrradparken / Abstellanlagen.
7. Wegweisung.
8. Betrieb und Unterhalt, Baustellen.

**Was die Bachelorarbeit konkret aus ERA 2010 verwendet:**
- **Belastungsbereiche** zur Führungsform-Wahl (Abb. 11 = ERA S. 19) → Basisnote Fahrbahn.
- **Ausschlusskriterien** für gemeinsame Geh-/Radwege (ERA S. 27) + **Einsatzgrenzen-Diagramm** (Abb. 13).
- **Regelbreiten** je Führungsform → Breiten-Abzüge (Anhang B.2).
- **Sicherheitstrennstreifen 0,75 m** (von nutzbarer Breite abzuziehen).
- **Gefährliche Überhol-Breitenintervalle**: Mischverkehr 6–7 m, Bussonderstreifen 3,5–4,75 m.

**CH-Pendant:** **VSS 40 237** „Radverkehr; Radverkehrsanlagen" (Führungsformen, Regelbreiten,
Wahlkriterien) und die SN-640-06x-Reihe „Leichter Zweiradverkehr" (Grundlagen/Netz/Führung);
ergänzend ASTRA-Vollzugshilfe/Handbuch Veloverkehr. → **Aufgabe:** aktuellen VSS-Katalog
prüfen und die exakten CH-Regelbreiten/Belastungs- bzw. Eignungsbereiche herausziehen.

---

## 9. CH-Grundlage gefunden — Masterplan Veloinfrastruktur Stadt Bern (Okt. 2025)

Datei: `…/VeloroutenCheck/Masterplan Veloinfrastruktur Standards (Oktober 2025)-1.pdf` (87 S., Textlayer).
Berner Regelwerk; **CH-Gegenstück zu den ERA-Belastungsbereichen** und liefert zugleich die
**Regelbreiten** für Anhang B.2.

### 9.1 Führungsart-Wahl (S. 11) — Diagramm DTV MIV × Geschwindigkeit
Achsen: **x = DTV MIV** (Tagesverkehr, **nicht** Spitzenstunde!) mit Schwellen **2'000 / 5'000 / 10'000 / 20'000**;
**y = zul. Geschwindigkeit** mit **30 / 40 / 50 / 80 km/h**.

| Bereich (Diagramm) | DTV MIV | Geschwindigkeit | Führungsart |
|---|---|---|---|
| Mischverkehr | < 2'000 | ≤ 30 km/h | Mischverkehr (auf Velohauptrouten Velostrasse prüfen) |
| Radstreifen | < 2'000 / 2'000–5'000 | bis ~50 / bis ~40 km/h | Radstreifen; Kernfahrbahn m. Radstreifen ≥ 1.80 m bis max. T50 & DTV 5'000 |
| Radstreifen oder Radweg | 5'000–10'000 | bis ~50 km/h | Übergangszone |
| Radweg | > 10'000 **oder** ≥ 50 km/h | — | bauliche Separation; sonst grösstmögliche Radstreifenbreite |

Weitere Wahlkriterien (Text S. 11): **Längsneigung, öffentlicher Verkehr, Strassenraumbreite**.
**Velohauptrouten vs. übrige Velorouten:** zwei Standardstufen (Optimalfall / Minimalfall).

→ **Wichtigste Anpassung ggü. DE:** x-Achse **DTV** statt Spitzenstunde-Kfz/h (Stufen 2'000/5'000/10'000/20'000
statt 400/1'000/1'800); nur ~3 Führungsarten (Mischverkehr / Radstreifen / Radweg) + CH-Sonderformen
**Velostrasse, Kernfahrbahn**.

### 9.2 Regelbreiten (für Anhang B.2) — Querschnittstypen „Q…" (ab S. 12)
Beispiel **Q1 Radstreifen** (S. 12):
- Optimalfall/Standard: **≥ 2.50 m** (mind. 2.00)
- Velohauptroute: **2.50 m** (mind. 1.80)
- Minimalfall: **1.80 m** (1.50 abseits von Hauptrouten)
- Kernfahrbahn-Radstreifen: **≥ 1.80 m**

→ Weitere Q-Typen (Radweg etc.) ab S. 12 ff. extrahieren → ersetzen die ERA-Regelbreiten in B.2.

---

## 10. Offene Adaptionsaufgaben (CH)
1. **Fahrbahn-Basisnote** auf das **Masterplan-Bern-Diagramm (S. 11)** umstellen:
   x = **DTV MIV** (2'000/5'000/10'000/20'000), y = 30/40/50/80; Note 1 = Führungsart liegt im
   vorgesehenen Bereich, je Stufe/Geschwindigkeitsschritt Abweichung −1.
2. **Anhang B.2 (Breiten-Abzüge):** Breitenintervalle/Schwellen aus den **Q-Querschnittstypen**
   (Masterplan S. 12 ff.; Optimal/Standard/Minimal) statt ERA; Velohauptroute vs. übrige beachten.
3. **Anhang B.1 (Kriterien-Matrix):** Führungsform-Liste auf CH reduzieren/anpassen
   (Mischverkehr, Radstreifen, Radweg + Velostrasse, Kernfahrbahn); Kriterien-Relevanz prüfen.
4. **Knoten-Wartezeiten:** CH-Normen statt HBS 2015 — direkt aus den in *KnotenCheck*
   implementierten Verfahren übernehmbar (SN 640 022 / VSS 40 024a / VSS 40 023a).
5. **Mängel-/Oberflächen-/Längsmängel-Sekundenwerte** (H EBRA) auf CH-Quellen prüfen
   oder dokumentiert übernehmen.
6. **Velohauptrouten vs. übrige Routen** als Modus einbauen (Optimal-/Minimalstandard wirkt
   auf Regelbreiten und damit auf die Breiten-Abzüge).
