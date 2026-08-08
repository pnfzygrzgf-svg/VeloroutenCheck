// ── Geteilte Helfer für Stadt-Adapter (zurich.ts, basel.ts, …) ────────────────
//
// Bündelt, was mehrere Städte gleich brauchen, damit ein neuer Stadt-Adapter klein
// bleibt: das geometrische Matching gegen ein GeoJSON-Netz (Routentyp) und die
// ÖV-Erkennung (Tram in der Fahrbahn + Haltestelle) aus OSM. bern.ts bleibt davon
// unberührt (Bern bezieht den ÖV aus dem Geoportal).

import type { Cand, Stop } from './VeloMap'
import type { OevInfo } from './bern'
import { densify, overlapScore, majorityLineIndex, majorityValue, distPointToLineM, bboxOfLL, bboxOverlap, type LL, type BboxLL } from './geo'

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

// DTV-Zählstellen (Punkte, {lat,lon,dtv}) → DTV der Strasse: nächste Station auf dem dichten Kandidaten
// (≤ DTV_STOP_M), sonst undefined. Partiell — greift nur, wo eine Zählstelle auf der Strasse liegt.
export interface DtvStation { lat: number; lon: number; dtv: number }
export function nearestDtv(candDense: LL[], stations: DtvStation[]): number | undefined {
  let best: number | undefined, bd = DTV_STOP_M
  for (const s of stations) {
    const d = distPointToLineM(s, candDense)
    if (d <= bd) { bd = d; best = s.dtv }
  }
  return best
}

export function featureLatLon(feature: GeoJsonFeature): LL[] {
  if (!feature.geometry) return []
  const coords = feature.geometry.type === 'LineString'
    ? (feature.geometry.coordinates as number[][])
    : (feature.geometry.coordinates as number[][][]).flat()
  return coords.map(([lon, lat]) => ({ lat, lon }))
}

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

export interface Bbox { s: number; w: number; n: number; e: number }
export function bboxOf(cands: Cand[]): Bbox {
  // Schleife statt Math.min(...pts): der Spread sprengt ab ~100k Argumenten den Stack —
  // ein grosszügiger «Segmente im Ausschnitt»-Load erreicht das locker (07.08.2026).
  let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity
  for (const c of cands) for (const p of c.geom) {
    if (p.lat < s) s = p.lat; if (p.lat > n) n = p.lat
    if (p.lon < w) w = p.lon; if (p.lon > e) e = p.lon
  }
  return { s, n, w, e }
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

async function overpass(query: string): Promise<OsmEl[]> {
  let lastErr: unknown
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(12000) })   // hängenden Mirror nicht ewig abwarten → Failover
      if (!res.ok) { lastErr = new Error('Overpass HTTP ' + res.status); continue }
      const data = await res.json() as { elements?: OsmEl[] }
      return data.elements || []
    } catch (e) { lastErr = e }
  }
  throw lastErr ?? new Error('Overpass nicht erreichbar')
}

// Gebündelte Bus-Takt-Snapshots (public/oev_takt_<stadt>.json = [{lat,lon,n,name}], via oev_takt.py) —
// je Datei einmal laden. busPerH wird der OSM-Haltestelle per nächstem GTFS-Punkt (≤ TAKT_STOP_M) zugeordnet.
interface TaktPoint { lat: number; lon: number; n: number }
const TAKT_STOP_M = 80
const taktCache = new Map<string, Promise<TaktPoint[]>>()
function loadTakt(file: string): Promise<TaktPoint[]> {
  let c = taktCache.get(file)
  if (!c) {
    c = fetch(import.meta.env.BASE_URL + file)
      .then(r => (r.ok ? r.json() : []))
      .catch(() => { taktCache.delete(file); return [] as TaktPoint[] })   // Netzfehler nicht einfrieren
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

// taktFile (optional): gebündelter Bus-Takt-Snapshot der Stadt → setzt oevBus/busPerH je Haltestelle.
export async function loadOevFromOsm(cands: Cand[], taktFile?: string): Promise<{ byId: Map<number, OevInfoOsm>; stops: Stop[] }> {
  if (cands.length === 0) return { byId: new Map(), stops: [] }
  const takt = taktFile ? await loadTakt(taktFile) : []
  const b = bboxOf(cands)
  const bb = `${b.s},${b.w},${b.n},${b.e}`
  const els = await overpass(
    `[out:json][timeout:40];(` +
    `way["railway"="tram"](${bb});` +
    `node["public_transport"="stop_position"](${bb});` +
    `node["railway"="tram_stop"](${bb});` +
    `node["highway"="bus_stop"](${bb});` +
    `);out tags geom;`).catch(() => [] as OsmEl[])

  const tramLines = els
    .filter(e => e.type === 'way' && e.tags?.railway === 'tram' && e.geometry && e.geometry.length >= 2)
    .map(e => e.geometry as LL[])

  // Haltestellen-Punkte (dedupliziert über Position) für die Karten-Marker.
  const seen = new Set<string>()
  const stops: Stop[] = []
  for (const e of els) {
    if (e.type !== 'node' || e.lat == null || e.lon == null) continue
    const t = e.tags || {}
    const isStop = t.public_transport === 'stop_position' || t.railway === 'tram_stop' || t.highway === 'bus_stop'
    if (!isStop) continue
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
  return { byId, stops }
}
