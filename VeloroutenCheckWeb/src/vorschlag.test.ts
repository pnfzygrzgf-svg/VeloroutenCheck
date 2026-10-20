import { describe, it, expect } from 'vitest'
import { vorschlagRechnen, aufteilungAusVorschlag, trottoirAnpassung, fahrbahnMitRandstein, ZIEL } from './vorschlag'
import { bewerteAufteilung, bilanz, pruefeTeil, startAufteilung, teilName, type Aufteilung } from './aufteilung'
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
  it('ohne Ist-Breite trotzdem ein Vorschlag, die Breite als angenommen vermerkt (Nutzerentscheid 20.10.2026)', () => {
    const v = vorschlagRechnen(abschnitt({ dtv: 6000, speed: 50, ist: 'Radstreifen', fahrbahnbreite: 10 }))
    expect(v.blocker).toBe('')
    expect(v.vermerk).toMatch(/^Ist nicht vollständig erfasst: Breite Seite A \(Radstreifen\) mit der Vorgabe 1,80 m angenommen/)
    expect(v.erreicht).not.toBeNull()
  })
  it('Alternativen tragen ihre Eingaben zum Übernehmen', () => {
    const s = abschnitt({ dtv: 6000, speed: 50, ist: 'Mischverkehr', parkenRechts: 'ja', fahrbahnbreite: 11 })
    const v = vorschlagRechnen(s)
    for (const alt of v.alternativen) {
      const a = aufteilungAusVorschlag(s, startAufteilung(s), { ...v, text: alt.text, noteNach: alt.noteNach, k: alt.k }, null)!
      expect(planNote(s, a)).toBe(alt.noteNach)
    }
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

describe('Wege ohne Fahrbahn (Nutzerbefund Familienspaziergang, 20.10.2026)', () => {
  const weg = (x: Partial<Section>) => abschnitt({ ist: 'Fussweg Velo gestattet', ohneFahrbahn: true, ...x })
  it('Ausgangslage: nur der Weg, mit der gemessenen Breite', () => {
    const a = startAufteilung(weg({ fahrbahnbreite: 2.8 }))
    expect(a.teile).toEqual([{ art: 'FusswegVelo', breite: 2.8 }])
    expect(a.fahrbahn).toBe(0)
  })
  it('kein «Velo in die Fahrbahn»; zu schmal: verbreitern, Trennen als Alternative', () => {
    const s = weg({ fahrbahnbreite: 2.8, dtv: 1000, speed: 30 })
    const v = vorschlagRechnen(s)
    expect(v.text).toBe('Fuss-/Radweg auf 3,50 m verbreitern (Q 11)')
    expect(v.vermerk).toMatch(/Platz neben dem Weg nicht geprüft/)
    expect(v.alternativen.map(x => x.text)).toEqual(['Fuss- und Veloverkehr trennen: Zweirichtungsradweg 3,20 m + Fussweg 2,00 m'])
    const a = aufteilungAusVorschlag(s, startAufteilung(s), v, null)!
    expect(a.teile).toEqual([{ art: 'FussRadweg', breite: 3.5 }])
    expect(planNote(s, a)).toBe(v.noteNach)
  })
  it('breit genug: als Fuss-/Radweg signalisieren (Rang 1)', () => {
    const v = vorschlagRechnen(weg({ fahrbahnbreite: 3.6, dtv: 1000, speed: 30 }))
    expect(v).toMatchObject({ rang: 1, text: 'Als Fuss-/Radweg signalisieren (Q 11)' })
  })
  it('ohne DTV und Tempo: ohne Motorfahrzeugverkehr gerechnet', () => {
    const v = vorschlagRechnen(weg({ fahrbahnbreite: 2.8 }))
    expect(v.erreicht).toBe(true)
    expect(v.vermerk).toMatch(/ohne Motorfahrzeugverkehr/)
  })
  it('getrennt: Zweirichtungsradweg und Fussweg nebeneinander', () => {
    const s = weg({ fahrbahnbreite: 2.8, dtv: 1000, speed: 30 })
    const v = vorschlagRechnen(s), alt = v.alternativen[0]
    const a = aufteilungAusVorschlag(s, startAufteilung(s), { ...v, text: alt.text, noteNach: alt.noteNach, k: alt.k }, null)!
    expect(a.teile.map(t => t.art)).toEqual(['Zweirichtungsradweg', 'Trottoir'])
    expect(planNote(s, a)).toBe(alt.noteNach)
  })
})

describe('Schräg- und Querparkierung (Nutzerbefund Egghölzlistrasse, 20.10.2026)', () => {
  const s = abschnitt({ dtv: 6000, speed: 50, ist: 'Mischverkehr', parkenRechts: 'ja', fahrbahnbreite: 16,
    parkTiefe: { a: { tiefe: 5.05, art: 'tief' }, b: { tiefe: 5.25, art: 'tief' } } })
  it('Ausgangslage mit der gemessenen Tiefe, ohne Längs-Vorgabe', () => {
    const p = startAufteilung(s).teile.filter(t => t.art === 'Parkierung')
    expect(p.map(t => [t.breite, t.parkart])).toEqual([[5.25, 'tief'], [5.05, 'tief']])
    expect(teilName(p[0])).toBe('Schräg- oder Senkrechtparkierung (Autos)')
    expect(pruefeTeil(p[0], 'Veloroute').status).toBe('keine Vorgabe')
  })
  it('der Vorschlag rechnet mit der Tiefe', () => {
    const v = vorschlagRechnen(s)
    const a = aufteilungAusVorschlag(s, startAufteilung(s), v, null)!
    expect(bilanz(a).fahrbahnSumme).toBeLessThanOrEqual(16 + 1e-9)
    expect(planNote(s, a)).toBe(v.noteNach)
  })
})

describe('Mittelinsel in Ausgangslage und Vorschlag', () => {
  const s = abschnitt({ dtv: 6000, speed: 50, ist: 'Mischverkehr', fahrbahnbreite: 9, routentyp: 'Velohauptroute',
    mittelinsel: { breite: 2, laenge: 8, fahrbahn: 12, anzahl: 1 } })
  it('Ausgangslage: Spuren beidseits der Insel, Fahrbahn samt Insel', () => {
    const a = startAufteilung(s)
    expect(a.fahrbahn).toBe(12)
    expect(a.teile).toEqual([{ art: 'Fahrspur', breite: 5 }, { art: 'Mittelinsel', breite: 2 }, { art: 'Fahrspur', breite: 5 }])
  })
  it('Vorschlag: keine Kernfahrbahn, die Insel bleibt in der Planung', () => {
    const v = vorschlagRechnen(s, 12)
    expect(v.text).not.toMatch(/Kernfahrbahn/)
    const a = aufteilungAusVorschlag(s, startAufteilung(s), v, null)
    if (a) {
      expect(a.teile.some(t => t.art === 'Mittelinsel')).toBe(true)
      expect(bilanz(a).fahrbahnSumme).toBeLessThanOrEqual(12 + 1e-9)
      expect(planNote(s, a)).toBe(v.noteNach)
    }
  })
})

describe('Vorschlag mit versetzter Parkierung (abwechselnd Seite A und B, seit 20.10.2026)', () => {
  const s = abschnitt({ dtv: 3000, speed: 50, ist: 'Mischverkehr', fahrbahnbreite: 10.55, routentyp: 'Velohauptroute', parkenRechts: 'ja',
    parkTiefe: { a: { tiefe: 5.25, art: 'schraeg', winkel: 60 } }, parkVersetzt: 'b',
    gegen: { ...gegenVon(defaultSection()), ist: 'Mischverkehr', parkenRechts: 'ja' } })
  it('die versetzte Seite braucht keinen Platz; die Planung behält sie als versetzt', () => {
    const v = vorschlagRechnen(s)
    expect(v.k?.parkVersetzt).toBe('B')
    const a = aufteilungAusVorschlag(s, startAufteilung(s), v, null)
    if (!a) return
    expect(bilanz(a).rest).toBeGreaterThanOrEqual(-0.005)
    const parkB = a.teile.filter(t => t.art === 'Parkierung' && t.versetzt)
    expect(parkB.length).toBeLessThanOrEqual(1)
  })
})

describe('Vorschlag in Zürich, Basel und Luzern (seit 20.10.2026): dieselbe Rangfolge, Note und Masse der Stadt', () => {
  const s = abschnitt({ dtv: 6000, speed: 50, ist: 'Mischverkehr', fahrbahnbreite: 11, routentyp: 'Velohauptroute', parkenRechts: 'nein' })
  it('Zürich: Radstreifen nach den Velostandards, Kern ohne Obergrenze, ohne Pilot, Ersatz Bern im Vermerk', async () => {
    const { BREITEN_ZUERICH } = await import('./fuehrungsform')
    const v = vorschlagRechnen(s, 11, 'zurich', BREITEN_ZUERICH)
    expect(v.text).toBe('Radstreifen markieren beidseitig 2,50 m')
    expect(v.alternative).toContain('Kern 6,00 m')
    expect(v.vermerk).toContain('Masse nach Velostandards Stadt Zürich; Ersatz Bern')
    expect(v.vermerk).toContain('Fahrstreifen')
    const eng = vorschlagRechnen(abschnitt({ ...s, fahrbahnbreite: 9, parkenRechts: 'ja' }), 9, 'zurich', BREITEN_ZUERICH)
    expect([eng.text, eng.alternative].join(' ')).not.toContain('Pilot')
  })
  it('Basel: Velostrasse auf der siedlungsorientierten Velohauptroute, ohne Hinweis auf die Berner Querschnittsblätter', async () => {
    const { BREITEN_BASEL } = await import('./fuehrungsform')
    const b = abschnitt({ dtv: 1500, speed: 30, ist: 'Mischverkehr', fahrbahnbreite: 7.5, routentyp: 'Velohauptroute', parkenRechts: 'ja',
      strassentyp: 'siedlungsorientiert', gegen: { ...gegenVon(defaultSection()), ist: 'Mischverkehr', parkenRechts: 'ja' } })
    const v = vorschlagRechnen(b, 7.5, 'basel', BREITEN_BASEL)
    expect(v.text).toBe('Parkierung Seite A aufheben + Velostrasse signalisieren')
  })
  it('Bern unverändert mit Q-Hinweis', () => {
    const b = abschnitt({ dtv: 1500, speed: 30, ist: 'Mischverkehr', fahrbahnbreite: 6, routentyp: 'Velohauptroute', parkenRechts: 'nein' })
    const v = vorschlagRechnen(b, 6)
    if (v.rang === 4) expect(v.text).toContain('(Q 9)')
    expect(v.vermerk).not.toContain('Ersatz Bern')
  })
})
