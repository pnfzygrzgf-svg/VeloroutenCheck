import { describe, it, expect } from 'vitest'
import {
  busBand, candToSection, candsToSections, defaultSection, dtvAssumed, dtvEff, mergeSegs,
  oevAngebotAuto, sollVon, DTV_ANGENOMMEN, type Seg,
} from './strecke'
import type { Cand } from './VeloMap'

const M_LAT = 1 / 111320
const M_LON = 1 / (111320 * Math.cos((47 * Math.PI) / 180))
const pt = (xM: number, yM: number) => ({ lat: 47 + yM * M_LAT, lon: 7.4 + xM * M_LON })
// Kandidat entlang der x-Achse von x0 bis x1 (Länge = x1 − x0).
const cand = (id: number, x0: number, x1: number, extra: Partial<Cand> = {}): Cand =>
  ({ id, ist: 'Mischverkehr', len: x1 - x0, name: 'Teststrasse', geom: [pt(x0, 0), pt(x1, 0)], selected: true, ...extra })

describe('DTV-Annahme «≤ 2000» (nur Bern, nur nach erfolgreicher Abfrage)', () => {
  it('von Hand angelegter Abschnitt: KEINE Annahme — es wurde nie nachgesehen', () => {
    const s = { ...defaultSection(), speed: 30, ist: 'Mischverkehr' as const }
    expect(dtvAssumed(s, 'bern')).toBe(false)
    expect(dtvEff(s, 'bern')).toBeNaN()
  })
  it('Abschnitt aus einem geprüften Segment ohne Eintrag: Annahme gilt', () => {
    const s = candToSection(cand(1, 0, 100, { speed: 30, bern: { dtvGeprueft: true } }))
    expect(dtvAssumed(s, 'bern')).toBe(true)
    expect(dtvEff(s, 'bern')).toBe(DTV_ANGENOMMEN)
  })
  it('Segment VOR der Anreicherung übernommen (kein Prüfvermerk): keine Annahme', () =>
    expect(dtvAssumed(candToSection(cand(1, 0, 100, { speed: 30 })), 'bern')).toBe(false))
  it('Abfrage gescheitert (Werte da, aber kein Prüfvermerk): keine Annahme', () =>
    expect(dtvAssumed(candToSection(cand(1, 0, 100, { bern: { speed: 30 } })), 'bern')).toBe(false))
  it('andere Städte: nie', () => {
    const s = candToSection(cand(1, 0, 100, { speed: 30, bern: { dtvGeprueft: true } }))
    expect(dtvAssumed(s, 'zurich')).toBe(false)
  })
  it('ohne Tempo keine Annahme; ein amtlicher DTV geht vor', () => {
    expect(dtvAssumed(candToSection(cand(1, 0, 100, { bern: { dtvGeprueft: true } })), 'bern')).toBe(false)
    const s = candToSection(cand(1, 0, 100, { speed: 30, bern: { dtv: 8000, dtvGeprueft: true } }))
    expect(dtvAssumed(s, 'bern')).toBe(false)
    expect(dtvEff(s, 'bern')).toBe(8000)
  })
  it('zusammengefasster Abschnitt: geprüft nur, wenn JEDES Segment geprüft ist', () => {
    const [a] = candsToSections([
      cand(1, 0, 100, { speed: 30, bern: { dtvGeprueft: true } }),
      cand(2, 100, 180, { speed: 30 }),
    ], 'bern')
    expect(a.candIds).toEqual([1, 2])
    expect(a.dtvGeprueft).toBe(false)
    expect(dtvAssumed(a, 'bern')).toBe(false)
  })
})

describe('Zusammenfassen — zusammen bleibt, was gleich bewertet wird', () => {
  const bern = (dtv: number | undefined, routentyp?: 'Velohauptroute' | 'Veloroute') =>
    ({ speed: 30, dtvGeprueft: true, ...(dtv != null ? { dtv } : {}), ...(routentyp ? { routentyp } : {}) })

  it('gleiche Form, gleiches Tempo, gleiches Soll → ein Abschnitt', () => {
    const r = candsToSections([cand(1, 0, 100, { bern: bern(3000) }), cand(2, 100, 220, { bern: bern(4000) })], 'bern')
    expect(r).toHaveLength(1)
    expect(r[0].candIds).toEqual([1, 2])
  })
  it('DTV-Sprung über eine Soll-Grenze (4 000 → 12 000) trennt', () => {
    const r = candsToSections([cand(1, 0, 300, { bern: bern(4000) }), cand(2, 300, 400, { bern: bern(12000) })], 'bern')
    expect(r).toHaveLength(2)
    expect(r.map(s => s.dtv)).toEqual([4000, 12000])   // vorher: ein Abschnitt mit DTV 4 000
  })
  it('Wechsel des Routentyps trennt', () => {
    const r = candsToSections([
      cand(1, 0, 200, { bern: bern(3000, 'Veloroute') }),
      cand(2, 200, 320, { bern: bern(3000, 'Velohauptroute') }),
    ], 'bern')
    expect(r.map(s => s.routentyp)).toEqual(['Veloroute', 'Velohauptroute'])
  })
  it('unbestimmte Werte trennen NICHT; der fehlende DTV kommt vom Nachbarsegment', () => {
    // Zürich: DTV nur an der Zählstelle (kurzes Segment), das lange Segment hat keinen.
    const r = candsToSections([
      cand(1, 0, 300, { speed: 50, bern: { routentyp: 'Veloroute' } }),
      cand(2, 300, 380, { speed: 50, bern: { routentyp: 'Veloroute', dtv: 9000 } }),
    ], 'zurich')
    expect(r).toHaveLength(1)
    expect(r[0].dtv).toBe(9000)
    expect(r[0].quelle.dtv).toBe('amtlich')
  })
  it('Stummel (< 25 m) geht im Nachbarn auf, auch bei anderer Form', () => {
    const r = candsToSections([
      cand(1, 0, 200, { bern: bern(3000) }),
      cand(2, 200, 215, { ist: 'Radstreifen', bern: bern(3000) }),
      cand(3, 215, 400, { bern: bern(3000) }),
    ], 'bern')
    expect(r).toHaveLength(1)
    expect(r[0].ist).toBe('Mischverkehr')
  })
  it('Breite: die schmalste Stelle gleicher Form gilt, nicht die des längsten Segments', () => {
    const r = candsToSections([
      cand(1, 0, 300, { ist: 'Radstreifen', breite: 1.8, bern: bern(3000) }),
      cand(2, 300, 400, { ist: 'Radstreifen', breite: 1.5, bern: bern(3000) }),
    ], 'bern')
    expect(r).toHaveLength(1)
    expect(r[0].breite).toBe(1.5)
  })
  it('Umweltspur rechnet ohne Soll → DTV-Sprung trennt nicht', () => {
    const r = candsToSections([
      cand(1, 0, 200, { ist: 'Umweltspur', bern: bern(4000) }),
      cand(2, 200, 350, { ist: 'Umweltspur', bern: bern(12000) }),
    ], 'bern')
    expect(r).toHaveLength(1)
  })
  it('abgewählte Segmente bleiben draussen; die Reihenfolge folgt der Strasse', () => {
    const r = candsToSections([
      cand(3, 400, 500, { ist: 'Radstreifen' }), cand(1, 0, 200), cand(2, 200, 400, { selected: false }),
      cand(4, 500, 650, { ist: 'Radweg abgesetzt' }),
    ], 'bern')
    expect(r.map(s => s.candIds)).toEqual([[1], [3], [4]])
  })
  it('mergeSegs ohne Segmente → leer', () => expect(mergeSegs([] as Seg[], 'bern')).toEqual([]))
})

describe('sollVon', () => {
  it('Basel: ohne Strassentyp unbestimmt, mit Strassentyp auch ohne DTV bestimmt', () => {
    const s = { ...defaultSection(), speed: 30, ist: 'Mischverkehr' as const, routentyp: 'Veloroute' as const }
    expect(sollVon(s, 'basel')).toBeUndefined()
    expect(sollVon({ ...s, strassentyp: 'siedlungsorientiert' }, 'basel')).toBe('Mischverkehr')
  })
  it('Zürich: ohne Routentyp unbestimmt (das Soll hängt dort an ihm)', () => {
    const s = { ...defaultSection(), speed: 30, dtv: 3000, ist: 'Mischverkehr' as const }
    expect(sollVon(s, 'zurich')).toBeUndefined()
    expect(sollVon(s, 'bern')).toBe('Radstreifen')
  })
})

describe('ÖV-Angebot aus der Erkennung', () => {
  it('Frequenzbänder: 4/h = 15 Min, 12/h = 5 Min', () => {
    expect(busBand(4)).toBe('bus_ab15')
    expect(busBand(5)).toBe('bus_5_15')
    expect(busBand(12)).toBe('bus_5_15')
    expect(busBand(13)).toBe('bus_unter5')
  })
  it('Tram geht vor; Bus nur mit Takt; 0 Fahrten/h ist kein Angebot', () => {
    expect(oevAngebotAuto({ oevHalt: true, oevTram: true, oevBus: true, busPerH: 20 })).toBe('tram')
    expect(oevAngebotAuto({ oevHalt: true, oevTram: false, oevBus: true, busPerH: 8 })).toBe('bus_5_15')
    expect(oevAngebotAuto({ oevHalt: true, oevTram: false, oevBus: true })).toBeUndefined()
    expect(oevAngebotAuto({ oevHalt: true, oevTram: false, oevBus: true, busPerH: 0 })).toBeUndefined()
    expect(oevAngebotAuto({ oevHalt: false, oevTram: true, oevBus: false })).toBeUndefined()
  })
})

describe('candToSection — Herkunft je Feld', () => {
  it('amtlich vor OSM; Markierung stellt Form und Breite', () => {
    const s = candToSection(cand(7, 0, 120, { speed: 50, breite: 1.2,
      bern: { speed: 30, routentyp: 'Veloroute', radstreifen: { breite: 1.6 } } }))
    expect([s.speed, s.quelle.speed]).toEqual([30, 'amtlich'])
    expect([s.ist, s.quelle.ist]).toEqual(['Radstreifen', 'markierung'])
    expect([s.breite, s.quelle.breite]).toEqual([1.6, 'markierung'])
    expect(s.candIds).toEqual([7])
  })
  it('ohne Werte bleiben die Felder leer (keine erfundenen Defaults)', () => {
    const s = candToSection(cand(1, 0, 100))
    expect(s.speed).toBeNaN()
    expect(s.dtv).toBeNaN()
    expect(s.routentyp).toBe('')
  })
})
