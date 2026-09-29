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
import { mergeObs, type ObsStats } from './obs'

// ── Abschnitt: Eingabezustand ────────────────────────────────────────────────
// Herkunft eines Feldwerts: amtlich (Geodaten Stadt Bern) > OSM > manuell.
// Fehlt ein Eintrag, ist das Feld leer (keine erfundenen Werte).
export type Quelle = 'amtlich' | 'osm' | 'manuell' | 'fahrplan' | 'markierung' | 'angenommen'

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
export type QuelleFeld = 'dtv' | 'speed' | 'ist' | 'breite' | 'routentyp' | 'oevAngebot' | 'tram' | 'strassentyp'

export interface Section {
  id: number
  dtv: number                  // NaN = leer
  dtvGeprueft: boolean         // nur Bern: Verkehrsdaten-Layer wurde für diesen Abschnitt erfolgreich abgefragt
  speed: number                // NaN = leer
  ist: IstFuehrungsform | ''   // '' = noch nicht gewählt
  breite: number               // NaN = leer
  routentyp: Routentyp | ''    // '' = noch nicht gewählt
  strassentyp: Strassentyp | ''  // '' = noch nicht gewählt (nur Basel relevant)
  parkenRechts: ParkenRechts
  parkenSicherheitsstreifen: boolean  // Sicherheitsstreifen ggü. Parkplätzen (SN 640 060), nur bei Parkierung=ja
  oevTakt: number
  oevAngebot: OevAngebot
  haltestellentyp: Haltestellentyp
  haltestelleBreite: number    // NaN = leer
  tram: boolean                // Tram (Schienen) in der Fahrbahn — entkoppelt von der Haltestelle
  label?: string               // Herkunft/Beschriftung (z. B. aus OSM geladen)
  quelle: Partial<Record<QuelleFeld, Quelle>>   // gesetzt je Feld, sobald ein Wert vorliegt
  candIds?: number[]           // OSM-Way-IDs der Segmente dieses Abschnitts (für die Karten-Zuordnung)
  obs?: ObsStats               // OpenBikeSensor-Überholabstände (Zusatzinfo, nicht in der Note)
  oev?: OevInfo                // ÖV-Erkennung (Geoportal): Haltestelle/Modus im Abschnitt
}
let nextId = 1
// Neuer Abschnitt: datenartige Felder leer (DTV/Tempo/Führungsform/Breite/Routentyp),
// neutrale Auswahlfelder auf „nichts hier" (Parkierung egal, keine Haltestelle).
export function defaultSection(): Section {
  return {
    id: nextId++, dtv: NaN, dtvGeprueft: false, speed: NaN, ist: '', breite: NaN,
    routentyp: '', strassentyp: '', parkenRechts: 'egal', parkenSicherheitsstreifen: false, oevTakt: NaN,
    oevAngebot: 'keine', haltestellentyp: 'keine', haltestelleBreite: NaN,
    tram: false,
    quelle: {},
  }
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

// Kandidat → Abschnitt (Section) der Strecke. Je Feld Wert UND Herkunft setzen
// (Priorität amtlich > OSM > leer); nicht belegte Felder bleiben leer (keine Defaults).
// OSM bleibt Quelle für Geometrie, Name und – falls getaggt – Breite/Tempo/Ist-Führungsform.
export function candToSection(c: Cand): Section {
  const s = defaultSection()
  // Tempo: amtlich (V_sig) > OSM (maxspeed) > leer
  if (c.bern?.speed != null) { s.speed = c.bern.speed; s.quelle.speed = 'amtlich' }
  else if (c.speed != null) { s.speed = c.speed; s.quelle.speed = 'osm' }
  // DTV: nur amtlich (OSM kennt keinen DTV)
  if (c.bern?.dtv != null) { s.dtv = c.bern.dtv; s.quelle.dtv = 'amtlich' }
  s.dtvGeprueft = c.bern?.dtvGeprueft === true
  // Führungsform: Velostrasse (Geoportal) > Radstreifen (Markierung) > OSM-Ableitung.
  // Ausnahme: ein OSM-Q7 (Einbahn mit Velogegenverkehr) ist die spezifischere Form und wird von der
  // Markierung NICHT zu „Radstreifen" übersteuert (Contraflow ≠ normaler Radstreifen).
  const markierungWins = !!c.bern?.radstreifen && !GEGENVERKEHR_FORMEN.includes(c.ist as IstFuehrungsform)
  if (c.bern?.velostrasse) { s.ist = 'Velostrasse'; s.quelle.ist = 'amtlich' }
  else if (markierungWins) { s.ist = 'Radstreifen'; s.quelle.ist = 'markierung' }
  else { s.ist = c.ist as IstFuehrungsform; s.quelle.ist = 'osm' }
  // Breite: Markierung (gemessener Velostreifen) > OSM (wenn getaggt) — Markierung nur, wenn sie auch die Form stellt.
  if (markierungWins && c.bern?.radstreifen?.breite != null) { s.breite = c.bern.radstreifen.breite; s.quelle.breite = 'markierung' }
  else if (c.breite != null) { s.breite = c.breite; s.quelle.breite = 'osm' }
  // Routentyp: nur amtlich
  if (c.bern?.routentyp) { s.routentyp = c.bern.routentyp; s.quelle.routentyp = 'amtlich' }
  // Strassentyp: nur amtlich (Basel, Dataset 100250)
  if (c.bern?.strassentyp) { s.strassentyp = c.bern.strassentyp; s.quelle.strassentyp = 'amtlich' }
  // ÖV (Geoportal + Fahrplan): Haltestelle/Modus übernehmen; Tram → ÖV-Angebot „tram",
  // Bus → Frequenzband aus dem Takt (GTFS). Haltestellentyp bleibt manuell.
  if (c.bern && (c.bern.oevHalt || c.bern.oevTram || c.bern.oevBus)) {
    s.oev = { oevHalt: !!c.bern.oevHalt, oevHaltName: c.bern.oevHaltName,
              oevTram: !!c.bern.oevTram, oevBus: !!c.bern.oevBus, busPerH: c.bern.busPerH }
    const auto = oevAngebotAuto(s.oev)
    // Herkunft der ÖV-Erkennung: Bern = amtlich (Geoportal), Zürich = OSM.
    // Bern setzt kein oevQuelle → Standard 'amtlich' (verhaltensidentisch wie bisher).
    const oevQ: Quelle = c.bern.oevQuelle ?? 'amtlich'
    // Tram = oevQ; Bus-Band stammt (nur bei Bern) aus dem Fahrplan (opentransportdata).
    if (auto) { s.oevAngebot = auto; s.quelle.oevAngebot = auto === 'tram' ? oevQ : 'fahrplan' }
    // Tram in der Fahrbahn — entkoppelt von der Haltestelle.
    s.tram = !!c.bern.oevTram; s.quelle.tram = oevQ
  }
  s.label = `${c.name} · ${Math.round(c.len)} m · OSM way ${c.id}`
  s.candIds = [c.id]
  if (c.obs) s.obs = c.obs   // OpenBikeSensor-Überholabstände (Zusatzinfo)
  return s
}

// Segment mit Geometrie-Kennwerten (für Ordnen + Zusammenfassen).
export interface Seg { sec: Section; id: number; len: number; mid: { lat: number; lon: number }; name: string }

function centroid(geom: { lat: number; lon: number }[]): { lat: number; lon: number } {
  const n = geom.length
  return { lat: geom.reduce((s, p) => s + p.lat, 0) / n, lon: geom.reduce((s, p) => s + p.lon, 0) / n }
}

// (a) Segmente entlang der Strasse ordnen: Mittelpunkte auf die Hauptachse projizieren
// (Achse = Verbindung der beiden am weitesten entfernten Mittelpunkte) und danach sortieren.
export function orderAlongAxis(segs: Seg[]): Seg[] {
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

// (b) Benachbarte Segmente zusammenfassen. Zusammen bleibt, was gleich BEWERTET wird:
//   • gleiche Ist-Führungsform und gleiches Tempo (wie bisher),
//   • gleicher Routentyp und gleiche Soll-Führungsform (seit 29.09.2026) — unbestimmte
//     Werte trennen nicht.
// Kurze Stummel (< 25 m) gehen im Nachbarn auf. Repräsentant einer Gruppe = das längste
// Segment (damit ein Stummel die Klasse nicht überschreibt).
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
    if (!g) { groups.push(neu(seg)); continue }
    if (seg.len < MIN_LEN) { g.segs.push(seg); continue }   // Stummel: geht auf, prägt die Gruppe nicht
    const rep = longest(g.segs)
    // Tempo NaN-sicher vergleichen (leeres Tempo === leeres Tempo gilt als gleich).
    const speedEq = rep.sec.speed === seg.sec.speed ||
      (Number.isNaN(rep.sec.speed) && Number.isNaN(seg.sec.speed))
    const rt = seg.sec.routentyp, soll = sollVon(seg.sec, city)
    const routeEq = rt === '' || g.routentyp === '' || rt === g.routentyp
    const sollEq = soll == null || g.soll == null || soll === g.soll
    // Eine Gruppe, die bisher nur aus Stummeln besteht, hat noch keine Klasse → nimmt jedes Segment auf.
    const nurStummel = g.segs.every(x => x.len < MIN_LEN)
    if (nurStummel || (rep.sec.ist === seg.sec.ist && speedEq && routeEq && sollEq)) {
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
    const spender = g.filter(x => x !== rep && x.len >= MIN_LEN).sort((a, b) => b.len - a.len)
      .concat(g.filter(x => x !== rep && x.len < MIN_LEN))
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
    // «Kein Eintrag ⇒ ≤ 2000» gilt für den Abschnitt nur, wenn JEDES seiner Segmente geprüft ist.
    rep.sec.dtvGeprueft = g.every(x => x.sec.dtvGeprueft)
    // Breite: die SCHMALSTE bekannte Stelle gleicher Führungsform (Stummel ausgenommen) — der
    // Abschnitt ist so gut wie seine engste Stelle, nicht wie sein längstes Segment.
    const engste = g.filter(x => (x === rep || x.len >= MIN_LEN) && x.sec.ist === rep.sec.ist && Number.isFinite(x.sec.breite))
      .reduce<Seg | undefined>((m, x) => (!m || x.sec.breite < m.sec.breite ? x : m), undefined)
    if (engste && engste !== rep) { rep.sec.breite = engste.sec.breite; rep.sec.quelle.breite = engste.sec.quelle.breite }

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

// Gewählte Kandidaten → geordnete, zusammengefasste Abschnitte.
export function candsToSections(cands: Cand[], city: Stadt = 'bern'): Section[] {
  const segs: Seg[] = cands.filter(c => c.selected).map(c =>
    ({ sec: candToSection(c), id: c.id, len: c.len, mid: centroid(c.geom), name: c.name }))
  return mergeSegs(orderAlongAxis(segs), city)            // (a) ordnen, dann (b) zusammenfassen
}
