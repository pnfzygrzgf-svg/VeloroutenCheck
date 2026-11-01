// ── Markierungen im Luftbild erkennen (seit 25.10.2026, Probe; Nutzerwunsch Kirchenfeldstrasse 44425592) ─────────────
//
// Ziel: Spurgrenzen quer über die Fahrbahn vorschlagen, damit sich die Breiten der Fahrspuren und Velostreifen von heute
// nicht nur gleichmässig verteilt, sondern am Bestand ablesen lassen. Keine Daten dazu online (OSM width:lanes fehlt fast
// überall, der Berner Markierungsplan liegt nur lokal), darum aus dem Bild:
//   1. SWISSIMAGE (swisstopo, WMTS Web-Mercator, Stufe 20 ≈ 10 cm je Pixel; die Kacheln erlauben CORS) für den Ausschnitt
//      laden und auf eine Leinwand zeichnen.
//   2. Quer zur Achse viele parallele Profile (alle LAENGS_SCHRITT_M über LAENGS_M) lesen, je alle QUER_SCHRITT_M die
//      Helligkeit.
//   3. Je Profil die Helligkeit gegen den Belag daneben (gleitender Median über ±HINTERGRUND_M) vergleichen; hell = Markierung,
//      wenn sie um REL_KONTRAST heller ist UND um MIN_KONTRAST Grauwerte: relativ, damit Linien im Schatten von Gebäuden
//      (Probe Kirchenfeldstrasse: rechte Fahrbahnhälfte im Schatten) nicht verloren gehen.
//   4. Je Stelle quer zur Achse der Anteil der Profile, in denen es dort hell ist, und wie oft es entlang der Achse
//      wiederkehrt (Läufe). Durchgehende Linien erreichen fast 1, gestrichelte bilden mehrere Läufe.
//   5. Zusammenhängende Stellen mit Anteil ≥ MIN_ANTEIL und Breite ≤ MAX_BREITE_M sind Markierungen, wenn sie entweder
//      durchgehend sind (Anteil ≥ DURCHGEHEND) oder mindestens MIN_LAEUFE Striche haben. Ein einzelner Richtungspfeil
//      ist ein Lauf von wenigen Metern und fällt weg (Probe Kirchenfeldstrasse: der Pfeilschaft war als Linie gemeldet).
//   6. Pfeile hintereinander bilden aber auch mehrere Läufe. Ein Pfeil hat einen breiten Kopf (0,6 bis 1,6 m hell quer zur
//      Achse) mitten auf dem Schaft: Reicht in einem Profil ein solcher Fleck auf BEIDEN Seiten mindestens PFEIL_RAND_M über
//      den Kandidaten hinaus, ist es ein Pfeil (Probe Kirchenfeldstrasse: zwei Pfeile hintereinander bei 1,21 m). Ein helles
//      Autodach neben einer Linie berührt sie nur auf einer Seite (Probe Bernastrasse: Linie des Parkstreifens).
// Luftbild (seit 27.10.2026): in Bern zuerst das Orthofoto der Stadt vom 19.03.2026 (WMS map.bern.ch, 10 cm), passend zum
// Kartenhintergrund «Bern 2026». Es deckt nur das Gemeindegebiet ab (ausserhalb weiss); ist ein Ausschnitt zu mehr als
// AUSSERHALB weiss oder nicht ladbar, gilt SWISSIMAGE. Damit beide dasselbe Pixelraster haben, holt der WMS genau den
// Ausschnitt der Kacheln von Stufe 20 in EPSG:3857 (ein Bild statt Kacheln).
// Das Ergebnis ist ein Vorschlag: die Lage jeder Linie quer zur Achse (Meter ab dem Mittelpunkt der Querlinie, wie in
// querschnittAufnahme.ts), ihre Breite und wie durchgehend sie ist.

import { zuWgs, type P } from './lv95'

const Z = 20, KACHEL = 256
const KACHEL_URL = (x: number, y: number) =>
  `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/${Z}/${x}/${y}.jpeg`
export const LAENGS_M = 20, LAENGS_SCHRITT_M = 0.5, QUER_SCHRITT_M = 0.05
const HINTERGRUND_M = 0.75, REL_KONTRAST = 0.22, MIN_KONTRAST = 10, MIN_ANTEIL = 0.2, MAX_BREITE_M = 0.4, MIN_BREITE_M = 0.08
const DURCHGEHEND = 0.6, MIN_LAEUFE = 2, LAUF_LUECKE = 2   // Lauf: helle Profile in Folge, Lücken bis LAUF_LUECKE Profile überbrückt
const PFEIL_MIN_M = 0.6, PFEIL_MAX_M = 1.6, PFEIL_RAND_M = 0.15, PFEIL_HINTERGRUND_M = 2.0

// Pixel in Web-Mercator auf Stufe Z (global)
function mercPx(lat: number, lon: number): [number, number] {
  const n = 2 ** Z * KACHEL, phi = lat * Math.PI / 180
  return [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2 * n]
}

export type LuftbildQuelle = 'swissimage' | 'bern2026'
export const LUFTBILD_NAME: Record<LuftbildQuelle | 'beide', string> = {
  swissimage: 'SWISSIMAGE (swisstopo)', bern2026: 'Orthofoto Stadt Bern 2026', beide: 'Orthofoto Stadt Bern 2026 und SWISSIMAGE' }
const BERN26_WMS = 'https://map.bern.ch/arcgis/services/Geoportal/Orthofoto_2026_1/MapServer/WMSServer'
const WMS_MAX_PX = 4096, AUSSERHALB = 0.1
export interface Bild { hell: (px: number, py: number) => number; quelle: LuftbildQuelle }

// Kacheln für alle Punkte laden (LV95) und eine Helligkeitsfunktion (global in Pixeln, bilinear) liefern. quelle 'bern2026':
// zuerst das Berner Orthofoto, sonst (ausserhalb, nicht erreichbar) SWISSIMAGE.
export async function luftbildLaden(punkte: P[], quelle: LuftbildQuelle = 'swissimage'): Promise<Bild> {
  const pxs = punkte.map(p => { const w = zuWgs(p[0], p[1]); return mercPx(w.lat, w.lon) })
  const x0 = Math.floor(Math.min(...pxs.map(p => p[0])) / KACHEL), x1 = Math.floor(Math.max(...pxs.map(p => p[0])) / KACHEL)
  const y0 = Math.floor(Math.min(...pxs.map(p => p[1])) / KACHEL), y1 = Math.floor(Math.max(...pxs.map(p => p[1])) / KACHEL)
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 64) throw new Error('Ausschnitt zu gross für die Markierungserkennung')
  const w = (x1 - x0 + 1) * KACHEL, h = (y1 - y0 + 1) * KACHEL
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const lade = (x: number, y: number) => new Promise<void>((ok, fehler) => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => { ctx.drawImage(img, (x - x0) * KACHEL, (y - y0) * KACHEL); ok() }
    img.onerror = () => fehler(new Error('Luftbild-Kachel nicht geladen'))
    img.src = KACHEL_URL(x, y)
  })
  let d: Uint8ClampedArray | null = null, genutzt: LuftbildQuelle = 'swissimage'
  if (quelle === 'bern2026' && w <= WMS_MAX_PX && h <= WMS_MAX_PX) {
    try {
      // Ausschnitt der Kacheln in EPSG:3857 (Meter je Pixel auf Stufe Z)
      const R = 6378137, m = 2 * Math.PI * R / (2 ** Z * KACHEL), X = (gx: number) => gx * m - Math.PI * R, Y = (gy: number) => Math.PI * R - gy * m
      const bbox = [X(x0 * KACHEL), Y((y1 + 1) * KACHEL), X((x1 + 1) * KACHEL), Y(y0 * KACHEL)].map(v => v.toFixed(2)).join(',')
      await new Promise<void>((ok, fehler) => {
        const img = new Image(); img.crossOrigin = 'anonymous'
        img.onload = () => { ctx.drawImage(img, 0, 0); ok() }
        img.onerror = () => fehler(new Error('Orthofoto Bern nicht geladen'))
        img.src = `${BERN26_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=0&STYLES=&CRS=EPSG:3857&BBOX=${bbox}&WIDTH=${w}&HEIGHT=${h}&FORMAT=image/jpeg`
      })
      const b = ctx.getImageData(0, 0, w, h).data
      let weiss = 0
      for (let k = 0; k < b.length; k += 4) if (b[k] >= 252 && b[k + 1] >= 252 && b[k + 2] >= 252) weiss++
      if (weiss / (w * h) <= AUSSERHALB) { d = b; genutzt = 'bern2026' }
    } catch { /* SWISSIMAGE */ }
  }
  if (!d) {
    const jobs: Promise<void>[] = []
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push(lade(x, y))
    await Promise.all(jobs)
    d = ctx.getImageData(0, 0, w, h).data
  }
  const daten = d
  const lum = (ix: number, iy: number) => {
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return NaN
    const k = (iy * w + ix) * 4
    return 0.299 * daten[k] + 0.587 * daten[k + 1] + 0.114 * daten[k + 2]
  }
  return {
    quelle: genutzt,
    hell: (gx: number, gy: number) => {
      const px = gx - x0 * KACHEL - 0.5, py = gy - y0 * KACHEL - 0.5
      const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy
      return lum(ix, iy) * (1 - fx) * (1 - fy) + lum(ix + 1, iy) * fx * (1 - fy) + lum(ix, iy + 1) * (1 - fx) * fy + lum(ix + 1, iy + 1) * fx * fy
    },
  }
}

export interface Markierung { t: number; breite: number; anteil: number; laeufe: number }
export interface Profil { t: number[]; anteil: number[]; hell: number[]; laeufe: number[]; pfeil: [number, number][] }   // pfeil: breite Flecken [von, bis] (quer, m)

// Profile quer zur Achse: c Mittelpunkt, r Einheitsvektor quer (zur Seite A), von/bis in Metern auf der Querlinie
export function profilLesen(bild: Bild, c: P, r: P, von: number, bis: number): Profil {
  const u: P = [-r[1], r[0]]                                   // entlang der Achse
  const ts: number[] = []
  for (let t = von; t <= bis + 1e-9; t += QUER_SCHRITT_M) ts.push(Math.round(t * 100) / 100)
  const halb = Math.round(HINTERGRUND_M / QUER_SCHRITT_M)
  const zaehl = new Array<number>(ts.length).fill(0), summe = new Array<number>(ts.length).fill(0)
  const folge: boolean[][] = ts.map(() => [])                 // je Stelle quer: hell ja/nein je Profil entlang der Achse
  const pfeil: [number, number][] = []
  let n = 0
  for (let s = -LAENGS_M / 2; s <= LAENGS_M / 2 + 1e-9; s += LAENGS_SCHRITT_M) {
    const v = ts.map(t => {
      const p: P = [c[0] + u[0] * s + r[0] * t, c[1] + u[1] * s + r[1] * t]
      const w = zuWgs(p[0], p[1]), [gx, gy] = mercPx(w.lat, w.lon)
      return bild.hell(gx, gy)
    })
    if (v.some(x => !Number.isFinite(x))) continue
    n++
    const maske: boolean[] = []
    for (let i = 0; i < v.length; i++) {
      const fenster = v.slice(Math.max(0, i - halb), Math.min(v.length, i + halb + 1)).sort((x, y) => x - y)
      const bg = fenster[Math.floor(fenster.length / 2)]
      const hell = v[i] - bg > Math.max(MIN_KONTRAST, REL_KONTRAST * bg)
      maske.push(hell)
      if (hell) zaehl[i]++
      folge[i].push(hell)
      summe[i] += v[i]
    }
    // breite helle Flecken in diesem Profil (Pfeilköpfe): Mitte merken. Gegen den gleitenden Median über ±HINTERGRUND_M ist ein
    // breiter Fleck nur an seinen Rändern hell; darum gegen den Belag im weiteren Umkreis (±PFEIL_HINTERGRUND_M) prüfen. Der
    // Median des ganzen Profils taugt nicht: dunkle Schatten am Rand machen hellen Asphalt neben einer Linie zum Fleck
    // (Probe Bernastrasse: die Linie des Parkstreifens fiel weg)
    const halb2 = Math.round(PFEIL_HINTERGRUND_M / QUER_SCHRITT_M)
    const bg2 = v.map((_, i) => { const f = v.slice(Math.max(0, i - halb2), Math.min(v.length, i + halb2 + 1)).sort((x, y) => x - y); return f[Math.floor(f.length / 2)] })
    let a = -1
    for (let i = 0; i <= v.length; i++) {
      const h = i < v.length && v[i] - bg2[i] > Math.max(MIN_KONTRAST, REL_KONTRAST * bg2[i])
      if (h && a < 0) a = i
      if (!h && a >= 0) {
        const b = (i - a) * QUER_SCHRITT_M
        if (b >= PFEIL_MIN_M - 1e-9 && b <= PFEIL_MAX_M + 1e-9) pfeil.push([ts[a], ts[i - 1]])
        a = -1
      }
    }
  }
  // Läufe entlang der Achse: Folgen heller Profile; kurze Lücken (Pflastersteine, Rauschen) überbrückt
  const laeufe = folge.map(f => {
    let k = 0, luecke = Infinity
    for (const h of f) { if (h) { if (luecke > LAUF_LUECKE) k++; luecke = 0 } else luecke++ }
    return k
  })
  return { t: ts, anteil: zaehl.map(z => (n ? z / n : 0)), hell: summe.map(x => (n ? x / n : NaN)), laeufe, pfeil }
}

// Markierungen aus dem Profil: zusammenhängende Stellen mit genug Anteil, schmal genug
export function markierungenFinden(p: Profil): Markierung[] {
  const out: Markierung[] = []
  let i = 0
  while (i < p.t.length) {
    if (p.anteil[i] < MIN_ANTEIL) { i++; continue }
    let j = i, gew = 0, sum = 0, max = 0, lf = 0
    while (j < p.t.length && p.anteil[j] >= MIN_ANTEIL) { gew += p.anteil[j]; sum += p.anteil[j] * p.t[j]; max = Math.max(max, p.anteil[j]); lf = Math.max(lf, p.laeufe[j]); j++ }
    const breite = (j - i) * QUER_SCHRITT_M
    const t = sum / gew
    const istPfeil = max < DURCHGEHEND && p.pfeil.some(([a, b]) => a <= t - PFEIL_RAND_M && b >= t + PFEIL_RAND_M)
    if (breite >= MIN_BREITE_M - 1e-9 && breite <= MAX_BREITE_M + 1e-9 && (max >= DURCHGEHEND || lf >= MIN_LAEUFE) && !istPfeil)
      out.push({ t: Math.round(t * 100) / 100, breite: Math.round(breite * 100) / 100, anteil: Math.round(max * 100) / 100, laeufe: lf })
    i = j
  }
  return out
}

// ── Für einen Abschnitt (seit 25.10.2026): beim Öffnen der Planung, für die Ausgangslage ──────────────────────────────────
// Querschnitte bei POSITIONEN der Länge (Achsen in Richtung der Seite A, also links Rand B, rechts Rand A). Je Querschnitt:
// Bordkanten aus der AV (das Stück Strassenfläche um die Achse), dazwischen die Linien; daraus die Stücke. Es zählen die
// Querschnitte mit der häufigsten Zahl Stücke (bei Gleichstand die grössere Zahl: eine fehlende Linie ist häufiger als
// eine falsche), je Stück der Median. null, wenn kein Querschnitt Bordkanten hat.
import { grenzenAufLinie, querLinie } from './querschnittAufnahme'
import type { AvFlaeche } from './av'
const POSITIONEN = [0.25, 0.5, 0.75]
const BORD_FREI_M = 0.3   // am Bord: Rinne und Randstein sind hell
// Linien näher am Bord sind die Kante der Rinne, keine Spurgrenze: kein Element ist so schmal (Velostreifen ab 1,0 m).
// Probe 27.10.2026 Bernastrasse: an vielen Querschnitten ein «Stück» von 0,32 bis 0,43 m am Bord, im Berner Orthofoto
// 2026 häufiger als in SWISSIMAGE.
export const BORD_LINIE_MIN_M = 0.6
export const ohneRinne = (mk: Markierung[], von: number, bis: number): Markierung[] =>
  mk.filter(m => m.t - von >= BORD_LINIE_MIN_M - 1e-9 && bis - m.t >= BORD_LINIE_MIN_M - 1e-9)
// In Bern liest die Erkennung beide Luftbilder (seit 27.10.2026): Probe Kirchenfeldstrasse 44425592 — im Märzflug 2026 liegt
// der Radstreifen A an allen drei Stellen im Schatten, in SWISSIMAGE 2024 an einer nicht. Alle Querschnitte beider Bilder
// gehen in die Auswahl (markierungPasst nimmt die mit der erwarteten Zahl Stücke).
export async function markierungenAbschnitt(achsen: P[][], flaechen: AvFlaeche[], quelle: LuftbildQuelle = 'swissimage'): Promise<{ breiten: number[]; querschnitte: number; stuecke: number[]; alle: number[][]; luftbild: LuftbildQuelle | 'beide' } | null> {
  const linie = achsen.flat()
  const st = [0]
  for (let i = 1; i < linie.length; i++) st.push(st[i - 1] + Math.hypot(linie[i][0] - linie[i - 1][0], linie[i][1] - linie[i - 1][1]))
  const L = st[st.length - 1]
  if (!(L > 0)) return null
  const punktBei = (s: number): P => {
    const i = Math.max(1, st.findIndex(x => x >= s)), f = (s - st[i - 1]) / Math.max(1e-9, st[i] - st[i - 1])
    return [linie[i - 1][0] + f * (linie[i][0] - linie[i - 1][0]), linie[i - 1][1] + f * (linie[i][1] - linie[i - 1][1])]
  }
  const ergebnisse: number[][] = []
  const gelesen = new Set<LuftbildQuelle>()
  const quellen: LuftbildQuelle[] = quelle === 'bern2026' ? ['bern2026', 'swissimage'] : ['swissimage']
  for (const pos of POSITIONEN) {
    const ql = querLinie(achsen, punktBei(pos * L))
    if (!ql) continue
    const g = [...new Set(grenzenAufLinie(ql.c, ql.r, flaechen).map(t => Math.round(t * 100) / 100))].sort((a, b) => a - b)
    let von = NaN, bis = NaN
    for (let i = 1; i < g.length; i++) if (g[i - 1] <= 0.01 && g[i] >= -0.01) { von = g[i - 1]; bis = g[i] }
    if (!Number.isFinite(von) || bis - von < 3) continue
    const u: P = [-ql.r[1], ql.r[0]], h = LAENGS_M / 2 + 1
    const ecken: P[] = [[-h, von - 1], [-h, bis + 1], [h, von - 1], [h, bis + 1]].map(([sl, t]) => [ql.c[0] + u[0] * sl + ql.r[0] * t, ql.c[1] + u[1] * sl + ql.r[1] * t])
    for (const q of quellen) {
      const bild = await luftbildLaden(ecken, q)
      if (bild.quelle !== q) continue                     // ausserhalb von Bern: SWISSIMAGE kommt ohnehin
      gelesen.add(q)
      const mk = ohneRinne(markierungenFinden(profilLesen(bild, ql.c, ql.r, von + BORD_FREI_M, bis - BORD_FREI_M)), von, bis)
      const ts = [von, ...mk.map(m => m.t), bis]
      ergebnisse.push(ts.slice(1).map((t, i) => Math.round((t - ts[i]) * 100) / 100))
    }
  }
  if (!ergebnisse.length) return null
  const zahl = new Map<number, number>()
  for (const e of ergebnisse) zahl.set(e.length, (zahl.get(e.length) ?? 0) + 1)
  const n = [...zahl.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
  const gleich = ergebnisse.filter(e => e.length === n)
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
  return { breiten: Array.from({ length: n }, (_, k) => Math.round(median(gleich.map(e => e[k])) * 100) / 100), querschnitte: gleich.length,
    stuecke: ergebnisse.map(e => e.length), alle: ergebnisse,
    luftbild: gelesen.size > 1 ? 'beide' : gelesen.has('bern2026') ? 'bern2026' : 'swissimage' }
}
