// ── Strecke: Abschnitte (Eingabezustand) und ihr Aufbau aus OSM-Segmenten ─────
//
// Aus App.tsx herausgelöst (29.09.2026), damit die reine Logik — Kandidat → Abschnitt,
// Ordnen, Zusammenfassen, DTV-Annahme — ohne Browser testbar ist (strecke.test.ts).

import {
  fuehrungsart, brauchtDtvTempo, GEGENVERKEHR_FORMEN,
  type Fuehrungsart, type IstFuehrungsform, type Routentyp, type ParkenRechts,
  type OevAngebot, type Haltestellentyp, type Stadt, type Strassentyp,
} from './fuehrungsform'
import type { Cand } from './VeloMap'
import type { OevInfo } from './bern'
import type { Aufteilung, FussNetz, Markierung } from './aufteilung'
import { mergeObs, type ObsStats } from './obs'
import { peilung, type LL } from './geo'
import { PARK_SCHWELLE } from './parkierung'
import type { Mittelinsel, ParkTiefe, Zweiradfeld } from './breitenmessung'

// ── Abschnitt: Eingabezustand ────────────────────────────────────────────────
// Herkunft eines Feldwerts: amtlich (Geodaten Stadt Bern) > OSM > manuell.
// Fehlt ein Eintrag, ist das Feld leer (keine erfundenen Werte).
export type Quelle = 'amtlich' | 'osm' | 'manuell' | 'fahrplan' | 'markierung' | 'angenommen' | 'luftbild' | 'gemessen' | 'av'

// DTV-Annahme (nur Bern): fehlt der DTV, gilt bei bekanntem Tempo DTV ≤ 2000. Die „Flächendeckenden
// Verkehrsdaten" Bern führen alle Strassen > 2000 + alle Altstadt-Strassen — kein Eintrag ⇒ ≤ 2000
// (ausserhalb Altstadt; die Live-Punktabfrage liefert in der Altstadt zuverlässig einen Wert).
export const DTV_ANGENOMMEN = 1000   // Repräsentant des „< 2000"-Bands (jeder Wert < 2000 ergibt dasselbe Soll)
// «Kein Eintrag» setzt voraus, dass NACHGESEHEN wurde: `dtvGeprueft` trägt der Abschnitt nur,
// wenn er von der Karte stammt und der Verkehrsdaten-Layer für seine Segmente vollständig
// geantwortet hat (bern.ts). Bis zum 29.09.2026 galt die Annahme für JEDEN Berner Abschnitt
// mit Tempo und ohne DTV — auch für von Hand angelegte (nie abgefragt), für solche, die vor
// dem Ende der Anreicherung übernommen wurden, und rückwirkend für Segmente, deren Abfrage
// gescheitert war. In allen drei Fällen entstand die günstigste Soll-Führungsform samt Chip.
export function dtvAssumed(s: Section, city: Stadt): boolean {
  return city === 'bern' && s.dtvGeprueft && !Number.isFinite(s.dtv) && Number.isFinite(s.speed)
}
export function dtvEff(s: Section, city: Stadt): number {
  return Number.isFinite(s.dtv) ? s.dtv : (dtvAssumed(s, city) ? DTV_ANGENOMMEN : NaN)
}
// Felder, deren Herkunft verfolgt wird (datenartige Eingaben).
export type QuelleFeld = 'dtv' | 'speed' | 'ist' | 'breite' | 'routentyp' | 'oevAngebot' | 'tram' | 'strassentyp' | 'richtung'
  | 'fahrbahnbreite' | 'parkenRechts' | 'oevTakt'

// ── Seiten: die beiden Fahrtrichtungen eines Abschnitts (seit 14.10.2026) ──────
// Seite A = Fahrtrichtung entlang der Strecke, Seite B = Gegenrichtung (Rechtsverkehr: je die
// rechte Fahrbahnseite). Was je Fahrtrichtung verschieden sein kann, steht je Seite (Seite);
// Verkehr (DTV, Tempo), Routentyp, Strassentyp, Tram und das ÖV-Angebot gelten für beide.
// Gleiches Modell wie im lokalen Berner Rechner (ist_fuehrung / ist_fuehrung_gegenseite):
// eine leere Gegenseite heisst «gleich wie Seite A», die Abschnittsnote ist die schlechtere
// Seite (bewertung.ts).
export interface Seite {
  ist: IstFuehrungsform | ''   // '' = noch nicht gewählt
  breite: number               // NaN = leer
  parkenRechts: ParkenRechts
  parkenSicherheitsstreifen: boolean  // Sicherheitsstreifen ggü. Parkplätzen (SN 640 060), nur bei Parkierung=ja
  oevTakt: number              // öV-Takt der Umweltspur [Min], NaN = leer
  haltestellentyp: Haltestellentyp
  haltestelleBreite: number    // NaN = leer
  ohneHaltestelle: boolean     // der Abschnitt hat eine Haltestelle, aber nicht auf dieser Seite
}
export type SeitenQuelle = Partial<Record<'ist' | 'breite' | 'parkenRechts' | 'oevTakt', Quelle>>
export interface GegenSeite extends Seite { quelle: SeitenQuelle }
export type Richtung = 'beide' | 'eine'

// Die Seiten-Felder (Seite) des Abschnitts selbst sind Seite A.
export interface Section extends Seite {
  id: number
  dtv: number                  // NaN = leer
  dtvGeprueft: boolean         // nur Bern: Verkehrsdaten-Layer wurde für diesen Abschnitt erfolgreich abgefragt
  speed: number                // NaN = leer
  routentyp: Routentyp | ''    // '' = noch nicht gewählt
  strassentyp: Strassentyp | ''  // '' = noch nicht gewählt (nur Basel relevant)
  oevAngebot: OevAngebot
  tram: boolean                // Tram (Schienen) in der Fahrbahn — entkoppelt von der Haltestelle
  // Fahrbahnbreite von Bordstein zu Bordstein [m], NaN = leer. Reine Information, nicht in der
  // Note (seit 16.10.2026); aus der AV ermittelt (breitenmessung.ts, fahrbahnbreite) oder von Hand.
  fahrbahnbreite: number
  richtung: Richtung           // 'beide' = beide Seiten erfassen (Standard), 'eine' = nur Seite A
  gegen?: GegenSeite           // Seite B, wenn sie von A abweicht; fehlt = gleich wie Seite A
  peilungA?: number            // Fahrtrichtung der Seite A [Grad, 0 = Nord]; nur Abschnitte von der Karte
  candsGegenA?: number[]       // Kandidaten, deren Way GEGEN Seite A läuft (Karten-Pfeil)
  osmVeloGegenverkehr?: boolean  // OSM: Einbahn mit Velo in der Gegenrichtung (Hinweis in der Maske)
  luftbild?: { a: number; b: number }  // Luftbild: Anteil der Länge mit Radstreifen-Fund je Seite (nur Hinweis)
  parkAnteil?: { a: number; b: number }  // amtliche Parkfelder: Anteil der Länge je Seite (parkierung.ts)
  label?: string               // Herkunft/Beschriftung (z. B. aus OSM geladen)
  quelle: Partial<Record<QuelleFeld, Quelle>>   // gesetzt je Feld, sobald ein Wert vorliegt
  candIds?: number[]           // Kandidaten-Kennungen der Segmente dieses Abschnitts (für die Karten-Zuordnung)
  obs?: ObsStats               // OpenBikeSensor-Überholabstände (Zusatzinfo, nicht in der Note)
  oev?: OevInfo                // ÖV-Erkennung (Geoportal): Haltestelle/Modus im Abschnitt
  aufteilung?: Aufteilung      // geplanter Querschnitt (aufteilung.ts; nur Bern, nicht in der Note von heute)
  trottoir?: { a: number; b: number; parkA?: boolean; parkB?: boolean; gruenA?: number; gruenB?: number; wegA?: boolean; wegB?: boolean }  // Trottoirbreite je Seite aus der AV [m], NaN = keines;
                                       // wegA/B: der parallele Radweg der Seite liegt auf der Trottoirfläche (wegAufTrottoir), die Ausgangslage zieht ihn ab
                                       // gruenA/B: Grünstreifen zwischen Fahrbahn und Trottoir (trottoirbreiten, seit 20.10.2026)
                                       // parkA/B: Parkierung dieser Seite liegt auf der Trottoirfläche (parkierungAufTrottoir)
  fussnetzGeoportal?: FussNetz         // Fussverkehrsnetz aus dem Richtplan Fussverkehr (fussnetz.ts; nur Bern)
  ohneFahrbahn?: boolean               // Weg ohne Fahrbahn (OSM-Rad-/Fussweg): die Fahrbahnbreite ist die Wegbreite
  parkTiefe?: { a?: ParkTiefe; b?: ParkTiefe }   // Tiefe und Anordnung der Parkierung je Seite (parkierungTiefe, seit 20.10.2026)
  // Haltestellenbereich (nur Bern, seit 20.10.2026): Die Haltestelle prägt den Abschnitt; die Note kommt allein aus ihr
  haltestellenbereich?: boolean
  haltestellenbereichNein?: boolean   // Vorschlag der App abgelehnt (nicht erneut zeigen)
  // Querschnitt von heute, von Hand am Luftbild aufgenommen (querschnittAufnahme.ts, seit 20.10.2026): ersetzt die
  // gemessene Ausgangslage der Planung
  querschnittHeute?: { teile: Aufteilung['teile']; fahrbahn: number; seitenraum: number }
  gesamtbreite?: number   // Ganzer Querschnitt, am Luftbild gemessen [m] (seit 21.10.2026): verfügbare Breite heute
  // Haltestelleninsel aus der AV (breitenmessung.ts haltestelleninsel, seit 21.10.2026): Seite, Insel (Wartebereich), Streifen
  // dahinter (Veloumfahrung bzw. Fahrspur), Fahrbahn bis zum Bord gegenüber, Trottoir hinter dem Streifen [m]
  haltestelleninsel?: { seite: 'a' | 'b'; insel: number; aussen: number; innen: number; trottoir: number | null; laenge: number
    wartehalle?: 'insel' | 'hinten' | 'keine'
    perron?: boolean }   // Perron als Trottoirfläche zwischen zwei Strassen (Helvetiaplatz): die Strasse dahinter gehört nicht zum Abschnitt
  hsTypAngenommen?: { a?: boolean; b?: boolean }   // Haltestellentyp aus der AV vorbelegt (zu bestätigen)
  radwegSeparat?: { a: boolean; b: boolean }   // OSM: Radweg als eigener Weg neben der Strasse (cycleway:*=separate), Hinweis
  parallelWeg?: { a?: number; b?: number }     // OSM-Way des parallelen Wegs, der die Seite bildet (parallelwege.ts)
  oevGegen?: boolean      // Einbahn, Bus bzw. Tram auch in der Gegenrichtung (OSM oneway:bus/psv/tram=no; seit 21.10.2026)
  parkVersetzt?: 'a' | 'b'   // Parkierung abwechselnd A und B: diese Seite zählt im Querschnitt nicht (parkierungVersetzt)
  zweirad?: { a?: Zweiradfeld; b?: Zweiradfeld }   // Velo-/Motorradfelder je Seite (Bern, zweiradJeSeite): Platzbedarf in der Planung
  // Fahrspuren je Seite aus OSM (lanes, turn:lanes; seit 20.10.2026): je Spur der Pfeil, von links nach rechts in
  // Fahrtrichtung der Seite; auf der Einbahn nur a
  spuren?: { a: Markierung[]; b: Markierung[]; busA?: number; busB?: number }   // busA/B: Busspuren der Seite (OSM lanes:bus)
  mittelinsel?: Mittelinsel | null     // Mittelinsel aus der AV (mittelinsel, seit 20.10.2026); null = gesucht, keine
  // Mittelstreifen (lange Insel, breitenmessung.ts mittelstreifen, seit 21.10.2026): trennt die Fahrbahn von einem zweiten
  // Fahrbahnteil (Gegenfahrbahn, ÖV-Trassee); nur Hinweis, die Fahrbahn reicht bis zum Streifen
  mittelstreifen?: { seite: 'a' | 'b'; breite: number; laenge: number; dahinter: number } | null
}
let nextId = 1
// Neuer Abschnitt: datenartige Felder leer (DTV/Tempo/Führungsform/Breite/Routentyp),
// neutrale Auswahlfelder auf „nichts hier" (Parkierung egal, keine Haltestelle), beide Seiten gleich.
export function defaultSection(): Section {
  return {
    id: nextId++, dtv: NaN, dtvGeprueft: false, speed: NaN, ist: '', breite: NaN,
    routentyp: '', strassentyp: '', parkenRechts: 'egal', parkenSicherheitsstreifen: false, oevTakt: NaN,
    oevAngebot: 'keine', haltestellentyp: 'keine', haltestelleBreite: NaN, ohneHaltestelle: false,
    tram: false, fahrbahnbreite: NaN, richtung: 'beide',
    quelle: {},
  }
}

// Nur die Seiten-Felder (ohne Herkunft und Abschnittswerte).
function waehle(x: Seite): Seite {
  return {
    ist: x.ist, breite: x.breite, parkenRechts: x.parkenRechts, parkenSicherheitsstreifen: x.parkenSicherheitsstreifen,
    oevTakt: x.oevTakt, haltestellentyp: x.haltestellentyp, haltestelleBreite: x.haltestelleBreite,
    ohneHaltestelle: x.ohneHaltestelle,
  }
}
export const seiteA = (s: Section): Seite => waehle(s)
// Seite B, wie sie gilt: die abweichende Gegenseite oder (fehlt sie) Seite A.
export const seiteB = (s: Section): Seite => waehle(s.gegen ?? s)
// Herkunft von Form und Breite der Seite A (für eine Kopie als Gegenseite).
function quelleA(s: Section): SeitenQuelle {
  const q: SeitenQuelle = {}
  if (s.quelle.ist) q.ist = s.quelle.ist
  if (s.quelle.breite) q.breite = s.quelle.breite
  if (s.quelle.parkenRechts) q.parkenRechts = s.quelle.parkenRechts
  if (s.quelle.oevTakt) q.oevTakt = s.quelle.oevTakt
  return q
}
// Seite B als eigene Gegenseite (Kopie von A, wenn sie bisher «gleich wie A» war).
export const gegenVon = (s: Section): GegenSeite => s.gegen ?? { ...waehle(s), quelle: quelleA(s) }

const gleicheZahl = (a: number, b: number) => a === b || (Number.isNaN(a) && Number.isNaN(b))
export function seitenGleich(a: Seite, b: Seite): boolean {
  return a.ist === b.ist && gleicheZahl(a.breite, b.breite) && a.parkenRechts === b.parkenRechts &&
    a.parkenSicherheitsstreifen === b.parkenSicherheitsstreifen && gleicheZahl(a.oevTakt, b.oevTakt) &&
    a.haltestellentyp === b.haltestellentyp && gleicheZahl(a.haltestelleBreite, b.haltestelleBreite) &&
    a.ohneHaltestelle === b.ohneHaltestelle
}

// Die Seiten, die bewertet werden: A immer; B nur, wenn beide Seiten erfasst werden UND die
// Gegenseite abweicht (sonst trüge sie dieselbe Note).
export function bewerteteSeiten(s: Section): { seite: 'A' | 'B'; felder: Seite }[] {
  const a = { seite: 'A' as const, felder: seiteA(s) }
  return s.richtung === 'beide' && s.gegen ? [a, { seite: 'B' as const, felder: waehle(s.gegen) }] : [a]
}

// Seiten tauschen: B wird A und umgekehrt — samt Herkunft, Fahrtrichtung und Karten-Pfeil.
// So lässt sich bei «nur eine Seite» die Gegenrichtung bewerten.
export function tauscheSeiten(s: Section): Section {
  const neu: Section = { ...s, quelle: { ...s.quelle } }
  if (s.gegen) {
    const b = s.gegen
    Object.assign(neu, waehle(b))
    for (const k of ['ist', 'breite', 'parkenRechts', 'oevTakt'] as const) {
      if (b.quelle[k]) neu.quelle[k] = b.quelle[k]
      else delete neu.quelle[k]
    }
    neu.gegen = { ...waehle(s), quelle: quelleA(s) }
  }
  if (s.peilungA != null) neu.peilungA = (s.peilungA + 180) % 360
  if (s.luftbild) neu.luftbild = { a: s.luftbild.b, b: s.luftbild.a }
  // Die Aufteilung ist von links (Rand B) nach rechts (Rand A) geordnet: mit den Seiten spiegeln.
  if (s.aufteilung) neu.aufteilung = { ...s.aufteilung, teile: [...s.aufteilung.teile].reverse() }
  if (s.trottoir) {
    const { parkA, parkB, gruenA, gruenB, wegA, wegB } = s.trottoir
    neu.trottoir = { a: s.trottoir.b, b: s.trottoir.a, ...(parkB ? { parkA: true } : {}), ...(parkA ? { parkB: true } : {}),
      ...(gruenB != null ? { gruenA: gruenB } : {}), ...(gruenA != null ? { gruenB: gruenA } : {}),
      ...(wegB ? { wegA: true } : {}), ...(wegA ? { wegB: true } : {}) }
  }
  if (s.parkTiefe) neu.parkTiefe = { a: s.parkTiefe.b, b: s.parkTiefe.a }
  if (s.parkVersetzt) neu.parkVersetzt = s.parkVersetzt === 'a' ? 'b' : 'a'
  if (s.spuren) neu.spuren = { a: s.spuren.b, b: s.spuren.a, ...(s.spuren.busB ? { busA: s.spuren.busB } : {}), ...(s.spuren.busA ? { busB: s.spuren.busA } : {}) }
  if (s.radwegSeparat) neu.radwegSeparat = { a: s.radwegSeparat.b, b: s.radwegSeparat.a }
  if (s.parallelWeg) neu.parallelWeg = { ...(s.parallelWeg.b != null ? { a: s.parallelWeg.b } : {}), ...(s.parallelWeg.a != null ? { b: s.parallelWeg.a } : {}) }
  if (s.mittelstreifen) neu.mittelstreifen = { ...s.mittelstreifen, seite: s.mittelstreifen.seite === 'a' ? 'b' : 'a' }
  if (s.haltestelleninsel) neu.haltestelleninsel = { ...s.haltestelleninsel, seite: s.haltestelleninsel.seite === 'a' ? 'b' : 'a' }
  if (s.hsTypAngenommen) neu.hsTypAngenommen = { a: s.hsTypAngenommen.b, b: s.hsTypAngenommen.a }
  if (s.querschnittHeute) neu.querschnittHeute = { ...s.querschnittHeute, teile: [...s.querschnittHeute.teile].reverse() }
  if (s.candIds) {
    const gegen = new Set(s.candsGegenA ?? [])
    neu.candsGegenA = s.candIds.filter(id => !gegen.has(id))
  }
  return neu
}

// Bus-Frequenzband aus Fahrten/h (Abendspitze, pro Richtung): Headway ≥15 / 5–15 / <5 min.
export function busBand(perH: number): OevAngebot {
  if (perH <= 4) return 'bus_ab15'
  if (perH <= 12) return 'bus_5_15'
  return 'bus_unter5'
}
// ÖV-Angebot automatisch aus der Erkennung: Tram → „tram"; Bus mit Takt → Frequenzband.
// Ein Takt von 0 Fahrten/h ist kein Angebot (Haltestelle ohne Bus in der Abendspitze) —
// daraus wird kein Band abgeleitet, das Feld bleibt zur Wahl.
export function oevAngebotAuto(oev: OevInfo): OevAngebot | undefined {
  if (oev.oevHalt && oev.oevTram) return 'tram'
  if (oev.oevHalt && oev.oevBus && oev.busPerH != null && oev.busPerH > 0) return busBand(oev.busPerH)
  return undefined
}

type WaySeite = 'rechts' | 'links'

// Form und Breite EINER Fahrbahnseite des Kandidaten (Way-Seite w), mit Herkunft:
// Velostrasse (Geoportal) > Markierung > OSM. Bis zum 14.10.2026 galt das für den Abschnitt
// als Ganzes — ein Radstreifen auf einer Seite machte beide Seiten zum Radstreifen.
function seiteAusCand(c: Cand, w: WaySeite): { ist: IstFuehrungsform; breite: number; quelle: SeitenQuelle } {
  // Paralleler Weg als Veloführung dieser Seite (parallelwege.ts): Form und Breite aus dem Weg; ein Weg in beide
  // Richtungen gilt für beide Seiten
  const pw = c.parallel?.[w] ?? (c.parallel?.[w === 'rechts' ? 'links' : 'rechts']?.beide ? c.parallel?.[w === 'rechts' ? 'links' : 'rechts'] : undefined)
  if (pw) return { ist: pw.form, breite: pw.breite ?? NaN, quelle: { ist: 'osm', ...(pw.breite != null ? { breite: 'osm' as const } : {}) } }
  const osmIst = (c.seiten?.[w] ?? c.ist) as IstFuehrungsform
  const osmBr = c.breiteSeiten ? c.breiteSeiten[w] : c.breite
  const osm = (ist: IstFuehrungsform, q: Quelle): { ist: IstFuehrungsform; breite: number; quelle: SeitenQuelle } =>
    osmBr != null ? { ist, breite: osmBr, quelle: { ist: q, breite: 'osm' } } : { ist, breite: NaN, quelle: { ist: q } }
  if (c.bern?.velostrasse) return osm('Velostrasse', 'amtlich')
  const rs = c.bern?.radstreifen
  // Markierung dieser Seite. Hat die Erkennung keine Seite eindeutig gefunden (Striche wechseln
  // die Seite oder liegen auf der Achse), gilt die Markierung wie bisher für beide Seiten.
  const mark = rs && (rs.rechts || rs.links ? rs[w] : rs)
  // Ein OSM-Q7 (Einbahn mit Velogegenverkehr) ist die spezifischere Form und wird von der
  // Markierung NICHT zu „Radstreifen" übersteuert (Contraflow ≠ normaler Radstreifen).
  if (mark && !GEGENVERKEHR_FORMEN.includes(osmIst)) {
    // Breite aus der Markierung — nur, wenn die Markierung auch die Form stellt.
    if (mark.breite != null) return { ist: 'Radstreifen', breite: mark.breite, quelle: { ist: 'markierung', breite: 'markierung' } }
    return osm('Radstreifen', 'markierung')
  }
  // Striche nur auf der ANDEREN Seite: ein OSM-Radstreifen hier ist nicht markiert.
  if (rs && osmIst === 'Radstreifen') return { ist: 'Mischverkehr', breite: NaN, quelle: { ist: 'markierung' } }
  return osm(osmIst, 'osm')
}

// Fahrtrichtung [Grad] entlang einer Geometrie (Sehne Anfang → Ende), wahlweise rückwärts.
function peilungEntlang(geom: LL[], vorwaerts: boolean): number | undefined {
  if (geom.length < 2) return undefined
  const a = geom[0], b = geom[geom.length - 1]
  return vorwaerts ? peilung(a, b) : peilung(b, a)
}

// Kandidat → Abschnitt (Section) der Strecke. Je Feld Wert UND Herkunft setzen
// (Priorität amtlich > OSM > leer); nicht belegte Felder bleiben leer (keine Defaults).
// OSM bleibt Quelle für Geometrie, Name und – falls getaggt – Breite/Tempo/Ist-Führungsform.
//   gleich: läuft der Way in Richtung der Strecke? (candsToSections, ausrichtung) — dann ist
//   seine rechte Seite Seite A. Auf einer Einbahn ist Seite A immer die Fahrtrichtung, und es
//   wird nur sie erfasst (richtung 'eine'); die Gegenseite bleibt für «beide Seiten» vorbelegt.
export function candToSection(c: Cand, gleich = true): Section {
  const s = defaultSection()
  // Tempo: amtlich (V_sig) > OSM (maxspeed) > leer
  if (c.bern?.speed != null) { s.speed = c.bern.speed; s.quelle.speed = 'amtlich' }
  else if (c.speed != null) { s.speed = c.speed; s.quelle.speed = 'osm' }
  // DTV: nur amtlich (OSM kennt keinen DTV)
  if (c.bern?.dtv != null) { s.dtv = c.bern.dtv; s.quelle.dtv = 'amtlich' }
  s.dtvGeprueft = c.bern?.dtvGeprueft === true
  if (c.ohneFahrbahn) s.ohneFahrbahn = true
  // Führungsform und Breite je Seite (seiteAusCand). Seite A = die Way-Seite in Fahrtrichtung
  // der Strecke bzw. — auf einer Einbahn — in Fahrtrichtung des Verkehrs.
  const aWay: WaySeite = c.einbahn ? (c.einbahn === 'vor' ? 'rechts' : 'links') : (gleich ? 'rechts' : 'links')
  const bWay: WaySeite = aWay === 'rechts' ? 'links' : 'rechts'
  const a = seiteAusCand(c, aWay), b = seiteAusCand(c, bWay)
  s.ist = a.ist; s.breite = a.breite
  if (a.quelle.ist) s.quelle.ist = a.quelle.ist
  if (a.quelle.breite) s.quelle.breite = a.quelle.breite
  // Parkierung je Seite aus den amtlichen Parkfeldern (parkierung.ts): ab PARK_SCHWELLE «ja»,
  // sonst «nein» — nur wo die Stadt eine Quelle hat (sonst bleibt «egal»).
  const pk = c.bern?.parken
  const parkA = pk ? (pk[aWay] >= PARK_SCHWELLE ? 'ja' : 'nein') : undefined
  const parkB = pk ? (pk[bWay] >= PARK_SCHWELLE ? 'ja' : 'nein') : undefined
  if (pk) { s.parkenRechts = parkA!; s.quelle.parkenRechts = 'amtlich'; s.parkAnteil = { a: pk[aWay], b: pk[bWay] } }
  if (b.ist !== a.ist || !gleicheZahl(b.breite, a.breite) || parkA !== parkB)
    s.gegen = { ...waehle(s), ist: b.ist, breite: b.breite, ...(parkB ? { parkenRechts: parkB } : {}),
      quelle: { ...b.quelle, ...(pk ? { parkenRechts: 'amtlich' as const } : {}) } }
  if (c.einbahn) {
    s.richtung = 'eine'; s.quelle.richtung = 'osm'
    if (c.veloGegenverkehr) s.osmVeloGegenverkehr = true
    if (c.oevGegen) s.oevGegen = true
  }
  if (c.radwegSeparat) s.radwegSeparat = { a: c.radwegSeparat[aWay], b: c.radwegSeparat[bWay] }
  if (c.parallel) {
    const pa = c.parallel[aWay] ?? (c.parallel[bWay]?.beide ? c.parallel[bWay] : undefined)
    const pb = c.parallel[bWay] ?? (c.parallel[aWay]?.beide ? c.parallel[aWay] : undefined)
    s.parallelWeg = { ...(pa ? { a: pa.wayId } : {}), ...(pb ? { b: pb.wayId } : {}) }
  }
  if (c.spuren) {
    const sp = c.spuren, vorA = aWay === 'rechts'
    s.spuren = { a: vorA ? sp.vor : sp.rueck, b: vorA ? sp.rueck : sp.vor,
      ...((vorA ? sp.busVor : sp.busRueck) ? { busA: vorA ? sp.busVor : sp.busRueck } : {}),
      ...((vorA ? sp.busRueck : sp.busVor) ? { busB: vorA ? sp.busRueck : sp.busVor } : {}) }
  }
  s.peilungA = peilungEntlang(c.geom, aWay === 'rechts')
  s.candsGegenA = aWay === 'rechts' ? [] : [c.id]
  if (c.bern?.luftbild) s.luftbild = { a: c.bern.luftbild[aWay], b: c.bern.luftbild[bWay] }
  // Routentyp: nur amtlich
  if (c.bern?.routentyp) { s.routentyp = c.bern.routentyp; s.quelle.routentyp = 'amtlich' }
  // Strassentyp: nur amtlich (Basel, Dataset 100250)
  if (c.bern?.strassentyp) { s.strassentyp = c.bern.strassentyp; s.quelle.strassentyp = 'amtlich' }
  // ÖV (Geoportal + Fahrplan): Haltestelle/Modus übernehmen; Tram → ÖV-Angebot „tram",
  // Bus → Frequenzband aus dem Takt (GTFS). Haltestellentyp bleibt manuell.
  if (c.bern && (c.bern.oevHalt || c.bern.oevTram || c.bern.oevBus)) {
    s.oev = { oevHalt: !!c.bern.oevHalt, oevHaltName: c.bern.oevHaltName,
              oevTram: !!c.bern.oevTram, oevBus: !!c.bern.oevBus, busPerH: c.bern.busPerH,
              ...(c.bern.streckePerH ? { streckePerH: c.bern.streckePerH, streckeHalt: c.bern.streckeHalt } : {}) }
    // Bus-Takt der Umweltspur aus dem Fahrplan (seit 21.10.2026): Takt [Min] = 60 / Fahrten pro Stunde (Abendspitze,
    // stärkste Richtung), auf halbe Minuten; Chip «Fahrplan», von Hand änderbar
    const perH = c.bern.streckePerH ?? c.bern.busPerH
    if (perH && perH > 0) {
      const taktMin = Math.round(60 / perH * 2) / 2
      if (s.ist === 'Umweltspur') { s.oevTakt = taktMin; s.quelle.oevTakt = 'fahrplan' }
      if (s.gegen?.ist === 'Umweltspur') s.gegen = { ...s.gegen, oevTakt: taktMin, quelle: { ...s.gegen.quelle, oevTakt: 'fahrplan' } }
    }
    const auto = oevAngebotAuto(s.oev)
    // Herkunft der ÖV-Erkennung: Bern = amtlich (Geoportal), Zürich = OSM.
    // Bern setzt kein oevQuelle → Standard 'amtlich' (verhaltensidentisch wie bisher).
    const oevQ: Quelle = c.bern.oevQuelle ?? 'amtlich'
    // Tram = oevQ; Bus-Band stammt (nur bei Bern) aus dem Fahrplan (opentransportdata).
    if (auto) { s.oevAngebot = auto; s.quelle.oevAngebot = auto === 'tram' ? oevQ : 'fahrplan' }
    // Tram in der Fahrbahn — entkoppelt von der Haltestelle.
    s.tram = !!c.bern.oevTram; s.quelle.tram = oevQ
  }
  s.label = `${c.name} · ${Math.round(c.len)} m · OSM way ${c.wayId}` +
    (c.teil ? ` · Teil ${c.teil.nr}/${c.teil.anzahl}` : '')
  s.candIds = [c.id]
  if (c.obs) s.obs = c.obs   // OpenBikeSensor-Überholabstände (Zusatzinfo)
  return s
}

// Segment mit Geometrie-Kennwerten (für Ordnen + Zusammenfassen).
//   wayId/teil: Teile eines von Hand geteilten Ways (Cand.teil) — der Schnitt bleibt eine Grenze.
//   geom/gleich/achsGleich: Fahrtrichtungen (fehlen sie, gilt «läuft mit der Strecke»).
export interface Seg {
  sec: Section; id: number; len: number; mid: LL; name: string
  wayId?: number; teil?: boolean
  geom?: LL[]          // Geometrie in Way-Richtung
  gleich?: boolean     // der Way läuft in Richtung der Strecke (ausrichtung)
  achsGleich?: boolean // Seite A läuft in Richtung der Strecke (nein nur auf einer Einbahn dagegen)
}

function centroid(geom: LL[]): LL {
  const n = geom.length
  return { lat: geom.reduce((s, p) => s + p.lat, 0) / n, lon: geom.reduce((s, p) => s + p.lon, 0) / n }
}

// Laufrichtung der GEORDNETEN Segmente: true = der Way läuft in Richtung der Strecke.
// Das erste Segment so, dass sein Ende dem zweiten am nächsten liegt; jedes weitere so, dass
// sein Anfang am Ende des vorigen liegt. Eine Kette statt der Hauptachse, damit auch auf
// kurvigen Strecken (Kehren) jedes Stück richtig herum liegt.
export function ausrichtung(geoms: LL[][]): boolean[] {
  const KY = 111320
  const d = (p: LL, q: LL) => {
    const kx = KY * Math.cos((p.lat * Math.PI) / 180)
    return Math.hypot((p.lon - q.lon) * kx, (p.lat - q.lat) * KY)
  }
  const out: boolean[] = []
  geoms.forEach((g, i) => {
    const anf = g[0], end = g[g.length - 1]
    if (i === 0) {
      const n = geoms[1]
      if (!n) { out.push(true); return }
      const enden = [n[0], n[n.length - 1]]
      out.push(Math.min(...enden.map(p => d(end, p))) <= Math.min(...enden.map(p => d(anf, p))))
      return
    }
    const v = geoms[i - 1], vEnde = out[i - 1] ? v[v.length - 1] : v[0]
    out.push(d(anf, vEnde) <= d(end, vEnde))
  })
  return out
}

// (a) Segmente entlang der Strasse ordnen: Mittelpunkte auf die Hauptachse projizieren
// (Achse = Verbindung der beiden am weitesten entfernten Mittelpunkte) und danach sortieren.
export function orderAlongAxis<T extends { mid: LL }>(segs: T[]): T[] {
  if (segs.length < 3) return segs
  const mLat = segs.reduce((s, x) => s + x.mid.lat, 0) / segs.length
  const kx = 111320 * Math.cos((mLat * Math.PI) / 180), ky = 111320
  const xy = segs.map(s => ({ x: s.mid.lon * kx, y: s.mid.lat * ky }))
  let a = 0, b = 0, best = -1
  for (let i = 0; i < xy.length; i++) for (let j = i + 1; j < xy.length; j++) {
    const d = (xy[i].x - xy[j].x) ** 2 + (xy[i].y - xy[j].y) ** 2
    if (d > best) { best = d; a = i; b = j }
  }
  let ax = xy[b].x - xy[a].x, ay = xy[b].y - xy[a].y
  const L = Math.hypot(ax, ay) || 1; ax /= L; ay /= L
  const proj = (i: number) => (xy[i].x - xy[a].x) * ax + (xy[i].y - xy[a].y) * ay
  return segs.map((s, i) => ({ s, p: proj(i) })).sort((u, v) => u.p - v.p).map(o => o.s)
}

// Soll-Führungsform eines Segments — oder undefined, wo sie sich (noch) nicht bestimmen lässt
// oder keine Rolle spielt. «Unbestimmt» trennt nicht: ein Segment ohne DTV wird nicht deshalb
// zum eigenen Abschnitt, weil sein Nachbar einen hat.
export function sollVon(sec: Section, city: Stadt): Fuehrungsart | undefined {
  if (sec.ist === '' || !brauchtDtvTempo(sec.ist)) return undefined   // Umweltspur/Fussweg: ohne Soll
  if (!Number.isFinite(sec.speed)) return undefined
  const routeWirkt = city === 'zurich' || city === 'basel'   // dort hängt das Soll am Routentyp
  if (routeWirkt && sec.routentyp === '') return undefined
  if (city === 'basel') {
    if (sec.strassentyp === '') return undefined
    return fuehrungsart(NaN, sec.speed, city, sec.routentyp || 'Velohauptroute', sec.strassentyp)
  }
  const dtv = dtvEff(sec, city)
  if (!Number.isFinite(dtv)) return undefined
  return fuehrungsart(dtv, sec.speed, city, sec.routentyp || 'Velohauptroute')
}

const MIN_LEN = 25   // Stummel: kürzere Segmente bilden keinen eigenen Abschnitt
// Ein Stummel ist ein kurzes OSM-Segment. Ein von Hand geteiltes Stück ist nie einer — es ist
// so kurz, weil der Nutzer dort schneiden wollte, und darf nicht im Nachbarn aufgehen.
const istStummel = (x: Seg) => x.len < MIN_LEN && !x.teil
// Liegt ein Schnitt zwischen `seg` und der Gruppe? (ein anderes Teil desselben Ways ist schon drin)
const schnittZu = (seg: Seg, gruppe: Seg[]) =>
  !!seg.teil && gruppe.some(x => x.teil && x.wayId === seg.wayId)

// (b) Benachbarte Segmente zusammenfassen. Zusammen bleibt, was gleich BEWERTET wird:
//   • gleiche Ist-Führungsform und gleiches Tempo (wie bisher),
//   • gleicher Routentyp und gleiche Soll-Führungsform (seit 29.09.2026) — unbestimmte
//     Werte trennen nicht.
// Kurze Stummel (< 25 m) gehen im Nachbarn auf. Repräsentant einer Gruppe = das längste
// Segment (damit ein Stummel die Klasse nicht überschreibt).
// Ein von Hand gesetzter Schnitt (Segment teilen) trennt immer — vor allen anderen Regeln, und
// das geteilte Stück gilt nie als Stummel (seit 14.10.2026).
//
// Vorher entschieden allein Form und Tempo. DTV, Routentyp und Breite übernahm die Gruppe
// vom längsten Segment: Wechselte eine Strasse unterwegs von DTV 4'000 auf 12'000 oder von
// Veloroute auf Velohauptroute, verschwand das im Abschnitt — und mit ihm die strengere
// Soll-Führungsform. Die Strecken-Note ist die des schlechtesten Abschnitts; sie kann nur
// stimmen, wenn der schlechteste Abschnitt auch als eigener Abschnitt existiert.
export function mergeSegs(ordered: Seg[], city: Stadt = 'bern'): Section[] {
  const longest = (g: Seg[]) => g.reduce((a, b) => (b.len > a.len ? b : a))
  interface Gruppe { segs: Seg[]; routentyp: Routentyp | ''; soll?: Fuehrungsart }
  const neu = (seg: Seg): Gruppe => ({ segs: [seg], routentyp: seg.sec.routentyp, soll: sollVon(seg.sec, city) })
  const groups: Gruppe[] = []
  for (const seg of ordered) {
    const g = groups[groups.length - 1]
    if (!g || schnittZu(seg, g.segs)) { groups.push(neu(seg)); continue }
    if (istStummel(seg)) { g.segs.push(seg); continue }   // Stummel: geht auf, prägt die Gruppe nicht
    const rep = longest(g.segs)
    // Tempo NaN-sicher vergleichen (leeres Tempo === leeres Tempo gilt als gleich).
    const speedEq = rep.sec.speed === seg.sec.speed ||
      (Number.isNaN(rep.sec.speed) && Number.isNaN(seg.sec.speed))
    const rt = seg.sec.routentyp, soll = sollVon(seg.sec, city)
    const routeEq = rt === '' || g.routentyp === '' || rt === g.routentyp
    const sollEq = soll == null || g.soll == null || soll === g.soll
    // Eine Gruppe, die bisher nur aus Stummeln besteht, hat noch keine Klasse → nimmt jedes Segment auf.
    // Seiten (seit 14.10.2026): gleiche Erfassung (beide/eine), Seite A in derselben Richtung
    // und — wo beide Seiten zählen — dieselbe Form auf Seite B.
    const seitenEq = rep.sec.richtung === seg.sec.richtung &&
      (rep.achsGleich !== false) === (seg.achsGleich !== false) &&
      (seg.sec.richtung === 'eine' || seiteB(rep.sec).ist === seiteB(seg.sec).ist)
    const nurStummel = g.segs.every(istStummel)
    if (nurStummel || (rep.sec.ist === seg.sec.ist && speedEq && routeEq && sollEq && seitenEq)) {
      g.segs.push(seg)
      if (nurStummel) { g.routentyp = rt; g.soll = soll }
      else { if (g.routentyp === '') g.routentyp = rt; if (g.soll == null) g.soll = soll }
    } else groups.push(neu(seg))
  }
  return groups.map(({ segs: g }) => {
    const rep = longest(g)
    const total = g.reduce((s, x) => s + x.len, 0)
    if (g.length > 1) rep.sec.label = `${rep.name} · ${Math.round(total)} m · ${g.length} OSM-Segmente`
    rep.sec.candIds = g.map(seg => seg.id)   // alle Segment-IDs des Abschnitts (für die Karte)
    rep.sec.obs = mergeObs(g.map(seg => seg.sec.obs))   // OBS-Überholabstände des Abschnitts

    // Felder, die dem Repräsentanten fehlen, vom längsten Segment der Gruppe nehmen, das sie
    // kennt (Stummel nur, wenn es nichts anderes gibt) — samt Herkunft. So hängt es nicht mehr
    // an der Segmentlänge, ob der DTV einer Zählstelle im Abschnitt ankommt.
    const spender = g.filter(x => x !== rep && !istStummel(x)).sort((a, b) => b.len - a.len)
      .concat(g.filter(x => x !== rep && istStummel(x)))
    if (!Number.isFinite(rep.sec.dtv)) {
      const s = spender.find(x => Number.isFinite(x.sec.dtv))
      if (s) { rep.sec.dtv = s.sec.dtv; rep.sec.quelle.dtv = s.sec.quelle.dtv }
    }
    if (rep.sec.routentyp === '') {
      const s = spender.find(x => x.sec.routentyp !== '')
      if (s) { rep.sec.routentyp = s.sec.routentyp; rep.sec.quelle.routentyp = s.sec.quelle.routentyp }
    }
    if (rep.sec.strassentyp === '') {
      const s = spender.find(x => x.sec.strassentyp !== '')
      if (s) { rep.sec.strassentyp = s.sec.strassentyp; rep.sec.quelle.strassentyp = s.sec.quelle.strassentyp }
    }
    // Bus-Takt der Umweltspur (Fahrplan): vom längsten Segment, das ihn kennt
    if (rep.sec.ist === 'Umweltspur' && !Number.isFinite(rep.sec.oevTakt)) {
      const s = spender.find(x => x.sec.ist === 'Umweltspur' && Number.isFinite(x.sec.oevTakt))
      if (s) { rep.sec.oevTakt = s.sec.oevTakt; rep.sec.quelle.oevTakt = s.sec.quelle.oevTakt }
    }
    if (rep.sec.richtung === 'beide' && seiteB(rep.sec).ist === 'Umweltspur' && !Number.isFinite(seiteB(rep.sec).oevTakt)) {
      const s = spender.find(x => seiteB(x.sec).ist === 'Umweltspur' && Number.isFinite(seiteB(x.sec).oevTakt))
      if (s) { const g0 = gegenVon(rep.sec); rep.sec.gegen = { ...g0, oevTakt: seiteB(s.sec).oevTakt, quelle: { ...g0.quelle, oevTakt: gegenVon(s.sec).quelle.oevTakt } } }
    }
    if (!rep.sec.spuren) {
      const s = spender.find(x => x.sec.spuren)
      if (s) rep.sec.spuren = s.sec.spuren
    }
    // «Kein Eintrag ⇒ ≤ 2000» gilt für den Abschnitt nur, wenn JEDES seiner Segmente geprüft ist.
    rep.sec.dtvGeprueft = g.every(x => x.sec.dtvGeprueft)
    // Breite: die SCHMALSTE bekannte Stelle gleicher Führungsform (Stummel ausgenommen) — der
    // Abschnitt ist so gut wie seine engste Stelle, nicht wie sein längstes Segment.
    const engste = g.filter(x => (x === rep || !istStummel(x)) && x.sec.ist === rep.sec.ist && Number.isFinite(x.sec.breite))
      .reduce<Seg | undefined>((m, x) => (!m || x.sec.breite < m.sec.breite ? x : m), undefined)
    if (engste && engste !== rep) { rep.sec.breite = engste.sec.breite; rep.sec.quelle.breite = engste.sec.quelle.breite }
    // Dasselbe für Seite B, wenn beide Seiten erfasst werden.
    if (rep.sec.richtung === 'beide') {
      const repB = seiteB(rep.sec)
      const engsteB = g.filter(x => (x === rep || !istStummel(x)) && seiteB(x.sec).ist === repB.ist && Number.isFinite(seiteB(x.sec).breite))
        .reduce<Seg | undefined>((m, x) => (!m || seiteB(x.sec).breite < seiteB(m.sec).breite ? x : m), undefined)
      if (engsteB && seiteB(engsteB.sec).breite !== repB.breite) {
        const g0 = gegenVon(rep.sec), qb = gegenVon(engsteB.sec).quelle.breite
        rep.sec.gegen = { ...g0, breite: seiteB(engsteB.sec).breite, quelle: { ...g0.quelle, ...(qb ? { breite: qb } : {}) } }
      }
    }
    // Parkierung je Seite über den Abschnitt: Anteil nach Länge gewichtet, dieselbe Schwelle.
    const pa = g.filter(x => x.sec.parkAnteil)
    const paLen = pa.reduce((m, x) => m + x.len, 0)
    if (pa.length && paLen > 0) {
      const a = pa.reduce((m, x) => m + x.len * x.sec.parkAnteil!.a, 0) / paLen
      const b = pa.reduce((m, x) => m + x.len * x.sec.parkAnteil!.b, 0) / paLen
      rep.sec.parkAnteil = { a, b }
      rep.sec.parkenRechts = a >= PARK_SCHWELLE ? 'ja' : 'nein'; rep.sec.quelle.parkenRechts = 'amtlich'
      const parkB = b >= PARK_SCHWELLE ? 'ja' : 'nein'
      if (rep.sec.richtung === 'beide' && seiteB(rep.sec).parkenRechts !== parkB) {
        const g0 = gegenVon(rep.sec)
        rep.sec.gegen = { ...g0, parkenRechts: parkB, quelle: { ...g0.quelle, parkenRechts: 'amtlich' } }
      }
    }
    // Gegenseite, die nach dem Zusammenführen Seite A gleicht → «gleich wie Seite A».
    if (rep.sec.gegen && seitenGleich(seiteA(rep.sec), rep.sec.gegen)) delete rep.sec.gegen
    if (g.some(x => x.sec.osmVeloGegenverkehr)) rep.sec.osmVeloGegenverkehr = true
    // Luftbild: Anteil je Seite über den Abschnitt, nach Länge gewichtet (nur Segmente mit Auswertung).
    const lb = g.filter(x => x.sec.luftbild)
    const lbLen = lb.reduce((m, x) => m + x.len, 0)
    if (lb.length && lbLen > 0) rep.sec.luftbild = {
      a: lb.reduce((m, x) => m + x.len * x.sec.luftbild!.a, 0) / lbLen,
      b: lb.reduce((m, x) => m + x.len * x.sec.luftbild!.b, 0) / lbLen,
    }
    richtungSetzen(rep.sec, g, rep.achsGleich !== false)

    // ÖV über die Segmente bündeln: Haltestelle/Modus, falls in einem Segment erkannt.
    const oevs = g.map(seg => seg.sec.oev).filter((o): o is OevInfo => !!o)
    if (oevs.length) {
      const withName = oevs.find(o => o.oevHalt && o.oevHaltName)
      // busPerH = stärkste Richtung über die Segmente (MAX, nie Summe → keine Verdopplung).
      const busPerH = oevs.reduce<number | undefined>(
        (m, o) => (o.busPerH != null && (m == null || o.busPerH > m) ? o.busPerH : m), undefined)
      rep.sec.oev = {
        oevHalt: oevs.some(o => o.oevHalt), oevHaltName: withName?.oevHaltName,
        oevTram: oevs.some(o => o.oevTram), oevBus: oevs.some(o => o.oevBus), busPerH,
      }
      const auto = oevAngebotAuto(rep.sec.oev)
      // Herkunft nicht hartkodieren: candToSection hat sie stadtkorrekt gesetzt (Bern = amtlich/
      // fahrplan, ZH/BS/LU = osm) — vom erkannten Segment der Gruppe übernehmen.
      const oevQ = g.find(seg => seg.sec.oev)?.sec.quelle.tram ?? 'amtlich'
      if (auto) { rep.sec.oevAngebot = auto; rep.sec.quelle.oevAngebot = auto === 'tram' ? oevQ : 'fahrplan' }
      rep.sec.tram = rep.sec.oev.oevTram; rep.sec.quelle.tram = oevQ
    }
    return rep.sec
  })
}

// ── Breite am Luftbild gemessen (breitenmessung.ts) ───────────────────────────
// Der Messwert ist die Breite der Seite an der gemessenen Stelle (Nutzerentscheid 15.10.2026),
// Herkunft «gemessen». Seite B nur, wenn sie eigene Werte hat; bei gleichen Seiten gilt Seite A
// für beide.
export function setzeGemesseneBreite(s: Section, seite: 'A' | 'B', breite: number): Section {
  if (seite === 'A') return { ...s, breite, quelle: { ...s.quelle, breite: 'gemessen' } }
  const g = gegenVon(s)
  return { ...s, gegen: { ...g, breite, quelle: { ...g.quelle, breite: 'gemessen' } } }
}

// ── Radstreifen aus dem Luftbild: Hinweis und Übernehmen (luftbild.ts) ────────
// Ein Hinweis erscheint für eine Seite, deren Form noch offen oder Mischverkehr ist und auf der
// das Luftbild auf mindestens LUFTBILD_SCHWELLE der Länge einen Radstreifen zeigt. Seite B nur,
// wenn beide Seiten erfasst werden. Andere Formen (z. B. Umweltspur, die das Modell meist als
// Radstreifen sieht) bekommen keinen Hinweis.
export function luftbildHinweis(s: Section, schwelle: number): { a: boolean; b: boolean } {
  const offen = (ist: IstFuehrungsform | '') => ist === '' || ist === 'Mischverkehr'
  if (!s.luftbild) return { a: false, b: false }
  return {
    a: s.luftbild.a >= schwelle && offen(s.ist),
    b: s.richtung === 'beide' && s.luftbild.b >= schwelle && offen(seiteB(s).ist),
  }
}

// Den Hinweis übernehmen: die genannten Seiten werden Radstreifen, Herkunft «luftbild». Gilt er
// nur für eine von zwei gleichen Seiten, werden die Seiten dabei «verschieden» (die andere behält
// ihre Form). Die Breite bleibt, wie sie ist — das Luftbild liefert keine.
export function luftbildUebernehmen(s: Section, welche: { a: boolean; b: boolean }): Section {
  const neu: Section = { ...s, quelle: { ...s.quelle } }
  const beideGleich = s.richtung === 'beide' && !s.gegen
  if (beideGleich && welche.a !== welche.b) neu.gegen = gegenVon(s)
  if (welche.a) { neu.ist = 'Radstreifen'; neu.quelle.ist = 'luftbild' }
  if (welche.b && neu.gegen)
    neu.gegen = { ...neu.gegen, ist: 'Radstreifen', quelle: { ...neu.gegen.quelle, ist: 'luftbild' } }
  return neu
}

// Fahrtrichtung der Seite A über den ganzen Abschnitt: Sehne vom Anfang des ersten zum Ende
// des letzten Segments (in Richtung der Strecke gelesen), auf einer Einbahn gegen die Strecke
// umgedreht. Dazu, welche Segmente gegen Seite A laufen (Karten-Pfeil, App.tsx).
function richtungSetzen(sec: Section, g: Seg[], achsGleich: boolean) {
  const geo = g.filter(x => x.geom && x.geom.length >= 2)
  if (!geo.length) return
  const anfang = (x: Seg) => (x.gleich !== false ? x.geom![0] : x.geom![x.geom!.length - 1])
  const ende = (x: Seg) => (x.gleich !== false ? x.geom![x.geom!.length - 1] : x.geom![0])
  const p = peilung(anfang(geo[0]), ende(geo[geo.length - 1]))
  sec.peilungA = achsGleich ? p : (p + 180) % 360
  sec.candsGegenA = geo.filter(x => (x.gleich !== false) !== achsGleich).map(x => x.id)
}

// Gewählte Kandidaten → geordnete, zusammengefasste Abschnitte:
// (a) ordnen, Laufrichtung je Segment bestimmen, dann (b) zusammenfassen.
export function candsToSections(cands: Cand[], city: Stadt = 'bern'): Section[] {
  const geordnet = orderAlongAxis(cands.filter(c => c.selected).map(c => ({ c, mid: centroid(c.geom) })))
  const gleich = ausrichtung(geordnet.map(x => x.c.geom))
  const segs: Seg[] = geordnet.map(({ c, mid }, i) => ({
    sec: candToSection(c, gleich[i]), id: c.id, len: c.len, mid, name: c.name,
    wayId: c.wayId, teil: !!c.teil, geom: c.geom, gleich: gleich[i],
    // Seite A = Fahrtrichtung des Verkehrs: auf einer Einbahn gegen die Strecke läuft sie gegen sie.
    achsGleich: !c.einbahn || (c.einbahn === 'vor') === gleich[i],
  }))
  return mergeSegs(segs, city)
}
