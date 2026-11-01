import { describe, expect, it } from 'vitest'
import { zweiradJeSeite } from './breitenmessung'
import { startAufteilung } from './aufteilung'
import { defaultSection, type Section } from './strecke'
import type { AvFlaeche } from './av'
import type { P } from './lv95'

// Velo- und Motorradfelder in der Planung (Bern, Nutzerwunsch Bernastrasse 23.10.2026)
describe('Zweiradfelder je Seite (zweiradJeSeite)', () => {
  const r = (e0: number, n0: number, e1: number, n1: number): P[] => [[e0, n0], [e1, n0], [e1, n1], [e0, n1], [e0, n0]]
  // Achse nach Osten, Fahrbahn ±4 m, Trottoir 4–7 m beidseits; Velofelder 2 m tief auf dem nördlichen Trottoir (links), 30–52 m
  const av: AvFlaeche[] = [{ art: 'Strasse_Weg', ringe: [r(0, -4, 100, 4)] }, { art: 'Trottoir', ringe: [r(0, 4, 100, 7)] }, { art: 'Trottoir', ringe: [r(0, -7, 100, -4)] }]
  const achse: P[] = [[0, 0], [100, 0]]
  const velo = { verbot: false, ringe: [r(30, 4.2, 52, 6.2)], zweirad: 'velo' as const }
  it('Seite, Tiefe, Anteil, auf dem Trottoir', () => {
    expect(zweiradJeSeite([achse], av, [velo])).toEqual({ links: { tiefe: 2, art: 'velo', trottoir: true, anteil: 0.3 } })   // Raster 10 m: Felder 30–52 m in 3 von 10
    expect(zweiradJeSeite([achse], av, [])).toEqual({})
    expect(zweiradJeSeite([achse], av, [{ ...velo, zweirad: undefined }])).toEqual({})   // Autoparkfelder zählen hier nicht
  })
  it('Velo und Motorrad auf derselben Seite: «beide»; kurze Felder unter der Schwelle zählen nicht', () => {
    const moto = { verbot: false, ringe: [r(60, 4.2, 72, 6.2)], zweirad: 'motorrad' as const }
    expect(zweiradJeSeite([achse], av, [velo, moto]).links?.art).toBe('beide')
    // 4 m Velofelder auf 200 m Achse: 1 von 20 Rastern = 5 % < 10 %
    const av200: AvFlaeche[] = av.map(f => ({ ...f, ringe: f.ringe.map(rg => rg.map(([e, n]) => [e * 2, n] as P)) }))
    expect(zweiradJeSeite([[[0, 0], [200, 0]]], av200, [{ ...velo, ringe: [r(30, 4.2, 34, 6.2)] }])).toEqual({})
  })
})

describe('Zweiradabstellplatz in der Ausgangslage', () => {
  const s: Section = { ...defaultSection(), ist: 'Mischverkehr', parkenRechts: 'nein', fahrbahnbreite: 8, trottoir: { a: 3, b: 3 },
    zweirad: { b: { tiefe: 2, art: 'velo', trottoir: true, anteil: 0.2 } } }
  it('ohne Autoparkierung: Element am Rand der Seite, auf Trottoirniveau, das Trottoir um die Tiefe schmaler', () => {
    const a = startAufteilung(s, 'bern')
    expect(a.teile.map(t => `${t.art} ${t.breite}${t.trottoirniveau ? '*' : ''}`)).toEqual(['Trottoir 1', 'Veloabstellplatz 2*', 'Fahrspur 4', 'Fahrspur 4', 'Trottoir 3'])
    expect(a.fahrbahn).toBe(8)
  })
  it('mit Autoparkierung auf derselben Seite: kein eigenes Element (die Felder liegen in der Parkierung)', () => {
    const mit: Section = { ...s, gegen: { ...defaultSection(), ist: 'Mischverkehr', parkenRechts: 'ja', quelle: {} } as Section['gegen'] }
    const a = startAufteilung(mit, 'bern')
    expect(a.teile.some(t => t.art === 'Veloabstellplatz')).toBe(false)
    expect(a.teile.some(t => t.art === 'Parkierung')).toBe(true)
  })
})
