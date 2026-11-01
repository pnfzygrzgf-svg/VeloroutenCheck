import { describe, it, expect } from 'vitest'
import { luftbildJeKandidat } from './luftbild'
import type { Cand } from './VeloMap'

const M_LAT = 1 / 111320
const M_LON = 1 / (111320 * Math.cos((47 * Math.PI) / 180))
const pt = (xM: number, yM: number) => ({ lat: 47 + yM * M_LAT, lon: 7.4 + xM * M_LON })
// Strasse nach Osten: rechts der Way-Richtung = Süden (y < 0).
const strasse: Cand = { id: 1, wayId: 1, ist: 'Mischverkehr', len: 200, name: 'x', geom: [pt(0, 0), pt(200, 0)], selected: true }
// Fund-Mittellinien wie im Snapshot: kurze Stücke entlang des Streifens.
const funde = (x0: number, x1: number, y: number) => {
  const out = []
  for (let x = x0; x < x1; x += 40) out.push([pt(x, y), pt(Math.min(x + 40, x1), y)])
  return out
}

describe('luftbildJeKandidat — Anteil der Länge mit Fund je Seite', () => {
  it('Funde rechts über die ganze Länge → rechts 1, links 0', () => {
    const r = luftbildJeKandidat([strasse], funde(0, 200, -3.5)).get(1)!
    expect(r.rechts).toBeGreaterThan(0.95)
    expect(r.links).toBe(0)
  })
  it('Funde links auf der halben Länge → links rund 0,5', () => {
    const r = luftbildJeKandidat([strasse], funde(100, 200, 3.5)).get(1)!
    expect(r.rechts).toBe(0)
    expect(r.links).toBeGreaterThan(0.4)
    expect(r.links).toBeLessThan(0.6)
  })
  it('nichts in der Nähe → Eintrag 0/0 («nachgesehen, nichts gefunden»)', () =>
    expect(luftbildJeKandidat([strasse], funde(0, 200, 60)).get(1)).toEqual({ rechts: 0, links: 0 }))
  it('ohne Snapshot (keine Linien) → kein Eintrag', () =>
    expect(luftbildJeKandidat([strasse], []).size).toBe(0))
})
