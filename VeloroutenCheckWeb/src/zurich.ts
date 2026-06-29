// ── Amtliche/öffentliche Daten Stadt Zürich (Adapter, analog bern.ts) ─────────
//
// Spiegelt die bern.ts-Schnittstellen (enrichCands / loadOev), damit App.tsx je nach
// gewählter Stadt denselben Ablauf fährt. Bewusst auf einen ersten, kleinen Schritt
// beschränkt — was Zürich (noch) NICHT liefert, bleibt manuelle Eingabe:
//
//   - Routentyp: live aus der städtischen «Velonetzplanung» (WFS, view_velonetz).
//     Attribut `kategorie` ∈ {Vorzugsroute, Hauptnetz, Basisnetz}. Übersetzung in die
//     beiden Masterplan-Routentypen (vgl. Velostandards Stadt Zürich, S. 7, Netz-Pyramide):
//       Vorzugsroute → Velohauptroute   (höchstes Anforderungsniveau)
//       Hauptnetz    → Veloroute
//       Basisnetz    → kein Routentyp   (Feld bleibt manuell, wie in Bern ohne Klassierung)
//     Kein Strassenname im Datensatz → Zuordnung geometrisch (geo.ts), wie bei Bern.
//   - Tempo / Ist-Führungsform / Breite: kommen stadtneutral aus OSM (App.tsx), nicht hier.
//   - DTV: für Zürich KEINE offene flächendeckende Quelle (nur ~100 DAV-Zählstellen als
//     Punktmessungen) → bleibt vorerst manuell (Zählstellen-Einbau = späterer Baustein).
//   - ÖV (Tram in der Fahrbahn, Haltestelle im Abschnitt): aus OSM (siehe cityShared.ts).
//     Der Bus-Takt (Frequenzband) erfordert einen OSM→GTFS-Join → vorerst manuell.
//
// Lizenz Velonetzplanung / OGD Stadt Zürich: Open Government Data, Quellenangabe Pflicht
// («Stadt Zürich»). Der WFS ist CORS-offen und liefert GeoJSON direkt in WGS84 (kein
// Reprojizieren nötig) — Live-Abruf im Browser, kein Proxy/Server nötig.

import type { Cand } from './VeloMap'
import type { Routentyp } from './fuehrungsform'
import { densify } from './geo'
import {
  bboxOf, bestOverlapFeature, loadOevFromOsm, SAMPLE_M,
  type Bbox, type GeoJsonFeature,
} from './cityShared'

// ÖV (Tram/Haltestelle) aus OSM — identisch zu anderen Tram-Städten.
export const loadOev = loadOevFromOsm

// ── Routentyp aus der Velonetzplanung (WFS, view_velonetz) ────────────────────
const VELONETZ_WFS = 'https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Velonetzplanung'

// kategorie → Masterplan-Routentyp (Basisnetz/Unbekannt → undefined = manuell).
function kategorieToRoutentyp(kat: unknown): Routentyp | undefined {
  if (kat === 'Vorzugsroute') return 'Velohauptroute'
  if (kat === 'Hauptnetz') return 'Veloroute'
  return undefined  // Basisnetz oder unklassifiziert → Feld bleibt manuell
}

async function fetchVelonetz(bbox: Bbox): Promise<GeoJsonFeature[]> {
  // WFS 2.0: Standard-Achsenreihenfolge für EPSG:4326 ist lat,lon → bbox = minLat,minLon,maxLat,maxLon.
  const params = new URLSearchParams({
    service: 'WFS', version: '2.0.0', request: 'GetFeature',
    typeName: 'view_velonetz', outputFormat: 'application/json', srsName: 'EPSG:4326',
    bbox: `${bbox.s},${bbox.w},${bbox.n},${bbox.e},urn:ogc:def:crs:EPSG::4326`,
  })
  const res = await fetch(`${VELONETZ_WFS}?${params}`)
  if (!res.ok) throw new Error(`Velonetzplanung HTTP ${res.status}`)
  const data: { features?: GeoJsonFeature[] } = await res.json()
  return (data.features || []).filter(f => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString')
}

// Kandidaten mit dem Routentyp aus der Velonetzplanung anreichern (additiv; schreibt in
// c.bern, das App.tsx als generischen „angereichert"-Container liest).
export async function enrichCands(cands: Cand[]): Promise<Cand[]> {
  if (cands.length === 0) return cands
  const features = await fetchVelonetz(bboxOf(cands)).catch(() => [])
  if (features.length === 0) return cands
  return cands.map(c => {
    const dense = densify(c.geom, SAMPLE_M)
    const f = bestOverlapFeature(dense, features)
    const routentyp = f ? kategorieToRoutentyp(f.properties.kategorie) : undefined
    if (!routentyp) return c
    return { ...c, bern: { ...c.bern, routentyp } }
  })
}
