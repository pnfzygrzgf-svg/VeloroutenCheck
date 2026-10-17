import { describe, it, expect } from 'vitest'
import { vorschlagRechnen, aufteilungAusVorschlag, trottoirAnpassung, fahrbahnMitRandstein, ZIEL } from './vorschlag'
import { bewerteAufteilung, bilanz, startAufteilung, type Aufteilung } from './aufteilung'
import { defaultSection, gegenVon, type Section } from './strecke'

// Massnahmenvorschlag (Bern), Portierung des lokalen Zielbild-Rechners; abgeglichen am 17.10.2026
const abschnitt = (x: Partial<Section>): Section => ({ ...defaultSection(), routentyp: 'Veloroute', ...x })
const planNote = (s: Section, a: Aufteilung) => bewerteAufteilung(s, a, 'bern').note

describe('vorschlagRechnen', () => {
  it('Note schon erreicht: keine Massnahme', () => {
    const v = vorschlagRechnen(abschnitt({ dtv: 1500, speed: 30, ist: 'Mischverkehr', fahrbahnbreite: 6 }))
    expect(v).toMatchObject({ erreicht: true, rang: 0 })
  })
  it('Parkierung beidseitig, zu schmal für Radstreifen: eine Reihe weg + Kernfahrbahn', () => {
    const s = abschnitt({ dtv: 6000, speed: 50, ist: 'Mischverkehr', parkenRechts: 'ja', fahrbahnbreite: 11 })
    const v = vorschlagRechnen(s)
    expect(v.rang).toBe(3)
    expect(v.text).toMatch(/^Parkierung Seite [AB] aufheben \+ Radstreifen markieren beidseitig 1,80 m als Kernfahrbahn \(Kern 4,70 m\)/)
    expect(v.noteNach).toBeGreaterThanOrEqual(ZIEL)
    const a = aufteilungAusVorschlag(s, startAufteilung(s), v, null)!
    expect(a.teile.filter(t => t.art === 'Parkierung')).toHaveLength(1)
    expect(a.teile.find(t => t.art === 'Kernfahrbahn')?.breite).toBe(4.7)
    expect(planNote(s, a)).toBe(v.noteNach)
    expect(bilanz(a).fahrbahnSumme).toBeLessThanOrEqual(11 + 1e-9)
  })
  it('Kernfahrbahn nur mit belegtem DTV (nicht bei «≤ 2000 angenommen»)', () => {
    const s = abschnitt({ dtvGeprueft: true, speed: 50, ist: 'Mischverkehr', fahrbahnbreite: 8, routentyp: 'Velohauptroute' })
    expect(vorschlagRechnen(s).text).not.toMatch(/Kernfahrbahn/)
  })
  it('Tempo 30 nur, wenn sonst nichts reicht; die Planung trägt das Tempo', () => {
    const s = abschnitt({ dtv: 1500, speed: 50, ist: 'Mischverkehr', fahrbahnbreite: 6 })
    const v = vorschlagRechnen(s)
    expect(v.rang).toBe(7)
    expect(v.text.startsWith('Tempo 30')).toBe(true)
    const a = aufteilungAusVorschlag(s, startAufteilung(s), v, null)!
    expect(a.tempo).toBe(30)
    expect(planNote(s, a)).toBe(v.noteNach)
  })
  it('ohne Breite eines Radstreifens keine Note: Grund nennen', () => {
    const v = vorschlagRechnen(abschnitt({ dtv: 6000, speed: 50, ist: 'Radstreifen', fahrbahnbreite: 10 }))
    expect(v.blocker).toMatch(/^Note von heute fehlt/)
  })
})

describe('Randsteinanpassung', () => {
  const s = abschnitt({ dtv: 8000, speed: 50, ist: 'Mischverkehr', fahrbahnbreite: 8.5, routentyp: 'Velohauptroute',
    trottoir: { a: 4.5, b: 4.5 } })
  const a0: Aufteilung = { ...startAufteilung(s), fussnetz: 'basis' }
  it('Trottoirs gegen die Vorgabe des Fussverkehrsnetzes', () => {
    expect(trottoirAnpassung(s, a0)).toMatchObject({ vorgabe: 2.5, frei: { A: 2, B: 2 }, fehlt: { A: 0, B: 0 } })
    expect(trottoirAnpassung(s, { ...a0, fussnetz: undefined })).toBeNull()
  })
  it('breitere Trottoirs: nur so viel schmaler wie nötig, nie unter die Vorgabe', () => {
    const ta = trottoirAnpassung(s, a0)!
    const v = vorschlagRechnen(s, fahrbahnMitRandstein(8.5, ta))
    expect(v.rang).toBe(1)
    expect(v.text).toBe('Radstreifen markieren beidseitig 2,50 m')
    const a = aufteilungAusVorschlag(s, a0, v, ta)!
    expect(a.teile.filter(t => t.art === 'Trottoir').map(t => t.breite)).toEqual([3.25, 3.25])
    expect(Math.abs(bilanz({ ...a, seitenraum: 9 }).rest)).toBeLessThan(0.051)
    expect(planNote(s, a)).toBe(v.noteNach)
    expect(a.vorschlag).toMatch(/mit Randsteinanpassung/)
  })
  it('ohne Randsteinanpassung bleibt es beim Rang dahinter', () => {
    expect(vorschlagRechnen(s).rang ?? 9).toBeGreaterThan(1)
  })
  it('schmalere Trottoirs kommen auf die Vorgabe, zulasten der Fahrbahn (Nutzerbefund Kirchenfeldstrasse)', () => {
    const s2 = abschnitt({ dtv: 1500, speed: 30, ist: 'Mischverkehr', fahrbahnbreite: 9, trottoir: { a: 1.8, b: 2.2 } })
    const a2: Aufteilung = { ...startAufteilung(s2), fussnetz: 'basis' }
    const ta = trottoirAnpassung(s2, a2)!
    expect(ta.fehlt).toEqual({ A: 0.7, B: 0.3 })
    expect(fahrbahnMitRandstein(9, ta)).toBe(8)
  })
  it('Bilanz geht auf: Trottoirs auf 5 cm wie der Seitenraum (Nutzerbefund Jungfraustrasse, 0,01 m Fehlmass)', () => {
    const s3 = abschnitt({ dtv: 6000, speed: 50, ist: 'Mischverkehr', parkenRechts: 'ja', fahrbahnbreite: 11, trottoir: { a: 3.02, b: 3.04 } })
    const v = vorschlagRechnen(s3)
    const a = aufteilungAusVorschlag(s3, startAufteilung(s3), v, null)!
    expect(bilanz(a).rest).toBeGreaterThanOrEqual(-0.001)
  })
})

describe('Einbahn', () => {
  it('Ausgangslage: links kein Velostreifen, Parkierung links nur nach den Parkfeldern', () => {
    const s = abschnitt({ richtung: 'eine', ist: 'Radstreifen', breite: 1.5, parkenRechts: 'ja', fahrbahnbreite: 8 })
    expect(startAufteilung(s).teile.map(t => t.art)).toEqual(['Fahrspur', 'Velostreifen', 'Parkierung'])
    expect(startAufteilung({ ...s, parkAnteil: { a: 1, b: 0.8 } }).teile.map(t => t.art))
      .toEqual(['Parkierung', 'Fahrspur', 'Velostreifen', 'Parkierung'])
  })
  it('Gegenrichtung als Seite B bleibt unberührt', () => {
    const s = abschnitt({ ist: 'Radstreifen', breite: 1.8, fahrbahnbreite: 8, gegen: { ...gegenVon(defaultSection()), ist: 'Mischverkehr' } })
    expect(startAufteilung(s).teile.map(t => t.art)).toEqual(['Fahrspur', 'Fahrspur', 'Velostreifen'])
  })
})

describe('ohne Lösung', () => {
  it('Fahrbahn zu schmal: fehlende Meter für die knappste Veloanlage', () => {
    const v = vorschlagRechnen(abschnitt({ dtv: 3000, speed: 50, ist: 'Mischverkehr', fahrbahnbreite: 6 }))
    expect(v.erreicht).toBe(false)
    expect(v.blocker).toBe('Fahrbahn zu schmal: auch ohne Parkierung fehlen 1,50 m für einen Radstreifen (6,0 von 7,50 m)')
  })
})
