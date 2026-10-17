// ── Parkierung je Seite aus amtlichen Parkplatzdaten (Bern, Zürich, Luzern) ──
//
// Belegt «Parkierung rechts (Dooring)» je Seite vor (Nutzerentscheid 16.10.2026: jede Parkierung
// zählt, auch Quer- und Schrägparkierung). Regel wie im lokalen Berner Rechner (situativ_flag.py
// parken: mode coverage, maxd 9 m, frac 0,30): Eine Seite hat Parkierung, wenn auf mindestens
// PARK_SCHWELLE ihrer Länge Parkfelder bis PARK_MAX_M neben der Achse liegen. Gemessen in Bins
// von BIN_M entlang des Segments; die Seite ergibt sich aus der Lage links oder rechts der
// Way-Richtung. Basel liefert keine Geometrie der Parkfelder (data.bs.ch 100329 nur Tabelle).
//
// Quellen (CORS geprüft 16.10.2026), alle in LV95 abgefragt:
//   Bern    map.bern.ch WFS «Parkplätze öffentlich», je Flächen-Typ eine Abfrage. Nur in LV95: In
//           WGS84 rechnet der Dienst ohne Datumsübergang um (rund 150 m daneben, fgsCheck).
//   Zürich  WFS ogd.stadt-zuerich.ch «öffentlich zugängliche Parkplätze DAV» (CC0), Punkte je Feld
//           und Linien für Abschnitte nach Länge.
//   Luzern  ArcGIS REST map.stadtluzern.ch OGD/oeffentlicher_parkplatz, Flächen je Parkgruppe.

import type { Cand } from './VeloMap'
import { zuLv95, type P } from './lv95'
import { holeJson } from './netz'

export const PARK_MAX_M = 9
export const PARK_SCHWELLE = 0.3
const BIN_M = 10
const ENDE_M = 2          // Fusspunkt näher am Segment-Ende: Feld liegt eher an der Querstrasse
const SEITE_MIN_M = 0.5   // näher an der Achse: keiner Seite zuzuordnen
const DICHTE_M = 2        // Flächen- und Linienränder auf diese Punktdichte bringen

// Anteil der Länge [0…1] mit Parkierung rechts bzw. links der Way-Richtung.
export interface ParkInfo { rechts: number; links: number }

// Linie (oder Ring) auf Punkte im Abstand ≤ DICHTE_M bringen.
export function verdichten(linie: P[]): P[] {
  const aus: P[] = []
  for (let i = 0; i < linie.length; i++) {
    const a = linie[i]
    aus.push(a)
    const b = linie[i + 1]
    if (!b) break
    const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / DICHTE_M)
    for (let k = 1; k <= n; k++) aus.push([a[0] + (b[0] - a[0]) * k / (n + 1), a[1] + (b[1] - a[1]) * k / (n + 1)])
  }
  return aus
}

// Reine Rechnung (testbar): je Achse (LV95, Way-Richtung) die Anteile mit Parkierung je Seite.
export function parkAnteile(achse: P[], punkte: P[]): ParkInfo {
  const laengen = [0]
  for (let i = 1; i < achse.length; i++)
    laengen.push(laengen[i - 1] + Math.hypot(achse[i][0] - achse[i - 1][0], achse[i][1] - achse[i - 1][1]))
  const L = laengen[laengen.length - 1]
  if (L <= 0) return { rechts: 0, links: 0 }
  const nb = Math.max(1, Math.ceil(L / BIN_M))
  const rechts = new Array<boolean>(nb).fill(false), links = new Array<boolean>(nb).fill(false)
  let minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity
  for (const [e, n] of achse) { minE = Math.min(minE, e); minN = Math.min(minN, n); maxE = Math.max(maxE, e); maxN = Math.max(maxN, n) }
  for (const p of punkte) {
    if (p[0] < minE - PARK_MAX_M || p[0] > maxE + PARK_MAX_M || p[1] < minN - PARK_MAX_M || p[1] > maxN + PARK_MAX_M) continue
    let bestD = Infinity, bestS = 0, bestQuer = 0
    for (let i = 1; i < achse.length; i++) {
      const a = achse[i - 1], b = achse[i]
      const de = b[0] - a[0], dn = b[1] - a[1], l2 = de * de + dn * dn
      if (l2 === 0) continue
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * de + (p[1] - a[1]) * dn) / l2))
      const fe = a[0] + t * de, fn = a[1] + t * dn
      const d = Math.hypot(p[0] - fe, p[1] - fn)
      if (d < bestD) {
        const l = Math.sqrt(l2)
        bestD = d; bestS = laengen[i - 1] + t * l
        bestQuer = (de * (p[1] - a[1]) - dn * (p[0] - a[0])) / l   // > 0: links der Way-Richtung
      }
    }
    if (bestD > PARK_MAX_M || bestS < ENDE_M || bestS > L - ENDE_M || Math.abs(bestQuer) < SEITE_MIN_M) continue
    const bin = Math.min(nb - 1, Math.floor(bestS / BIN_M))
    if (bestQuer > 0) links[bin] = true; else rechts[bin] = true
  }
  return { rechts: rechts.filter(Boolean).length / nb, links: links.filter(Boolean).length / nb }
}

// ── Lader: je Stadt alle Parkierungs-Punkte (LV95) im Rechteck [minE, minN, maxE, maxN] ──
export type Box = [number, number, number, number]
interface GeoJson { features?: { properties?: Record<string, unknown> | null; geometry?: { type?: string; coordinates?: unknown } | null }[] }

// Alle Koordinatenpaare einer GeoJSON-Geometrie als Punkte; Linien und Ringe verdichtet.
function punkteAus(g: { type?: string; coordinates?: unknown } | null | undefined): P[] {
  if (!g || !Array.isArray(g.coordinates)) return []
  const paar = (x: unknown): P | null => (Array.isArray(x) && Number.isFinite(x[0]) && Number.isFinite(x[1]) ? [x[0], x[1]] : null)
  const linie = (xs: unknown): P[] => (Array.isArray(xs) ? verdichten(xs.map(paar).filter((p): p is P => !!p)) : [])
  const c = g.coordinates as unknown[]
  switch (g.type) {
    case 'Point': { const p = paar(c); return p ? [p] : [] }
    case 'MultiPoint': return c.map(paar).filter((p): p is P => !!p)
    case 'LineString': return linie(c)
    case 'MultiLineString': case 'Polygon': return c.flatMap(linie)
    case 'MultiPolygon': return c.flatMap(poly => (Array.isArray(poly) ? poly.flatMap(linie) : []))
    default: return []
  }
}

// Bern: Flächen-Typen, die als Parkierung zählen (wie PARKEN_NOTENRELEVANT im lokalen Rechner);
// bei Spezialfeldern ohne Polizei, Lastwagen und Sanität.
const BERN_TYPEN = ['Parkfeld_Gebuehrenpflichtig', 'Parkfeld_blau_APK', 'Parkfeld_weiss_APK', 'Parkfeld_weiss_Kurzzeit',
  'Parkverbot', 'Spezialfeld', 'Andere_Unbekannt']
export const bernSpezialAusgeschlossen = (pr: Record<string, unknown>): boolean =>
  /polizei|lastwagen|lkw|sanit|ambulanz|feuerwehr/i.test(`${pr.Art_beschrieb ?? ''} ${pr.Subgruppe_beschrieb ?? ''} ${pr.Gruppe_beschrieb ?? ''}`)
// Die zählenden Felder je Flächen-Typ (für die Vorbelegung als Punkte, für die Karte als Flächen).
async function bernFelder([a, b, c, d]: Box): Promise<{ typ: string; g: { type?: string; coordinates?: unknown } | null | undefined }[]> {
  const ant = await Promise.all(BERN_TYPEN.map(t => holeJson<GeoJson & { crs?: { properties?: { name?: string } } }>(
    'https://map.bern.ch/arcgis/services/Geoportal/Parkplaetze_oeffentlich/MapServer/WFSServer?SERVICE=WFS&VERSION=2.0.0' +
    `&REQUEST=GetFeature&TYPENAMES=Geoportal_Parkplaetze_oeffentlich_2:${t}&OUTPUTFORMAT=GEOJSON` +
    `&SRSNAME=urn:ogc:def:crs:EPSG::2056&BBOX=${a},${b},${c},${d},urn:ogc:def:crs:EPSG::2056`, 30000)))
  // Antwort ohne LV95-Kennung wäre WGS84 mit dem Versatz des Dienstes → nicht verwenden.
  if (ant.some(j => j.features?.length && !/(^|[^0-9])2056$/.test(j.crs?.properties?.name ?? '')))
    throw new Error('Parkfelder Bern nicht in LV95')
  return ant.flatMap((j, i) => (j.features ?? [])
    .filter(f => BERN_TYPEN[i] !== 'Spezialfeld' || !bernSpezialAusgeschlossen(f.properties ?? {}))
    .map(f => ({ typ: BERN_TYPEN[i], g: f.geometry })))
}
async function bernLaden(box: Box): Promise<P[]> {
  return (await bernFelder(box)).flatMap(f => punkteAus(f.g))
}

// ── Parkfelder als Flächen für die Karte (Aufteilung planen, seit 16.10.2026; Bern, Zürich, Luzern) ──
// Dieselben Felder, die für die Vorbelegung zählen. verbot: Parkverbotsfeld (zählt ebenfalls).
export interface ParkFlaeche { verbot: boolean; ringe: P[][] }
// Zürich (seit 17.10.2026): Längsstreifen als Linien, als 2 m breite Streifen gezeichnet, und Einzelfelder
// als Punkte, als 2 × 2 m grosse Quadrate (die Daten nennen nur Längs/Quer/Schräg, nicht den Winkel zur Strasse).
// Luzern (seit 17.10.2026): Flächen wie für die Vorbelegung. Basel: keine Geometrie.
export const PARK_QUELLE: Partial<Record<ParkStadt, string>> = {
  bern: 'Geodaten Stadt Bern, Parkplätze öffentlich',
  zurich: 'Stadt Zürich, öffentlich zugängliche Parkplätze (DAV), als Streifen bzw. Punkte',
  luzern: '© Geoinformationszentrum Stadt Luzern, öffentliche Parkplätze',
}
// Linie als Streifen der Breite 2·halb [m]: je Stück ein Viereck (Überlappungen an Knicken sind gewollt einfach)
export function streifen(linie: P[], halb: number): P[][] {
  const aus: P[][] = []
  for (let i = 1; i < linie.length; i++) {
    const a = linie[i - 1], b = linie[i], de = b[0] - a[0], dn = b[1] - a[1], l = Math.hypot(de, dn)
    if (l < 0.05) continue
    const nx = -dn / l * halb, ny = de / l * halb
    aus.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]])
  }
  return aus
}
const quadrat = (p: P, h: number): P[] => [[p[0] - h, p[1] - h], [p[0] + h, p[1] - h], [p[0] + h, p[1] + h], [p[0] - h, p[1] + h]]
async function zurichFlaechen([a, b, c, d]: Box): Promise<ParkFlaeche[]> {
  const url = (t: string) => 'https://www.ogd.stadt-zuerich.ch/wfs/geoportal/oeffentlich_zugaengliche_Parkplaetze_DAV' +
    `?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=${t}&SRSNAME=EPSG:2056` +
    `&BBOX=${a},${b},${c},${d},EPSG:2056&OUTPUTFORMAT=application/vnd.geo%2Bjson`
  const [pt, li] = await Promise.all([holeJson<GeoJson>(url('oeff_strassenparkierung_dav_p'), 30000),
    holeJson<GeoJson>(url('oeff_strassenparkierung_dav_l'), 30000)])
  const aus: ParkFlaeche[] = []
  for (const f of (li.features ?? [])) {
    const g = f.geometry
    const linien = (g?.type === 'MultiLineString' ? g.coordinates : g?.type === 'LineString' ? [g.coordinates] : []) as number[][][]
    for (const l of linien) for (const q of streifen(l.map(p => [p[0], p[1]] as P), 1.0)) aus.push({ verbot: false, ringe: [q] })
  }
  for (const f of pt.features ?? []) {
    const g = f.geometry
    const punkte = (g?.type === 'MultiPoint' ? g.coordinates : g?.type === 'Point' ? [g.coordinates] : []) as number[][]
    for (const q of punkte) if (Number.isFinite(q?.[0]) && Number.isFinite(q?.[1])) aus.push({ verbot: false, ringe: [quadrat([q[0], q[1]], 1.0)] })
  }
  return aus
}
async function luzernFlaechen([a, b, c, d]: Box): Promise<ParkFlaeche[]> {
  const p = new URLSearchParams({ geometry: `${a},${b},${c},${d}`, geometryType: 'esriGeometryEnvelope', inSR: '2056',
    spatialRel: 'esriSpatialRelIntersects', outFields: 'SUBTYPE_TEXT', outSR: '2056', f: 'geojson', where: '1=1' })
  const j = await holeJson<GeoJson>(`https://map.stadtluzern.ch/server/rest/services/OGD/oeffentlicher_parkplatz/MapServer/13/query?${p}`, 30000)
  const ring = (xs: unknown): P[] => (Array.isArray(xs)
    ? xs.filter(q => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1])).map(q => [q[0], q[1]] as P) : [])
  return (j.features ?? []).filter(f => !/zweirad|blaulicht/i.test(String(f.properties?.SUBTYPE_TEXT ?? ''))).flatMap(f => {
    const g = f.geometry
    if (!g || !Array.isArray(g.coordinates)) return []
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    return (polys as unknown[]).filter(Array.isArray).map(poly => ({ verbot: false, ringe: (poly as unknown[]).map(ring) }))
  })
}
export async function ladeParkflaechen(stadt: ParkStadt, box: Box): Promise<ParkFlaeche[]> {
  if (stadt === 'zurich') return zurichFlaechen(box)
  if (stadt === 'luzern') return luzernFlaechen(box)
  if (stadt !== 'bern') return []
  const ring = (xs: unknown): P[] => (Array.isArray(xs)
    ? xs.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).map(p => [p[0], p[1]] as P) : [])
  return (await bernFelder(box)).flatMap(({ typ, g }) => {
    if (!g || !Array.isArray(g.coordinates)) return []
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    return (polys as unknown[]).filter(Array.isArray).map(poly => ({ verbot: typ === 'Parkverbot', ringe: (poly as unknown[]).map(ring) }))
  })
}

// Zürich: Punkte je Feld (ohne Motorrad/Velo) und Linien der Abschnitte nach Länge.
async function zurichLaden([a, b, c, d]: Box): Promise<P[]> {
  const url = (t: string) => 'https://www.ogd.stadt-zuerich.ch/wfs/geoportal/oeffentlich_zugaengliche_Parkplaetze_DAV' +
    `?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=${t}&SRSNAME=EPSG:2056` +
    `&BBOX=${a},${b},${c},${d},EPSG:2056&OUTPUTFORMAT=application/vnd.geo%2Bjson`
  const [pt, li] = await Promise.all([holeJson<GeoJson>(url('oeff_strassenparkierung_dav_p'), 30000),
    holeJson<GeoJson>(url('oeff_strassenparkierung_dav_l'), 30000)])
  return [...(pt.features ?? []), ...(li.features ?? [])]
    .filter(f => !/motorrad|velo/i.test(String(f.properties?.art ?? f.properties?.typ ?? '')))
    .flatMap(f => punkteAus(f.geometry))
}

// Luzern: Flächen je Parkgruppe, ohne Zweiradabstellplätze und Blaulicht.
async function luzernLaden([a, b, c, d]: Box): Promise<P[]> {
  const p = new URLSearchParams({ geometry: `${a},${b},${c},${d}`, geometryType: 'esriGeometryEnvelope', inSR: '2056',
    spatialRel: 'esriSpatialRelIntersects', outFields: 'SUBTYPE_TEXT', outSR: '2056', f: 'geojson', where: '1=1' })
  const j = await holeJson<GeoJson>(`https://map.stadtluzern.ch/server/rest/services/OGD/oeffentlicher_parkplatz/MapServer/13/query?${p}`, 30000)
  return (j.features ?? []).filter(f => !/zweirad|blaulicht/i.test(String(f.properties?.SUBTYPE_TEXT ?? '')))
    .flatMap(f => punkteAus(f.geometry))
}

export type ParkStadt = 'bern' | 'zurich' | 'luzern'
const LADER: Record<ParkStadt, (b: Box) => Promise<P[]>> = { bern: bernLaden, zurich: zurichLaden, luzern: luzernLaden }

// Kandidaten anreichern: ein Abruf für das Rechteck aller Kandidaten (+ PARK_MAX_M), dann je
// Kandidat die Anteile. Jeder Kandidat erhält einen Eintrag (auch 0/0 = nachgesehen, nichts da).
export async function enrichParkierung(cands: Cand[], stadt: ParkStadt): Promise<Map<number, ParkInfo>> {
  const out = new Map<number, ParkInfo>()
  if (cands.length === 0) return out
  const achsen = cands.map(c => ({ id: c.id, achse: c.geom.map(p => zuLv95(p.lat, p.lon)) }))
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  for (const { achse } of achsen) for (const [e, n] of achse) { a = Math.min(a, e); b = Math.min(b, n); c = Math.max(c, e); d = Math.max(d, n) }
  const r = PARK_MAX_M + 5
  const punkte = await LADER[stadt]([a - r, b - r, c + r, d + r].map(v => Math.round(v * 10) / 10) as Box)
  for (const { id, achse } of achsen) out.set(id, parkAnteile(achse, punkte))
  return out
}
