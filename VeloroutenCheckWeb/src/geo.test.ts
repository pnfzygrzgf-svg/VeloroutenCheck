import { describe, it, expect } from 'vitest'
import { bboxOfLL, bboxOverlap, densify, majorityLineIndex, majorityValue, overlapScore, type LL } from './geo'
import { mergeObs, type ObsStats } from './obs'

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

// ════════════════════════════════════════════════════════════════════════════
// Runde AS6: Lücken aus dem Review — overlapScore-Richtung, densify-Grenzfälle,
// leere Bboxen, mergeObs ohne Überholungen.
// ════════════════════════════════════════════════════════════════════════════

describe('overlapScore — beidseitig mit Parallelitäts-Filter', () => {
  const lang = densify(linie(0, 200, 0), 8)

  it('quer kreuzendes Kurzstück zählt NICHT (früher Score 1,0 → Tramweichen-Fehlalarm)', () => {
    const quer: LL[] = []
    for (let y = -20; y <= 20; y += 5) quer.push(pt(100, y))
    expect(overlapScore(densify(quer, 8), lang, 15)).toBe(0)
  })
  it('kollineares Kurzstück auf der langen Linie zählt voll (Score 1,0)', () => {
    const kurz = densify(linie(80, 120, 1), 8)   // 40 m, 1 m daneben, parallel
    expect(overlapScore(kurz, lang, 15)).toBe(1)
  })
  it('parallele, aber zu weit entfernte Linie zählt nicht', () => {
    const fern = densify(linie(0, 200, 40), 8)
    expect(overlapScore(fern, lang, 15)).toBe(0)
  })
  it('unter 2 Punkten → 0 (Guard)', () => {
    expect(overlapScore([pt(0, 0)], lang, 15)).toBe(0)
    expect(overlapScore(lang, [pt(0, 0)], 15)).toBe(0)
  })
})

describe('densify — Grenzfälle', () => {
  it('0/1 Punkt bleibt unverändert', () => {
    expect(densify([], 10)).toEqual([])
    const einzel = [pt(0, 0)]
    expect(densify(einzel, 10)).toEqual(einzel)
  })
  it('stepM ≤ 0 → Eingabe unverändert (Guard gegen Endlosschleife)', () => {
    const zwei = [pt(0, 0), pt(100, 0)]
    expect(densify(zwei, 0)).toEqual(zwei)
    expect(densify(zwei, -5)).toEqual(zwei)
  })
  it('verdichtet lange Kanten auf ≤ stepM (Normalfall bleibt intakt)', () => {
    const d = densify([pt(0, 0), pt(100, 0)], 10)
    expect(d.length).toBeGreaterThan(9)
  })
})

describe('bboxOfLL / bboxOverlap — leere Linie', () => {
  it('leere Linie ergibt eine Bbox, die mit nichts überlappt', () => {
    const leer = bboxOfLL([])
    const voll = bboxOfLL([pt(0, 0), pt(100, 0)])
    expect(bboxOverlap(leer, voll, 0.01)).toBe(false)
    expect(bboxOverlap(voll, leer, 0.01)).toBe(false)
  })
})

describe('mergeObs — Befahrungen ohne Überholmessung', () => {
  const nurUsage: ObsStats = { median: NaN, mean: NaN, count: 0, below150: 0, usage: 7 }
  const mitMessung: ObsStats = { median: 1.6, mean: 1.7, count: 4, below150: 1, usage: 10 }

  it('count 0, usage > 0 bleibt sichtbar (kein undefined)', () => {
    const m = mergeObs([nurUsage, undefined])
    expect(m).toBeDefined()
    expect(m!.count).toBe(0)
    expect(m!.usage).toBe(7)
    expect(Number.isNaN(m!.median)).toBe(true)   // keine Messung → kein Median
  })
  it('Mischung: usage summiert, Median nur aus Teilen mit Messungen', () => {
    const m = mergeObs([nurUsage, mitMessung])!
    expect(m.usage).toBe(17)
    expect(m.count).toBe(4)
    expect(m.median).toBeCloseTo(1.6)
  })
  it('nur leere/undefinierte Teile → undefined', () => {
    expect(mergeObs([undefined, { median: NaN, mean: NaN, count: 0, below150: 0, usage: 0 }])).toBeUndefined()
  })
})
