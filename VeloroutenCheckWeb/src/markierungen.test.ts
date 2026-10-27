import { describe, expect, it } from 'vitest'
import { markierungenFinden, type Profil } from './markierungen'

// Markierungen aus dem Profil (Probe 25.10.2026): Lage, Breite, durchgehend oder mehrere Striche, Pfeile verworfen
const profil = (felder: { von: number; bis: number; anteil: number; laeufe: number }[], pfeil: [number, number][] = []): Profil => {
  const t: number[] = [], anteil: number[] = [], laeufe: number[] = []
  for (let x = -5; x <= 5 + 1e-9; x += 0.05) {
    const tt = Math.round(x * 100) / 100, f = felder.find(f => tt >= f.von - 1e-9 && tt <= f.bis + 1e-9)
    t.push(tt); anteil.push(f?.anteil ?? 0); laeufe.push(f?.laeufe ?? 0)
  }
  return { t, anteil, laeufe, hell: t.map(() => 100), pfeil }
}
describe('markierungenFinden', () => {
  it('durchgehende Linie (ein Lauf, fast überall) und gestrichelte (mehrere Striche)', () => {
    const m = markierungenFinden(profil([{ von: -2.1, bis: -1.95, anteil: 0.95, laeufe: 1 }, { von: 1.5, bis: 1.65, anteil: 0.4, laeufe: 4 }]))
    expect(m.map(x => x.t)).toEqual([-2.02, 1.58])
    expect(m[1]).toMatchObject({ anteil: 0.4, laeufe: 4 })
  })
  it('ein einzelner Strich (ein Lauf, wenig Anteil) zählt nicht; zu breite helle Fläche auch nicht', () => {
    expect(markierungenFinden(profil([{ von: 0, bis: 0.15, anteil: 0.3, laeufe: 1 }]))).toEqual([])
    expect(markierungenFinden(profil([{ von: 0, bis: 0.8, anteil: 0.9, laeufe: 1 }]))).toEqual([])
  })
  it('Pfeil: breiter Fleck auf beiden Seiten des Schafts → verworfen; Autodach nur auf einer Seite → bleibt', () => {
    const schaft = [{ von: 1.15, bis: 1.3, anteil: 0.4, laeufe: 3 }]
    expect(markierungenFinden(profil(schaft, [[0.8, 1.7]]))).toEqual([])
    expect(markierungenFinden(profil(schaft, [[1.3, 2.8]])).map(x => x.t)).toEqual([1.22])
  })
})

import { startAufteilung, markierungPasst } from './aufteilung'
import { defaultSection, gegenVon, type Section } from './strecke'
describe('Breiten aus den Markierungen in der Ausgangslage (Kirchenfeldstrasse 44425592)', () => {
  // Radstreifen beidseitig, OSM: 1 Spur Richtung B, 2 Richtung A, Fahrbahn 14,00 m
  const basis = (): Section => {
    const a = { ...defaultSection(), ist: 'Radstreifen' as const, breite: 1.37, parkenRechts: 'nein' as const, fahrbahnbreite: 14,
      spuren: { a: ['keine', 'keine'] as never, b: ['keine'] as never }, quelle: { breite: 'gemessen' as const } }
    return { ...a, gegen: { ...gegenVon(a), breite: 1.8, quelle: { breite: 'gemessen' } } }
  }
  const fb = (s: Section) => startAufteilung(s).teile.filter(t => t.art !== 'Trottoir').map(t => `${t.art} ${t.breite}`)
  it('ohne Markierung: gleichmässig verteilt', () =>
    expect(fb(basis())).toEqual(['Velostreifen 1.8', 'Fahrspur 3.65', 'Fahrspur 3.6', 'Fahrspur 3.6', 'Velostreifen 1.37']))
  it('passende Zahl Stücke: Spuren aus dem Luftbild; gemessene Velostreifen bleiben, der Unterschied geht an die Spur daneben', () => {
    const s = { ...basis(), markierung: { breiten: [1.87, 4.52, 2.96, 3.28, 1.37], querschnitte: 2, stuecke: [5, 5, 4] } }
    expect(markierungPasst(s, startAufteilung(basis()))).toEqual({ passt: true, erkannt: 5, erwartet: 5, querschnitte: 1 })
    expect(fb(s)).toEqual(['Velostreifen 1.8', 'Fahrspur 4.59', 'Fahrspur 2.96', 'Fahrspur 3.28', 'Velostreifen 1.37'])
    expect(startAufteilung(s).teile.find(t => t.art === 'Fahrspur')?.ausLuftbild).toBe(true)
  })
  it('falsche Zahl Stücke (Linie im Schatten): bleibt gleichmässig, markierungPasst nennt erkannt und erwartet', () => {
    const s = { ...basis(), markierung: { breiten: [1.87, 4.52, 2.96, 4.65], querschnitte: 2, stuecke: [4, 4, 3] } }
    expect(fb(s)).toEqual(fb(basis()))
    expect(markierungPasst(s, startAufteilung(basis()))).toEqual({ passt: false, erkannt: 4, erwartet: 5, querschnitte: 0 })
  })
  it('alle Querschnitte: die mit passender Zahl zählen (einer mit fünf, zwei mit vier → der mit fünf)', () => {
    const s = { ...basis(), markierung: { breiten: [1.87, 4.52, 2.96, 4.65], querschnitte: 2, stuecke: [5, 4, 4],
      alle: [[1.87, 4.55, 2.93, 3.3, 1.35], [1.83, 4.59, 2.95, 4.63], [1.85, 4.52, 2.96, 4.67]] } }
    expect(markierungPasst(s, startAufteilung(basis()))).toMatchObject({ passt: true, querschnitte: 1 })
    expect(fb(s)).toEqual(['Velostreifen 1.8', 'Fahrspur 4.62', 'Fahrspur 2.93', 'Fahrspur 3.28', 'Velostreifen 1.37'])
  })
  it('unplausibel (Velostreifen 3,26 m): bleibt gleichmässig, mit Grund', () => {
    const s = { ...basis(), markierung: { breiten: [3.26, 4, 3, 2, 1.4], querschnitte: 2, stuecke: [5, 5, 5] } }
    expect(fb(s)).toEqual(fb(basis()))
    expect(markierungPasst(s, startAufteilung(basis()))?.unplausibel).toBe('Velostreifen 3,26 m')
  })
})
