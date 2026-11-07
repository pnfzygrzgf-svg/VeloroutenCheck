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
//   - Veloroutennetz_Masterplan (Layer 0, Feld Veloroutentyp): Code 1–6 je
//     Strassenabschnitt, übersetzt in «Velohauptroute» / «Veloroute» (routentypAusCode).
//     Bis Oktober 2026 trug der Layer ein Textfeld Velorouten_beschrieb; die Stadt hat es
//     entfernt, seither fehlte der Routentyp überall (festgestellt 16.10.2026).
//   - Velostrassen (Service-Name, Layer-Name «Velostrasse»): nur 7 Features
//     (Stand 2026); Treffer bestätigt/erzwingt Ist-Führungsform «Velostrasse».
//
// Lizenz aller vier Layer: „Freie Nutzung. Quellenangabe ist Pflicht."
// Quellenangabe: „Geodaten Stadt Bern". Die Services sind CORS-offen (Origin
// wird reflektiert) und liefern auf Anfrage GeoJSON direkt in WGS84 (kein
// Reprojizieren nötig) — Live-Abruf im Browser, kein Proxy/Server nötig.

import type { Cand, Stop } from './VeloMap'
import type { Routentyp } from './fuehrungsform'
import { densify, overlapScore, anteilAbgedeckt, distPointToLineM, type LL } from './geo'
import { arcgisGeojson, holeJson } from './netz'
import {
  bboxOf, bestOverlapFeature, bestOverlapValue, featureLatLon, featureTeile, objektId, istLinie, routennetzEbene, versuch,
  type Anreicherung, type Bbox, type GeoJsonFeature,
} from './cityShared'
import { tempoObjekt, dtvLinie, type EbenenDaten, type EbenenObjekt } from './ebenen'

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

// Routentyp aus dem Code im Feld Veloroutentyp. Bedeutung laut Legende des Kartendienstes
// (Renderer des Layers, abgerufen 16.10.2026):
//   1 Velohauptroute entlang Hauptverkehrsachsen · 2 Velohauptroute abseits Hauptverkehrsachsen ·
//   3 Velohauptroute entlang neuer Stadtstrasse A6 · 4 Veloroute entlang Hauptverkehrsstrassen ·
//   5 Veloroute abseits Hauptverkehrsstrassen · 6 Veloroute abseits … mit Fokus Freizeit.
// Ohne Code (nicht klassierte Netzgeometrie) oder mit unbekanntem Code → null: Die Linie stimmt
// dann nicht mit (majorityValue) — lieber kein Routentyp als ein geratener.
// Strassenhierarchie (Service «Strassenhierarchie», Layer 0, seit 01.11.2026): Werte des Dienstes in der Kurzform des lokalen
// Rechners (soll_ist_analyse.py HIERARCHIE_FARBEN, Spalte `hierarchie`); unbekannte Werte bleiben, wie sie sind
const HIERARCHIE_KURZ: Record<string, string> = {
  'Quartierstr. ergänzend (Anlief. / Priv.)': 'Quartierstrasse ergänzend', 'nicht befahrbar (Fuss- / Aare- / Waldw.)': 'nicht befahrbar',
}
export function hierarchieKurz(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s && s !== 'Null' ? HIERARCHIE_KURZ[s] ?? s : null
}

export function routentypAusCode(code: unknown): Routentyp | null {
  const n = zahlOderNull(code)
  if (n === 1 || n === 2 || n === 3) return 'Velohauptroute'
  if (n === 4 || n === 5 || n === 6) return 'Veloroute'
  return null
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
  const [tempo, dtvRoh, routenRoh, velostrassen, hierRoh] = await Promise.all([
    versuch('Signalisierte Höchstgeschwindigkeit', fetchBernGeojson('Signalisierte_Hoechstgeschwindigkeit', bbox, 'V_sig'), [], fehler),
    // null = Layer nicht erreichbar (≠ leeres, aber gültiges Ergebnis) — Grundlage der Annahme.
    versuch<GeoJsonFeature[] | null>('Verkehrsdaten (DTV)', fetchBernGeojson('Flaechendeckende_Verkehrsdaten', bbox, 'Nt,Nn'), null, fehler),
    versuch('Veloroutennetz', fetchBernGeojson('Veloroutennetz_Masterplan', bbox, 'Veloroutentyp'), [], fehler),
    versuch('Velostrassen', loadVelostrassen(), [], fehler),
    versuch('Strassenhierarchie', fetchBernGeojson('Strassenhierarchie', bbox, 'Strassenhierarchie'), [], fehler),
  ])
  const hierarchieLinien = hierRoh.filter(istLinie)
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
  // Kartenebenen (ebenen.ts): die gelesenen Linien mit ihrem Wert (nur Daten, die Zuordnung bleibt unten)
  const ebenen: EbenenDaten = {
    routennetz: routennetzEbene(routen, 'be:r', 'Veloroutennetz Masterplan', f => routentypAusCode(f.properties.Veloroutentyp),
      f => (f.properties.Veloroutentyp != null ? `Code ${String(f.properties.Veloroutentyp)}` : null)),
    tempo: tempoLinien.flatMap(f => { const t = featureTeile(f), v = zahlOderNull(f.properties.V_sig)
      return t.length && v != null ? [tempoObjekt(objektId('be:t', t), t, v, 'Geoportal, Signalisierte Höchstgeschwindigkeit')] : [] }),
    dtv: dtv.flatMap(f => { const t = featureTeile(f), nt = zahlOderNull(f.properties.Nt), nn = zahlOderNull(f.properties.Nn)
      return t.length && nt != null && nn != null ? [dtvLinie(objektId('be:d', t), t, dtvFromNtNn(nt, nn), 'Geoportal, Flächendeckende Verkehrsdaten')] : [] }),
    hierarchie: hierarchieLinien.flatMap(f => { const t = featureTeile(f), h = hierarchieKurz(f.properties.Strassenhierarchie)
      return t.length && h ? [{ id: objektId('be:h', t), linien: t, klasse: h, text: `${String(f.properties.Strassenhierarchie)} (Geoportal, Strassenhierarchie)` }] : [] }),
    velostrasse: velostrassen.flatMap(f => { const t = featureTeile(f)
      return t.length ? [{ id: objektId('be:v', t), linien: t, klasse: 'velostrasse', text: `Velostrasse${f.properties.Name ? ` ${f.properties.Name}` : ''} (Geoportal)` }] : [] }),
  }
  return { fehler, ebenen, cands: cands.map(c => {
    const dense = densify(c.geom, SAMPLE_M)
    const speed = bestOverlapValue(dense, tempoLinien, f => zahlOderNull(f.properties.V_sig), OVERLAP_M, MIN_FRACTION)
    const dtvVal = bestOverlapValue(dense, dtv, f => {
      const nt = zahlOderNull(f.properties.Nt), nn = zahlOderNull(f.properties.Nn)
      return nt != null && nn != null ? dtvFromNtNn(nt, nn) : null
    }, OVERLAP_M, MIN_FRACTION)
    const hierarchie = bestOverlapValue(dense, hierarchieLinien, f => hierarchieKurz(f.properties.Strassenhierarchie), OVERLAP_M, MIN_FRACTION)
    const routentyp = bestOverlapValue(dense, routen,
      f => routentypAusCode(f.properties.Veloroutentyp), OVERLAP_M, MIN_FRACTION)
    // Velostrasse setzt die Ist-Führungsform → strenger (VELO_FRACTION), damit eine bloss
    // kreuzende Velostrasse die OSM-Führungsform nicht fälschlich überschreibt.
    const velostrasse = bestOverlapFeature(dense, velostrassen, OVERLAP_M, VELO_FRACTION) != null
    // Geprüft = Layer hat geantwortet UND (Wert gefunden ODER am Abschnitt liegt kein Eintrag).
    const dtvGeprueft = dtvLayerOk &&
      (dtvVal != null || anteilAbgedeckt(dense, dtvLinien, OVERLAP_M) <= DTV_LEER_MAX)
    // `!= null` statt falsy (07.08.2026): DTV 0 (Nt=Nn=0) und Tempo 0 sind gültige amtliche
    // Werte — als „fehlt" behandelt log der Chip („angenommen" statt „amtlich").
    if (speed == null && dtvVal == null && !routentyp && !velostrasse && !dtvGeprueft && !hierarchie) return c
    return {
      ...c,
      bern: {
        ...c.bern,   // vorhandene Anreicherung nicht verwerfen (wie die übrigen Adapter)
        ...(speed != null ? { speed } : {}),
        ...(dtvVal != null ? { dtv: dtvVal } : {}),
        ...(routentyp === 'Velohauptroute' || routentyp === 'Veloroute' ? { routentyp } : {}),
        ...(velostrasse ? { velostrasse: true } : {}),
        ...(dtvGeprueft ? { dtvGeprueft: true } : {}),
        ...(hierarchie ? { hierarchie } : {}),
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
  oevHalt: boolean; oevHaltName?: string; oevHaltQuelle?: string; oevTram: boolean; oevBus: boolean; busPerH?: number
  // Bus-Takt AUF der Strecke (Umweltspur; seit 21.10.2026, wie linien_takt.py im lokalen Rechner): Fahrten/h an der
  // nächsten Haltekante einer Buslinie des Segments (bis STRECKE_HALT_M), auch ohne Haltestelle im Abschnitt
  streckePerH?: number; streckeHalt?: string
}
const STRECKE_HALT_M = 250   // Haltestellenabstand: so weit darf die Haltekante der Linie vom Segment liegen (QUAY_MAXD lokal)
const LINIE_HALT_M = 30      // Haltestelle «an der Linie», wenn ≤ 30 m von ihr

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
// Tram in der Fahrbahn wie im lokalen Rechner (anreichern/situativ_flag.py, Merkmal «tram»: coverage, maxd 15 m, frac 0,5,
// parallel): Abschnitte, die ungefähr parallel zum Segment liegen (bis TRAM_WINKEL), decken mindestens TRAM_ANTEIL der
// Segmentpunkte bis TRAM_ABSCHNITT_M ab. Die Parallelität (wie soll_ist_analyse.parallel) wirft quer einmündende Gleise raus.
export const TRAM_ABSCHNITT_M = 15, TRAM_ANTEIL = 0.5, TRAM_WINKEL = 30
const richtungM = (a: LL, b: LL): [number, number] => {
  const k = Math.cos(a.lat * Math.PI / 180)
  return [(b.lon - a.lon) * k * 111320, (b.lat - a.lat) * 111320]
}
function parallelZu(linie: LL[], dense: LL[]): boolean {
  if (linie.length < 2 || dense.length < 2) return false
  const [vx, vy] = richtungM(linie[0], linie[linie.length - 1]), n = Math.hypot(vx, vy)
  if (n < 1e-6) return true                                    // zu kurz für eine Richtung → nicht ablehnen
  const mitte = linie[linie.length >> 1]
  let best = 0, bd = Infinity
  for (let i = 0; i < dense.length - 1; i++) { const d = distPointToLineM(mitte, [dense[i], dense[i + 1]]); if (d < bd) { bd = d; best = i } }
  const [sx, sy] = richtungM(dense[best], dense[best + 1]), m = Math.hypot(sx, sy)
  return m < 1e-6 || Math.abs((vx * sx + vy * sy) / (n * m)) >= Math.cos(TRAM_WINKEL * Math.PI / 180)
}
export function tramInFahrbahn(dense: LL[], abschnitte: LL[][]): boolean {
  const teile = abschnitte.flatMap(l => { const t: LL[][] = [[]]; for (const p of l) { if (Number.isNaN(p.lat)) t.push([]); else t[t.length - 1].push(p) }; return t })
    .filter(l => l.length >= 2 && parallelZu(l, dense))
  if (!teile.length || !dense.length) return false
  const treffer = dense.filter(p => teile.some(l => distPointToLineM(p, l) <= TRAM_ABSCHNITT_M)).length
  return treffer / dense.length >= TRAM_ANTEIL
}

export async function loadOev(cands: Cand[]): Promise<{ byId: Map<number, OevInfo>; stops: Stop[]; fehler: string[]; ebenen?: EbenenDaten }> {
  const fehler: string[] = []
  if (cands.length === 0) return { byId: new Map(), stops: [], fehler }
  const bbox = bboxOf(cands)
  const [haltGeo, linienRoh, tramRoh, takt] = await Promise.all([
    versuch('ÖV-Haltestellen', fetchBernGeojson('Haltestellen', bbox, 'Punktname,Id_opendata,Nummer_nach'), [], fehler),
    versuch('ÖV-Linien', fetchBernGeojson('OeV_Linien', bbox, 'Verkehrsmittel_typ,Nummer_linie,Linienname'), [], fehler),
    versuch('Verkehrsdaten Tram', fetchBernGeojson('Verkehrsdaten_Tram', bbox, 'Nt,Nn,Strassenname'), [], fehler),
    loadTakt(),
  ])
  const linienGeo = linienRoh.filter(istLinie)
  // Verkehrsmittel je Liniennummer (OeV_Linien, Feld Verkehrsmittel_typ), für den Typ der Haltestelle (seit 01.11.2026)
  const modusJeLinie = new Map<string, 'tram' | 'bus'>()
  for (const f of linienGeo) {
    const nr = f.properties.Nummer_linie, typ = f.properties.Verkehrsmittel_typ
    if (nr != null && (typ === 'Tram' || typ === 'Bus' || typ === 'Trolleybus')) modusJeLinie.set(String(nr), typ === 'Tram' ? 'tram' : 'bus')
  }
  // Tram in der Fahrbahn aus «Verkehrsdaten Tram» (Strassenabschnitte mit Tramverkehr), wie der lokale Rechner (seit 01.11.2026;
  // vorher der Linienverlauf aus OeV_Linien bis TRAM_OVERLAP_M)
  const tramAbschnitte = tramRoh.filter(istLinie)
  const tramGeo = tramAbschnitte.map(featureLatLon)
  // Haltestellen-Punkte ([lon,lat]) für die Karte (mit BPUIC für den Fahrplan-Join). Das Feld Nummer_nach listet die Linien
  // («<li>9 Wabern</li>…»); ihr Verkehrsmittel gibt den Typ, ohne bekannte Linie die Lage an einem Tramgleis (bis 30 m).
  const stops: Stop[] = haltGeo
    .filter(f => f.geometry?.type === 'Point')
    .map(f => {
      const [lon, lat] = f.geometry!.coordinates as number[]
      const bpuic = f.properties.Id_opendata != null ? String(f.properties.Id_opendata) : undefined
      const perH = bpuic ? takt[bpuic] : undefined
      const linien = [...new Set([...String(f.properties.Nummer_nach ?? '').matchAll(/<li>\s*([^\s<]+)/g)].map(m => m[1]))]
      const modi = new Set(linien.map(l => modusJeLinie.get(l)).filter((m): m is 'tram' | 'bus' => !!m))
      if (!modi.size) { if (tramGeo.some(l => distPointToLineM({ lat, lon }, l) <= STOP_DIST_M)) modi.add('tram'); else if (linien.length) modi.add('bus') }
      return { lat, lon, name: String(f.properties.Punktname ?? 'Haltestelle'), bpuic, ...(perH != null && perH > 0 ? { perH } : {}),
        ...(modi.size ? { modi: [...modi].sort((a, b) => (a === 'tram' ? -1 : b === 'tram' ? 1 : 0)) } : {}), ...(linien.length ? { linien } : {}) }
    })
  // Buslinien (Bus/Trolleybus) für den Takt auf der Strecke; Tram siehe tramGeo oben
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
    const oevTram = tramInFahrbahn(dense, tramGeo)
    const segLinien = busLines.filter(l => overlapScore(dense, l, OVERLAP_M) >= MIN_FRACTION)
    const oevBus = segLinien.length > 0
    if (nearStop || oevTram || oevBus) {
      const busPerH = nearStop?.bpuic ? takt[nearStop.bpuic] : undefined
      // Takt auf der Strecke: die nächste Haltestelle mit Takt, die an einer Buslinie des Segments liegt
      let strecke: { perH: number; name: string } | undefined
      if (oevBus) {
        let best = STRECKE_HALT_M
        for (const st of stops) {
          const perH = st.bpuic ? takt[st.bpuic] : undefined
          if (perH == null || perH <= 0) continue
          const d = distPointToLineM(st, dense)
          if (d > best || !segLinien.some(l => distPointToLineM(st, l) <= LINIE_HALT_M)) continue
          best = d; strecke = { perH, name: st.name }
        }
      }
      byId.set(c.id, { oevHalt: !!nearStop, oevHaltName: nearStop?.name, oevTram, oevBus, busPerH,
        ...(strecke ? { streckePerH: strecke.perH, streckeHalt: strecke.name } : {}) })
    }
  }
  // Kartenebene «ÖV-Linien» (ebenen.ts): die gelesenen Linien mit ihrem Verkehrsmittel
  // (Tram: die Abschnitte aus «Verkehrsdaten Tram», die die App für «Tram in der Fahrbahn» liest; Bus: die Buslinien)
  const zahl = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 10) / 10).replace('.', ',') : '?')
  const oev: EbenenObjekt[] = [
    ...tramAbschnitte.flatMap(f => { const t = featureTeile(f)
      return t.length ? [{ id: objektId('be:tram', t), linien: t, klasse: 'tram',
        text: `Tram${f.properties.Strassenname ? ` ${String(f.properties.Strassenname)}` : ''}: tagsüber Ø ${zahl(f.properties.Nt)}, nachts Ø ${zahl(f.properties.Nn)} Fahrten je Stunde (Geoportal, Verkehrsdaten Tram)` }] : [] }),
    ...linienGeo.flatMap(f => {
      const t = featureTeile(f), typ = f.properties.Verkehrsmittel_typ
      if (!t.length || (typ !== 'Bus' && typ !== 'Trolleybus')) return []
      return [{ id: objektId(`be:o${f.properties.Nummer_linie ?? ''}`, t), linien: t, klasse: 'bus',
        text: `${String(f.properties.Linienname ?? typ)} (Geoportal, ÖV-Linien)` }]
    }),
  ]
  return { byId, stops, fehler, ebenen: { oev } }
}

/** Fresh source cycle; reuse within one cycle remains allowed. */
export function quellenCacheLeeren() { velostrassenCache = null; taktCache = null }
