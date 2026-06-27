import { useEffect, useRef, useState } from 'react'
import {
  fuehrungsart, fuehrungsformNote, haltestellenLoesung, HALTESTELLE_MIT_BREITE, PARKEN_RELEVANT,
  erfuellungsgrad,
  type Fuehrungsart, type IstFuehrungsform, type Routentyp, type ParkenRechts,
  type OevAngebot, type Haltestellentyp, type Haltestellenloesung, type NotenErgebnis,
} from './fuehrungsform'
import { VeloMap, ISTCOLOR, type Cand, type SectionMarker, type Stop } from './VeloMap'
import { enrichCands, loadOev, type OevInfo } from './bern'
import { enrichObs, mergeObs, type ObsStats } from './obs'

const COLOR: Record<Fuehrungsart, { bg: string; fg: string }> = {
  'Mischverkehr':             { bg: '#9ca3af', fg: '#ffffff' },
  'Radstreifen':              { bg: '#eab308', fg: '#3b2f00' },
  'Radstreifen oder Radweg':  { bg: '#84a44b', fg: '#ffffff' },
  'Radweg':                   { bg: '#4d7c0f', fg: '#ffffff' },
}

const IST_OPTIONS: IstFuehrungsform[] = [
  'Mischverkehr', 'Radstreifen', 'Radweg strassenbegleitend / Geschützter Radstreifen', 'Radweg abgesetzt',
  'Umweltspur', 'Velostrasse', 'Fussweg Velo gestattet',
]
const ROUTE_OPTIONS: Routentyp[] = ['Velohauptroute', 'Veloroute']
const PARKEN_OPTIONS: { value: ParkenRechts; label: string }[] = [
  { value: 'egal', label: 'Egal' },
  { value: 'nein', label: 'Nein' },
  { value: 'ja', label: 'Ja' },
]
const OEV_OPTIONS: { value: OevAngebot; label: string }[] = [
  { value: 'keine', label: 'keine Haltestelle' },
  { value: 'bus_ab15', label: 'Bus ≥ 15 Min' },
  { value: 'bus_5_15', label: 'Bus 5–15 Min' },
  { value: 'bus_unter5', label: 'Bus < 5 Min' },
  { value: 'tram', label: 'Tram' },
]
const HALTESTELLEN_OPTIONS: { value: Haltestellentyp; label: string }[] = [
  { value: 'keine', label: '— noch offen —' },
  { value: 'Haltestelle mit Veloumfahrung', label: 'HS1 Haltestelle mit Veloumfahrung' },
  { value: 'Kaphaltestelle mit Veloüberfahrt', label: 'HS2 Kaphaltestelle mit Veloüberfahrt' },
  { value: 'Kaphaltestelle', label: 'HS3 Kaphaltestelle (Ausnahme)' },
  { value: 'Haltestelle mit rückwärtigem Radweg', label: 'HS4 Haltestelle mit rückw. Radweg' },
  { value: 'Inselhaltestelle', label: 'HS5 Inselhaltestelle' },
  { value: 'Fahrbahnhaltestelle Bus', label: 'HS6 Fahrbahnhaltestelle Bus' },
  { value: 'Busbucht', label: 'HS7 Busbucht' },
]

// Voraussetzungen für die Mischfläche Fuss/Velo (Q12) — reine Hinweis-Checkliste (kein Noteneinfluss)
const FUSSWEG_VORAUSSETZUNGEN = [
  'Erhöhtes Schutzbedürfnis Veloverkehr (z. B. Schulwege)',
  'Geringe Frequenz durch Fuss- und Veloverkehr',
  'Steigung oder zumindest kein Gefälle',
  'Etablierte, konfliktarme Situation',
  'Ausreichende Breite (i. d. R. ≥ 3,50 m)',
  'Fehlende Alternativen',
]

// Farbe der Note (CH-Skala: 6 = beste/grün … 1 = schlechteste/rot).
function noteColor(n: number): { bg: string; fg: string } {
  if (n >= 5.5) return { bg: '#15803d', fg: '#ffffff' }  // sehr gut
  if (n >= 4.5) return { bg: '#65a30d', fg: '#ffffff' }  // gut
  if (n >= 4.0) return { bg: '#ca8a04', fg: '#ffffff' }  // genügend
  if (n >= 2.5) return { bg: '#ea580c', fg: '#ffffff' }  // ungenügend
  return { bg: '#b91c1c', fg: '#ffffff' }                // schlecht
}

const DTV_BANDS   = ['< 2 000', '2 000 – 5 000', '5 000 – 10 000', '> 10 000']
const SPEED_BANDS = ['≤ 30', '31 – 40', '41 – 50', '51 – 80']
const DTV_REP     = [1000, 3500, 7500, 15000]   // Repräsentant je DTV-Band (für die Tabelle)
const SPEED_REP   = [30, 40, 50, 60]            // Repräsentant je Tempo-Band

// Entscheidungstabelle Haltestellen: ÖV-Angebot (Zeilen) × Routentyp (Spalten) → Soll-Lösung.
const OEV_ROWS: { label: string; v: OevAngebot }[] = [
  { label: 'Tram', v: 'tram' },
  { label: 'Bus < 5 Min', v: 'bus_unter5' },
  { label: 'Bus 5–15 Min', v: 'bus_5_15' },
  { label: 'Bus ≥ 15 Min', v: 'bus_ab15' },
]
const ROUTE_COLS: { label: string; r: Routentyp }[] = [
  { label: 'Veloroute', r: 'Veloroute' },
  { label: 'Velohauptroute', r: 'Velohauptroute' },
]
const HALT_COLOR: Record<Haltestellenloesung, { bg: string; fg: string }> = {
  'Separate Velofläche': { bg: '#16a34a', fg: '#ffffff' },
  'Übergang':            { bg: '#84a44b', fg: '#ffffff' },
  'Mischverkehr':        { bg: '#9ca3af', fg: '#ffffff' },
}

// ── Abschnitt: Eingabezustand ────────────────────────────────────────────────
// Herkunft eines Feldwerts: amtlich (Geodaten Stadt Bern) > OSM > manuell.
// Fehlt ein Eintrag, ist das Feld leer (keine erfundenen Werte).
type Quelle = 'amtlich' | 'osm' | 'manuell' | 'fahrplan'
// Felder, deren Herkunft verfolgt wird (datenartige Eingaben).
type QuelleFeld = 'dtv' | 'speed' | 'ist' | 'breite' | 'routentyp' | 'oevAngebot' | 'tram'

interface Section {
  id: number
  dtv: number                  // NaN = leer
  speed: number                // NaN = leer
  ist: IstFuehrungsform | ''   // '' = noch nicht gewählt
  breite: number               // NaN = leer
  routentyp: Routentyp | ''    // '' = noch nicht gewählt
  parkenRechts: ParkenRechts
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
function defaultSection(): Section {
  return {
    id: nextId++, dtv: NaN, speed: NaN, ist: '', breite: NaN,
    routentyp: '', parkenRechts: 'egal', oevTakt: 10,
    oevAngebot: 'keine', haltestellentyp: 'keine', haltestelleBreite: NaN,
    tram: false,
    quelle: {},
  }
}

// ── OSM-Import (Overpass) ─────────────────────────────────────────────────────
// Distanz [m] einer Geometrie (Haversine).
function geomLength(geom?: { lat: number; lon: number }[]): number {
  if (!geom || geom.length < 2) return 0
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180
  let tot = 0
  for (let i = 1; i < geom.length; i++) {
    const a = geom[i - 1], b = geom[i]
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
    tot += 2 * R * Math.asin(Math.sqrt(h))
  }
  return tot
}

// OSM-Tags → Ist-Führungsform (objektive Infrastruktur; Bewertung folgt im Rechner).
function istFromTags(t: Record<string, string>, highway: string): IstFuehrungsform {
  const cw = [t.cycleway, t['cycleway:both'], t['cycleway:left'], t['cycleway:right']]
  const has = (v: string) => cw.includes(v)
  if (t.bicycle_road === 'yes' || t.cyclestreet === 'yes') return 'Velostrasse'
  if (highway === 'cycleway') return 'Radweg abgesetzt'
  if ((highway === 'footway' || highway === 'path') &&
      ['yes', 'designated', 'permissive'].includes(t.bicycle)) return 'Fussweg Velo gestattet'
  if (has('track')) return 'Radweg strassenbegleitend / Geschützter Radstreifen'
  if (has('share_busway')) return 'Umweltspur'
  if (has('lane')) return 'Radstreifen'
  return 'Mischverkehr'
}

const OSM_ROADS = ['primary', 'secondary', 'tertiary', 'residential', 'unclassified',
  'living_street', 'road', 'primary_link', 'secondary_link', 'tertiary_link']

interface OsmWay { id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }

// Ein OSM-Way → Kandidat (Rohsegment für die Karte) — oder null, wenn nicht velo-relevant.
function wayToCand(w: OsmWay): Cand | null {
  const t = w.tags || {}
  const hw = t.highway || ''
  const bike = ['yes', 'designated', 'permissive'].includes(t.bicycle)
  const isRoad = OSM_ROADS.includes(hw)
  const isCycle = hw === 'cycleway'
  const isFootBike = (hw === 'footway' || hw === 'path') && bike
  if (!isRoad && !isCycle && !isFootBike) return null  // z. B. reine Trottoirs ausfiltern
  if (!w.geometry || w.geometry.length < 2) return null
  // Tempo/Breite nur übernehmen, wenn OSM sie wirklich kennt — sonst leer lassen
  // (keine erfundenen Fallback-Werte; Herkunft bleibt ehrlich).
  const sp = parseInt(t.maxspeed, 10)
  // Breite der Veloanlage: zuerst ein cycleway:*:width-Tag. `width` (ohne Präfix) zählt nur,
  // wenn der Way SELBST die Veloanlage ist (Radweg/Fuss-Velo-Weg). An einer Strasse meint
  // `width` die Fahrbahn, nicht den Radstreifen — dann nicht übernehmen (z. B. Sulgeneckstrasse:
  // highway=residential, cycleway:right=lane, width=9 → die 9 m sind die Fahrbahn, kein Radstreifen).
  const cwW = t['cycleway:width'] || t['cycleway:right:width'] || t['cycleway:left:width']
  const wRaw = parseFloat(cwW || ((isCycle || isFootBike) ? t.width : '') || '')
  return {
    id: w.id, ist: istFromTags(t, hw),
    speed: isFinite(sp) && sp > 0 ? sp : undefined,
    breite: isFinite(wRaw) && wRaw > 0 ? wRaw : undefined,
    len: geomLength(w.geometry),
    name: t.name || 'Segment', geom: w.geometry, selected: true,
  }
}

// Bus-Frequenzband aus Fahrten/h (Abendspitze, pro Richtung): Headway ≥15 / 5–15 / <5 min.
function busBand(perH: number): OevAngebot {
  if (perH <= 4) return 'bus_ab15'
  if (perH <= 12) return 'bus_5_15'
  return 'bus_unter5'
}
// ÖV-Angebot automatisch aus der Erkennung: Tram → „tram"; Bus mit Takt → Frequenzband.
function oevAngebotAuto(oev: OevInfo): OevAngebot | undefined {
  if (oev.oevHalt && oev.oevTram) return 'tram'
  if (oev.oevHalt && oev.oevBus && oev.busPerH != null) return busBand(oev.busPerH)
  return undefined
}

// Kandidat → Abschnitt (Section) der Strecke. Je Feld Wert UND Herkunft setzen
// (Priorität amtlich > OSM > leer); nicht belegte Felder bleiben leer (keine Defaults).
// OSM bleibt Quelle für Geometrie, Name und – falls getaggt – Breite/Tempo/Ist-Führungsform.
function candToSection(c: Cand): Section {
  const s = defaultSection()
  // Tempo: amtlich (V_sig) > OSM (maxspeed) > leer
  if (c.bern?.speed != null) { s.speed = c.bern.speed; s.quelle.speed = 'amtlich' }
  else if (c.speed != null) { s.speed = c.speed; s.quelle.speed = 'osm' }
  // DTV: nur amtlich (OSM kennt keinen DTV)
  if (c.bern?.dtv != null) { s.dtv = c.bern.dtv; s.quelle.dtv = 'amtlich' }
  // Führungsform: Velostrasse amtlich, sonst OSM-Ableitung
  if (c.bern?.velostrasse) { s.ist = 'Velostrasse'; s.quelle.ist = 'amtlich' }
  else { s.ist = c.ist as IstFuehrungsform; s.quelle.ist = 'osm' }
  // Breite: nur OSM (wenn getaggt)
  if (c.breite != null) { s.breite = c.breite; s.quelle.breite = 'osm' }
  // Routentyp: nur amtlich
  if (c.bern?.routentyp) { s.routentyp = c.bern.routentyp; s.quelle.routentyp = 'amtlich' }
  // ÖV (Geoportal + Fahrplan): Haltestelle/Modus übernehmen; Tram → ÖV-Angebot „tram",
  // Bus → Frequenzband aus dem Takt (GTFS). Haltestellentyp bleibt manuell.
  if (c.bern && (c.bern.oevHalt || c.bern.oevTram || c.bern.oevBus)) {
    s.oev = { oevHalt: !!c.bern.oevHalt, oevHaltName: c.bern.oevHaltName,
              oevTram: !!c.bern.oevTram, oevBus: !!c.bern.oevBus, busPerH: c.bern.busPerH }
    const auto = oevAngebotAuto(s.oev)
    // Tram = Geoportal; Bus-Band stammt aus dem Fahrplan (opentransportdata).
    if (auto) { s.oevAngebot = auto; s.quelle.oevAngebot = auto === 'tram' ? 'amtlich' : 'fahrplan' }
    // Tram in der Fahrbahn — entkoppelt von der Haltestelle (Geoportal kennt die Antwort).
    s.tram = !!c.bern.oevTram; s.quelle.tram = 'amtlich'
  }
  s.label = `${c.name} · ${Math.round(c.len)} m · OSM way ${c.id}`
  s.candIds = [c.id]
  if (c.obs) s.obs = c.obs   // OpenBikeSensor-Überholabstände (Zusatzinfo)
  return s
}

// Segment mit Geometrie-Kennwerten (für Ordnen + Zusammenfassen).
interface Seg { sec: Section; id: number; len: number; mid: { lat: number; lon: number }; name: string }

function centroid(geom: { lat: number; lon: number }[]): { lat: number; lon: number } {
  const n = geom.length
  return { lat: geom.reduce((s, p) => s + p.lat, 0) / n, lon: geom.reduce((s, p) => s + p.lon, 0) / n }
}

// (a) Segmente entlang der Strasse ordnen: Mittelpunkte auf die Hauptachse projizieren
// (Achse = Verbindung der beiden am weitesten entfernten Mittelpunkte) und danach sortieren.
function orderAlongAxis(segs: Seg[]): Seg[] {
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

// (b) Benachbarte Segmente zusammenfassen: gleiche Führungsform + Tempo, oder kurze Stummel (< 25 m).
// Repräsentant einer Gruppe = das längste Segment (damit ein Stummel die Klasse nicht überschreibt).
function mergeSegs(ordered: Seg[]): Section[] {
  const MIN_LEN = 25
  const longest = (g: Seg[]) => g.reduce((a, b) => (b.len > a.len ? b : a))
  const groups: Seg[][] = []
  for (const seg of ordered) {
    const g = groups[groups.length - 1]
    if (!g) { groups.push([seg]); continue }
    const rep = longest(g)
    // Tempo NaN-sicher vergleichen (leeres Tempo === leeres Tempo gilt als gleich).
    const speedEq = rep.sec.speed === seg.sec.speed ||
      (Number.isNaN(rep.sec.speed) && Number.isNaN(seg.sec.speed))
    const same = rep.sec.ist === seg.sec.ist && speedEq
    if (same || seg.len < MIN_LEN) g.push(seg)
    else groups.push([seg])
  }
  return groups.map(g => {
    const rep = longest(g)
    const total = g.reduce((s, x) => s + x.len, 0)
    if (g.length > 1) rep.sec.label = `${rep.name} · ${Math.round(total)} m · ${g.length} OSM-Segmente`
    rep.sec.candIds = g.map(seg => seg.id)   // alle Segment-IDs des Abschnitts (für die Karte)
    rep.sec.obs = mergeObs(g.map(seg => seg.sec.obs))   // OBS-Überholabstände des Abschnitts
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
      if (auto) { rep.sec.oevAngebot = auto; rep.sec.quelle.oevAngebot = auto === 'tram' ? 'amtlich' : 'fahrplan' }
      rep.sec.tram = rep.sec.oev.oevTram; rep.sec.quelle.tram = 'amtlich'
    }
    return rep.sec
  })
}

// Gewählte Kandidaten → geordnete, zusammengefasste Abschnitte.
function candsToSections(cands: Cand[]): Section[] {
  const segs: Seg[] = cands.filter(c => c.selected).map(c =>
    ({ sec: candToSection(c), id: c.id, len: c.len, mid: centroid(c.geom), name: c.name }))
  return mergeSegs(orderAlongAxis(segs))            // (a) ordnen, dann (b) zusammenfassen
}

// Overpass-Endpunkte: Hauptinstanz + Ausweich-Mirror (Failover bei Überlastung/Ausfall).
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const REQUEST_TIMEOUT_MS = 25000   // Per-Versuch-Timeout: hängende Mirror nicht ewig abwarten
const MAX_BACKOFF_MS = 10000       // Obergrenze fürs Warten (auch bei grossem Retry-After)

// fetch mit hartem Timeout (AbortController) — verhindert, dass eine nicht antwortende
// Instanz den ganzen Ladevorgang blockiert.
async function fetchMitTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...init, signal: ctrl.signal }) }
  finally { clearTimeout(t) }
}

// Eine Overpass-Anfrage mit Robustheit gegen Rate-Limits (429), kurze Server-Fehler (5xx) und
// hängende Instanzen: Per-Versuch-Timeout, Retry mit exponentiellem Backoff (gedeckelt),
// `Retry-After`-Header beachten, über die Mirror-Liste rotieren. Erst wenn alle Endpunkte/Versuche
// scheitern, wird ein Fehler geworfen.
async function overpassFetch(query: string): Promise<unknown> {
  const init: RequestInit = { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query) }
  const maxRunden = 2                          // Runden über die gesamte Endpunkt-Liste
  let lastStatus = 0
  for (let runde = 0; runde < maxRunden; runde++) {
    for (const url of OVERPASS_ENDPOINTS) {
      let res: Response
      try {
        res = await fetchMitTimeout(url, init, REQUEST_TIMEOUT_MS)
      } catch { lastStatus = 0; continue }     // Timeout/Netzwerk-/CORS-Fehler → nächster Mirror
      if (res.ok) return res.json()
      lastStatus = res.status
      // 429 (Rate-Limit) / 504 (Timeout) / 5xx: kurz warten und weiterprobieren; 4xx sonst sofort werfen.
      if (res.status === 429 || res.status === 504 || res.status >= 500) {
        const ra = parseInt(res.headers.get('Retry-After') || '', 10)
        const wartMs = Math.min(MAX_BACKOFF_MS, Number.isFinite(ra) ? ra * 1000 : 1000 * 2 ** runde)
        await sleep(wartMs)
        continue
      }
      throw new Error('Overpass HTTP ' + res.status)
    }
  }
  throw new Error('Overpass überlastet (HTTP ' + (lastStatus || 'Netzwerkfehler') + ')')
}

// Overpass-Abfrage → Kandidaten (Rohsegmente).
async function overpassCands(query: string): Promise<Cand[]> {
  const data = await overpassFetch(query) as { elements?: (OsmWay & { type: string })[] }
  const ways = (data.elements || []).filter(e => e.type === 'way')
  return ways.map(wayToCand).filter((c): c is Cand => c !== null)
}

// Weg 1: Kandidaten nach Strassenname (Gemeinde Bern).
// Case-insensitiver, exakter Namensabgleich (Overpass-Flag „,i"), damit z. B.
// „jungfraustrasse" oder „JUNGFRAUSTRASSE" ebenso gefunden werden wie „Jungfraustrasse".
function loadStreetCandidates(street: string): Promise<Cand[]> {
  const esc = street.replace(/[\\.[\]{}()*+?^$|]/g, '\\$&')  // Regex-Sonderzeichen maskieren
  return overpassCands(
    `[out:json][timeout:60];` +
    `area["name"="Bern"]["admin_level"="8"]["boundary"="administrative"]->.a;` +
    `way["name"~"^${esc}$",i]["highway"](area.a);out tags geom;`)
}

// Weg 2: Kandidaten im Kartenausschnitt (Bounding-Box), auf velorelevante Strassentypen gefiltert.
function loadBboxCandidates(s: number, w: number, n: number, e: number): Promise<Cand[]> {
  return overpassCands(
    `[out:json][timeout:60];` +
    `way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street|road|cycleway|footway|path)$"]` +
    `(${s},${w},${n},${e});out tags geom;`)
}

// Weg 3: Klick auf die Karte → nächstgelegenes velorelevantes Segment (im Umkreis von 25 m).
function havM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
async function loadNearestCandidate(lat: number, lon: number): Promise<Cand | null> {
  const cs = await overpassCands(
    `[out:json][timeout:25];` +
    `way(around:25,${lat},${lon})["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street|road|cycleway|footway|path)$"];` +
    `out tags geom;`)
  let best: Cand | null = null, bd = Infinity
  for (const c of cs) {
    const d = Math.min(...c.geom.map(p => havM(p, { lat, lon })))
    if (d < bd) { bd = d; best = c }
  }
  return best
}

// Herkunfts-Chip am Feld: blau „amtlich" (Geodaten Stadt Bern), grau „OSM";
// bei „manuell"/leer kein Chip. Für leere Pflichtfelder ein rötlicher „Eingabe nötig"-Chip.
function QuelleChip({ q, fehlt }: { q?: Quelle; fehlt?: boolean }) {
  const map: Record<string, { t: string; bg: string; fg: string; title?: string }> = {
    amtlich: { t: 'Geoportal', bg: '#dbeafe', fg: '#1e40af', title: 'Geoinformation Stadt Bern' },
    osm: { t: 'OSM', bg: 'var(--border-subtle)', fg: 'var(--text-muted-strong)', title: 'OpenStreetMap' },
    fahrplan: { t: 'opentransportdata', bg: '#dcfce7', fg: '#166534', title: 'Fahrplan (opentransportdata.swiss / GTFS)' },
    fehlt: { t: 'Eingabe nötig', bg: '#fee2e2', fg: '#b91c1c' },
  }
  const key = fehlt ? 'fehlt'
    : q === 'amtlich' ? 'amtlich' : q === 'osm' ? 'osm' : q === 'fahrplan' ? 'fahrplan' : null
  if (!key) return null
  const c = map[key]
  return (
    <span title={c.title} style={{ fontSize: 10.5, fontWeight: 700, color: c.fg, background: c.bg,
                   borderRadius: 999, padding: '1px 7px', whiteSpace: 'nowrap',
                   display: 'inline-block', verticalAlign: 'middle', marginLeft: 6,
                   cursor: c.title ? 'help' : 'default' }}>
      {c.t}
    </span>
  )
}

// Label im normalen Textfluss (kein Flex): bei zweizeiligen Labels bricht der Chip
// um, statt nach rechts in die Nachbarspalte zu überlaufen. Mindesthöhe = 2 Zeilen,
// damit die Eingabefelder über die Spalten hinweg bündig auf gleicher Höhe stehen.
function FieldLabel({ label, chip }: { label: string; chip?: React.ReactNode }) {
  return (
    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4,
                   display: 'block', minHeight: '2.8em' }}>
      {label}{chip}
    </span>
  )
}

function NumberField({ label, unit, value, onChange, step, chip }: {
  label: string; unit: string; value: number; onChange: (v: number) => void
  step?: number; chip?: React.ReactNode
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 150 }}>
      <FieldLabel label={label} chip={chip} />
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="number" min={0} step={step ?? 1} value={Number.isFinite(value) ? value : ''}
          // Geleertes Feld → NaN (leer), nicht 0; sonst Wert ≥ 0.
          onChange={e => { const r = e.target.value; onChange(r === '' ? NaN : Math.max(0, Number(r) || 0)) }}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 8,
            border: '1px solid var(--border)', fontSize: 16, textAlign: 'right',
          }}
        />
        <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{unit}</span>
      </span>
    </label>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 16, background: '#fff',
}
const fieldStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 150,
}
// Dezente Gruppen-Überschrift in der Eingabemaske (Grunddaten / ÖV-Haltestelle).
const groupLabelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--text-muted)', marginBottom: 8,
}

// ── Karte für einen Abschnitt: Eingaben + Einzelbewertung ────────────────────
function SectionCard({ index, section, bewertung, isWorst, modus, onChange, onRemove, canRemove, onHover }: {
  index: number
  section: Section
  bewertung: NotenErgebnis | null
  isWorst: boolean
  modus: 'note' | 'erfuellung'
  onChange: (patch: Partial<Section>) => void
  onRemove: () => void
  canRemove: boolean
  onHover?: (hovering: boolean) => void
}) {
  const { ist } = section
  const q = section.quelle
  const bezugLabel = section.routentyp === 'Veloroute' ? 'Minimal' : 'Optimal'
  const hatMarker = (section.candIds?.length ?? 0) > 0   // nur OSM-Abschnitte sind auf der Karte markiert

  return (
    <div onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)}
         style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 12,
                  padding: 16, marginBottom: 14,
                  boxShadow: isWorst ? '0 0 0 2px #b91c1c' : 'none' }}>
      {/* Kopfzeile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {/* Nummer wie der Karten-Marker (dunkler Kreis) — nur bei OSM-Abschnitten */}
        {hatMarker && (
          <span title="Nummer auf der Karte"
                style={{ width: 22, height: 22, borderRadius: 999, background: 'var(--text-strong)',
                         color: '#fff', fontWeight: 700, fontSize: 12, lineHeight: '22px',
                         textAlign: 'center', flexShrink: 0 }}>
            {index + 1}
          </span>
        )}
        <strong style={{ fontSize: 15 }}>Abschnitt {index + 1}</strong>
        {section.label && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{section.label}</span>
        )}
        {isWorst && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c',
                         background: '#fee2e2', borderRadius: 999, padding: '2px 8px' }}>
            massgebend für die Strecke
          </span>
        )}
        <span style={{ flex: 1 }} />
        {canRemove && (
          <button onClick={onRemove}
                  style={{ border: '1px solid var(--border)', background: '#fff', color: 'var(--text-muted)',
                           borderRadius: 8, padding: '4px 10px', fontSize: 13, cursor: 'pointer' }}>
            Entfernen
          </button>
        )}
      </div>

      {/* Eingaben — Gruppe 1: Grunddaten (Führungsform & Kontext) */}
      <div style={groupLabelStyle}>Grunddaten</div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <NumberField label="DTV MIV" unit="Fz/Tag" value={section.dtv} step={100}
                     onChange={v => onChange({ dtv: v })}
                     chip={<QuelleChip q={q.dtv} fehlt={!Number.isFinite(section.dtv)} />} />
        <NumberField label="Zul. Höchstgeschwindigkeit" unit="km/h" value={section.speed} step={10}
                     onChange={v => onChange({ speed: v })}
                     chip={<QuelleChip q={q.speed} fehlt={!Number.isFinite(section.speed)} />} />
        <label style={fieldStyle}>
          <FieldLabel label="Vorhandene Führungsform (Ist)"
                      chip={<QuelleChip q={q.ist} fehlt={ist === ''} />} />
          <select value={ist} onChange={e => onChange({ ist: e.target.value as IstFuehrungsform })}
                  style={selectStyle}>
            <option value="">— wählen —</option>
            {IST_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        {/* Breite nur bei Formen mit Breiten-Vorgabe (nicht Mischverkehr; erst nach Formwahl). */}
        {ist !== '' && ist !== 'Mischverkehr' && (
          <NumberField label="Breite der Führungsform" unit="m" value={section.breite} step={0.1}
                       onChange={v => onChange({ breite: v })}
                       chip={<QuelleChip q={q.breite} fehlt={!Number.isFinite(section.breite)} />} />
        )}
        <label style={fieldStyle}>
          <FieldLabel label="Routentyp" chip={<QuelleChip q={q.routentyp} />} />
          <select value={section.routentyp}
                  onChange={e => onChange({ routentyp: e.target.value as Routentyp })}
                  style={selectStyle}>
            <option value="">— wählen —</option>
            {ROUTE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        {/* Parkierung rechts (Dooring) bei Fahrbahn-Führungsformen (siehe PARKEN_RELEVANT) */}
        {PARKEN_RELEVANT.includes(ist as IstFuehrungsform) && (
          <label style={fieldStyle}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              Parkierung rechts (Dooring)
            </span>
            <select value={section.parkenRechts}
                    onChange={e => onChange({ parkenRechts: e.target.value as ParkenRechts })}
                    style={selectStyle}>
              {PARKEN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        )}
        {/* öV-Takt nur bei der Umweltspur (Bus+Velo) */}
        {ist === 'Umweltspur' && (
          <NumberField label="öV-Takt (Bus)" unit="Min" value={section.oevTakt} step={0.5}
                       onChange={v => onChange({ oevTakt: v })} />
        )}
        {/* Tram in der Fahrbahn — entkoppelt von der Haltestelle; wirkt nur bei Mischverkehr. */}
        <label style={fieldStyle}>
          <FieldLabel label="Tram in der Fahrbahn" chip={<QuelleChip q={q.tram} />} />
          <select value={section.tram ? 'ja' : 'nein'}
                  onChange={e => onChange({ tram: e.target.value === 'ja' })}
                  style={selectStyle}>
            <option value="nein">Nein</option>
            <option value="ja">Ja (Schienen in der Fahrbahn)</option>
          </select>
        </label>
      </div>

      {/* Eingaben — Gruppe 2: ÖV-Haltestelle im Abschnitt (für die Soll-Haltestellenlösung) */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
        <div style={groupLabelStyle}>ÖV-Haltestelle</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <label style={fieldStyle}>
          <FieldLabel label="ÖV-Angebot (Haltestelle)" chip={<QuelleChip q={q.oevAngebot} />} />
          <select value={section.oevAngebot}
                  onChange={e => onChange({ oevAngebot: e.target.value as OevAngebot })}
                  style={selectStyle}>
            {OEV_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {section.oevAngebot !== 'keine' && (
          <label style={fieldStyle}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              Vorhandener Haltestellentyp
            </span>
            <select value={section.haltestellentyp}
                    onChange={e => onChange({ haltestellentyp: e.target.value as Haltestellentyp })}
                    style={selectStyle}>
              {HALTESTELLEN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        )}
        {/* Breite der Veloführung an der Haltestelle — nur bei Typen mit Breitenkriterium */}
        {section.oevAngebot !== 'keine' && HALTESTELLE_MIT_BREITE.includes(section.haltestellentyp) && (
          <NumberField label="Breite Veloführung Haltestelle" unit="m" value={section.haltestelleBreite}
                       step={0.1} onChange={v => onChange({ haltestelleBreite: v })} />
        )}
        </div>
      </div>

      {/* ÖV-Hinweis: Tram → „Tram"; Bus → Frequenzband aus dem Fahrplan (Abendspitze). Typ manuell. */}
      {section.oev?.oevHalt && (() => {
        const o = section.oev!
        const name = o.oevHaltName ? ` „${o.oevHaltName}"` : ''
        const takt = o.busPerH ? Math.round(60 / o.busPerH) : null
        return (
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8,
                        background: '#faf5ff', border: '1px solid #e9d5ff', color: '#6b21a8', fontSize: 12.5 }}>
            {o.oevTram
              ? <>Geoportal: <strong>Tramhaltestelle{name}</strong> im Abschnitt → ÖV-Angebot „Tram" gesetzt. Haltestellentyp bitte wählen.</>
              : o.busPerH != null
                ? <>Geoportal + Fahrplan: <strong>Bushaltestelle{name}</strong>, Abendspitze 17–18 h ≈ <strong>{o.busPerH} Fahrten/h</strong> (Takt ~{takt} Min, stärkste Richtung) → ÖV-Angebot gesetzt. Haltestellentyp bitte wählen.</>
                : <>Geoportal: <strong>Bushaltestelle{name}</strong> im Abschnitt erkannt → ÖV-Angebot/Takt und Haltestellentyp bitte wählen (kein Takt in den Daten).</>}
          </div>
        )
      })()}

      {/* Ergebnis des Abschnitts — oder Hinweis, solange Pflichtfelder fehlen */}
      {bewertung == null ? (
        <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 10,
                      background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412',
                      fontSize: 13.5 }}>
          <strong>Eingabe nötig:</strong> DTV, Tempo, Führungsform
          {ist !== 'Mischverkehr' && ' und Breite'} angeben — dann wird die Note berechnet.
        </div>
      ) : (
      <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 10,
                    background: noteColor(bewertung.note).bg, color: noteColor(bewertung.note).fg,
                    display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', minWidth: modus === 'erfuellung' ? 120 : 70 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase', opacity: 0.85 }}>
            {modus === 'erfuellung' ? 'Beurteilung' : 'Note'}
          </div>
          {modus === 'erfuellung' ? (
            <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.15 }}>
              {erfuellungsgrad(bewertung.note)}
            </div>
          ) : (
            <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>
              {bewertung.note.toFixed(1)}
            </div>
          )}
        </div>
        <div style={{ fontSize: 13.5, opacity: 0.97 }}>
          {ist !== 'Umweltspur' && ist !== 'Fussweg Velo gestattet' &&
            <div><strong>Soll:</strong> {bewertung.soll}</div>}
          <div><strong>Ist:</strong> {bewertung.ist} ({bewertung.q})</div>

          {bewertung.hinweis ? (
            <div style={{ marginTop: 6, fontWeight: 700 }}>⚠ {bewertung.hinweis}</div>
          ) : (
            <>
              <div style={{ marginTop: 4, opacity: 0.85 }}>
                {ist === 'Umweltspur'
                  ? `öV-Takt ${section.oevTakt} Min (≥ 7,5 zulässig) → Basis-Note 4 (max. «genügend»); DTV/Tempo nicht massgebend.`
                  : ist === 'Fussweg Velo gestattet'
                    ? 'Mischfläche Fuss/Velo · Basis-Note 4 (max. «genügend»); DTV/Tempo nicht massgebend.'
                    : bewertung.erfuellt
                      ? 'Form erfüllt den Soll → Form-Note 6.'
                      : `feel-safe-Defizit ${bewertung.defizit} Pkt. → Form-Note ${bewertung.basisnote.toFixed(1)}.`}
              </div>
              {bewertung.sollbreite == null ? (
                <div style={{ marginTop: 6, opacity: 0.75 }}>Keine Breitenvorgabe für diese Form.</div>
              ) : bewertung.breite == null ? (
                <div style={{ marginTop: 6, opacity: 0.9 }}>
                  <strong>Breite:</strong> nicht angegeben · Vorgabe{' '}
                  {bewertung.maxbreite != null
                    ? `${bewertung.sollbreite.toFixed(2)}–${bewertung.maxbreite.toFixed(2)} m`
                    : `${bezugLabel} ${bewertung.sollbreite.toFixed(2)} m`}
                  {!section.routentyp && ' · Routentyp wählen'}
                </div>
              ) : (
                <div style={{ marginTop: 6, opacity: 0.9 }}>
                  <strong>Breite:</strong> {bewertung.breite.toFixed(2)} m · Vorgabe{' '}
                  {bewertung.maxbreite != null
                    ? `${bewertung.sollbreite.toFixed(2)}–${bewertung.maxbreite.toFixed(2)} m`
                    : `${bezugLabel} ${bewertung.sollbreite.toFixed(2)} m`}
                  {' · '}
                  {bewertung.breiteErfuellt
                    ? '✓ erfüllt'
                    : `${bewertung.breitenStatus} (${bewertung.breitenDefizit.toFixed(2)} m) → Abzug ${bewertung.breitenabzug.toFixed(1)} Note`}
                </div>
              )}
              {bewertung.parkenAbzug > 0 && (
                <div style={{ marginTop: 6, opacity: 0.9 }}>
                  <strong>Parkierung rechts (Dooring):</strong> Abzug{' '}
                  {bewertung.parkenAbzug.toFixed(1)} Note
                </div>
              )}
              {bewertung.tramAbzug > 0 && (
                <div style={{ marginTop: 6, opacity: 0.9 }}>
                  <strong>Tram in der Fahrbahn:</strong> Abzug{' '}
                  {bewertung.tramAbzug.toFixed(2)} Note (Schienen im Mischverkehr)
                </div>
              )}
              {bewertung.sollHaltestelle && (
                <div style={{ marginTop: 6, opacity: 0.9 }}>
                  <strong>Haltestelle:</strong> Soll {bewertung.sollHaltestelle}
                  {bewertung.haltestelleStatus === 'kompatibel' &&
                    ` · ${section.haltestellentyp} ✓ kompatibel`}
                  {bewertung.haltestelleStatus === 'inkompatibel' &&
                    ` · ${section.haltestellentyp} ✗ → Abzug ${bewertung.haltestelleAbzug.toFixed(1)} Note`}
                  {bewertung.haltestelleStatus === 'pruefen' &&
                    ` · Haltestellentyp wählen. Kompatibel: ${bewertung.kompatibleHaltestellen.join(', ')}`}
                  {bewertung.haltestelleStatus === 'inkompatibel' && (
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      Kompatibel wären: {bewertung.kompatibleHaltestellen.join(', ')}
                    </div>
                  )}
                </div>
              )}
              {bewertung.hsBreitenSoll != null && (
                <div style={{ marginTop: 6, opacity: 0.9 }}>
                  <strong>Breite Haltestelle:</strong>{' '}
                  {bewertung.haltestelleBreite != null
                    ? `${bewertung.haltestelleBreite.toFixed(2)} m`
                    : 'nicht angegeben'} · Vorgabe{' '}
                  {bezugLabel} {bewertung.hsBreitenSoll.toFixed(2)} m
                  {bewertung.haltestelleBreite != null && (' · ' + (bewertung.hsBreiteStatus === 'erfuellt'
                    ? '✓ erfüllt'
                    : `zu schmal → Abzug ${bewertung.hsBreitenabzug.toFixed(1)} Note`))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}

      {/* OpenBikeSensor: gemessene Überholabstände — reine Zusatzinfo, kein Noteneinfluss.
          Auch „befahren, aber nicht überholt" (nur usage) wird gezeigt. */}
      {section.obs && (section.obs.count > 0 || section.obs.usage > 0) && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10,
                      background: '#f0f9ff', border: '1px solid #bae6fd', color: '#075985',
                      fontSize: 13 }}>
          {section.obs.count > 0 ? (
            <>
              <strong>OpenBikeSensor:</strong> Median Überholabstand{' '}
              <strong>{section.obs.median.toFixed(2)} m</strong>
              {' · '}{Math.round(100 * section.obs.below150 / section.obs.count)} % unter 1,5 m
              {' · '}n = {section.obs.count}
              {section.obs.usage > 0 && ` · ${section.obs.usage} Befahrungen`}
              <span style={{ opacity: 0.7 }}> (gemessene Werte, fliessen nicht in die Note ein)</span>
            </>
          ) : (
            <>
              <strong>OpenBikeSensor:</strong> befahren ({section.obs.usage} Befahrungen),
              aber keine Überholmessung aufgezeichnet
            </>
          )}
        </div>
      )}

      {/* Voraussetzungs-Checkliste für die Mischfläche Fuss/Velo (Q12) — reiner Hinweis */}
      {ist === 'Fussweg Velo gestattet' && (
        <div style={{ marginTop: 12, padding: '14px 16px', borderRadius: 10,
                      background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            ⚠ Mischfläche Fuss/Velo nur prüfen, wenn alle Voraussetzungen zutreffen:
          </div>
          <ul style={{ margin: '0 0 6px', paddingLeft: 20, fontSize: 13.5 }}>
            {FUSSWEG_VORAUSSETZUNGEN.map(v => <li key={v}>{v}</li>)}
          </ul>
          <div style={{ fontSize: 13 }}>
            Trifft eine Bedingung nicht zu, ist diese Führungsform i. d. R. nicht zulässig.
            <strong> Bei Gefälle ist besondere Vorsicht geboten</strong> (hohe Differenzgeschwindigkeit
            Velo ↔ Fuss).
          </div>
        </div>
      )}
    </div>
  )
}

// ── CSV-Export (client-seitig, ohne Library) ─────────────────────────────────
const QUELLE_LABEL: Record<Quelle, string> = { amtlich: 'Geoportal', osm: 'OSM', manuell: 'manuell', fahrplan: 'opentransportdata' }
// Zahl im de-CH-Format (Komma-Dezimal); leer, wenn nicht gesetzt.
const numDE = (x: number, dec = 0) => (Number.isFinite(x) ? x.toFixed(dec).replace('.', ',') : '')
// CSV-Feld maskieren (Semikolon-getrennt, de-CH/Excel).
const csvCell = (v: string | number) => {
  const s = String(v ?? '')
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
function buildCsv(sections: Section[], results: (NotenErgebnis | null)[], streckeNote: number | null): string {
  const head = [
    'Abschnitt', 'Strecke/Herkunft', 'DTV [Fz/Tag]', 'DTV-Quelle', 'Tempo [km/h]', 'Tempo-Quelle',
    'Ist-Führungsform', 'Ist-Quelle', 'Breite [m]', 'Breite-Quelle', 'Routentyp', 'Routentyp-Quelle',
    'Parkierung rechts', 'Tram in Fahrbahn', 'ÖV-Angebot', 'Haltestellentyp', 'Soll-Führungsform', 'Note', 'Erfüllungsgrad',
    'OBS Median [m]', 'OBS n', 'OBS <1,5m [%]', 'OBS Befahrungen',
  ]
  const rows = sections.map((s, i) => {
    const r = results[i]
    const obs = s.obs
    const obsPct = obs && obs.count > 0 ? Math.round(100 * obs.below150 / obs.count) : NaN
    return [
      `Abschnitt ${i + 1}`, s.label ?? '',
      numDE(s.dtv), s.quelle.dtv ? QUELLE_LABEL[s.quelle.dtv] : '',
      numDE(s.speed), s.quelle.speed ? QUELLE_LABEL[s.quelle.speed] : '',
      s.ist || '', s.quelle.ist ? QUELLE_LABEL[s.quelle.ist] : '',
      numDE(s.breite, 2), s.quelle.breite ? QUELLE_LABEL[s.quelle.breite] : '',
      s.routentyp || '', s.quelle.routentyp ? QUELLE_LABEL[s.quelle.routentyp] : '',
      s.parkenRechts, s.tram ? 'ja' : 'nein', s.oevAngebot, s.haltestellentyp,
      r ? r.soll : '', r ? numDE(r.note, 1) : 'unvollständig', r ? erfuellungsgrad(r.note) : '',
      obs && obs.count > 0 ? numDE(obs.median, 2) : '',
      obs ? String(obs.count) : '', Number.isFinite(obsPct) ? String(obsPct) : '',
      obs ? String(obs.usage) : '',
    ]
  })
  // Schlusszeile: Strecken-Note (schlechtester Abschnitt).
  const foot = ['Strecke', 'schlechtester Abschnitt', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
    streckeNote != null ? numDE(streckeNote, 1) : 'unvollständig',
    streckeNote != null ? erfuellungsgrad(streckeNote) : '', '', '', '', '']
  return [head, ...rows, foot].map(row => row.map(csvCell).join(';')).join('\r\n')
}
function downloadCsv(csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })  // BOM → Excel erkennt UTF-8
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `velocheck_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Einstiegsseite ───────────────────────────────────────────────────────────
function Landing({ onStart }: { onStart: () => void }) {
  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 56px',
                   fontFamily: 'system-ui, -apple-system, sans-serif', color: 'var(--text)' }}>
      <img src={import.meta.env.BASE_URL + 'logo.svg'} alt="VeloroutenCheck — zum Rechner"
           title="Zum Rechner" onClick={onStart}
           style={{ width: 225, maxWidth: '60%', display: 'block', margin: '8px auto 6px', cursor: 'pointer' }} />
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <button onClick={onStart}
                style={{ border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer',
                         borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 600 }}>
          Zum Rechner →
        </button>
      </div>
      <p style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 14px' }}>
        VeloroutenCheck bewertet die Qualität der Veloinfrastruktur gemäss dem{' '}
        <a href="https://www.bern.ch/velohauptstadt/infrastruktur/masterplan-veloinfrastruktur"
           target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          Masterplan Veloinfrastruktur der Stadt Bern
        </a>. Eine Bewertung bezieht sich jeweils auf eine Velostrecke, die aus einem oder mehreren
        Abschnitten bestehen kann.
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 8px' }}>
        Entspricht die vorhandene Führungsform nicht dem vorgesehenen Soll-Zustand, wird
        berücksichtigt, wie stark sich dies auf das subjektive Sicherheitsgefühl auswirkt. Grundlage
        dafür sind Erkenntnisse aus der{' '}
        <a href="https://radwege-check.de/auswertung/"
           target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          radwege-check-/FixMyCity-Befragung
        </a>.
      </p>

      {/* Querverweis auf KnotenCheck */}
      <a href="https://pnfzygrzgf-svg.github.io/KnotenCheck/" target="_blank" rel="noopener noreferrer"
         style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22, textDecoration: 'none',
                  background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 10,
                  padding: '12px 16px', color: 'var(--text)' }}>
        <img src={import.meta.env.BASE_URL + 'knotencheck.png'} alt="" width={56} height={56}
             style={{ flexShrink: 0, borderRadius: 8 }} />
        <span>
          <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>KnotenCheck</span><br />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Werkzeug zur Leistungsbeurteilung von Knoten innerorts.
          </span>
        </span>
      </a>

      {/* Datenspeicherung (nur auf der Einstiegsseite) — kompakt */}
      <div style={{ marginTop: 22, padding: '10px 14px', borderRadius: 10,
                    background: '#f8fafc', border: '1px solid var(--border-subtle)',
                    fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.45, textAlign: 'left' }}>
        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Datenspeicherung</div>
        <div>Alle Berechnungen laufen vollständig im Browser. Eingaben und Ergebnisse werden nie an einen
          Server übermittelt — es gibt keinen Server, der sie entgegennimmt.</div>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li>Eingaben existieren nur im Arbeitsspeicher des Browsers und gehen beim Schliessen des Tabs verloren.</li>
          <li>CSV-Export: „Als CSV exportieren" lädt die Bewertung als CSV-Datei auf den
            lokalen Rechner — kein Upload, kein Cloud-Speicher. Ein Datei-Import ist derzeit nicht vorgesehen.</li>
          <li>Nutzungsstatistik: Seitenaufrufe werden mit GoatCounter gezählt — datenschutzfreundlich: keine
            Cookies, keine Speicherung der IP-Adresse, keine personenbezogenen Daten. Übermittelt wird nur ein
            anonymer Seitenaufruf (mit groben Angaben wie Browser und Herkunftsland), nicht deine Eingaben oder
            Ergebnisse. GitHub Pages loggt zudem serverseitig Zugriffe (IP, User-Agent), wie jeder Webserver.</li>
        </ul>
      </div>
    </main>
  )
}

export default function App() {
  const [sections, setSections] = useState<Section[]>([defaultSection()])
  const [street, setStreet] = useState('')
  const [osmBusy, setOsmBusy] = useState(false)
  const [osmMsg, setOsmMsg] = useState('')
  const [osmKind, setOsmKind] = useState<'info' | 'ok' | 'error'>('info')  // Meldungstyp für Styling
  // Statusmeldung mit Typ setzen (info = neutral/Laden, ok = Erfolg, error = Fehler).
  const setMsg = (text: string, kind: 'info' | 'ok' | 'error' = 'info') => { setOsmMsg(text); setOsmKind(kind) }
  const [cands, setCands] = useState<Cand[]>([])
  const [stops, setStops] = useState<Stop[]>([])                  // ÖV-Haltestellen für Karten-Marker
  const [hoverSec, setHoverSec] = useState<number | null>(null)   // gehoverter Abschnitt (für Karten-Highlight)
  const [modus, setModus] = useState<'note' | 'erfuellung'>('note')  // Anzeige: Schulnote oder Erfüllungsgrad
  const [hintDismissed, setHintDismissed] = useState(false)  // Karten-Einstiegshinweis: erst wegklicken, dann auswählen
  // Einstiegsseite ↔ Rechner; Deep-Link über #rechner.
  const [view, setView] = useState<'home' | 'rechner'>(() =>
    typeof location !== 'undefined' && location.hash === '#rechner' ? 'rechner' : 'home')
  // GoatCounter: Rechner-Aufruf als eigenen Pfad zählen (zusätzlich zum auto-gezählten Seitenaufruf).
  const zaehleRechner = () => (window as unknown as {
    goatcounter?: { count?: (o: { path: string; title?: string; event?: boolean }) => void }
  }).goatcounter?.count?.({ path: '/rechner', title: 'Rechner', event: false })
  const go = (v: 'home' | 'rechner') => {
    setView(v)
    if (typeof location !== 'undefined') location.hash = v === 'rechner' ? 'rechner' : ''
    if (v === 'rechner') zaehleRechner()
  }
  // Vor/Zurück-Navigation (Hash) berücksichtigen.
  useEffect(() => {
    const onHash = () => setView(location.hash === '#rechner' ? 'rechner' : 'home')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  // Direkt-Aufruf via #rechner einmalig zählen (best effort; count.js lädt asynchron).
  useEffect(() => { if (view === 'rechner') zaehleRechner() }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const selCount = cands.filter(c => c.selected).length

  // Kandidaten mit OpenBikeSensor-Überholabständen anreichern (gebündelter Snapshot, siehe obs.ts).
  const withObs = async (cs: Cand[]): Promise<Cand[]> => {
    const obs = await enrichObs(cs).catch(() => new Map())
    return obs.size === 0 ? cs : cs.map(c => (obs.has(c.id) ? { ...c, obs: obs.get(c.id) } : c))
  }
  // Kandidaten mit ÖV anreichern (Haltestelle/Modus, siehe bern.ts) + Haltestellen-Punkte für die Karte.
  const withOev = async (cs: Cand[]): Promise<{ cands: Cand[]; stops: Stop[] }> => {
    const { byId, stops } = await loadOev(cs)
      .catch(() => ({ byId: new Map<number, OevInfo>(), stops: [] as Stop[] }))
    const cands = byId.size === 0 ? cs
      : cs.map(c => (byId.has(c.id) ? { ...c, bern: { ...c.bern, ...byId.get(c.id) } } : c))
    return { cands, stops }
  }
  // Haltestellen-Marker zusammenführen (nach Name+Position eindeutig).
  const mergeStops = (prev: Stop[], neu: Stop[]) => {
    const seen = new Set(prev.map(s => `${s.name}|${s.lat}|${s.lon}`))
    return [...prev, ...neu.filter(s => !seen.has(`${s.name}|${s.lat}|${s.lon}`))]
  }

  // Weg 1: Strasse laden → Kandidaten auf die Karte (alle zunächst gewählt).
  // Anschliessend mit amtlichen Geodaten Stadt Bern anreichern (Tempo, DTV, Routentyp,
  // Velostrasse — siehe bern.ts); ein Fehler dabei darf den OSM-Import nicht verhindern.
  const ladeStrasse = async () => {
    const name = street.trim()
    if (!name) return
    setOsmBusy(true); setMsg('Lade Segmente aus OpenStreetMap …')
    try {
      const c = await loadStreetCandidates(name)
      const { cands: enriched, stops: st } = await withOev(await withObs(await enrichCands(c).catch(() => c)))
      setCands(enriched); setStops(st)
      const bernHit = enriched.some(x => x.bern)
      setMsg(c.length
        ? `${c.length} Segmente geladen (© OpenStreetMap, ODbL)` +
          (bernHit ? ' · Tempo/DTV/Routentyp: Geodaten Stadt Bern, freie Nutzung.' : '.') +
          ' Auf der Karte ab-/zuwählen, dann übernehmen.'
        : `Keine Velo-relevanten Segmente für „${name}" (Stadt Bern) gefunden.`,
        c.length ? 'ok' : 'info')
    } catch (e) { setMsg('Fehler beim Laden: ' + (e as Error).message, 'error') }
    finally { setOsmBusy(false) }
  }

  // Weg 2: Segmente im aktuellen Kartenausschnitt nachladen (zu den vorhandenen hinzufügen).
  const ladeAusschnitt = async () => {
    const map = mapRef.current
    if (!map) return
    const b = map.getBounds()
    setOsmBusy(true); setMsg('Lade Segmente im Kartenausschnitt …')
    try {
      const roh = await loadBboxCandidates(b.getSouth(), b.getWest(), b.getNorth(), b.getEast())
      const { cands: neu, stops: st } = await withOev(await withObs(await enrichCands(roh).catch(() => roh)))
      setCands(prev => {
        const ids = new Set(prev.map(c => c.id))
        return [...prev, ...neu.filter(c => !ids.has(c.id))]
      })
      setStops(prev => mergeStops(prev, st))
      setMsg(`${neu.length} Segmente im Ausschnitt gefunden (neue hinzugefügt).`, neu.length ? 'ok' : 'info')
    } catch (e) { setMsg('Fehler beim Laden: ' + (e as Error).message, 'error') }
    finally { setOsmBusy(false) }
  }

  const toggleCand = (id: number) =>
    setCands(prev => prev.map(c => (c.id === id ? { ...c, selected: !c.selected } : c)))

  // Weg 3: Klick auf die Karte → nächstes Segment laden, anreichern und hinzufügen.
  // Wie beim Strassen-/Ausschnitt-Laden mit Geodaten Stadt Bern + OpenBikeSensor anreichern
  // (Klick ist der Hauptweg zum Strecken-Aufbau, daher müssen DTV/Tempo/Routentyp/OBS auch hier kommen).
  const klickHinzufuegen = async (lat: number, lon: number) => {
    if (osmBusy) return                         // läuft schon eine Anfrage → Klick ignorieren (Rate-Limit schonen)
    setOsmBusy(true); setMsg('Suche Segment an der Klickstelle …')
    try {
      const roh = await loadNearestCandidate(lat, lon)
      if (!roh) { setMsg('An dieser Stelle kein velorelevantes Segment gefunden.', 'info'); return }
      const { cands: [c], stops: st } = await withOev(await withObs(await enrichCands([roh]).catch(() => [roh])))
      const exists = cands.some(p => p.id === c.id)
      setCands(prev => (prev.some(p => p.id === c.id) ? prev : [...prev, c]))
      setStops(prev => mergeStops(prev, st))
      setMsg(exists ? `Segment „${c.name}" ist bereits geladen.` : `Segment „${c.name}" hinzugefügt.`,
        exists ? 'info' : 'ok')
    } catch (e) { setMsg('Fehler beim Laden: ' + (e as Error).message, 'error') }
    finally { setOsmBusy(false) }
  }

  // Auswahl in die Strecke übernehmen (ordnen + zusammenfassen).
  const uebernehmen = () => {
    if (selCount === 0) { setMsg('Keine Segmente gewählt.', 'info'); return }
    setSections(candsToSections(cands))
    setMsg(`${selCount} Segmente übernommen → geordnet und zusammengefasst. ` +
      'Herkunft je Feld am Chip (amtlich/OSM); leere Felder bitte ergänzen.', 'ok')
  }

  // Manuelle Änderung eines getrackten Feldes setzt dessen Herkunft auf „manuell".
  const TRACKED: QuelleFeld[] = ['dtv', 'speed', 'ist', 'breite', 'routentyp', 'oevAngebot', 'tram']
  const update = (id: number, patch: Partial<Section>) =>
    setSections(prev => prev.map(s => {
      if (s.id !== id) return s
      const quelle = { ...s.quelle }
      for (const k of TRACKED) if (k in patch) quelle[k] = 'manuell'
      return { ...s, ...patch, quelle }
    }))
  const add = () => setSections(prev => [...prev, defaultSection()])
  const remove = (id: number) => setSections(prev => prev.filter(s => s.id !== id))

  // Eine Note braucht DTV, Tempo, Führungsform und – ausser bei Mischverkehr (keine
  // Breiten-Vorgabe) – die Breite. Sonst keine Bewertung (statt auf erfundenen Werten zu rechnen).
  const sectionComplete = (s: Section) =>
    Number.isFinite(s.dtv) && Number.isFinite(s.speed) && s.ist !== '' &&
    (s.ist === 'Mischverkehr' || Number.isFinite(s.breite))
  // Einzelbewertungen je Abschnitt (null = unvollständig); Strecke = schlechtester Abschnitt.
  const results = sections.map(s => {
    if (!sectionComplete(s)) return null
    // Breite bewerten, sobald eingegeben (Routentyp bestimmt die Vorgabe; Default Velohauptroute).
    const breite = Number.isFinite(s.breite) ? s.breite : undefined
    const routentyp = s.routentyp || 'Velohauptroute'
    const haltestelleBreite = Number.isFinite(s.haltestelleBreite) ? s.haltestelleBreite : undefined
    return fuehrungsformNote(s.dtv, s.speed, s.ist as IstFuehrungsform, breite, routentyp,
      s.parkenRechts, s.oevTakt, s.oevAngebot, s.haltestellentyp, haltestelleBreite, s.tram)
  })
  const offen = results.filter(r => r == null).length
  const alleVollstaendig = offen === 0 && results.length > 0
  // Strecken-Note nur, wenn alle Abschnitte vollständig sind.
  const streckeNote = alleVollstaendig
    ? Math.min(...results.map(r => (r as NotenErgebnis).note))
    : null
  const worstIdx = alleVollstaendig
    ? results.reduce((wi, r, i) =>
        ((r as NotenErgebnis).note < (results[wi] as NotenErgebnis).note ? i : wi), 0)
    : -1
  const sc = streckeNote != null ? noteColor(streckeNote) : { bg: 'var(--text-muted-strong)', fg: '#ffffff' }

  // Karten-Marker je Abschnitt: Nummer am Mittelpunkt des längsten zugehörigen OSM-Segments
  // (liegt auf der Linie). Nur Abschnitte mit OSM-Herkunft (candIds); manuelle ohne Marker.
  const candById = new Map(cands.map(c => [c.id, c]))
  const markers: SectionMarker[] = sections.flatMap((s, i) => {
    const segs = (s.candIds ?? [])
      .map(id => candById.get(id)).filter((c): c is Cand => !!c && c.geom.length >= 2)
    if (segs.length === 0) return []
    const longest = segs.reduce((a, b) => (b.len > a.len ? b : a))
    const mid = longest.geom[Math.floor(longest.geom.length / 2)]
    return [{ num: i + 1, lat: mid.lat, lon: mid.lon }]
  })
  // Cand-IDs des gehoverten Abschnitts → Karten-Highlight.
  const highlightIds = hoverSec != null
    ? new Set(sections.find(s => s.id === hoverSec)?.candIds ?? [])
    : undefined

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', color: 'var(--text-strong)' }}>
      {/* Header (grün); Titel/Logo führen zur Einstiegsseite */}
      <header className="vrc-header">
        <div className="vrc-header-inner">
          <span className="vrc-header-title" onClick={() => go('home')}
                style={{ cursor: view !== 'home' ? 'pointer' : 'default' }}>VeloroutenCheck</span>
          {view === 'rechner' && (
            <button className="vrc-home-btn" onClick={() => go('home')}>← Startseite</button>
          )}
          <nav className="vrc-header-nav">
            <a href="https://github.com/pnfzygrzgf-svg/VeloroutenCheck"
               target="_blank" rel="noopener noreferrer">
              <span className="nav-long">Quellcode: </span>GitHub
            </a>
            <span style={{ opacity: 0.5 }}>·</span>
            <a href="https://creativecommons.org/licenses/by-nc/4.0/deed.de"
               target="_blank" rel="noopener noreferrer">
              <span className="nav-long">Lizenz: </span>CC BY-NC 4.0
            </a>
          </nav>
        </div>
      </header>

      {view === 'home' && <Landing onStart={() => go('rechner')} />}

      {view === 'rechner' && (
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px 16px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <img src={import.meta.env.BASE_URL + 'logo.svg'} alt="" width={40} height={40}
               style={{ flexShrink: 0, cursor: 'pointer' }} onClick={() => go('home')} title="Zur Einstiegsseite" />
          <h1 style={{ fontSize: 22, margin: 0 }}>VeloroutenCheck</h1>
        </div>

      {/* Anzeige-Umschalter: Schulnote (1–6) ↔ vierstufiger Erfüllungsgrad. Rein darstellend. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Anzeige:</span>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {([['note', 'Schulnote'], ['erfuellung', 'Erfüllungsgrad']] as const).map(([m, label]) => (
            <button key={m} onClick={() => setModus(m)}
                    style={{ border: 'none', padding: '6px 12px', fontSize: 13, fontWeight: 600,
                             cursor: 'pointer',
                             background: modus === m ? 'var(--accent)' : '#fff',
                             color: modus === m ? '#fff' : 'var(--text)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Sticky Ergebnis-Leiste: Strecken-Beurteilung jederzeit sichtbar (Punkt 1).
          Klick springt zum massgebenden bzw. ersten unvollständigen Abschnitt. Die volle
          Beurteilung steht weiterhin unten. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 1100, marginBottom: 18 }}>
        <button
          onClick={() => {
            const ziel = streckeNote != null ? worstIdx : results.findIndex(r => r == null)
            if (ziel >= 0) document.getElementById('sec-' + ziel)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          title={streckeNote != null ? 'Zum massgebenden Abschnitt springen'
                                     : 'Zum ersten unvollständigen Abschnitt springen'}
          style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                   background: sc.bg, color: sc.fg, borderRadius: 10, padding: '10px 16px',
                   display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                   boxShadow: '0 2px 10px rgba(0,0,0,0.15)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                         textTransform: 'uppercase', opacity: 0.85 }}>Strecke</span>
          <span style={{ fontSize: modus === 'erfuellung' ? 16 : 24, fontWeight: 800, lineHeight: 1 }}>
            {streckeNote == null ? '–'
              : modus === 'erfuellung' ? erfuellungsgrad(streckeNote) : streckeNote.toFixed(1)}
          </span>
          <span style={{ fontSize: 13, opacity: 0.95 }}>
            {streckeNote != null
              ? `· massgebend: Abschnitt ${worstIdx + 1}`
              : `· unvollständig (${offen} von ${results.length} offen)`}
          </span>
        </button>
      </div>

      {/* Aus OpenStreetMap laden */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
                    background: '#fff', padding: 14, borderRadius: 12, border: '1px solid var(--border-subtle)',
                    marginBottom: 18 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            Strasse aus OpenStreetMap laden (Stadt Bern)
          </span>
          <input value={street} onChange={e => setStreet(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Enter') ladeStrasse() }}
                 placeholder="z. B. Thunstrasse"
                 style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 16 }} />
        </label>
        <button onClick={ladeStrasse} disabled={osmBusy}
                style={{ border: 'none', background: osmBusy ? 'var(--text-faint)' : 'var(--accent)', color: '#fff',
                         borderRadius: 8, padding: '9px 16px', fontSize: 14, fontWeight: 600,
                         cursor: osmBusy ? 'default' : 'pointer' }}>
          {osmBusy ? 'Lädt …' : 'Strasse laden'}
        </button>
        {osmMsg && (() => {
          // Drei klare Zustände: Laden (info, neutral), Erfolg (ok, grün), Fehler (error, rot).
          const kind = osmBusy ? 'info' : osmKind
          const sty = kind === 'error' ? { bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b', icon: '⚠' }
            : kind === 'ok' ? { bg: '#f0fdf4', bd: '#bbf7d0', fg: '#166534', icon: '✓' }
            : { bg: 'var(--bg)', bd: 'var(--border-subtle)', fg: 'var(--text-muted-strong)', icon: osmBusy ? '⏳' : 'ℹ' }
          return (
            <div role="status" aria-live="polite"
                 style={{ flexBasis: '100%', fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start',
                          background: sty.bg, border: `1px solid ${sty.bd}`, color: sty.fg,
                          borderRadius: 8, padding: '8px 12px' }}>
              <span aria-hidden style={{ flexShrink: 0 }}>{sty.icon}</span>
              <span>{osmMsg}</span>
            </div>
          )
        })()}

        {/* Karte: immer sichtbar. Strecke per Klick auf die Karte aufbauen (Segment hinzufügen),
            Linien an-/abwählen, dann übernehmen. „Strasse laden" ist optional. */}
        <div style={{ flexBasis: '100%' }}>
          <div style={{ position: 'relative' }}>
            <VeloMap cands={cands} onToggle={toggleCand} onMapClick={klickHinzufuegen}
                     onReady={m => { mapRef.current = m }}
                     markers={markers} highlightIds={highlightIds} stops={stops} />
            {/* Empty-State als Dismiss-Schicht über der Karte: Die ERSTE Interaktion (Klick/Touch/
                Zoom) schliesst nur den Hinweis — sie wählt noch kein Segment aus und zoomt nicht.
                Die Schicht fängt das Ereignis ab (pointerEvents auto); erst danach ist die Karte frei. */}
            {cands.length === 0 && !osmBusy && !hintDismissed && (
              <div onPointerDown={() => setHintDismissed(true)}
                   onWheel={() => setHintDismissed(true)}
                   style={{ position: 'absolute', inset: 0, zIndex: 500, cursor: 'pointer',
                            display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
                <div style={{ marginTop: 12, maxWidth: 360, width: 'calc(100% - 24px)',
                              pointerEvents: 'none',
                              background: 'rgba(15,23,42,0.88)', color: '#fff', borderRadius: 10,
                              padding: '12px 16px', boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                              fontSize: 13, lineHeight: 1.45, textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                    So baust du eine Strecke auf
                  </div>
                  <div style={{ opacity: 0.9 }}>
                    Auf eine Strasse tippen = nächstgelegenes Segment hinzufügen · Linie antippen =
                    ab-/zuwählen · oder oben einen Strassennamen laden.
                  </div>
                  <div style={{ opacity: 0.7, marginTop: 6, fontSize: 12 }}>
                    Tippen schliesst diesen Hinweis.
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            <button onClick={ladeAusschnitt} disabled={osmBusy}
                    style={{ border: '1px solid var(--border)', background: '#fff', color: 'var(--text)',
                             borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>
              Segmente im Kartenausschnitt laden
            </button>
            <button onClick={uebernehmen} disabled={selCount === 0}
                    style={{ border: 'none', background: selCount ? 'var(--accent)' : 'var(--text-faint)', color: '#fff',
                             borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600,
                             cursor: selCount ? 'pointer' : 'default' }}>
              {selCount} Segmente in Strecke übernehmen
            </button>
            {cands.length > 0 && (
              <button onClick={() => { setCands([]); setStops([]); setMsg('') }}
                      style={{ border: '1px solid var(--border)', background: '#fff', color: 'var(--text-muted)',
                               borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>
                Karte leeren
              </button>
            )}
          </div>
          <ol style={{ fontSize: 12.5, color: 'var(--text-muted-strong)', marginTop: 8, marginBottom: 0,
                       paddingLeft: 20, lineHeight: 1.6 }}>
            <li><strong>Auf die Karte klicken</strong> — fügt das nächstgelegene Segment hinzu.
              (Oder oben einen Strassennamen laden.)</li>
            <li><strong>Linien an-/abwählen</strong> per Klick — grau = nicht in der Strecke.</li>
            <li><strong>Übernehmen</strong> — benachbarte Segmente gleicher Führungsform und
              gleichen Tempos werden zu Abschnitten gruppiert.</li>
          </ol>
          {/* Legende Führungsform */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 6, fontSize: 12 }}>
            {Object.entries(ISTCOLOR).map(([k, col]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-muted-strong)' }}>
                <span style={{ width: 16, height: 4, background: col, borderRadius: 2 }} />{k}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Strecken-Beurteilung (schlechtester Abschnitt) */}
      <div style={{ padding: '20px 22px', borderRadius: 12, background: sc.bg, color: sc.fg,
                    display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', minWidth: modus === 'erfuellung' ? 130 : 90 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase', opacity: 0.85 }}>Strecke</div>
          {modus === 'erfuellung' ? (
            <div style={{ fontSize: streckeNote != null ? 20 : 18, fontWeight: 800, lineHeight: 1.15 }}>
              {streckeNote != null ? erfuellungsgrad(streckeNote) : '–'}
            </div>
          ) : (
            <div style={{ fontSize: streckeNote != null ? 48 : 22, fontWeight: 800, lineHeight: 1.1 }}>
              {streckeNote != null ? streckeNote.toFixed(1) : '–'}
            </div>
          )}
        </div>
        <div style={{ fontSize: 14, opacity: 0.95 }}>
          <div><strong>{sections.length}</strong> {sections.length === 1 ? 'Abschnitt' : 'Abschnitte'}</div>
          {streckeNote != null ? (
            <>
              <div style={{ marginTop: 4 }}>
                {modus === 'erfuellung' ? 'Beurteilung' : 'Note'} = schlechtester Abschnitt{' '}
                (<strong>Abschnitt {worstIdx + 1}</strong>,{' '}
                {modus === 'erfuellung'
                  ? erfuellungsgrad((results[worstIdx] as NotenErgebnis).note).toLowerCase()
                  : `Note ${(results[worstIdx] as NotenErgebnis).note.toFixed(1)}`}).
              </div>
              <div style={{ marginTop: 4, opacity: 0.85, fontSize: 13 }}>
                {modus === 'erfuellung'
                  ? results.map((r, i) => `A${i + 1}: ${erfuellungsgrad((r as NotenErgebnis).note)}`).join(' · ')
                  : 'Einzelnoten: ' + results.map((r, i) => `A${i + 1}: ${(r as NotenErgebnis).note.toFixed(1)}`).join(' · ')}
              </div>
            </>
          ) : (
            <div style={{ marginTop: 4 }}>
              Unvollständig — {offen} von {results.length}{' '}
              {results.length === 1 ? 'Abschnitt braucht' : 'Abschnitten brauchen'} noch Eingaben
              (DTV, Tempo und Führungsform).
            </div>
          )}
        </div>
      </div>

      {/* Abschnitte */}
      <h2 style={{ fontSize: 16, margin: '26px 0 12px' }}>Abschnitte</h2>
      {sections.map((s, i) => (
        <div key={s.id} id={'sec-' + i} style={{ scrollMarginTop: 64 }}>
          <SectionCard
            index={i} section={s} bewertung={results[i]}
            isWorst={i === worstIdx && sections.length > 1} modus={modus}
            onChange={patch => update(s.id, patch)}
            onRemove={() => remove(s.id)}
            canRemove={sections.length > 1}
            onHover={h => setHoverSec(h ? s.id : null)}
          />
        </div>
      ))}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={add}
                style={{ border: '1px dashed var(--text-faint)', background: '#fff', color: 'var(--accent)',
                         borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 600,
                         cursor: 'pointer', flex: 1, minWidth: 200 }}>
          + Abschnitt hinzufügen
        </button>
        <button onClick={() => downloadCsv(buildCsv(sections, results, streckeNote))}
                title="Alle Abschnitte mit Werten, Herkunft und Note als CSV (Excel) herunterladen"
                style={{ border: '1px solid var(--accent)', background: '#fff', color: 'var(--accent)',
                         borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 600,
                         cursor: 'pointer', flex: 1, minWidth: 200 }}>
          ↓ Als CSV exportieren
        </button>
      </div>

      {/* Referenz: Entscheidungstabellen + Hinweise — eingeklappt, um Scroll zu sparen (Punkt 6) */}
      <details style={{ marginTop: 28 }}>
        <summary style={{ cursor: 'pointer', fontSize: 16, fontWeight: 700, color: 'var(--text)',
                          listStyle: 'revert', userSelect: 'none' }}>
          Referenz: Entscheidungstabellen &amp; Hinweise
        </summary>
        <div style={{ marginTop: 12 }}>
      <h2 style={{ fontSize: 16, margin: '8px 0 10px' }}>Entscheidungstabelle (Soll-Führungsform)</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>DTV MIV ↓ \ km/h →</th>
              {SPEED_BANDS.map(s => <th key={s} style={th}>{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {DTV_BANDS.map((dLabel, ri) => (
              <tr key={dLabel}>
                <th style={{ ...th, textAlign: 'left' }}>{dLabel}</th>
                {SPEED_BANDS.map((_, ci) => {
                  const art = fuehrungsart(DTV_REP[ri], SPEED_REP[ci])
                  const col = COLOR[art]
                  return (
                    <td key={ci} style={{ ...td, background: col.bg, color: col.fg }}>{art}</td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Entscheidungstabelle Haltestellen (Soll-Veloverkehrslösung) */}
      <h2 style={{ fontSize: 16, margin: '28px 0 10px' }}>Entscheidungstabelle (Soll-Haltestellenlösung)</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>ÖV-Angebot ↓ \ Routentyp →</th>
              {ROUTE_COLS.map(c => <th key={c.r} style={th}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {OEV_ROWS.map(row => (
              <tr key={row.v}>
                <th style={{ ...th, textAlign: 'left' }}>{row.label}</th>
                {ROUTE_COLS.map(c => {
                  const loesung = haltestellenLoesung(c.r, row.v)
                  if (!loesung) return <td key={c.r} style={td}>—</td>
                  const col = HALT_COLOR[loesung]
                  const stern = loesung === 'Übergang' ? ' *' : ''
                  return (
                    <td key={c.r} style={{ ...td, background: col.bg, color: col.fg }}>{loesung}{stern}</td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-faint)' }}>
        Soll-Veloverkehrslösung an der Haltestelle (Masterplan). <strong>* Übergang</strong>:
        Einzelfallprüfung. Der vorhandene Haltestellentyp wird separat gegen die Soll-Lösung
        geprüft (Abzug nur, wenn «Separate Velofläche» gefordert ist, aber ein Mischverkehr-Typ
        vorliegt).
      </p>
      <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted-strong)' }}>
        <strong>Separate Velofläche</strong> meint: Veloumfahrung · Haltestelle mit rückwärtigem
        Radweg · Inselhaltestelle · Kapüberfahrt.<br />
        <strong>Mischverkehr</strong> meint: Kaphaltestelle ohne Umfahrung · Fahrbahnhaltestelle Bus
        · Busbucht.
      </p>

      <p style={{ marginTop: 24, fontSize: 12, color: 'var(--text-faint)' }}>
        <strong>Zum DTV:</strong> Der amtliche DTV-Wert stammt aus den Flächendeckenden
        Verkehrsdaten (Geoportal Stadt Bern) und wird aus den Tages-/Nachtwerten geschätzt
        (DTV ≈ 16·Nt + 8·Nn). Er gibt nur eine <strong>Grössenordnung</strong> an und ist
        <strong> kein verbindliches Zählresultat</strong>; geführt nur für Strassen mit
        DTV&nbsp;&gt;&nbsp;2&apos;000&nbsp;Mfz/Tag bzw. die Altstadt. Herkunft je Feld am Chip
        (Geoportal/OSM). Herleitung und Quellen: siehe README.
      </p>
        </div>
      </details>

      {/* Fusszeile: Lizenz + Quellcode */}
      <footer style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--border-subtle)',
                       fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        VeloroutenCheck · Code &amp; eigene Inhalte unter{' '}
        <a href="https://creativecommons.org/licenses/by-nc/4.0/deed.de"
           target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          CC BY-NC 4.0
        </a>{' '}
        (eingebundene Daten behalten ihre eigenen Lizenzen) ·{' '}
        <a href="https://github.com/pnfzygrzgf-svg/VeloroutenCheck"
           target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          Quellcode auf GitHub
        </a>
      </footer>
      </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  border: '1px solid var(--border-subtle)', padding: '6px 8px', background: '#f8fafc',
  fontSize: 12, color: 'var(--text-muted-strong)', textAlign: 'center', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  border: '1px solid #ffffff', padding: '8px', textAlign: 'center', whiteSpace: 'nowrap',
}
