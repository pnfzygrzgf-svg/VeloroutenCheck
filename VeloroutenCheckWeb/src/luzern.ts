// ── Öffentliche Geodaten Stadt Luzern (Adapter, analog bern.ts/zurich.ts/basel.ts) ──
//
// Spiegelt die Schnittstellen (enrichCands / loadOev). Erster Schritt, bewusst klein:
//
//   - Routentyp: live aus dem städtischen «Velonetz» (ArcGIS REST, Layer 7, Feld
//     VELO_ROUTENTYP). Das OGD-Feld bildet die kantonale 3-stufige Netzhierarchie ab
//     (Standards Fuss- und Veloverkehr Kanton Luzern, S. 23/58:
//     Velovorzugsrouten > Hauptverbindungen > Basisnetz). Übersetzung in die beiden
//     Masterplan-Routentypen, analog Zürich (oben → Velohaupt, Mitte → Velo, unten → manuell):
//       Velohauptroute  (≈ Velovorzugsroute) → Velohauptroute
//       Hauptroute      (≈ Hauptverbindung)  → Veloroute
//       Nebenroute      (≈ Basisnetz)        → kein Routentyp (manuell)
//       keine Velonetz-Route / unbekannt / leer → kein Routentyp (manuell)
//     Kein verlässlicher Strassen-Join → Zuordnung geometrisch (geo.ts).
//   - Tempo / Ist-Führungsform / Breite: aus OSM (App.tsx).
//   - DTV / Bus-Takt: vorerst manuell. ÖV (Haltestelle) aus OSM — Luzern hat KEIN Tram,
//     nur Bus/Trolleybus → praktisch nur «Haltestelle vorhanden».
//
// Lizenz: Open Government Data Stadt Luzern, Quellenangabe Pflicht. Der ArcGIS-REST-Dienst
// ist CORS-offen und liefert auf Anfrage GeoJSON in WGS84 (Live-Abruf, kein Proxy nötig).

import type { Cand } from './VeloMap'
import type { Routentyp } from './fuehrungsform'
import { densify } from './geo'
import {
  bboxOf, bestOverlapFeature, loadOevFromOsm, nearestDtv, SAMPLE_M,
  type Bbox, type GeoJsonFeature, type DtvStation,
} from './cityShared'

// DTV je Zählstelle live aus der Stadt-Luzern-ArcGIS (OGD/verkehrszaehldaten, Feld `DTV_ANZAHL`).
// CORS-offen (schon fürs Velonetz genutzt). Wenige Punkte → einmal laden und cachen.
let dtvCache: Promise<DtvStation[]> | undefined
function fetchDtvStations(): Promise<DtvStation[]> {
  if (!dtvCache) {
    dtvCache = fetch('https://map.stadtluzern.ch/server/rest/services/OGD/verkehrszaehldaten/MapServer/0/query'
      + '?where=1%3D1&outFields=DTV_ANZAHL&returnGeometry=true&outSR=4326&f=geojson',
      { signal: AbortSignal.timeout(8000) })
      .then(r => (r.ok ? r.json() : { features: [] }))
      .then((d: { features?: { geometry?: { coordinates: [number, number] }; properties?: { DTV_ANZAHL?: number } }[] }) =>
        (d.features ?? []).flatMap(f => {
          const c = f.geometry?.coordinates, dtv = f.properties?.DTV_ANZAHL
          return c && dtv ? [{ lat: c[1], lon: c[0], dtv }] : []
        }))
      .catch(() => [] as DtvStation[])
  }
  return dtvCache
}

// ÖV (Haltestelle) aus OSM + Bus-Takt aus dem gebündelten GTFS-Snapshot (oev_takt.py).
export const loadOev = (cands: Cand[]) => loadOevFromOsm(cands, 'oev_takt_luzern.json')

// ── Routentyp aus dem Velonetz (ArcGIS REST, Layer 7) ─────────────────────────
const VELONETZ_LU = 'https://map.stadtluzern.ch/server/rest/services/OGD/velonetz/MapServer/7/query'

function routentypFrom(v: unknown): Routentyp | undefined {
  if (v === 'Velohauptroute') return 'Velohauptroute'
  if (v === 'Hauptroute') return 'Veloroute'
  return undefined  // Nebenroute / keine Velonetz-Route / unbekannt / null → manuell
}

async function fetchVelonetz(bbox: Bbox): Promise<GeoJsonFeature[]> {
  // ArcGIS-Envelope: xmin,ymin,xmax,ymax = w,s,e,n (wie bern.ts).
  const params = new URLSearchParams({
    geometry: `${bbox.w},${bbox.s},${bbox.e},${bbox.n}`,
    geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'VELO_ROUTENTYP', outSR: '4326', f: 'geojson',
  })
  // Timeout: ein hängender Server darf enrichAll/die UI nicht dauerhaft blockieren.
  const res = await fetch(`${VELONETZ_LU}?${params}`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Velonetz Luzern HTTP ${res.status}`)
  const data: { features?: GeoJsonFeature[] } = await res.json()
  return (data.features || []).filter(f => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString')
}

export async function enrichCands(cands: Cand[]): Promise<Cand[]> {
  if (cands.length === 0) return cands
  const [features, stations] = await Promise.all([
    fetchVelonetz(bboxOf(cands)).catch(() => []),
    fetchDtvStations(),
  ])
  return cands.map(c => {
    const dense = densify(c.geom, SAMPLE_M)
    const f = features.length ? bestOverlapFeature(dense, features) : undefined
    const routentyp = f ? routentypFrom(f.properties.VELO_ROUTENTYP) : undefined
    const dtv = nearestDtv(dense, stations)
    if (!routentyp && dtv == null) return c
    return { ...c, bern: { ...c.bern, ...(routentyp ? { routentyp } : {}), ...(dtv != null ? { dtv } : {}) } }
  })
}
