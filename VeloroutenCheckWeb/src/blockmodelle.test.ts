import { afterEach, describe, expect, it, vi } from 'vitest'
import { blockGebaeude, blockText, ladeBlockmodelle } from './blockmodelle'

const ring = [[2665000, 1211000], [2665010, 1211000], [2665010, 1211010], [2665000, 1211000]]
const feature = (id: number) => ({ properties: { OBJECTID: id, GEBNUMMER: '467s', REL_GH: 21.7 }, geometry: { type: 'Polygon', coordinates: [ring] } })
afterEach(() => { vi.unstubAllGlobals() })

describe('blockGebaeude', () => {
  it('liest Umriss, Nummer und Höhe', () => {
    const [g] = blockGebaeude({ features: [feature(1)] })
    expect(g).toMatchObject({ id: '1:0', nummer: '467s', hoeheM: 21.7 })
    expect(g.ringe[0]).toHaveLength(4)
  })
  it('teilt mehrteilige Gebäude und lässt Einträge ohne Umriss weg', () => {
    expect(blockGebaeude({ features: [{ properties: { OBJECTID: 2 }, geometry: { type: 'MultiPolygon', coordinates: [[ring], [ring]] } }, { properties: { OBJECTID: 3 }, geometry: null }] }).map(g => g.id)).toEqual(['2:0', '2:1'])
  })
})

describe('blockText', () => {
  it('nennt Höhe nur, wenn es sie gibt', () => {
    expect(blockText({ id: 'a', ringe: [], nummer: '467s', hoeheM: 21.7 })).toBe('Gebäude 467s · Höhe rund 22 m · Blockmodell Kanton Luzern')
    expect(blockText({ id: 'a', ringe: [], nummer: '', hoeheM: null })).toBe('Gebäude · Blockmodell Kanton Luzern')
  })
})

describe('ladeBlockmodelle', () => {
  const antwort = (features: unknown) => new Response(JSON.stringify({ features }), { status: 200 })
  it('blättert bis zur kurzen Seite', async () => {
    const holen = vi.fn(async (url: string) => antwort(new URL(url).searchParams.get('resultOffset') === '0' ? Array.from({ length: 2000 }, (_, i) => feature(i)) : [feature(5000)]))
    vi.stubGlobal('fetch', holen)
    expect(await ladeBlockmodelle([1, 2, 3, 4])).toHaveLength(2001)
    expect(holen).toHaveBeenCalledTimes(2)
  })
  it('wirft bei ungültiger Antwort, statt leer zu melden', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 400 } }), { status: 200 })))
    await expect(ladeBlockmodelle([1, 2, 3, 4])).rejects.toThrow('ungültige Antwort')
  })
})
