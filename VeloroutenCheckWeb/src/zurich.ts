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
  bboxOf, bestOverlapValue, loadOevFromOsm, nearestDtv, SAMPLE_M,
  type Bbox, type GeoJsonFeature, type DtvStation,
} from './cityShared'

// DTV je Zählstelle live aus dem OGD-WFS des Kantons Zürich (TBA Verkehrsmessstellen, Feld `dtv`).
// CORS-offen, WGS84-GeoJSON. Wenige Punkte → einmal laden und cachen.
let dtvCache: Promise<DtvStation[]> | undefined
function fetchDtvStations(): Promise<DtvStation[]> {
  if (!dtvCache) {
    dtvCache = fetch('https://maps.zh.ch/wfs/OGDZHWFS?service=WFS&version=2.0.0&request=GetFeature'
      + '&typeNames=ms:ogd-0223_giszhpub_tba_verkehrsmessstellen_p&outputFormat=geojson&srsName=EPSG:4326',
      { signal: AbortSignal.timeout(8000) })
      .then(r => (r.ok ? r.json() : { features: [] }))
      .then((d: { features?: { geometry?: { coordinates: [number, number] }; properties?: { dtv?: number } }[] }) =>
        (d.features ?? []).flatMap(f => {
          const c = f.geometry?.coordinates, dtv = f.properties?.dtv
          return c && dtv != null ? [{ lat: c[1], lon: c[0], dtv }] : []
        }))
      .catch(() => { dtvCache = undefined; return [] as DtvStation[] })   // Netzfehler nicht einfrieren
  }
  return dtvCache
}

// ÖV (Tram/Haltestelle) aus OSM + Bus-Takt aus dem gebündelten GTFS-Snapshot (oev_takt.py).
export const loadOev = (cands: Cand[]) => loadOevFromOsm(cands, 'oev_takt_zurich.json')

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
    typeNames: 'view_velonetz', outputFormat: 'application/json', srsName: 'EPSG:4326',
    bbox: `${bbox.s},${bbox.w},${bbox.n},${bbox.e},urn:ogc:def:crs:EPSG::4326`,
  })
  // Timeout: ein hängender WFS darf enrichAll/die UI nicht dauerhaft blockieren.
  const res = await fetch(`${VELONETZ_WFS}?${params}`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Velonetzplanung HTTP ${res.status}`)
  const data: { features?: GeoJsonFeature[] } = await res.json()
  return (data.features || []).filter(f => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString')
}

// Kandidaten mit dem Routentyp aus der Velonetzplanung anreichern (additiv; schreibt in
// c.bern, das App.tsx als generischen „angereichert"-Container liest).
export async function enrichCands(cands: Cand[]): Promise<Cand[]> {
  if (cands.length === 0) return cands
  const [features, stations] = await Promise.all([
    fetchVelonetz(bboxOf(cands)).catch(() => []),
    fetchDtvStations(),
  ])
  return cands.map(c => {
    const dense = densify(c.geom, SAMPLE_M)
    // Votum pro WERT: die kantonalen Velonetz-Features sind kurz segmentiert — pro Feature
    // erreichte keines die 50 % und der Routentyp fiel aus (07.08.2026).
    const routentyp = features.length
      ? bestOverlapValue(dense, features, f => kategorieToRoutentyp(f.properties.kategorie))
      : undefined
    const dtv = nearestDtv(dense, stations)
    if (!routentyp && dtv == null) return c
    return { ...c, bern: { ...c.bern, ...(routentyp ? { routentyp } : {}), ...(dtv != null ? { dtv } : {}) } }
  })
}
