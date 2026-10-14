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
  ({ id, wayId: id, ist: 'Mischverkehr', len: x1 - x0, name: 'Teststrasse', geom: [pt(x0, 0), pt(x1, 0)], selected: true, ...extra })

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

describe('Zusammenfassen — ein von Hand gesetzter Schnitt bleibt eine Grenze', () => {
  const teil = (id: number, x0: number, x1: number, nr: number, extra: Partial<Cand> = {}): Cand =>
    cand(id, x0, x1, { wayId: 500, teil: { nr, anzahl: 2, startM: x0 }, ...extra })
  const bern = { speed: 30, dtv: 3000, dtvGeprueft: true }

  it('zwei gleich bewertete Teile desselben Ways → zwei Abschnitte, mit Teil im Label', () => {
    const r = candsToSections([teil(-1, 0, 200, 1, { bern }), teil(-2, 200, 441, 2, { bern })], 'bern')
    expect(r.map(s => s.candIds)).toEqual([[-1], [-2]])
    expect(r[0].label).toBe('Teststrasse · 200 m · OSM way 500 · Teil 1/2')
  })
  it('ein kurzes Teil (< 25 m) ist kein Stummel und geht nicht im Nachbarteil auf', () => {
    const r = candsToSections([teil(-1, 0, 10, 1, { bern }), teil(-2, 10, 300, 2, { bern })], 'bern')
    expect(r).toHaveLength(2)
  })
  it('ein Teil darf mit dem gleich bewerteten Nachbar-Way zusammengehen', () => {
    const r = candsToSections([
      cand(9, -150, 0, { bern }), teil(-1, 0, 200, 1, { bern }), teil(-2, 200, 441, 2, { bern }),
    ], 'bern')
    expect(r.map(s => s.candIds)).toEqual([[9, -1], [-2]])
  })
})

import { ausrichtung, seiteA, tauscheSeiten } from './strecke'
describe('candToSection — Seiten (Fahrtrichtungen)', () => {
  // Way nach Osten: rechts = Seite in Way-Richtung (Süden), links = Gegenrichtung.
  const einseitig = (extra: Partial<Cand> = {}) => cand(1, 0, 100, {
    ist: 'Radstreifen', seiten: { rechts: 'Radstreifen', links: 'Mischverkehr' }, breiteSeiten: { rechts: 1.5 }, ...extra })

  it('einseitiger Radstreifen: Seite A Radstreifen, Seite B Mischverkehr', () => {
    const s = candToSection(einseitig())
    expect([s.ist, s.breite, s.quelle.ist, s.quelle.breite]).toEqual(['Radstreifen', 1.5, 'osm', 'osm'])
    expect(s.gegen?.ist).toBe('Mischverkehr')
    expect(s.gegen?.breite).toBeNaN()
    expect(s.richtung).toBe('beide')
    expect(s.peilungA).toBeCloseTo(90, 0)
    expect(s.candsGegenA).toEqual([])
  })
  it('Way gegen die Strecke: Seiten vertauscht, Fahrtrichtung gedreht', () => {
    const s = candToSection(einseitig(), false)
    expect([s.ist, s.gegen?.ist]).toEqual(['Mischverkehr', 'Radstreifen'])
    expect(s.peilungA).toBeCloseTo(270, 0)
    expect(s.candsGegenA).toEqual([1])
  })
  it('beidseits gleich → keine Gegenseite («gleich wie Seite A»)', () =>
    expect(candToSection(cand(1, 0, 100, { seiten: { rechts: 'Radstreifen', links: 'Radstreifen' } })).gegen).toBeUndefined())
  it('Einbahn gegen die Way-Richtung: nur Seite A, und A ist die Fahrtrichtung', () => {
    const s = candToSection(cand(1, 0, 100, { einbahn: 'rueck', seiten: { rechts: 'Mischverkehr', links: 'Radstreifen' } }), true)
    expect([s.richtung, s.quelle.richtung, s.ist]).toEqual(['eine', 'osm', 'Radstreifen'])
    expect(s.peilungA).toBeCloseTo(270, 0)
    expect(s.osmVeloGegenverkehr).toBeUndefined()
  })
  it('Einbahn mit Velogegenverkehr → Hinweis, aber weiterhin nur Seite A', () => {
    const s = candToSection(cand(1, 0, 100, { einbahn: 'vor', veloGegenverkehr: true }))
    expect([s.richtung, s.osmVeloGegenverkehr]).toEqual(['eine', true])
  })
  it('Markierung nur rechts: A Radstreifen aus der Markierung, ein OSM-Radstreifen links wird Mischverkehr', () => {
    const s = candToSection(cand(1, 0, 100, { seiten: { rechts: 'Radstreifen', links: 'Radstreifen' },
      bern: { radstreifen: { breite: 1.6, rechts: { breite: 1.6 } } } }))
    expect([s.ist, s.breite, s.quelle.ist]).toEqual(['Radstreifen', 1.6, 'markierung'])
    expect([s.gegen?.ist, s.gegen?.quelle.ist]).toEqual(['Mischverkehr', 'markierung'])
  })
  it('Markierung nur rechts: ein OSM-Radweg links bleibt', () => {
    const s = candToSection(cand(1, 0, 100, {
      seiten: { rechts: 'Mischverkehr', links: 'Radweg strassenbegleitend / Geschützter Radstreifen' },
      bern: { radstreifen: { rechts: {} } } }))
    expect(s.ist).toBe('Radstreifen')
    expect(s.gegen?.ist).toBe('Radweg strassenbegleitend / Geschützter Radstreifen')
  })
  it('Markierung ohne erkannte Seite: gilt für beide Seiten', () => {
    const s = candToSection(cand(1, 0, 100, { seiten: { rechts: 'Mischverkehr', links: 'Mischverkehr' },
      bern: { radstreifen: { breite: 1.4 } } }))
    expect([s.ist, s.breite]).toEqual(['Radstreifen', 1.4])
    expect(s.gegen).toBeUndefined()
  })
  it('Velostrasse (Geoportal) gilt für beide Seiten; die Breite kommt nicht aus der Markierung', () => {
    const s = candToSection(cand(1, 0, 100, { breite: 5, seiten: { rechts: 'Radstreifen', links: 'Mischverkehr' },
      bern: { velostrasse: true, radstreifen: { breite: 1.5 } } }))
    expect([s.ist, s.breite, s.quelle.breite]).toEqual(['Velostrasse', 5, 'osm'])
    expect(s.gegen).toBeUndefined()
  })
})

describe('tauscheSeiten', () => {
  it('B wird A samt Herkunft; Fahrtrichtung und Karten-Pfeil drehen', () => {
    const s = { ...candToSection(cand(1, 0, 100, { ist: 'Radstreifen',
      seiten: { rechts: 'Radstreifen', links: 'Mischverkehr' }, breiteSeiten: { rechts: 1.5 } })), parkenRechts: 'ja' as const }
    const t = tauscheSeiten(s)
    expect([t.ist, t.quelle.ist, t.parkenRechts]).toEqual(['Mischverkehr', 'osm', 'egal'])
    expect(t.breite).toBeNaN()
    expect(t.quelle.breite).toBeUndefined()
    expect([t.gegen?.ist, t.gegen?.breite, t.gegen?.parkenRechts, t.gegen?.quelle.breite]).toEqual(['Radstreifen', 1.5, 'ja', 'osm'])
    expect(t.peilungA).toBeCloseTo(270, 0)
    expect(t.candsGegenA).toEqual([1])
    expect(tauscheSeiten(t).ist).toBe('Radstreifen')
  })
  it('gleiche Seiten: nur die Fahrtrichtung dreht', () => {
    const s = { ...defaultSection(), ist: 'Mischverkehr' as const, peilungA: 10 }
    const t = tauscheSeiten(s)
    expect(seiteA(t)).toEqual(seiteA(s))
    expect(t.gegen).toBeUndefined()
    expect(t.peilungA).toBe(190)
  })
})

describe('ausrichtung — Laufrichtung der geordneten Segmente', () => {
  const g = (x0: number, x1: number) => [pt(x0, 0), pt(x1, 0)]
  it('ein umgekehrt erfasster Way in der Kette wird erkannt', () =>
    expect(ausrichtung([g(0, 100), g(200, 100), g(200, 300)])).toEqual([true, false, true]))
  it('das erste Segment richtet sich nach dem zweiten', () =>
    expect(ausrichtung([g(100, 0), g(100, 200)])).toEqual([false, true]))
  it('ein einzelnes Segment läuft mit', () => expect(ausrichtung([g(0, 50)])).toEqual([true]))
})

describe('Zusammenfassen — Seiten', () => {
  const bern = { speed: 30, dtv: 3000, dtvGeprueft: true }
  const nachOsten = { seiten: { rechts: 'Radstreifen', links: 'Mischverkehr' }, bern }
  // Gleiche Strassenseite (Süden), aber der Way ist nach Westen gezeichnet: dort ist es «links».
  const nachWesten = (id: number, x0: number, x1: number) =>
    ({ ...cand(id, x0, x1, { seiten: { rechts: 'Mischverkehr', links: 'Radstreifen' }, bern }), geom: [pt(x1, 0), pt(x0, 0)] })

  it('gegenläufig gezeichnete Ways mit Radstreifen auf derselben Strassenseite → ein Abschnitt', () => {
    const r = candsToSections([cand(1, 0, 200, nachOsten), nachWesten(2, 200, 400)], 'bern')
    expect(r).toHaveLength(1)
    expect([r[0].ist, r[0].gegen?.ist]).toEqual(['Radstreifen', 'Mischverkehr'])
    expect(r[0].candsGegenA).toEqual([2])
    expect(r[0].peilungA).toBeCloseTo(90, 0)
  })
  it('andere Form auf Seite B trennt', () => {
    const r = candsToSections([cand(1, 0, 200, nachOsten),
      cand(2, 200, 400, { seiten: { rechts: 'Radstreifen', links: 'Radstreifen' }, bern })], 'bern')
    expect(r.map(s => s.gegen?.ist)).toEqual(['Mischverkehr', undefined])
  })
  it('Einbahn und Zweirichtungsverkehr trennen', () => {
    const r = candsToSections([cand(1, 0, 200, { bern }), cand(2, 200, 400, { bern, einbahn: 'vor' })], 'bern')
    expect(r.map(s => s.richtung)).toEqual(['beide', 'eine'])
  })
  it('Einbahnen in entgegengesetzter Richtung trennen', () => {
    const r = candsToSections([cand(1, 0, 200, { bern, einbahn: 'vor' }), cand(2, 200, 400, { bern, einbahn: 'rueck' })], 'bern')
    expect(r).toHaveLength(2)
    expect(r.map(s => Math.round(s.peilungA!))).toEqual([90, 270])
  })
  it('Breite auf Seite B: die schmalste Stelle gleicher Form', () => {
    const beidseits = (b: number) => ({ seiten: { rechts: 'Radstreifen', links: 'Radstreifen' },
      breiteSeiten: { rechts: 1.8, links: b }, bern })
    const r = candsToSections([cand(1, 0, 200, beidseits(1.6)), cand(2, 200, 400, beidseits(1.3))], 'bern')
    expect(r).toHaveLength(1)
    expect([r[0].breite, r[0].gegen?.breite]).toEqual([1.8, 1.3])
  })
})

import { luftbildHinweis, luftbildUebernehmen } from './strecke'
describe('Luftbild-Hinweis je Seite', () => {
  const lb = (rechts: number, links: number) => ({ bern: { luftbild: { rechts, links } } })

  it('candToSection ordnet die Way-Seiten Seite A und B zu, auch bei umgekehrtem Way', () => {
    expect(candToSection(cand(1, 0, 100, lb(0.9, 0))).luftbild).toEqual({ a: 0.9, b: 0 })
    expect(candToSection(cand(1, 0, 100, lb(0.9, 0)), false).luftbild).toEqual({ a: 0, b: 0.9 })
  })
  it('Hinweis nur für offene oder Mischverkehr-Seiten ab der Schwelle', () => {
    const s = candToSection(cand(1, 0, 100, { ist: 'Mischverkehr', ...lb(0.8, 0.2) }))
    expect(luftbildHinweis(s, 0.3)).toEqual({ a: true, b: false })
    expect(luftbildHinweis({ ...s, ist: 'Umweltspur' }, 0.3).a).toBe(false)
    expect(luftbildHinweis({ ...s, richtung: 'eine', luftbild: { a: 0, b: 0.9 } }, 0.3).b).toBe(false)
  })
  it('Übernehmen auf einer von zwei gleichen Seiten macht die Seiten verschieden', () => {
    const s = candToSection(cand(1, 0, 100, { ist: 'Mischverkehr', ...lb(0.8, 0) }))
    const t = luftbildUebernehmen(s, { a: true, b: false })
    expect([t.ist, t.quelle.ist, t.gegen?.ist]).toEqual(['Radstreifen', 'luftbild', 'Mischverkehr'])
    expect(t.breite).toBeNaN()
  })
  it('Übernehmen nur auf Seite B: A bleibt, B wird Radstreifen', () => {
    const s = candToSection(cand(1, 0, 100, { ist: 'Mischverkehr', ...lb(0, 0.8) }))
    const t = luftbildUebernehmen(s, { a: false, b: true })
    expect([t.ist, t.gegen?.ist, t.gegen?.quelle.ist]).toEqual(['Mischverkehr', 'Radstreifen', 'luftbild'])
  })
  it('Übernehmen auf beiden gleichen Seiten: Seiten bleiben gleich', () => {
    const s = candToSection(cand(1, 0, 100, { ist: 'Mischverkehr', ...lb(0.8, 0.7) }))
    const t = luftbildUebernehmen(s, { a: true, b: true })
    expect([t.ist, t.gegen]).toEqual(['Radstreifen', undefined])
  })
  it('Seiten tauschen tauscht auch den Luftbild-Anteil', () =>
    expect(tauscheSeiten(candToSection(cand(1, 0, 100, lb(0.9, 0.1)))).luftbild).toEqual({ a: 0.1, b: 0.9 }))
  it('Zusammenfassen gewichtet den Anteil nach Länge', () => {
    const bern = { speed: 30, dtv: 3000, dtvGeprueft: true }
    const [r] = candsToSections([
      cand(1, 0, 300, { bern: { ...bern, luftbild: { rechts: 1, links: 0 } } }),
      cand(2, 300, 400, { bern: { ...bern, luftbild: { rechts: 0, links: 0 } } }),
    ], 'bern')
    expect(r.luftbild!.a).toBeCloseTo(0.75, 5)
    expect(r.luftbild!.b).toBe(0)
  })
})
