import { describe, it, expect } from 'vitest'
import { bordkanten, messeAbKante, messeFlaeche, mittelinsel, parkierungTiefe, parkierungVersetzt, abstand, aufZentimeter, type Kante } from './breitenmessung'
import { zuLv95, zuWgs, type P } from './lv95'
import type { AvFlaeche } from './av'

const rechteck = (e0: number, n0: number, e1: number, n1: number): P[] => [[e0, n0], [e1, n0], [e1, n1], [e0, n1], [e0, n0]]
const strasse = (ringe: P[][]): AvFlaeche => ({ art: 'Strasse_Weg', ringe })
// Kante als gerundete Zeichenkette (Richtung egal) für den Vergleich
const k = (x: Kante) => [x.a, x.b].map(p => p.map(v => v.toFixed(1)).join('/')).sort().join(' – ')

describe('LV95 ↔ WGS84', () => {
  // Sollwerte aus GDAL/PROJ (EPSG:4326 → EPSG:2056), 16.10.2026.
  it('WGS84 → LV95 wie PROJ, auf den Millimeter', () => {
    const [e, n] = zuLv95(46.9481, 7.4474)
    expect(e).toBeCloseTo(2600667.474, 3)
    expect(n).toBeCloseTo(1199668.433, 3)
    const [ez, nz] = zuLv95(47.3769, 8.5417)
    expect(ez).toBeCloseTo(2683303.894, 3)
    expect(nz).toBeCloseTo(1247925.628, 3)
  })
  it('hin und zurück auf wenige Millimeter (Iteration der Umkehrung)', () => {
    const [e, n] = zuLv95(46.9481, 7.4474)
    const w = zuWgs(e, n)
    const [e2, n2] = zuLv95(w.lat, w.lon)
    expect(Math.hypot(e2 - e, n2 - n)).toBeLessThan(0.005)
  })
})

describe('bordkanten — Kanten der Strassenflächen, hinter denen keine Strasse liegt', () => {
  // Zwei aneinanderstossende Strassenflächen (0–50 und 50–100 m, 8 m breit), dazu ein Trottoir.
  const a = strasse([rechteck(0, 0, 50, 8)]), b = strasse([rechteck(50, 0, 100, 8)])
  const trottoir: AvFlaeche = { art: 'Trottoir', ringe: [rechteck(0, 8, 100, 11)] }
  const kanten = bordkanten([a, b, trottoir]).map(k)

  it('die gemeinsame Kante der zwei Strassenflächen ist kein Bord', () =>
    expect(kanten).not.toContain(k({ a: [50, 0], b: [50, 8] })))
  it('die Längskanten beider Flächen sind Bord', () => {
    expect(kanten).toContain(k({ a: [0, 8], b: [50, 8] }))
    expect(kanten).toContain(k({ a: [50, 0], b: [100, 0] }))
  })
  it('die Fläche des Trottoirs selbst liefert keine Kanten', () =>
    expect(kanten.every(x => !x.includes('11.0')))
  )
  it('das Loch einer Verkehrsinsel zählt als Bord', () => {
    const mitInsel = strasse([rechteck(0, 0, 50, 8), rechteck(20, 3, 30, 5)])
    expect(bordkanten([mitInsel]).map(k)).toContain(k({ a: [20, 3], b: [30, 3] }))
  })
})

describe('messeAbKante — rechtwinklig von der Markierung zur Bordsteinkante', () => {
  const kanten: Kante[] = [{ a: [0, 0], b: [100, 0] }, { a: [0, 10], b: [100, 10] }]
  it('misst den kürzesten Abstand zur nächsten Kante', () => {
    const r = messeAbKante([40, 1.62], kanten)!
    expect(r.breite).toBeCloseTo(1.62, 6)
    expect(r.fuss).toEqual([40, 0])
  })
  it('weiter als die Fanggrenze → keine Messung', () =>
    expect(messeAbKante([40, 5], kanten, 4)).toBeNull())
  it('zwei Punkte und Rundung auf Zentimeter', () => {
    expect(abstand([0, 0], [3, 4])).toBe(5)
    expect(aufZentimeter(1.6249)).toBe(1.62)
    expect(aufZentimeter(1.625)).toBe(1.63)
  })
})

import { fahrbahnbreite } from './breitenmessung'
describe('fahrbahnbreite — Bordstein zu Bordstein, Median der Querschnitte', () => {
  const achse: P[] = [[0, 4], [100, 4]]
  it('gerade Strasse 8 m breit, aus zwei aneinanderstossenden Flächen', () => {
    const r = fahrbahnbreite([achse], [strasse([rechteck(0, 0, 50, 8)]), strasse([rechteck(50, 0, 100, 8)])])!
    expect(r.median).toBeCloseTo(8, 6)
    expect(r.n).toBeGreaterThan(10)
  })
  it('in einer Einmündung findet der Strahl keinen Bord → Querschnitt fällt weg, die Breite bleibt', () => {
    const haupt = strasse([rechteck(0, 0, 100, 8)])
    const einmuendung = strasse([rechteck(45, 8, 55, 40)])   // stösst von Norden an
    const ohne = fahrbahnbreite([achse], [haupt])!
    const mit = fahrbahnbreite([achse], [haupt, einmuendung])!
    expect(mit.median).toBeCloseTo(8, 6)
    expect(mit.max).toBeCloseTo(8, 6)
    expect(mit.n).toBeLessThan(ohne.n)
  })
  it('Achse neben der Strassenfläche → keine Breite', () =>
    expect(fahrbahnbreite([[[0, 50], [100, 50]]], [strasse([rechteck(0, 0, 100, 8)])])).toBeNull())
  it('kurzes Segment: an den Enden nur je ein Achtel ausgelassen', () =>
    expect(fahrbahnbreite([[[0, 4], [30, 4]]], [strasse([rechteck(0, 0, 30, 8)])])?.median).toBeCloseTo(8, 6))
  it('zu kurz für drei Querschnitte → keine Breite', () =>
    expect(fahrbahnbreite([[[0, 4], [12, 4]]], [strasse([rechteck(0, 0, 12, 8)])])).toBeNull())
})

import { trottoirbreiten } from './breitenmessung'
describe('trottoirbreiten — ab Bordsteinkante über die Trottoirfläche', () => {
  const trottoir = (r: P[]): AvFlaeche => ({ art: 'Trottoir', ringe: [r] })
  const achse: P[] = [[0, 4], [100, 4]]   // nach Osten: links = Norden, rechts = Süden
  const strasseF = strasse([rechteck(0, 0, 100, 8)])
  it('je Seite der Median; zwei aneinanderstossende Trottoirflächen zählen als eine', () => {
    const r = trottoirbreiten([achse], [strasseF,
      trottoir(rechteck(0, 8, 50, 10.5)), trottoir(rechteck(50, 8, 100, 10.5)),   // Norden 2,50
      trottoir(rechteck(0, -2, 100, 0))])                                         // Süden 2,00
    expect(r.links).toBeCloseTo(2.5, 6)
    expect(r.rechts).toBeCloseTo(2, 6)
  })
  it('ohne Trottoirfläche hinter dem Bord: null', () =>
    expect(trottoirbreiten([achse], [strasseF, trottoir(rechteck(0, 8, 100, 10))]).rechts).toBeNull())
  it('Trottoir nur auf einem kurzen Stück (unter der Hälfte der Querschnitte): null', () =>
    expect(trottoirbreiten([achse], [strasseF, trottoir(rechteck(40, -2, 60, 0))]).rechts).toBeNull())
  it('Fläche breiter als 8 m (Platz) zählt nicht', () =>
    expect(trottoirbreiten([achse], [strasseF, trottoir(rechteck(0, 8, 100, 20))]).links).toBeNull())
  it('Grünstreifen zwischen Bord und Fussweg (Spöndlistrasse): Fussweg dahinter, Grün samt schmalem Streifen davor', () => {
    const gruen = (r: P[]): AvFlaeche => ({ art: 'Gartenanlage', ringe: [r] })
    // Norden: 0,30 Trottoirstreifen, 1,50 Grün, 2,20 Fussweg (das Grün als Loch in der Trottoirfläche)
    const r = trottoirbreiten([achse], [strasseF, { art: 'Trottoir', ringe: [rechteck(0, 8, 100, 12), rechteck(0, 8.3, 100, 9.8)] },
      gruen(rechteck(0, 8.3, 100, 9.8))])
    expect(r.links).toBeCloseTo(2.2, 6)
    expect(r.gruen?.links).toBeCloseTo(1.8, 6)
    // einzelne Baumscheiben (unter der Hälfte der Querschnitte): kein Grünstreifen
    const b = trottoirbreiten([achse], [strasseF, { art: 'Trottoir', ringe: [rechteck(0, 8, 100, 11), rechteck(20, 8.5, 25, 9.5)] },
      gruen(rechteck(20, 8.5, 25, 9.5))])
    expect(b.links).toBeCloseTo(3, 6)
    expect(b.gruen).toBeUndefined()
  })
})

describe('messeFlaeche — ganze Fläche von Kante zu Kante (Velostrasse, Wege)', () => {
  const kanten = [{ a: [0, 0] as [number, number], b: [50, 0] as [number, number] }, { a: [0, 5.2] as [number, number], b: [50, 5.2] as [number, number] }]
  it('Klick in die Fläche: Breite zwischen beiden Kanten', () => {
    expect(messeFlaeche([20, 1.5], kanten)?.breite).toBeCloseTo(5.2, 6)
    expect(messeFlaeche([20, 4.9], kanten)?.breite).toBeCloseTo(5.2, 6)
  })
  it('ohne gegenüberliegende Kante kein Ergebnis', () => {
    expect(messeFlaeche([20, 1.5], [kanten[0]])).toBeNull()
  })
})

describe('parkierungTiefe — Tiefe und Anordnung der Parkierung je Seite (Egghölzlistrasse)', () => {
  const achse: P[] = [[0, 0], [100, 0]]
  const reihe = (n0: number, n1: number, e0 = 10, e1 = 90): P[] => [[e0, n0], [e1, n0], [e1, n1], [e0, n1]]
  it('Schrägreihe links 5,10 m, Längsreihe rechts 2,00 m', () => {
    const r = parkierungTiefe([achse], [{ ringe: [reihe(3, 8.1)] }, { ringe: [reihe(-5, -3)] }])
    expect(r.links).toEqual({ tiefe: 5.1, art: 'tief' })
    expect(r.rechts).toEqual({ tiefe: 2, art: 'laengs' })
  })
  it('mit der Anzahl Felder: schräg 45° (3,5 m je Feld), 60° (2,95 m) oder senkrecht (2,5 m je Feld)', () => {
    expect(parkierungTiefe([achse], [{ ringe: [reihe(3, 8.1, 10, 45)], anzahl: 10 }]).links).toEqual({ tiefe: 5.1, art: 'schraeg', winkel: 45 })
    expect(parkierungTiefe([achse], [{ ringe: [reihe(3, 8.1, 10, 39.5)], anzahl: 10 }]).links).toEqual({ tiefe: 5.1, art: 'schraeg', winkel: 60 })
    expect(parkierungTiefe([achse], [{ ringe: [reihe(3, 8.1, 10, 35)], anzahl: 10 }]).links).toEqual({ tiefe: 5.1, art: 'quer' })
  })
  it('versetzt: Parkierung links und rechts an verschiedenen Stellen → die weniger tiefe Seite zählt nicht', () => {
    const l = reihe(3, 5, 5, 40), r = reihe(-8.25, -3, 55, 95)
    expect(parkierungVersetzt([achse], [{ ringe: [l] }, { ringe: [r] }], { rechts: { tiefe: 5.25, art: 'schraeg' } })).toBe('links')
    // gegenüber (gleiche Stelle): nicht versetzt
    expect(parkierungVersetzt([achse], [{ ringe: [l] }, { ringe: [reihe(-5, -3, 5, 40)] }])).toBeNull()
    // nur eine Seite: nicht versetzt
    expect(parkierungVersetzt([achse], [{ ringe: [l] }])).toBeNull()
  })
  it('Zürcher Symbole: Anordnung aus den Daten, Tiefe angenommen', () => {
    const q = (e: number): P[] => [[e - 1, 3], [e + 1, 3], [e + 1, 5], [e - 1, 5]]
    const r = parkierungTiefe([achse], [20, 30, 40].map(e => ({ ringe: [q(e)], art: 'schraeg' as const, symbol: true })))
    expect(r.links).toEqual({ tiefe: 5.25, art: 'schraeg', angenommen: true })
    expect(r.rechts).toBeUndefined()
  })
})

describe('Mittelinsel (Nutzerbefund Laubeggstrasse, 20.10.2026)', () => {
  // Strasse 100 × 10 m (N 0…10), Achse auf N 2 (eine Richtung), Insel 2 m breit in der Mitte (N 4…6), 8 m lang
  const achse: P[] = [[0, 2], [100, 2]]
  const av: AvFlaeche[] = [strasse([rechteck(0, 0, 100, 10), rechteck(46, 4, 54, 6)]), { art: 'Verkehrsinsel', ringe: [rechteck(46, 4, 54, 6)] }]
  it('erkannt: Breite, Länge, Fahrbahn samt Insel', () => {
    expect(mittelinsel([achse], av)).toEqual({ breite: 2, laenge: 8, fahrbahn: 10, anzahl: 1 })
  })
  it('die Fahrbahnbreite läuft über die Insel bis zum Bord der Gegenseite', () => {
    const lange = [strasse([rechteck(0, 0, 100, 10), rechteck(5, 4, 95, 6)]), { art: 'Verkehrsinsel', ringe: [rechteck(5, 4, 95, 6)] }]
    expect(fahrbahnbreite([achse], lange)?.median).toBeCloseTo(10, 1)
  })
  it('eine Insel am Rand (dahinter keine Strasse) ist keine Mittelinsel', () => {
    const rand: AvFlaeche[] = [strasse([rechteck(0, 0, 100, 8)]), { art: 'Verkehrsinsel', ringe: [rechteck(46, 8, 54, 10)] }]
    expect(mittelinsel([achse], rand)).toBeNull()
  })
})
