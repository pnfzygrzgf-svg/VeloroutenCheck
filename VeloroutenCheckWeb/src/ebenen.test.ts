import { describe, expect, it } from 'vitest'
import { dtvKlasse, EBENEN, ebenenFuer, ebenenMischen, ebenenSichtbar, haltestellenObjekte, imUmkreis, legendeFuer, obsObjekte, osmTempoObjekte, spurenText, steigungObjekte, tempoKlasse } from './ebenen'
import { dtvEbene } from './cityShared'
import type { Cand } from './VeloMap'

const cand = (id: number, geom: { lat: number; lon: number }[], x: Partial<Cand> = {}): Cand =>
  ({ id, wayId: id, ist: 'Mischverkehr', len: 100, name: 'Teststrasse', geom, selected: true, ...x }) as Cand
const linie = [{ lat: 46.95, lon: 7.44 }, { lat: 46.95, lon: 7.4413 }]

describe('ebenen', () => {
  it('Klassen: Tempo und DTV in den gemeinsamen Stufen', () => {
    expect([20, 30, 40, 50, 60, 80].map(tempoKlasse)).toEqual(['t20', 't30', 't40', 't50', 't60', 't60'])
    expect([1500, 2000, 4000, 9000, 15000, 30000].map(dtvKlasse)).toEqual(['d2', 'd2', 'd5', 'd10', 'd20', 'd99'])
  })
  it('Ebenen je Stadt: Strassentyp nur Basel, OBS nur Bern und Zürich', () => {
    expect(ebenenFuer('basel').map(e => e.id)).toContain('strassentyp')
    expect(ebenenFuer('bern').map(e => e.id)).not.toContain('strassentyp')
    expect(ebenenFuer('luzern').map(e => e.id)).not.toContain('obs')
  })
  it('Mischen: je Ebene nach id eindeutig, neuere ersetzen ältere', () => {
    const a = { tempo: [{ id: 'x', klasse: 't30', text: 'alt' }] }
    const m = ebenenMischen(a, { tempo: [{ id: 'x', klasse: 't50', text: 'neu' }, { id: 'y', klasse: 't30', text: 'y' }] })
    expect(m.tempo!.map(o => [o.id, o.text])).toEqual([['x', 'neu'], ['y', 'y']])
  })
  it('OSM-Tempo nur, wo amtlich nichts liegt; gestrichelt', () => {
    const o = osmTempoObjekte([cand(1, linie, { speed: 30 }), cand(2, linie, { speed: 50, bern: { speed: 30 } })])
    expect(o.map(x => [x.id, x.klasse, x.gestrichelt])).toEqual([['osm:1', 't30', true]])
  })
  it('OBS nach dem Median; befahren ohne Überholung grau', () => {
    const o = obsObjekte([cand(1, linie, { obs: { median: 1.3, mean: 1.3, count: 5, below150: 3, usage: 9 } }),
      cand(2, linie, { obs: { median: NaN, mean: NaN, count: 0, below150: 0, usage: 4 } })])
    expect(o.map(x => x.klasse)).toEqual(['o1', 'o0'])
  })
  it('Haltestellen: Tram erkennbar, Bus mit Takt aus Fahrten je Stunde', () => {
    const [a, b, c, d] = haltestellenObjekte([{ lat: 46.95, lon: 7.44, name: 'Bärenplatz', perH: 8, modi: ['bus'] },
      { lat: 46.951, lon: 7.44, name: 'Zytglogge', modi: ['tram'], linien: ['6', '7', '8'] },
      { lat: 46.952, lon: 7.44, name: 'Bahnhof', modi: ['tram', 'bus'], perH: 20 }, { lat: 46.953, lon: 7.44, name: 'X' }])
    expect([a.klasse, a.wert, b.klasse, b.wert, c.klasse, d.klasse]).toEqual(['takt', '7,5′', 'tram', 'Tram', 'tram', 'unbekannt'])
    expect(a.text).toContain('Bushaltestelle Bärenplatz · Bus-Takt 7,5 Min')
    expect(b.text).toBe('Tramhaltestelle Zytglogge · Linien 6, 7, 8')
    expect(c.text).toContain('Tram- und Bushaltestelle Bahnhof')
  })
  it('Umkreis: nur Objekte nahe den Segmenten', () => {
    const box = { s: 46.94, n: 46.96, w: 7.43, e: 7.45 }
    expect(imUmkreis([{ id: 'a', punkt: { lat: 46.95, lon: 7.44 }, klasse: 'x', text: '' },
      { id: 'b', punkt: { lat: 47.3, lon: 8.5 }, klasse: 'x', text: '' }], box).map(o => o.id)).toEqual(['a'])
    expect(imUmkreis([{ id: 'a', punkt: { lat: 46.95, lon: 7.44 }, klasse: 'x', text: '' }], null)).toEqual([])
  })
  it('DTV-Zählstelle auf dem Segment: Punkt und Zuordnungslinie', () => {
    const o = dtvEbene([cand(7, linie)], [{ lat: 46.95, lon: 7.4406, dtv: 8400 }], 'Test')
    expect(o.map(x => x.klasse)).toEqual(['d10', 'zuordnung'])
    expect(o[1].id).toBe('zu:7')
  })
  it('Steigung je Abschnitt: Klasse, Wert mit Richtung bergauf, unbekannt grau', () => {
    const o = steigungObjekte([{ id: 1, nr: 1, linien: [linie], steigung: { pct: 3.4, laenge: 200 } },
      { id: 2, nr: 2, linien: [linie], steigung: { pct: -6.2, laenge: 150 } }, { id: 3, nr: 3, linien: [linie], steigung: { pct: null, laenge: 0, hinweis: 'zu kurz' } },
      { id: 4, nr: 4, linien: [linie] }])
    expect(o.map(x => [x.klasse, x.wert])).toEqual([['s2', '3,4 % ↑ A'], ['s5', '6,2 % ↑ B'], ['s?', undefined]])
    expect(o[2].text).toBe('Abschnitt 3: zu kurz')
  })
  it('Spuren aus OSM im Tooltip', () => {
    expect(spurenText({ vor: ['links', 'geradeaus-rechts'], rueck: ['keine'], busVor: 0 })).toBe('Spuren (OSM): in Wegrichtung 2 Spuren (← ↑→) · Gegenrichtung 1 Spur')
    expect(spurenText({ vor: ['keine'], rueck: [] })).toBe('Spuren (OSM): in Wegrichtung 1 Spur · Einbahn')
    expect(spurenText(undefined)).toBeNull()
  })
  it('Legende je Stadt: Buslinien nur in Bern', () => {
    const oev = EBENEN.find(e => e.id === 'oev')!
    expect(legendeFuer(oev, 'bern').map(l => l[0])).toEqual(['tram', 'bus'])
    expect(legendeFuer(oev, 'zurich').map(l => l[0])).toEqual(['tram'])
  })
  it('Routennetz: gelesene Linien mit dem übersetzten Routentyp, ohne Routentyp grau', async () => {
    const { routennetzEbene } = await import('./cityShared')
    const f = (k: string) => ({ geometry: { type: 'LineString', coordinates: [[7.44, 46.95], [7.441, 46.95]] }, properties: { kategorie: k } })
    const o = routennetzEbene([f('Vorzugsroute'), f('Basisnetz')], 'zh:r', 'Velonetzplanung',
      x => (x.properties.kategorie === 'Vorzugsroute' ? 'Velohauptroute' : undefined), x => String(x.properties.kategorie))
    expect(o.map(x => [x.klasse, x.text])).toEqual([['Velohauptroute', 'Velohauptroute (Vorzugsroute) · Velonetzplanung'],
      ['ohne', 'kein Routentyp (Basisnetz) · Velonetzplanung']])
  })
  it('Menü zeigt nur Quellen mit Daten; nachladbare, solange sie laden oder wenn sie etwas gefunden haben', () => {
    const defs = ebenenFuer('bern')
    const ids = (r: ReturnType<typeof ebenenSichtbar>) => r.zeigen.map(e => e.id)
    const daten = { tempo: [{ id: 't', klasse: 't30', text: '' }] }
    expect(ids(ebenenSichtbar(defs, daten, { moeglich: false, laufend: {} }))).toEqual(['tempo'])
    expect(ids(ebenenSichtbar(defs, daten, { moeglich: true, laufend: { parkfelder: 1, av: 2 } }))).toEqual(['tempo', 'parkfelder', 'av'])
    const fertig = ebenenSichtbar(defs, daten, { moeglich: true, laufend: {} })
    expect(ids(fertig)).toEqual(['tempo'])
    expect(fertig.ohne.map(e => e.id)).toContain('parkfelder')
  })
})
