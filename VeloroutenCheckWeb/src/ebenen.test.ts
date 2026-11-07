import { describe, expect, it } from 'vitest'
import { dtvKlasse, EBENEN, ebenenFarbe, ebenenFuer, ebenenMischen, ebenenSichtbar, haltestellenObjekte, imUmkreis, legendeFuer, mitAusschnitt, obsObjekte, osmTempoObjekte, spurenText, steigungObjekte, tempoKlasse } from './ebenen'
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
  it('Legende der Verkehrszonen: jede Bezeichnung nur einmal, beide Klassen behalten ihre Farbe', () => {
    const zonen = EBENEN.find(e => e.id === 'zonen')!
    const texte = legendeFuer(zonen, 'zurich').map(l => l[2])
    expect(new Set(texte).size).toBe(texte.length)
    expect(ebenenFarbe(zonen, 't30_zone')).toBe(ebenenFarbe(zonen, 'Tempo-30-Zone'))
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
    const defs = ebenenFuer('bern').filter(e => !['av', 'lsa', 'strasseTlm', 'bauzonen'].includes(e.id))   // diese stehen immer da, eigene Tests unten
    const ids = (r: ReturnType<typeof ebenenSichtbar>) => r.zeigen.map(e => e.id)
    const daten = { tempo: [{ id: 't', klasse: 't30', text: '' }] }
    expect(ids(ebenenSichtbar(defs, daten, { moeglich: false, laufend: {} }))).toEqual(['tempo'])
    expect(ids(ebenenSichtbar(defs, daten, { moeglich: true, laufend: { parkfelder: 1, fussnetz: 2 } }))).toEqual(['fussnetz', 'parkfelder', 'tempo'])
    const fertig = ebenenSichtbar(defs, daten, { moeglich: true, laufend: {} })
    expect(ids(fertig)).toEqual(['tempo'])
    expect(fertig.ohne.map(e => e.id)).toContain('parkfelder')
    expect(fertig.spaeter).toEqual([])
  })

  it('nennt Ebenen ohne übernommenen Abschnitt nicht «ohne Daten», sie sind nur noch nicht abgefragt', () => {
    const defs = EBENEN.filter(e => ['gelaende', 'parkfelder', 'tempo'].includes(e.id))
    const leer = ebenenSichtbar(defs, {}, { moeglich: false, laufend: {} })
    expect(leer.spaeter.map(e => e.id).sort()).toEqual(['gelaende', 'parkfelder'])
    expect(leer.ohne.map(e => e.id)).toEqual(['tempo'])
    const mitAbschnitt = ebenenSichtbar(defs, {}, { moeglich: true, laufend: {} })
    expect(mitAbschnitt.spaeter).toEqual([])
    expect(mitAbschnitt.ohne.map(e => e.id)).toContain('parkfelder')
  })

  it('zeigt die amtliche Vermessung immer, sie lädt auch ohne Abschnitt für den Ausschnitt', () => {
    const av = EBENEN.filter(e => e.id === 'av')
    for (const moeglich of [false, true]) expect(ebenenSichtbar(av, {}, { moeglich, laufend: {} }).zeigen.map(e => e.id)).toEqual(['av'])
  })
})

describe('Ebenen aus dem Kartenausschnitt', () => {
  const lsa = (id: string, e: number) => ({ id, punkt: [e, 1200000] as [number, number], klasse: 'lsa', text: '' })
  it('zählt dieselbe Anlage einmal und behält die übrigen', () => {
    const d = mitAusschnitt({ lsa: [lsa('segment', 2600000), lsa('anderswo', 2600100)], bav: [] }, { lsa: [lsa('ausschnitt', 2600001)] })
    expect(d.lsa!.map(o => o.id)).toEqual(['anderswo', 'ausschnitt'])
    expect(d.bav).toEqual([])
  })
  it('zeigt die Ebenen der Karte auch ohne Daten und ohne Segmente', () => {
    const { zeigen } = ebenenSichtbar(ebenenFuer('schweiz'), {}, { moeglich: false, laufend: {} })
    expect(zeigen.map(e => e.id)).toEqual(expect.arrayContaining(['lsa', 'strasseTlm', 'bauzonen']))
  })
})
