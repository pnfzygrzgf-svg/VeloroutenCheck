// ── Öffentliche Geodaten Kanton Basel-Stadt (Adapter, analog bern.ts/zurich.ts) ──
//
// Spiegelt die Schnittstellen (enrichCands / loadOev). Erster Schritt, bewusst klein:
//
//   - Routentyp: live aus dem «Teilrichtplan Velo» (WFS geo.bs.ch). Das Bestandsnetz
//     (Layer TV_Pendlerrouten_Bestand = vollständiges Netz, 4002 Segmente) klassiert jedes
//     Segment über die Flags `tv_pendlerroute` / `tv_basisroute`.
//     Übersetzung gemäss Velokonzept Basel (Quelle: Kanton Basel-Stadt):
//       Velovorzugsrouten → Velohauptroute  — ABER nicht als offene Geodaten verfügbar
//                                              (weder WFS/WMS noch data.bs.ch) → bleibt manuell.
//       Basis-/Pendlerrouten → Veloroute    — beide ohne Hierarchie untereinander → gleich.
//       übriges Strassennetz → kein Routentyp (manuell).
//     Kein Strassenname im Datensatz → Zuordnung geometrisch (geo.ts).
//   - Velostrasse: aus dem «Velostadtplan» (data.bs.ch, gml_id=Velostrasse) → setzt die
//     Ist-Führungsform = Velostrasse (amtlich), genau wie Berns Velostrassen-Layer.
//   - Tempo / übrige Ist-Führungsform / Breite: aus OSM (App.tsx).
//   - DTV / Bus-Takt: vorerst manuell (kein offener flächendeckender DTV; Takt = OSM→GTFS-Join).
//   - ÖV (Tram in der Fahrbahn, Haltestelle): aus OSM (cityShared.ts) — Basel hat Tram.
//   - Velovorzugsrouten (= Velohauptroute) und die «Eignung» des Velostadtplans („gut befahrbares
//     Velonetz") sind bewusst NICHT übernommen: Vorzugsrouten fehlen als offene Geodaten; die
//     Eignung ist eine Komfortbewertung, kein Routentyp (würde die Note verfälschen).
//
// Lizenz: Open Government Data Kanton Basel-Stadt, Quellenangabe Pflicht. Der WFS ist
// CORS-offen und liefert GeoJSON in WGS84 (Live-Abruf im Browser, kein Proxy nötig).

import type { Cand } from './VeloMap'
import type { Routentyp, Strassentyp } from './fuehrungsform'
import { densify } from './geo'
import {
  bboxOf, bestOverlapFeature, loadOevFromOsm, OVERLAP_M, SAMPLE_M,
  type Bbox, type GeoJsonFeature,
} from './cityShared'

// ÖV (Tram/Haltestelle) aus OSM — wie die anderen Tram-Städte.
export const loadOev = loadOevFromOsm

// ── Routentyp aus dem Teilrichtplan Velo (WFS, Bestandsnetz mit Flags) ─────────
const BS_WFS = 'https://wfs.geo.bs.ch/'
// Beide Bestand-Layer liefern dasselbe vollständige Netz (4002 Segmente) mit den Flags;
// einer genügt.
const BS_LAYER = 'ms:TV_Pendlerrouten_Bestand'

// Flags → Masterplan-Routentyp. Vorzugsrouten (= Velohauptroute) fehlen in den offenen
// Daten → werden hier NICHT gesetzt (bleiben manuell). Pendler/Basis → Veloroute.
function flagsToRoutentyp(p: Record<string, string | number | null>): Routentyp | undefined {
  if (p.tv_pendlerroute === 'ja' || p.tv_basisroute === 'ja') return 'Veloroute'
  return undefined
}

async function fetchVelonetz(bbox: Bbox): Promise<GeoJsonFeature[]> {
  // MapServer-WFS 2.0: Achsenreihenfolge EPSG:4326 = lat,lon → bbox = minLat,minLon,maxLat,maxLon.
  const params = new URLSearchParams({
    service: 'WFS', version: '2.0.0', request: 'GetFeature',
    typeName: BS_LAYER, outputFormat: 'geojson', srsName: 'EPSG:4326',
    bbox: `${bbox.s},${bbox.w},${bbox.n},${bbox.e},urn:ogc:def:crs:EPSG::4326`,
  })
  const res = await fetch(`${BS_WFS}?${params}`)
  if (!res.ok) throw new Error(`Teilrichtplan Velo HTTP ${res.status}`)
  const data: { features?: GeoJsonFeature[] } = await res.json()
  return (data.features || []).filter(f => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString')
}

// ── Velostrasse aus dem Velostadtplan (data.bs.ch, gml_id=Velostrasse) ─────────
// Nur 87 Features → einmalig laden und im Modul cachen (wie Berns Velostrassen).
const VELOSTADTPLAN_GEOJSON =
  'https://data.bs.ch/api/explore/v2.1/catalog/datasets/100404/exports/geojson?where=' +
  encodeURIComponent('gml_id="Velostrasse"')
const VELO_FRACTION = 0.6  // strenger als Routentyp: Velostrasse überschreibt die Ist-Führungsform.

let velostrassenCache: Promise<GeoJsonFeature[]> | null = null
function loadVelostrassen(): Promise<GeoJsonFeature[]> {
  if (!velostrassenCache) {
    velostrassenCache = fetch(VELOSTADTPLAN_GEOJSON)
      .then(r => (r.ok ? r.json() : { features: [] }))
      .then((d: { features?: GeoJsonFeature[] }) => d.features || [])
      .catch(() => [])
  }
  return velostrassenCache
}

// ── Strassentyp aus «Strassen und Wege» (data.bs.ch, Dataset 100250) ───────────
// Feld `strassenkategorie`: «verkehrsorientierte Strasse» / «siedlungsorientierte Strasse»
// (+ «Wege»/null → kein Wert). 7546 Segmente → per Bbox laden (in_bbox-Filter).
function strassenGeojsonUrl(bbox: Bbox): string {
  const where = `in_bbox(geo_shape, ${bbox.s}, ${bbox.w}, ${bbox.n}, ${bbox.e})`
  return 'https://data.bs.ch/api/explore/v2.1/catalog/datasets/100250/exports/geojson?' +
    'select=' + encodeURIComponent('strassenkategorie,geschwindigkeit') +
    '&where=' + encodeURIComponent(where)
}

async function fetchStrassentyp(bbox: Bbox): Promise<GeoJsonFeature[]> {
  const res = await fetch(strassenGeojsonUrl(bbox))
  if (!res.ok) throw new Error(`Strassen und Wege HTTP ${res.status}`)
  const data: { features?: GeoJsonFeature[] } = await res.json()
  return (data.features || []).filter(f => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString')
}

function kategorieToStrassentyp(p: Record<string, string | number | null>): Strassentyp | undefined {
  const k = p.strassenkategorie
  if (k === 'verkehrsorientierte Strasse') return 'verkehrsorientiert'
  if (k === 'siedlungsorientierte Strasse') return 'siedlungsorientiert'
  return undefined   // «Wege» / null → manuell
}

// Signalisierte Höchstgeschwindigkeit aus dem Datensatz (amtlich, besser als OSM-maxspeed).
// Nur reale Verkehrstempi (20–60) übernehmen; 0/5 (Fussgängerzone/Schritttempo) und null ignorieren.
function geschwindigkeit(p: Record<string, string | number | null>): number | undefined {
  const g = p.geschwindigkeit
  return typeof g === 'number' && g >= 20 ? g : undefined
}

export async function enrichCands(cands: Cand[]): Promise<Cand[]> {
  if (cands.length === 0) return cands
  const bbox = bboxOf(cands)
  const [features, velostrassen, strassen] = await Promise.all([
    fetchVelonetz(bbox).catch(() => []),
    loadVelostrassen(),
    fetchStrassentyp(bbox).catch(() => []),
  ])
  if (features.length === 0 && velostrassen.length === 0 && strassen.length === 0) return cands
  return cands.map(c => {
    const dense = densify(c.geom, SAMPLE_M)
    const routenF = bestOverlapFeature(dense, features)
    const routentyp = routenF ? flagsToRoutentyp(routenF.properties) : undefined
    const strassenF = bestOverlapFeature(dense, strassen)
    const strassentyp = strassenF ? kategorieToStrassentyp(strassenF.properties) : undefined
    const speed = strassenF ? geschwindigkeit(strassenF.properties) : undefined
    // Velostrasse setzt die Ist-Führungsform → strenger (VELO_FRACTION), damit eine bloss
    // kreuzende Velostrasse die OSM-Führungsform nicht fälschlich überschreibt.
    const velostrasse = bestOverlapFeature(dense, velostrassen, OVERLAP_M, VELO_FRACTION) != null
    if (!routentyp && !velostrasse && !strassentyp && !speed) return c
    return {
      ...c,
      bern: {
        ...c.bern,
        ...(routentyp ? { routentyp } : {}),
        ...(strassentyp ? { strassentyp } : {}),
        ...(speed ? { speed } : {}),
        ...(velostrasse ? { velostrasse: true } : {}),
      },
    }
  })
}
