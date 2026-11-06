import { afterEach, describe, it, expect, vi } from 'vitest'
import { ausschnitt, flugjahrKacheln, flugjahrUrl, ladeFlugjahre, wmsBildUrl } from './kartenbild'
import type { P } from './lv95'

describe('Bericht — Kartenausschnitt und Luftbild', () => {
  it('Rand 15 m, Seitenverhältnis zwischen 0,45 und 0,6', () => {
    const lang: P[] = [[2600000, 1200000], [2600400, 1200010]]
    const [e0, n0, e1, n1] = ausschnitt([lang])!
    expect(e0).toBeCloseTo(2599985, 6)
    expect(e1).toBeCloseTo(2600415, 6)
    expect((n1 - n0) / (e1 - e0)).toBeCloseTo(0.45, 6)
    const hoch: P[] = [[2600000, 1200000], [2600000, 1200300]]
    const b = ausschnitt([hoch])!
    expect((b[3] - b[1]) / (b[2] - b[0])).toBeCloseTo(0.6, 6)
    expect(b[1]).toBeLessThanOrEqual(1200000 - 15)   // weiter gefasst, die Achse bleibt ganz im Bild
    expect(b[3]).toBeGreaterThanOrEqual(1200300 + 15)
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

describe('Flugjahr des Luftbilds', () => {
  const G = 2600000, N = 1200000
  afterEach(() => vi.unstubAllGlobals())
  it('1-km-Kacheln entlang der Achse, ohne Doppel, höchstens vier mit Anfang und Ende', () => {
    expect(flugjahrKacheln([[[G + 10, N + 10], [G + 900, N + 20], [G + 1100, N + 30]]])).toEqual([`${G},${N}`, `${G + 1000},${N}`])
    const lang = flugjahrKacheln([Array.from({ length: 8 }, (_, i) => [G + i * 1000, N] as P)])
    expect(lang).toHaveLength(4)
    expect(lang[0]).toBe(`${G},${N}`)
    expect(lang[3]).toBe(`${G + 7000},${N}`)
  })
  it('Adresse der Kachelmitte wie im fgsCheck', () => {
    const u = flugjahrUrl(`${G},${N}`)
    expect(u).toContain('layers=all:ch.swisstopo.images-swissimage-dop10.metadata')
    expect(u).toContain(`geometry=${G + 500},${N + 500},${G + 501},${N + 501}`)
  })
  it('Jahre aufsteigend ohne Doppel; Fehler und leere Antworten fallen weg', async () => {
    const antworten = ['2024', '2023', null]
    let i = 0
    vi.stubGlobal('fetch', vi.fn(async () => { const j = antworten[i++]
      return j ? new Response(JSON.stringify({ results: [{ attributes: { datenstand: j } }] })) : new Response('x', { status: 500 }) }))
    expect(await ladeFlugjahre([[[G, N], [G + 1000, N], [G + 2000, N]]])).toBe('2023, 2024')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('weg') }))
    expect(await ladeFlugjahre([[[G, N]]])).toBe('')
  })
})
