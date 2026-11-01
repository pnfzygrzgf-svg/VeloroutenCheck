// ── Kartenbild des Berichts (Bericht.tsx): Ausschnitt und Luftbild per WMS, ohne Leaflet ──
//
// Ein einziges Luftbild SWISSIMAGE per WMS (wms.geo.admin.ch) in LV95 (EPSG:2056) für einen festen
// Ausschnitt, wie in fgsCheck (daten/luftbild.ts, wmsBildUrl). Eigene Datei, damit die Rechnung ohne
// Browser testbar ist (VeloMap braucht window).

import type { P } from './lv95'

const RAND_M = 15                      // Rand um die Achse im Kartenbild
const MIN_M = 60                       // kleinste Kantenlänge des Ausschnitts
// Seitenverhältnis Höhe/Breite des Kartenbilds: höchstens 0,75, damit Tabelle und Kartenbild immer auf Seite 1 passen
const HOCH_MIN = 0.45, HOCH_MAX = 0.75
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
