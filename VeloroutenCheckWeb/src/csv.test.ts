import { describe, it, expect } from 'vitest'
import { buildCsv, csvCell, numDE, parseZahl } from './csv'
import { defaultSection } from './strecke'
import { bewerteAbschnitt } from './bewertung'

describe('parseZahl — Eingabefelder', () => {
  it('Komma und Punkt als Dezimalzeichen', () => {
    expect(parseZahl('2,3')).toBe(2.3)
    expect(parseZahl('2.3')).toBe(2.3)
  })
  it('Schweizer Tausender-Trennzeichen werden überlesen', () => {
    expect(parseZahl("10'000")).toBe(10000)
    expect(parseZahl('10’000')).toBe(10000)
    expect(parseZahl('10 000')).toBe(10000)
  })
  it('der Punkt bleibt Dezimalzeichen', () => expect(parseZahl('2.500')).toBe(2.5))
  it('leer und unlesbar → NaN (nie still 0)', () => {
    expect(parseZahl('')).toBeNaN()
    expect(parseZahl('  ')).toBeNaN()
    expect(parseZahl('abc')).toBeNaN()
  })
  it('negativ wird auf 0 begrenzt', () => expect(parseZahl('-5')).toBe(0))
})

describe('csvCell', () => {
  it('maskiert Trennzeichen und Anführungszeichen', () => {
    expect(csvCell('a;b')).toBe('"a;b"')
    expect(csvCell('sagt "hallo"')).toBe('"sagt ""hallo"""')
  })
  it('Formel-Anfang wird zu Text', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
    expect(csvCell('+41 31 000')).toBe("'+41 31 000")
    expect(csvCell('@cmd')).toBe("'@cmd")
  })
  it('Zahlen und gewöhnlicher Text bleiben unberührt', () => {
    expect(csvCell('-1,5')).toBe('-1,5')
    expect(csvCell('4,5')).toBe('4,5')
    expect(csvCell('Thunstrasse · 120 m')).toBe('Thunstrasse · 120 m')
  })
})

describe('buildCsv', () => {
  const s = { ...defaultSection(), dtv: 3000, speed: 50, ist: 'Umweltspur' as const, breite: 4.5,
    oevTakt: 10, oevAngebot: 'bus_5_15' as const, haltestelleBreite: 1.6, label: '=böse' }
  const e = bewerteAbschnitt(s, 'bern')
  const zeilen = buildCsv([s], [e], e.note, 'bern', 'Bern', '2026-09-29').split('\r\n').map(z => z.split(';'))
  const [kopf, zeile, fuss] = zeilen

  it('alle Zeilen haben gleich viele Spalten', () => {
    expect(zeile).toHaveLength(kopf.length)
    expect(fuss).toHaveLength(kopf.length)
  })
  it('bestehende Spalten behalten ihre Position, die neuen stehen am Ende', () => {
    expect(kopf.indexOf('Stadt')).toBe(26)
    expect(kopf.indexOf('Abrufdatum')).toBe(27)
    expect(kopf.slice(28, 30)).toEqual(['ÖV-Takt [Min]', 'Breite Haltestelle [m]'])
  })
  it('ÖV-Takt und Haltestellenbreite stehen im Export', () => {
    expect(zeile[28]).toBe('10,0')
    expect(zeile[29]).toBe('1,60')
  })
  it('Strassenname mit Formel-Anfang ist entschärft', () => expect(zeile[1]).toBe("'=böse"))
  it('Umweltspur: kein Soll (rechnet ohne DTV/Tempo)', () =>
    expect(zeile[kopf.indexOf('Soll-Führungsform')]).toBe(''))
  it('numDE', () => {
    expect(numDE(4.5, 1)).toBe('4,5')
    expect(numDE(NaN)).toBe('')
  })
})

import { seiteA } from './strecke'
describe('buildCsv — Seiten', () => {
  const basis = { ...defaultSection(), dtv: 8000, speed: 50, routentyp: 'Velohauptroute' as const,
    ist: 'Radstreifen' as const, breite: 1.8, peilungA: 80, quelle: { ist: 'osm' as const, breite: 'osm' as const } }
  const zeilen = (s: typeof basis & { gegen?: unknown; richtung?: 'beide' | 'eine' }) => {
    const sec = s as Parameters<typeof bewerteAbschnitt>[0]
    const e = bewerteAbschnitt(sec, 'bern')
    const [kopf, zeile] = buildCsv([sec], [e], e.note, 'bern', 'Bern', '2026-10-14').split('\r\n').map(z => z.split(';'))
    return (name: string) => zeile[kopf.indexOf(name)]
  }
  it('abweichende Seite B in eigenen Spalten; «Note» ist die schlechtere Seite', () => {
    const wert = zeilen({ ...basis, gegen: { ...seiteA(basis), ist: 'Mischverkehr', breite: NaN, quelle: { ist: 'manuell' } } })
    expect(wert('Seiten')).toBe('beide')
    expect(wert('Fahrtrichtung Seite A')).toBe('Osten')
    expect(wert('Ist-Führungsform Seite B')).toBe('Mischverkehr')
    expect(wert('Ist-Quelle Seite B')).toBe('manuell')
    expect(wert('Breite Seite B [m]')).toBe('')
    expect(wert('Note')).toBe(wert('Note Seite B'))
    expect(Number(wert('Note Seite A').replace(',', '.'))).toBeGreaterThan(Number(wert('Note Seite B').replace(',', '.')))
  })
  it('Seite B wie A: Seite-B-Spalten tragen die Werte von A', () => {
    const wert = zeilen(basis)
    expect([wert('Ist-Führungsform Seite B'), wert('Ist-Quelle Seite B'), wert('Breite Seite B [m]')]).toEqual(['Radstreifen', 'OSM', '1,80'])
    expect(wert('Note Seite B')).toBe(wert('Note Seite A'))
  })
  it('nur eine Seite: Seite-B-Spalten leer', () => {
    const wert = zeilen({ ...basis, richtung: 'eine' })
    expect([wert('Seiten'), wert('Ist-Führungsform Seite B'), wert('Note Seite B')]).toEqual(['eine', '', ''])
  })
})

describe('buildCsv — Stand des OpenBikeSensor-Exports', () => {
  const obs = { median: 1.68, mean: 1.7, count: 5, below150: 2, usage: 3 }
  const s = { ...defaultSection(), ist: 'Mischverkehr' as const, dtv: 3000, speed: 30, obs }
  const e = bewerteAbschnitt(s, 'bern')
  const [kopf, zeile] = buildCsv([s], [e], e.note, 'bern', 'Bern', '2026-10-16', 'Juni 2026')
    .split('\r\n').map(z => z.split(';'))
  it('letzte Spalte trägt den Stand, wenn OBS-Werte vorliegen', () => {
    expect(kopf[kopf.length - 1]).toBe('OBS Stand')
    expect(zeile[kopf.length - 1]).toBe('Juni 2026')
  })
  it('ohne OBS-Werte bleibt die Spalte leer', () => {
    const t = { ...s, obs: undefined }
    const z = buildCsv([t], [bewerteAbschnitt(t, 'bern')], null, 'bern', 'Bern', '2026-10-16', 'Juni 2026').split('\r\n')[1].split(';')
    expect(z[z.length - 1]).toBe('')
  })
})
