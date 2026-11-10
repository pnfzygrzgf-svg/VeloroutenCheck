// Abnahmetests Prüfung VRC-04 (10.11.2026): Die Falldatei prüft jedes Feld, das Bewertung und Planung lesen, vor dem Typ-Cast;
// fehlerhafte Dateien scheitern mit einer Meldung, die Abschnitt, Seite und Feld nennt. Unbekannte Haltestellentypen erreichen
// keinen regulären Bewertungspfad. Gegenproben des Berichts: breite = −1, fahrbahnbreite = −1, haltestellentyp = «not-a-real-type»
// im Haltestellenbereich mit Tram.
import { describe, expect, it } from 'vitest'
import { fallLesen, fallText } from './fallDatei'
import { defaultSection, gegenVon, type Section } from './strecke'
import { alleHaltestellentypen, haltestellenTypen } from './fuehrungsform'
import { bewerteAbschnitt } from './bewertung'

const cand = { id: 1, wayId: 5, name: 'Teststrasse', selected: true, len: 111, geom: [{ lat: 46.95, lon: 7.44 }, { lat: 46.951, lon: 7.44 }], tags: {} }
const export1 = (s: Partial<Section> = {}) =>
  fallText({ standard: 'bern', gebiet: 'bern', strasse: 'x', sections: [{ ...defaultSection(), candIds: [1], ...s }], cands: [cand] as never, quellen: [] })
/** gültiger Export, danach Felder im JSON verändert (wie eine von Hand bzw. fremd erzeugte Datei) */
const datei = (abw: Record<string, unknown>, gegen?: Record<string, unknown>) => {
  const t = JSON.parse(export1(gegen ? { gegen: { ...gegenVon(defaultSection()) } } : {}))
  Object.assign(t.sections[0], abw)
  if (gegen) Object.assign(t.sections[0].gegen, gegen)
  return JSON.stringify(t)
}

describe('VRC-04 · die drei Gegenproben scheitern mit verständlicher Meldung', () => {
  it('breite = −1', () => expect(() => fallLesen(datei({ breite: -1 }))).toThrow('Abschnitt 1, Seite A: Feld «breite» muss eine Zahl ab 0 m oder leer sein'))
  it('fahrbahnbreite = −1', () => expect(() => fallLesen(datei({ fahrbahnbreite: -1 }))).toThrow('Abschnitt 1: Feld «fahrbahnbreite»'))
  it('unbekannter Haltestellentyp im Haltestellenbereich mit Tram', () =>
    expect(() => fallLesen(datei({ haltestellentyp: 'not-a-real-type', haltestellenbereich: true, oevAngebot: 'tram' })))
      .toThrow('Feld «haltestellentyp» ist kein bekannter Haltestellentyp («not-a-real-type»)'))
})

describe('VRC-04 · Werteklassen aller Felder', () => {
  it('jeder bekannte Haltestellentyp wird angenommen, ein unbekannter abgelehnt (Seite A und B)', () => {
    for (const t of ['keine', ...alleHaltestellentypen()]) {
      expect(() => fallLesen(datei({ haltestellentyp: t })), t).not.toThrow()
      expect(() => fallLesen(datei({}, { haltestellentyp: t })), `B ${t}`).not.toThrow()
    }
    expect(() => fallLesen(datei({}, { haltestellentyp: 'Bushaltestelle' }))).toThrow('Seite B: Feld «haltestellentyp»')
    expect(() => fallLesen(datei({ haltestellentyp: 7 }))).toThrow('haltestellentyp')
  })
  it.each([
    ['breite', Infinity], ['haltestelleBreite', -0.1], ['dtv', -5], ['speed', 0], ['speed', 300], ['oevTakt', 0],
    ['strassentyp', 'quartier'], ['oevAngebot', 'zug'], ['routentyp', 'Hauptroute'], ['parkenRechts', 'vielleicht'], ['richtung', 'links'],
    ['ist', 'Radbahn'], ['tram', 'ja'], ['dtvGeprueft', 1], ['parkenSicherheitsstreifen', 'nein'], ['ohneHaltestelle', 0],
  ] as [string, unknown][])('Seite A bzw. Abschnitt: %s = %s wird abgelehnt', (feld, wert) => {
    expect(() => fallLesen(datei({ [feld]: wert }))).toThrow(`«${feld}»`)
  })
  it.each([['breite', -1], ['oevTakt', -2], ['parkenRechts', 'x'], ['ist', 'Radbahn'], ['parkenSicherheitsstreifen', 'ja'], ['ohneHaltestelle', 'nein']] as [string, unknown][])(
    'Seite B: %s = %s wird abgelehnt', (feld, wert) => expect(() => fallLesen(datei({}, { [feld]: wert }))).toThrow(`Seite B: Feld «${feld}»`))
  it('optionale Schalter: falscher Typ abgelehnt, ja/nein angenommen', () => {
    for (const k of ['osmVeloGegenverkehr', 'ohneFahrbahn', 'haltestellenbereich', 'haltestellenbereichNein', 'oevGegen', 'heuteBestaetigt']) {
      expect(() => fallLesen(datei({ [k]: 'ja' })), k).toThrow(`«${k}»`)
      expect(() => fallLesen(datei({ [k]: true })), k).not.toThrow()
    }
    expect(() => fallLesen(datei({ hsTypAngenommen: { a: 'ja' } }))).toThrow('hsTypAngenommen')
    expect(() => fallLesen(datei({ radwegSeparat: { a: true, c: false } }))).toThrow('radwegSeparat')
    expect(() => fallLesen(datei({ trottoir: { a: -1, b: 2 } }))).toThrow('trottoir')
    expect(() => fallLesen(datei({ trottoir: { a: 2, b: NaN, parkA: 'x' } }))).toThrow('trottoir')
    expect(() => fallLesen(datei({ parkVersetzt: 'c' }))).toThrow('parkVersetzt')
    expect(() => fallLesen(datei({ trottoirQuelle: 'luftbild' }))).toThrow('trottoirQuelle')
    expect(() => fallLesen(datei({ fussnetzGeoportal: 'haupt' }))).toThrow('fussnetzGeoportal')
    expect(() => fallLesen(datei({ gesamtbreite: -3 }))).toThrow('gesamtbreite')
    expect(() => fallLesen(datei({ steigung: { pct: 'steil' } }))).toThrow('steigung')
  })
  it('Basler Felder (VRC-01) weiterhin geprüft', () => {
    expect(() => fallLesen(datei({ tempoRegime: 'immer' }))).toThrow()
    expect(() => fallLesen(datei({ zrw: { neubau: 'ja' } }))).toThrow()
    expect(() => fallLesen(datei({ abweichung: 5 }))).toThrow()
  })
})

describe('VRC-04 · gültige und alte Dateien bleiben lesbar; frühere Prüfungen bleiben', () => {
  it('unveränderter Export im Rundlauf, mit leeren Feldern (NaN) und Seite B', () => {
    const t = export1({ ist: 'Radstreifen', breite: 1.8, dtv: 3000, speed: 50, oevAngebot: 'tram', haltestellentyp: 'Inselhaltestelle', haltestelleBreite: 2.5,
      gegen: { ...gegenVon(defaultSection()), ist: 'Mischverkehr' }, trottoir: { a: 2.5, b: NaN, parkA: true }, haltestellenbereich: false })
    const f = fallLesen(t)
    expect(f.sections[0]).toMatchObject({ ist: 'Radstreifen', breite: 1.8, haltestellentyp: 'Inselhaltestelle', haltestelleBreite: 2.5 })
    const ohneId = (x: string) => { const j = JSON.parse(x); for (const a of j.sections) delete a.id; return j }   // die Kennung wird beim Lesen neu vergeben
    expect(ohneId(fallText(fallLesen(fallText(f))))).toEqual(ohneId(fallText(f)))
    expect(() => fallLesen(export1())).not.toThrow()   // leerer Abschnitt (alles NaN bzw. leer)
  })
  it('alte Datei ohne die neuen optionalen Felder', () => {
    const t = JSON.parse(export1({ ist: 'Mischverkehr' }))
    for (const k of ['abweichung', 'tempoRegime', 'zrw', 'regimeText', 'haltestellenbereich', 'trottoir']) delete t.sections[0][k]
    expect(() => fallLesen(JSON.stringify(t))).not.toThrow()
  })
  it('bereits behobene Prüfungen bleiben: feldAuswahl «oops» und ungültiger Kandidat', () => {
    expect(() => fallLesen(datei({ feldAuswahl: 'oops' }))).toThrow(/Quellenwahl/)
    const t = JSON.parse(export1()); t.cands[0].len = -1
    expect(() => fallLesen(JSON.stringify(t))).toThrow()
  })
})

describe('VRC-04 · unbekannter Haltestellentyp erreicht keine Note', () => {
  it('Haltestellenbereich mit Typ einer anderen Stadt: keine Note statt 6', () => {
    const fremd = haltestellenTypen('basel').find(t => !haltestellenTypen('bern').includes(t))!
    const e = bewerteAbschnitt({ ...defaultSection(), richtung: 'eine', haltestellenbereich: true, oevAngebot: 'tram', speed: 50,
      routentyp: 'Velohauptroute', haltestellentyp: fremd }, 'bern')
    expect(e.note).toBeNull()
    expect(e.seiten[0].fehlt.join(' ')).toContain('ist hier nicht bekannt')
  })
  it('normaler Abschnitt: Typ, den die Stadt nicht kennt → keine Note; bekannter Typ → Note', () => {
    const s = { ...defaultSection(), richtung: 'eine' as const, dtv: 3000, speed: 30, ist: 'Radstreifen' as const, breite: 2.5, oevAngebot: 'tram' as const,
      routentyp: 'Velohauptroute' as const, haltestellentyp: 'Velobypass' as const, haltestelleBreite: 1.6 }
    expect(bewerteAbschnitt(s, 'bern').note).toBeNull()
    expect(bewerteAbschnitt(s, 'basel').note).toBeNull()   // Basel: ohne Strassenfunktion ohnehin offen
    expect(bewerteAbschnitt({ ...s, haltestellentyp: 'Inselhaltestelle', haltestelleBreite: 2.5 }, 'bern').note).toEqual(expect.any(Number))
  })
})
