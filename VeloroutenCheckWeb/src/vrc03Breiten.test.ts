// Abnahmetests Prüfung VRC-03 (10.11.2026): Hat die Führungsform bzw. die Haltestellenlösung im konkreten Fall eine Breitenvorgabe,
// gibt es ohne gültige Breite keine Note. Gültig: endliche Zahl über 0 m. Leer, undefined, NaN, Infinity, 0 und negative Werte
// schalten nichts frei; eine bekannte zu geringe Breite wird mit dem bestehenden Abzug bewertet.
import { describe, expect, it } from 'vitest'
import { bewerteAbschnitt, breitenMaengel, erforderlicheBreiten, fehlendeEingaben } from './bewertung'
import { defaultSection, gegenVon, seiteA, type Section } from './strecke'
import { fuehrungsformNote, gueltigeBreite, haltestellenbereichNote } from './fuehrungsform'
import { bewerteAufteilung } from './aufteilung'
import { buildCsv } from './csv'

const UNGUELTIG: unknown[] = [undefined, NaN, Infinity, -Infinity, 0, -1, -0.5]
const s0 = (x: Partial<Section>): Section => ({ ...defaultSection(), richtung: 'eine', routentyp: 'Velohauptroute', ...x })
// Haltestellenbereich (Bern): Tram, Haltestelle mit Veloumfahrung, Velohauptroute (Gegenprobe des Berichts)
const bereich = (b: unknown) => s0({ haltestellenbereich: true, oevAngebot: 'tram', tram: true, speed: 50,
  haltestellentyp: 'Haltestelle mit Veloumfahrung', haltestelleBreite: b as number })
// normaler Abschnitt mit derselben Haltestelle auf Seite A
const normal = (b: unknown) => s0({ dtv: 3000, speed: 30, ist: 'Radstreifen', breite: 2.5, oevAngebot: 'tram',
  haltestellentyp: 'Haltestelle mit Veloumfahrung', haltestelleBreite: b as number })
// Velostreifen ohne Haltestelle
const form = (b: unknown) => s0({ dtv: 3000, speed: 30, ist: 'Radstreifen', breite: b as number })

describe('VRC-03 · gültige Breite', () => {
  it('nur endliche Zahlen über 0 m', () => {
    for (const x of UNGUELTIG) expect(gueltigeBreite(x), String(x)).toBe(false)
    expect(gueltigeBreite(null)).toBe(false)
    expect(gueltigeBreite('2')).toBe(false)
    expect(gueltigeBreite(0.01)).toBe(true)
  })
})

describe('VRC-03 · keine Note ohne gültige erforderliche Breite (auch keine Ersatznote)', () => {
  it.each([['Haltestellenbereich', bereich], ['normaler Abschnitt mit Haltestelle', normal]] as const)('%s: Veloumfahrung ohne gültige Breite', (_n, f) => {
    for (const b of UNGUELTIG) {
      const e = bewerteAbschnitt(f(b), 'bern')
      expect(e.note, String(b)).toBeNull()
      expect(e.seiten[0].bewertung, String(b)).toBeNull()
      expect(e.seiten[0].fehlt.join(' '), String(b)).toContain('Breite der Veloumfahrung')
    }
    expect(bewerteAbschnitt(f(0), 'bern').seiten[0].fehlt).toContain('Breite der Veloumfahrung (0 m ist keine gültige Angabe)')
  })
  it('Führungsform mit Breitenvorgabe: leer, 0, negativ bzw. unendlich → keine Note, Mass benannt', () => {
    for (const b of UNGUELTIG) {
      const e = bewerteAbschnitt(form(b), 'bern')
      expect(e.note, String(b)).toBeNull()
      expect(e.seiten[0].fehlt.join(' '), String(b)).toContain('Breite der Führungsform')
    }
  })
  it('gilt auf Seite B ebenso; die gültige Seite A verdeckt die unvollständige Seite B nicht', () => {
    const s = s0({ richtung: 'beide', dtv: 3000, speed: 30, ist: 'Radstreifen', breite: 2.5,
      gegen: { ...gegenVon(defaultSection()), ist: 'Radstreifen', breite: 0 } })
    const e = bewerteAbschnitt(s, 'bern')
    expect(e.seiten[0].bewertung?.note).toEqual(expect.any(Number))
    expect(e.seiten[1].bewertung).toBeNull()
    expect(e.note).toBeNull()
  })
  it('auch in Zürich, Basel und Luzern', () => {
    for (const city of ['zurich', 'luzern'] as const) expect(bewerteAbschnitt(form(0), city).note, city).toBeNull()
    expect(bewerteAbschnitt({ ...form(0), strassentyp: 'verkehrsorientiert' }, 'basel').note).toBeNull()
  })
})

describe('VRC-03 · gültige Breiten werden normal bewertet', () => {
  it('0,50 m: zu schmal mit dem bestehenden Abzug (Haltestellenbereich 4,5, normaler Abschnitt 4,5, Velostreifen 4,0)', () => {
    expect(bewerteAbschnitt(bereich(0.5), 'bern').note).toBe(4.5)
    expect(bewerteAbschnitt(normal(0.5), 'bern').note).toBe(4.5)
    expect(bewerteAbschnitt(form(0.5), 'bern').note).toBe(4)
  })
  it('ausreichende Breite: normale Bewertung, übrige Abzüge wirken weiter (nicht automatisch 6)', () => {
    expect(bewerteAbschnitt(bereich(1.8), 'bern').note).toBe(6)
    const mitPark = bewerteAbschnitt({ ...form(2.5), parkenRechts: 'ja' }, 'bern')
    expect(mitPark.note).toBe(5)
    expect(bewerteAbschnitt(s0({ dtv: 6000, speed: 50, ist: 'Radstreifen', breite: 2.5 }), 'bern').note).toBeLessThan(6)   // Separation (VRC-02)
  })
})

describe('VRC-03 · keine unnötige Pflicht', () => {
  it('Formen und Haltestellentypen ohne Breitenvorgabe sperren nicht', () => {
    expect(bewerteAbschnitt(s0({ dtv: 1500, speed: 30, ist: 'Mischverkehr' }), 'bern').note).toBe(6)
    const kap = s0({ dtv: 1500, speed: 30, ist: 'Mischverkehr', oevAngebot: 'bus_ab15', haltestellentyp: 'Kaphaltestelle' })
    expect(erforderlicheBreiten(kap, seiteA(kap), 'bern')).toEqual([])
    expect(bewerteAbschnitt(kap, 'bern').note).toEqual(expect.any(Number))
  })
  it('Haltestellenbreite nur, wenn die Seite eine Haltestelle mit Vorgabe hat', () => {
    const ohneOev = { ...normal(NaN), oevAngebot: 'keine' as const }
    expect(breitenMaengel(ohneOev, seiteA(ohneOev), 'bern')).toEqual([])
    const ohneSeite = { ...normal(NaN), ohneHaltestelle: true }
    expect(breitenMaengel(ohneSeite, seiteA(ohneSeite), 'bern')).toEqual([])
    expect(fehlendeEingaben(normal(NaN), seiteA(normal(NaN)), 'bern')).toEqual(['Breite der Veloumfahrung'])
  })
})

describe('VRC-03 · Notenfunktionen bei direktem Aufruf und Weitergabe', () => {
  it('fuehrungsformNote: angegebene ungültige Breite → keine Note', () => {
    for (const b of [0, -1, NaN, Infinity]) {
      const r = fuehrungsformNote(3000, 30, 'Radstreifen', b, 'Velohauptroute')
      expect(Number.isNaN(r.note), String(b)).toBe(true)
      expect(r.offen).toContain('Breite der Führungsform')
    }
    const hs = fuehrungsformNote(3000, 30, 'Radstreifen', 2.5, 'Velohauptroute', 'egal', undefined, 'tram', 'Haltestelle mit Veloumfahrung', 0)
    expect(Number.isNaN(hs.note)).toBe(true)
  })
  it('haltestellenbereichNote: Typ mit Vorgabe ohne gültige Breite → keine Note statt 6', () => {
    for (const b of [undefined, 0, -1]) {
      const r = haltestellenbereichNote('Velohauptroute', 'tram', 'Haltestelle mit Veloumfahrung', b, true, 50)
      expect(Number.isNaN(r.note), String(b)).toBe(true)
    }
    expect(haltestellenbereichNote('Velohauptroute', 'tram', 'Haltestelle mit Veloumfahrung', 1.8, true, 50).note).toBe(6)
  })
  it('gelöschte Breite: Abschnitt, Planung und Export zeigen keine Note mehr', () => {
    const gut = form(2.5), weg = form(NaN)
    expect(bewerteAbschnitt(gut, 'bern').note).toBe(6)
    expect(bewerteAbschnitt(weg, 'bern').note).toBeNull()
    const plan = bewerteAufteilung(weg, { fahrbahn: 8, teile: [{ art: 'Fahrspur', breite: 3 }, { art: 'Velostreifen', breite: 0 }] } as never, 'bern')   // rechts = Seite A
    expect(plan.note).toBeNull()
    const csv = buildCsv([weg], [bewerteAbschnitt(weg, 'bern')], null, 'bern', 'Bern')
    expect(csv).toContain('unvollständig')
  })
})
