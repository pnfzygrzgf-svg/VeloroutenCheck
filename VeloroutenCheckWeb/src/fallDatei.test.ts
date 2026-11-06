// Import der Fall-Datei: Quellenwahl und Masse (Prüfung 06.11.2026)
import { describe, expect, it } from 'vitest'
import { fallLesen, fallText } from './fallDatei'
import { defaultSection } from './strecke'
import { notenHerleitung } from './Bericht'
import type { NotenErgebnis } from './fuehrungsform'

const cand = { id: 1, wayId: 5, name: 'Teststrasse', selected: true, len: 111, geom: [{ lat: 46.95, lon: 7.44 }, { lat: 46.951, lon: 7.44 }], tags: {} }
const datei = (abw: Record<string, unknown> = {}, candAbw: Record<string, unknown> = {}) => {
  const t = JSON.parse(fallText({ standard: 'bern', gebiet: 'bern', strasse: 'x', sections: [{ ...defaultSection(), candIds: [1] }] as never, cands: [cand] as never, quellen: [] }))
  Object.assign(t.sections[0], abw); Object.assign(t.cands[0], candAbw)
  return JSON.stringify(t)
}

describe('Fall-Datei: Quellenwahl', () => {
  it('gültige Wahl und fehlende Wahl bleiben lesbar, Rundlauf erhält die Wahl', () => {
    expect(() => fallLesen(datei())).not.toThrow()
    const f = fallLesen(datei({ feldAuswahl: { 'a.ist': 'luftbild', tram: 'x' } }))
    expect(f.sections[0].feldAuswahl).toEqual({ 'a.ist': 'luftbild', tram: 'x' })
    expect(fallLesen(fallText(f)).sections[0].feldAuswahl).toEqual({ 'a.ist': 'luftbild', tram: 'x' })
  })
  it.each([['Zeichenkette', 'abc'], ['Liste', ['x']], ['unbekanntes Feld', { 'a.unbekannt': 'q' }], ['Zahl als Quelle', { 'a.ist': 7 }]])('%s wird abgelehnt', (_n, wahl) => {
    expect(() => fallLesen(datei({ feldAuswahl: wahl }))).toThrow(/Quellenwahl/)
  })
})

describe('Fall-Datei: Masse', () => {
  it('Länge: nicht negativ und nicht leer', () => {
    expect(() => fallLesen(datei({}, { len: -1 }))).toThrow()
    expect(() => fallLesen(datei({}, { len: { $zahl: 'leer' } }))).toThrow()
    expect(() => fallLesen(datei({}, { len: 0 }))).not.toThrow()
  })
  it('Planung: leere Breiten bleiben erlaubt, negative nicht', () => {
    const plan = (fahrbahn: unknown, breite: unknown) => ({ aufteilung: { fahrbahn, teile: [{ art: 'Trottoir', breite }] } })
    expect(() => fallLesen(datei(plan({ $zahl: 'leer' }, { $zahl: 'leer' })))).not.toThrow()
    expect(() => fallLesen(datei(plan(8, -2)))).toThrow()
    expect(() => fallLesen(datei(plan(-3, 2)))).toThrow()
  })
})

describe('Bericht: Herleitung der Note', () => {
  const b = (x: Partial<NotenErgebnis>) => ({ soll: 'Radstreifen', ist: 'Mischverkehr', erfuellt: false, basisnote: 3, breitenabzug: 0, parkenAbzug: 1, haltestelleAbzug: 0, hsBreitenabzug: 0, ...x }) as NotenErgebnis
  it('Vorgabe, Ausgangswert und die angesetzten Abzüge', () => {
    expect(notenHerleitung(b({}))).toBe('Vorgabe Velostreifen, vorhanden Mischverkehr: 3,0; Parkierung rechts −1,0')
    expect(notenHerleitung(b({ ist: 'Radstreifen', erfuellt: true, basisnote: 6, parkenAbzug: 0 }))).toBe('Vorgabe Velostreifen erfüllt: 6,0')
    expect(notenHerleitung(b({ basisnote: 3.1, note: 2 }))).toBe('Vorgabe Velostreifen, vorhanden Mischverkehr: 3,1; Parkierung rechts −1,0; auf halbe Noten gerundet: 2,0')
    expect(notenHerleitung(b({ noteFix: true }))).toBe('Note nach Sonderregel')
    expect(notenHerleitung(b({ haltestellenbereich: true }))).toBe('')
  })
})
