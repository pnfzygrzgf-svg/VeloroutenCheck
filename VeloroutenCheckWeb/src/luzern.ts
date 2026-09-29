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
import { arcgisGeojson } from './netz'
import {
  bboxOf, bestOverlapValue, istLinie, loadOevFromOsm, nearestDtv, versuch, SAMPLE_M,
  type Anreicherung, type Bbox, type GeoJsonFeature, type DtvStation,
} from './cityShared'

// DTV je Zählstelle live aus der Stadt-Luzern-ArcGIS (OGD/verkehrszaehldaten, Feld `DTV_ANZAHL`).
// CORS-offen (schon fürs Velonetz genutzt). Wenige Punkte → einmal laden und cachen.
let dtvCache: Promise<DtvStation[]> | undefined
function fetchDtvStations(): Promise<DtvStation[]> {
  if (!dtvCache) {
    type Zaehlstelle = { geometry?: { coordinates: [number, number] }; properties?: { DTV_ANZAHL?: number | null } }
    dtvCache = arcgisGeojson<Zaehlstelle>(
      'https://map.stadtluzern.ch/server/rest/services/OGD/verkehrszaehldaten/MapServer/0/query',
      { where: '1=1', outFields: 'DTV_ANZAHL', returnGeometry: 'true', outSR: '4326' }, 8000)
      .then(features => features.flatMap(f => {
        const c = f.geometry?.coordinates, dtv = f.properties?.DTV_ANZAHL
        return c && typeof dtv === 'number' ? [{ lat: c[1], lon: c[0], dtv }] : []
      }))
    dtvCache.catch(() => { dtvCache = undefined })   // Fehlschlag (auch HTTP-/ArcGIS-Fehler) nicht einfrieren
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
  // ArcGIS-Envelope: xmin,ymin,xmax,ymax = w,s,e,n (wie bern.ts). Der Server kappt bei 2'000
  // Features (das Velonetz hat 4'562) — arcgisGeojson lädt die fehlenden Seiten nach.
  const features = await arcgisGeojson<GeoJsonFeature>(VELONETZ_LU, {
    geometry: `${bbox.w},${bbox.s},${bbox.e},${bbox.n}`,
    geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'VELO_ROUTENTYP', outSR: '4326',
  })
  return features.filter(istLinie)
}

export async function enrichCands(cands: Cand[]): Promise<Anreicherung> {
  const fehler: string[] = []
  if (cands.length === 0) return { cands, fehler }
  const [features, stations] = await Promise.all([
    versuch('Velonetz (Routentyp)', fetchVelonetz(bboxOf(cands)), [], fehler),
    versuch('Verkehrszähldaten (DTV)', fetchDtvStations(), [], fehler),
  ])
  return { fehler, cands: cands.map(c => {
    const dense = densify(c.geom, SAMPLE_M)
    // Votum pro WERT statt pro Feature (fein segmentierter Layer, siehe bestOverlapValue).
    const routentyp = features.length
      ? bestOverlapValue(dense, features, f => routentypFrom(f.properties.VELO_ROUTENTYP))
      : undefined
    const dtv = nearestDtv(dense, stations)
    if (!routentyp && dtv == null) return c
    return { ...c, bern: { ...c.bern, ...(routentyp ? { routentyp } : {}), ...(dtv != null ? { dtv } : {}) } }
  }) }
}
