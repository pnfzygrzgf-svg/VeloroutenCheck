import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SkizzeSvg, breiteCm } from './Querschnitt'
import type { Teil } from './aufteilung'

const T = (art: Teil['art'], breite: number): Teil => ({ art, breite })
const quer = [T('Trottoir', 2.5), T('Velostreifen', 1.8), T('Fahrspur', 3.2), T('Fahrspur', 3.2), T('Velostreifen', 1.8), T('Trottoir', 2.0)]
const svg = (teile: Teil[], einbahn = false) =>
  renderToStaticMarkup(<SkizzeSvg titel="Test" teile={teile} einbahn={einbahn} massstabCm={breiteCm(teile)} px={700} basis="/" />)

describe('Querschnitt-Skizze', () => {
  it('Gesamtbreite in cm ohne leere Teile', () => expect(breiteCm([...quer, T('Fahrspur', NaN)])).toBeCloseTo(1450, 6))
  it('Masse je Teil und Fahrbahn Bordstein–Bordstein (ohne Trottoirs)', () => {
    const s = svg(quer)
    for (const m of ['2,50', '1,80', '3,20', '2,00']) expect(s).toContain(`>${m}<`)
    expect(s).toContain('Fahrbahn 10,00 m')
  })
  it('Figuren: Seite B kommt entgegen (inbound), Seite A fährt weg (outbound)', () => {
    const s = svg(quer)
    expect(s.match(/car-inbound/g)).toHaveLength(1)
    expect(s.match(/car-outbound/g)).toHaveLength(1)
    expect(s).toContain('biker-01-inbound')
    expect(s).toContain('/streetmix/people-07')
    expect(s).toContain('/streetmix/people-02')
  })
  it('Einbahn: alles fährt weg', () => expect(svg(quer, true)).not.toContain('inbound'))
  it('zu schmale Teile ohne Figur', () => expect(svg([T('Fahrspur', 1.2)])).not.toContain('<image'))
})
