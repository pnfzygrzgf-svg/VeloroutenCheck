import { describe, expect, it } from 'vitest'
import { achseInRichtungA, profilLesen, profilUrl, steigungAusProfil, umweltspurSteigungText, type ProfilPunkt } from './steigung'
import { defaultSection, tauscheSeiten } from './strecke'
import { pruefeTeil } from './aufteilung'
import type { P } from './lv95'

const rampe = (pct: number, n = 31, laenge = 300): ProfilPunkt[] =>
  Array.from({ length: n }, (_, k) => ({ dist: k * laenge / (n - 1), h: 540 + pct / 100 * k * laenge / (n - 1) }))

describe('steigung', () => {
  it('Abfrage in LV95, höchstens 8 Ecken, Anfang und Ende bleiben', () => {
    const linie: P[] = Array.from({ length: 20 }, (_, k) => [2600000 + k * 10, 1200000])
    const u = new URL(profilUrl(linie))
    expect(u.hostname).toBe('api3.geo.admin.ch')
    expect(u.searchParams.get('sr')).toBe('2056')
    const ecken = JSON.parse(u.searchParams.get('geom')!).coordinates as number[][]
    expect(ecken.length).toBeLessThanOrEqual(8)
    expect(ecken[0]).toEqual([2600000, 1200000])
    expect(ecken[ecken.length - 1]).toEqual([2600190, 1200000])
  })
  it('Antwort lesen: COMB, sonst DTM2; Punkte ohne Höhe fallen weg', () => {
    expect(profilLesen([{ dist: 0, alts: { COMB: 540.1 } }, { dist: 10, alts: { COMB: null, DTM2: 541 } }, { dist: 20, alts: {} }]))
      .toEqual([{ dist: 0, h: 540.1 }, { dist: 10, h: 541 }])
    expect(() => profilLesen({})).toThrow()
  })
  it('Ausgleichsgerade: 3,4 % bergauf, Ausreisser (Brücke) fällt weg; zu kurz -> unbekannt', () => {
    expect(steigungAusProfil(rampe(3.4))).toMatchObject({ pct: 3.4, laenge: 300 })
    const mitBruecke = rampe(-2.5).map((p, k) => (k === 15 ? { ...p, h: p.h + 8 } : p))
    expect(steigungAusProfil(mitBruecke).pct).toBe(-2.5)
    expect(steigungAusProfil(rampe(5, 3, 10)).pct).toBeNull()
  })
  it('Achsstücke in Fahrtrichtung A ordnen (Peilung Ost)', () => {
    const a: P[] = [[100, 0], [200, 0]], b: P[] = [[0, 0], [100, 0]]
    expect(achseInRichtungA([a, b], 90)).toEqual([[0, 0], [100, 0], [100, 0], [200, 0]])
  })
  it('Hinweis je Seite: bergauf über 2 % mit Vorgabe, bergab ohne, flach ohne', () => {
    const st = { pct: 3.4, laenge: 300 }
    expect(umweltspurSteigungText(st, 'A')).toContain('3,4 % bergauf')
    expect(umweltspurSteigungText(st, 'A')).toContain('ab 4,50 m')
    expect(umweltspurSteigungText(st, 'B')).toContain('auf dieser Seite bergab')
    expect(umweltspurSteigungText({ pct: -1.2, laenge: 120 }, 'B')).toContain('nicht über 2 %')
    expect(umweltspurSteigungText({ pct: null, laenge: 0, hinweis: 'Höhenmodell nicht erreichbar (x): Steigung nicht geprüft.' }, 'A'))
      .toContain('nicht erreichbar')
    expect(umweltspurSteigungText(undefined, 'A')).toContain('noch nicht geladen')
  })
  it('Seiten tauschen kehrt das Vorzeichen um', () => {
    const s = { ...defaultSection(), steigung: { pct: 3.4, laenge: 300 } }
    expect(tauscheSeiten(s).steigung?.pct).toBe(-3.4)
  })
  it('Umweltspur in der Planung: Hinweis aus der Steigung der Seite', () => {
    const p = pruefeTeil({ art: 'Umweltspur', breite: 4.0 }, 'Veloroute', undefined,
      { stadt: 'bern', oevTakt: 10, steigung: { pct: -3.4, laenge: 300 }, seite: 'B' })
    expect(p.hinweis).toContain('3,4 % bergauf')
    expect(p.hinweis).not.toContain('nicht geprüft')
  })
})
