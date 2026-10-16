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
