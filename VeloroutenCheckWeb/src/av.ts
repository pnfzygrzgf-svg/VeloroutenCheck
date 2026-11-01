// ── Amtliche Vermessung: Bodenbedeckung (LCSF) über den WFS von geodienste.ch ─
//
// Für die Breitenmessung (breitenmessung.ts): Die Kante der Fläche «Strasse_Weg» ist die
// Bordsteinkante. Muster aus fgsCheck (src/daten/av.ts): GeoJSON in LV95 (E, N), die Flächen
// werden nicht auf die BBOX zugeschnitten. CORS offen (geprüft in fgsCheck, 10.10.2026).
//
// Nutzung nach den Betriebsbestimmungen von geodienste.ch (Fair Use: rund 10 WFS-Abfragen pro
// Minute bei 1 MB); geladen wird nur beim Messen, ein Rechteck um den sichtbaren Ausschnitt.
// Freigeschaltet für Bern, Zürich und Basel (Nutzerentscheid 16.10.2026); Luzern gibt die AV
// über geodienste.ch nur mit Freigabe ab, dort seit 17.10.2026 die Strassenflächen der Stadt
// (ladeAvLuzern). Quellenangabe je Kanton (avQuelle).

import type { P } from './lv95'
import { holeJson } from './netz'

export interface AvFlaeche {
  art: string        // Strasse_Weg, Trottoir, Verkehrsinsel, uebrige_befestigte, Gebaeude, …
  ringe: P[][]       // äusserer Ring + Löcher; bei MultiPolygon je Teil eine eigene Fläche
}

const WFS = 'https://geodienste.ch/db/av_0/deu'
// Luzern: Strassenflächen der Stadt statt der AV (siehe unten, ladeAvLuzern)
export const avQuelle = (kanton: string) => (kanton === 'Luzern'
  ? 'Strassenflächen Stadt Luzern, © Geoinformationszentrum Stadt Luzern'
  : `Amtliche Vermessung, Kanton ${kanton}, geodienste.ch`)

export function avUrl(e: number, n: number, radiusM: number): string {
  const bbox = [e - radiusM, n - radiusM, e + radiusM, n + radiusM].map(v => v.toFixed(1)).join(',')
  return `${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms:LCSF` +
    `&SRSNAME=EPSG:2056&BBOX=${bbox},EPSG:2056&OUTPUTFORMAT=geojson`
}

interface GeoJson {
  features?: { properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } | null }[]
}

/** GeoJSON (LCSF) → Flächen. Unbekannte Geometrietypen werden übergangen. */
export function avParsen(gj: GeoJson): AvFlaeche[] {
  const aus: AvFlaeche[] = []
  const zweiD = (r: number[][]) => r.map(p => [p[0], p[1]] as P)
  for (const f of gj.features ?? []) {
    const g = f.geometry
    if (!g) continue
    const art = String(f.properties?.Art ?? '')
    if (g.type === 'Polygon') aus.push({ art, ringe: (g.coordinates as number[][][]).map(zweiD) })
    else if (g.type === 'MultiPolygon')
      for (const teil of g.coordinates as number[][][][]) aus.push({ art, ringe: teil.map(zweiD) })
  }
  return aus
}

/** Bodenbedeckung im Quadrat ±radiusM um (e, n) laden. */
export async function ladeAv(e: number, n: number, radiusM: number): Promise<AvFlaeche[]> {
  return avParsen(await holeJson<GeoJson>(avUrl(e, n, radiusM), 30000))
}

// ── Luzern: Strassenflächen der Stadt statt der AV (seit 17.10.2026) ──────────
// Der Kanton Luzern gibt die AV über geodienste.ch nur mit Freigabe ab. Die Stadt Luzern
// veröffentlicht ihre Strassenflächen offen (OGD «Strassenflächen», ArcGIS REST, EPSG:2056, CORS
// offen; Quelle «© Geoinformationszentrum Stadt Luzern»): Flächen nach AV-Systematik (ART_BB).
// Strasse (5000) und Weg (5001) werden wie in der AV zu «Strasse_Weg», dazu Trottoir (2),
// Verkehrsinsel (3), übrige befestigte (7) und Gebäude (0). Abdeckung: Strassenraum der Stadt Luzern
// inklusive Littau, keine vollständige Bodenbedeckung. Höchstens 2 000 Flächen je Abfrage, darum
// seitenweise.
const LU_DIENST = 'https://map.stadtluzern.ch/server/rest/services/OGD/strassenflaeche/MapServer/3/query'
const LU_ART: Record<number, string> = { 5000: 'Strasse_Weg', 5001: 'Strasse_Weg', 2: 'Trottoir', 3: 'Verkehrsinsel', 7: 'uebrige_befestigte', 0: 'Gebaeude' }

export function luArt(code: unknown): string | null {
  return typeof code === 'number' && code in LU_ART ? LU_ART[code] : null
}

export async function ladeAvLuzern(e: number, n: number, radiusM: number): Promise<AvFlaeche[]> {
  const env = [e - radiusM, n - radiusM, e + radiusM, n + radiusM].map(v => v.toFixed(1)).join(',')
  const aus: AvFlaeche[] = []
  for (let offset = 0; offset < 20000; offset += 2000) {
    const q = new URLSearchParams({ geometry: env, geometryType: 'esriGeometryEnvelope', inSR: '2056', outSR: '2056',
      spatialRel: 'esriSpatialRelIntersects', outFields: 'ART_BB', returnGeometry: 'true', f: 'geojson',
      resultOffset: String(offset), resultRecordCount: '2000', orderByFields: 'OBJECTID' })   // ohne Sortierung schlägt das Blättern fehl
    const gj = await holeJson<{ features?: { properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } | null }[] }>(
      `${LU_DIENST}?${q}`, 30000)
    const feats = gj.features ?? []
    for (const f of avParsen({ features: feats.map(x => ({ ...x, properties: { Art: luArt(x.properties?.ART_BB) ?? '' } })) }))
      if (f.art) aus.push(f)
    if (feats.length < 2000) break
  }
  return aus
}

// Bodenbedeckung je Kanton: Luzern aus den Strassenflächen der Stadt, sonst die AV von geodienste.ch.
export const ladeAvFuer = (kanton: string, e: number, n: number, radiusM: number): Promise<AvFlaeche[]> =>
  (kanton === 'Luzern' ? ladeAvLuzern(e, n, radiusM) : ladeAv(e, n, radiusM))
