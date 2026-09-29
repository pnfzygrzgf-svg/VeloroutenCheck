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
import { densify, overlapScore, anteilAbgedeckt, distPointToLineM } from './geo'
import { arcgisGeojson, holeJson } from './netz'
import {
  bboxOf, bestOverlapFeature, bestOverlapValue, featureLatLon, istLinie, versuch,
  type Anreicherung, type Bbox, type GeoJsonFeature,
} from './cityShared'

const BASE = 'https://map.bern.ch/arcgis/rest/services/Geoportal'

// Bbox-Abfrage gegen einen Geoportal-Layer (Layer 0 bei allen vier hier genutzten Services).
// Vollständig oder Fehler — siehe arcgisGeojson (netz.ts): ArcGIS-Fehler mit HTTP 200 und
// gekappte Ergebnisse gelten nicht mehr als «leer».
function fetchBernGeojson(service: string, bbox: Bbox, outFields: string): Promise<GeoJsonFeature[]> {
  return arcgisGeojson<GeoJsonFeature>(`${BASE}/${service}/MapServer/0/query`, {
    geometry: `${bbox.w},${bbox.s},${bbox.e},${bbox.n}`,
    geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields, outSR: '4326',
  })
}

// DTV aus Nt (Tag, 16 h) / Nn (Nacht, 8 h) — siehe Herleitung im Kopfkommentar.
export function dtvFromNtNn(nt: number, nn: number): number {
  return Math.round(16 * nt + 8 * nn)
}

// Attributwert → Zahl, FEHLENDES bleibt fehlend. `Number(null)` und `Number('')` sind 0 —
// bis zum 29.09.2026 wurde so aus einem leeren V_sig «Tempo 0» und aus einem leeren Nt/Nn
// ein zu tiefer DTV, beides mit dem Chip «Geoportal». Eine ECHTE 0 bleibt gültig.
export function zahlOderNull(x: unknown): number | null {
  if (x == null || x === '') return null
  const n = Number(x)
  return Number.isFinite(n) ? n : null
}

// Velostrassen (nur 7 Features) — einmalig laden und im Modul cachen.
let velostrassenCache: Promise<GeoJsonFeature[]> | null = null
function loadVelostrassen(): Promise<GeoJsonFeature[]> {
  if (!velostrassenCache) {
    velostrassenCache = fetchBernGeojson(
      'Velostrassen', { s: -90, w: -180, n: 90, e: 180 }, 'Name').then(f => f.filter(istLinie))
    velostrassenCache.catch(() => { velostrassenCache = null })   // Fehlschlag nicht einfrieren
  }
  return velostrassenCache
}

const SAMPLE_M = 15     // Schrittweite zum Verdichten der Kandidaten-Geometrie.
const OVERLAP_M = 20    // Punkt gilt als „auf dem Feature", wenn ≤ 20 m entfernt.
const MIN_FRACTION = 0.5   // ≥ 50 % der Punkte entlang → Treffer (Tempo/DTV/Routentyp).
const VELO_FRACTION = 0.6  // strenger für Velostrassen (überschreibt die Ist-Führungsform).
// «Kein Eintrag im Verkehrsdaten-Layer» heisst: höchstens dieser Anteil des Abschnitts liegt an
// irgendeiner Verkehrsdaten-Linie. Darüber gibt es einen Eintrag — nur keinen, der die Mehrheit
// stellt (Abschnitt halb auf der Hauptstrasse) —, und die Annahme «≤ 2000» wäre geraten.
const DTV_LEER_MAX = 0.2

// Kandidaten mit amtlichen Bern-Daten anreichern (additiv, überschreibt nichts an c.*).
// Ein einzelner Layer-Fehler (z. B. Netzwerk) darf den Import nicht blockieren.
//
// DTV-ANNAHME: Die «kein Eintrag ⇒ DTV ≤ 2000»-Annahme (strecke.ts, dtvAssumed) stützt sich auf
// `bern.dtvGeprueft`, das hier JE KANDIDAT gesetzt wird — und nur, wenn der Verkehrsdaten-Layer
// für genau diese Abfrage vollständig geantwortet hat und am Abschnitt wirklich kein Eintrag
// liegt. Bis zum 29.09.2026 stand dafür EIN modulweiter Schalter (Status des letzten Laufs):
// ein bei Ausfall geladenes Segment wurde nach dem nächsten erfolgreichen Laden eines ANDEREN
// Segments rückwirkend zu «≤ 2000 angenommen».
export async function enrichCands(cands: Cand[]): Promise<Anreicherung> {
  const fehler: string[] = []
  if (cands.length === 0) return { cands, fehler }
  const bbox = bboxOf(cands)
  const [tempo, dtvRoh, routenRoh, velostrassen] = await Promise.all([
    versuch('Signalisierte Höchstgeschwindigkeit', fetchBernGeojson('Signalisierte_Hoechstgeschwindigkeit', bbox, 'V_sig'), [], fehler),
    // null = Layer nicht erreichbar (≠ leeres, aber gültiges Ergebnis) — Grundlage der Annahme.
    versuch<GeoJsonFeature[] | null>('Verkehrsdaten (DTV)', fetchBernGeojson('Flaechendeckende_Verkehrsdaten', bbox, 'Nt,Nn'), null, fehler),
    versuch('Veloroutennetz', fetchBernGeojson('Veloroutennetz_Masterplan', bbox, 'Velorouten_beschrieb'), [], fehler),
    versuch('Velostrassen', loadVelostrassen(), [], fehler),
  ])
  const dtvLayerOk = dtvRoh !== null
  const dtv = (dtvRoh ?? []).filter(istLinie)
  const dtvLinien = dtv.map(featureLatLon)
  const tempoLinien = tempo.filter(istLinie)
  const routen = routenRoh.filter(istLinie)

  // ── Zuordnung NACH WERT statt nach Feature (majorityValue, siehe geo.ts) ──────────────
  // Alle drei Layer sind je AchsenABSCHNITT segmentiert und damit feiner als die OSM-Wege:
  // ein 842-m-Weg läuft über fünf Verkehrsdaten-Abschnitte, die alle denselben DTV tragen.
  // Pro Feature gezählt zersplittern die Stimmen (29/24/19/16/12 %), keines erreicht
  // MIN_FRACTION — und der Abschnitt bliebe ohne DTV, obwohl er zu 100 % abgedeckt ist.
  // Nach Wert gezählt gewinnt der Wert, der die Mehrheit des Abschnitts abdeckt.
  // Features ohne Wert (nicht klassierte Netzgeometrie, leeres V_sig) stimmen nicht mit und
  // verdecken auch keine klassierte Linie (majorityValue schliesst sie vorab aus).
  return { fehler, cands: cands.map(c => {
    const dense = densify(c.geom, SAMPLE_M)
    const speed = bestOverlapValue(dense, tempoLinien, f => zahlOderNull(f.properties.V_sig), OVERLAP_M, MIN_FRACTION)
    const dtvVal = bestOverlapValue(dense, dtv, f => {
      const nt = zahlOderNull(f.properties.Nt), nn = zahlOderNull(f.properties.Nn)
      return nt != null && nn != null ? dtvFromNtNn(nt, nn) : null
    }, OVERLAP_M, MIN_FRACTION)
    const routentyp = bestOverlapValue(dense, routen,
      f => f.properties.Velorouten_beschrieb as string | null, OVERLAP_M, MIN_FRACTION) as Routentyp | undefined
    // Velostrasse setzt die Ist-Führungsform → strenger (VELO_FRACTION), damit eine bloss
    // kreuzende Velostrasse die OSM-Führungsform nicht fälschlich überschreibt.
    const velostrasse = bestOverlapFeature(dense, velostrassen, OVERLAP_M, VELO_FRACTION) != null
    // Geprüft = Layer hat geantwortet UND (Wert gefunden ODER am Abschnitt liegt kein Eintrag).
    const dtvGeprueft = dtvLayerOk &&
      (dtvVal != null || anteilAbgedeckt(dense, dtvLinien, OVERLAP_M) <= DTV_LEER_MAX)
    // `!= null` statt falsy (07.08.2026): DTV 0 (Nt=Nn=0) und Tempo 0 sind gültige amtliche
    // Werte — als „fehlt" behandelt log der Chip („angenommen" statt „amtlich").
    if (speed == null && dtvVal == null && !routentyp && !velostrasse && !dtvGeprueft) return c
    return {
      ...c,
      bern: {
        ...c.bern,   // vorhandene Anreicherung nicht verwerfen (wie die übrigen Adapter)
        ...(speed != null ? { speed } : {}),
        ...(dtvVal != null ? { dtv: dtvVal } : {}),
        ...(routentyp === 'Velohauptroute' || routentyp === 'Veloroute' ? { routentyp } : {}),
        ...(velostrasse ? { velostrasse: true } : {}),
        ...(dtvGeprueft ? { dtvGeprueft: true } : {}),
      },
    }
  }) }
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
    taktCache = holeJson<Record<string, number>>(import.meta.env.BASE_URL + 'oev_takt_bern.json', 15000)
      .catch(() => { taktCache = null; return {} })   // Fehlschlag nicht einfrieren
  }
  return taktCache
}

// Liefert je Kandidat die ÖV-Info (per Geometrie) und alle Haltestellen-Punkte (für Karten-Marker).
export async function loadOev(cands: Cand[]): Promise<{ byId: Map<number, OevInfo>; stops: Stop[]; fehler: string[] }> {
  const fehler: string[] = []
  if (cands.length === 0) return { byId: new Map(), stops: [], fehler }
  const bbox = bboxOf(cands)
  const [haltGeo, linienRoh, takt] = await Promise.all([
    versuch('ÖV-Haltestellen', fetchBernGeojson('Haltestellen', bbox, 'Punktname,Id_opendata'), [], fehler),
    versuch('ÖV-Linien', fetchBernGeojson('OeV_Linien', bbox, 'Verkehrsmittel_typ'), [], fehler),
    loadTakt(),
  ])
  const linienGeo = linienRoh.filter(istLinie)
  // Haltestellen-Punkte ([lon,lat]) für die Karte (mit BPUIC für den Fahrplan-Join).
  const stops: Stop[] = haltGeo
    .filter(f => f.geometry?.type === 'Point')
    .map(f => {
      const [lon, lat] = f.geometry!.coordinates as number[]
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
    // NÄCHSTE Haltestelle, nicht die erste der Serverliste (07.08.2026): der frühere `break`
    // beim ersten Treffer ≤ STOP_DIST_M liess die Antwort-Reihenfolge entscheiden — eine
    // Bus-Kante in 28 m konnte die Tram-Kante in 5 m verdrängen (ÖV-Angebot „Bus" statt
    // „Tram" → bis 1,0 Notenstufe über die Haltestellen-Lösung).
    let nearStop: Stop | undefined
    let nearD = STOP_DIST_M
    for (const st of stops) {
      const d = distPointToLineM(st, dense)
      if (d <= nearD) { nearD = d; nearStop = st }
    }
    const oevTram = tramLines.some(l => overlapScore(dense, l, OVERLAP_M) >= MIN_FRACTION)
    const oevBus = busLines.some(l => overlapScore(dense, l, OVERLAP_M) >= MIN_FRACTION)
    if (nearStop || oevTram || oevBus) {
      const busPerH = nearStop?.bpuic ? takt[nearStop.bpuic] : undefined
      byId.set(c.id, { oevHalt: !!nearStop, oevHaltName: nearStop?.name, oevTram, oevBus, busPerH })
    }
  }
  return { byId, stops, fehler }
}
