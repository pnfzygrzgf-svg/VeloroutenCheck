// ── Amtliche Geodaten Stadt Bern (Geoportal map.bern.ch, ArcGIS REST) ────────
//
// Vier Layer ergänzen den OSM-Import (App.tsx) um Felder, die aus OSM nicht
// (DTV, Routentyp) oder nur unzuverlässig (Tempo, Velostrasse) ableitbar sind:
//   - Verkehr_Strasse (Service «Flaechendeckende_Verkehrsdaten», Layer 0): DTV.
//     Das Live-Service liefert nur Nt/Nn (kein Dtv-Feld — das existiert nur im
//     Datei-Export GDB/GPKG). DTV = round(16·Nt + 8·Nn): Tag 06–22 Uhr (16 h),
//     Nacht 22–06 Uhr (8 h); Formel per Least-Squares gegen den heruntergeladenen
//     GeoPackage-Export empirisch bestätigt (max. Abweichung 1,2 Fz, Mittel 0,42
//     über 1186 Segmente) und cross-validiert gegen die Jahresauswertung der
//     Messstelle Thunstrasse 100 (gemessen 17'191, Formel 17'190). Amtliche
//     Einschränkung: nur für Strassen mit DTV > 2'000 Mfz/Tag bzw. im Stadtteil 1
//     Altstadt geführt; «nur eine Grössenordnung, keine verbindlichen
//     Zählresultate» (Quelle: Metadatenblatt Flächendeckende Verkehrsdaten).
//   - Signalisierte_Hoechstgeschwindigkeit (Layer 0, Feld V_sig): amtliche
//     zulässige Höchstgeschwindigkeit je Strassenabschnitt.
//   - Veloroutennetz_Masterplan (Layer 0, Feld Velorouten_beschrieb):
//     „Velohauptroute" / „Veloroute" je Strassenabschnitt.
//   - Velostrassen (Service-Name, Layer-Name «Velostrasse»): nur 7 Features
//     (Stand 2026); Treffer bestätigt/erzwingt Ist-Führungsform «Velostrasse».
//
// Lizenz aller vier Layer: „Freie Nutzung. Quellenangabe ist Pflicht."
// Quellenangabe: „Geodaten Stadt Bern". Die Services sind CORS-offen (Origin
// wird reflektiert) und liefern auf Anfrage GeoJSON direkt in WGS84 (kein
// Reprojizieren nötig) — Live-Abruf im Browser, kein Proxy/Server nötig.

import type { Cand, Stop } from './VeloMap'
import type { Routentyp } from './fuehrungsform'
import { densify, overlapScore, majorityLineIndex, majorityValue, distPointToLineM, type LL } from './geo'

const BASE = 'https://map.bern.ch/arcgis/rest/services/Geoportal'

interface GeoJsonFeature {
  geometry: { type: string; coordinates: number[] | number[][] | number[][][] }
  properties: Record<string, string | number | null>
}
interface GeoJsonResponse { features?: GeoJsonFeature[] }

// Bbox-Abfrage gegen einen Geoportal-Layer (Layer 0 bei allen vier hier genutzten Services).
async function fetchBernGeojson(
  service: string, bbox: { s: number; w: number; n: number; e: number }, outFields: string
): Promise<GeoJsonFeature[]> {
  const params = new URLSearchParams({
    geometry: `${bbox.w},${bbox.s},${bbox.e},${bbox.n}`,
    geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields, outSR: '4326', f: 'geojson',
  })
  // Timeout: ein hängender Geoportal-Server darf enrichAll/die UI nicht dauerhaft blockieren.
  const res = await fetch(`${BASE}/${service}/MapServer/0/query?${params}`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`${service} HTTP ${res.status}`)
  const data: GeoJsonResponse = await res.json()
  return data.features || []
}

// DTV aus Nt (Tag, 16 h) / Nn (Nacht, 8 h) — siehe Herleitung im Kopfkommentar.
export function dtvFromNtNn(nt: number, nn: number): number {
  return Math.round(16 * nt + 8 * nn)
}

// GeoJSON-Feature-Koordinaten → [{lat,lon}] (für den Geometrie-Vergleich, siehe geo.ts).
function featureLatLon(feature: GeoJsonFeature): LL[] {
  const coords = feature.geometry.type === 'LineString'
    ? (feature.geometry.coordinates as number[][])
    : (feature.geometry.coordinates as number[][][]).flat()
  return coords.map(([lon, lat]) => ({ lat, lon }))
}

// Feature per Mehrheits-Zuordnung (majorityLineIndex, geo.ts): gewinnt, wer den grössten Teil
// des Abschnitts lokal parallel abdeckt (≥ minFraction, sonst undefined). Gerichtet statt
// symmetrisch — eine kurze DTV-/Tempo-Linie einer Nachbarstrasse kann nicht mehr aufsitzen.
function bestOverlapFeature(
  candGeom: LL[], features: GeoJsonFeature[], maxDistM: number, minFraction: number,
): GeoJsonFeature | undefined {
  const i = majorityLineIndex(candGeom, features.map(featureLatLon), maxDistM, minFraction)
  return i >= 0 ? features[i] : undefined
}

function bboxOf(cands: Cand[]): { s: number; w: number; n: number; e: number } {
  const pts = cands.flatMap(c => c.geom)
  return {
    s: Math.min(...pts.map(p => p.lat)), n: Math.max(...pts.map(p => p.lat)),
    w: Math.min(...pts.map(p => p.lon)), e: Math.max(...pts.map(p => p.lon)),
  }
}

// Velostrassen (nur 7 Features) — einmalig laden und im Modul cachen.
let velostrassenCache: Promise<GeoJsonFeature[]> | null = null
function loadVelostrassen(): Promise<GeoJsonFeature[]> {
  if (!velostrassenCache) {
    velostrassenCache = fetchBernGeojson(
      'Velostrassen', { s: -90, w: -180, n: 90, e: 180 }, 'Name')
  }
  return velostrassenCache
}

const SAMPLE_M = 15     // Schrittweite zum Verdichten der Kandidaten-Geometrie.
const OVERLAP_M = 20    // Punkt gilt als „auf dem Feature", wenn ≤ 20 m entfernt.
const MIN_FRACTION = 0.5   // ≥ 50 % der Punkte entlang → Treffer (Tempo/DTV/Routentyp).
const VELO_FRACTION = 0.6  // strenger für Velostrassen (überschreibt die Ist-Führungsform).

// Kandidaten mit amtlichen Bern-Daten anreichern (additiv, überschreibt nichts an c.*).
// Ein einzelner Layer-Fehler (z. B. Netzwerk) darf den Import nicht blockieren.
export async function enrichCands(cands: Cand[]): Promise<Cand[]> {
  if (cands.length === 0) return cands
  const bbox = bboxOf(cands)
  const [tempo, dtv, routenRoh, velostrassen] = await Promise.all([
    fetchBernGeojson('Signalisierte_Hoechstgeschwindigkeit', bbox, 'V_sig').catch(() => []),
    fetchBernGeojson('Flaechendeckende_Verkehrsdaten', bbox, 'Nt,Nn').catch(() => []),
    fetchBernGeojson('Veloroutennetz_Masterplan', bbox, 'Velorouten_beschrieb').catch(() => []),
    loadVelostrassen().catch(() => []),
  ])
  // Das Veloroutennetz enthält auch unklassifizierte Netzgeometrie (Velorouten_beschrieb = null).
  // Vorab herausfiltern, damit ein solches Stück nicht eine echte Klassifizierung verdeckt.
  const routen = routenRoh.filter(f => f.properties.Velorouten_beschrieb != null)

  // ── Zuordnung NACH WERT statt nach Feature (majorityValue, siehe geo.ts) ──────────────
  // Alle drei Layer sind je AchsenABSCHNITT segmentiert und damit feiner als die OSM-Wege:
  // ein 842-m-Weg läuft über fünf Verkehrsdaten-Abschnitte, die alle denselben DTV tragen.
  // Pro Feature gezählt zersplittern die Stimmen (29/24/19/16/12 %), keines erreicht
  // MIN_FRACTION — und der Abschnitt bliebe ohne DTV, obwohl er zu 100 % abgedeckt ist.
  // Nach Wert gezählt gewinnt der Wert, der die Mehrheit des Abschnitts abdeckt.
  // Geometrien/Werte einmal je Layer aufbereiten (statt je Kandidat neu).
  const tempoGeom = tempo.map(featureLatLon)
  const tempoWert = tempo.map(f => {
    const v = Number(f.properties.V_sig)
    return Number.isFinite(v) ? v : null
  })
  const dtvGeom = dtv.map(featureLatLon)
  const dtvWert = dtv.map(f => {
    const nt = Number(f.properties.Nt), nn = Number(f.properties.Nn)
    return Number.isFinite(nt) && Number.isFinite(nn) ? dtvFromNtNn(nt, nn) : null
  })
  const routenGeom = routen.map(featureLatLon)
  const routenWert = routen.map(f => f.properties.Velorouten_beschrieb as string | null)

  return cands.map(c => {
    const dense = densify(c.geom, SAMPLE_M)
    const speed = majorityValue(dense, tempoGeom, tempoWert, OVERLAP_M, MIN_FRACTION)
    const dtvVal = majorityValue(dense, dtvGeom, dtvWert, OVERLAP_M, MIN_FRACTION)
    const routentyp = majorityValue(dense, routenGeom, routenWert, OVERLAP_M, MIN_FRACTION) as Routentyp | undefined
    // Velostrasse setzt die Ist-Führungsform → strenger (VELO_FRACTION), damit eine bloss
    // kreuzende Velostrasse die OSM-Führungsform nicht fälschlich überschreibt.
    const velostrasse = bestOverlapFeature(dense, velostrassen, OVERLAP_M, VELO_FRACTION) != null
    if (!speed && !dtvVal && !routentyp && !velostrasse) return c
    return {
      ...c,
      bern: {
        ...(speed ? { speed } : {}),
        ...(dtvVal ? { dtv: dtvVal } : {}),
        ...(routentyp === 'Velohauptroute' || routentyp === 'Veloroute' ? { routentyp } : {}),
        ...(velostrasse ? { velostrasse: true } : {}),
      },
    }
  })
}

// ── ÖV: Haltestellen (Punkte) + Linien (Modus) ───────────────────────────────
// Geoportal liefert WO Haltestellen liegen (Layer Haltestellen) und WELCHER Modus
// entlang verläuft (OeV_Linien, Verkehrsmittel_typ) — aber KEINEN Takt und KEINEN
// baulichen Haltestellentyp. Daraus ableitbar: „Haltestelle im Abschnitt" + Tram/Bus.
// `busPerH` = Bus-Abfahrten 17–18 h in der stärksten Einzelrichtung (aus GTFS, siehe
// tools/oev_takt.py); per BPUIC (= Haltestellen-`Id_opendata`) nachgeschlagen.
export interface OevInfo {
  oevHalt: boolean; oevHaltName?: string; oevTram: boolean; oevBus: boolean; busPerH?: number
}

const STOP_DIST_M = 30  // Haltestelle gilt als „im Abschnitt", wenn ≤ 30 m vom Segment.

// Gebündelte Takt-Tabelle (BPUIC → Bus-Fahrten/h, Abendspitze) — einmalig laden, siehe oev_takt.py.
let taktCache: Promise<Record<string, number>> | null = null
function loadTakt(): Promise<Record<string, number>> {
  if (!taktCache) {
    taktCache = fetch(import.meta.env.BASE_URL + 'oev_takt_bern.json')
      .then(r => (r.ok ? r.json() : {})).catch(() => ({}))
  }
  return taktCache
}

// Liefert je Kandidat die ÖV-Info (per Geometrie) und alle Haltestellen-Punkte (für Karten-Marker).
export async function loadOev(cands: Cand[]): Promise<{ byId: Map<number, OevInfo>; stops: Stop[] }> {
  if (cands.length === 0) return { byId: new Map(), stops: [] }
  const bbox = bboxOf(cands)
  const [haltGeo, linienGeo, takt] = await Promise.all([
    fetchBernGeojson('Haltestellen', bbox, 'Punktname,Id_opendata').catch(() => []),
    fetchBernGeojson('OeV_Linien', bbox, 'Verkehrsmittel_typ').catch(() => []),
    loadTakt(),
  ])
  // Haltestellen-Punkte ([lon,lat]) für die Karte (mit BPUIC für den Fahrplan-Join).
  const stops: Stop[] = haltGeo
    .filter(f => f.geometry.type === 'Point')
    .map(f => {
      const [lon, lat] = f.geometry.coordinates as number[]
      const bpuic = f.properties.Id_opendata != null ? String(f.properties.Id_opendata) : undefined
      return { lat, lon, name: String(f.properties.Punktname ?? 'Haltestelle'), bpuic }
    })
  // Linien nach Modus (Tram bzw. Bus/Trolleybus — beide auf der Fahrbahn velorelevant).
  const tramLines = linienGeo.filter(f => f.properties.Verkehrsmittel_typ === 'Tram').map(featureLatLon)
  const busLines = linienGeo
    .filter(f => f.properties.Verkehrsmittel_typ === 'Bus' || f.properties.Verkehrsmittel_typ === 'Trolleybus')
    .map(featureLatLon)

  const byId = new Map<number, OevInfo>()
  for (const c of cands) {
    const dense = densify(c.geom, SAMPLE_M)
    let nearStop: Stop | undefined
    for (const st of stops) if (distPointToLineM(st, dense) <= STOP_DIST_M) { nearStop = st; break }
    const oevTram = tramLines.some(l => overlapScore(dense, l, OVERLAP_M) >= MIN_FRACTION)
    const oevBus = busLines.some(l => overlapScore(dense, l, OVERLAP_M) >= MIN_FRACTION)
    if (nearStop || oevTram || oevBus) {
      const busPerH = nearStop?.bpuic ? takt[nearStop.bpuic] : undefined
      byId.set(c.id, { oevHalt: !!nearStop, oevHaltName: nearStop?.name, oevTram, oevBus, busPerH })
    }
  }
  return { byId, stops }
}
