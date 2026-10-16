import { describe, it, expect } from 'vitest'
import { ausschnitt, wmsBildUrl } from './kartenbild'
import type { P } from './lv95'

describe('Bericht — Kartenausschnitt und Luftbild', () => {
  it('Rand 15 m, Seitenverhältnis zwischen 0,45 und 0,75', () => {
    const lang: P[] = [[2600000, 1200000], [2600400, 1200010]]
    const [e0, n0, e1, n1] = ausschnitt([lang])!
    expect(e0).toBeCloseTo(2599985, 6)
    expect(e1).toBeCloseTo(2600415, 6)
    expect((n1 - n0) / (e1 - e0)).toBeCloseTo(0.45, 6)
    const hoch: P[] = [[2600000, 1200000], [2600000, 1200300]]
    const b = ausschnitt([hoch])!
    expect((b[3] - b[1]) / (b[2] - b[0])).toBeCloseTo(0.75, 6)
  })
  it('kurzer Abschnitt: mindestens 60 m breit; ohne Achse kein Ausschnitt', () => {
    const b = ausschnitt([[[2600000, 1200000], [2600010, 1200000]]])!
    expect(b[2] - b[0]).toBeCloseTo(60, 6)
    expect(ausschnitt([])).toBeNull()
  })
  it('WMS SWISSIMAGE in LV95', () => {
    const u = wmsBildUrl([2600000, 1200000, 2600100, 1200050], 1000, 500)
    expect(u).toContain('LAYERS=ch.swisstopo.swissimage')
    expect(u).toContain('CRS=EPSG:2056&BBOX=2600000.0,1200000.0,2600100.0,1200050.0&WIDTH=1000&HEIGHT=500')
  })
})
