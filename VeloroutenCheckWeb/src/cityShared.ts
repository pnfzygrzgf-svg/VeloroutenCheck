// ── Geteilte Helfer für Stadt-Adapter (zurich.ts, basel.ts, …) ────────────────
//
// Bündelt, was mehrere Städte gleich brauchen, damit ein neuer Stadt-Adapter klein
// bleibt: das geometrische Matching gegen ein GeoJSON-Netz (Routentyp) und die
// ÖV-Erkennung (Tram in der Fahrbahn + Haltestelle) aus OSM. bern.ts bleibt davon
// unberührt (Bern bezieht den ÖV aus dem Geoportal).

import type { Cand, Stop } from './VeloMap'
import type { OevInfo } from './bern'
import { densify, overlapScore, distPointToLineM, type LL } from './geo'

// ── Geo-Matching gegen ein GeoJSON-Liniennetz ─────────────────────────────────
export interface GeoJsonFeature {
  geometry: { type: string; coordinates: number[] | number[][] | number[][][] } | null
  properties: Record<string, string | number | null>
}

export const SAMPLE_M = 15      // Schrittweite zum Verdichten der Kandidaten-Geometrie.
export const OVERLAP_M = 20     // Punkt gilt als „auf dem Feature", wenn ≤ 20 m entfernt.
export const MIN_FRACTION = 0.5 // ≥ 50 % der Punkte entlang → Treffer.
export const STOP_DIST_M = 30   // Haltestelle gilt als „im Abschnitt", wenn ≤ 30 m vom Segment.

export function featureLatLon(feature: GeoJsonFeature): LL[] {
  if (!feature.geometry) return []
  const coords = feature.geometry.type === 'LineString'
    ? (feature.geometry.coordinates as number[][])
    : (feature.geometry.coordinates as number[][][]).flat()
  return coords.map(([lon, lat]) => ({ lat, lon }))
}

// Feature mit dem grössten Überlappungs-Score; nur ab minFraction (sonst undefined →
// kein Treffer, statt einer bloss kreuzenden Strasse aufzusitzen).
export function bestOverlapFeature(
  candGeom: LL[], features: GeoJsonFeature[], maxDistM = OVERLAP_M, minFraction = MIN_FRACTION,
): GeoJsonFeature | undefined {
  let best: GeoJsonFeature | undefined, bf = 0
  for (const f of features) {
    const o = overlapScore(candGeom, featureLatLon(f), maxDistM)
    if (o > bf) { bf = o; best = f }
  }
  return bf >= minFraction ? best : undefined
}

export interface Bbox { s: number; w: number; n: number; e: number }
export function bboxOf(cands: Cand[]): Bbox {
  const pts = cands.flatMap(c => c.geom)
  return {
    s: Math.min(...pts.map(p => p.lat)), n: Math.max(...pts.map(p => p.lat)),
    w: Math.min(...pts.map(p => p.lon)), e: Math.max(...pts.map(p => p.lon)),
  }
}

// ── ÖV aus OSM: Tram in der Fahrbahn (railway=tram) + Haltestelle im Abschnitt ──
// Für Städte ohne (genutzte) Geoportal-ÖV-Quelle. Herkunft daher `osm` (oevQuelle).
export type OevInfoOsm = OevInfo & { oevQuelle?: 'amtlich' | 'osm' }

const OVERPASS = [
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
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query) })
      if (!res.ok) { lastErr = new Error('Overpass HTTP ' + res.status); continue }
      const data = await res.json() as { elements?: OsmEl[] }
      return data.elements || []
    } catch (e) { lastErr = e }
  }
  throw lastErr ?? new Error('Overpass nicht erreichbar')
}

export async function loadOevFromOsm(cands: Cand[]): Promise<{ byId: Map<number, OevInfoOsm>; stops: Stop[] }> {
  if (cands.length === 0) return { byId: new Map(), stops: [] }
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
    let nearStop: Stop | undefined
    for (const st of stops) if (distPointToLineM(st, dense) <= STOP_DIST_M) { nearStop = st; break }
    const oevTram = tramLines.some(l => overlapScore(dense, l, OVERLAP_M) >= MIN_FRACTION)
    if (nearStop || oevTram) {
      byId.set(c.id, {
        oevHalt: !!nearStop, oevHaltName: nearStop?.name,
        oevTram, oevBus: false,            // Bus-Takt aus OSM nicht ableitbar → manuell
        oevQuelle: 'osm',
      })
    }
  }
  return { byId, stops }
}
