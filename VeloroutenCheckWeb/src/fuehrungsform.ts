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
  | 'Radstreifen oder Radweg'
  | 'Radweg'

// ── 1) SOLL: Wahl der Führungsart (Masterplan Bern, Entscheidungstabelle) ─────
//
//   DTV MIV \ km/h     ≤30          31–40        41–50              51–80
//   < 2'000            Mischverkehr Radstreifen  Radstreifen        Radweg
//   2'000–5'000        Radstreifen  Radstreifen  Radweg             Radweg
//   5'000–10'000       Radstr./Radweg (Übergang) …                  Radweg
//   > 10'000           Radweg       Radweg       Radweg             Radweg
//
export function fuehrungsart(dtv: number, v: number): Fuehrungsart {
  if (v > 50 || dtv >= 10000) return 'Radweg'
  if (dtv >= 5000)            return 'Radstreifen oder Radweg'
  if (dtv >= 2000)            return v <= 40 ? 'Radstreifen' : 'Radweg'
  return v <= 30 ? 'Mischverkehr' : 'Radstreifen'
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
  | 'Radweg strassenbegleitend'
  | 'Radweg abgesetzt'
  | 'Umweltspur'
  | 'Velostrasse'
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
export type Haltestellentyp =
  | 'keine'
  // Familie «Separate Velofläche»:
  | 'Haltestelle mit Veloumfahrung'        // HS1
  | 'Kaphaltestelle mit Veloüberfahrt'     // HS2
  | 'Haltestelle mit rückwärtigem Radweg'  // HS4
  | 'Inselhaltestelle'                     // HS5
  // Familie «Mischverkehr»:
  | 'Kaphaltestelle'                       // HS3 (Ausnahme)
  | 'Fahrbahnhaltestelle Bus'              // HS6
  | 'Busbucht'                             // HS7

const HALTESTELLE_FAMILIE: Record<Haltestellentyp, 'Separate' | 'Mischverkehr' | null> = {
  'keine': null,
  'Haltestelle mit Veloumfahrung': 'Separate',
  'Kaphaltestelle mit Veloüberfahrt': 'Separate',
  'Haltestelle mit rückwärtigem Radweg': 'Separate',
  'Inselhaltestelle': 'Separate',
  'Kaphaltestelle': 'Mischverkehr',
  'Fahrbahnhaltestelle Bus': 'Mischverkehr',
  'Busbucht': 'Mischverkehr',
}

export const KOMPATIBLE_HALTESTELLEN: Record<Haltestellenloesung, Haltestellentyp[]> = {
  'Separate Velofläche': ['Haltestelle mit Veloumfahrung', 'Kaphaltestelle mit Veloüberfahrt',
                          'Haltestelle mit rückwärtigem Radweg', 'Inselhaltestelle'],
  'Mischverkehr': ['Kaphaltestelle', 'Fahrbahnhaltestelle Bus', 'Busbucht'],
  'Übergang': ['Haltestelle mit Veloumfahrung', 'Kaphaltestelle mit Veloüberfahrt',
               'Haltestelle mit rückwärtigem Radweg', 'Inselhaltestelle',
               'Kaphaltestelle', 'Fahrbahnhaltestelle Bus', 'Busbucht'],
}

// Breitenvorgabe der Veloführung an der Haltestelle [m] je Typ (Velohauptroute → Optimal,
// Veloroute → Minimal). Nur HS1/HS2/HS4/HS5 haben eine Breite; HS3/HS6/HS7 nicht (kein Kriterium).
// Bei Optimal-Bereichen (z. B. 1,8–2,5) gilt die Untergrenze als Optimal-Schwelle.
const HALTESTELLE_BREITE: Partial<Record<Haltestellentyp, { optimal: number; minimal: number }>> = {
  'Haltestelle mit Veloumfahrung':        { optimal: 1.8, minimal: 1.6 },  // HS1 (Opt 1,8–2,5)
  'Kaphaltestelle mit Veloüberfahrt':     { optimal: 1.8, minimal: 1.5 },  // HS2
  'Haltestelle mit rückwärtigem Radweg':  { optimal: 1.8, minimal: 1.6 },  // HS4 (Opt 1,8–2,5)
  'Inselhaltestelle':                     { optimal: 2.5, minimal: 1.5 },  // HS5
}
// Haltestellentypen mit Breitenkriterium (für die UI-Sichtbarkeit des Breitenfelds).
export const HALTESTELLE_MIT_BREITE = Object.keys(HALTESTELLE_BREITE) as Haltestellentyp[]

// Soll-Haltestellenlösung aus Route × ÖV-Angebot (Masterplan-Diagramm, S. … «Veloverkehrslösung
// gemäss Masterplan»). Scoring: ÖV (Tram 3 / Bus<5 2 / Bus5–15 1 / Bus≥15 0) + Route
// (Velohauptroute 1 / Veloroute 0). Summe ≥ 3 → Separate, = 2 → Übergang, ≤ 1 → Mischverkehr.
export function haltestellenLoesung(route: Routentyp, oev: OevAngebot): Haltestellenloesung | null {
  if (oev === 'keine') return null
  const oevLevel: Record<Exclude<OevAngebot, 'keine'>, number> =
    { tram: 3, bus_unter5: 2, bus_5_15: 1, bus_ab15: 0 }
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
  'Radweg strassenbegleitend': { q: 'Q2', rank: 2, feelClass: 'Radweg', optimal: 2.5, minimal: 1.8 },
  'Radweg abgesetzt':          { q: 'Q3', rank: 2, feelClass: 'Radweg', optimal: 2.5, minimal: 1.5 },
  // Umweltspur (Q4, Bus+Velo): DTV/Tempo nicht massgebend, sondern Bus-Takt (siehe unten).
  // Breite Optimal 4,50 (Velohauptroute) / Minimal 3,75 (Veloroute). rank/feelClass ungenutzt.
  'Umweltspur':                { q: 'Q4', rank: 0, feelClass: 'Mischverkehr', optimal: 4.5, minimal: 3.75 },
  // Velostrasse (Q9): nur bei Tempo 30 zulässig. Breite = Fahrbahnband 4,5–6,5 m, identisch für
  // Velohaupt- und Veloroute (daher optimal = minimal = 4,5). Zu schmal UND zu breit gibt Abzug.
  'Velostrasse':               { q: 'Q9', rank: 0, feelClass: 'Mischverkehr', nurT30: true,
                                 optimal: 4.5, minimal: 4.5, maximal: 6.5 },
  // Fussweg Velo gestattet (Q12): Mischfläche Fuss/Velo, Kompromiss-/Restlösung. DTV/Tempo
  // nicht massgebend. Breite i. d. R. ≥ 3,50 m (gilt für beide Routentypen → optimal = minimal).
  'Fussweg Velo gestattet':    { q: 'Q12', rank: 0, feelClass: 'Mischverkehr', optimal: 3.5, minimal: 3.5 },
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
// Beim Übergang 'Radstreifen oder Radweg' das Mittel aus Radstreifen und Radweg
// → Radstreifen erfüllt den Soll nur TEILWEISE (Entscheid des Anwenders).
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
  haltestelleBreite?: number,
): NotenErgebnis {
  const soll = fuehrungsart(dtv, v)
  const meta = IST[ist]

  // ── Breite: Untergrenze je Routentyp (+ optionale Obergrenze, nur Velostrasse-Band). Abzug
  // (Variante A, linear) = Abweichung ausserhalb des Bereichs × NOTE_PRO_METER. «Zu schmal» stützt
  // sich auf den feel-safe-Gradienten; «zu breit» (nur Velostrasse) ist normativ, gleicher Satz.
  const sollbreite = routentyp === 'Velohauptroute' ? meta.optimal : meta.minimal
  const maxbreite = meta.maximal
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

  // ── Haltestelle: Soll-Lösung aus Route × ÖV; Abzug nur, wenn Separate Velofläche gefordert ist,
  // der vorhandene Typ aber aus der Mischverkehr-Familie stammt (Über-Erfüllung/Übergang = ok).
  const sollHaltestelle = haltestellenLoesung(routentyp, oevAngebot) ?? undefined
  const kompatibleHaltestellen = sollHaltestelle ? KOMPATIBLE_HALTESTELLEN[sollHaltestelle] : []
  let haltestelleAbzug = 0
  let haltestelleStatus: NotenErgebnis['haltestelleStatus'] = 'keine'
  if (sollHaltestelle) {
    const fam = HALTESTELLE_FAMILIE[haltestellentyp]
    if (fam == null) {
      haltestelleStatus = 'pruefen'  // Ist-Typ nicht angegeben → nur Empfehlung
    } else if (sollHaltestelle === 'Separate Velofläche' && fam === 'Mischverkehr') {
      haltestelleAbzug = HALTESTELLE_ABZUG
      haltestelleStatus = 'inkompatibel'
    } else {
      haltestelleStatus = 'kompatibel'  // passender Typ, Über-Erfüllung oder Übergang
    }
  }

  // ── Breite der Veloführung an der Haltestelle (nur Typen mit Breitenkriterium).
  const hsSpec = HALTESTELLE_BREITE[haltestellentyp]
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

  // ── Endnote: Basisnote minus alle Abzüge (begrenzt 1…maxNote, gerundet 0,5). forceNote überschreibt
  // (Sonderfälle mit fixer Note 1). Rundung erfolgt EINMALIG hier auf die Endnote.
  const finish = (
    basisnote: number, erfuellt: boolean, defizit: number,
    opts: { hinweis?: string; maxNote?: number; forceNote?: number } = {},
  ): NotenErgebnis => {
    const maxNote = opts.maxNote ?? 6
    const roh = basisnote - breitenabzug - parkenAbzug - haltestelleAbzug - hsBreitenabzug
    const note = opts.forceNote != null ? opts.forceNote
      : roundToHalf(Math.min(maxNote, Math.max(1, roh)))
    return {
      soll, ist, q: meta.q, basisnote, erfuellt, defizit, note,
      routentyp, sollbreite, maxbreite, breite, breitenDefizit, breitenabzug,
      breiteErfuellt, breitenStatus, parkenRechts, parkenAbzug,
      oevAngebot, haltestellentyp, sollHaltestelle, kompatibleHaltestellen,
      haltestelleStatus, haltestelleAbzug,
      haltestelleBreite, hsBreitenSoll, hsBreitenabzug, hsBreiteStatus,
      hinweis: opts.hinweis,
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
