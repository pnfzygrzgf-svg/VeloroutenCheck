import { describe, it, expect } from 'vitest'
import { haltestellenbereichNote, haltestellenVeloBreite, HALTESTELLENBEREICH_NICHT_ERFUELLT } from './fuehrungsform'
import { bewerteAbschnitt } from './bewertung'
import { abschnittMitAufteilung, bilanz, haltestelleEinfuegen, haltUmfeld, pruefeTeil, startAufteilung, type Teil } from './aufteilung'
import { vorschlagRechnen, aufteilungAusVorschlag } from './vorschlag'
import { defaultSection, gegenVon, seiteA, type Section } from './strecke'

// Haltestellenbereich und Haltestellen in der Planung (Nutzerentscheide 20.10.2026, Masterplan HS 1–7)
describe('Haltestellenbereich: Note allein aus der Haltestelle (nur Bern)', () => {
  const n = (route: 'Velohauptroute' | 'Veloroute', oev: 'tram' | 'bus_unter5' | 'bus_5_15' | 'bus_ab15', typ: Parameters<typeof haltestellenbereichNote>[2],
    breite?: number, tram = false) => haltestellenbereichNote(route, oev, typ, breite, tram, 50).note
  it('separate Velofläche verlangt (Tram), Typ der Familie Mischverkehr: nicht erfüllt', () =>
    expect(n('Velohauptroute', 'tram', 'Fahrbahnhaltestelle Bus')).toBe(HALTESTELLENBEREICH_NICHT_ERFUELLT))
  it('erfüllt: Note 6, mit Abzug für eine zu schmale Velofläche', () => {
    expect(n('Velohauptroute', 'tram', 'Haltestelle mit Veloumfahrung', 1.8)).toBe(6)
    expect(n('Velohauptroute', 'tram', 'Haltestelle mit Veloumfahrung', 1.5)).toBeLessThan(6)
  })
  it('Kaphaltestelle an der Tramhaltestelle: Note 1', () => expect(n('Velohauptroute', 'tram', 'Kaphaltestelle', undefined, true)).toBe(1))
  it('Übergang mit Fahrbahnhaltestelle und Kaphaltestelle ohne Tram, wo zulässig: erfüllt, Note 6', () => {
    expect(n('Velohauptroute', 'bus_5_15', 'Fahrbahnhaltestelle Bus')).toBe(6)
    expect(n('Veloroute', 'bus_ab15', 'Kaphaltestelle')).toBe(6)
  })
  const s: Section = { ...defaultSection(), routentyp: 'Velohauptroute', ist: 'Mischverkehr', dtv: 3500, speed: 50, oevAngebot: 'tram', tram: true,
    haltestellentyp: 'Haltestelle mit Veloumfahrung', haltestelleBreite: 1.8, haltestellenbereich: true }
  it('im Abschnitt: Seite mit Haltestelle nach der Haltestelle, ohne Führungsform-Note', () => {
    expect(bewerteAbschnitt(s, 'bern').note).toBe(6)
    expect(bewerteAbschnitt({ ...s, haltestellenbereich: undefined }, 'bern').note).toBeLessThan(4)
  })
  it('Seite ohne Haltestelle zählt normal; fehlender Typ wird verlangt; ausser Bern ohne Wirkung', () => {
    const zwei: Section = { ...s, gegen: { ...gegenVon(s), ist: 'Mischverkehr', ohneHaltestelle: true, haltestellentyp: 'keine' } }
    expect(bewerteAbschnitt(zwei, 'bern').massgebend).toBe('B')
    expect(bewerteAbschnitt({ ...s, haltestellentyp: 'keine' }, 'bern').seiten[0].fehlt).toEqual(['Haltestellentyp'])
    expect(bewerteAbschnitt(s, 'zurich').seiten[0].bewertung?.haltestellenbereich).toBeUndefined()
  })
  it('HS 4 rückwärtiger Radweg: anzustreben 1,80, mindestens 1,60', () =>
    expect(haltestellenVeloBreite('bern', 'Haltestelle mit rückwärtigem Radweg', 'Velohauptroute')).toEqual({ soll: 1.8, min: 1.6 }))
})

describe('Haltestelle in der Planung', () => {
  const s: Section = { ...defaultSection(), routentyp: 'Velohauptroute', ist: 'Radstreifen', breite: 1.8, dtv: 6000, speed: 50, fahrbahnbreite: 9.6,
    oevAngebot: 'tram', tram: true, haltestellentyp: 'Kaphaltestelle', trottoir: { a: 3, b: 3 } }
  const a0 = startAufteilung(s, 'bern')
  it('HS 1 einfügen: Trottoir, Radweg, Abstand, Wartebereich; Typ der Seite; Führungsform bleibt', () => {
    const a = haltestelleEinfuegen(a0, 'A', 'Haltestelle mit Veloumfahrung', 'Velohauptroute')
    expect(a.teile.slice(-4).map(t => [t.art, t.breite])).toEqual([['Haltestelle', 3.1], ['HaltAbstand', 0.5], ['RadwegAbgesetzt', 1.8], ['Trottoir', 3]])
    const neu = abschnittMitAufteilung(s, a)
    expect([seiteA(neu).haltestellentyp, seiteA(neu).ist]).toEqual(['Haltestelle mit Veloumfahrung', 'Radstreifen'])
  })
  it('Prüfung neben der Haltestelle: Trottoir 2,50 (mind. 2,00), Abstand, Velofläche, Wartebereich ohne Wartehalle', () => {
    const a = haltestelleEinfuegen(a0, 'A', 'Haltestelle mit Veloumfahrung', 'Velohauptroute')
    const p = (i: number, t: Teil = a.teile[i]) => pruefeTeil(t, 'Velohauptroute', undefined, { stadt: 'bern', halt: haltUmfeld(a.teile, i, s, a) })
    const n = a.teile.length
    expect(p(n - 1)).toMatchObject({ soll: 2.5, min: 2.0, status: 'ok' })
    expect(p(n - 2)).toMatchObject({ soll: 1.8, min: 1.6 })
    expect(p(n - 3)).toMatchObject({ soll: 0.5, min: 0.3 })
    expect(p(n - 4, { art: 'Haltestelle', breite: 2.2, bild: 'ohneWartehalle' })).toMatchObject({ soll: 2.0, status: 'ok' })
    const k = haltestelleEinfuegen(a0, 'A', 'Kaphaltestelle mit Veloüberfahrt', 'Velohauptroute')
    expect(pruefeTeil(k.teile[k.teile.length - 4], 'Velohauptroute', undefined, { stadt: 'bern', halt: haltUmfeld(k.teile, k.teile.length - 4, s, k) }))
      .toMatchObject({ soll: 0.8, min: 0.5 })
  })
  it('HS 5 Inselhaltestelle: Fahrspur 3,50 neben der Insel ersetzt die äussere Spur der Seite', () => {
    const a = haltestelleEinfuegen(a0, 'B', 'Inselhaltestelle', 'Velohauptroute')
    expect(a.teile.slice(0, 5).map(t => t.art)).toEqual(['Trottoir', 'Velostreifen', 'Fahrspur', 'HaltAbstand', 'Haltestelle'])
    // ohne Tram ersetzt die Spur neben der Insel die äussere Fahrspur der Seite; mit Tram bleibt die Tramspur
    const ohne = startAufteilung({ ...s, tram: false, oevAngebot: 'bus_unter5' }, 'bern')
    const b = haltestelleEinfuegen(ohne, 'B', 'Inselhaltestelle', 'Velohauptroute')
    expect(b.teile.filter(t => t.art === 'Fahrspur').length).toBe(ohne.teile.filter(t => t.art === 'Fahrspur').length)
    expect(pruefeTeil(a.teile[2], 'Velohauptroute', undefined, { stadt: 'bern', halt: haltUmfeld(a.teile, 2, s, a) })).toMatchObject({ soll: 3.5, min: 3.0 })
  })
})

describe('Vorschlag Rang 5: Haltestelle umbauen (Veloumfahrung), mit Platzprüfung', () => {
  const g = { ...gegenVon(defaultSection()), ist: 'Radstreifen' as const, breite: 1.8, parkenRechts: 'nein' as const, haltestellentyp: 'keine' as const, ohneHaltestelle: true }
  const s = (trA: number): Section => ({ ...defaultSection(), routentyp: 'Velohauptroute', dtv: 8000, speed: 50, ist: 'Radstreifen', breite: 1.8,
    fahrbahnbreite: 9.6, parkenRechts: 'nein', oevAngebot: 'tram', tram: true, haltestellentyp: 'Kaphaltestelle', gegen: g, trottoir: { a: trA, b: 2.5 } })
  it('genug Platz: Rang 5, die Planung zeigt HS 1 auf der Seite und geht auf', () => {
    const v = vorschlagRechnen(s(6), 9.6)
    expect([v.rang, v.text]).toEqual([5, 'Haltestelle Seite A umbauen (separate Velofläche)'])
    expect(v.vermerk).toContain('Tramhaltestelle')
    const a = aufteilungAusVorschlag(s(6), startAufteilung(s(6)), v, null)!
    expect(a.teile.slice(-4).map(t => t.art)).toEqual(['Haltestelle', 'HaltAbstand', 'RadwegAbgesetzt', 'Trottoir'])
    expect(a.haltestellentyp?.A).toBe('Haltestelle mit Veloumfahrung')
    expect(bilanz(a).rest).toBeCloseTo(0, 6)
  })
  it('zu wenig Platz (unter 7,00 m ausserhalb der Haltekante): kein Umbau', () =>
    expect(vorschlagRechnen(s(3.5), 9.6).rang).not.toBe(5))
})

describe('Vorschlag im Haltestellenbereich (Nutzerbefund Muristrasse 20.10.2026)', () => {
  const g = { ...gegenVon(defaultSection()), ist: 'Mischverkehr' as const, breite: NaN, parkenRechts: 'nein' as const, haltestellentyp: 'keine' as const, ohneHaltestelle: true }
  const s: Section = { ...defaultSection(), routentyp: 'Velohauptroute', dtv: 8000, speed: 50, ist: 'Radstreifen', breite: 1.54, fahrbahnbreite: 8.6,
    parkenRechts: 'nein', oevAngebot: 'tram', tram: true, haltestellentyp: 'Kaphaltestelle', gegen: g, haltestellenbereich: true }
  it('auf der Seite mit Haltestelle keine Markierung, kein Kern, kein Radweg; nur der Umbau', () => {
    const v = vorschlagRechnen(s, 8.6)
    for (const t of [v.text, ...v.alternativen.map(a => a.text)]) {
      expect(t).not.toMatch(/beidseitig|Seite A [0-9]|Kernfahrbahn/)
      if (/Seite A/.test(t)) expect(t).toMatch(/^(Tempo 30 \+ )?Haltestelle Seite A umbauen/)
    }
  })
  it('Trottoir unbekannt: der Umbau nimmt den Platz aus der Fahrbahn, nichts entsteht aus dem Nichts', () => {
    const v = vorschlagRechnen(s, 8.6)
    const alle = [v, ...v.alternativen.map(a => ({ ...v, text: a.text, noteNach: a.noteNach, k: a.k }))]
    const u = alle.find(x => x.k?.hsUmbau?.includes('A'))
    if (!u) return
    const a = aufteilungAusVorschlag(s, startAufteilung(s), u, null)!
    expect(bilanz(a).rest).toBeCloseTo(0, 6)
    expect(a.teile.reduce((m, t) => m + t.breite, 0)).toBeCloseTo(8.6, 6)
  })
})
