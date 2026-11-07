import { describe, expect, it } from 'vitest'
import { AUSSCHNITT_EBENEN, lsaDienste, lsaObjekte } from './ausschnittEbenen'
import { EBENEN } from './ebenen'
import type { RegionalObjekt } from './e5/daten/anbieter/gemeinsam/regional'

const ort = (kanton: string, bfs: number) => ({ kanton, bfs, name: 'x' })
const objekt = (x: Partial<RegionalObjekt>): RegionalObjekt => ({ id: 'ge.lsa:1:a', name: '123', tempo: null, zone: null, bestaetigen: false, hinweis: '', stand: null, ...x })

describe('Lichtsignale im Ausschnitt', () => {
  it('fragt alle fünf Inventare je nach Ort', () => {
    const ids = (kanton: string, bfs: number) => lsaDienste([ort(kanton, bfs)]).map(d => d.id)
    expect(ids('ZH', 261)).toEqual(['stadtzh.lsa'])
    expect(ids('ZH', 191)).toEqual(['ktzh.lsa'])
    expect(ids('GE', 6621)).toEqual(['ge.lsa'])
    expect(ids('BS', 2701)).toEqual(['bs.lsa'])
    expect(ids('LU', 1061)).toEqual(['lu.lsa'])
    expect(ids('BE', 351)).toEqual([])
  })
  it('liest nur Anlagen und nennt die Quelle', () => {
    const d = { name: 'Lichtsignalanlagen (Genève)', anbieter: 'SITG, Canton de Genève' }
    expect(lsaObjekte(d, [objekt({ verkehr: 'lsa', punkte: [[2500000, 1118000]] }), objekt({ punkte: [[2500000, 1118000]] })])).toEqual([{ id: 'ge.lsa:1:a:0', punkt: [2500000, 1118000], klasse: 'lsa',
      quelle: 'SITG, Canton de Genève, Lichtsignalanlagen (Genève)', text: '123; Anlagenpunkt, keine Signalgruppe; SITG, Canton de Genève' }])
  })
  it('jede Ebene der Karte steht im Menü', () => {
    for (const e of AUSSCHNITT_EBENEN) expect(EBENEN.map(x => x.id)).toContain(e.id)
  })
})
