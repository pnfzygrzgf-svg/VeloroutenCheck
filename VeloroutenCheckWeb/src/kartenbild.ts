// ── Kartenbild des Berichts (Bericht.tsx): Ausschnitt und Luftbild per WMS, ohne Leaflet ──
//
// Ein einziges Luftbild SWISSIMAGE per WMS (wms.geo.admin.ch) in LV95 (EPSG:2056) für einen festen
// Ausschnitt, wie in fgsCheck (daten/luftbild.ts, wmsBildUrl). Eigene Datei, damit die Rechnung ohne
// Browser testbar ist (VeloMap braucht window).

import type { P } from './lv95'

const RAND_M = 15                      // Rand um die Achse im Kartenbild
const MIN_M = 60                       // kleinste Kantenlänge des Ausschnitts
// Seitenverhältnis Höhe/Breite des Kartenbilds: höchstens 0,6 (rund 112 mm hoch), damit Kartenbild und Angaben auf Seite 1 passen;
// ein hoher Abschnitt wird dafür seitlich weiter gefasst, nicht abgeschnitten
const HOCH_MIN = 0.45, HOCH_MAX = 0.6
export type Box = [number, number, number, number]

export function wmsBildUrl(box: Box, breitePx: number, hoehePx: number): string {
  const b = box.map(v => v.toFixed(1)).join(',')
  return 'https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.swisstopo.swissimage&STYLES=' +
    `&CRS=EPSG:2056&BBOX=${b}&WIDTH=${breitePx}&HEIGHT=${hoehePx}&FORMAT=image/jpeg`
}

// Ausschnitt um die Achsen mit Rand; Seitenverhältnis Höhe/Breite zwischen HOCH_MIN und HOCH_MAX.
export function ausschnitt(achsen: P[][]): Box | null {
  const pts = achsen.flat()
  if (!pts.length) return null
  let e0 = Math.min(...pts.map(p => p[0])), e1 = Math.max(...pts.map(p => p[0]))
  let n0 = Math.min(...pts.map(p => p[1])), n1 = Math.max(...pts.map(p => p[1]))
  e0 -= RAND_M; e1 += RAND_M; n0 -= RAND_M; n1 += RAND_M
  const weiten = (a: number, b: number, l: number): [number, number] => { const m = (a + b) / 2; return [m - l / 2, m + l / 2] }
  if (e1 - e0 < MIN_M) [e0, e1] = weiten(e0, e1, MIN_M)
  if (n1 - n0 < MIN_M * HOCH_MIN) [n0, n1] = weiten(n0, n1, MIN_M * HOCH_MIN)
  const w = e1 - e0, h = n1 - n0
  if (h / w > HOCH_MAX) [e0, e1] = weiten(e0, e1, h / HOCH_MAX)
  else if (h / w < HOCH_MIN) [n0, n1] = weiten(n0, n1, w * HOCH_MIN)
  return [e0, n0, e1, n1]
}

// Flugjahr des Luftbilds: Metadaten je 1-km-Kachel (api3.geo.admin.ch, wie fgsCheck daten/luftbild.ts). Ein langer Abschnitt kann über
// Kacheln verschiedener Jahre laufen, darum die Kacheln entlang der Achse (gleichmässig ausgedünnt), nicht nur die Bildmitte.
export function flugjahrKacheln(achsen: P[][], max = 4): string[] {
  const alle = [...new Set(achsen.flat().map(p => `${Math.floor(p[0] / 1000) * 1000},${Math.floor(p[1] / 1000) * 1000}`))]
  if (alle.length <= max) return alle
  return Array.from({ length: max }, (_, i) => alle[Math.round(i * (alle.length - 1) / (max - 1))])
}
export function flugjahrUrl(kachel: string): string {
  const [e, n] = kachel.split(',').map(Number), g = `${e + 500},${n + 500},${e + 501},${n + 501}`
  return `https://api3.geo.admin.ch/rest/services/api/MapServer/identify?geometry=${g}&geometryType=esriGeometryEnvelope` +
    `&layers=all:ch.swisstopo.images-swissimage-dop10.metadata&mapExtent=${g}&imageDisplay=10,10,96&tolerance=0&sr=2056` +
    '&returnGeometry=false&lang=de&limit=1'
}
/** Flugjahre der Kacheln, aufsteigend («2023, 2024»); leer, wenn keines verfügbar ist (der Bericht bleibt dann ohne Angabe) */
export async function ladeFlugjahre(achsen: P[][], signal?: AbortSignal): Promise<string> {
  const jahre = await Promise.all(flugjahrKacheln(achsen).map(async k => {
    try {
      const r = await fetch(flugjahrUrl(k), { signal })
      if (!r.ok) return ''
      const d = await r.json() as { results?: { attributes?: { datenstand?: unknown } }[] }
      return String(d.results?.[0]?.attributes?.datenstand ?? '')
    } catch { return '' }
  }))
  return [...new Set(jahre.filter(j => /^\d{4}$/.test(j)))].sort().join(', ')
}
