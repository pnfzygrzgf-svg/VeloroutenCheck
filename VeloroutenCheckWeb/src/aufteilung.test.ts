import { describe, it, expect } from 'vitest'
import {
  bilanz, bilanzText, seitenraumVon, bildVon, BILDER, lichtraum, linksDerMitte, markierungenFuer, mitTrottoirs, richtungenFuer, richtungVon, FUSSNETZ, pruefeTeil, pruefeKernfahrbahn, standardBreite, LICHTRAUM_QUELLE, formJeSeite, abschnittMitAufteilung, bewerteAufteilung, startAufteilung, auf5cm, type Teil,
} from './aufteilung'
import { defaultSection, gegenVon, seiteA, tauscheSeiten, type Section } from './strecke'
import { bewerteAbschnitt } from './bewertung'

const T = (art: Teil['art'], breite: number): Teil => ({ art, breite })
// Von links (Rand Seite B) nach rechts (Rand Seite A)
const quer: Teil[] = [T('Trottoir', 2.5), T('Parkierung', 1.9), T('Sicherheitsstreifen', 0.8), T('Velostreifen', 1.8),
  T('Fahrspur', 3), T('Fahrspur', 3), T('Velostreifen', 2.0), T('Trottoir', 2.5)]

describe('bilanz — Summe der Fahrbahn-Teile gegen das verfügbare Mass', () => {
  it('Trottoirs zählen nicht', () => {
    const b = bilanz({ fahrbahn: 13, teile: quer })
    expect(b.summe).toBeCloseTo(12.5, 6)
    expect(b.rest).toBeCloseTo(0.5, 6)
    expect(b.offen).toBe(0)
  })
  it('Fehlmass negativ, leere Teile gezählt', () => {
    const b = bilanz({ fahrbahn: 11, teile: [...quer, T('Fahrspur', NaN)] })
    expect(b.rest).toBeCloseTo(-1.5, 6)
    expect(b.offen).toBe(1)
  })
  it('ohne verfügbares Mass kein Rest', () => expect(bilanz({ fahrbahn: NaN, teile: quer }).rest).toBeNaN())
})

describe('pruefeTeil — Vorgaben je Teil', () => {
  it('Velostreifen: Velohauptroute 2,50, Veloroute 1,80 (Bern)', () => {
    expect(pruefeTeil(T('Velostreifen', 2.0), 'Velohauptroute')).toMatchObject({ soll: 2.5, status: 'zu schmal' })
    expect(pruefeTeil(T('Velostreifen', 2.0), 'Veloroute')).toMatchObject({ soll: 1.8, status: 'ok' })
  })
  it('Sicherheitsstreifen: unter 0,80 Richtwert, unter 0,50 zu schmal', () => {
    expect(pruefeTeil(T('Sicherheitsstreifen', 0.6), 'Veloroute').status).toBe('unter Richtwert')
    expect(pruefeTeil(T('Sicherheitsstreifen', 0.4), 'Veloroute').status).toBe('zu schmal')
  })
  it('Trottoir ohne Vorgabe, leeres Feld «leer»', () => {
    expect(pruefeTeil(T('Trottoir', 2), 'Veloroute').status).toBe('keine Vorgabe')
    expect(pruefeTeil(T('Fahrspur', NaN), 'Veloroute').status).toBe('leer')
  })
})

describe('formJeSeite — Führungsform vom Rand her gelesen', () => {
  it('Seite A (rechts): Velostreifen 2,0 ohne Parkierung', () =>
    expect(formJeSeite(quer, 'A')).toEqual({ ist: 'Radstreifen', breite: 2.0, parkenRechts: 'nein', sicherheitsstreifen: false }))
  it('Seite B (links): Velostreifen 1,8 neben Parkierung mit Sicherheitsstreifen', () =>
    expect(formJeSeite(quer, 'B')).toEqual({ ist: 'Radstreifen', breite: 1.8, parkenRechts: 'ja', sicherheitsstreifen: true }))
  it('ohne Velo-Teil: Mischverkehr, Parkierung erkannt', () =>
    expect(formJeSeite([T('Parkierung', 1.9), T('Fahrspur', 3.5), T('Fahrspur', 3.5)], 'B'))
      .toEqual({ ist: 'Mischverkehr', breite: NaN, parkenRechts: 'ja', sicherheitsstreifen: false }))
  it('Radweg', () =>
    expect(formJeSeite([T('Fahrspur', 3), T('Trennstreifen', 0.15), T('Radweg', 2.2), T('Trottoir', 2)], 'A')?.ist)
      .toBe('Radweg strassenbegleitend / Geschützter Radstreifen'))
})

describe('Bewertung mit der Aufteilung', () => {
  const heute: Section = { ...defaultSection(), dtv: 8000, speed: 50, routentyp: 'Veloroute', ist: 'Mischverkehr' }
  it('übernimmt Form, Breite und Parkierung je Seite; Seiten werden verschieden', () => {
    const s = abschnittMitAufteilung(heute, { fahrbahn: 13, teile: quer })
    expect([s.ist, s.breite, s.parkenRechts]).toEqual(['Radstreifen', 2.0, 'nein'])
    expect([s.gegen?.ist, s.gegen?.breite, s.gegen?.parkenRechts, s.gegen?.parkenSicherheitsstreifen]).toEqual(['Radstreifen', 1.8, 'ja', true])
  })
  it('Velostreifen statt Mischverkehr verbessert die Note', () => {
    const vorher = bewerteAbschnitt(heute, 'bern').note!
    const nachher = bewerteAufteilung(heute, { fahrbahn: 13, teile: quer }, 'bern').note!
    expect(nachher).toBeGreaterThan(vorher)
  })
  it('Tram aus den Teilen', () =>
    expect(abschnittMitAufteilung(heute, { fahrbahn: 7, teile: [T('Tram', 3.25), T('Tram', 3.25)] }).tram).toBe(true))
})

describe('startAufteilung — heutiger Querschnitt als Ausgangslage', () => {
  it('Seiten gleich: Parkierung und Radstreifen beidseits, Rest auf zwei Fahrspuren', () => {
    const s: Section = { ...defaultSection(), ist: 'Radstreifen', breite: 1.5, parkenRechts: 'ja', fahrbahnbreite: 14 }
    const a = startAufteilung(s)
    expect(a.teile.map(t => t.art)).toEqual(['Parkierung', 'Velostreifen', 'Fahrspur', 'Fahrspur', 'Velostreifen', 'Parkierung'])
    expect(a.teile[2].breite).toBe(auf5cm((14 - 2 * 1.5 - 2 * 1.9) / 2))
    expect(bilanz(a).rest).toBeCloseTo(0, 1)
  })
  it('Seiten verschieden: Parkierung nur auf Seite A (rechter Rand)', () => {
    const s: Section = { ...defaultSection(), ist: 'Radstreifen', breite: 1.5, parkenRechts: 'ja', fahrbahnbreite: 12,
      gegen: { ...gegenVon(defaultSection()), ist: 'Radstreifen', breite: 1.5, parkenRechts: 'nein' } }
    expect(startAufteilung(s).teile.map(t => t.art)).toEqual(['Velostreifen', 'Fahrspur', 'Fahrspur', 'Velostreifen', 'Parkierung'])
  })
  it('Gegenverkehr unter 6,00 m Rest: gemeinsame Fahrbahn ohne Mittellinie (Manuelstrasse)', () => {
    const s: Section = { ...defaultSection(), ist: 'Mischverkehr', parkenRechts: 'ja', fahrbahnbreite: 6,
      gegen: { ...gegenVon(defaultSection()), ist: 'Mischverkehr', parkenRechts: 'nein' } }
    expect(startAufteilung(s).teile).toEqual([T('Gemeinsam', 4.1), T('Parkierung', 1.9)])
    expect(abschnittMitAufteilung(s, startAufteilung(s)).ist).toBe('Mischverkehr')
  })
  it('Einbahn: eine Spur; ohne Fahrbahnbreite Richtwert 3,00', () => {
    const s: Section = { ...defaultSection(), ist: 'Mischverkehr', richtung: 'eine' }
    expect(startAufteilung(s).teile).toEqual([{ art: 'Fahrspur', breite: 3 }])
  })
  it('Ausgangslage bewertet wie heute', () => {
    const s: Section = { ...defaultSection(), dtv: 8000, speed: 50, routentyp: 'Veloroute', ist: 'Radstreifen', breite: 1.8, fahrbahnbreite: 10 }
    expect(bewerteAufteilung(s, startAufteilung(s), 'bern').note).toBe(bewerteAbschnitt(s, 'bern').note)
    expect(seiteA(abschnittMitAufteilung(s, startAufteilung(s))).ist).toBe('Radstreifen')
  })
})

describe('Seiten tauschen spiegelt die Aufteilung', () => {
  it('Reihenfolge umgekehrt, Fahrbahn bleibt', () => {
    const s: Section = { ...defaultSection(), aufteilung: { fahrbahn: 13, teile: quer } }
    const t = tauscheSeiten(s).aufteilung!
    expect(t.fahrbahn).toBe(13)
    expect(t.teile).toEqual([...quer].reverse())
    expect(quer[0].art).toBe('Trottoir')   // Original unverändert
  })
})

describe('Kernfahrbahn (Masterplan Q 5)', () => {
  const kernQuer: Teil[] = [T('Velostreifen', 1.8), T('Kernfahrbahn', 4.5), T('Velostreifen', 1.8)]
  const s: Section = { ...defaultSection(), dtv: 4000, speed: 50, routentyp: 'Veloroute' }
  it('Band 4,50–5,50', () => {
    expect(pruefeTeil(T('Kernfahrbahn', 4.5), 'Veloroute').status).toBe('ok')
    expect(pruefeTeil(T('Kernfahrbahn', 4.2), 'Veloroute').status).toBe('zu schmal')
    expect(pruefeTeil(T('Kernfahrbahn', 5.8), 'Veloroute')).toMatchObject({ status: 'zu breit', min: 4.5, max: 5.5 })
  })
  it('alle Bedingungen erfüllt: keine Befunde, Velostreifen beidseits bewertet', () => {
    expect(pruefeKernfahrbahn(s, kernQuer)).toEqual([])
    expect(abschnittMitAufteilung(s, { fahrbahn: 8.1, teile: kernQuer }).ist).toBe('Radstreifen')
  })
  it('ohne Kernfahrbahn keine Prüfung', () => expect(pruefeKernfahrbahn(s, quer)).toEqual([]))
  it('DTV über 10 000 und Tempo über 50 nicht zulässig, 5 000–10 000 nur Hinweis', () => {
    const streng = (x: Section) => pruefeKernfahrbahn(x, kernQuer).filter(b => b.streng).length
    expect(streng({ ...s, dtv: 12000 })).toBe(1)
    expect(streng({ ...s, speed: 60 })).toBe(1)
    const opt = pruefeKernfahrbahn({ ...s, dtv: 7000 }, kernQuer)
    expect(opt).toHaveLength(1)
    expect(opt[0].streng).toBe(false)
  })
  it('braucht Velostreifen beidseits, keine Einbahn, keine Fahrspur daneben', () => {
    const texte = (x: Section, t: Teil[]) => pruefeKernfahrbahn(x, t).map(b => b.text).join(' | ')
    expect(texte(s, [T('Kernfahrbahn', 5), T('Velostreifen', 1.8)])).toMatch(/beiden Seiten/)
    expect(texte({ ...s, richtung: 'eine' }, [T('Kernfahrbahn', 4.5), T('Velostreifen', 1.8)])).toMatch(/Einbahn/)
    expect(texte(s, [...kernQuer, T('Fahrspur', 3)])).toMatch(/ersetzt die Fahrspuren/)
  })
})

describe('Ausgangslage mit Trottoirs aus der AV', () => {
  it('Trottoirs ganz aussen, zählen nicht zur Fahrbahn; fehlendes Trottoir entfällt', () => {
    const s: Section = { ...defaultSection(), ist: 'Mischverkehr', fahrbahnbreite: 7, trottoir: { a: 2.43, b: NaN } }
    const a = startAufteilung(s)
    expect(a.teile).toEqual([{ art: 'Fahrspur', breite: 3.5 }, { art: 'Fahrspur', breite: 3.5 }, { art: 'Trottoir', breite: 2.45 }])
  })
  it('Seiten tauschen tauscht die Trottoirs', () =>
    expect(tauscheSeiten({ ...defaultSection(), trottoir: { a: 2, b: 3 } }).trottoir).toEqual({ a: 3, b: 2 }))
})

describe('mitTrottoirs — bestehende Trottoirs gehen beim Planen nicht verloren', () => {
  it('fügt sie aussen ein, wenn keines da ist', () =>
    expect(mitTrottoirs({ fahrbahn: 7, teile: [T('Fahrspur', 3.5)] }, { a: 2, b: 1.81 }).teile)
      .toEqual([T('Trottoir', 1.8), T('Fahrspur', 3.5), T('Trottoir', 2)]))
  it('lässt die Teile einer Aufteilung mit Trottoir unverändert, ergänzt nur den Seitenraum', () => {
    const a = { fahrbahn: 7, teile: [T('Trottoir', 3), T('Fahrspur', 3.5)] }
    const m = mitTrottoirs(a, { a: 2, b: 2 })
    expect(m.teile).toBe(a.teile)
    expect(m.seitenraum).toBe(4)
    const mitRaum = { ...a, seitenraum: 6 }
    expect(mitTrottoirs(mitRaum, { a: 2, b: 2 })).toBe(mitRaum)
  })
})

describe('Neue Teile, Bilder und Lichtraum (Entscheide 16.10.2026)', () => {
  it('Lichtraum SN 640 201: Auto 2,40/2,60, Lastwagen und Bus 3,30/3,50', () => {
    expect(lichtraum('auto', 30)).toBeCloseTo(2.4, 9)
    expect(lichtraum('auto', 50)).toBeCloseTo(2.6, 9)
    expect(lichtraum('lastwagen', 40)).toBeCloseTo(3.3, 9)
    expect(lichtraum('bus', 50)).toBeCloseTo(3.5, 9)
    expect(lichtraum('bus', NaN)).toBeCloseTo(3.5, 9)   // ohne Tempo: 50
  })
  it('Fahrspur: zu schmal unter 3,00; Lastwagen/Bus bis 3,00 reduzierbar (unter Richtwert)', () => {
    const u = { kmh: 50 }
    expect(pruefeTeil({ art: 'Fahrspur', breite: 2.9 }, 'Veloroute', undefined, u).status).toBe('zu schmal')
    expect(pruefeTeil({ art: 'Fahrspur', breite: 3.0 }, 'Veloroute', undefined, u).status).toBe('ok')
    const bus = pruefeTeil({ art: 'Fahrspur', breite: 3.0, bild: 'bus' }, 'Veloroute', undefined, u)
    expect(bus).toMatchObject({ soll: 3.5, min: 3.0, status: 'unter Richtwert', quelle: LICHTRAUM_QUELLE })
    expect(pruefeTeil({ art: 'Fahrspur', breite: 3.5, bild: 'lastwagen' }, 'Veloroute', undefined, u).status).toBe('ok')
  })
  it('neben einem Radweg Richtwert 3,25, gültig ab 3,00', () => {
    const p = pruefeTeil({ art: 'Fahrspur', breite: 3.0 }, 'Veloroute', undefined, { radweg: true })
    expect(p).toMatchObject({ soll: 3.25, min: 3.0, status: 'unter Richtwert' })
  })
  it('Tram: 3,00 bei Gegenverkehr, 3,25 auf der Einbahn, zu schmal unter 2,80', () => {
    expect(pruefeTeil(T('Tram', 3.0), 'Veloroute').status).toBe('ok')
    expect(pruefeTeil(T('Tram', 3.0), 'Veloroute', undefined, { einbahn: true }).status).toBe('unter Richtwert')
    expect(pruefeTeil(T('Tram', 2.7), 'Veloroute').status).toBe('zu schmal')
  })
  it('Pfosten 0,70; Veloabstellplatz 1,90 ohne Vorgabe; Velostrasse 4,50–6,50', () => {
    expect(pruefeTeil(T('Pfosten', 0.7), 'Veloroute')).toMatchObject({ soll: 0.7, status: 'ok' })
    expect(standardBreite(T('Veloabstellplatz', NaN), 'Veloroute')).toBe(1.9)
    expect(pruefeTeil(T('Veloabstellplatz', 1.9), 'Veloroute').status).toBe('keine Vorgabe')
    expect(pruefeTeil(T('Velostrasse', 7), 'Velohauptroute')).toMatchObject({ status: 'zu breit', max: 6.5 })
    expect(standardBreite({ art: 'Fahrspur', breite: NaN, bild: 'lastwagen' }, 'Veloroute', undefined, { kmh: 30 })).toBeCloseTo(3.3, 9)
  })
  it('Velostreifen neben Pfosten = geschützter Radstreifen', () =>
    expect(formJeSeite([T('Fahrspur', 3), T('Pfosten', 0.7), T('Velostreifen', 2), T('Trottoir', 2)], 'A')?.ist)
      .toBe('Radweg strassenbegleitend / Geschützter Radstreifen'))
  it('Veloabstellplatz und Parklet sind keine Parkierung (kein Dooring); Grünstreifen ausserhalb der Fahrbahn', () => {
    for (const art of ['Veloabstellplatz', 'Parklet'] as const)
      expect(formJeSeite([T('Fahrspur', 3), T('Velostreifen', 1.8), T(art, 1.9), T('Trottoir', 2)], 'A'))
        .toMatchObject({ ist: 'Radstreifen', parkenRechts: 'nein' })
    expect(bilanz({ fahrbahn: 5, teile: [T('Gruen', 1.5), T('Fahrspur', 3), T('Trottoir', 2)] }).summe).toBeCloseTo(3, 9)
  })
  it('Velostrasse über die ganze Fahrbahn gilt für beide Seiten', () => {
    const s: Section = { ...defaultSection(), dtv: 1500, speed: 30, routentyp: 'Velohauptroute', ist: 'Mischverkehr' }
    const m = abschnittMitAufteilung(s, { fahrbahn: 5, teile: [T('Trottoir', 2), T('Velostrasse', 5), T('Trottoir', 2)] })
    expect([m.ist, m.breite, m.gegen]).toEqual(['Velostrasse', 5, undefined])
  })
})

describe('Markierungen, Richtung, Trottoir-Vorgabe, angenommene Breite', () => {
  it('Markierungen ohne Velo-Piktogramm und ohne Doppelpfeil (Gegenverkehr kommt aus der Richtung)', () => {
    expect(markierungenFuer('Fahrspur')).toEqual(['keine', 'geradeaus', 'links', 'rechts', 'links-geradeaus', 'geradeaus-rechts', 'links-rechts', 'alle'])
    expect(markierungenFuer('Trottoir')).toEqual([])
  })
  it('Richtung: Gegenverkehr nur ohne Mittellinie und nicht auf der Einbahn; sonst nach der Lage', () => {
    expect(richtungenFuer('Gemeinsam', false)).toEqual(['beide', 'A', 'B'])
    expect(richtungenFuer('Fahrspur', false)).toEqual(['A', 'B'])
    expect(richtungenFuer('Gemeinsam', true)).toEqual(['A'])
    expect(richtungVon(T('Gemeinsam', 4.1), true, false)).toBe('beide')
    expect(richtungVon(T('Fahrspur', 3), true, false)).toBe('B')
    expect(richtungVon(T('Fahrspur', 3), false, false)).toBe('A')
    expect(richtungVon({ art: 'Fahrspur', breite: 3, richtung: 'B' }, false, false)).toBe('B')
    // Einbahn: Fahrspur und Tram auch in Richtung B (Bus bzw. Tram im Gegenverkehr, 21.10.2026), Velostreifen nur A
    expect(richtungVon({ art: 'Fahrspur', breite: 3, richtung: 'B' }, true, true)).toBe('B')
    expect(richtungVon({ art: 'Velostreifen', breite: 1.8, richtung: 'B' }, true, true)).toBe('A')
    expect(richtungenFuer('Tram', true)).toEqual(['A', 'B'])
  })
  it('linksDerMitte: Mitte der Fahrbahnteile, Trottoirs zählen nicht', () =>
    expect(linksDerMitte([T('Trottoir', 5), T('Fahrspur', 3), T('Fahrspur', 3), T('Trottoir', 1)])).toEqual([true, true, false, false]))
  it('Trottoir nach Fussverkehrsnetz (Masterplan Fussverkehr)', () => {
    expect(pruefeTeil(T('Trottoir', 3), 'Veloroute').status).toBe('keine Vorgabe')
    expect(pruefeTeil(T('Trottoir', 3), 'Veloroute', undefined, { fussnetz: 'basis_pi' })).toMatchObject({ soll: 3.5, status: 'zu schmal' })
    expect(pruefeTeil(T('Trottoir', 2.5), 'Veloroute', undefined, { fussnetz: 'basis' }).status).toBe('ok')
    expect(pruefeTeil(T('Trottoir', 1.9), 'Veloroute', undefined, { fussnetz: 'fein' }).status).toBe('zu schmal')
    expect(FUSSNETZ.fein_pi.min).toBe(2.5)
  })
  it('Velostreifen ohne Breite: Vorgabe eingesetzt und angenommen; Fahrspuren erhalten nur den Rest (Laubeggstrasse)', () => {
    const s: Section = { ...defaultSection(), ist: 'Radstreifen', routentyp: 'Veloroute', fahrbahnbreite: 9.8 }
    const a = startAufteilung(s)
    expect(a.teile.map(t => [t.art, t.breite, !!t.angenommen])).toEqual([
      ['Velostreifen', 1.8, true], ['Fahrspur', 3.1, false], ['Fahrspur', 3.1, false], ['Velostreifen', 1.8, true]])
  })
})

describe('Haltestelle (Wartehäuschen und Warteraum)', () => {
  it('mindestens 3,10 m, ausserhalb der Fahrbahn, keine Parkierung', () => {
    expect(pruefeTeil(T('Haltestelle', 3.1), 'Veloroute').status).toBe('ok')
    expect(pruefeTeil(T('Haltestelle', 2.8), 'Veloroute').status).toBe('zu schmal')
    expect(bilanz({ fahrbahn: 6, teile: [T('Trottoir', 2.5), T('Haltestelle', 3.1), T('Fahrspur', 3), T('Fahrspur', 3)] }).summe).toBeCloseTo(6, 9)
    expect(formJeSeite([T('Trottoir', 2.5), T('Haltestelle', 3.1), T('Velostreifen', 1.8), T('Fahrspur', 3)], 'B')?.ist).toBe('Radstreifen')
  })
  it('Wartehäuschen ist kein Bild des Trottoirs mehr; alte Wahl fällt auf Fussgänger*in zurück', () => {
    expect(BILDER.Trottoir).toEqual(['fuss', 'sitzbank'])
    expect(bildVon({ art: 'Trottoir', breite: 2, bild: 'baum' })).toBe('fuss')
  })
})

describe('Bilanz über den ganzen Querschnitt (Entscheid 16.10.2026)', () => {
  const teile = [T('Trottoir', 3.0), T('Velostreifen', 1.8), T('Fahrspur', 3), T('Fahrspur', 3), T('Velostreifen', 1.8), T('Trottoir', 2.0)]
  it('mit Seitenraum: alle Teile gegen Fahrbahn + heute ausserhalb; breiteres Trottoir geht zulasten der Fahrbahn', () => {
    const b = bilanz({ fahrbahn: 9.6, seitenraum: 5.0, teile })
    expect(b).toMatchObject({ ganz: true })
    expect(b.summe).toBeCloseTo(14.6, 9)
    expect(b.verfuegbar).toBeCloseTo(14.6, 9)
    expect(b.rest).toBeCloseTo(0, 9)
    expect(b.fahrbahnSumme).toBeCloseTo(9.6, 9)
    expect(bilanzText({ fahrbahn: 9.6, seitenraum: 5.0, teile }, b).ergebnis).toBe('geht auf')
  })
  it('ohne Seitenraum: nur die Fahrbahn, mit Hinweis', () => {
    const a = { fahrbahn: 9.6, teile }
    const b = bilanz(a)
    expect(b.ganz).toBe(false)
    expect(b.summe).toBeCloseTo(9.6, 9)
    expect(bilanzText(a, b).zusatz[0]).toMatch(/nur für die Fahrbahn/)
  })
  it('Ausgangslage: Seitenraum aus den gemessenen Trottoirs (keines = 0 m), sonst unbekannt', () => {
    expect(startAufteilung({ ...defaultSection(), fahrbahnbreite: 7, trottoir: { a: 2.43, b: NaN } }).seitenraum).toBeCloseTo(2.45, 9)
    expect(startAufteilung({ ...defaultSection(), fahrbahnbreite: 7 }).seitenraum).toBeNaN()
    expect(seitenraumVon({ a: NaN, b: NaN })).toBe(0)
  })
  it('mitTrottoirs setzt den Seitenraum, wenn er noch fehlt', () =>
    expect(mitTrottoirs({ fahrbahn: 7, teile: [T('Fahrspur', 3.5)] }, { a: 2, b: 1.81 }).seitenraum).toBeCloseTo(3.8, 9))
})
