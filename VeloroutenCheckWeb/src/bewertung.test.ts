import { describe, it, expect } from 'vitest'
import { bewerteAbschnitt } from './bewertung'
import { defaultSection, seiteA, type Section } from './strecke'

// Abschnitt mit vollständigen gemeinsamen Werten; Seite A: Radstreifen 1,8 m.
const basis = (p: Partial<Section> = {}): Section => ({
  ...defaultSection(), dtv: 8000, speed: 50, routentyp: 'Velohauptroute', ist: 'Radstreifen', breite: 1.8, ...p,
})
const mitB = (b: Partial<Section>, p: Partial<Section> = {}): Section => {
  const s = basis(p)
  return { ...s, gegen: { ...seiteA(s), ...b, quelle: {} } }
}

describe('bewerteAbschnitt — Note je Seite', () => {
  it('Seite B wie A: nur eine Seite wird gerechnet, sie trägt die Abschnittsnote', () => {
    const e = bewerteAbschnitt(basis(), 'bern')
    expect(e.seiten.map(x => x.seite)).toEqual(['A'])
    expect(e.note).toBe(e.seiten[0].bewertung!.note)
    expect(e.massgebend).toBeUndefined()
  })
  it('abweichende Seite B: zwei Noten, der Abschnitt hat die schlechtere', () => {
    const e = bewerteAbschnitt(mitB({ ist: 'Mischverkehr', breite: NaN }), 'bern')
    expect(e.seiten.map(x => x.seite)).toEqual(['A', 'B'])
    const [a, b] = e.seiten.map(x => x.bewertung!.note)
    expect(b).toBeLessThan(a)
    expect(e.note).toBe(b)
    expect(e.massgebend).toBe('B')
  })
  it('nur eine Seite erfasst: Seite B zählt nicht, auch wenn sie vorbelegt ist', () => {
    const e = bewerteAbschnitt(mitB({ ist: 'Mischverkehr', breite: NaN }, { richtung: 'eine' }), 'bern')
    expect(e.seiten.map(x => x.seite)).toEqual(['A'])
    expect(e.note).toBe(bewerteAbschnitt(basis(), 'bern').note)
  })
  it('Seite B unvollständig → Abschnittsnote offen, Seite A ist trotzdem gerechnet', () => {
    const e = bewerteAbschnitt(mitB({ ist: 'Radstreifen', breite: NaN }), 'bern')
    expect(e.note).toBeNull()
    expect(e.seiten[0].bewertung).not.toBeNull()
    expect(e.seiten[1].bewertung).toBeNull()
  })
  it('gemeinsame Werte wirken auf beide Seiten (ohne Tempo keine Note)', () => {
    const e = bewerteAbschnitt(mitB({ ist: 'Mischverkehr', breite: NaN }, { speed: NaN }), 'bern')
    expect(e.seiten.every(x => x.bewertung == null)).toBe(true)
  })
  it('Seite ohne Haltestelle: das ÖV-Angebot des Abschnitts gilt dort nicht', () => {
    const hs = { oevAngebot: 'bus_unter5' as const, haltestellentyp: 'Fahrbahnhaltestelle Bus' as const }
    const e = bewerteAbschnitt(mitB({ ohneHaltestelle: true, haltestellentyp: 'keine' }, hs), 'bern')
    const [a, b] = e.seiten.map(x => x.bewertung!)
    expect(a.haltestelleAbzug).toBeGreaterThan(0)
    expect(b.haltestelleAbzug).toBe(0)
    expect(b.sollHaltestelle).toBeUndefined()
    expect(e.massgebend).toBe('A')
  })
})

import { fehlendeEingaben, aufzaehlen, seiteKomplett } from './bewertung'
describe('Hinweis «Eingabe nötig» — nur was wirklich fehlt', () => {
  it('Führungsform gesetzt, nur DTV fehlt → nur DTV', () => {
    const s = { ...defaultSection(), ist: 'Mischverkehr' as const, speed: 50 }
    expect(fehlendeEingaben(s, seiteA(s), 'zurich')).toEqual(['DTV'])
  })
  it('Radstreifen ohne Breite → nur Breite', () => {
    const s = basis({ breite: NaN })
    expect(fehlendeEingaben(s, seiteA(s), 'bern')).toEqual(['Breite'])
  })
  it('leere Maske → Führungsform, DTV und Tempo', () => {
    const s = defaultSection()
    expect(fehlendeEingaben(s, seiteA(s), 'bern')).toEqual(['Führungsform', 'DTV', 'Tempo'])
  })
  it('Basel: kein DTV, aber der Strassentyp', () => {
    const s = { ...defaultSection(), ist: 'Mischverkehr' as const, speed: 30 }
    expect(fehlendeEingaben(s, seiteA(s), 'basel')).toEqual(['Strassentyp'])
  })
  it('stimmt mit seiteKomplett überein (leer ⇔ vollständig)', () => {
    for (const s of [basis(), basis({ breite: NaN }), basis({ speed: NaN }), defaultSection()])
      for (const city of ['bern', 'zurich', 'basel', 'luzern'] as const)
        expect(fehlendeEingaben(s, seiteA(s), city).length === 0).toBe(seiteKomplett(s, seiteA(s), city))
  })
  it('Aufzählung', () => {
    expect(aufzaehlen(['DTV'])).toBe('DTV')
    expect(aufzaehlen(['DTV', 'Tempo'])).toBe('DTV und Tempo')
    expect(aufzaehlen(['Führungsform', 'DTV', 'Tempo'])).toBe('Führungsform, DTV und Tempo')
  })
})
