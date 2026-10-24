import { afterEach, describe, expect, it, vi } from 'vitest'
import { overpassAntwort, overpassFetch, mitKennung } from './overpass'

describe('Overpass-Antwort (overpass.ts, Befund 24.10.2026)', () => {
  it('JSON mit Daten ist ok, HTML mit duplicate_query und ein Abbruch sind Fehler', () => {
    expect(overpassAntwort('{"elements":[]}')).toEqual({ ok: { elements: [] } })
    const html = '<html><body><p><strong style="color:#FF0000">Error</strong>: runtime error: open64: 0 Success /osm3s_osm_base Dispatcher_Client::request_read_and_idx::duplicate_query </p></body></html>'
    expect('fehler' in overpassAntwort(html) && overpassAntwort(html)).toEqual({ fehler: 'runtime error: open64: 0 Success /osm3s_osm_base Dispatcher_Client::request_read_and_idx::duplicate_query' })
    expect(overpassAntwort('{"elements":[],"remark":"runtime error: Query timed out"}')).toEqual({ fehler: 'runtime error: Query timed out' })
  })
})

describe('mitKennung', () => {
  it('ohne Wiederholung unverändert, sonst mit Kommentar am Ende', () => {
    expect(mitKennung('[out:json][timeout:25];node(1);out;', 0)).toBe('[out:json][timeout:25];node(1);out;')
    expect(mitKennung('[out:json][timeout:25];node(1);out;', 2)).toBe('[out:json][timeout:27];node(1);out;')
    expect(mitKennung('[out:json];node(1);out;', 1)).toBe('[timeout:26][out:json];node(1);out;')
    expect(mitKennung('node(1);out;', 1)).toBe('[timeout:26];node(1);out;')
  })
})

describe('overpassFetch: Doubletten zusammenfassen, bei duplicate_query wiederholen', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
  it('gleiche Abfrage gleichzeitig: ein Aufruf beim Server', async () => {
    const f = vi.fn(async () => new Response('{"elements":[1]}', { status: 200 }))
    vi.stubGlobal('fetch', f)
    const [a, b] = await Promise.all([overpassFetch('q1'), overpassFetch('q1')])
    expect(a).toEqual({ elements: [1] }); expect(b).toBe(a)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('duplicate_query: sofort nochmals beim selben Server, als andere Abfrage (Zeitlimit), dann Daten', async () => {
    let n = 0
    const f = vi.fn(async (_u: string, _i: RequestInit) => (++n === 1 ? new Response('<p>runtime error: Dispatcher_Client::request_read_and_idx::duplicate_query</p>', { status: 200 }) : new Response('{"elements":[2]}', { status: 200 })))
    vi.stubGlobal('fetch', f)
    expect(await overpassFetch('q2')).toEqual({ elements: [2] })
    expect(f).toHaveBeenCalledTimes(2)
    const [a, b] = f.mock.calls
    expect(a[0]).toBe(b[0])                                                         // gleicher Server
    expect(decodeURIComponent(String(b[1].body))).toBe('data=[timeout:26];q2')   // mit anderem Zeitlimit
    expect(decodeURIComponent(String(a[1].body))).toBe('data=q2')
  })
  it('Ergebnis wird wiederverwendet (Teilen: beide Teile fragen denselben Ausschnitt ab)', async () => {
    const f = vi.fn(async () => new Response('{"elements":[3]}', { status: 200 }))
    vi.stubGlobal('fetch', f)
    await overpassFetch('q3'); await overpassFetch('q3')
    expect(f).toHaveBeenCalledTimes(1)
  })
})
