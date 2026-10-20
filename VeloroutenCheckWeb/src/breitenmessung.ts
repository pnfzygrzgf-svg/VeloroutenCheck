// ── Breite am Luftbild messen: ab Bordsteinkante (Bern, Zürich, Basel; Luzern: Strassenflächen der Stadt) ─
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

// Messung der ganzen Fläche (seit 20.10.2026, Velostrasse und Wege): Klick in die Fläche; von der
// nächsten Kante rechtwinklig durch den Klick bis zur gegenüberliegenden Kante (höchstens maxM weit).
// Vorher ergab ein Klick auf die gegenüberliegende Kante 0 m, weil sie selbst die nächste war.
export function messeFlaeche(klick: P, kanten: Kante[], maxM = 25): { breite: number; von: P; bis: P } | null {
  let best: { d: number; fuss: P } | null = null
  for (const k of kanten) {
    const f = fusspunkt(klick, k)
    if (f.d <= FANG_M && (!best || f.d < best.d)) best = f
  }
  if (!best || best.d < 0.01) return null
  const d: P = [(klick[0] - best.fuss[0]) / best.d, (klick[1] - best.fuss[1]) / best.d]
  const t = strahl(klick, d, kanten, maxM)
  if (!Number.isFinite(t)) return null
  return { breite: best.d + t, von: best.fuss, bis: [klick[0] + d[0] * t, klick[1] + d[1] * t] }
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
// Gemessen wird die ganze Fläche «Strasse_Weg»: Parkierung, Busbuchten und Tramgleise zählen
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

function median(werte: number[]): number {
  const s = [...werte].sort((x, y) => x - y), m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Querschnitte alle QUER_SCHRITT_M auf der Strassenfläche, ohne die Segment-Enden: Punkt auf der
// Achse und die Richtungen nach links und rechts (Einheitsvektoren, links/rechts in Linienrichtung).
interface Querschnitt { p: P; links: P; rechts: P }
function querschnitte(achsen: P[][], flaechen: AvFlaeche[]): Querschnitt[] {
  const strassen = flaechen.filter(f => f.art === 'Strasse_Weg').map(f => ({ f, box: box(f.ringe) }))
  const aufStrasse = (p: P) => strassen.some(s => inBox(p, s.box) && imPolygon(p, s.f.ringe))
  const aus: Querschnitt[] = []
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
        if (aufStrasse(p)) aus.push({ p, links, rechts })
      }
      bisher += l
    }
  }
  return aus
}

// Seit 20.10.2026 (Nutzerentscheid: die Mittelinsel gehört zur Fahrbahn): Liegt hinter der ersten Kante eine
// AV-Verkehrsinsel und dahinter wieder Strasse, läuft der Strahl über die Insel bis zum Bord der Gegenseite.
// (SCHRITT_UEBER_M ist unten bei den Trottoirbreiten festgelegt.)
const INSEL_MAX_M = 12
type Test = (p: P) => boolean
function flaechenTest(flaechen: AvFlaeche[], art: string): Test {
  const fs = flaechen.filter(f => f.art === art).map(f => ({ f, box: box(f.ringe) }))
  return p => fs.some(s => inBox(p, s.box) && imPolygon(p, s.f.ringe))
}
// Abstand von p entlang d bis zum Ende der Insel, ab der Kante bei ab (Schritte 5 cm)
function inselEnde(p: P, d: P, ab: number, aufInsel: Test): number {
  let s = ab
  while (s - ab < INSEL_MAX_M && aufInsel([p[0] + d[0] * (s + 0.05), p[1] + d[1] * (s + 0.05)])) s += 0.05
  return s + 0.05
}
// Bis zum Bord: über höchstens eine Mittelinsel hinweg
function bisBord(p: P, d: P, kanten: Kante[], aufStrasse: Test, aufInsel: Test): number {
  const t1 = strahl(p, d, kanten, QUER_MAX_M)
  if (!Number.isFinite(t1)) return t1
  const hinter = (s: number): P => [p[0] + d[0] * s, p[1] + d[1] * s]
  if (!aufInsel(hinter(t1 + SCHRITT_UEBER_M))) return t1
  const ende = inselEnde(p, d, t1, aufInsel)
  if (!aufStrasse(hinter(ende + SCHRITT_UEBER_M))) return t1
  const t2 = strahl(hinter(ende), d, kanten, QUER_MAX_M)
  return Number.isFinite(t2) ? ende + t2 : t1
}

// achsen: Geometrien der Segmente des Abschnitts in LV95 (je eine Polylinie).
export function fahrbahnbreite(achsen: P[][], flaechen: AvFlaeche[], kanten: Kante[] = bordkanten(flaechen)): Fahrbahnbreite | null {
  const werte: number[] = []
  const aufStrasse = flaechenTest(flaechen, 'Strasse_Weg'), aufInsel = flaechenTest(flaechen, 'Verkehrsinsel')
  for (const { p, links, rechts } of querschnitte(achsen, flaechen)) {
    const w = bisBord(p, links, kanten, aufStrasse, aufInsel) + bisBord(p, rechts, kanten, aufStrasse, aufInsel)
    if (Number.isFinite(w) && w >= BREITE_MIN_M && w <= BREITE_MAX_M) werte.push(w)
  }
  if (werte.length < 3) return null
  return { median: median(werte), min: Math.min(...werte), max: Math.max(...werte), n: werte.length }
}

// ── Trottoirbreiten aus der AV (seit 16.10.2026, Aufteilung planen Etappe 2) ──────
// Dieselben Querschnitte wie die Fahrbahnbreite. Je Seite läuft der Strahl bis zur Bordsteinkante
// und von dort weiter über die AV-Fläche «Trottoir» bis zu deren Ende; aneinanderstossende
// Trottoirflächen zählen als eine. Liegt hinter dem Bord kein Trottoir (Vorplatz, Parkfläche,
// Gebäude), zählt der Querschnitt als «ohne Trottoir». Eine Seite hat ein Trottoir, wenn es auf
// mindestens TROTTOIR_ANTEIL ihrer Querschnitte (mit Bordsteinkante) gefunden wird, und mindestens
// drei Werte; dann gilt der Median. Breiter als TROTTOIR_MAX_M (Platz) zählt nicht.
const TROTTOIR_MAX_M = 8, TROTTOIR_MIN_M = 0.5, TROTTOIR_ANTEIL = 0.5
const SCHRITT_UEBER_M = 0.05   // Prüfpunkt knapp hinter einer Kante

export interface Trottoirbreiten { links: number | null; rechts: number | null }

// Alle Abstände entlang d, an denen der Strahl ab p eine Kante der Ringe schneidet (aufsteigend).
function schnitte(p: P, d: P, ringe: P[][][], maxM: number): number[] {
  const ts: number[] = []
  for (const rs of ringe) for (const r of rs) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length]
    const ex = b[0] - a[0], ey = b[1] - a[1], nenner = d[0] * ey - d[1] * ex
    if (Math.abs(nenner) < 1e-12) continue
    const ax = a[0] - p[0], ay = a[1] - p[1]
    const t = (ax * ey - ay * ex) / nenner, u = (ax * d[1] - ay * d[0]) / nenner
    if (t > 0 && t <= maxM && u >= 0 && u <= 1) ts.push(t)
  }
  return ts.sort((x, y) => x - y)
}

export function trottoirbreiten(achsen: P[][], flaechen: AvFlaeche[], kanten: Kante[] = bordkanten(flaechen)): Trottoirbreiten {
  const trottoirs = flaechen.filter(f => f.art === 'Trottoir').map(f => ({ f, box: box(f.ringe) }))
  const aufTrottoir = (p: P) => trottoirs.some(s => inBox(p, s.box) && imPolygon(p, s.f.ringe))
  const seite = { links: { n: 0, werte: [] as number[] }, rechts: { n: 0, werte: [] as number[] } }
  for (const q of querschnitte(achsen, flaechen)) {
    for (const k of ['links', 'rechts'] as const) {
      const d = q[k]
      const t = strahl(q.p, d, kanten, QUER_MAX_M)
      if (!Number.isFinite(t)) continue
      const bord: P = [q.p[0] + d[0] * t, q.p[1] + d[1] * t]
      const bei = (s: number): P => [bord[0] + d[0] * s, bord[1] + d[1] * s]
      seite[k].n++
      if (!aufTrottoir(bei(SCHRITT_UEBER_M))) continue
      // Nur Trottoirflächen in Reichweite schneiden; Ende = erste Kante, hinter der kein Trottoir liegt
      const nah = trottoirs.filter(s => inBox(bei(0), [s.box[0] - TROTTOIR_MAX_M, s.box[1] - TROTTOIR_MAX_M,
        s.box[2] + TROTTOIR_MAX_M, s.box[3] + TROTTOIR_MAX_M])).map(s => s.f.ringe)
      const ende = schnitte(bord, d, nah, TROTTOIR_MAX_M).find(s => s > SCHRITT_UEBER_M && !aufTrottoir(bei(s + SCHRITT_UEBER_M)))
      if (ende != null && ende >= TROTTOIR_MIN_M) seite[k].werte.push(ende)
    }
  }
  const wert = (s: { n: number; werte: number[] }) =>
    s.werte.length >= 3 && s.werte.length >= TROTTOIR_ANTEIL * s.n ? median(s.werte) : null
  return { links: wert(seite.links), rechts: wert(seite.rechts) }
}

// ── Parkierung auf Trottoirniveau (seit 17.10.2026, Nutzerbefund Kanzleistrasse Zürich) ──────────
// Manche Längsparkierung liegt hinter dem Randstein auf der Fläche, die die AV als «Trottoir» führt.
// trottoirbreiten misst sie dann mit; die Ausgangslage der Planung setzte sie zusätzlich auf die
// Fahrbahn (doppelt gezählt). Je Seite: Liegen die Parkfelder bis PARK_SEITE_M neben der Achse nach
// Fläche mindestens zur Hälfte (Schwerpunkt) auf einer Trottoirfläche, steht die Parkierung dieser
// Seite auf Trottoirniveau. Felder neben den Achsenenden (Querstrassen) zählen nicht. Die Seite folgt
// der Achse: links bzw. rechts in Linienrichtung, wie bei den Querschnitten.
const PARK_SEITE_M = 9            // wie PARK_MAX_M (parkierung.ts, Vorbelegung «Parkierung rechts»)
const PARK_TROTTOIR_ANTEIL = 0.5

export function parkierungAufTrottoir(achsen: P[][], flaechen: AvFlaeche[], park: { ringe: P[][] }[]): { links: boolean; rechts: boolean } {
  const trottoirs = flaechen.filter(f => f.art === 'Trottoir').map(f => ({ f, box: box(f.ringe) }))
  const aufTrottoir = (p: P) => trottoirs.some(s => inBox(p, s.box) && imPolygon(p, s.f.ringe))
  const summe = { links: { tr: 0, alle: 0 }, rechts: { tr: 0, alle: 0 } }
  for (const f of park) {
    const r = f.ringe[0]
    if (!r || r.length < 3) continue
    let flaeche = 0, ce = 0, cn = 0
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) flaeche += r[j][0] * r[i][1] - r[i][0] * r[j][1]
    for (const [e, n] of r) { ce += e; cn += n }
    const c: P = [ce / r.length, cn / r.length], gewicht = Math.abs(flaeche) / 2
    let best = Infinity, seite: 'links' | 'rechts' = 'links', innen = false
    for (const l of achsen) for (let i = 1; i < l.length; i++) {
      const a = l[i - 1], b = l[i], de = b[0] - a[0], dn = b[1] - a[1], ll = de * de + dn * dn
      if (ll < 1e-6) continue
      const u = ((c[0] - a[0]) * de + (c[1] - a[1]) * dn) / ll, uk = Math.max(0, Math.min(1, u))
      const d = Math.hypot(c[0] - a[0] - uk * de, c[1] - a[1] - uk * dn)
      if (d < best) {
        best = d; seite = de * (c[1] - a[1]) - dn * (c[0] - a[0]) > 0 ? 'links' : 'rechts'
        innen = (u > 0 || i > 1) && (u < 1 || i < l.length - 1)
      }
    }
    if (best > PARK_SEITE_M || !innen || !gewicht) continue
    summe[seite].alle += gewicht
    if (aufTrottoir(c)) summe[seite].tr += gewicht
  }
  const ja = (x: { tr: number; alle: number }) => x.alle > 0 && x.tr >= PARK_TROTTOIR_ANTEIL * x.alle
  return { links: ja(summe.links), rechts: ja(summe.rechts) }
}

// ── Tiefe der Parkierung je Seite (seit 20.10.2026, Nutzerbefund Egghölzlistrasse: Schrägparkierung als 1,90 m) ──
// Die Berner und Luzerner Parkfelder sind Flächen (in Bern ganze Reihen): ihre Ausdehnung quer zur Achse ist die
// Tiefe (Längsreihen rund 1,9–2,1 m, Schräg- und Querreihen rund 4,2–5,3 m; Probe Egghölzlistrasse). Je Seite
// zählt die Anordnung mit der grösseren Länge entlang der Achse, die Tiefe ist ihr längengewichteter Median.
// Ab TIEF_AB_M ist die Reihe schräg oder senkrecht («quer»). Unterschieden wird mit der Länge je Feld entlang der
// Achse, wo die Daten die Anzahl Felder der Reihe nennen (Bern ANZAHL_PARKFELDER; Probe Kirchenfeld 20.10.2026: längs
// 5,0–6,5 m je Feld, senkrecht 2,4–2,8 m, schräg rund 3,5 m): ab SCHRAEG_AB_M schräg, darunter senkrecht. Ohne Anzahl
// bleibt «schräg oder senkrecht» (tief). Schräg ab WINKEL45_AB_M je Feld 45°, darunter 60°. Masse der Normalien Stadt Bern 2.10.22 «Parkfelder» (Rev. März 2019, verweist
// auf VSS 40 291): Feld entlang der Strasse senkrecht 2,50 m, schräg 60° 2,90 m, schräg 45° 3,55 m; Tiefe längs 1,90 m,
// senkrecht 5,00 m, schräg 60° 5,25 m, schräg 45° 4,90 m. Die Schwelle liegt zwischen gemessen senkrecht (bis 2,8 m)
// und schräg 60° (2,90 m).
// Zürich: nur Symbole (Linien, Punkte) mit der Anordnung aus den Daten, ohne Tiefe → Tiefe nach den Berner Normalien
// angenommen (schräg mit 60°, weil der Winkel in den Daten fehlt).
export type ParkTiefeArt = 'laengs' | 'schraeg' | 'quer' | 'tief'
// winkel: Schrägparkierung 45° oder 60° nach der Länge je Feld (seit 20.10.2026); fehlt = Winkel offen (Zürich)
export type ParkWinkel = 45 | 60
export interface ParkTiefe { tiefe: number; art: ParkTiefeArt; winkel?: ParkWinkel; angenommen?: boolean }
const TIEF_AB_M = 2.6
const SCHRAEG_AB_M = 2.85
const WINKEL45_AB_M = 3.2     // zwischen schräg 60° (2,90 m) und 45° (3,55 m je Feld)
export const PARK_TIEFE_ANNAHME: Record<'laengs' | 'schraeg' | 'quer', number> = { laengs: 1.9, schraeg: 5.25, quer: 5.0 }
// Tiefe der Schrägparkierung je Winkel (Normalien Stadt Bern 2.10.22)
export const PARK_WINKEL_TIEFE: Record<ParkWinkel, number> = { 45: 4.9, 60: 5.25 }

export function parkierungTiefe(achsen: P[][], park: { ringe: P[][]; art?: 'laengs' | 'schraeg' | 'quer'; symbol?: boolean; anzahl?: number }[]):
  { links?: ParkTiefe; rechts?: ParkTiefe } {
  const je: Record<'links' | 'rechts', { tiefe: number; laenge: number; art?: 'laengs' | 'schraeg' | 'quer'; symbol?: boolean; anzahl?: number }[]> = { links: [], rechts: [] }
  for (const f of park) {
    const r = f.ringe[0]
    if (!r || r.length < 3) continue
    const c: P = [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length]
    let best = Infinity, seg: [P, P] | null = null, innen = false, seite: 'links' | 'rechts' = 'links'
    for (const l of achsen) for (let i = 1; i < l.length; i++) {
      const a = l[i - 1], b = l[i], de = b[0] - a[0], dn = b[1] - a[1], ll = de * de + dn * dn
      if (ll < 1e-6) continue
      const u = ((c[0] - a[0]) * de + (c[1] - a[1]) * dn) / ll, uk = Math.max(0, Math.min(1, u))
      const d = Math.hypot(c[0] - a[0] - uk * de, c[1] - a[1] - uk * dn)
      if (d < best) {
        best = d; seg = [a, b]; seite = de * (c[1] - a[1]) - dn * (c[0] - a[0]) > 0 ? 'links' : 'rechts'
        innen = (u > 0 || i > 1) && (u < 1 || i < l.length - 1)
      }
    }
    if (!seg || best > PARK_SEITE_M || !innen) continue
    const de = seg[1][0] - seg[0][0], dn = seg[1][1] - seg[0][1], l = Math.hypot(de, dn)
    const n: P = [-dn / l, de / l], d: P = [de / l, dn / l]
    const quer = r.map(p => p[0] * n[0] + p[1] * n[1]), laengs = r.map(p => p[0] * d[0] + p[1] * d[1])
    je[seite].push({ tiefe: Math.max(...quer) - Math.min(...quer), laenge: Math.max(...laengs) - Math.min(...laengs), art: f.art, symbol: f.symbol,
      anzahl: f.anzahl })
  }
  const auswerten = (xs: typeof je.links): ParkTiefe | undefined => {
    if (!xs.length) return undefined
    // Symbole (Zürich): die Anordnung mit den meisten Feldern, Tiefe angenommen
    if (xs.every(x => x.symbol)) {
      const n = { laengs: 0, schraeg: 0, quer: 0 }
      for (const x of xs) n[x.art ?? 'laengs'] += x.laenge
      const art = (Object.keys(n) as ('laengs' | 'schraeg' | 'quer')[]).sort((a, b) => n[b] - n[a])[0]
      return { tiefe: PARK_TIEFE_ANNAHME[art], art, angenommen: true }
    }
    const flaechen = xs.filter(x => !x.symbol)
    const tief = flaechen.filter(x => x.tiefe >= TIEF_AB_M), flach = flaechen.filter(x => x.tiefe < TIEF_AB_M)
    const summe = (ys: typeof xs) => ys.reduce((m, y) => m + y.laenge, 0)
    const gruppe = summe(tief) > summe(flach) ? tief : flach
    const sortiert = [...gruppe].sort((a, b) => a.tiefe - b.tiefe), halb = summe(gruppe) / 2
    let acc = 0, wert = sortiert[sortiert.length - 1].tiefe
    for (const y of sortiert) { acc += y.laenge; if (acc >= halb) { wert = y.tiefe; break } }
    if (gruppe !== tief) return { tiefe: Math.round(wert * 20) / 20, art: 'laengs' }
    // schräg oder senkrecht nach der Länge je Feld (nur Reihen mit Anzahl), nach Länge gewichtet
    const mit = tief.filter(y => y.anzahl), jeFeld = (y: typeof xs[number]) => y.laenge / y.anzahl!
    const schraeg = mit.filter(y => jeFeld(y) >= SCHRAEG_AB_M)
    const art: ParkTiefeArt = !mit.length ? 'tief' : summe(schraeg) > summe(mit) / 2 ? 'schraeg' : 'quer'
    if (art !== 'schraeg') return { tiefe: Math.round(wert * 20) / 20, art }
    // Winkel der Schrägreihen nach der Länge je Feld, nach Länge gewichtet
    const winkel: ParkWinkel = summe(schraeg.filter(y => jeFeld(y) >= WINKEL45_AB_M)) > summe(schraeg) / 2 ? 45 : 60
    return { tiefe: Math.round(wert * 20) / 20, art, winkel }
  }
  return { links: auswerten(je.links), rechts: auswerten(je.rechts) }
}

// ── Versetzte Parkierung (seit 20.10.2026, Nutzerbefund): abwechselnd Seite A und Seite B ──────────────────
// Liegen die Parkfelder beider Seiten an verschiedenen Stellen entlang der Achse, steht in einem Querschnitt nur
// eine Seite; die Fahrbahn braucht dann nur die tiefere Parkierung. Abgedeckt wird je Seite in Schritten von 1 m
// entlang der Achse (Stationen der Achsen hintereinander). Versetzt, wenn beide Seiten mindestens VERSETZT_MIN_M
// Parkierung haben und sie sich auf höchstens VERSETZT_UEBERLAPP der kürzeren gegenüberliegen. Zurück kommt die
// Seite, die im Querschnitt nicht zählt: die weniger tiefe, bei gleicher Tiefe die kürzere.
const VERSETZT_MIN_M = 10
const VERSETZT_UEBERLAPP = 0.25
export function parkierungVersetzt(achsen: P[][], park: { ringe: P[][] }[], tiefe: { links?: ParkTiefe; rechts?: ParkTiefe } = {}):
  'links' | 'rechts' | null {
  const belegt = { links: new Set<number>(), rechts: new Set<number>() }
  for (const f of park) {
    const r = f.ringe[0]
    if (!r || r.length < 3) continue
    const c: P = [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length]
    let best = Infinity, seg: [P, P] | null = null, s0 = 0, seite: 'links' | 'rechts' = 'links', station = 0
    for (const l of achsen) {
      for (let i = 1; i < l.length; i++) {
        const a = l[i - 1], b = l[i], de = b[0] - a[0], dn = b[1] - a[1], ll = de * de + dn * dn
        if (ll < 1e-6) continue
        const u = Math.max(0, Math.min(1, ((c[0] - a[0]) * de + (c[1] - a[1]) * dn) / ll))
        const d = Math.hypot(c[0] - a[0] - u * de, c[1] - a[1] - u * dn)
        if (d < best) { best = d; seg = [a, b]; s0 = station; seite = de * (c[1] - a[1]) - dn * (c[0] - a[0]) > 0 ? 'links' : 'rechts' }
        station += Math.sqrt(ll)
      }
    }
    if (!seg || best > PARK_SEITE_M) continue
    const de = seg[1][0] - seg[0][0], dn = seg[1][1] - seg[0][1], l = Math.hypot(de, dn)
    const st = r.map(p => s0 + ((p[0] - seg![0][0]) * de + (p[1] - seg![0][1]) * dn) / l)
    for (let m = Math.ceil(Math.min(...st)); m < Math.max(...st); m++) belegt[seite].add(m)
  }
  const nl = belegt.links.size, nr = belegt.rechts.size
  if (nl < VERSETZT_MIN_M || nr < VERSETZT_MIN_M) return null
  let beide = 0
  for (const m of belegt.links) if (belegt.rechts.has(m)) beide++
  if (beide > VERSETZT_UEBERLAPP * Math.min(nl, nr)) return null
  const tl = tiefe.links?.tiefe ?? PARK_TIEFE_ANNAHME.laengs, tr = tiefe.rechts?.tiefe ?? PARK_TIEFE_ANNAHME.laengs
  return Math.abs(tl - tr) > 0.05 ? (tl < tr ? 'links' : 'rechts') : nl <= nr ? 'links' : 'rechts'
}

// ── Mittelinsel aus der AV (seit 20.10.2026, Nutzerbefund Laubeggstrasse) ──────────────────────────────
// Jede AV-Verkehrsinsel bis 10 m neben der Achse (nicht neben den Achsenenden), die quer zur Achse auf beiden
// Seiten an Strasse grenzt, ist eine Mittelinsel — auch eine kurze Schutzinsel am Fussgängerstreifen (Nutzerentscheid:
// diese sind relevant). Gemessen durch ihren Schwerpunkt quer zur Achse: Breite der Insel, Länge entlang der Achse
// und die Fahrbahn von Bord zu Bord samt Insel. Mehrere Inseln: die längste, mit der Anzahl.
export interface Mittelinsel { breite: number; laenge: number; fahrbahn: number; anzahl: number }
export function mittelinsel(achsen: P[][], flaechen: AvFlaeche[], kanten: Kante[] = bordkanten(flaechen)): Mittelinsel | null {
  const aufStrasse = flaechenTest(flaechen, 'Strasse_Weg'), aufInsel = flaechenTest(flaechen, 'Verkehrsinsel')
  const funde: Mittelinsel[] = []
  for (const f of flaechen.filter(x => x.art === 'Verkehrsinsel')) {
    const r = f.ringe[0]
    if (!r || r.length < 3) continue
    let c: P = [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length]
    let best = Infinity, d: P = [1, 0], innen = false
    for (const l of achsen) for (let i = 1; i < l.length; i++) {
      const a = l[i - 1], b = l[i], de = b[0] - a[0], dn = b[1] - a[1], ll = de * de + dn * dn
      if (ll < 1e-6) continue
      const u = ((c[0] - a[0]) * de + (c[1] - a[1]) * dn) / ll, uk = Math.max(0, Math.min(1, u))
      const dist = Math.hypot(c[0] - a[0] - uk * de, c[1] - a[1] - uk * dn)
      if (dist < best) { best = dist; const len = Math.sqrt(ll); d = [de / len, dn / len]; innen = (u > 0 || i > 1) && (u < 1 || i < l.length - 1) }
    }
    if (best > 10 || !innen) continue
    if (!aufInsel(c)) {                                        // Schwerpunkt ausserhalb (L-förmige Insel): nahe einer Ecke
      const ecke = r.find(p => aufInsel([p[0] * 0.9 + c[0] * 0.1, p[1] * 0.9 + c[1] * 0.1]))
      if (!ecke) continue
      c = [ecke[0] * 0.9 + c[0] * 0.1, ecke[1] * 0.9 + c[1] * 0.1]
    }
    const n: P = [-d[1], d[0]], m: P = [d[1], -d[0]]
    const eL = inselEnde(c, n, 0, aufInsel), eR = inselEnde(c, m, 0, aufInsel)
    const pL: P = [c[0] + n[0] * eL, c[1] + n[1] * eL], pR: P = [c[0] + m[0] * eR, c[1] + m[1] * eR]
    if (!aufStrasse([pL[0] + n[0] * SCHRITT_UEBER_M, pL[1] + n[1] * SCHRITT_UEBER_M])
      || !aufStrasse([pR[0] + m[0] * SCHRITT_UEBER_M, pR[1] + m[1] * SCHRITT_UEBER_M])) continue
    const tL = strahl(pL, n, kanten, QUER_MAX_M), tR = strahl(pR, m, kanten, QUER_MAX_M)
    if (!Number.isFinite(tL) || !Number.isFinite(tR)) continue
    const laengs = r.map(p => p[0] * d[0] + p[1] * d[1])
    funde.push({ breite: Math.round((eL + eR) * 20) / 20, laenge: Math.round(Math.max(...laengs) - Math.min(...laengs)),
      fahrbahn: Math.round((eL + eR + tL + tR) * 10) / 10, anzahl: 0 })
  }
  if (!funde.length) return null
  const l = funde.reduce((a, b) => (b.laenge > a.laenge ? b : a))
  return { ...l, anzahl: funde.length }
}
