import { describe, it, expect } from 'vitest'
import { anteilNahe, netzAusAnteil } from './fussnetz'
import type { P } from './lv95'

describe('Fussverkehrsnetz aus dem Richtplan Fussverkehr', () => {
  const achse: P[] = [[0, 0], [100, 0]]
  const linie = (y: number, x0 = 0, x1 = 100): P[] => Array.from({ length: Math.round((x1 - x0) / 2) + 1 }, (_, i) => [x0 + i * 2, y] as P)
  it('Basisnetz-Linie auf der Achse: ganzer Abschnitt', () => expect(anteilNahe([achse], linie(0.3))).toBeCloseTo(1, 9))
  it('Linie 15 m daneben (Parallelweg) zählt nicht', () => expect(anteilNahe([achse], linie(15))).toBe(0))
  it('nur ein Teil: Anteil nach Länge; ab der Hälfte Basisnetz, sonst Feinverteilernetz', () => {
    expect(anteilNahe([achse], linie(0, 0, 38))).toBeCloseTo(0.4, 9)
    expect(netzAusAnteil(0.4)).toBe('fein')
    expect(netzAusAnteil(0.6)).toBe('basis')
  })
})
