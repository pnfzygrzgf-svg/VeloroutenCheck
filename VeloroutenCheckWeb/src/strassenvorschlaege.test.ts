import { describe, it, expect } from 'vitest'
import { adresseLesen, strassenTreffer } from './strassenvorschlaege'

const r = (label: string) => ({ attrs: { origin: 'address', label } })

describe('Strassensuche — Vorschläge aus Adressen', () => {
  it('Hausnummern fallen weg, auch mit Punkt oder Buchstabe', () => {
    expect(adresseLesen('Kanzleistrasse 12 <b>8004 Zürich</b>')).toEqual({ name: 'Kanzleistrasse', ort: 'Zürich' })
    expect(adresseLesen('Hirschmattstrasse 1.1 <b>6003 Luzern</b>')?.name).toBe('Hirschmattstrasse')
    expect(adresseLesen('Thunstrasse 2a <b>3005 Bern</b>')?.name).toBe('Thunstrasse')
    expect(adresseLesen('Mühlemattstrasse # <b>4112 Bättwil</b>')?.name).toBe('Mühlemattstrasse')
  })
  it('nur die gewählte Stadt, je Name einmal, Name enthält den Suchtext', () => {
    const t = strassenTreffer({ results: [
      r('Thunstrasse 1 <b>3112 Allmendingen b. Bern</b>'), r('Thunstrasse 1 <b>3005 Bern</b>'), r('Thunstrasse 2 <b>3005 Bern</b>'),
      r('Alte Bernstrasse 1 <b>4922 Bützberg</b>'), r('Bernastrasse 4 <b>3005 Bern</b>'), r('Thunplatz 3 <b>3005 Bern</b>'),
    ] }, 'thun', 'Bern')
    expect(t).toEqual(['Thunstrasse', 'Thunplatz'])
  })
})
