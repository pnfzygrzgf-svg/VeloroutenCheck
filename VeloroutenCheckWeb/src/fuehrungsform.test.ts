import { describe, it, expect } from 'vitest'
import {
  fuehrungsart, fuehrungsformNote, haltestellenLoesung, haltestellenTypen,
  BREITEN_ZUERICH, BREITEN_BASEL, BREITEN_LUZERN,
} from './fuehrungsform'

// ════════════════════════════════════════════════════════════════════════════
// Charakterisierungs-/Regressionstests. Bern soll unverändert bleiben; die neuen
// Städte (Zürich/Basel/Luzern) prüfen die stadtspezifische Soll-Wahl, die neue
// Übergangsklasse «Mischverkehr oder Radstreifen», Breiten und Haltestellen.
// ════════════════════════════════════════════════════════════════════════════

describe('fuehrungsart — Bern (Default, unverändert)', () => {
  it('< 2000 / ≤30 → Mischverkehr', () => expect(fuehrungsart(1000, 30)).toBe('Mischverkehr'))
  it('< 2000 / 50 → Radstreifen', () => expect(fuehrungsart(1000, 50)).toBe('Radstreifen'))
  it('2000–5000 / 50 → Radweg', () => expect(fuehrungsart(3000, 50)).toBe('Radweg'))
  it('5000–10000 / ≤30 → Radstreifen oder Radweg', () =>
    expect(fuehrungsart(7000, 30)).toBe('Radstreifen oder Radweg'))
  it('> 10000 → Radweg', () => expect(fuehrungsart(12000, 30)).toBe('Radweg'))
  it('> 50 km/h → Radweg', () => expect(fuehrungsart(500, 60)).toBe('Radweg'))
})

describe('fuehrungsart — Zürich (nach Routentyp)', () => {
  it('Velovorzugsroute <2500 / ≤30 → Mischverkehr', () =>
    expect(fuehrungsart(2000, 30, 'zurich', 'Velohauptroute')).toBe('Mischverkehr'))
  it('Velovorzugsroute >7500 / 31–40 → Radweg', () =>
    expect(fuehrungsart(8000, 40, 'zurich', 'Velohauptroute')).toBe('Radweg'))
  it('Hauptroute 5000–7500 / ≤30 → Mischverkehr', () =>
    expect(fuehrungsart(6000, 30, 'zurich', 'Veloroute')).toBe('Mischverkehr'))
  it('Hauptroute >7500 / 50 → Radstreifen oder Radweg', () =>
    expect(fuehrungsart(9000, 50, 'zurich', 'Veloroute')).toBe('Radstreifen oder Radweg'))
})

describe('fuehrungsart — Luzern (feinere DTV-Stufen, neue Übergangsklasse)', () => {
  it('< 2000 / ≤50 → Mischverkehr', () => expect(fuehrungsart(1000, 50, 'luzern')).toBe('Mischverkehr'))
  it('5000–10000 / ≤30 → Mischverkehr oder Radstreifen', () =>
    expect(fuehrungsart(7000, 30, 'luzern')).toBe('Mischverkehr oder Radstreifen'))
  it('10000–15000 / 41–50 → Radstreifen oder Radweg', () =>
    expect(fuehrungsart(12000, 50, 'luzern')).toBe('Radstreifen oder Radweg'))
  it('> 15000 / ≤30 → Radweg (gesetzt)', () => expect(fuehrungsart(16000, 30, 'luzern')).toBe('Radweg'))
})

describe('fuehrungsart — Basel (nach Strassentyp)', () => {
  it('siedlungsorientiert → Mischverkehr', () =>
    expect(fuehrungsart(9999, 50, 'basel', 'Velohauptroute', 'siedlungsorientiert')).toBe('Mischverkehr'))
  it('verkehrsorientiert, Vorzugsroute → Radstreifen oder Radweg', () =>
    expect(fuehrungsart(9999, 50, 'basel', 'Velohauptroute', 'verkehrsorientiert')).toBe('Radstreifen oder Radweg'))
  it('verkehrsorientiert, Pendler-/Basis → Radstreifen', () =>
    expect(fuehrungsart(9999, 50, 'basel', 'Veloroute', 'verkehrsorientiert')).toBe('Radstreifen'))
})

describe('fuehrungsformNote — Bern Beispiel aus README (unverändert)', () => {
  it('DTV 3000 / 50 / Radstreifen / 1,8 m / Velohauptroute → 4.0', () => {
    const r = fuehrungsformNote(3000, 50, 'Radstreifen', 1.8, 'Velohauptroute')
    expect(r.soll).toBe('Radweg')
    expect(r.note).toBe(4.0)
  })
  it('Ist = Soll (Radweg) → Note 6', () => {
    const r = fuehrungsformNote(3000, 50, 'Radweg strassenbegleitend / Geschützter Radstreifen', 2.5, 'Velohauptroute')
    expect(r.note).toBe(6)
  })
})

describe('Neue Übergangsklasse «Mischverkehr oder Radstreifen» (Luzern)', () => {
  // Soll = Mischverkehr oder Radstreifen (Rang 0,5): Mischverkehr (Rang 0) unterschreitet → Abzug,
  // Radstreifen (Rang 1) erfüllt → Note 6 bei genügender Breite.
  it('Ist Radstreifen bei genügend Breite → Note 6', () => {
    const r = fuehrungsformNote(7000, 30, 'Radstreifen', 2.5, 'Velohauptroute',
      'egal', undefined, 'keine', 'keine', undefined, false,
      BREITEN_LUZERN['Radstreifen'], 'luzern')
    expect(r.soll).toBe('Mischverkehr oder Radstreifen')
    expect(r.note).toBe(6)
  })
  it('Ist Mischverkehr → Abzug (< 6)', () => {
    const r = fuehrungsformNote(7000, 30, 'Mischverkehr', undefined, 'Velohauptroute',
      'egal', undefined, 'keine', 'keine', undefined, false, undefined, 'luzern')
    expect(r.soll).toBe('Mischverkehr oder Radstreifen')
    expect(r.note).toBeLessThan(6)
  })
})

describe('Stadtspezifische Breiten', () => {
  it('Zürich Radstreifen minimal 2,20 m', () => {
    expect(BREITEN_ZUERICH['Radstreifen']).toEqual({ optimal: 2.5, minimal: 2.2 })
  })
  it('Basel Radweg strassenbegl. minimal 2,20 m', () => {
    expect(BREITEN_BASEL['Radweg strassenbegleitend / Geschützter Radstreifen']).toEqual({ optimal: 2.5, minimal: 2.2 })
  })
  it('Luzern Umweltspur minimal 3,75 m (wie Bern)', () => {
    expect(BREITEN_LUZERN['Umweltspur']).toEqual({ optimal: 4.5, minimal: 3.75 })
  })
})

describe('Haltestellen — stadtabhängig', () => {
  it('Bern: 7 Typen', () => expect(haltestellenTypen('bern')).toHaveLength(7))
  it('Zürich: 3 Typen', () => expect(haltestellenTypen('zurich')).toHaveLength(3))
  it('Basel: 4 Typen', () => expect(haltestellenTypen('basel')).toHaveLength(4))
  it('Luzern: 5 Typen', () => expect(haltestellenTypen('luzern')).toHaveLength(5))

  it('Bern Tram + Veloroute → Separate Velofläche', () =>
    expect(haltestellenLoesung('Veloroute', 'tram', 'bern')).toBe('Separate Velofläche'))
  it('Luzern hat kein Tram-Bonus: Bus≥15 / Veloroute → Mischverkehr', () =>
    expect(haltestellenLoesung('Veloroute', 'bus_ab15', 'luzern')).toBe('Mischverkehr'))
  it('Zürich: keine Soll-Lösung (kein automatischer Abzug)', () =>
    expect(haltestellenLoesung('Veloroute', 'tram', 'zurich')).toBeNull())
  it('Basel: keine Soll-Lösung', () =>
    expect(haltestellenLoesung('Veloroute', 'tram', 'basel')).toBeNull())

  it('Zürich: inkompatibler Mischverkehr-Typ gibt KEINEN Abzug', () => {
    const r = fuehrungsformNote(3000, 50, 'Radstreifen', 2.5, 'Velohauptroute',
      'egal', undefined, 'tram', 'Fahrbahnhaltestelle mit Veloführung auf Fahrbahn', undefined, false,
      BREITEN_ZUERICH['Radstreifen'], 'zurich')
    expect(r.haltestelleAbzug).toBe(0)
  })
})
