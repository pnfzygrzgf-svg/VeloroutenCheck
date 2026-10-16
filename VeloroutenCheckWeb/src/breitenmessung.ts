// ── Breite am Luftbild messen: ab Bordsteinkante (Bern, Zürich, Basel) ────────
//
// Nutzerentscheid 15.10.2026: Gemessen wird ab der Bordsteinkante bis zur Stelle der Markierung,
// die der Nutzer auf dem Luftbild anklickt; der Messwert ist die Breite an dieser Stelle. Die
// Bordsteinkante ist die Kante der AV-Fläche «Strasse_Weg» — dieselbe Grundlage wie die Breiten
// aus dem Berner Markierungsplan (velostreifen_dxf.py: rechtwinkliger Abstand der gelben Linie
// zur Strassenkante der AV). Gerechnet wird in LV95 (Meter).
//
// Geprüft am 16.10.2026 in Bern (für Zürich und Basel fehlt ein Markierungsplan zum Vergleich;
// die AV hat dort dieselbe Struktur), an 2 634 Strichen in 12 Ausschnitten der Stadt: Der
// Abstand Strich → Bordsteinkante (hier, AV von geodienste.ch) wich von der Breite im Plan im
// Median um 2,5 cm ab, bei 82 % um höchstens 10 cm. Die übrigen Abweichungen kommen vom
// Datenstand der AV und von inneren Kanten, die der Plan mitzählt, diese Rechnung aber bewusst
// nicht (sie sind kein Bord). Am Luftbild kommt die Klickgenauigkeit dazu (10 cm pro Pixel).

import type { AvFlaeche } from './av'
import type { P } from './lv95'

export interface Kante { a: P; b: P }

const PRUEF_M = 0.3      // Prüfpunkt beidseits der Kante: liegt die Aussenseite wieder auf Strasse?
export const FANG_M = 8  // weiter weg vom Klick liegt keine Bordsteinkante, die gemeint sein kann

// Gerade-Ungerade-Regel über alle Ringe (äusserer Ring + Löcher).
function imPolygon(pt: P, ringe: P[][]): boolean {
  let innen = false
  for (const r of ringe) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j]
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) innen = !innen
    }
  }
  return innen
}

type Box = [number, number, number, number]   // minE, minN, maxE, maxN
function box(ringe: P[][]): Box {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  for (const r of ringe) for (const [e, n] of r) { a = Math.min(a, e); b = Math.min(b, n); c = Math.max(c, e); d = Math.max(d, n) }
  return [a, b, c, d]
}
const inBox = (p: P, x: Box) => p[0] >= x[0] && p[0] <= x[2] && p[1] >= x[1] && p[1] <= x[3]

// Bordsteinkanten = Kanten der Strassenflächen, hinter denen KEINE Strasse liegt. Die AV teilt
// eine Strasse in mehrere Flächen; deren gemeinsame Kanten sind keine Bordsteine und fallen weg
// (Prüfpunkt 0,3 m auf der Aussenseite liegt in einer anderen Strassenfläche). Löcher einer
// Strassenfläche (Verkehrsinseln) zählen mit.
export function bordkanten(flaechen: AvFlaeche[]): Kante[] {
  const strassen = flaechen.filter(f => f.art === 'Strasse_Weg' && f.ringe.length && f.ringe[0].length >= 3)
    .map(f => ({ f, box: box(f.ringe) }))
  const aus: Kante[] = []
  for (const s of strassen) {
    for (const r of s.f.ringe) {
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length]
        const de = b[0] - a[0], dn = b[1] - a[1], l = Math.hypot(de, dn)
        if (l < 0.05) continue
        const m: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        const nx = -dn / l, ny = de / l
        const p1: P = [m[0] + PRUEF_M * nx, m[1] + PRUEF_M * ny], p2: P = [m[0] - PRUEF_M * nx, m[1] - PRUEF_M * ny]
        const aussen = imPolygon(p1, s.f.ringe) ? p2 : p1
        const innen = strassen.some(o => o !== s && inBox(aussen, o.box) && imPolygon(aussen, o.f.ringe))
        if (!innen) aus.push({ a, b })
      }
    }
  }
  return aus
}

// Nächster Punkt einer Strecke zu p.
function fusspunkt(p: P, k: Kante): { d: number; fuss: P } {
  const de = k.b[0] - k.a[0], dn = k.b[1] - k.a[1], l2 = de * de + dn * dn
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - k.a[0]) * de + (p[1] - k.a[1]) * dn) / l2))
  const fuss: P = [k.a[0] + t * de, k.a[1] + t * dn]
  return { d: Math.hypot(p[0] - fuss[0], p[1] - fuss[1]), fuss }
}

// Messung ab Bordsteinkante: kürzester Abstand vom Klick (auf der Markierung) zur nächsten
// Bordsteinkante, höchstens maxM. Rückgabe: Breite [m] und Fusspunkt auf der Kante.
export function messeAbKante(klick: P, kanten: Kante[], maxM = FANG_M): { breite: number; fuss: P } | null {
  let best: { d: number; fuss: P } | null = null
  for (const k of kanten) {
    const f = fusspunkt(klick, k)
    if (f.d <= maxM && (!best || f.d < best.d)) best = f
  }
  return best && { breite: best.d, fuss: best.fuss }
}

// Messung mit zwei Punkten (Bordsteinkante und Markierung von Hand), etwa wenn die AV-Kante nicht
// zum Bord passt.
export const abstand = (a: P, b: P): number => Math.hypot(a[0] - b[0], a[1] - b[1])

// Auf Zentimeter runden (Feldwert).
export const aufZentimeter = (m: number): number => Math.round(m * 100) / 100
