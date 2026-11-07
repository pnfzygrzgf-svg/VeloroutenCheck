import { afterEach, describe, expect, it, vi } from 'vitest'
import { achseInRichtungA, BERN_DTM_KURZ, bernDtmLesen, bernDtmUrl, imBernerDtm, ladeSteigung, profilLesen, profilUrl, steigungAusProfil, umweltspurSteigungText, type ProfilPunkt } from './steigung'
import { defaultSection, tauscheSeiten } from './strecke'
import { pruefeTeil } from './aufteilung'
import type { P } from './lv95'

const rampe = (pct: number, n = 31, laenge = 300): ProfilPunkt[] =>
  Array.from({ length: n }, (_, k) => ({ dist: k * laenge / (n - 1), h: 540 + pct / 100 * k * laenge / (n - 1) }))

it('stellt dieselben geladenen Höhenpunkte und die tatsächlich abgefragte Achse zur Erklärung bereit, ohne Sichtbefund', async () => {
  const holen = vi.fn(async () => new Response(JSON.stringify([
    { dist: 0, alts: { COMB: 500 } }, { dist: 15, alts: { COMB: 500.3 } }, { dist: 30, alts: { COMB: 500.6 } },
  ])))
  vi.stubGlobal('fetch', holen)
  try {
    const linie: P[] = Array.from({ length: 15 }, (_, i) => [2683000 + i * 2, 1247000 + i % 3])
    const st = await ladeSteigung(linie)
    expect(st.pct).toBe(2)
    expect(st.modell).toBeUndefined()
    expect(st.profil?.punkte).toEqual([{ dist: 0, h: 500 }, { dist: 15, h: 500.3 }, { dist: 30, h: 500.6 }])
    expect(st.profil?.linie).toEqual(JSON.parse(new URL(profilUrl(linie)).searchParams.get('geom')!).coordinates)
    expect(st.profil?.sicht).toBeUndefined()
    expect(st.profil?.datenstand).toBeUndefined()
    expect(st.profil?.abgerufen).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(holen).toHaveBeenCalledTimes(1)
  } finally { vi.unstubAllGlobals() }
})

describe('DTM 2023 in der Stadt Bern', () => {
  const bern: P[] = [[2600000, 1200000], [2600100, 1200000]]
  const proben = (n: number, von = 0) => ({ samples: Array.from({ length: n }, (_, k) => ({ location: { x: 2600000 + (von + k) * 3, y: 1200000 }, value: String(500 + (von + k) * 0.06) })) })
  const antwort = (x: unknown) => new Response(JSON.stringify(x))
  const swisstopo = [{ dist: 0, alts: { COMB: 500 } }, { dist: 50, alts: { COMB: 501 } }, { dist: 100, alts: { COMB: 502 } }]
  afterEach(() => { vi.unstubAllGlobals() })

  it('fragt in Bern das Modell der Stadt und nennt es', async () => {
    const holen = vi.fn(async () => antwort(proben(34)))
    vi.stubGlobal('fetch', holen)
    const st = await ladeSteigung(bern)
    expect(st).toMatchObject({ pct: 2, modell: BERN_DTM_KURZ })
    expect(holen).toHaveBeenCalledTimes(1)
    expect(String((holen.mock.calls as unknown[][])[0][0])).toContain('gisapp.bern.ch')
    expect(st.profil?.quelle).toContain(BERN_DTM_KURZ)
    expect(umweltspurSteigungText(st, 'A')).toContain(BERN_DTM_KURZ)
  })

  it('fällt auf swissALTI3D zurück, wenn der Dienst ausfällt oder die Linie nicht deckt', async () => {
    for (const erste of [() => new Response('x', { status: 500 }), () => antwort({ error: { code: 400 } }), () => antwort(proben(5))]) {
      const holen = vi.fn(async (url: string) => (String(url).includes('gisapp') ? erste() : antwort(swisstopo)))
      vi.stubGlobal('fetch', holen)
      const st = await ladeSteigung(bern)
      expect(st.pct).toBe(2); expect(st.modell).toBeUndefined()
      expect(holen.mock.calls.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('fragt ausserhalb des Rechtecks die Stadt nicht', () => {
    expect(imBernerDtm(bern)).toBe(true)
    expect(imBernerDtm([[2600000, 1200000], [2683000, 1247000]])).toBe(false)
  })

  it('liest die Proben der Reihe nach und lässt NoData weg', () => {
    expect(bernDtmLesen({ samples: [{ location: { x: 0, y: 0 }, value: '500' }, { location: { x: 10, y: 0 }, value: 'NoData' }, { location: { x: 20, y: 0 }, value: 501 }] }))
      .toEqual([{ dist: 0, h: 500 }, { dist: 20, h: 501 }])
    expect(() => bernDtmLesen({ error: { message: 'kaputt' } })).toThrow(/kaputt/)
    expect(() => bernDtmLesen({})).toThrow(/keine Liste/)
  })

  it('verlangt die Linie in LV95 mit passendem Abstand', () => {
    const u = new URL(bernDtmUrl(bern, 11))
    expect(u.host).toBe('gisapp.bern.ch')
    expect(u.searchParams.get('sampleDistance')).toBe('10')
    expect(JSON.parse(u.searchParams.get('geometry')!).spatialReference.wkid).toBe(2056)
  })
})

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
