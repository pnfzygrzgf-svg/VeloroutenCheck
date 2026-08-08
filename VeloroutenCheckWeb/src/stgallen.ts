// ── Öffentliche Geodaten Stadt St. Gallen (Adapter, analog zurich.ts/basel.ts) ──
//
// Spiegelt die Schnittstellen (enrichCands / loadOev). Erster Schritt, bewusst klein:
//
//   - Routentyp: live aus dem «Veloplan» (daten.stadt.sg.ch, Opendatasoft). Das Feld
//     `art_text` mischt Routenklasse und Zusatzattribute; nur die Routenklasse zählt:
//       «Hauptroute …»       → Velohauptroute
//       «Sekundäre Route …»  → Veloroute  (das flächige Grundnetz)
//       Einbahn / Steigung / Waldegg-Trail / «velo schieben» → kein Routentyp (manuell)
//     Kein verlässlicher Strassen-Join → Zuordnung geometrisch (geo.ts).
//   - Tempo / Ist-Führungsform: aus OSM. Breite: aus OSM nur bei seltenem
//     cycleway:*:width-Tag → de facto meist manuell.
//   - DTV / Bus-Takt: vorerst manuell. ÖV (Haltestelle) aus OSM — St. Gallen hat KEIN
//     Tram, nur Bus/Trolleybus → praktisch nur «Haltestelle vorhanden».
//
// Lizenz: Open Government Data Stadt St. Gallen, Quellenangabe Pflicht. Die Opendatasoft-
// API ist CORS-offen und liefert GeoJSON in WGS84; per `in_bbox` wird nur der Kartenbereich
// geladen (Live-Abruf, kein Proxy nötig).

import type { Cand } from './VeloMap'
import type { Routentyp } from './fuehrungsform'
import { densify } from './geo'
import {
  bboxOf, bestOverlapValue, loadOevFromOsm, SAMPLE_M,
  type Bbox, type GeoJsonFeature,
} from './cityShared'

// ÖV (Haltestelle) aus OSM — gemeinsamer Helfer (St. Gallen hat kein Tram → nur Haltestelle).
export const loadOev = loadOevFromOsm

// ── Routentyp aus dem Veloplan (Opendatasoft, Feld art_text) ──────────────────
const VELOPLAN = 'https://daten.stadt.sg.ch/api/explore/v2.1/catalog/datasets/veloplan/exports/geojson'

function artToRoutentyp(a: unknown): Routentyp | undefined {
  if (typeof a !== 'string') return undefined
  if (a.startsWith('Hauptroute')) return 'Velohauptroute'
  if (a.startsWith('Sekundäre Route')) return 'Veloroute'
  return undefined  // Einbahn / Steigung / Trail / «velo schieben» → kein Routentyp
}

async function fetchVeloplan(b: Bbox): Promise<GeoJsonFeature[]> {
  // Opendatasoft-Geofilter: in_bbox(feld, latmin, lonmin, latmax, lonmax) → nur Kartenbereich.
  const params = new URLSearchParams({ where: `in_bbox(geo_shape, ${b.s}, ${b.w}, ${b.n}, ${b.e})` })
  // Timeout: ein hängender Server darf enrichAll/die UI nicht dauerhaft blockieren.
  const res = await fetch(`${VELOPLAN}?${params}`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Veloplan St. Gallen HTTP ${res.status}`)
  const data: { features?: GeoJsonFeature[] } = await res.json()
  return (data.features || []).filter(f => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString')
}

export async function enrichCands(cands: Cand[]): Promise<Cand[]> {
  if (cands.length === 0) return cands
  const features = await fetchVeloplan(bboxOf(cands)).catch(() => [])
  if (features.length === 0) return cands
  return cands.map(c => {
    const dense = densify(c.geom, SAMPLE_M)
    // Votum pro WERT statt pro Feature (fein segmentierter Layer, siehe bestOverlapValue).
    const routentyp = bestOverlapValue(dense, features, f => artToRoutentyp(f.properties.art_text))
    if (!routentyp) return c
    return { ...c, bern: { ...c.bern, routentyp } }
  })
}
