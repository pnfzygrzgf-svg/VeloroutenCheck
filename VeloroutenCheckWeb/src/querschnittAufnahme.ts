// ── Querschnitt am Luftbild aufnehmen (seit 20.10.2026, Nutzerwunsch Haltestellen Monbijoustrasse/Helvetiaplatz) ──
//
// Wo die Messung aus der AV nicht trifft (Inseln an Haltestellen, Perrons als «Platz», Busbuchten), legt man den
// Querschnitt von Hand fest: quer über die Strasse von Rand B nach Rand A klicken, an jeder Grenze (Hauswand,
// Trottoirrand, Bord, Markierung, Insel, Gleis) ein Punkt. Die Punkte werden auf die Linie quer zur Achse am ersten
// Punkt gelegt, damit die Breiten echte Querschnittsmasse sind. Nahe einer AV-Kante rasten sie auf die Stelle ein, an der
// die Querlinie die Kante schneidet (Fangradius in Bildschirmpunkten wie in fgsCheck, FANG_PX; dort auf Stützpunkte).
// Jedes Stück zwischen zwei Punkten wird ein Teil; vorbelegt nach der AV-Fläche unter seiner Mitte (artVorschlag).

import type { AvFlaeche } from './av'
import type { P } from './lv95'
import { istFahrbahnTeil, type Teil, type TeilArt } from './aufteilung'

export const EINRASTEN_M = 0.5
export const FANG_PX = 12, FANG_MAX_M = 3

function imPolygon(pt: P, ringe: P[][]): boolean {
  let innen = false
  for (const r of ringe) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) innen = !innen
  }
  return innen
}

// Fusspunkt auf der Achse (in Richtung der Seite A) und die Richtung quer dazu, nach rechts = zur Seite A
export function querLinie(achsen: P[][], p: P): { c: P; r: P } | null {
  let best = Infinity, out: { c: P; r: P } | null = null
  for (const l of achsen) for (let i = 1; i < l.length; i++) {
    const a = l[i - 1], b = l[i], de = b[0] - a[0], dn = b[1] - a[1], ll = de * de + dn * dn
    if (ll < 1e-6) continue
    const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * de + (p[1] - a[1]) * dn) / ll))
    const c: P = [a[0] + u * de, a[1] + u * dn], d = Math.hypot(p[0] - c[0], p[1] - c[1])
    if (d < best) { best = d; const len = Math.sqrt(ll); out = { c, r: [dn / len, -de / len] } }
  }
  return out
}

// Nächster Punkt auf einer Kante der AV-Flächen, höchstens maxM entfernt; sonst p selbst
export function einrasten(p: P, flaechen: AvFlaeche[], maxM = EINRASTEN_M): P {
  let best = maxM, q: P = p
  for (const f of flaechen) for (const r of f.ringe) for (let i = 1; i < r.length; i++) {
    const a = r[i - 1], b = r[i]
    if (Math.min(a[0], b[0]) > p[0] + maxM || Math.max(a[0], b[0]) < p[0] - maxM
      || Math.min(a[1], b[1]) > p[1] + maxM || Math.max(a[1], b[1]) < p[1] - maxM) continue
    const de = b[0] - a[0], dn = b[1] - a[1], ll = de * de + dn * dn
    const u = ll < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * de + (p[1] - a[1]) * dn) / ll))
    const s: P = [a[0] + u * de, a[1] + u * dn], d = Math.hypot(p[0] - s[0], p[1] - s[1])
    if (d < best) { best = d; q = s }
  }
  return q
}

// Lagen (Meter ab c entlang r), an denen die Querlinie eine Kante der AV-Flächen schneidet, im Bereich ±maxM
export function grenzenAufLinie(c: P, r: P, flaechen: AvFlaeche[], maxM = 40): number[] {
  const out: number[] = []
  for (const f of flaechen) for (const ring of f.ringe) for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i], ex = b[0] - a[0], ey = b[1] - a[1]
    const nenner = r[0] * ey - r[1] * ex
    if (Math.abs(nenner) < 1e-12) continue
    const ax = a[0] - c[0], ay = a[1] - c[1]
    const t = (ax * ey - ay * ex) / nenner, u = (ax * r[1] - ay * r[0]) / nenner
    if (u >= 0 && u <= 1 && Math.abs(t) <= maxM) out.push(t)
  }
  return out.sort((x, y) => x - y)
}
// Nächste Grenze zur Lage t innerhalb radiusM, sonst t selbst
export function fangeLage(t: number, grenzen: number[], radiusM: number): number {
  let best = radiusM, q = t
  for (const g of grenzen) if (Math.abs(g - t) < best) { best = Math.abs(g - t); q = g }
  return q
}

// Art der AV-Fläche an einer Stelle (null = keine); liegen mehrere übereinander, die kleinste (Insel in der Strasse)
export function avArtAn(p: P, flaechen: AvFlaeche[]): string | null {
  const groesse = (f: AvFlaeche) => {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
    for (const [e, n] of f.ringe[0] ?? []) { a = Math.min(a, e); b = Math.min(b, n); c = Math.max(c, e); d = Math.max(d, n) }
    return (c - a) * (d - b)
  }
  const treffer = flaechen.filter(f => imPolygon(p, f.ringe))
  return treffer.length ? treffer.reduce((x, y) => (groesse(y) < groesse(x) ? y : x)).art : null
}

// Vorbelegung des Teils nach der AV-Fläche: Insel an einer Haltestelle = Wartebereich, sonst Mittelinsel
export function artVorschlag(avArt: string | null, haltestelle: boolean): TeilArt {
  switch (avArt) {
    case 'Trottoir': case 'uebrige_befestigte': case 'Gebaeude': return 'Trottoir'
    case 'Verkehrsinsel': return haltestelle ? 'Haltestelle' : 'Mittelinsel'
    case 'Gartenanlage': case 'uebrige_humusierte': case 'Acker_Wiese_Weide': return 'Gruen'
    default: return 'Fahrspur'
  }
}

// «Ganzer Querschnitt» (Nutzerwunsch 21.10.2026): ein Stück, das nur die Gesamtbreite misst (etwa Hauswand bis Hauswand);
// es wird kein Teil, sein Mass ist die verfügbare Breite (Fahrbahn + ausserhalb)
export const GANZ = 'GanzerQuerschnitt'
export type QsArt = TeilArt | typeof GANZ

// Aus den Lagen quer zur Achse (Meter, von Rand B nach Rand A) und den Arten die Teile, die Fahrbahn
// (Summe der Fahrbahnteile, Bord–Bord), die Breite ausserhalb der Fahrbahn und die gemessene Gesamtbreite
export function aufnahmeTeile(lagen: number[], arten: QsArt[]): { teile: Teil[]; fahrbahn: number; seitenraum: number; gesamt?: number } {
  const s = [...lagen].sort((x, y) => x - y)
  const teile: Teil[] = []
  let gesamt = 0, mitGesamt = false
  for (let i = 1; i < s.length; i++) {
    const breite = Math.round((s[i] - s[i - 1]) * 100) / 100
    const art = arten[i - 1] ?? 'Fahrspur'
    if (art === GANZ) { gesamt += breite; mitGesamt = true; continue }
    if (breite > 0.005) teile.push({ art, breite })
  }
  const sum = (ts: Teil[]) => Math.round(ts.reduce((m, t) => m + t.breite, 0) * 100) / 100
  const fahrbahn = sum(teile.filter(istFahrbahnTeil))
  const seitenraum = mitGesamt && teile.length ? Math.round((gesamt - fahrbahn) * 100) / 100 : sum(teile.filter(t => !istFahrbahnTeil(t)))
  return { teile, fahrbahn, seitenraum, ...(mitGesamt ? { gesamt: Math.round(gesamt * 100) / 100 } : {}) }
}
