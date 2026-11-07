// ── Gebäude im Kanton Luzern: Blockmodelle (Probe seit 07.11.2026) ──
// Die Strassenflächen der Stadt (av.ts) enthalten fast keine Gebäude. Der Kanton veröffentlicht die Umrisse offen mit EGID,
// Gebäudenummer und relativer Höhe. Hier nur als Kartenebene, damit sich die Lage prüfen lässt; keine Wirkung auf die Bewertung.

import { holeJson } from './netz'
import type { P } from './lv95'

export const BLOCKMODELLE_DIENST = 'https://public.geo.lu.ch/ogd/rest/services/managed/GEBHOHEN_DS_V5_MP/MapServer'
/** Annahme: So weit um den Abschnitt lädt die Ebene, damit das Umfeld der Sichtlinien zu sehen ist */
export const BLOCKMODELLE_RAND_M = 120
const SEITE = 2000
const SEITEN_MAX = 10

export interface BlockGebaeude { id: string; ringe: P[][]; nummer: string; hoeheM: number | null }
type Roh = { features?: { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } | null }[]; exceededTransferLimit?: boolean; error?: unknown }

const ring = (xs: unknown): P[] => (Array.isArray(xs)
  ? xs.filter(q => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1])).map(q => [q[0], q[1]] as P) : [])

/** Antwort des Dienstes lesen; je Teilfläche ein Gebäude, Einträge ohne Umriss fallen weg */
export function blockGebaeude(roh: Roh): BlockGebaeude[] {
  return (roh.features ?? []).flatMap(f => {
    const g = f.geometry, p = f.properties ?? {}
    if (!g || !Array.isArray(g.coordinates)) return []
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates as unknown[] : []
    const hoehe = typeof p.REL_GH === 'number' && Number.isFinite(p.REL_GH) ? p.REL_GH : null
    return polys.filter(Array.isArray).map((poly, i) => ({ id: `${String(p.OBJECTID)}:${i}`, ringe: (poly as unknown[]).map(ring), nummer: String(p.GEBNUMMER ?? ''), hoeheM: hoehe }))
      .filter(x => x.ringe[0]?.length)
  })
}

export const blockText = (g: BlockGebaeude): string => ['Gebäude' + (g.nummer ? ` ${g.nummer}` : ''),
  g.hoeheM === null ? '' : `Höhe rund ${g.hoeheM.toFixed(0)} m`, 'Blockmodell Kanton Luzern'].filter(Boolean).join(' · ')

/** Lädt ein Rechteck in LV95 ganz oder gar nicht */
export async function ladeBlockmodelle([a, b, c, d]: readonly [number, number, number, number]): Promise<BlockGebaeude[]> {
  const aus: BlockGebaeude[] = []
  for (let s = 0; s < SEITEN_MAX; s++) {
    const q = new URLSearchParams({ geometry: `${a},${b},${c},${d}`, geometryType: 'esriGeometryEnvelope', inSR: '2056', outSR: '2056',
      spatialRel: 'esriSpatialRelIntersects', outFields: 'OBJECTID,GEBNUMMER,REL_GH', returnGeometry: 'true', f: 'geojson', where: '1=1',
      resultOffset: String(s * SEITE), resultRecordCount: String(SEITE), orderByFields: 'OBJECTID' })
    const j = await holeJson<Roh>(`${BLOCKMODELLE_DIENST}/0/query?${q}`, 30000)
    if (!Array.isArray(j.features) || j.error) throw new Error('Blockmodelle: ungültige Antwort')
    aus.push(...blockGebaeude(j))
    if (j.features.length < SEITE) return aus
  }
  throw new Error('Blockmodelle: zu viele Gebäude im Ausschnitt')
}
