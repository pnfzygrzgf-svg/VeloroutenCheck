// ── Amtliche Vermessung: Bodenbedeckung (LCSF) über den WFS von geodienste.ch ─
//
// Für die Breitenmessung (breitenmessung.ts): Die Kante der Fläche «Strasse_Weg» ist die
// Bordsteinkante. Muster aus fgsCheck (src/daten/av.ts): GeoJSON in LV95 (E, N), die Flächen
// werden nicht auf die BBOX zugeschnitten. CORS offen (geprüft in fgsCheck, 10.10.2026).
//
// Nutzung nach den Betriebsbestimmungen von geodienste.ch (Fair Use: rund 10 WFS-Abfragen pro
// Minute bei 1 MB); geladen wird nur beim Messen, ein Rechteck um den sichtbaren Ausschnitt.
// Freigeschaltet für Bern, Zürich und Basel (Nutzerentscheid 16.10.2026); Luzern gibt die AV
// über geodienste.ch nur mit Freigabe ab. Quellenangabe je Kanton (avQuelle).

import type { P } from './lv95'
import { holeJson } from './netz'

export interface AvFlaeche {
  art: string        // Strasse_Weg, Trottoir, Verkehrsinsel, uebrige_befestigte, Gebaeude, …
  ringe: P[][]       // äusserer Ring + Löcher; bei MultiPolygon je Teil eine eigene Fläche
}

const WFS = 'https://geodienste.ch/db/av_0/deu'
export const avQuelle = (kanton: string) => `Amtliche Vermessung, Kanton ${kanton}, geodienste.ch`

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
