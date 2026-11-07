import { wgs } from './e5/geo'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ladeE6Kontext } from './e6'
import { E6_DIENSTE, ladeE6 } from './e5/daten/anbieter/gemeinsam/e6'
import { datenlaufNeu, datenStaende } from './datenstand'
import { E6_KONTEXT, EBENEN, ebenenFuer, ebenenSichtbar } from './ebenen'
import type { Cand } from './VeloMap'
vi.mock('./e5/daten/anbieter/gemeinsam/e6', async importOriginal => ({ ...await importOriginal<typeof import('./e5/daten/anbieter/gemeinsam/e6')>(), ladeE6: vi.fn() }))
const mock = vi.mocked(ladeE6)
const zhOrt = { name: 'Zürich', bfs: 261, kanton: 'ZH', stadt: 'zurich' as const }
const c = (ort: Cand['datenOrt'], id = 1): Cand => ({ id, wayId: id, geom: [{ lat: 47.390, lon: 8.530 }, { lat: 47.3901, lon: 8.5301 }], name: 'Test', len: 20, selected: true, ist: 'Mischverkehr', datenOrt: ort })
const result = (id: string, key = 'a') => ({ daten: { id, url: 'https://example.test/' + key, abgerufen: '2026-11-03T12:00:00Z', datenstand: '01.11.2026 (Katalogaktualisierung)', objekte: [{ id: key, name: 'Inventar', hinweis: 'Nur Kontext', kontext: 'fuss', teile: [[[2683000, 1252000], [2683100, 1252000]] as [number, number][]] }], roh: {} }, ms: 1, bytes: 10, quelle: 'example.test' })
beforeEach(() => { datenlaufNeu(); mock.mockReset(); mock.mockImplementation(async d => result(d.id, d.id)) })
afterEach(() => vi.restoreAllMocks())
describe('E6 im VRC', () => {
  it('Bern und unbekannter Ort laden keine gebietsfremden E6-Quellen', async () => {
    expect(await ladeE6Kontext([c({ name: 'Bern', bfs: 351, kanton: 'BE', stadt: 'bern' }), c(undefined, 2)])).toEqual({ ebenen: {}, fehler: [] })
    expect(mock).not.toHaveBeenCalled(); expect(datenStaende()).toEqual([])
  })
  it('Zürcher Quellen nach Datenort, Kandidaten und deren Bewertungseingaben bleiben unverändert', async () => {
    const cs = [c(zhOrt)], vorher = JSON.stringify(cs)
    const x = await ladeE6Kontext(cs)
    expect(mock.mock.calls.map(a => a[0].id)).toEqual(['e6.zh.netz'])
    expect(Object.keys(x.ebenen)).toEqual(['e6.zh.netz']); expect(x.fehler).toEqual([]); expect(JSON.stringify(cs)).toBe(vorher)
    expect(datenStaende()).toHaveLength(1)
    expect(datenStaende().every(s => s.datenstand.includes('01.11.2026'))).toBe(true)
    const menu = ebenenFuer('bern', x.ebenen).filter(e => e.id.startsWith('e6.'))
    expect(menu.map(e => e.id)).toEqual(['e6.zh.netz']); expect(menu.every(e => e.standardAn === false)).toBe(true)
    expect(menu.map(e => e.titel)).toEqual([...menu.map(e => e.titel)].sort((a, b) => a.localeCompare(b, 'de-CH')))
  })
  it('Beleuchtung St. Gallen und Zürcher Staatsstrassen werden nicht mehr als Kartenkontext geladen', async () => {
    const x = await ladeE6Kontext([c({ name: 'St. Gallen', bfs: 3203, kanton: 'SG' }), c({ name: 'Bassersdorf', bfs: 52, kanton: 'ZH' }, 2)])
    expect(mock).not.toHaveBeenCalled(); expect(x).toEqual({ ebenen: {}, fehler: [] }); expect(datenStaende()).toEqual([])
  })
  it('Zürich lädt nur das Wegnetz, nicht Beleuchtung und taktile Rillen', async () => {
    await ladeE6Kontext([c(zhOrt)])
    expect(mock.mock.calls.map(a => a[0].id).filter(id => id !== 'e6.zh.netz')).toEqual([])
    expect(E6_KONTEXT.map(d => d.id)).toEqual(['e6.zh.netz'])
  })
  it('Fehler ist kein leeres Inventar; fremde Quellen erscheinen weder als Daten noch als fehlende Daten', async () => {
    mock.mockRejectedValue(new Error('Unvollständige Antwort'))
    const x = await ladeE6Kontext([c(zhOrt)])
    expect(x.fehler[0]).toContain('Unvollständige Antwort'); expect(x.ebenen).toEqual({})
    expect(datenStaende()[0]).toMatchObject({ status: 'fehler', ebene: 'e6.zh.netz' })
    const menu = ebenenFuer('bern', {})
    expect(menu.filter(e => e.id.startsWith('e6.')).map(e => e.id)).toEqual(['e6.zh.netz'])
    const aufteilung = ebenenSichtbar(menu, {}, { moeglich: false, laufend: {} })
    expect(aufteilung.zeigen.map(e => e.id)).toContain('e6.zh.netz')
    expect(aufteilung.ohne.map(e => e.id)).not.toContain('e6.zh.netz')
  })
  it('späte Antworten eines ersetzten Ladevorgangs werden verworfen', async () => {
    let fertig!: (x: ReturnType<typeof result>) => void
    mock.mockImplementationOnce(() => new Promise(resolve => { fertig = resolve }))
    const p = ladeE6Kontext([c(zhOrt)])
    datenlaufNeu(); fertig(result('e6.zh.netz'))
    expect(await p).toEqual({ ebenen: {}, fehler: [] }); expect(datenStaende()).toEqual([])
  })
  it('keine E6-Ebene gehört zu den beim Start eingeschalteten Ebenen', () => {
    expect(E6_KONTEXT.every(d => EBENEN.find(e => e.id === d.id)?.standardAn === false)).toBe(true)
  })
  it('Beleuchtung und taktile Rillen sind keine Ebenen mehr', () => {
    expect(EBENEN.filter(e => e.id.startsWith('e6.')).map(e => e.id)).toEqual(['e6.zh.netz'])
    expect(E6_DIENSTE.filter(d => !E6_KONTEXT.includes(d)).every(d => !EBENEN.some(e => e.id === d.id))).toBe(true)
  })
})


it('führt dasselbe Wegnetzobjekt aus überlappenden Zellen auf genau ein Objekt zusammen', async () => {
  const ll = (e: number, n: number) => { const [lat,lon] = wgs(e,n); return {lat,lon} }
  const cs = [2683050,2683350].map((e,i) => ({ ...c(zhOrt,i+1), geom: [ll(e,1252050),ll(e+1,1252050)] }))
  const weg = (id: string, name: string) => ({ id, name, hinweis: 'Kontextnetz.', kontext: 'fuss', teile: [[[2683000, 1252000], [2683100, 1252000]] as [number, number][]] })
  const gemeinsam = weg('gemeinsam', 'Weg in beiden Zellen'), andere = weg('andere', 'Nur westlich')
  mock.mockImplementation(async (d,mitte) => ({ ...result(d.id), daten: { ...result(d.id).daten, objekte: mitte[0] < 2683200 ? [andere,gemeinsam] : [gemeinsam] } }))
  const x = await ladeE6Kontext(cs)
  expect(mock).toHaveBeenCalledTimes(2)
  expect(Math.abs(mock.mock.calls[0][1][0]-mock.mock.calls[1][1][0])).toBe(300)
  expect(x.fehler).toEqual([])
  expect(x.ebenen['e6.zh.netz']!.filter(o => o.text.includes('Weg in beiden Zellen'))).toHaveLength(1)
  expect(x.ebenen['e6.zh.netz']).toHaveLength(2)
})

const ll6 = (e: number, n = 1252050) => { const [lat, lon] = wgs(e, n); return { lat, lon } }
const zellenStrecke = (anzahl: number) => Array.from({ length: anzahl }, (_, i) => ({
  ...c(zhOrt, i + 1), geom: [ll6(2683050 + i * 300), ll6(2683350 + i * 300)],
}))
it('24 räumliche Zellen statt 24 Dienstaufgaben, mit Zahl der ausgelassenen Zellen', async () => {
  const cs = zellenStrecke(27)
  const x = await ladeE6Kontext(cs)
  const zellen = new Set(mock.mock.calls.map(([, p]) => String(p)))
  expect(zellen.size).toBe(24)
  expect(mock).toHaveBeenCalledTimes(24)
  expect(x.fehler).toContain('Kartenkontext: 4 Zellen nicht geladen (Grenze: 24 räumliche Zellen).')
})
it('räumliche Streckenfolge ist unabhängig von OSM-Reihenfolge und Way-Richtung', async () => {
  const cs = zellenStrecke(27)
  await ladeE6Kontext(cs)
  const vorher = [...new Set(mock.mock.calls.map(([, p]) => String(p)))]
  mock.mockClear(); datenlaufNeu()
  await ladeE6Kontext([...cs].reverse().map(x => ({ ...x, geom: [...x.geom].reverse() })))
  expect([...new Set(mock.mock.calls.map(([, p]) => String(p)))]).toEqual(vorher)
})
it('Erfolg und Fehler verschiedener Zellen desselben Diensts bleiben gemeinsam sichtbar', async () => {
  mock.mockImplementation(async (d, p) => {
    if (p[0] > 2683200) throw new Error('Zweite Zelle ausgefallen')
    return result(d.id)
  })
  const x = await ladeE6Kontext([2683050, 2683350].map((e, i) => ({ ...c(zhOrt, i + 1), geom: [ll6(e), ll6(e + 1)] })))
  expect(x.ebenen['e6.zh.netz']).toHaveLength(1)
  expect(datenStaende()).toHaveLength(1)
  expect(datenStaende()[0]).toMatchObject({ id: 'e6.zh.netz', status: 'teilweise', geladeneZellen: 1, teilfehler: [{ fehler: 'Zweite Zelle ausgefallen' }] })
})
it('Winterthur lädt weder Zürcher Wegnetz noch kantonale Daten', async () => {
  await ladeE6Kontext([c({ name: 'Winterthur', bfs: 230, kanton: 'ZH' })])
  expect(mock).not.toHaveBeenCalled(); expect(datenStaende()).toEqual([])
})
it('Netztooltip enthält Namen, Datenstand, Originalattribute und lokalen Abrufzeitpunkt', async () => {
  mock.mockImplementation(async d => ({ ...result(d.id), daten: { ...result(d.id).daten, objekte: [{
    id: d.id, name: 'Beispielweg', hinweis: 'Originalattribute: fuss=1, velo=0, einbahn=FT.', kontext: 'fuss', teile: [[[2683000, 1252000], [2683100, 1252000]] as [number, number][]],
  }] } }))
  const x = await ladeE6Kontext([c(zhOrt)])
  const text = x.ebenen['e6.zh.netz']![0].text
  expect(text).toContain('Beispielweg'); expect(text).toContain('Datenstand 01.11.2026')
  expect(text).toContain('fuss=1'); expect(text).toContain('einbahn=FT')
  expect(text).not.toContain('T12:00:00Z')
  expect(text).toContain(new Date('2026-11-03T12:00:00Z').toLocaleString('de-CH'))
})
it('überlappende Ladungen behalten gemeinsam nur übernommene Ebenen und Quellenstände', async () => {
  const { datenlaufUebernehmen, meldeQuelleStand } = await import('./datenstand')
  meldeQuelleStand('basis', 'Vorher übernommene Quelle', 'https://example.test/basis', 'av', '2026')
  datenlaufNeu({ behalten: true, uebernahmeAbwarten: true })
  let fertig!: (x: ReturnType<typeof result>) => void
  mock.mockImplementation(async (d, p) => p[0] > 2683200 ? new Promise(resolve => { fertig = resolve }) : result(d.id))
  const alt = ladeE6Kontext([2683050, 2683350].map((e, i) => ({ ...c(zhOrt, i + 1), geom: [ll6(e), ll6(e + 1)] })))
  await Promise.resolve(); await Promise.resolve()
  const generation = datenlaufNeu({ behalten: true, uebernahmeAbwarten: true })
  expect(datenStaende().map(s => s.id)).toEqual(['basis'])
  fertig(result('e6.zh.netz', 'verworfen'))
  expect(await alt).toEqual({ ebenen: {}, fehler: [] })
  mock.mockImplementation(async d => result(d.id, 'neu'))
  const neu = await ladeE6Kontext([{ ...c(zhOrt), geom: [ll6(2683050), ll6(2683051)] }])
  let gezeigt = {}
  expect(datenlaufUebernehmen(generation, () => { gezeigt = neu.ebenen })).toBe(true)
  expect(gezeigt).toEqual(neu.ebenen)
  expect(neu.ebenen['e6.zh.netz']!.map(o => o.id)).toEqual(['neu'])
  expect(datenStaende().find(s => s.id === 'e6.zh.netz')).toMatchObject({ geladeneZellen: 1, status: 'geladen' })
})
it('auch eine gekrümmte Strecke wird entlang ihrer verbundenen Zellen verfolgt', async () => {
 const { e6ZellenPlanen } = await import('./e6')
 const cs = [{ ...c(zhOrt), geom: [ll6(2683050, 1252050), ll6(2683950, 1252050), ll6(2683950, 1252950), ll6(2683050, 1252950)] }]
 const zellen = e6ZellenPlanen(cs)
 expect(zellen).toHaveLength(10)
 expect(zellen.slice(0, 4).every(z => z.mitte[1] === 1252050)).toBe(true)
 expect(zellen.slice(-4).every(z => z.mitte[1] === 1252950)).toBe(true)
})
