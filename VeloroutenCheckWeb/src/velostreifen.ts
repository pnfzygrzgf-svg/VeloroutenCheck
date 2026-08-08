// ── Velostreifen-Anreicherung aus einem lokalen Markierungs-Snapshot ─────────
//
// Optionaler, rein LOKALER Snapshot (`public/velostreifen_bern.json`): wo ein
// OSM-Segment auf einem Velostreifen liegt, werden Ist-Führungsform „Radstreifen"
// und die Breite vorbefüllt (Herkunft-Chip „Markierung").
//
// Der Snapshot ist NICHT Teil des öffentlichen Builds (gitignored). Fehlt die
// Datei (z. B. auf der veröffentlichten Seite), liefert das Modul einfach eine
// leere Map — kein Fehler, keine Anreicherung.
//
// Zuordnung wie beim OpenBikeSensor (obs.ts): über GEOMETRIE-Überlappung
// (geo.ts), nicht über IDs; mit Bbox-Vorfilter für die Performance.

import type { Cand } from './VeloMap'
import { densify, overlapScore, bboxOfLL, bboxOverlap, type LL } from './geo'

export interface VeloInfo { breite?: number }   // aus der Markierung gemessene Streifenbreite [m]

const SAMPLE_M = 15      // Verdichtung der OSM-Geometrie
const OVERLAP_M = 20     // Punkt gilt als „auf dem Streifen", wenn ≤ 20 m entfernt
const MIN_FRACTION = 0.5 // ≥ 50 % Überlappung → Zuordnung

interface VeloFeat { line: LL[]; breite?: number }

interface RawFeature {
  geometry?: { type?: string; coordinates?: number[][] }
  properties?: { breite_m?: number | null }
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Einmaliges Laden + Parsen je Datei. Fehlt die Datei → leer (kein Abbruch).
const caches = new Map<string, Promise<VeloFeat[]>>()
function loadVelostreifen(file: string): Promise<VeloFeat[]> {
  let cache = caches.get(file)
  if (!cache) {
    cache = fetch(import.meta.env.BASE_URL + file)
      .then(r => { if (!r.ok) throw new Error('Velostreifen HTTP ' + r.status); return r.json() })
      .then((data: { features?: RawFeature[] }) => (data.features ?? []).flatMap(f => {
        const raw = f.geometry?.type === 'LineString' ? (f.geometry.coordinates ?? []) : []
        const line = raw.map(([lon, lat]) => ({ lat, lon }))
        if (line.length < 2) return []
        const b = f.properties?.breite_m
        return [{ line, breite: typeof b === 'number' ? b : undefined }]
      }))
      .catch(() => { caches.delete(file); return [] as VeloFeat[] })   // fehlt/Netzfehler → leer, nicht eingefroren
    caches.set(file, cache)
  }
  return cache
}

// Kandidaten → Map cand.id → VeloInfo. Jeder Kandidat, der ausreichend mit einer
// Streifen-Linie überlappt, gilt als Radstreifen; Breite = Median der Treffer.
export async function enrichVelostreifen(
  cands: Cand[], file = 'velostreifen_bern.json',
): Promise<Map<number, VeloInfo>> {
  const feats = await loadVelostreifen(file)
  if (cands.length === 0 || feats.length === 0) return new Map()
  // Bbox-Vorfilter (Performance): nur Features im Umgriff der Kandidaten prüfen.
  // Schleife statt Spread: Math.min(...lats) sprengt bei sehr vielen Punkten den Stack.
  let s0 = Infinity, n0 = -Infinity, w0 = Infinity, e0 = -Infinity
  for (const c of cands) for (const p of c.geom) {
    if (p.lat < s0) s0 = p.lat; if (p.lat > n0) n0 = p.lat
    if (p.lon < w0) w0 = p.lon; if (p.lon > e0) e0 = p.lon
  }
  const pad = 0.003
  const s = s0 - pad, n = n0 + pad, w = w0 - pad, e = e0 + pad
  const inBox = feats.filter(f => f.line.some(p => p.lat >= s && p.lat <= n && p.lon >= w && p.lon <= e))
  if (inBox.length === 0) return new Map()
  const boxes = inBox.map(f => ({ f, bbox: bboxOfLL(f.line) }))
  const padDeg = (OVERLAP_M + 5) / 74000

  const out = new Map<number, VeloInfo>()
  for (const c of cands) {
    const dense = densify(c.geom, SAMPLE_M)
    const cbox = bboxOfLL(dense)
    const breiten: number[] = []
    for (const { f, bbox } of boxes) {
      if (!bboxOverlap(cbox, bbox, padDeg)) continue
      if (overlapScore(dense, f.line, OVERLAP_M) >= MIN_FRACTION && f.breite != null) {
        breiten.push(f.breite)
      }
    }
    if (breiten.length) out.set(c.id, { breite: median(breiten) })
  }
  return out
}
