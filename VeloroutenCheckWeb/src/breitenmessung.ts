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
// Geprüft wird je Stück von höchstens STUECK_M (16.10.2026): Eine lange Kante, die nur auf einem
// Teil an eine andere Strassenfläche grenzt (Einmündung), fiel sonst ganz weg, wenn ihre Mitte
// zufällig in der Einmündung lag. Aufeinanderfolgende Bord-Stücke werden wieder zusammengefügt.
const STUECK_M = 2
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
        const nx = -dn / l, ny = de / l
        const teile = Math.max(1, Math.ceil(l / STUECK_M))
        let start: P | null = null
        for (let k = 0; k < teile; k++) {
          const t0 = k / teile, t1 = (k + 1) / teile
          const p0: P = [a[0] + de * t0, a[1] + dn * t0], q1: P = [a[0] + de * t1, a[1] + dn * t1]
          const m: P = [(p0[0] + q1[0]) / 2, (p0[1] + q1[1]) / 2]
          const p1: P = [m[0] + PRUEF_M * nx, m[1] + PRUEF_M * ny], p2: P = [m[0] - PRUEF_M * nx, m[1] - PRUEF_M * ny]
          const aussen = imPolygon(p1, s.f.ringe) ? p2 : p1
          const innen = strassen.some(o => o !== s && inBox(aussen, o.box) && imPolygon(aussen, o.f.ringe))
          if (!innen) { if (!start) start = p0 }
          else if (start) { aus.push({ a: start, b: p0 }); start = null }
          if (k === teile - 1 && start) aus.push({ a: start, b: q1 })
        }
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

// ── Fahrbahnbreite aus der AV (seit 16.10.2026) ───────────────────────────────
// Breite der Strassenfläche von Bordstein zu Bordstein, quer zur Achse des Abschnitts gemessen:
// Querschnitte alle QUER_SCHRITT_M entlang der OSM-Geometrie, je ein Strahl nach links und rechts
// bis zur ersten Bordsteinkante (bordkanten), Breite = Summe beider Abstände; Ergebnis = Median.
// Ausgelassen werden Querschnitte nahe den Segment-Enden (dort liegen meist Kreuzungen): je
// ENDE_FREI_M, bei kurzen Segmenten nur je ein Achtel der Länge (wie der lokale Berner Rechner),
// Punkte ausserhalb der Strassenfläche und Querschnitte ohne Kante innert QUER_MAX_M je Seite.
// Gemessen wird die ganze Fläche «Strasse_Weg»: Parkstreifen, Busbuchten und Tramgleise zählen
// mit; eine Verkehrsinsel (Loch der Fläche) begrenzt den Strahl.
export const QUER_SCHRITT_M = 5
const ENDE_FREI_M = 12
const QUER_MAX_M = 20
const BREITE_MIN_M = 3, BREITE_MAX_M = 30

// Abstand vom Punkt p entlang der Richtung d (Einheitsvektor) bis zur ersten Kante, oder Infinity.
function strahl(p: P, d: P, kanten: Kante[], maxM: number): number {
  let best = Infinity
  for (const k of kanten) {
    const ex = k.b[0] - k.a[0], ey = k.b[1] - k.a[1]
    const nenner = d[0] * ey - d[1] * ex
    if (Math.abs(nenner) < 1e-12) continue
    const ax = k.a[0] - p[0], ay = k.a[1] - p[1]
    const t = (ax * ey - ay * ex) / nenner        // Abstand entlang d
    const u = (ax * d[1] - ay * d[0]) / nenner    // Lage auf der Kante (0…1)
    if (t > 0 && t <= maxM && u >= 0 && u <= 1 && t < best) best = t
  }
  return best
}

export interface Fahrbahnbreite { median: number; min: number; max: number; n: number }

// achsen: Geometrien der Segmente des Abschnitts in LV95 (je eine Polylinie).
export function fahrbahnbreite(achsen: P[][], flaechen: AvFlaeche[], kanten: Kante[] = bordkanten(flaechen)): Fahrbahnbreite | null {
  const strassen = flaechen.filter(f => f.art === 'Strasse_Weg').map(f => ({ f, box: box(f.ringe) }))
  const aufStrasse = (p: P) => strassen.some(s => inBox(p, s.box) && imPolygon(p, s.f.ringe))
  const werte: number[] = []
  for (const linie of achsen) {
    let gesamt = 0
    for (let i = 1; i < linie.length; i++) gesamt += Math.hypot(linie[i][0] - linie[i - 1][0], linie[i][1] - linie[i - 1][1])
    const frei = Math.min(ENDE_FREI_M, gesamt / 8)
    let bisher = 0
    for (let i = 1; i < linie.length; i++) {
      const a = linie[i - 1], b = linie[i]
      const l = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (l < 0.01) continue
      const d: P = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], links: P = [-d[1], d[0]], rechts: P = [d[1], -d[0]]
      // Querschnitte auf dem Raster der ganzen Linie (alle QUER_SCHRITT_M ab Linienanfang)
      for (let s = Math.ceil(bisher / QUER_SCHRITT_M) * QUER_SCHRITT_M; s <= bisher + l; s += QUER_SCHRITT_M) {
        if (s < frei || s > gesamt - frei) continue
        const t = s - bisher
        const p: P = [a[0] + d[0] * t, a[1] + d[1] * t]
        if (!aufStrasse(p)) continue
        const w = strahl(p, links, kanten, QUER_MAX_M) + strahl(p, rechts, kanten, QUER_MAX_M)
        if (Number.isFinite(w) && w >= BREITE_MIN_M && w <= BREITE_MAX_M) werte.push(w)
      }
      bisher += l
    }
  }
  if (werte.length < 3) return null
  const sortiert = [...werte].sort((x, y) => x - y)
  const m = Math.floor(sortiert.length / 2)
  const median = sortiert.length % 2 ? sortiert[m] : (sortiert[m - 1] + sortiert[m]) / 2
  return { median, min: sortiert[0], max: sortiert[sortiert.length - 1], n: sortiert.length }
}
