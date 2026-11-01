// ── Parallele Wege einer Strasse (seit 21.10.2026, Nutzerbefund Schwarzenburgstrasse) ─────────────────────────────
//
// OSM erfasst Radwege oft als eigene Wege neben der Strasse (highway=cycleway, Fuss-/Radweg mit Velofreigabe). Beim
// Laden nach Name kommen sie als eigene Segmente, parallel zur Strasse, und würden eigene Abschnitte, während die
// Strasse auf dieser Seite «Mischverkehr» zeigte (way 1568298241 mit dem Radweg 26177986 daneben). Die Zuordnung:
// Liegt ein Weg auf mindestens PARALLEL_ANTEIL seiner Länge höchstens PARALLEL_MAX_M neben einer Strasse, ist er
// deren Veloführung auf dieser Seite. Welche Seite: ein Einbahn-Weg dient der Richtung, in die er läuft (Rechtsverkehr:
// gleich wie der Way → Way-Seite rechts, entgegen → links); ein Weg in beide Richtungen (Zweirichtungsradweg, Fuss-/
// Radweg) dient beiden Seiten. Form und Breite kommen aus dem Weg. Beim Übernehmen wird der Weg abgewählt (kein eigener
// Abschnitt); wählt man ihn wieder an, ist er wieder einer. Trottoirs ohne Velofreigabe sind nie Kandidaten.

import type { Cand } from './VeloMap'
import type { IstFuehrungsform } from './fuehrungsform'
import { densify, distPointToLineM, peilung, type LL } from './geo'

export const PARALLEL_MAX_M = 20
export const PARALLEL_ANTEIL = 0.6
const SCHRITT_M = 10

export interface ParallelWeg { wayId: number; candId: number; form: IstFuehrungsform; breite?: number; beide: boolean }
export type Parallel = { rechts?: ParallelWeg; links?: ParallelWeg }

// Vorzeichen: Punkt links (> 0) oder rechts (< 0) der Linie, am nächsten Stück
function seiteVon(p: LL, line: LL[]): number {
  const kx = 111320 * Math.cos((p.lat * Math.PI) / 180), ky = 111320
  let best = Infinity, s = 0
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i]
    const ax = a.lon * kx, ay = a.lat * ky, dx = b.lon * kx - ax, dy = b.lat * ky - ay
    const px = p.lon * kx, py = p.lat * ky, l2 = dx * dx + dy * dy
    if (l2 === 0) continue
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    if (d < best) { best = d; s = dx * (py - ay) - dy * (px - ax) }
  }
  return s
}
const richtungGleich = (weg: LL[], strasse: LL[]): boolean => {
  const a = peilung(weg[0], weg[weg.length - 1]), b = peilung(strasse[0], strasse[strasse.length - 1])
  const diff = Math.abs(((a - b + 540) % 360) - 180)   // Winkel zwischen den Richtungen: 0 = gleich, 180 = entgegen
  return diff < 90
}

// Je Strasse (Kandidaten-Id) die zugeordneten Wege je Way-Seite; dazu die Ids der zugeordneten Wege
export function parallelWege(cands: Cand[]): { zuordnung: Map<number, Parallel>; wege: Set<number> } {
  const strassen = cands.filter(c => !c.ohneFahrbahn && c.geom.length >= 2)
  const wege = cands.filter(c => c.ohneFahrbahn && c.geom.length >= 2)
  const zuordnung = new Map<number, Parallel>(), zugeordnet = new Set<number>()
  for (const w of wege) {
    const dicht = densify(w.geom, SCHRITT_M)
    let best: { c: Cand; anteil: number; links: number } | null = null
    for (const s of strassen) {
      let nah = 0, links = 0
      for (const p of dicht) if (distPointToLineM(p, s.geom) <= PARALLEL_MAX_M) { nah++; if (seiteVon(p, s.geom) > 0) links++; else links-- }
      const anteil = nah / dicht.length
      if (anteil >= PARALLEL_ANTEIL && (!best || anteil > best.anteil)) best = { c: s, anteil, links }
    }
    if (!best) continue
    const zweirichtung = w.ist === 'Zweirichtungsradweg' || w.ist === 'Kombinierter Fuss-/Radweg' || w.ist === 'Fussweg Velo gestattet' || !w.einbahn
    const lage: 'rechts' | 'links' = best.links > 0 ? 'links' : 'rechts'
    // Einbahn-Weg: die Seite der Richtung, in die er läuft; sonst die Seite, auf der er liegt (und beide Richtungen)
    const seite: 'rechts' | 'links' = zweirichtung ? lage : richtungGleich(w.geom, best.c.geom) ? 'rechts' : 'links'
    const eintrag: ParallelWeg = { wayId: w.wayId, candId: w.id, form: w.ist as IstFuehrungsform, breite: w.breite, beide: zweirichtung }
    const z = zuordnung.get(best.c.id) ?? {}
    if (!z[seite]) { z[seite] = eintrag; zuordnung.set(best.c.id, z); zugeordnet.add(w.id) }
  }
  return { zuordnung, wege: zugeordnet }
}

// Kandidaten mit der Zuordnung: Strassen bekommen `parallel`, zugeordnete Wege sind abgewählt
export function mitParallelen(cands: Cand[]): Cand[] {
  const { zuordnung, wege } = parallelWege(cands)
  return cands.map(c => {
    const z = zuordnung.get(c.id)
    if (z) return { ...c, parallel: z }
    const { parallel: _p, ...rest } = c
    return wege.has(c.id) ? { ...rest, selected: false } : rest
  })
}
