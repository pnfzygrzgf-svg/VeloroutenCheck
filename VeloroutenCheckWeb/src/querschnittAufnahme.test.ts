import { describe, it, expect } from 'vitest'
import { artVorschlag, aufnahmeTeile, avArtAn, fangeLage, grenzenAufLinie, querLinie } from './querschnittAufnahme'
import { startAufteilung } from './aufteilung'
import { defaultSection } from './strecke'
import type { AvFlaeche } from './av'
import type { P } from './lv95'

const r = (e0: number, n0: number, e1: number, n1: number): P[] => [[e0, n0], [e1, n0], [e1, n1], [e0, n1], [e0, n0]]
// Achse nach Osten; Seite A rechts = Süden. Von Norden (Rand B) nach Süden: Trottoir 3,0 · Veloumfahrung 1,7 (Strasse) ·
// Insel 2,2 · Fahrbahn 7,8 · Trottoir 2,0 (Monbijoustrasse)
const av: AvFlaeche[] = [
  { art: 'Trottoir', ringe: [r(0, 10.7, 100, 13.7)] },
  { art: 'Strasse_Weg', ringe: [r(0, -7.8, 100, 10.7)] },   // ohne Loch: die Insel liegt darüber
  { art: 'Verkehrsinsel', ringe: [r(0, 6.8, 100, 9.0)] },
  { art: 'Trottoir', ringe: [r(0, -9.8, 100, -7.8)] },
]
describe('Querschnitt am Luftbild aufnehmen', () => {
  const achse: P[] = [[0, 0], [100, 0]]
  it('Querlinie quer zur Achse, nach rechts zur Seite A', () => {
    const q = querLinie([achse], [50, 12])!
    expect(q.c).toEqual([50, 0])
    expect(q.r).toEqual([0, -1])
  })
  it('Grenzen sind die Schnitte mit den AV-Kanten; ein Klick rastet im Fangradius ein', () => {
    const g = grenzenAufLinie([50, 0], [0, -1], av)
    expect(g).toContain(-13.7)
    expect(fangeLage(-13.55, g, 0.3)).toBe(-13.7)
    expect(fangeLage(-12, g, 0.3)).toBe(-12)
  })
  it('Art nach der AV: Insel an einer Haltestelle ist der Wartebereich', () => {
    expect(avArtAn([50, 8], av)).toBe('Verkehrsinsel')
    expect(artVorschlag('Verkehrsinsel', true)).toBe('Haltestelle')
    expect(artVorschlag('Verkehrsinsel', false)).toBe('Mittelinsel')
    expect(artVorschlag('Gartenanlage', false)).toBe('Gruen')
  })
  it('Teile, Fahrbahn und Breite ausserhalb; als heute ersetzt der Querschnitt die Ausgangslage', () => {
    const lagen = [-13.7, -10.7, -9.0, -6.8, 1.0, 3.0]
    const q = aufnahmeTeile(lagen, ['Trottoir', 'RadwegAbgesetzt', 'Haltestelle', 'Tram', 'Trottoir'])
    expect(q.teile.map(t => t.breite)).toEqual([3, 1.7, 2.2, 7.8, 2])
    expect([q.fahrbahn, q.seitenraum]).toEqual([7.8, 8.9])
    const a = startAufteilung({ ...defaultSection(), querschnittHeute: q })
    expect(a.teile.map(t => t.art)).toEqual(['Trottoir', 'RadwegAbgesetzt', 'Haltestelle', 'Tram', 'Trottoir'])
    expect(a.fahrbahn).toBe(7.8)
  })
})

import { GANZ } from './querschnittAufnahme'
describe('Ganzer Querschnitt (Nutzerwunsch 21.10.2026)', () => {
  it('ein Stück als Ganzer Querschnitt: kein Teil, nur die Gesamtbreite', () => {
    expect(aufnahmeTeile([-10, 12.5], [GANZ])).toEqual({ teile: [], fahrbahn: 0, seitenraum: 0, gesamt: 22.5 })
  })
  it('mit Teilen: ausserhalb der Fahrbahn ist der Rest bis zur Gesamtbreite', () => {
    const r = aufnahmeTeile([-10, -7, 0, 12.5], ['Trottoir', 'Fahrspur', GANZ])
    expect([r.fahrbahn, r.seitenraum, r.gesamt]).toEqual([7, 5.5, 12.5])
  })
  it('als heute: die Ausgangslage behält ihre Teile, der Rest bis zur Gesamtbreite gilt ausserhalb', () => {
    const a = startAufteilung({ ...defaultSection(), ist: 'Mischverkehr', parkenRechts: 'nein', fahrbahnbreite: 7, gesamtbreite: 15 })
    expect([a.fahrbahn, a.seitenraum]).toEqual([7, 8])
  })
})
