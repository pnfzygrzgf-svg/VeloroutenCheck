// ── OpenBikeSensor: gemessene Überholabstände je Strassen-Segment ────────────
//
// Quelle: Export aus dem OpenBikeSensor-Portal (portal.openbikesensor.org),
// gebündelt als statisches Asset `public/obs_bern.json` (GeoJSON, ganz Bern).
// Bewusst gebündelter Snapshot statt Live-Bezug: das Portal ist nicht CORS-offen
// und die Live-API ist nicht mit den Kartendaten synchron. Aktualisierung durch
// Ersetzen der Datei. Attribution: OpenBikeSensor-Mitwirkende.
//
// Matching über GEOMETRIE (nicht über way_id): OBS nutzt einen eigenen OSM-Schnappschuss
// und teilt lange Strassen in feinere Mess-Abschnitte; OSM-Ways werden zudem laufend
// geteilt/neu nummeriert. Ein reiner way_id-Join verfehlt darum Teilstücke. Stattdessen
// wird jedes OBS-Teilstück per Überlappung dem am besten passenden OSM-Segment zugeordnet
// (geo.ts) — und alle Teilstücke eines OSM-Segments zusammengeführt.
//
// Die Werte sind reiner Zusatz-Kontext (empirische Messung) und fliessen NICHT in
// die Führungsform-Note ein (die folgt dem Masterplan).

import type { Cand } from './VeloMap'
import { densify, overlapScore, type LL } from './geo'

// Aggregierte Überhol-Statistik eines Segments.
export interface ObsStats {
  median: number    // Median-Überholabstand [m] (NaN, wenn keine Überholmessung)
  mean: number      // Mittelwert [m]
  count: number     // Anzahl Überholvorgänge
  below150: number  // davon unter 1,5 m (gesetzlicher Mindestabstand innerorts)
  usage: number     // Anzahl Befahrungen (auch ohne Überholung) → „befahren, aber nicht überholt"
}

// Ein OBS-Teilstück mit Geometrie + Rohwerten.
interface ObsFeat { line: LL[]; arr: number[]; count: number; below150: number; usage: number }

const SAMPLE_M = 15      // Verdichtung der OSM-Geometrie
const OVERLAP_M = 20     // Punkt gilt als „auf dem Segment", wenn ≤ 20 m entfernt
const MIN_FRACTION = 0.5 // ≥ 50 % Überlappung → Zuordnung

function median(values: number[]): number {
  if (values.length === 0) return NaN
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

interface RawFeature {
  geometry?: { type?: string; coordinates?: number[][] | number[][][] }
  properties: {
    way_id: number
    distance_overtaker_array?: number[] | null
    overtaking_event_count?: number | null
    overtaking_events_below_150?: number | null
    usage_count?: number | null
  }
}

// Einmaliges Laden + Parsen der OBS-Teilstücke (Geometrie als [{lat,lon}]) je Snapshot-Datei.
// Pro Stadt eine eigene Datei (obs_bern.json, obs_zurich.json …) → Cache pro Dateiname.
const caches = new Map<string, Promise<ObsFeat[]>>()
function loadObs(file: string): Promise<ObsFeat[]> {
  let cache = caches.get(file)
  if (!cache) {
    cache = fetch(import.meta.env.BASE_URL + file)
      .then(r => { if (!r.ok) throw new Error('OBS HTTP ' + r.status); return r.json() })
      .then((data: { features?: RawFeature[] }) => (data.features ?? []).map(f => {
        const p = f.properties
        const raw = f.geometry?.type === 'LineString'
          ? (f.geometry.coordinates as number[][])
          : ((f.geometry?.coordinates as number[][][] | undefined) ?? []).flat()
        return {
          line: raw.map(([lon, lat]) => ({ lat, lon })),
          arr: Array.isArray(p.distance_overtaker_array) ? p.distance_overtaker_array : [],
          count: p.overtaking_event_count ?? 0,
          below150: p.overtaking_events_below_150 ?? 0,
          usage: p.usage_count ?? 0,
        }
      }).filter(f => f.line.length >= 2))
      .catch(() => [])     // Snapshot fehlt → leer, kein Abbruch
    caches.set(file, cache)
  }
  return cache
}

// Kandidaten → Map cand.id → ObsStats. Jedes OBS-Teilstück wird per Überlappung dem
// am besten passenden OSM-Segment zugeordnet (genau einem → kein Doppelzählen) und die
// Teilstücke je Segment zusammengeführt. Befahrungen ohne Überholung zählen zu `usage`.
export async function enrichObs(cands: Cand[], file = 'obs_bern.json'): Promise<Map<number, ObsStats>> {
  const feats = await loadObs(file)
  if (cands.length === 0 || feats.length === 0) return new Map()
  // Bbox-Vorfilter (Performance).
  const lats = cands.flatMap(c => c.geom.map(p => p.lat))
  const lons = cands.flatMap(c => c.geom.map(p => p.lon))
  const pad = 0.003
  const s = Math.min(...lats) - pad, n = Math.max(...lats) + pad
  const w = Math.min(...lons) - pad, e = Math.max(...lons) + pad
  const inBox = feats.filter(f => f.line.some(p => p.lat >= s && p.lat <= n && p.lon >= w && p.lon <= e))
  const dense = cands.map(c => ({ id: c.id, geom: densify(c.geom, SAMPLE_M) }))

  const acc = new Map<number, { vals: number[]; count: number; below: number; usage: number }>()
  for (const f of inBox) {
    let bestId: number | undefined, bestScore = 0
    for (const c of dense) {
      const sc = overlapScore(c.geom, f.line, OVERLAP_M)
      if (sc > bestScore) { bestScore = sc; bestId = c.id }
    }
    if (bestId == null || bestScore < MIN_FRACTION) continue
    const a = acc.get(bestId) ?? { vals: [], count: 0, below: 0, usage: 0 }
    a.usage += f.usage
    if (f.count > 0) { a.vals.push(...f.arr); a.count += f.count; a.below += f.below150 }
    acc.set(bestId, a)
  }

  const out = new Map<number, ObsStats>()
  for (const [id, a] of acc) {
    if (a.count === 0 && a.usage === 0) continue
    const mean = a.vals.length ? a.vals.reduce((sum, x) => sum + x, 0) / a.vals.length : NaN
    out.set(id, { median: median(a.vals), mean, count: a.count, below150: a.below, usage: a.usage })
  }
  return out
}

// OBS-Werte mehrerer Segmente eines Abschnitts zusammenführen (jedes Teilstück ist genau
// einem Segment zugeordnet → einfaches Summieren, kein Doppelzählen). `usage` immer dabei,
// damit auch „befahren, aber nicht überholt" sichtbar bleibt.
export function mergeObs(parts: (ObsStats | undefined)[]): ObsStats | undefined {
  const xs = parts.filter((s): s is ObsStats => !!s && (s.count > 0 || s.usage > 0))
  if (xs.length === 0) return undefined
  const usage = xs.reduce((s, x) => s + x.usage, 0)
  const wc = xs.filter(x => x.count > 0)
  const count = wc.reduce((s, x) => s + x.count, 0)
  const below150 = wc.reduce((s, x) => s + x.below150, 0)
  // Median/Mean liegen nur aggregiert vor → nach count gewichtet mitteln (Näherung).
  const median = count ? wc.reduce((s, x) => s + x.median * x.count, 0) / count : NaN
  const mean = count ? wc.reduce((s, x) => s + x.mean * x.count, 0) / count : NaN
  return { median, mean, count, below150, usage }
}
