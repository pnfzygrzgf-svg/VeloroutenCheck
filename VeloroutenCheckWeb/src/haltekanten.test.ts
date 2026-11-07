import { describe, expect, it } from 'vitest'
import { bedienteKanten, mitOsmErgaenzt } from './cityShared'
import type { Stop } from './VeloMap'

const kante = (nummer: string, extra: Record<string, unknown> = {}) => ({ geometry: { type: 'MultiPoint', coordinates: [[2683000, 1247000]] },
  properties: { haltestelle: 'Zürich, Central', nummer_text: `ch:1:sloid:${nummer}`, bezeichnung_de: 'C', ...extra } })

describe('Haltekanten des BAV', () => {
  it('nimmt nur Kanten aus der Tabelle des Fahrplans und liest das Verkehrsmittel dort', () => {
    const k = bedienteKanten([kante('1:0:1'), kante('2:0:1'), kante('3:0:1')], { '1:0:1': 'b', '3:0:1': 'bt' })
    expect(k.map(s => s.modi)).toEqual([['bus'], ['tram', 'bus']])
    expect(k[0]).toMatchObject({ name: 'Zürich, Central, Kante C', quelle: 'bav' })
    expect(k[0].lat).toBeGreaterThan(47); expect(k[0].lon).toBeGreaterThan(8)
  })
  it('lässt Stationspunkte weg', () => {
    expect(bedienteKanten([{ geometry: { type: 'MultiPoint', coordinates: [[2683000, 1247000]] }, properties: { name: 'Zürich, Central', betriebspunkttyp_de: 'Haltestelle' } }], { x: 'b' })).toEqual([])
  })
  it('behält OSM nur, wo keine Kante in der Nähe liegt', () => {
    const k: Stop = { lat: 47.37, lon: 8.54, name: 'Kante', quelle: 'bav' }
    const nah: Stop = { lat: 47.3701, lon: 8.54, name: 'nah' }, fern: Stop = { lat: 47.372, lon: 8.54, name: 'fern' }
    expect(mitOsmErgaenzt([k], [nah, fern]).map(s => s.name)).toEqual(['Kante', 'fern'])
    expect(mitOsmErgaenzt([], [nah]).map(s => s.name)).toEqual(['nah'])
  })
})
