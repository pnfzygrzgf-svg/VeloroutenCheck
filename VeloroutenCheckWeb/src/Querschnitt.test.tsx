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
  it('Schräg- und Senkrechtparkierung: Streetmix-Autos schräg bzw. von der Seite, Feldlinien in Draufsicht', () => {
    const p = (parkart: Teil['parkart'], winkel?: 45 | 60): Teil => ({ art: 'Parkierung', breite: 5.0, parkart, ...(winkel ? { winkel } : {}) })
    const s = svg([T('Trottoir', 2.0), p('schraeg', 45), T('Fahrspur', 3.0), T('Fahrspur', 3.0), p('quer'), T('Trottoir', 2.0)])
    expect(s).toContain('car-angled-front-left')     // Seite B kommt entgegen, Nase zum Rand
    expect(s).toContain('car-sideways-right')
    expect(svg([p('schraeg', 60), T('Fahrspur', 3.0)], true)).toContain('car-angled-rear-left')
  })
  it('Pfeile: kombiniert aus Streetmix, entgegen (Seite B) um 180° gedreht', () => {
    const s = svg([{ art: 'Fahrspur', breite: 3.2, richtung: 'B', markierung: 'links' }, { art: 'Fahrspur', breite: 3.0, richtung: 'A', markierung: 'links' },
      { art: 'Fahrspur', breite: 3.0, richtung: 'A', markierung: 'geradeaus-rechts' }])
    expect(s.match(/left-outbound/g)).toHaveLength(2)
    expect(s).toContain('right-straight-outbound')
    expect(s).not.toContain('left-inbound')
    expect(s.match(/rotate\(180/g)).toHaveLength(1)
  })
  it('versetzte Parkierung: nicht gezeichnet, nicht in der Breite, Hinweis darunter', () => {
    const teile: Teil[] = [T('Trottoir', 2.0), { art: 'Parkierung', breite: 1.9, versetzt: true }, T('Gemeinsam', 5.0),
      { art: 'Parkierung', breite: 5.0, parkart: 'quer' }, T('Trottoir', 2.0)]
    expect(breiteCm(teile)).toBeCloseTo(1400, 6)
    const s = svg(teile)
    expect(s).toContain('Fahrbahn 10,00 m')
    expect(s).toContain('Längsparkierung (Autos) Seite B')
    expect(s).toContain('car-sideways-right')
  })
})
