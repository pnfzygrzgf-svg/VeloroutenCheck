// Tests: Eingaben im Browser merken (fallMerken.ts); Rundlauf mit der Form der Fall-Datei
import { describe, expect, it } from 'vitest'
import { FALL_SCHLUESSEL, fallGemerkt, fallMerken, fallVergessen, hatEingaben } from './fallMerken'
import { fallLesen, fallText } from './fallDatei'
import { defaultSection } from './strecke'

const speicher = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) } } }

describe('Fall im Browser', () => {
  it('merken, lesen, vergessen', () => {
    const s = speicher()
    expect(fallGemerkt(s)).toBeNull()
    expect(fallMerken('abc', s)).toBe(true)
    expect(s.m.get(FALL_SCHLUESSEL)).toBe('abc')
    expect(fallGemerkt(s)).toBe('abc')
    fallVergessen(s)
    expect(fallGemerkt(s)).toBeNull()
  })
  it('voller Speicher: meldet false und lässt keinen veralteten Stand zurück', () => {
    const s = speicher()
    fallMerken('alt', s)
    const voll = { ...s, setItem: () => { throw new DOMException('voll', 'QuotaExceededError') } }
    expect(fallMerken('neu', voll)).toBe(false)
    expect(fallGemerkt(s)).toBeNull()
  })
  it('gesperrter Speicher wirft nicht', () => {
    const gesperrt = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } }
    expect(fallGemerkt(gesperrt)).toBeNull()
    expect(fallMerken('a', gesperrt)).toBe(false)
    expect(() => fallVergessen(gesperrt)).not.toThrow()
    expect(fallMerken('a', null)).toBe(false)
  })
  it('Rundlauf: der gemerkte Text lässt sich wie eine Fall-Datei lesen, leere Zahlen bleiben leer', () => {
    const s = speicher(), a = { ...defaultSection(), ist: 'Radstreifen' as const, dtv: 3416 }
    fallMerken(fallText({ standard: 'bern', gebiet: 'bern', strasse: 'Jungfraustrasse', sections: [a], cands: [], quellen: [] }), s)
    const f = fallLesen(fallGemerkt(s)!)
    expect(f.strasse).toBe('Jungfraustrasse')
    expect(f.sections[0]).toMatchObject({ ist: 'Radstreifen', dtv: 3416 })
    expect(Number.isNaN(f.sections[0].speed)).toBe(true)
  })
})

describe('hatEingaben', () => {
  it('ein unberührter Abschnitt zählt nicht, jede Angabe zählt', () => {
    const leer = defaultSection()
    expect(hatEingaben([leer])).toBe(false)
    expect(hatEingaben([])).toBe(false)
    expect(hatEingaben([{ ...leer, ist: 'Mischverkehr' }])).toBe(true)
    expect(hatEingaben([{ ...leer, dtv: 1000 }])).toBe(true)
    expect(hatEingaben([{ ...leer, candIds: [1] }])).toBe(true)
    expect(hatEingaben([{ ...leer, label: 'Jungfraustrasse' }])).toBe(true)
  })
})
