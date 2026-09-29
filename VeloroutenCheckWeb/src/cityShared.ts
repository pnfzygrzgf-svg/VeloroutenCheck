// ── Geteilte Helfer für Stadt-Adapter (zurich.ts, basel.ts, …) ────────────────
//
// Bündelt, was mehrere Städte gleich brauchen, damit ein neuer Stadt-Adapter klein
// bleibt: das geometrische Matching gegen ein GeoJSON-Netz (Routentyp) und die
// ÖV-Erkennung (Tram in der Fahrbahn + Haltestelle) aus OSM. Das geometrische Matching
// nutzt auch bern.ts; nur den ÖV bezieht Bern aus dem Geoportal statt aus OSM.

import type { Cand, Stop } from './VeloMap'
import type { OevInfo } from './bern'
import {
  densify, overlapScore, majorityLineIndex, majorityValue, distPointToLineM, fussAufLinie,
  bboxOfLL, bboxOverlap, padBbox, mehrteilig, type LL, type BboxLL,
} from './geo'
import { holeJson } from './netz'

// ── Geo-Matching gegen ein GeoJSON-Liniennetz ─────────────────────────────────
export interface GeoJsonFeature {
  geometry: { type: string; coordinates: number[] | number[][] | number[][][] } | null
  properties: Record<string, string | number | null>
}

export const SAMPLE_M = 15      // Schrittweite zum Verdichten der Kandidaten-Geometrie.
export const OVERLAP_M = 20     // Punkt gilt als „auf dem Feature", wenn ≤ 20 m entfernt.
export const MIN_FRACTION = 0.5 // ≥ 50 % der Punkte entlang → Treffer.
export const STOP_DIST_M = 30   // Haltestelle gilt als „im Abschnitt", wenn ≤ 30 m vom Segment.
export const DTV_STOP_M = 25    // DTV-Zählstelle gilt als „auf der Strasse", wenn ≤ 25 m vom Segment.

export const DTV_ACHS_M = 10    // … nahe dem Segment-ENDE aber nur, wenn sie ≤ 10 m entfernt (also auf der Achse) liegt.
export const BBOX_PAD_M = 50    // Puffer der Bbox-Abfragen — muss grösser sein als jede Matching-Toleranz oben.

// DTV-Zählstellen (Punkte, {lat,lon,dtv}) → DTV der Strasse: nächste Station auf dem dichten Kandidaten
// (≤ DTV_STOP_M), sonst undefined. Partiell — greift nur, wo eine Zählstelle auf der Strasse liegt.
//
// «Auf der Strasse» heisst seit dem 29.09.2026: der Fusspunkt liegt mehr als DTV_STOP_M vom
// Segment-Ende entfernt, oder die Station sitzt praktisch auf der Achse (≤ DTV_ACHS_M). Vorher
// zählte allein die Distanz — eine Nebenstrasse, die 17 m neben der Zählstelle in die
// Hauptstrasse mündet, erbte deren DTV (sie kommt der Station nur an ihrem ENDE nahe, an der
// Einmündung). Die Regel ist bewusst streng: lieber kein DTV (Eingabe von Hand) als der
// falsche mit dem Chip «amtlich».
// Stationen mit DTV ≤ 0 sind defekte Zähler (z. B. Basel «660 Flughafenstrasse»), kein Messwert.
export interface DtvStation { lat: number; lon: number; dtv: number }
export function nearestDtv(candDense: LL[], stations: DtvStation[]): number | undefined {
  let best: number | undefined, bd = DTV_STOP_M
  for (const s of stations) {
    if (!(s.dtv > 0)) continue
    const { distM, endeM } = fussAufLinie(s, candDense)
    if (distM > bd) continue
    if (endeM <= DTV_STOP_M && distM > DTV_ACHS_M) continue
    bd = distM; best = s.dtv
  }
  return best
}

// GeoJSON-Geometrie → Punktfolge. Mehrteilige Linien (MultiLineString) behalten ihre Lücken
// (Lücken-Marke, siehe geo.ts) statt zu einer Linie mit Phantomkanten zu verschmelzen.
// Andere Geometrietypen (Point, Polygon …) und fehlende Geometrie → leer.
export function featureLatLon(feature: GeoJsonFeature): LL[] {
  const g = feature.geometry
  if (!g || !Array.isArray(g.coordinates)) return []
  const ll = (c: number[][]): LL[] => c.map(([lon, lat]) => ({ lat, lon }))
  if (g.type === 'LineString') return ll(g.coordinates as number[][])
  if (g.type === 'MultiLineString') return mehrteilig((g.coordinates as number[][][]).map(ll))
  return []
}
// Nur Linien-Features (ein Punkt- oder Flächen-Feature hat im Linien-Matching nichts verloren).
export const istLinie = (f: GeoJsonFeature): boolean =>
  f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString'

// Feature-Geometrie + Bbox EINMAL je Layer vorberechnen (nicht pro Kandidat neu). Der Cache ist
// per Array-Referenz (WeakMap): innerhalb eines enrichCands-Laufs wird dasselbe features-Array für
// alle Kandidaten übergeben → einmal aufbereitet; alte Layer werden mit dem Array GC-frei.
interface PreparedFeature { f: GeoJsonFeature; ll: LL[]; bbox: BboxLL }
const preparedCache = new WeakMap<GeoJsonFeature[], PreparedFeature[]>()
function prepareFeatures(features: GeoJsonFeature[]): PreparedFeature[] {
  let p = preparedCache.get(features)
  if (!p) {
    p = features.map(f => { const ll = featureLatLon(f); return { f, ll, bbox: bboxOfLL(ll) } })
    preparedCache.set(features, p)
  }
  return p
}

// Feature per Mehrheits-Zuordnung (majorityLineIndex, geo.ts): gewinnt, wer den grössten Teil des
// Abschnitts lokal parallel abdeckt (≥ minFraction, sonst undefined) — gerichtet statt symmetrisch,
// damit eine kurze Fremdlinie einer Nachbarstrasse nicht aufsitzt. Billiger Bbox-Vorfilter davor →
// Matching ~linear statt O(Kandidaten × Features × Punkte²). Ergebnis identisch (verworfene Paare
// überlappen räumlich nicht → keine Stimmen).
export function bestOverlapFeature(
  candGeom: LL[], features: GeoJsonFeature[], maxDistM = OVERLAP_M, minFraction = MIN_FRACTION,
): GeoJsonFeature | undefined {
  const prepared = prepareFeatures(features)
  const candBbox = bboxOfLL(candGeom)
  // Puffer in Grad, konservativ: ÷74000 deckt maxDistM in BEIDEN Richtungen (Längengrad ist bei ~47°
  // kürzer, ~111000·cos → nie fälschlich verwerfen; Breite wird leicht überpuffert = harmlos).
  const padDeg = (maxDistM + 5) / 74000
  const nearby = prepared.filter(pf => pf.ll.length >= 2 && bboxOverlap(candBbox, pf.bbox, padDeg))
  const i = majorityLineIndex(candGeom, nearby.map(pf => pf.ll), maxDistM, minFraction)
  return i >= 0 ? nearby[i].f : undefined
}

// Mehrheits-Zuordnung pro WERT statt pro Feature (majorityValue, geo.ts): die Geoportal-Layer
// sind je Achsenabschnitt segmentiert und damit feiner als die OSM-Wege — pro Feature gezählt
// erreicht dann KEINES die 50 %, obwohl der Abschnitt zu 100 % von Features desselben Werts
// abgedeckt ist (der Bern-Adapter nutzt das Muster seit je; die übrigen Städte zählten bis zum
// 07.08.2026 pro Feature und verloren an fein segmentierten Layern Routentyp/Strassentyp).
export function bestOverlapValue<T>(
  candGeom: LL[], features: GeoJsonFeature[], value: (f: GeoJsonFeature) => T | null | undefined,
  maxDistM = OVERLAP_M, minFraction = MIN_FRACTION,
): T | undefined {
  const prepared = prepareFeatures(features)
  const candBbox = bboxOfLL(candGeom)
  const padDeg = (maxDistM + 5) / 74000
  const nearby = prepared.filter(pf => pf.ll.length >= 2 && bboxOverlap(candBbox, pf.bbox, padDeg))
  return majorityValue(candGeom, nearby.map(pf => pf.ll), nearby.map(pf => value(pf.f)), maxDistM, minFraction)
}

// Abfrage-Bbox der Kandidaten, um BBOX_PAD_M erweitert. Ohne Puffer (bis 29.09.2026) war die
// Abfrage enger als das Matching: gematcht wird mit 20–30 m Toleranz, gefragt wurde nach der
// nackten Hülle der Linie. Bei einem einzelnen, geraden 60-m-Segment lag eine Haltestelle 8 m
// neben der Achse in jedem zweiten Fall ausserhalb — und eine um 3 m versetzte amtliche Achse
// schnitt die Hülle gar nicht erst (kein Tempo/DTV/Routentyp, in Bern «DTV ≤ 2000 angenommen»).
// ── Ausfälle sichtbar machen ──────────────────────────────────────────────────
// Jede Quelle darf einzeln ausfallen, ohne den Import zu verhindern — aber nicht mehr STILL
// (29.09.2026): ein Abschnitt ohne Tempo/Routentyp/ÖV sah vorher gleich aus, ob der Dienst
// nichts dazu weiss oder gar nicht geantwortet hat. `versuch` fängt den Fehler, liefert den
// Leerwert und notiert den Namen der Quelle; App.tsx zeigt die Liste in der Statusmeldung.
export async function versuch<T>(name: string, p: Promise<T>, leer: T, fehler: string[]): Promise<T> {
  try { return await p } catch { fehler.push(name); return leer }
}
export interface Anreicherung { cands: Cand[]; fehler: string[] }

export interface Bbox { s: number; w: number; n: number; e: number }
export function bboxOf(cands: Cand[], padM = BBOX_PAD_M): Bbox {
  // Schleife statt Math.min(...pts): der Spread sprengt ab ~100k Argumenten den Stack —
  // ein grosszügiger «Segmente im Ausschnitt»-Load erreicht das locker (07.08.2026).
  let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity
  for (const c of cands) for (const p of c.geom) {
    if (p.lat < s) s = p.lat; if (p.lat > n) n = p.lat
    if (p.lon < w) w = p.lon; if (p.lon > e) e = p.lon
  }
  return padBbox({ s, n, w, e }, padM)
}

// ── ÖV aus OSM: Tram in der Fahrbahn (railway=tram) + Haltestelle im Abschnitt ──
// Für Städte ohne (genutzte) Geoportal-ÖV-Quelle. Herkunft daher `osm` (oevQuelle).
export type OevInfoOsm = OevInfo & { oevQuelle?: 'amtlich' | 'osm' }

const OVERPASS = [
  'https://overpass.osm.ch/api/interpreter',        // Schweizer Mirror (SOSM) — schnell/zuverlässig für CH
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

interface OsmEl {
  type: string; id: number
  lat?: number; lon?: number                 // node
  geometry?: { lat: number; lon: number }[]  // way (out geom)
  tags?: Record<string, string>
}

// Overpass liefert auch ein ABGEBROCHENES Ergebnis mit HTTP 200: Zeitüberschreitung oder
// Speichergrenze stehen dann als `remark` in der Antwort, `elements` ist leer oder unvollständig.
// Das ist ein Fehler, kein «hier gibt es nichts» → nächster Mirror.
export function overpassAbgebrochen(data: { remark?: unknown }): boolean {
  return typeof data.remark === 'string' && /runtime error|timed out|out of memory/i.test(data.remark)
}

async function overpass(query: string): Promise<OsmEl[]> {
  let lastErr: unknown
  for (const url of OVERPASS) {
    try {
      // hängenden Mirror nicht ewig abwarten → Failover
      const data = await holeJson<{ elements?: OsmEl[]; remark?: string }>(url, 12000, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      })
      if (overpassAbgebrochen(data)) { lastErr = new Error('Overpass: ' + data.remark); continue }
      return data.elements || []
    } catch (e) { lastErr = e }
  }
  throw lastErr ?? new Error('Overpass nicht erreichbar')
}

// Gebündelte Bus-Takt-Snapshots (public/oev_takt_<stadt>.json = [{lat,lon,n,name}], via oev_takt.py) —
// je Datei einmal laden. busPerH wird der OSM-Haltestelle per nächstem GTFS-Punkt (≤ TAKT_STOP_M) zugeordnet.
// Seit 29.09.2026 enthält die Datei EINEN PUNKT JE BUS-HALTEKANTE (vorher je Haltestelle nur die
// Stationsmitte, an grossen Knoten bis 200 m von der Buskante entfernt).
interface TaktPoint { lat: number; lon: number; n: number }
const TAKT_STOP_M = 80
const taktCache = new Map<string, Promise<TaktPoint[]>>()
function loadTakt(file: string): Promise<TaktPoint[]> {
  let c = taktCache.get(file)
  if (!c) {
    c = holeJson<TaktPoint[]>(import.meta.env.BASE_URL + file, 15000)
      .catch(() => { taktCache.delete(file); return [] as TaktPoint[] })   // Fehlschlag nicht einfrieren
    taktCache.set(file, c)
  }
  return c
}
function nearestTaktBus(stop: LL, takt: TaktPoint[]): number | undefined {
  let best: number | undefined, bd = TAKT_STOP_M
  for (const t of takt) {
    const dlat = (t.lat - stop.lat) * 111320
    const dlon = (t.lon - stop.lon) * 111320 * Math.cos(stop.lat * Math.PI / 180)
    const d = Math.hypot(dlat, dlon)
    if (d <= bd) { bd = d; best = t.n }
  }
  return best
}

// Halt eines Verkehrsmittels AUF DER STRASSE (Bus, Trolleybus, Tram)? Nur solche Halte betreffen
// die Veloführung. Bis zum 29.09.2026 zählte jede `public_transport=stop_position` — auch Bahn-,
// Seilbahn- und Schiffshalte: ein Abschnitt entlang der Gleise am Bahnhof oder am Seeufer bekam
// «Haltestelle im Abschnitt», obwohl dort kein Bus hält.
export function istStrassenHalt(t: Record<string, string>): boolean {
  if (t.highway === 'bus_stop' || t.railway === 'tram_stop') return true
  return t.public_transport === 'stop_position' &&
    (t.bus === 'yes' || t.trolleybus === 'yes' || t.tram === 'yes')
}

// taktFile (optional): gebündelter Bus-Takt-Snapshot der Stadt → setzt oevBus/busPerH je Haltestelle.
export async function loadOevFromOsm(cands: Cand[], taktFile?: string): Promise<{ byId: Map<number, OevInfoOsm>; stops: Stop[]; fehler: string[] }> {
  const fehler: string[] = []
  if (cands.length === 0) return { byId: new Map(), stops: [], fehler }
  const takt = taktFile ? await loadTakt(taktFile) : []
  const b = bboxOf(cands)
  const bb = `${b.s},${b.w},${b.n},${b.e}`
  const els = await versuch('ÖV-Haltestellen und Tram (OpenStreetMap)', overpass(
    `[out:json][timeout:40];(` +
    `way["railway"="tram"](${bb});` +
    `node["public_transport"="stop_position"]["bus"="yes"](${bb});` +
    `node["public_transport"="stop_position"]["trolleybus"="yes"](${bb});` +
    `node["public_transport"="stop_position"]["tram"="yes"](${bb});` +
    `node["railway"="tram_stop"](${bb});` +
    `node["highway"="bus_stop"](${bb});` +
    `);out tags geom;`), [] as OsmEl[], fehler)

  const tramLines = els
    .filter(e => e.type === 'way' && e.tags?.railway === 'tram' && e.geometry && e.geometry.length >= 2)
    .map(e => e.geometry as LL[])

  // Haltestellen-Punkte (dedupliziert über Position) für die Karten-Marker.
  const seen = new Set<string>()
  const stops: Stop[] = []
  for (const e of els) {
    if (e.type !== 'node' || e.lat == null || e.lon == null) continue
    const t = e.tags || {}
    if (!istStrassenHalt(t)) continue
    const key = `${e.lat.toFixed(5)}|${e.lon.toFixed(5)}`
    if (seen.has(key)) continue
    seen.add(key)
    stops.push({ lat: e.lat, lon: e.lon, name: t.name || 'Haltestelle' })
  }

  const byId = new Map<number, OevInfoOsm>()
  for (const c of cands) {
    const dense = densify(c.geom, SAMPLE_M)
    // NÄCHSTE Haltestelle, nicht die erste der Serverliste (07.08.2026): der frühere `break`
    // beim ersten Treffer ≤ STOP_DIST_M liess die Antwort-Reihenfolge entscheiden — eine
    // Bus-Kante in 28 m konnte die Tram-Kante in 5 m verdrängen (ÖV-Angebot „Bus" statt
    // „Tram" → bis 1,0 Notenstufe über die Haltestellen-Lösung).
    let nearStop: Stop | undefined
    let nearD = STOP_DIST_M
    for (const st of stops) {
      const d = distPointToLineM(st, dense)
      if (d <= nearD) { nearD = d; nearStop = st }
    }
    const oevTram = tramLines.some(l => overlapScore(dense, l, OVERLAP_M) >= MIN_FRACTION)
    if (nearStop || oevTram) {
      const busPerH = nearStop ? nearestTaktBus(nearStop, takt) : undefined   // aus dem Takt-Snapshot (falls Datei da)
      byId.set(c.id, {
        oevHalt: !!nearStop, oevHaltName: nearStop?.name,
        oevTram, oevBus: busPerH != null, busPerH,
        oevQuelle: 'osm',
      })
    }
  }
  return { byId, stops, fehler }
}
