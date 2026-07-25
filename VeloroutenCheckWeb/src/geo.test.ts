import { describe, it, expect } from 'vitest'
import { densify, majorityLineIndex, majorityValue, type LL } from './geo'

// Testgeometrie: Linien bei ~47° N, Versätze in Metern (planar umgerechnet).
const M_LAT = 1 / 111320
const M_LON = 1 / (111320 * Math.cos((47 * Math.PI) / 180))
const pt = (xM: number, yM: number): LL => ({ lat: 47 + yM * M_LAT, lon: 7.4 + xM * M_LON })
const linie = (x0: number, x1: number, yM: number, stepM = 10): LL[] => {
  const out: LL[] = []
  for (let x = x0; x <= x1; x += stepM) out.push(pt(x, yM))
  return out
}

describe('majorityLineIndex — gerichtetes Mehrheits-Votum (DTV-/Attribut-Zuordnung)', () => {
  const abschnitt = densify(linie(0, 200, 0), 8)   // 200-m-Abschnitt (verdichtet)

  it('kurze Fremdlinie (30 % Abdeckung) gewinnt NICHT — das symmetrische Maximum hätte 1,0 ergeben', () => {
    // Fremd-Linie (z. B. DTV der Nachbarstrasse): 60 m lang, 4 m daneben — liegt selbst zu
    // 100 % am Abschnitt, deckt aber nur ~30 % des Abschnitts ab → kein Treffer.
    const fremd = linie(0, 60, 4)
    expect(majorityLineIndex(abschnitt, [fremd], 20, 0.5)).toBe(-1)
  })

  it('die eigene lange Linie gewinnt gegen eine näher liegende kurze Fremdlinie', () => {
    const fremd = linie(0, 60, 2)     // kurz, aber näher (2 m)
    const eigene = linie(0, 200, 6)   // volle Länge, 6 m daneben
    expect(majorityLineIndex(abschnitt, [fremd, eigene], 20, 0.5)).toBe(1)
  })

  it('quer kreuzende Linie erhält keine Stimmen (Parallelitäts-Filter)', () => {
    const quer: LL[] = []
    for (let y = -100; y <= 100; y += 10) quer.push(pt(100, y))
    expect(majorityLineIndex(abschnitt, [quer], 20, 0.5)).toBe(-1)
  })

  it('deckungsgleiche Linie gewinnt regulär', () => {
    expect(majorityLineIndex(abschnitt, [linie(0, 200, 3)], 20, 0.5)).toBe(0)
  })

  it('leere Eingaben → -1', () => {
    expect(majorityLineIndex([], [linie(0, 200, 0)], 20, 0.5)).toBe(-1)
    expect(majorityLineIndex(abschnitt, [], 20, 0.5)).toBe(-1)
  })
})

describe('majorityValue — Mehrheit nach WERT (Routentyp)', () => {
  const abschnitt = densify(linie(0, 200, 0), 8)   // 200-m-Abschnitt (verdichtet)

  // Der reale Fall: das Veloroutennetz ist feiner segmentiert als die OSM-Wege. Ein Abschnitt
  // läuft über mehrere kurze Masterplan-Stücke DESSELBEN Typs — pro Feature gezählt erreicht
  // keines die Schwelle (hier je 25 %), nach Wert gezählt sind es 100 %.
  const vier = [linie(0, 50, 3), linie(50, 100, 3), linie(100, 150, 3), linie(150, 200, 3)]

  it('vier Teilstücke derselben Route → Routentyp wird erkannt', () => {
    const werte = ['Velohauptroute', 'Velohauptroute', 'Velohauptroute', 'Velohauptroute']
    expect(majorityValue(abschnitt, vier, werte, 20, 0.5)).toBe('Velohauptroute')
  })

  it('genau dieser Fall scheitert beim Votum pro Feature (der behobene Fehler)', () => {
    expect(majorityLineIndex(abschnitt, vier, 20, 0.5)).toBe(-1)
  })

  it('gemischte Werte: die Mehrheit gewinnt, wenn sie die Schwelle erreicht', () => {
    const werte = ['Velohauptroute', 'Velohauptroute', 'Velohauptroute', 'Veloroute']
    expect(majorityValue(abschnitt, vier, werte, 20, 0.5)).toBe('Velohauptroute')
  })

  it('ohne Mehrheit (vier verschiedene Werte je 25 %) → undefined', () => {
    expect(majorityValue(abschnitt, vier, ['A', 'B', 'C', 'D'], 20, 0.5)).toBeUndefined()
  })

  it('null zählt nicht mit — unklassifizierte Netzgeometrie stimmt nicht', () => {
    expect(majorityValue(abschnitt, vier, [null, null, 'Veloroute', 'Veloroute'], 20, 0.5)).toBe('Veloroute')
    expect(majorityValue(abschnitt, vier, [null, null, null, 'Veloroute'], 20, 0.5)).toBeUndefined()
  })

  it('quer kreuzende Linie bekommt auch hier keine Stimme', () => {
    const quer: LL[] = []
    for (let y = -100; y <= 100; y += 10) quer.push(pt(100, y))
    expect(majorityValue(abschnitt, [quer], ['Veloroute'], 20, 0.5)).toBeUndefined()
  })

  it('leere Eingaben → undefined', () => {
    expect(majorityValue([], [linie(0, 200, 0)], ['x'], 20, 0.5)).toBeUndefined()
    expect(majorityValue(abschnitt, [], [], 20, 0.5)).toBeUndefined()
  })
})
