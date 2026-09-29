import { describe, it, expect } from 'vitest'
import { buildCsv, csvCell, numDE, parseZahl } from './csv'
import { defaultSection } from './strecke'
import { fuehrungsformNote } from './fuehrungsform'

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
  const r = fuehrungsformNote(3000, 50, 'Umweltspur', 4.5, 'Velohauptroute', 'egal', 10)
  const zeilen = buildCsv([s], [r], r.note, 'bern', 'Bern', '2026-09-29').split('\r\n').map(z => z.split(';'))
  const [kopf, zeile, fuss] = zeilen

  it('alle Zeilen haben gleich viele Spalten', () => {
    expect(zeile).toHaveLength(kopf.length)
    expect(fuss).toHaveLength(kopf.length)
  })
  it('bestehende Spalten behalten ihre Position, die neuen stehen am Ende', () => {
    expect(kopf.indexOf('Stadt')).toBe(26)
    expect(kopf.indexOf('Abrufdatum')).toBe(27)
    expect(kopf.slice(28)).toEqual(['ÖV-Takt [Min]', 'Breite Haltestelle [m]'])
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
