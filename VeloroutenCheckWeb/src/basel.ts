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
  bboxOf, bestOverlapValue, loadOevFromOsm, nearestDtv, OVERLAP_M, SAMPLE_M,
  type Bbox, type GeoJsonFeature, type DtvStation,
} from './cityShared'

// DTV je Zählstelle aus dem gebündelten Snapshot (public/dtv_basel.json, via tools/dtv_basel.py) —
// Basel liefert nur Stundenwerte, daher offline zum Werktags-Mittel aggregiert (nicht live wie ZH/LU).
let dtvCache: Promise<DtvStation[]> | undefined
function fetchDtvStations(): Promise<DtvStation[]> {
  if (!dtvCache) {
    dtvCache = fetch(import.meta.env.BASE_URL + 'dtv_basel.json')
      .then(r => (r.ok ? r.json() : []))
      .catch(() => { dtvCache = undefined; return [] as DtvStation[] })   // Netzfehler nicht einfrieren
  }
  return dtvCache
}

// ÖV (Tram/Haltestelle) aus OSM + Bus-Takt aus dem gebündelten GTFS-Snapshot (oev_takt.py).
export const loadOev = (cands: Cand[]) => loadOevFromOsm(cands, 'oev_takt_basel.json')

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
    typeNames: BS_LAYER, outputFormat: 'geojson', srsName: 'EPSG:4326',
    bbox: `${bbox.s},${bbox.w},${bbox.n},${bbox.e},urn:ogc:def:crs:EPSG::4326`,
  })
  // Timeout: ein hängender WFS darf enrichAll/die UI nicht dauerhaft blockieren.
  const res = await fetch(`${BS_WFS}?${params}`, { signal: AbortSignal.timeout(15000) })
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
    velostrassenCache = fetch(VELOSTADTPLAN_GEOJSON, { signal: AbortSignal.timeout(15000) })
      .then(r => (r.ok ? r.json() : { features: [] }))
      .then((d: { features?: GeoJsonFeature[] }) => d.features || [])
      .catch(() => { velostrassenCache = null; return [] })   // Netzfehler nicht einfrieren
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
  const res = await fetch(strassenGeojsonUrl(bbox), { signal: AbortSignal.timeout(15000) })
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
// Nur reale Verkehrstempi (20–60) übernehmen; 0/5 (Fussgängerzone/Schritttempo) und null
// ignorieren — ebenso > 60 (Hochleistungsstrassen sind kein Veloführungs-Kontext).
function geschwindigkeit(p: Record<string, string | number | null>): number | undefined {
  const g = p.geschwindigkeit
  return typeof g === 'number' && g >= 20 && g <= 60 ? g : undefined
}

export async function enrichCands(cands: Cand[]): Promise<Cand[]> {
  if (cands.length === 0) return cands
  const bbox = bboxOf(cands)
  const [features, velostrassen, strassen, stations] = await Promise.all([
    fetchVelonetz(bbox).catch(() => []),
    loadVelostrassen(),
    fetchStrassentyp(bbox).catch(() => []),
    fetchDtvStations(),
  ])
  if (features.length === 0 && velostrassen.length === 0 && strassen.length === 0 && stations.length === 0) return cands
  return cands.map(c => {
    const dense = densify(c.geom, SAMPLE_M)
    // Votum pro WERT statt pro Feature: Teilrichtplan (4 002 Segmente) und «Strassen und Wege»
    // (7 546) sind fein segmentiert — pro Feature erreichte keines die 50 %, und ohne Strassentyp
    // ist ein Basler Abschnitt unbewertbar (Pflichtfeld der Soll-Wahl).
    const routentyp = bestOverlapValue(dense, features, f => flagsToRoutentyp(f.properties))
    const strassentyp = bestOverlapValue(dense, strassen, f => kategorieToStrassentyp(f.properties))
    const speed = bestOverlapValue(dense, strassen, f => geschwindigkeit(f.properties))
    const dtv = nearestDtv(dense, stations)
    // Velostrasse setzt die Ist-Führungsform → strenger (VELO_FRACTION), damit eine bloss
    // kreuzende Velostrasse die OSM-Führungsform nicht fälschlich überschreibt.
    const velostrasse = bestOverlapValue(dense, velostrassen, () => true, OVERLAP_M, VELO_FRACTION) === true
    if (!routentyp && !velostrasse && !strassentyp && speed == null && dtv == null) return c
    return {
      ...c,
      bern: {
        ...c.bern,
        ...(routentyp ? { routentyp } : {}),
        ...(strassentyp ? { strassentyp } : {}),
        ...(speed != null ? { speed } : {}),
        ...(velostrasse ? { velostrasse: true } : {}),
        ...(dtv != null ? { dtv } : {}),
      },
    }
  })
}
