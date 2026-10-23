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

import { haltestelleninsel, haltestellenperron, mittelinsel, mittelstreifen } from './breitenmessung'
import { haltestelleninselUebernehmen, startAufteilung as start } from './aufteilung'
import { seiteB } from './strecke'
import type { AvFlaeche } from './av'
import type { P } from './lv95'
describe('Haltestelleninsel statt Mittelinsel (Monbijoustrasse, 21.10.2026)', () => {
  const r = (e0: number, n0: number, e1: number, n1: number): P[] => [[e0, n0], [e1, n0], [e1, n1], [e0, n1], [e0, n0]]
  // Achse nach Osten in der Mitte der Fahrbahn; Norden = links = Seite B: Fahrbahn 7,80 · Insel 2,20 · Streifen 1,70 · Trottoir 3,00
  const av: AvFlaeche[] = [
    { art: 'Strasse_Weg', ringe: [r(0, -3.9, 100, 7.8), r(20, 3.9, 80, 6.1)] },
    { art: 'Verkehrsinsel', ringe: [r(20, 3.9, 80, 6.1)] },
    { art: 'Trottoir', ringe: [r(0, 7.8, 100, 10.8)] },
    { art: 'Trottoir', ringe: [r(0, -5.9, 100, -3.9)] },
  ]
  const achse: P[] = [[0, 0], [100, 0]]
  it('Messung: Seite, Insel, Streifen, Fahrbahn bis zur Insel, Trottoir dahinter', () => {
    expect(haltestelleninsel([achse], av)).toEqual({ seite: 'links', insel: 2.2, aussen: 1.7, innen: 7.8, trottoir: 3, laenge: 60 })
    expect(mittelinsel([achse], av)).toBeNull()            // 60 m lang: keine Mittelinsel (bis 30 m), ohne Haltestelle ein Mittelstreifen
    expect(mittelstreifen([achse], av)?.laenge).toBe(60)
  })
  it('eine Schutzinsel in der Fahrbahn (Schwarzenburgstrasse, 21.10.2026) verfälscht die Fahrbahn bis zur Insel nicht', () => {
    // Schutzinsel 2 × 8 m auf der Höhe der Inselmitte, mitten in der Fahrbahn
    const mit: AvFlaeche[] = [{ art: 'Strasse_Weg', ringe: [r(0, -3.9, 100, 7.8), r(20, 3.9, 80, 6.1), r(46, 0, 54, 2)] },
      { art: 'Verkehrsinsel', ringe: [r(20, 3.9, 80, 6.1)] }, { art: 'Verkehrsinsel', ringe: [r(46, 0, 54, 2)] }, ...av.slice(2)]
    expect(haltestelleninsel([achse], mit)?.innen).toBe(7.8)
  })
  it('übernommen: Fahrbahn bis zur Insel, Typen angenommen, Ausgangslage mit Veloumfahrung und Wartebereich', () => {
    const s: Section = { ...defaultSection(), ist: 'Mischverkehr', parkenRechts: 'nein', oevAngebot: 'tram', tram: true, fahrbahnbreite: 11.7 }
    const neu = haltestelleninselUebernehmen(s, haltestelleninsel([achse], av)!, 'bern', true)
    expect([neu.fahrbahnbreite, neu.mittelinsel, neu.trottoir?.b]).toEqual([7.8, null, 3])
    expect([seiteA(neu).haltestellentyp, seiteB(neu).haltestellentyp, seiteB(neu).haltestelleBreite]).toEqual(['Kaphaltestelle', 'Haltestelle mit Veloumfahrung', 1.7])
    expect(neu.hsTypAngenommen).toEqual({ a: true, b: true })
    const a = start(neu, 'bern')
    // Insel 2,20 < 3,10: nur Ein- und Ausstieg, der Wartebereich mit Häuschen liegt hinter der Veloumfahrung (Nutzerbefund 21.10.2026)
    expect(a.teile.slice(0, 3).map(t => [t.art, t.breite])).toEqual([['Haltestelle', 3], ['RadwegAbgesetzt', 1.7], ['HaltEinstieg', 2.2]])
    // gegenüber die Kaphaltestelle: das Trottoir an der Haltestelle ist der Wartebereich
    const mitA = start({ ...neu, trottoir: { ...neu.trottoir!, a: 2 } }, 'bern')
    expect(mitA.teile[mitA.teile.length - 1]).toEqual({ art: 'Haltestelle', breite: 2 })
    expect(a.fahrbahn).toBe(7.8)
    expect(bilanz(a).rest).toBeCloseTo(0, 6)
  })
  it('ohne Haltestelle im Abschnitt: nichts übernommen', () => {
    const s: Section = { ...defaultSection(), ist: 'Mischverkehr' }
    expect(haltestelleninselUebernehmen(s, haltestelleninsel([achse], av)!, 'bern', true)).toBe(s)
  })
})

import { wartehalleLage } from './breitenmessung'
describe('Wartehalle aus OSM (Monbijoustrasse 21.10.2026)', () => {
  const r = (e0: number, n0: number, e1: number, n1: number): P[] => [[e0, n0], [e1, n0], [e1, n1], [e0, n1], [e0, n0]]
  const av: AvFlaeche[] = [
    { art: 'Strasse_Weg', ringe: [r(0, -3.9, 100, 7.8), r(20, 3.9, 80, 6.6)] },
    { art: 'Verkehrsinsel', ringe: [r(20, 3.9, 80, 6.6)] },
    { art: 'Trottoir', ringe: [r(0, 7.8, 100, 10.8)] },
  ]
  const achse: P[] = [[0, 0], [100, 0]]
  it('Wartehalle auf der Insel, hinten oder Perron ohne', () => {
    expect(wartehalleLage([achse], av, 'links', [{ p: [50, 5], wartehalle: true }])).toBe('insel')
    expect(wartehalleLage([achse], av, 'links', [{ p: [50, 9], wartehalle: true }])).toBe('hinten')
    expect(wartehalleLage([achse], av, 'links', [{ p: [50, 5], wartehalle: false }, { p: [50, -6], wartehalle: true }])).toBe('keine')
    expect(wartehalleLage([achse], av, 'links', [])).toBeUndefined()
  })
  it('Insel 2,70 m mit Wartehalle (OSM): Insel ist der Wartebereich, dahinter Trottoir; ohne Angabe ab 2,50 m ebenso', () => {
    const s: Section = { ...defaultSection(), ist: 'Mischverkehr', parkenRechts: 'nein', oevAngebot: 'tram', tram: true, fahrbahnbreite: 7.8,
      trottoir: { a: NaN, b: 3 } }
    const mit = start({ ...s, haltestelleninsel: { seite: 'b', insel: 2.7, aussen: 1.2, innen: 7.8, trottoir: 3, laenge: 60, wartehalle: 'insel' } }, 'bern')
    expect(mit.teile.slice(0, 3).map(t => [t.art, t.bild])).toEqual([['Trottoir', undefined], ['RadwegAbgesetzt', undefined], ['Haltestelle', undefined]])
    const ohne = start({ ...s, haltestelleninsel: { seite: 'b', insel: 2.7, aussen: 1.2, innen: 7.8, trottoir: 3, laenge: 60, wartehalle: 'keine' } }, 'bern')
    expect(ohne.teile.slice(0, 3).map(t => t.art)).toEqual(['Haltestelle', 'RadwegAbgesetzt', 'HaltEinstieg'])
    const unbekannt = start({ ...s, haltestelleninsel: { seite: 'b', insel: 2.7, aussen: 1.2, innen: 7.8, trottoir: 3, laenge: 60 } }, 'bern')
    expect(unbekannt.teile[2].art).toBe('Haltestelle')
  })
})

describe('Perron als breites Trottoir zwischen zwei Strassen (Helvetiaplatz, 23.10.2026)', () => {
  const r = (e0: number, n0: number, e1: number, n1: number): P[] => [[e0, n0], [e1, n0], [e1, n1], [e0, n1], [e0, n0]]
  // Achse nach Osten in der Einbahn-Fahrbahn 7,50; Norden = links = Seite B: Perron 10,00 als Trottoir (60 m lang),
  // dahinter die zweite Strasse 9,50 (Tramtrassee); Süden Trottoir 2,00
  const av: AvFlaeche[] = [
    { art: 'Strasse_Weg', ringe: [r(0, -3.75, 100, 3.75)] },
    { art: 'Trottoir', ringe: [r(20, 3.75, 80, 13.75)] },
    { art: 'Strasse_Weg', ringe: [r(0, 13.75, 100, 23.25)] },
    { art: 'Trottoir', ringe: [r(0, -5.75, 100, -3.75)] },
  ]
  const achse: P[] = [[0, 0], [100, 0]]
  it('nur mit Wartehalle bzw. Perron aus OSM auf der Fläche; Breite, Fahrbahn bis zum Perron, Strasse dahinter', () => {
    expect(haltestelleninsel([achse], av)).toBeNull()                       // keine Verkehrsinsel
    expect(haltestellenperron([achse], av, undefined, [])).toBeNull()        // ohne OSM-Punkt: ein Platz, kein Perron
    expect(haltestellenperron([achse], av, undefined, [[50, 8]])).toEqual({ seite: 'links', insel: 10, aussen: 9.5, innen: 7.5, trottoir: null, laenge: 60,
      perron: true, wartehalle: 'insel' })
    expect(haltestellenperron([achse], av, undefined, [[50, -4.5]])).toBeNull()   // Punkt auf dem Trottoir gegenüber: dahinter keine Strasse
  })
  it('breiter als 12 m: kein Perron', () => {
    const breit: AvFlaeche[] = [av[0], { art: 'Trottoir', ringe: [r(20, 3.75, 80, 17.75)] }, { art: 'Strasse_Weg', ringe: [r(0, 17.75, 100, 27)] }, av[3]]
    expect(haltestellenperron([achse], breit, undefined, [[50, 8]])).toBeNull()
  })
  it('Einbahn mit ÖV im Gegenverkehr: Perron auf der Seite B in der Ausgangslage, ohne Fahrspur dahinter; Seite A ohne Typ', () => {
    const s: Section = { ...defaultSection(), richtung: 'eine', ist: 'Mischverkehr', parkenRechts: 'nein', oevAngebot: 'tram', tram: true, oevGegen: true,
      trottoir: { a: 2, b: NaN } }
    const neu = haltestelleninselUebernehmen(s, haltestellenperron([achse], av, undefined, [[50, 8]])!, 'bern', true)
    expect(neu.fahrbahnbreite).toBe(7.5)
    expect(neu.haltestelleninsel?.perron).toBe(true)
    expect(seiteA(neu).haltestellentyp).toBe('keine')            // Perron liegt auf der Seite B; die Einbahn bewertet nur A
    const a = start(neu)
    expect(a.teile.map(t => `${t.art} ${t.breite}`)).toEqual(['Haltestelle 10', 'Tram 3.75', 'Tram 3.75', 'Trottoir 2'])
    expect(a.fahrbahn).toBe(7.5)
  })
  it('Perron auf der Seite A der Einbahn: Inselhaltestelle angenommen', () => {
    const gespiegelt: AvFlaeche[] = av.map(f => ({ ...f, ringe: f.ringe.map(rg => rg.map(([e, n]) => [e, -n] as P)) }))
    const s: Section = { ...defaultSection(), richtung: 'eine', ist: 'Mischverkehr', parkenRechts: 'nein', oevAngebot: 'tram', tram: true }
    const neu = haltestelleninselUebernehmen(s, haltestellenperron([achse], gespiegelt, undefined, [[50, -8]])!, 'bern', true)
    expect(neu.haltestelleninsel?.seite).toBe('a')
    expect(seiteA(neu).haltestellentyp).toBe('Inselhaltestelle')
    expect(neu.hsTypAngenommen?.a).toBe(true)
  })
})
