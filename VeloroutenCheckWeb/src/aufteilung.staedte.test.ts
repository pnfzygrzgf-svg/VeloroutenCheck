import { describe, it, expect } from 'vitest'
import {
  vorgabe, pruefeTeil, pruefeKernfahrbahn, startAufteilung, umfeldVon, fussnetzOptionen, FUSSNETZ, STANDARD_QUELLE,
  bilanz, formJeSeite, istFahrbahnTeil, mitTrottoirs, teilName, type Teil,
} from './aufteilung'
import { defaultSection, gegenVon, tauscheSeiten, type Section } from './strecke'
import { luArt, type AvFlaeche } from './av'
import { parkierungAufTrottoir } from './breitenmessung'
import type { P } from './lv95'
import { streifen } from './parkierung'

// Etappe 4 (17.10.2026): Vorgaben der Städte, sonst Bern mit «Ersatz Bern: …»
const T = (art: Teil['art'], breite: number): Teil => ({ art, breite })

describe('vorgabe — eigene Werte der Stadt, sonst Ersatz Bern', () => {
  it('Bern: Masterplan ohne Ersatz-Hinweis', () => {
    expect(vorgabe('Parkierung', 'bern')).toMatchObject({ wert: 1.9, quelle: STANDARD_QUELLE.bern })
  })
  it('Basel Längsparkierung 2,00, Luzern Fahrspur 3,25 / min. 3,00', () => {
    expect(vorgabe('Parkierung', 'basel')).toMatchObject({ wert: 2.0, quelle: STANDARD_QUELLE.basel })
    expect(vorgabe('Fahrspur', 'luzern')).toMatchObject({ wert: 3.25, min: 3.0, quelle: STANDARD_QUELLE.luzern })
  })
  it('Zürich regelt die Parkierung nicht → Berner Wert, als Ersatz ausgewiesen', () => {
    expect(vorgabe('Parkierung', 'zurich')).toMatchObject({ wert: 1.9, quelle: `Ersatz Bern: ${STANDARD_QUELLE.bern}` })
  })
  it('Pfosten überall die eigene Festlegung, ohne Ersatz-Hinweis', () => {
    expect(vorgabe('Pfosten', 'basel')?.quelle).not.toMatch(/^Ersatz/)
  })
  it('Sicherheitsstreifen Zürich 0,75 als Mindestmass', () => {
    expect(pruefeTeil(T('Sicherheitsstreifen', 0.7), 'Veloroute', undefined, { stadt: 'zurich' }).status).toBe('zu schmal')
    expect(pruefeTeil(T('Sicherheitsstreifen', 0.7), 'Veloroute', undefined, { stadt: 'basel' }).status).toBe('unter Richtwert')
  })
  it('Tram ausserhalb Berns als Ersatz', () => {
    expect(pruefeTeil(T('Tram', 3), 'Veloroute', undefined, { stadt: 'zurich' }).quelle).toMatch(/^Ersatz Bern/)
  })
})

describe('Fahrbahn ohne Mittellinie — nur wo die Stadt ein Mass nennt', () => {
  const g = (breite: number, u: Parameters<typeof pruefeTeil>[3]) => pruefeTeil(T('Gemeinsam', breite), 'Veloroute', undefined, u)
  it('Bern: keine Prüfung (wie bisher)', () => expect(g(4.1, { stadt: 'bern' }).status).toBe('keine Vorgabe'))
  it('Zürich: 4,40, auf Vorzugsrouten 4,80, über 6,00 zu breit', () => {
    expect(g(4.5, { stadt: 'zurich', routentyp: 'Veloroute' }).status).toBe('ok')
    expect(g(4.5, { stadt: 'zurich', routentyp: 'Velohauptroute' }).status).toBe('zu schmal')
    expect(g(6.2, { stadt: 'zurich', routentyp: 'Veloroute' }).status).toBe('zu breit')
  })
  it('Basel: 4,50, reduziert 4,30, unter 1 000 Fz/Tag 4,00', () => {
    expect(g(4.2, { stadt: 'basel', dtv: 3000 }).status).toBe('zu schmal')
    expect(g(4.2, { stadt: 'basel', dtv: 800 }).status).toBe('unter Richtwert')
  })
  it('Luzern: 4,50 bis 7,50', () => {
    expect(g(4.4, { stadt: 'luzern' }).status).toBe('zu schmal')
    expect(g(8, { stadt: 'luzern' }).status).toBe('zu breit')
  })
})

describe('Trottoir je Stadt', () => {
  it('Optionen je Stadt getrennt', () => {
    expect(fussnetzOptionen('zurich')).toEqual(['zh_land', 'zh_stadt', 'zh_quartier', 'zh_nachbar'])
    expect(fussnetzOptionen('basel')).toEqual(['bs_kanton', 'bs_stadt', 'bs_uebrige'])
    expect(fussnetzOptionen('luzern')).toEqual([])
  })
  it('Basel kantonales Netz: Richtwert 2,40, mindestens 2,00', () => {
    expect(pruefeTeil(T('Trottoir', 2.1), 'Veloroute', undefined, { stadt: 'basel', fussnetz: 'bs_kanton' }))
      .toMatchObject({ soll: 2.4, min: 2.0, status: 'unter Richtwert' })
    expect(FUSSNETZ.bs_kanton.stadt).toBe('basel')
  })
  it('Netz einer anderen Stadt gilt nicht', () => {
    expect(pruefeTeil(T('Trottoir', 2.1), 'Veloroute', undefined, { stadt: 'zurich', fussnetz: 'bs_kanton' }).status).toBe('keine Vorgabe')
  })
  it('Luzern: 3,00 bei Tempo 50 ohne Velostreifen, sonst 2,50; mindestens 2,00', () => {
    const tr = (u: Parameters<typeof pruefeTeil>[3]) => pruefeTeil(T('Trottoir', 2.6), 'Veloroute', undefined, { stadt: 'luzern', ...u })
    expect(tr({ kmh: 50, velo: false })).toMatchObject({ soll: 3.0, status: 'unter Richtwert' })
    expect(tr({ kmh: 50, velo: true })).toMatchObject({ soll: 2.5, status: 'ok' })
    expect(tr({ kmh: 30 })).toMatchObject({ soll: 2.5, status: 'ok' })
    expect(pruefeTeil(T('Trottoir', 1.9), 'Veloroute', undefined, { stadt: 'luzern', kmh: 30 }).status).toBe('zu schmal')
  })
  it('umfeldVon merkt Velostreifen in der Planung', () => {
    expect(umfeldVon(defaultSection(), [T('Velostreifen', 1.8)], undefined, 'luzern')).toMatchObject({ stadt: 'luzern', velo: true })
  })
})

describe('pruefeKernfahrbahn je Stadt', () => {
  const kern = (b = 4.5): Teil[] => [T('Velostreifen', 1.8), T('Kernfahrbahn', b), T('Velostreifen', 1.8)]
  const s = (dtv: number, speed: number): Section => ({ ...defaultSection(), richtung: 'beide', dtv, speed })
  const streng = (b: ReturnType<typeof pruefeKernfahrbahn>) => b.filter(x => x.streng).map(x => x.text)
  it('Zürich: nur Tempo 30; bis 5 000 DTV, mit Kern 5,20 bis 7 500', () => {
    expect(streng(pruefeKernfahrbahn(s(4000, 30), kern(), 'zurich'))).toEqual([])
    expect(streng(pruefeKernfahrbahn(s(6000, 30), kern(), 'zurich'))).toHaveLength(1)
    expect(streng(pruefeKernfahrbahn(s(6000, 30), kern(5.2), 'zurich'))).toEqual([])
    expect(streng(pruefeKernfahrbahn(s(4000, 50), kern(), 'zurich'))).toEqual(['Nur bei Tempo 30 vorgesehen.'])
  })
  it('Basel: ab 7 500 Fz/Tag nicht empfohlen', () => {
    expect(streng(pruefeKernfahrbahn(s(7000, 50), kern(), 'basel'))).toEqual([])
    expect(streng(pruefeKernfahrbahn(s(7500, 50), kern(), 'basel'))).toHaveLength(1)
  })
  it('Luzern: ab DTV 10 000 nicht zulässig, über Tempo 30 nur Hinweis', () => {
    const b = pruefeKernfahrbahn(s(8000, 50), kern(), 'luzern')
    expect(streng(b)).toEqual([])
    expect(b.some(x => /Tempo 30/.test(x.text))).toBe(true)
    expect(streng(pruefeKernfahrbahn(s(10000, 30), kern(), 'luzern'))).toHaveLength(1)
  })
  it('Bern unverändert: Tempo 50 zulässig, ab 10 000 nicht', () => {
    expect(streng(pruefeKernfahrbahn(s(8000, 50), kern()))).toEqual([])
    expect(streng(pruefeKernfahrbahn(s(10000, 50), kern()))).toHaveLength(1)
  })
})

describe('startAufteilung je Stadt', () => {
  it('Basel: Parkierung 2,00 statt 1,90', () => {
    const s: Section = { ...defaultSection(), ist: 'Mischverkehr', parkenRechts: 'ja', fahrbahnbreite: 9,
      gegen: { ...gegenVon(defaultSection()), ist: 'Mischverkehr', parkenRechts: 'nein' } }
    expect(startAufteilung(s, 'basel').teile.find(t => t.art === 'Parkierung')?.breite).toBe(2.0)
  })
  it('Luzern: gemeinsame Fahrbahn unter 2 × 3,25 = 6,50 m Rest', () => {
    const s: Section = { ...defaultSection(), ist: 'Mischverkehr', parkenRechts: 'nein', fahrbahnbreite: 6.3 }
    expect(startAufteilung(s, 'luzern').teile).toEqual([T('Gemeinsam', 6.3)])
    expect(startAufteilung(s, 'bern').teile).toEqual([T('Fahrspur', 3.15), T('Fahrspur', 3.15)])
  })
  it('Luzern ohne Fahrbahnbreite: Fahrspur 3,25', () => {
    const s: Section = { ...defaultSection(), ist: 'Mischverkehr', richtung: 'eine' }
    expect(startAufteilung(s, 'luzern').teile).toEqual([T('Fahrspur', 3.25)])
  })
})

describe('Ersatzdaten Luzern und Parkfelder Zürich', () => {
  it('luArt: Strassenflächen nach AV-Systematik', () => {
    expect(luArt(5000)).toBe('Strasse_Weg')
    expect(luArt(5001)).toBe('Strasse_Weg')
    expect(luArt(2)).toBe('Trottoir')
    expect(luArt(99)).toBeNull()
    expect(luArt('2')).toBeNull()
  })
  it('streifen: Linie als 2 m breiter Streifen je Stück', () => {
    const q = streifen([[0, 0], [10, 0], [10, 0.01], [10, 5]], 1)
    expect(q).toHaveLength(2)   // Stück unter 5 cm übergangen
    expect(q[0]).toEqual([[0, 1], [10, 1], [10, -1], [0, -1]])
  })
})

// Parkierung auf Trottoirniveau (17.10.2026, Kanzleistrasse Zürich): im gemessenen Trottoir enthalten
describe('Parkierung auf Trottoirniveau', () => {
  const mitPark = (parkA: boolean): Section => ({ ...defaultSection(), ist: 'Mischverkehr', parkenRechts: 'ja', fahrbahnbreite: 6.5,
    gegen: { ...gegenVon(defaultSection()), ist: 'Mischverkehr', parkenRechts: 'nein' }, trottoir: { a: 6, b: 2.5, ...(parkA ? { parkA: true } : {}) } })
  it('startAufteilung: Trottoir ohne die Parkierung, Parkierung ausserhalb der Fahrbahn', () => {
    const a = startAufteilung(mitPark(true), 'zurich')
    expect(a.teile.map(t => [t.art, t.breite, !!t.trottoirniveau])).toEqual([
      ['Trottoir', 2.5, false], ['Fahrspur', 3.25, false], ['Fahrspur', 3.25, false], ['Parkierung', 1.9, true], ['Trottoir', 4.1, false]])
    const b = bilanz(a)
    expect(b.fahrbahnSumme).toBeCloseTo(6.5, 6)
    expect(b.rest).toBeCloseTo(0, 6)
  })
  it('ohne Befund wie bisher: Parkierung auf der Fahrbahn, Trottoir ganz', () => {
    const a = startAufteilung(mitPark(false), 'zurich')
    expect(a.teile[a.teile.length - 1]).toEqual(T('Trottoir', 6))
    expect(a.teile.find(t => t.art === 'Parkierung')?.trottoirniveau).toBeUndefined()
  })
  it('Bewertung: zählt weiter als Parkierung (Dooring)', () => {
    expect(formJeSeite(startAufteilung(mitPark(true), 'zurich').teile, 'A')?.parkenRechts).toBe('ja')
  })
  it('istFahrbahnTeil und teilName', () => {
    const p: Teil = { art: 'Parkierung', breite: 1.9, trottoirniveau: true }
    expect(istFahrbahnTeil(p)).toBe(false)
    expect(teilName(p)).toBe('Längsparkierung (Autos), auf Trottoirniveau')
  })
  it('mitTrottoirs: äusserste Parkierung kommt aufs Trottoir', () => {
    const a = mitTrottoirs({ fahrbahn: 8, teile: [T('Parkierung', 2), T('Fahrspur', 3), T('Fahrspur', 3)] }, { a: 2, b: 5, parkB: true })
    expect(a.teile.map(t => [t.art, t.breite, !!t.trottoirniveau])).toEqual([
      ['Trottoir', 3, false], ['Parkierung', 2, true], ['Fahrspur', 3, false], ['Fahrspur', 3, false], ['Trottoir', 2, false]])
  })
  it('Seiten tauschen nimmt den Befund mit', () => {
    expect(tauscheSeiten(mitPark(true)).trottoir).toEqual({ a: 2.5, b: 6, parkB: true })
  })
})

describe('parkierungAufTrottoir — Felder auf der Trottoirfläche je Seite', () => {
  // Achse nach Osten; links = Norden. Trottoir Nord von n = 3 bis 9, Süd von n = −9 bis −3.
  const achse: P[] = [[0, 0], [100, 0]]
  const rechteck = (e0: number, e1: number, n0: number, n1: number): P[] => [[e0, n0], [e1, n0], [e1, n1], [e0, n1]]
  const av: AvFlaeche[] = [
    { art: 'Strasse_Weg', ringe: [rechteck(-10, 110, -3, 3)] },
    { art: 'Trottoir', ringe: [rechteck(-10, 110, 3, 9)] },
    { art: 'Trottoir', ringe: [rechteck(-10, 110, -9, -3)] },
  ]
  it('Längsstreifen im Trottoir links, Felder auf der Fahrbahn rechts', () => {
    const park = [{ ringe: [rechteck(10, 90, 3.2, 5.2)] }, { ringe: [rechteck(10, 15, -3, -1)] }, { ringe: [rechteck(40, 45, -3, -1)] }]
    expect(parkierungAufTrottoir([achse], av, park)).toEqual({ links: true, rechts: false })
  })
  it('Felder hinter dem Achsenende (Querstrasse) zählen nicht', () => {
    expect(parkierungAufTrottoir([achse], av, [{ ringe: [rechteck(102, 107, 3.2, 5.2)] }])).toEqual({ links: false, rechts: false })
  })
})
