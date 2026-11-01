import { describe, it, expect } from 'vitest'
import { parkAnteile, verdichten, bernSpezialAusgeschlossen, PARK_SCHWELLE } from './parkierung'
import type { P } from './lv95'

// Achse nach Osten, 100 m: rechts der Way-Richtung = Süden (n < 0).
const achse: P[] = [[0, 0], [100, 0]]
const reihe = (e0: number, e1: number, n: number): P[] => verdichten([[e0, n], [e1, n]])

describe('parkAnteile — Anteil der Länge mit Parkfeldern je Seite', () => {
  it('Parkfelder rechts über die ganze Länge → rechts 1, links 0', () => {
    const r = parkAnteile(achse, reihe(3, 97, -5))
    expect(r.rechts).toBeGreaterThan(0.9)
    expect(r.links).toBe(0)
  })
  it('links auf 40 m von 100 m → links rund 0,4', () => {
    const r = parkAnteile(achse, reihe(30, 69, 5))
    expect(r.links).toBeCloseTo(0.4, 1)
    expect(r.rechts).toBe(0)
  })
  it('weiter als 9 m neben der Achse zählt nicht', () =>
    expect(parkAnteile(achse, reihe(10, 90, -12))).toEqual({ rechts: 0, links: 0 }))
  it('Felder jenseits des Segment-Endes (Querstrasse) zählen nicht', () =>
    expect(parkAnteile(achse, reihe(103, 110, -4))).toEqual({ rechts: 0, links: 0 }))
  it('Schwelle wie im lokalen Rechner', () => expect(PARK_SCHWELLE).toBe(0.3))
})

describe('Bern: Spezialfelder', () => {
  it('Polizei, Lastwagen, Sanität zählen nicht; Behinderten- und Ladeplätze schon', () => {
    expect(bernSpezialAusgeschlossen({ Art_beschrieb: 'Polizei' })).toBe(true)
    expect(bernSpezialAusgeschlossen({ Subgruppe_beschrieb: 'Lastwagenparkplatz' })).toBe(true)
    expect(bernSpezialAusgeschlossen({ Art_beschrieb: 'Sanität' })).toBe(true)
    expect(bernSpezialAusgeschlossen({ Art_beschrieb: 'Behindertenparkplatz' })).toBe(false)
    expect(bernSpezialAusgeschlossen({ Art_beschrieb: 'E-Mobil Ladestation' })).toBe(false)
  })
})
