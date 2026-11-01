import { describe, it, expect } from 'vitest'
import { routentypAusCode, dtvFromNtNn, zahlOderNull } from './bern'

describe('routentypAusCode — Veloroutennetz Masterplan (Feld Veloroutentyp)', () => {
  it('Codes 1–3 sind Velohauptrouten', () => {
    for (const c of [1, 2, 3]) expect(routentypAusCode(c)).toBe('Velohauptroute')
  })
  it('Codes 4–6 sind Velorouten', () => {
    for (const c of [4, 5, 6]) expect(routentypAusCode(c)).toBe('Veloroute')
  })
  it('auch als Text geliefert', () => expect(routentypAusCode('1')).toBe('Velohauptroute'))
  it('ohne Code oder unbekannt → kein Routentyp (die Linie stimmt nicht mit)', () => {
    expect(routentypAusCode(null)).toBeNull()
    expect(routentypAusCode(undefined)).toBeNull()
    expect(routentypAusCode('')).toBeNull()
    expect(routentypAusCode(0)).toBeNull()
    expect(routentypAusCode(7)).toBeNull()
  })
})

describe('Hilfen des Berner Adapters', () => {
  it('DTV aus Tag- und Nachtstunde', () => expect(dtvFromNtNn(198.1, 38.9)).toBe(3481))
  it('fehlende Werte bleiben fehlend, eine echte 0 bleibt 0', () => {
    expect(zahlOderNull(null)).toBeNull()
    expect(zahlOderNull('')).toBeNull()
    expect(zahlOderNull(0)).toBe(0)
  })
})

import { hierarchieKurz, tramInFahrbahn, TRAM_ABSCHNITT_M } from './bern'
describe('Strassenhierarchie (seit 01.11.2026): Werte des Dienstes in der Kurzform des lokalen Rechners', () => {
  it('Kurzformen und unveränderte Werte', () => {
    expect(hierarchieKurz('Quartierstrasse')).toBe('Quartierstrasse')
    expect(hierarchieKurz('Quartierstr. ergänzend (Anlief. / Priv.)')).toBe('Quartierstrasse ergänzend')
    expect(hierarchieKurz('nicht befahrbar (Fuss- / Aare- / Waldw.)')).toBe('nicht befahrbar')
    expect(hierarchieKurz('Basisnetz')).toBe('Basisnetz')
    expect([hierarchieKurz(null), hierarchieKurz('Null'), hierarchieKurz('')]).toEqual([null, null, null])
  })
})

describe('Tram in der Fahrbahn wie lokal (Verkehrsdaten Tram: parallel, 15 m, halbe Länge)', () => {
  const lat = 46.95, m = 1 / 111320, k = 1 / (111320 * Math.cos(lat * Math.PI / 180))
  const pt = (x: number, y: number) => ({ lat: lat + y * m, lon: 7.44 + x * k })
  const seg = Array.from({ length: 11 }, (_, i) => pt(i * 10, 0))      // 100 m West–Ost
  it('paralleles Gleis 12 m daneben über die ganze Länge: ja', () => expect(tramInFahrbahn(seg, [[pt(0, 12), pt(100, 12)]])).toBe(true))
  it('paralleles Gleis weiter als 15 m daneben: nein', () => expect(tramInFahrbahn(seg, [[pt(0, TRAM_ABSCHNITT_M + 3), pt(100, TRAM_ABSCHNITT_M + 3)]])).toBe(false))
  it('nur ein Drittel der Länge abgedeckt: nein', () => expect(tramInFahrbahn(seg, [[pt(0, 2), pt(30, 2)]])).toBe(false))
  it('quer einmündendes Gleis: nein, auch wenn es nah ist', () => expect(tramInFahrbahn(seg, [[pt(50, -40), pt(50, 40)]])).toBe(false))
})
