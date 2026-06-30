// ════════════════════════════════════════════════════════════════════════════
// VeloroutenCheck — Führungsform: Soll-Wahl und Bewertung (Führungsform-Note)
// ════════════════════════════════════════════════════════════════════════════
//
// Zwei Bausteine:
//   1) fuehrungsart(dtv, v)       → empfohlene Führungsform (SOLL) aus der
//                                    Masterplan-Tabelle (DTV × Geschwindigkeit).
//   2) fuehrungsformNote(...)     → Schweizer Schulnote (6 beste … 1 schlechteste)
//                                    aus dem Vergleich IST vs. SOLL, kontext-sensitiv.
//
// Quellen:
//   - Masterplan Veloinfrastruktur Stadt Bern (Okt. 2025), S. 11
//     (Wahl der Führungsart; siehe docs/02_CH_Querschnitte_und_Fuehrungsdiagramm.md).
//   - radwege-check.de / FixMyCity (subjektive Sicherheit, "feel-safe %"),
//     ausgewertet in docs/06_Empirische_Erkenntnisse_Fuehrungsformwahl.md.
// ════════════════════════════════════════════════════════════════════════════

export type Fuehrungsart =
  | 'Mischverkehr'
  | 'Radstreifen'
  | 'Radstreifen oder Radweg'   // Übergang (Zürich): zwischen Radstreifen und Radweg
  | 'Radweg'

// Stadt (bestimmt die Soll-Tabelle und die Haltestellen-Logik). Default: Bern.
export type Stadt = 'bern' | 'zurich' | 'basel' | 'luzern'
// Strassentyp (nur Basel: Soll-Tabelle ist strassentyp-basiert, nicht DTV-basiert).
export type Strassentyp = 'verkehrsorientiert' | 'siedlungsorientiert'

// ── 1) SOLL: Wahl der Führungsart (stadtabhängige Entscheidungstabelle) ───────
//
// Bern (Masterplan, Default/Fallback):
//   DTV MIV \ km/h     ≤30          31–40        41–50              51–80
//   < 2'000            Mischverkehr Radstreifen  Radstreifen        Radweg
//   2'000–5'000        Radstreifen  Radstreifen  Radweg             Radweg
//   5'000–10'000       Radstr./Radweg (Übergang) …                  Radweg
//   > 10'000           Radweg       Radweg       Radweg             Radweg
//
function fuehrungsartBern(dtv: number, v: number): Fuehrungsart {
  if (v > 50 || dtv >= 10000) return 'Radweg'
  if (dtv >= 5000)            return 'Radstreifen oder Radweg'
  if (dtv >= 2000)            return v <= 40 ? 'Radstreifen' : 'Radweg'
  return v <= 30 ? 'Mischverkehr' : 'Radstreifen'
}

// Zürich (Velostandards, Abb. 1 S. 14): je Routentyp eine eigene Matrix.
// Velovorzugsroute → Velohauptroute, Hauptroute → Veloroute. Mischverkehr ist nur bei ≤ 30 km/h
// und unterhalb des DWV-Deckels zulässig: Velovorzugsroute < 2'500, Hauptroute < 5'000.
function fuehrungsartZuerich(dtv: number, v: number, route: Routentyp): Fuehrungsart {
  if (v > 50) return 'Radweg'
  if (route === 'Velohauptroute') {        // Velovorzugsroute
    if (dtv >= 7500) return v <= 30 ? 'Radstreifen oder Radweg' : 'Radweg'
    if (dtv >= 2500) return 'Radstreifen oder Radweg'             // 2'500–7'500 (≤ 50 km/h)
    return v <= 30 ? 'Mischverkehr' : 'Radstreifen oder Radweg'   // < 2'500
  }
  // Hauptroute / Basisnetz: Mischverkehr (≤ 30) nur bis 5'000; ab 5'000 → Radstreifen oder Radweg.
  if (dtv >= 5000) return 'Radstreifen oder Radweg'
  return v <= 30 ? 'Mischverkehr' : 'Radstreifen oder Radweg'     // < 5'000
}

// Luzern (Anwendungshilfe S. 29): drei Zonen Mischverkehr / Markierung / bauliche Trennung.
// Auf die Berner Logik vereinfacht (Markierung = Radstreifen), damit es vergleichbar bleibt:
//   • Mischverkehr nur ≤30 km/h und DTV < 5'000 (bzw. ≤40 km/h und DTV < 2'000).
//   • bauliche Trennung (Radweg) ab DTV ≥ 15'000, bei 41–50 km/h schon ab DTV ≥ 10'000, sowie > 50 km/h.
//   • dazwischen Markierung = Radstreifen.
function fuehrungsartLuzern(dtv: number, v: number): Fuehrungsart {
  if (v > 50) return 'Radweg'
  if (dtv >= 15000) return 'Radweg'
  if (v <= 30) return dtv < 5000 ? 'Mischverkehr' : 'Radstreifen'
  if (v <= 40) return dtv < 2000 ? 'Mischverkehr' : 'Radstreifen'
  return dtv < 10000 ? 'Radstreifen' : 'Radweg'   // 41–50 km/h
}

// Basel: nicht DTV-, sondern strassentyp-basiert (× Routentyp). Vorzugsroute → Velohauptroute,
// Pendler-/Basisrouten → Veloroute. «Nicht verkehrsorientiert» = siedlungsorientierte Strasse.
// (Tempo 30 und 50 ergeben in der Basler Tabelle dieselbe Soll-Form → Tempo hier nicht massgebend.)
function fuehrungsartBasel(route: Routentyp, strassentyp?: Strassentyp): Fuehrungsart {
  if (strassentyp === 'siedlungsorientiert') return 'Mischverkehr'   // (Velostrasse-Ausgestaltung, DWV-Deckel)
  // verkehrsorientiert (oder unbekannt → konservativ verkehrsorientiert):
  return route === 'Velohauptroute' ? 'Radstreifen oder Radweg' : 'Radstreifen'
}

// Dispatcher: wählt die stadtabhängige Soll-Tabelle. Bern bleibt Default (auch für unbekannte Städte).
export function fuehrungsart(
  dtv: number, v: number,
  stadt: Stadt = 'bern', route: Routentyp = 'Velohauptroute', strassentyp?: Strassentyp,
): Fuehrungsart {
  switch (stadt) {
    case 'zurich': return fuehrungsartZuerich(dtv, v, route)
    case 'luzern': return fuehrungsartLuzern(dtv, v)
    case 'basel':  return fuehrungsartBasel(route, strassentyp)
    default:       return fuehrungsartBern(dtv, v)
  }
}

// ── 2) NOTE: IST gegen SOLL bewerten ──────────────────────────────────────────
//
// Schweizer Schulnote: 6 = beste, 1 = schlechteste. Rundung auf 0,5-Schritte.
//
// Prinzip:
//   - Erreicht/übertrifft die IST-Führungsform die vom SOLL geforderte Separation
//     → Note 6 (Über-Erfüllung ist erlaubt).
//   - Liegt die IST darunter → Abzug. Die HÖHE des Abzugs stammt aus dem empirischen
//     feel-safe-Verlust (radwege-check), und zwar KONTEXT-SENSITIV nach Tempo:
//     Tempo wirkt empirisch ~doppelt so stark wie die Verkehrsmenge (06), und der
//     Tempo-Effekt ist sauber belegt (30/50). Die DTV-Dimension steckt bereits in der
//     SOLL-Wahl, das Tempo zusätzlich in der Abzugshöhe. → Eine Fehlentscheidung bei
//     hohem Tempo wird stärker abgewertet als dieselbe bei tiefem Tempo.

export type IstFuehrungsform =
  | 'Mischverkehr'
  | 'Radstreifen'
  | 'Radweg strassenbegleitend / Geschützter Radstreifen'
  | 'Radweg abgesetzt'
  | 'Umweltspur'
  | 'Velostrasse'
  | 'Kombinierter Fuss-/Radweg'
  | 'Fussweg Velo gestattet'

export type Routentyp = 'Velohauptroute' | 'Veloroute'

// Parkierung rechts (Bordsteinseite, Dooring): 'ja' = Abzug, 'nein'/'egal' = kein Abzug.
export type ParkenRechts = 'ja' | 'nein' | 'egal'

// Führungsformen, bei denen Parken rechts (Dooring) relevant ist: Velo fährt auf der Fahrbahn
// neben möglichem Längsparken. Nicht bei baulich abgesetzten Radwegen / Fussweg (anderer Mechanismus).
export const PARKEN_RELEVANT: IstFuehrungsform[] =
  ['Mischverkehr', 'Radstreifen', 'Velostrasse', 'Umweltspur']

// ── Haltestellen (ÖV) ─────────────────────────────────────────────────────────
// Umgang mit ÖV-Haltestellen im Abschnitt. Soll-Lösung aus Masterplan-Diagramm
// (Bedeutung Velonetz × ÖV-Angebot): Separate Velofläche / Übergang / Mischverkehr.
export type OevAngebot = 'keine' | 'bus_ab15' | 'bus_5_15' | 'bus_unter5' | 'tram'
export type Haltestellenloesung = 'Separate Velofläche' | 'Übergang' | 'Mischverkehr'
// Union aller (stadtübergreifend vorkommenden) Haltestellentypen. Welche je Stadt verfügbar sind,
// definiert HALTESTELLEN[stadt]; gemeinsame Namen (z. B. «Inselhaltestelle») können je Stadt
// unterschiedliche Breiten tragen.
export type Haltestellentyp =
  | 'keine'
  // Bern (HS1–HS7):
  | 'Haltestelle mit Veloumfahrung'
  | 'Kaphaltestelle mit Veloüberfahrt'
  | 'Haltestelle mit rückwärtigem Radweg'
  | 'Inselhaltestelle'
  | 'Kaphaltestelle'
  | 'Fahrbahnhaltestelle Bus'
  | 'Busbucht'
  // Zürich (Z HS1–3):
  | 'Fahrbahnhaltestelle mit Veloumfahrung'
  | 'Fahrbahnhaltestelle mit Veloüberfahrt'
  | 'Fahrbahnhaltestelle mit Veloführung auf Fahrbahn'
  // Basel (BS HS 1–4):
  | 'Kap'
  | 'Velobypass'
  | 'Velo-Zeitinsel'
  // Luzern (L HS 3/4):
  | 'Fahrbahnhaltestelle'
  | 'Fahrbahnhaltestelle in der Umweltspur'

interface HsTyp {
  familie: 'Separate' | 'Mischverkehr'
  breite?: { optimal: number; minimal: number }   // nur Typen mit Breitenkriterium
}

// Haltestellentypen je Stadt (mit Einsatzfamilie + optionaler Breitenvorgabe).
// Quelle: Grundlagen/Haltestelle_Typen_Breiten_*.csv (siehe docs/regelwerk.json).
const HALTESTELLEN: Record<Stadt, Partial<Record<Haltestellentyp, HsTyp>>> = {
  bern: {
    'Haltestelle mit Veloumfahrung':       { familie: 'Separate', breite: { optimal: 1.8, minimal: 1.6 } }, // HS1
    'Kaphaltestelle mit Veloüberfahrt':    { familie: 'Separate', breite: { optimal: 1.8, minimal: 1.5 } }, // HS2
    'Kaphaltestelle':                      { familie: 'Mischverkehr' },                                       // HS3
    'Haltestelle mit rückwärtigem Radweg': { familie: 'Separate', breite: { optimal: 2.5, minimal: 1.6 } }, // HS4
    'Inselhaltestelle':                    { familie: 'Separate', breite: { optimal: 2.5, minimal: 1.5 } }, // HS5
    'Fahrbahnhaltestelle Bus':             { familie: 'Mischverkehr' },                                       // HS6
    'Busbucht':                            { familie: 'Mischverkehr' },                                       // HS7
  },
  zurich: {
    'Fahrbahnhaltestelle mit Veloumfahrung':            { familie: 'Separate', breite: { optimal: 1.8, minimal: 1.5 } }, // Z HS1
    'Fahrbahnhaltestelle mit Veloüberfahrt':            { familie: 'Separate', breite: { optimal: 1.8, minimal: 1.5 } }, // Z HS2
    'Fahrbahnhaltestelle mit Veloführung auf Fahrbahn': { familie: 'Mischverkehr' },                                      // Z HS3
  },
  basel: {
    'Kap':              { familie: 'Mischverkehr' },                                       // BS HS 1
    'Velobypass':       { familie: 'Separate', breite: { optimal: 1.6, minimal: 1.2 } }, // BS HS 2
    'Velo-Zeitinsel':   { familie: 'Separate', breite: { optimal: 2.05, minimal: 1.65 } }, // BS HS 3
    'Inselhaltestelle': { familie: 'Separate', breite: { optimal: 1.8, minimal: 1.6 } }, // BS HS 4
  },
  luzern: {
    'Haltestelle mit Veloumfahrung':         { familie: 'Separate', breite: { optimal: 1.8, minimal: 1.5 } }, // L HS 1
    'Haltestelle mit rückwärtigem Radweg':   { familie: 'Separate', breite: { optimal: 2.5, minimal: 1.6 } }, // L HS 2
    'Fahrbahnhaltestelle':                   { familie: 'Mischverkehr' },                                       // L HS 3
    'Fahrbahnhaltestelle in der Umweltspur': { familie: 'Mischverkehr' },                                       // L HS 4
    'Busbucht':                              { familie: 'Mischverkehr' },                                       // L HS 5
  },
}

function hsTyp(stadt: Stadt, typ: Haltestellentyp): HsTyp | undefined {
  return typ === 'keine' ? undefined : HALTESTELLEN[stadt][typ]
}

// Auswahlliste der Haltestellentypen je Stadt (für die UI).
export function haltestellenTypen(stadt: Stadt): Haltestellentyp[] {
  return Object.keys(HALTESTELLEN[stadt]) as Haltestellentyp[]
}

// Haltestellentypen mit Breitenkriterium je Stadt (für die UI-Sichtbarkeit des Breitenfelds).
export function haltestellenMitBreite(stadt: Stadt): Haltestellentyp[] {
  return haltestellenTypen(stadt).filter(t => HALTESTELLEN[stadt][t]?.breite != null)
}

// Soll-Haltestellenlösung aus Route × ÖV-Angebot — stadtabhängig:
//  - bern:   Scoring ÖV (Tram 3 / Bus<5 2 / Bus5–15 1 / Bus≥15 0) + Route (Velohauptroute 1).
//            ≥ 3 → Separate, = 2 → Übergang, ≤ 1 → Mischverkehr.
//  - luzern: kein Tram-Bonus, gleiche Schwellen (Tram wie Bus<5 behandelt).
//  - zurich: kriterienbasiert → null (kein automatischer Abzug; nur Typ-Auswahl + Breite).
//  - basel:  null (Abzug nur über Typ-Familie + Breite, kein Takt×Route-Schema).
export function haltestellenLoesung(
  route: Routentyp, oev: OevAngebot, stadt: Stadt = 'bern',
): Haltestellenloesung | null {
  if (oev === 'keine') return null
  if (stadt === 'zurich' || stadt === 'basel') return null
  const oevLevel: Record<Exclude<OevAngebot, 'keine'>, number> = stadt === 'luzern'
    ? { tram: 2, bus_unter5: 2, bus_5_15: 1, bus_ab15: 0 }   // Luzern kennt kein Tram → wie Bus<5
    : { tram: 3, bus_unter5: 2, bus_5_15: 1, bus_ab15: 0 }
  const sum = oevLevel[oev] + (route === 'Velohauptroute' ? 1 : 0)
  if (sum >= 3) return 'Separate Velofläche'
  if (sum === 2) return 'Übergang'
  return 'Mischverkehr'
}

// Abzug, wenn die Soll-Lösung «Separate Velofläche» verlangt, der vorhandene Haltestellentyp aber
// aus der Mischverkehr-Familie stammt (Über-Erfüllung und Übergang gelten als kompatibel). Normativ
// (keine FixMyCity-Daten zu Haltestellen), tunbar.
const HALTESTELLE_ABZUG = 1.0

// Separationsstufe (Ordnung) für den "IST erfüllt SOLL?"-Vergleich.
// Der Übergang 'Radstreifen oder Radweg' liegt zwischen Radstreifen (1) und Radweg (2).
const SEPARATION: Record<Fuehrungsart, number> = {
  'Mischverkehr': 0,
  'Radstreifen': 1,
  'Radstreifen oder Radweg': 1.5,
  'Radweg': 2,
}

// feel-safe-Klasse, auf die eine IST-Form für den Defizit-Abzug abgebildet wird.
// (Nur relevant, wenn die IST den Soll UNTERschreitet — Rang-2-Formen tun das nie.)
type FeelClass = 'Mischverkehr' | 'Radstreifen' | 'Radweg'

// Metadaten je IST-Führungsform:
//   q         – Querschnittstyp (Anzeige).
//   rank      – Separationsrang für den Soll-/Ist-Vergleich (vgl. SEPARATION der Soll-Formen).
//   feelClass – feel-safe-Klasse für den Defizit-Abzug (nur relevant, wenn IST < Soll).
//   optimal   – Breiten-Vorgabe für Velohauptrouten [m].
//   minimal   – Breiten-Vorgabe für Velorouten [m].
//   maximal   – obere Breitengrenze [m]; nur Velostrasse (Band 4,5–6,5). Andere Formen: keine Obergrenze.
//   nurT30    – Form nur bei Tempo 30 zulässig (Velostrasse).
// optimal/minimal fehlen = keine Breitenvorgabe (z. B. Mischverkehr).
// Quelle: Masterplan Veloinfrastruktur Bern (Regelbreiten Q1–Q9).
interface IstMeta {
  q: string
  rank: number
  feelClass: FeelClass
  optimal?: number
  minimal?: number
  maximal?: number
  nurT30?: boolean
}
const IST: Record<IstFuehrungsform, IstMeta> = {
  'Mischverkehr':              { q: 'Q6', rank: 0, feelClass: 'Mischverkehr' },
  'Radstreifen':               { q: 'Q1', rank: 1, feelClass: 'Radstreifen', optimal: 2.5, minimal: 1.8 },
  'Radweg strassenbegleitend / Geschützter Radstreifen': { q: 'Q2', rank: 2, feelClass: 'Radweg', optimal: 2.5, minimal: 1.8 },
  'Radweg abgesetzt':          { q: 'Q3', rank: 2, feelClass: 'Radweg', optimal: 2.5, minimal: 1.5 },
  // Umweltspur (Q4, Bus+Velo): DTV/Tempo nicht massgebend, sondern Bus-Takt (siehe unten).
  // Breite Optimal 4,50 (Velohauptroute) / Minimal 3,75 (Veloroute). rank/feelClass ungenutzt.
  'Umweltspur':                { q: 'Q4', rank: 0, feelClass: 'Mischverkehr', optimal: 4.5, minimal: 3.75 },
  // Velostrasse (Q9): nur bei Tempo 30 zulässig. Breite = Fahrbahnband 4,5–6,5 m, identisch für
  // Velohaupt- und Veloroute (daher optimal = minimal = 4,5). Zu schmal UND zu breit gibt Abzug.
  'Velostrasse':               { q: 'Q9', rank: 0, feelClass: 'Mischverkehr', nurT30: true,
                                 optimal: 4.5, minimal: 4.5, maximal: 6.5 },
  // Kombinierter Fuss-/Radweg (Q11): baulich gemeinsam genutzter Geh-/Radweg, vom MIV abgesetzt
  // → hohe Separation (rank 2), KEIN Note-4-Deckel (anders als Q12). Note ist breitengesteuert.
  // Bern-Breite ≥ 3,50 (beide Routentypen); stadtspezifisch (Basel frequenzabhängig) via BREITEN_*.
  'Kombinierter Fuss-/Radweg': { q: 'Q11', rank: 2, feelClass: 'Radweg', optimal: 3.5, minimal: 3.5 },
  // Fussweg Velo gestattet (Q12): Mischfläche Fuss/Velo, Kompromiss-/Restlösung. DTV/Tempo
  // nicht massgebend. Breite i. d. R. ≥ 3,50 m (gilt für beide Routentypen → optimal = minimal).
  'Fussweg Velo gestattet':    { q: 'Q12', rank: 0, feelClass: 'Mischverkehr', optimal: 3.5, minimal: 3.5 },
}

// ── Stadtspezifische Breiten-Sollwerte (optionaler Override je Führungsform) ──────
// Die Führungsform-WAHL (DTV×Tempo) und die feel-safe-Logik bleiben für alle Städte
// Bern-basiert; nur die massgeblichen Regel-BREITEN können stadtspezifisch sein.
// Override pro Feld: fehlt ein Wert, gilt der Berner Wert aus IST (Fallback).
export interface BreitenSoll { optimal?: number; minimal?: number; maximal?: number }

// Stadt Zürich — Standardmass aus den Velostandards Stadt Zürich, Tab. 1 (S. 16):
//   optimal = Velovorzugsroute (→ Velohauptroute), minimal = Hauptnetz (→ Veloroute).
// Wo Zürich keine eigene Vorgabe hat (Velostrasse-Band, Fussweg, Mischverkehr) → Berner Werte.
export const BREITEN_ZUERICH: Partial<Record<IstFuehrungsform, BreitenSoll>> = {
  'Radstreifen':                                         { optimal: 2.5, minimal: 2.2 },
  'Radweg strassenbegleitend / Geschützter Radstreifen': { optimal: 2.5, minimal: 2.2 },
  'Radweg abgesetzt':                                    { optimal: 2.5, minimal: 2.2 },
  'Umweltspur':                                          { optimal: 4.8, minimal: 4.5 },
  // Gemeinsamer Rad-/Fussweg: in ZH-Planungen vermieden, Ausnahme bei geringer Frequenz;
  // Mindestbreite 3,50 m (VSS-Leitfaden), beide Routentypen.
  'Kombinierter Fuss-/Radweg':                           { optimal: 3.5, minimal: 3.5 },
}

// Stadt Basel — Standards Fuss- und Veloverkehrsinfrastruktur Kanton Basel-Stadt (2024), Tab. 4
// (S. 20): optimal = Standardmass, minimal = reduziertes Standardmass. Velostrasse/Fussweg → Bern.
export const BREITEN_BASEL: Partial<Record<IstFuehrungsform, BreitenSoll>> = {
  'Radstreifen':                                         { optimal: 2.5, minimal: 1.8 },
  'Radweg strassenbegleitend / Geschützter Radstreifen': { optimal: 2.5, minimal: 2.2 },
  'Radweg abgesetzt':                                    { optimal: 2.5, minimal: 2.2 },
  'Umweltspur':                                          { optimal: 4.5, minimal: 3.0 },
  // Gemeinsamer Rad-/Fussweg, frequenzabhängig (Standards BS): mittlere–hohe Frequenz
  // (→ Velohauptroute) 6,00 m, geringe Frequenz (→ Veloroute) 4,80 m.
  'Kombinierter Fuss-/Radweg':                           { optimal: 6.0, minimal: 4.8 },
}

// Stadt Luzern — Standards Veloverkehr Stadt Luzern (Q-Blätter, S. 30–57):
// optimal = Optimalfall (Velohauptrouten), minimal = Minimalfall (übrige Velorouten).
export const BREITEN_LUZERN: Partial<Record<IstFuehrungsform, BreitenSoll>> = {
  'Radstreifen':                                         { optimal: 2.5, minimal: 1.8 },  // Q1a
  'Radweg strassenbegleitend / Geschützter Radstreifen': { optimal: 2.5, minimal: 1.8 },  // Q2a/Q2b
  'Radweg abgesetzt':                                    { optimal: 2.5, minimal: 1.8 },  // Q3
  'Umweltspur':                                          { optimal: 4.5, minimal: 3.75 }, // Q4 (Breiten wie Bern)
  'Velostrasse':                                         { optimal: 4.5, minimal: 4.5 },  // Q10
  'Kombinierter Fuss-/Radweg':                           { optimal: 3.5, minimal: 3.5 },  // ≥ 3,50 (beide Routentypen)
  'Fussweg Velo gestattet':                              { optimal: 3.5, minimal: 3.5 },  // S. 57
}

// Notenstufen-Abzug pro fehlendem Meter Breite (Variante A, linear). Hergeleitet aus dem
// empirischen Breiten-Gradienten: Radstreifen 2,0 → 3,5 m ≈ +20 feel-safe-Punkte über 1,5 m
// = 13,3 Pkt/m; geteilt durch 14,4 Pkt/Notenstufe ≈ 0,9. Tunbarer Parameter.
const NOTE_PRO_METER = 0.9

// Abzug, wenn beim Radstreifen rechts (Bordsteinseite) längs geparkt wird — Dooring-Lage,
// Velo zwischen Fahrspur und Parken. Hergeleitet aus den verifizierten radwege-Werten:
// Radstreifen kein Parken 75,9 % vs. Parken rechts 61,4 % = 14,5 feel-safe-Punkte; geteilt durch
// 14,4 Pkt/Notenstufe ≈ 1,0. Garantiert «keine Note 6», wenn Parken rechts vorhanden. Tunbar.
// (Der Effekt ist empirisch breitenabhängig — schmal stärker — hier vereinfacht als fixer Abzug.)
const PARKEN_RECHTS_ABZUG = 1.0

// Tram in der Fahrbahn (Schienen) — Malus NUR bei Mischverkehr, tempo-abhängig. Empirisch aus den
// radwege-Daten: Mischverkehr mit vs. ohne Tram, feel-safe-Verlust ÷ 14,4 Pkt/Notenstufe.
// Tempo 30: (26,3−14,4)/14,4 ≈ 0,83 → 0,8 · Tempo 50: (17,7−9,7)/14,4 ≈ 0,56 → 0,55.
// Bei eigener Radverkehrsanlage (Radstreifen) empirisch ~0 → dort kein Malus.
// Herleitung/Reproduktion: tools/verify_06.py (§2) bzw. docs/07_Tram_in_der_Fahrbahn.md. Tunbar.
const TRAM_MALUS: Record<'ruhig' | 'schnell', number> = { ruhig: 0.8, schnell: 0.55 }

// Umweltspur (Bus+Velo): zulässig nur bei tiefer–mittlerer Busfrequenz, d. h. Takt ≥ 7,5 Min.
// Dichterer Takt (< 7,5 Min, hohe Busfrequenz) → Note 1. Bei zulässigem Takt ist die Umweltspur als
// Velo-Führung höchstens «genügend» → Basisnote 4 (davon noch Breiten-Abzug). DTV/Tempo sind hier
// nicht massgebend. (Aus den FixMyCity-Daten nicht ableitbar — nur 2 Bus-Szenen; Werte normativ.)
const UMWELTSPUR_MIN_TAKT = 7.5   // Minuten; Takt darunter → Note 1
const UMWELTSPUR_BASIS = 4        // max. Note bei zulässigem Takt und genügender Breite

// Fussweg Velo gestattet (Q12, Mischfläche Fuss/Velo): Kompromisslösung → höchstens «genügend».
// Basisnote 4 (davon Breiten-Abzug). Die situativen Voraussetzungen (Schutzbedürfnis, geringe
// Frequenz, kein Gefälle, konfliktarm, fehlende Alternativen) sind Planerurteil → nur Hinweis im
// UI, kein Noteneinfluss. Normativ (keine FixMyCity-Daten für Mischflächen).
const FUSSWEG_BASIS = 4

// Empirische feel-safe % je Führungsform UND Tempo-Kontext (radwege-check, Velo-Perspektive,
// tram-bereinigt). Werte unabhängig aus den Einzelantworten verifiziert (tools/verify_06.py;
// Kreuzvalidierung vs. voteScore ø 1,8 Pkt). Aus den feel-safe-%-Werten je Tempo:
//   ruhig  = V ≤ 30 km/h   |   schnell = V > 30 km/h   (Daten für 30 und 50 km/h)
const FEELSAFE: Record<FeelClass, { ruhig: number; schnell: number }> = {
  'Mischverkehr': { ruhig: 26, schnell: 18 },  // verifiziert: T30 26.3 / T50 17.7
  'Radstreifen':  { ruhig: 74, schnell: 69 },  // verifiziert: T30 74.0 / T50 68.8 (alle Breiten)
  'Radweg':       { ruhig: 92, schnell: 90 },  // baulich getrennt (Poller-Niveau): T30 91.7 / T50 90.1
}

// feel-safe-Punkte pro Notenstufe = Spanne Mischverkehr→Radweg bei hohem Tempo (90−18 = 72 Pkt)
// geteilt durch 5 Notenstufen (6→1). So entspricht der ungünstigste Fall (Soll Radweg, Ist
// Mischverkehr, schnell) genau Note 1. Tunbarer Parameter.
const SCORE_PRO_NOTE = 14.4

const tempoKey = (v: number): 'ruhig' | 'schnell' => (v <= 30 ? 'ruhig' : 'schnell')

// Zielscore = feel-safe %, den die SOLL-Führungsart im aktuellen Tempo-Kontext erreicht.
// Bei den Übergängen das Mittel der beiden Nachbarformen → die schwächere Form erfüllt nur TEILWEISE.
function zielScore(soll: Fuehrungsart, v: number): number {
  const k = tempoKey(v)
  switch (soll) {
    case 'Mischverkehr': return FEELSAFE.Mischverkehr[k]
    case 'Radstreifen':  return FEELSAFE.Radstreifen[k]
    case 'Radweg':       return FEELSAFE.Radweg[k]
    case 'Radstreifen oder Radweg':
      return (FEELSAFE.Radstreifen[k] + FEELSAFE.Radweg[k]) / 2
  }
}

// Auf die nächste 0,5 runden (kaufmännisch / round-half-up: genau dazwischen → aufgerundet,
// da Math.round bei .5 Richtung +∞ rundet; z. B. 4,25 → 4,5, 4,24 → 4,0).
// Wird NUR EINMAL auf die Endnote angewandt (nach dem Breiten-Abzug); Zwischenwerte bleiben roh.
const roundToHalf = (x: number): number => Math.round(x * 2) / 2

// Vierstufige verbale Erfüllungsskala als alternative Darstellung der Schulnote (1…6).
// Reine Nachklassierung der Endnote — kein Einfluss auf die Berechnung. Grenzen an der
// Schulnoten-Logik: 4 = «genügend» (Vorgabe gerade erfüllt) → teilweise; ungenügend (≤ 3) → gar nicht.
export type Erfuellung = 'Gar nicht erfüllt' | 'Teilweise erfüllt' | 'Weitgehend erfüllt' | 'Vollständig erfüllt'
export function erfuellungsgrad(note: number): Erfuellung {
  if (note >= 5.5) return 'Vollständig erfüllt'
  if (note >= 4.5) return 'Weitgehend erfüllt'
  if (note >= 3.5) return 'Teilweise erfüllt'
  return 'Gar nicht erfüllt'
}

export interface NotenErgebnis {
  soll: Fuehrungsart
  ist: IstFuehrungsform
  q: string             // Querschnittstyp (Q1…Q9)
  note: number          // Endnote 1.0 … 6.0 in 0,5-Schritten (6 = beste)
  basisnote: number     // Führungsform-Note VOR Breitenabzug
  erfuellt: boolean     // IST erreicht/übertrifft die SOLL-Separation
  defizit: number       // feel-safe-Defizit der Form (0 wenn erfüllt)
  // Breite:
  routentyp: Routentyp
  sollbreite?: number    // massgebliche Untergrenze (Optimal bzw. Minimal); undefined = keine Vorgabe
  maxbreite?: number     // obere Grenze [m] (nur Velostrasse-Band); sonst undefined
  breite?: number        // eingegebene Ist-Breite [m]
  breitenDefizit: number // Abweichung ausserhalb der Vorgabe in Metern (zu schmal + zu breit, ≥ 0)
  breitenabzug: number   // Notenabzug aus der Breite
  breiteErfuellt: boolean
  breitenStatus: 'erfuellt' | 'zu schmal' | 'zu breit' | 'keine'
  // Parkierung rechts (Dooring) — bei Fahrbahn-Führungsformen, siehe PARKEN_RELEVANT:
  parkenRechts: ParkenRechts
  parkenAbzug: number    // Notenabzug aus Parkierung rechts (0 wenn nein/egal/nicht relevant)
  tramInFahrbahn: boolean // Tram (Schienen) in der Fahrbahn im Abschnitt
  tramAbzug: number      // Notenabzug aus Tram in der Fahrbahn (nur Mischverkehr, tempo-abhängig)
  // Haltestelle (ÖV):
  oevAngebot: OevAngebot
  haltestellentyp: Haltestellentyp
  sollHaltestelle?: Haltestellenloesung   // empfohlene Lösung; undefined = keine Haltestelle
  kompatibleHaltestellen: Haltestellentyp[]  // zur Soll-Lösung passende Typen
  haltestelleStatus: 'keine' | 'pruefen' | 'kompatibel' | 'inkompatibel'
  haltestelleAbzug: number  // Notenabzug aus inkompatiblem Haltestellentyp
  // Breite der Veloführung an der Haltestelle (nur HS1/HS2/HS4/HS5):
  haltestelleBreite?: number
  hsBreitenSoll?: number    // massgebliche Vorgabe [m]; undefined = kein Breitenkriterium
  hsBreitenabzug: number    // Notenabzug aus zu schmaler Haltestellen-Breite
  hsBreiteStatus: 'erfuellt' | 'zu schmal' | 'keine'
  hinweis?: string       // z. B. Velostrasse-Tempo-Regel
}

// Hauptbewertung: Führungsform-Note (Soll vs. Ist) plus Breiten-, Parkierungs- und Haltestellen-
// Abzug zur Endnote zusammenführen.
//   breite        = Ist-Breite der Anlage [m] (optional)
//   routentyp     = bestimmt die massgebliche Vorgabe: Velohauptroute → Optimal, Veloroute → Minimal
//   parkenRechts  = Parkierung rechts (Dooring), nur Radstreifen
//   oevTakt       = Bus-Takt [Min], nur Umweltspur
//   oevAngebot    = ÖV-Angebot im Abschnitt (für die Haltestellen-Soll-Lösung)
//   haltestellentyp = vorhandener Haltestellentyp (Kompatibilitätsprüfung)
export function fuehrungsformNote(
  dtv: number, v: number, ist: IstFuehrungsform,
  breite?: number, routentyp: Routentyp = 'Velohauptroute',
  parkenRechts: ParkenRechts = 'egal', oevTakt?: number,
  oevAngebot: OevAngebot = 'keine', haltestellentyp: Haltestellentyp = 'keine',
  haltestelleBreite?: number, tramInFahrbahn = false,
  breitenSoll?: BreitenSoll,   // stadtspezifischer Breiten-Override (Fallback je Feld: Bern/IST)
  stadt: Stadt = 'bern',       // bestimmt Soll-Tabelle + Haltestellen-Logik
  strassentyp?: Strassentyp,   // nur Basel: für die strassentyp-basierte Soll-Wahl
): NotenErgebnis {
  const soll = fuehrungsart(dtv, v, stadt, routentyp, strassentyp)
  const meta = IST[ist]

  // ── Breite: Untergrenze je Routentyp (+ optionale Obergrenze, nur Velostrasse-Band). Abzug
  // (Variante A, linear) = Abweichung ausserhalb des Bereichs × NOTE_PRO_METER. «Zu schmal» stützt
  // sich auf den feel-safe-Gradienten; «zu breit» (nur Velostrasse) ist normativ, gleicher Satz.
  // Breiten-Sollwerte: stadtspezifischer Override je Feld, sonst Berner Wert (IST).
  const optimal = breitenSoll?.optimal ?? meta.optimal
  const minimal = breitenSoll?.minimal ?? meta.minimal
  const sollbreite = routentyp === 'Velohauptroute' ? optimal : minimal
  const maxbreite = breitenSoll?.maximal ?? meta.maximal
  let breitenDefizit = 0
  let breitenStatus: NotenErgebnis['breitenStatus'] = 'keine'
  if (breite != null && breite > 0 && (sollbreite != null || maxbreite != null)) {
    const zuSchmal = sollbreite != null ? Math.max(0, sollbreite - breite) : 0
    const zuBreit = maxbreite != null ? Math.max(0, breite - maxbreite) : 0
    breitenDefizit = zuSchmal + zuBreit
    breitenStatus = breitenDefizit === 0 ? 'erfuellt' : (zuSchmal > 0 ? 'zu schmal' : 'zu breit')
  }
  const breitenabzug = breitenDefizit * NOTE_PRO_METER
  const breiteErfuellt = breitenStatus === 'erfuellt' || breitenStatus === 'keine'

  // ── Parkierung rechts (Dooring), nur Radstreifen.
  const parkenAbzug = (PARKEN_RELEVANT.includes(ist) && parkenRechts === 'ja') ? PARKEN_RECHTS_ABZUG : 0

  // ── Tram in der Fahrbahn (Schienen): Malus nur bei Mischverkehr, tempo-abhängig (siehe TRAM_MALUS).
  const tramAbzug = (tramInFahrbahn && ist === 'Mischverkehr') ? TRAM_MALUS[tempoKey(v)] : 0

  // ── Haltestelle: Soll-Lösung aus Route × ÖV (stadtabhängig); Abzug nur, wenn Separate Velofläche
  // gefordert ist, der vorhandene Typ aber aus der Mischverkehr-Familie stammt (Über-Erfüllung = ok).
  // Zürich/Basel: keine Soll-Lösung (null) → kein automatischer Abzug, nur Typ-Auswahl + Breite.
  const sollHaltestelle = haltestellenLoesung(routentyp, oevAngebot, stadt) ?? undefined
  // Zur Soll-Lösung passende Typen der gewählten Stadt (Separate/Übergang = Separate-Typen; sonst alle).
  const kompatibleHaltestellen = sollHaltestelle
    ? haltestellenTypen(stadt).filter(t =>
        sollHaltestelle === 'Mischverkehr' ? true : HALTESTELLEN[stadt][t]?.familie === 'Separate')
    : []
  let haltestelleAbzug = 0
  let haltestelleStatus: NotenErgebnis['haltestelleStatus'] = 'keine'
  if (sollHaltestelle) {
    const fam = hsTyp(stadt, haltestellentyp)?.familie ?? null
    if (fam == null) {
      haltestelleStatus = 'pruefen'  // Ist-Typ nicht angegeben → nur Empfehlung
    } else if (sollHaltestelle === 'Separate Velofläche' && fam === 'Mischverkehr') {
      haltestelleAbzug = HALTESTELLE_ABZUG
      haltestelleStatus = 'inkompatibel'
    } else {
      haltestelleStatus = 'kompatibel'  // passender Typ, Über-Erfüllung oder Übergang
    }
  }

  // ── Breite der Veloführung an der Haltestelle (nur Typen mit Breitenkriterium, stadtabhängig).
  const hsSpec = hsTyp(stadt, haltestellentyp)?.breite
  const hsBreitenSoll = hsSpec
    ? (routentyp === 'Velohauptroute' ? hsSpec.optimal : hsSpec.minimal)
    : undefined
  let hsBreitenabzug = 0
  let hsBreiteStatus: NotenErgebnis['hsBreiteStatus'] = 'keine'
  if (hsBreitenSoll != null && haltestelleBreite != null && haltestelleBreite > 0) {
    const d = Math.max(0, hsBreitenSoll - haltestelleBreite)
    hsBreitenabzug = d * NOTE_PRO_METER
    hsBreiteStatus = d === 0 ? 'erfuellt' : 'zu schmal'
  }

  // Basel: Mischverkehr/Velostrasse auf siedlungsorientierter Strasse nur unter dem DWV-Deckel
  // zulässig (Velohauptroute/Vorzugsroute 2'500, Veloroute/Pendler-Basis 5'000; DWV ≈ DTV). Darüber
  // gibt Basel KEINE andere Führungsform vor → reiner Hinweis, kein Notenabzug (Tab. 3, S. 19).
  const baselDeckel = routentyp === 'Velohauptroute' ? 2500 : 5000
  const baselDeckelHinweis =
    (stadt === 'basel' && strassentyp === 'siedlungsorientiert' && dtv > baselDeckel)
      ? `DTV ${dtv} über Basler Höchstwert ${baselDeckel} für diese Führungsform — gemäss Basel keine konforme Lösung (Verkehrsreduktion nötig).`
      : undefined

  // ── Endnote: Basisnote minus alle Abzüge (begrenzt 1…maxNote, gerundet 0,5). forceNote überschreibt
  // (Sonderfälle mit fixer Note 1). Rundung erfolgt EINMALIG hier auf die Endnote.
  const finish = (
    basisnote: number, erfuellt: boolean, defizit: number,
    opts: { hinweis?: string; maxNote?: number; forceNote?: number } = {},
  ): NotenErgebnis => {
    const maxNote = opts.maxNote ?? 6
    const roh = basisnote - breitenabzug - parkenAbzug - tramAbzug - haltestelleAbzug - hsBreitenabzug
    const note = opts.forceNote != null ? opts.forceNote
      : roundToHalf(Math.min(maxNote, Math.max(1, roh)))
    return {
      soll, ist, q: meta.q, basisnote, erfuellt, defizit, note,
      routentyp, sollbreite, maxbreite, breite, breitenDefizit, breitenabzug,
      breiteErfuellt, breitenStatus, parkenRechts, parkenAbzug, tramInFahrbahn, tramAbzug,
      oevAngebot, haltestellentyp, sollHaltestelle, kompatibleHaltestellen,
      haltestelleStatus, haltestelleAbzug,
      haltestelleBreite, hsBreitenSoll, hsBreitenabzug, hsBreiteStatus,
      hinweis: [opts.hinweis, baselDeckelHinweis].filter(Boolean).join(' · ') || undefined,
    }
  }

  // Sonderfall Velostrasse (Q9): nur bei Tempo 30 zulässig.
  if (ist === 'Velostrasse') {
    if (v > 30) {
      return finish(1, false, 0,
        { forceNote: 1, hinweis: 'Velostrassen sind nur bei Tempo 30 zulässig.' })
    }
    // Bei Tempo 30: Form akzeptiert (Basis 6); Breite wirkt, sobald eine Vorgabe hinterlegt ist.
    return finish(6, true, 0)
  }

  // Sonderfall Umweltspur (Q4): DTV/Tempo irrelevant, massgebend ist der Bus-Takt.
  if (ist === 'Umweltspur') {
    if (oevTakt != null && oevTakt < UMWELTSPUR_MIN_TAKT) {
      return finish(1, false, 0, { forceNote: 1,
        hinweis: `Umweltspur nur bei tiefer–mittlerer Busfrequenz zulässig (Takt ≥ ${UMWELTSPUR_MIN_TAKT} Min).` })
    }
    // Zulässiger Takt: Basis 4 («genügend»), davon Abzüge; nach oben auf 4 begrenzt.
    return finish(UMWELTSPUR_BASIS, true, 0, { maxNote: UMWELTSPUR_BASIS })
  }

  // Sonderfall Fussweg Velo gestattet (Q12): DTV/Tempo irrelevant; Basis 4, davon Abzüge.
  // Voraussetzungen (inkl. Gefälle-Vorsicht) werden im UI als Checkliste gezeigt, ohne Noteneinfluss.
  if (ist === 'Fussweg Velo gestattet') {
    return finish(FUSSWEG_BASIS, true, 0, { maxNote: FUSSWEG_BASIS })
  }

  // Führungsform-Note: IST erreicht/übertrifft die geforderte Separation → Basis 6.
  if (meta.rank >= SEPARATION[soll]) {
    return finish(6, true, 0)
  }
  // Sonst: Abzug aus dem feel-safe-Defizit (kontext-sensitiv nach Tempo).
  const defizit = Math.max(0, zielScore(soll, v) - FEELSAFE[meta.feelClass][tempoKey(v)])
  return finish(6 - defizit / SCORE_PRO_NOTE, false, Math.round(defizit))
}

// ── 3) VERGLEICH: dieselben Eingaben nach den Standards anderer Städte ─────────
//
// Rechnet einen Abschnitt zusätzlich nach den Vorgaben der jeweils ANDEREN Städte
// durch. Die feel-safe-Logik ist stadtübergreifend; Unterschiede entstehen nur aus
// der Soll-Tabelle (fuehrungsart) und den stadtspezifischen Breiten-Sollwerten.

export const STAEDTE: Stadt[] = ['bern', 'zurich', 'basel', 'luzern']

// Stadtspezifische Breiten-Sollwerte je Stadt (Bern = keine → Berner Standardwerte aus IST).
const BREITEN_BY_STADT: Record<Stadt, Partial<Record<IstFuehrungsform, BreitenSoll>> | undefined> = {
  bern: undefined,
  zurich: BREITEN_ZUERICH,
  basel: BREITEN_BASEL,
  luzern: BREITEN_LUZERN,
}

// Basel kennt keinen DTV-basierten Soll, sondern unterscheidet verkehrs-/siedlungsorientierte
// Strassen. Liegt (wie bei Berner Daten) kein Strassentyp vor, wird er aus DTV/Tempo GESCHÄTZT:
// siedlungsorientierte Strassen sind Tempo-30 mit DWV-Deckel; höheres Tempo/DTV → verkehrsorientiert.
export function baselStrassentypAusVerkehr(dtv: number, v: number): Strassentyp {
  return (v > 30 || dtv >= 5000) ? 'verkehrsorientiert' : 'siedlungsorientiert'
}

export interface VergleichArgs {
  dtv: number; v: number; ist: IstFuehrungsform
  breite?: number; routentyp?: Routentyp
  parkenRechts?: ParkenRechts; oevTakt?: number
  oevAngebot?: OevAngebot; haltestellentyp?: Haltestellentyp
  haltestelleBreite?: number; tram?: boolean
}

export interface VergleichsNote {
  stadt: Stadt
  note: number
  geschaetzt: boolean   // true = Soll-Eingabe (z. B. Basel-Strassentyp) wurde geschätzt
  soll: Fuehrungsart    // geforderte Führungsform nach den Standards dieser Stadt
  sollbreite?: number   // massgebliche Soll-Breite [m]; undefined = keine Vorgabe
  gruende: string[]     // Klartext-Gründe (mit Werten), warum die Note von der Referenz abweicht
}

// Eine Bewertung nach den Standards einer Stadt berechnen (Basel: Strassentyp aus DTV/Tempo).
function bewerteFuerStadt(a: VergleichArgs, stadt: Stadt): NotenErgebnis {
  const strassentyp = stadt === 'basel' ? baselStrassentypAusVerkehr(a.dtv, a.v) : undefined
  return fuehrungsformNote(
    a.dtv, a.v, a.ist, a.breite, a.routentyp ?? 'Velohauptroute',
    a.parkenRechts ?? 'egal', a.oevTakt, a.oevAngebot ?? 'keine',
    a.haltestellentyp ?? 'keine', a.haltestelleBreite, a.tram ?? false,
    BREITEN_BY_STADT[stadt]?.[a.ist], stadt, strassentyp,
  )
}

const breiteTxt = (b?: number) => b != null ? `${b.toFixed(1)} m` : 'keine Vorgabe'

// Endnoten nach den Standards aller Städte ausser `ausser`, je mit Begründung der Abweichung
// gegenüber der Referenz-Stadt (`ausser`). Für Basel wird der Strassentyp geschätzt.
export function vergleichsNoten(a: VergleichArgs, ausser: Stadt): VergleichsNote[] {
  const ref = bewerteFuerStadt(a, ausser)
  return STAEDTE.filter(s => s !== ausser).map(stadt => {
    const r = bewerteFuerStadt(a, stadt)
    const gruende: string[] = []
    // Basel: Strassentyp ist geschätzt → immer als erster Hinweis (auch ohne Notenabweichung).
    if (stadt === 'basel')
      gruende.push(`Strassentyp geschätzt (${baselStrassentypAusVerkehr(a.dtv, a.v)})`)
    // Abweichungstreiber nur listen, wenn die Note tatsächlich differiert.
    if (r.note !== ref.note) {
      if (r.soll !== ref.soll)
        gruende.push(`Soll: ${r.soll} statt ${ref.soll}`)
      if (r.sollbreite !== ref.sollbreite)
        gruende.push(`Soll-Breite ${breiteTxt(r.sollbreite)} statt ${breiteTxt(ref.sollbreite)}`)
      if (r.haltestelleAbzug !== ref.haltestelleAbzug)
        gruende.push('andere Haltestellen-Regel')
    }
    return { stadt, note: r.note, geschaetzt: stadt === 'basel', soll: r.soll, sollbreite: r.sollbreite, gruende }
  })
}
