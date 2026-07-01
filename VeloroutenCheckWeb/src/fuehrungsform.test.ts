import { describe, it, expect } from 'vitest'
import {
  fuehrungsart, fuehrungsformNote, haltestellenLoesung, haltestellenTypen,
  BREITEN_ZUERICH, BREITEN_BASEL, BREITEN_LUZERN,
  vergleichsNoten, baselStrassentypAusVerkehr,
} from './fuehrungsform'
import type { BreitenSoll } from './fuehrungsform'

// ════════════════════════════════════════════════════════════════════════════
// Charakterisierungs-/Regressionstests. Bern soll unverändert bleiben; die neuen
// Städte (Zürich/Basel/Luzern) prüfen die stadtspezifische Soll-Wahl, Breiten
// und Haltestellen.
// ════════════════════════════════════════════════════════════════════════════

describe('fuehrungsart — Bern (Default, unverändert)', () => {
  it('< 2000 / ≤30 → Mischverkehr', () => expect(fuehrungsart(1000, 30)).toBe('Mischverkehr'))
  it('< 2000 / 50 → Radstreifen', () => expect(fuehrungsart(1000, 50)).toBe('Radstreifen'))
  it('2000–5000 / 50 → Radweg', () => expect(fuehrungsart(3000, 50)).toBe('Radweg'))
  it('5000–10000 / ≤30 → Radstreifen oder Radweg', () =>
    expect(fuehrungsart(7000, 30)).toBe('Radstreifen oder Radweg'))
  it('> 10000 → Radweg', () => expect(fuehrungsart(12000, 30)).toBe('Radweg'))
  it('> 50 km/h → Radweg', () => expect(fuehrungsart(500, 60)).toBe('Radweg'))
})

describe('fuehrungsart — Zürich (nach Routentyp)', () => {
  it('Velovorzugsroute <2500 / ≤30 → Mischverkehr', () =>
    expect(fuehrungsart(2000, 30, 'zurich', 'Velohauptroute')).toBe('Mischverkehr'))
  it('Velovorzugsroute >7500 / 31–40 → Radweg', () =>
    expect(fuehrungsart(8000, 40, 'zurich', 'Velohauptroute')).toBe('Radweg'))
  it('Velovorzugsroute 2500–5000 / ≤30 → Radstreifen oder Radweg (Mischverkehr-Deckel 2500)', () =>
    expect(fuehrungsart(3000, 30, 'zurich', 'Velohauptroute')).toBe('Radstreifen oder Radweg'))
  it('Hauptroute <5000 / ≤30 → Mischverkehr', () =>
    expect(fuehrungsart(3000, 30, 'zurich', 'Veloroute')).toBe('Mischverkehr'))
  it('Hauptroute 5000–7500 / ≤30 → Radstreifen oder Radweg (Mischverkehr-Deckel 5000)', () =>
    expect(fuehrungsart(6000, 30, 'zurich', 'Veloroute')).toBe('Radstreifen oder Radweg'))
  it('Hauptroute >7500 / 50 → Radstreifen oder Radweg', () =>
    expect(fuehrungsart(9000, 50, 'zurich', 'Veloroute')).toBe('Radstreifen oder Radweg'))
})

describe('fuehrungsart — Luzern (drei Zonen, Berner Logik)', () => {
  it('< 5000 / ≤30 → Mischverkehr', () => expect(fuehrungsart(1000, 30, 'luzern')).toBe('Mischverkehr'))
  it('< 2000 / 31–40 → Mischverkehr', () => expect(fuehrungsart(1500, 40, 'luzern')).toBe('Mischverkehr'))
  it('≥ 5000 / ≤30 → Radstreifen (Markierung)', () =>
    expect(fuehrungsart(7000, 30, 'luzern')).toBe('Radstreifen'))
  it('< 10000 / 41–50 → Radstreifen (Markierung)', () =>
    expect(fuehrungsart(3000, 50, 'luzern')).toBe('Radstreifen'))
  it('≥ 10000 / 41–50 → Radweg (bauliche Trennung)', () =>
    expect(fuehrungsart(12000, 50, 'luzern')).toBe('Radweg'))
  it('> 15000 / ≤30 → Radweg', () => expect(fuehrungsart(16000, 30, 'luzern')).toBe('Radweg'))
})

describe('fuehrungsart — Basel (nach Strassentyp)', () => {
  it('siedlungsorientiert, Vorzugsroute → Velostrasse', () =>
    expect(fuehrungsart(2000, 30, 'basel', 'Velohauptroute', 'siedlungsorientiert')).toBe('Velostrasse'))
  it('siedlungsorientiert, Pendler-/Basis → Mischverkehr (keine Velostrasse)', () =>
    expect(fuehrungsart(4000, 30, 'basel', 'Veloroute', 'siedlungsorientiert')).toBe('Mischverkehr'))
  it('verkehrsorientiert, Vorzugsroute → Radstreifen oder Radweg', () =>
    expect(fuehrungsart(9999, 50, 'basel', 'Velohauptroute', 'verkehrsorientiert')).toBe('Radstreifen oder Radweg'))
  it('verkehrsorientiert, Pendler-/Basis → Radstreifen', () =>
    expect(fuehrungsart(9999, 50, 'basel', 'Veloroute', 'verkehrsorientiert')).toBe('Radstreifen'))
})

describe('Basel — siedlungsorientiert: zulässige Formen je Routentyp (Tab. 3, S. 15)', () => {
  // Vorzugsroute → Velostrasse (≤2'500). Pendler-/Basis → Mischverkehr (≤5'000) ODER Velostrasse (ohne
  // DWV-Deckel). Nur eine zulässige Form erreicht Note 6; jede andere ist nicht vorgesehen (max. 4). T30.
  const bs = (ist: Parameters<typeof fuehrungsformNote>[2], breite: number | undefined, route: 'Velohauptroute' | 'Veloroute' = 'Velohauptroute', dtv = 2000) =>
    fuehrungsformNote(dtv, 30, ist, breite, route,
      'egal', undefined, 'keine', 'keine', undefined, false,
      BREITEN_BASEL[ist], 'basel', 'siedlungsorientiert')

  // ── Vorzugsroute (Velohauptroute): Velostrasse ─────────────────────────────
  it('Vorzugsroute: Soll ist Velostrasse', () => expect(bs('Velostrasse', 4.3).soll).toBe('Velostrasse'))
  it('Vorzugsroute: Velostrasse breitenkonform (4,5 m) → Note 6', () => {
    const r = bs('Velostrasse', 4.5)
    expect(r.sollbreite).toBe(4.5)
    expect(r.note).toBe(6)
  })
  it('Vorzugsroute: Velostrasse zu schmal (4,0 m) → Abzug (< 6)', () =>
    expect(bs('Velostrasse', 4.0).note).toBeLessThan(6))
  it('Vorzugsroute: Mischverkehr statt Velostrasse → nicht konform, max Note 4', () => {
    const r = bs('Mischverkehr', undefined)
    expect(r.note).toBeLessThanOrEqual(4)
    expect(r.hinweis).toContain('nur Velostrasse')
  })
  it('Vorzugsroute: Radweg statt Velostrasse → max Note 4 (über-separiert, nicht vorgesehen)', () =>
    expect(bs('Radweg abgesetzt', 2.5).note).toBeLessThanOrEqual(4))
  it('Vorzugsroute: DWV > 2500 → Hinweis, Velostrasse bleibt Note 6 (kein Abzug)', () => {
    const r = bs('Velostrasse', 4.5, 'Velohauptroute', 3000)
    expect(r.note).toBe(6)
    expect(r.hinweis).toContain('Höchstwert 2500')
  })
  it('Velostrasse, DWV < 1000: reduzierte Breite 4,00 m konform → Note 6', () => {
    const r = bs('Velostrasse', 4.0, 'Velohauptroute', 500)
    expect(r.sollbreite).toBe(4.0)
    expect(r.note).toBe(6)
  })
  it('Velostrasse, DWV ≥ 1000: 4,00 m unterschreitet 4,50 m → Abzug (< 6)', () =>
    expect(bs('Velostrasse', 4.0, 'Velohauptroute', 2000).note).toBeLessThan(6))

  // ── Pendler-/Basisrouten (Veloroute): Mischverkehr ODER Velostrasse ─────────
  it('Pendler/Basis: Soll ist Mischverkehr (empfohlene Form)', () =>
    expect(bs('Mischverkehr', undefined, 'Veloroute').soll).toBe('Mischverkehr'))
  it('Pendler/Basis: Mischverkehr → Note 6 (konform)', () =>
    expect(bs('Mischverkehr', undefined, 'Veloroute').note).toBe(6))
  it('Pendler/Basis: Velostrasse ist zulässig (mögliche Form) → Note 6', () =>
    expect(bs('Velostrasse', 4.3, 'Veloroute').note).toBe(6))
  it('Pendler/Basis: Velostrasse hat keinen DWV-Deckel (DWV 8000 → kein Hinweis)', () =>
    expect(bs('Velostrasse', 4.3, 'Veloroute', 8000).hinweis).toBeUndefined())
  it('Pendler/Basis: Radstreifen → nicht vorgesehen, max Note 4', () =>
    expect(bs('Radstreifen', 2.5, 'Veloroute').note).toBeLessThanOrEqual(4))
  it('Pendler/Basis: DWV > 5000 → Hinweis, Mischverkehr bleibt Note 6', () => {
    const r = bs('Mischverkehr', undefined, 'Veloroute', 6000)
    expect(r.note).toBe(6)
    expect(r.hinweis).toContain('Höchstwert 5000')
  })

  it('Velostrasse auf verkehrsorientierter Strasse → nicht zulässig, max Note 4', () => {
    const r = fuehrungsformNote(2000, 30, 'Velostrasse', 4.5, 'Velohauptroute',
      'egal', undefined, 'keine', 'keine', undefined, false,
      BREITEN_BASEL['Velostrasse'], 'basel', 'verkehrsorientiert')
    expect(r.note).toBeLessThanOrEqual(4)
    expect(r.hinweis).toContain('verkehrsorientierten Strasse nicht')
  })

  it('verkehrsorientiert: Regel greift NICHT (Radstreifen erfüllt Soll → Note 6)', () => {
    const r = fuehrungsformNote(9999, 50, 'Radstreifen', 2.5, 'Veloroute',
      'egal', undefined, 'keine', 'keine', undefined, false,
      BREITEN_BASEL['Radstreifen'], 'basel', 'verkehrsorientiert')
    expect(r.soll).toBe('Radstreifen')
    expect(r.note).toBe(6)
  })
})

describe('Umweltspur — stadtspezifischer Takt (Stufe Bern, Rampe ZH/LU, Basel ohne Takt)', () => {
  // breitenkonform (kein Breitenabzug) → Note = reine Takt-Basis. Velohauptroute.
  const us = (stadt: 'bern' | 'zurich' | 'luzern' | 'basel', takt: number | undefined,
              breite: number, soll: BreitenSoll | undefined) =>
    fuehrungsformNote(5000, 50, 'Umweltspur', breite, 'Velohauptroute',
      'egal', takt, 'keine', 'keine', undefined, false, soll, stadt)

  it('Bern: Takt 7 (< 7,5) → Note 1', () =>
    expect(us('bern', 7, 4.5, undefined).note).toBe(1))
  it('Bern: Takt 8 (≥ 7,5) → Decke 4', () =>
    expect(us('bern', 8, 4.5, undefined).note).toBe(4))

  it('Zürich: Takt 4 (< 5) → Note 1', () =>
    expect(us('zurich', 4, 4.8, BREITEN_ZUERICH['Umweltspur']).note).toBe(1))
  it('Zürich: Takt 10 (Mitte 5–15) → Note 2,5 (Rampe)', () =>
    expect(us('zurich', 10, 4.8, BREITEN_ZUERICH['Umweltspur']).note).toBe(2.5))
  it('Zürich: Takt 20 (≥ 15) → Decke 4', () =>
    expect(us('zurich', 20, 4.8, BREITEN_ZUERICH['Umweltspur']).note).toBe(4))

  it('Luzern: gleiche Anker wie Zürich (Takt 10 → 2,5)', () =>
    expect(us('luzern', 10, 4.5, BREITEN_LUZERN['Umweltspur']).note).toBe(2.5))

  it('Basel: kein Takt-Penalty — auch Takt 3 → Decke 4 + Hinweis', () => {
    const r = us('basel', 3, 4.5, BREITEN_BASEL['Umweltspur'])
    expect(r.note).toBe(4)
    expect(r.hinweis).toContain('keinen Takt-Schwellwert')
  })
  it('Basel: Takt spielt keine Rolle (Takt 3 = Takt 20)', () =>
    expect(us('basel', 3, 4.5, BREITEN_BASEL['Umweltspur']).note)
      .toBe(us('basel', 20, 4.5, BREITEN_BASEL['Umweltspur']).note))
})

describe('fuehrungsformNote — Bern Beispiel aus README (unverändert)', () => {
  it('DTV 3000 / 50 / Radstreifen / 1,8 m / Velohauptroute → 4.0', () => {
    const r = fuehrungsformNote(3000, 50, 'Radstreifen', 1.8, 'Velohauptroute')
    expect(r.soll).toBe('Radweg')
    expect(r.note).toBe(4.0)
  })
  it('Ist = Soll (Radweg) → Note 6', () => {
    const r = fuehrungsformNote(3000, 50, 'Radweg strassenbegleitend / Geschützter Radstreifen', 2.5, 'Velohauptroute')
    expect(r.note).toBe(6)
  })
})

describe('Luzern Markierungszone (DTV ≥ 5000 / ≤30 → Radstreifen)', () => {
  // Soll = Radstreifen: Ist Radstreifen erfüllt (bei genügender Breite Note 6),
  // Ist Mischverkehr unterschreitet → Abzug.
  it('Ist Radstreifen bei genügend Breite → Note 6', () => {
    const r = fuehrungsformNote(7000, 30, 'Radstreifen', 2.5, 'Velohauptroute',
      'egal', undefined, 'keine', 'keine', undefined, false,
      BREITEN_LUZERN['Radstreifen'], 'luzern')
    expect(r.soll).toBe('Radstreifen')
    expect(r.note).toBe(6)
  })
  it('Ist Mischverkehr → Abzug (< 6)', () => {
    const r = fuehrungsformNote(7000, 30, 'Mischverkehr', undefined, 'Velohauptroute',
      'egal', undefined, 'keine', 'keine', undefined, false, undefined, 'luzern')
    expect(r.soll).toBe('Radstreifen')
    expect(r.note).toBeLessThan(6)
  })
})

describe('Stadtspezifische Breiten', () => {
  it('Zürich Radstreifen minimal 2,20 m', () => {
    expect(BREITEN_ZUERICH['Radstreifen']).toEqual({ optimal: 2.5, minimal: 2.2 })
  })
  it('Basel Radweg strassenbegl. minimal 2,20 m', () => {
    expect(BREITEN_BASEL['Radweg strassenbegleitend / Geschützter Radstreifen']).toEqual({ optimal: 2.5, minimal: 2.2 })
  })
  it('Luzern Umweltspur minimal 3,75 m (wie Bern)', () => {
    expect(BREITEN_LUZERN['Umweltspur']).toEqual({ optimal: 4.5, minimal: 3.75 })
  })
})

describe('Haltestellen — stadtabhängig', () => {
  it('Bern: 7 Typen', () => expect(haltestellenTypen('bern')).toHaveLength(7))
  it('Zürich: 3 Typen', () => expect(haltestellenTypen('zurich')).toHaveLength(3))
  it('Basel: 4 Typen', () => expect(haltestellenTypen('basel')).toHaveLength(4))
  it('Luzern: 5 Typen', () => expect(haltestellenTypen('luzern')).toHaveLength(5))

  it('Bern Tram + Veloroute → Separate Velofläche', () =>
    expect(haltestellenLoesung('Veloroute', 'tram', 'bern')).toBe('Separate Velofläche'))
  it('Luzern hat kein Tram-Bonus: Bus≥15 / Veloroute → Mischverkehr', () =>
    expect(haltestellenLoesung('Veloroute', 'bus_ab15', 'luzern')).toBe('Mischverkehr'))
  it('Zürich: keine Soll-Lösung (kein automatischer Abzug)', () =>
    expect(haltestellenLoesung('Veloroute', 'tram', 'zurich')).toBeNull())
  it('Basel: keine Soll-Lösung', () =>
    expect(haltestellenLoesung('Veloroute', 'tram', 'basel')).toBeNull())

  it('Zürich: inkompatibler Mischverkehr-Typ gibt KEINEN Abzug', () => {
    const r = fuehrungsformNote(3000, 50, 'Radstreifen', 2.5, 'Velohauptroute',
      'egal', undefined, 'tram', 'Fahrbahnhaltestelle mit Veloführung auf Fahrbahn', undefined, false,
      BREITEN_ZUERICH['Radstreifen'], 'zurich')
    expect(r.haltestelleAbzug).toBe(0)
  })
})

describe('baselStrassentypAusVerkehr (Heuristik)', () => {
  it('hohes Tempo → verkehrsorientiert', () =>
    expect(baselStrassentypAusVerkehr(6000, 50)).toBe('verkehrsorientiert'))
  it('hoher DTV bei Tempo 30 → verkehrsorientiert', () =>
    expect(baselStrassentypAusVerkehr(6000, 30)).toBe('verkehrsorientiert'))
  it('tiefer DTV / Tempo 30 → siedlungsorientiert', () =>
    expect(baselStrassentypAusVerkehr(1000, 30)).toBe('siedlungsorientiert'))
})

describe('vergleichsNoten (Stadt-Vergleich)', () => {
  it('lässt die übergebene Stadt aus und enthält genau die anderen drei', () => {
    const v = vergleichsNoten({ dtv: 3000, v: 50, ist: 'Radstreifen', breite: 2.5 }, 'bern')
    expect(v.map(x => x.stadt).sort()).toEqual(['basel', 'luzern', 'zurich'])
  })

  it('Basel-Eintrag ist als geschätzt markiert, die anderen nicht', () => {
    const v = vergleichsNoten({ dtv: 3000, v: 50, ist: 'Radstreifen', breite: 2.5 }, 'bern')
    expect(v.find(x => x.stadt === 'basel')?.geschaetzt).toBe(true)
    expect(v.find(x => x.stadt === 'zurich')?.geschaetzt).toBe(false)
  })

  it('Noten weichen voneinander ab, wo die Soll-Tabellen differieren', () => {
    // DTV 6000 / Tempo 30: Bern «Radstreifen oder Radweg», Luzern «Radstreifen».
    // Ist = Mischverkehr → unterschiedlicher Soll → unterschiedliche Note.
    const bern = fuehrungsformNote(6000, 30, 'Mischverkehr', undefined, 'Velohauptroute').note
    const v = vergleichsNoten({ dtv: 6000, v: 30, ist: 'Mischverkehr', routentyp: 'Velohauptroute' }, 'bern')
    const luzern = v.find(x => x.stadt === 'luzern')!.note
    expect(luzern).not.toBe(bern)
  })

  it('stimmt mit direktem fuehrungsformNote-Aufruf je Stadt überein', () => {
    const v = vergleichsNoten({ dtv: 3000, v: 50, ist: 'Radstreifen', breite: 2.2, routentyp: 'Veloroute' }, 'bern')
    const direkt = fuehrungsformNote(3000, 50, 'Radstreifen', 2.2, 'Veloroute',
      'egal', undefined, 'keine', 'keine', undefined, false, BREITEN_ZUERICH['Radstreifen'], 'zurich').note
    expect(v.find(x => x.stadt === 'zurich')?.note).toBe(direkt)
  })

  it('soll/sollbreite stimmen mit direktem fuehrungsformNote-Aufruf überein', () => {
    const v = vergleichsNoten({ dtv: 3000, v: 50, ist: 'Radstreifen', breite: 2.2, routentyp: 'Veloroute' }, 'bern')
    const direkt = fuehrungsformNote(3000, 50, 'Radstreifen', 2.2, 'Veloroute',
      'egal', undefined, 'keine', 'keine', undefined, false, BREITEN_ZUERICH['Radstreifen'], 'zurich')
    const zh = v.find(x => x.stadt === 'zurich')!
    expect(zh.soll).toBe(direkt.soll)
    expect(zh.sollbreite).toBe(direkt.sollbreite)
  })

  it('abweichender Soll liefert einen Grund mit beiden Führungsformen', () => {
    // DTV 6000 / Tempo 30: Bern «Radstreifen oder Radweg», Luzern «Radstreifen».
    const v = vergleichsNoten({ dtv: 6000, v: 30, ist: 'Mischverkehr', routentyp: 'Velohauptroute' }, 'bern')
    const lu = v.find(x => x.stadt === 'luzern')!
    expect(lu.note).not.toBe(fuehrungsformNote(6000, 30, 'Mischverkehr', undefined, 'Velohauptroute').note)
    expect(lu.gruende.some(g => g.startsWith('Soll: '))).toBe(true)
    expect(lu.gruende.find(g => g.startsWith('Soll: '))).toContain('statt')
  })

  it('Basel nennt immer den geschätzten Strassentyp als ersten Grund', () => {
    const v = vergleichsNoten({ dtv: 6000, v: 50, ist: 'Radstreifen', breite: 2.5 }, 'bern')
    const bs = v.find(x => x.stadt === 'basel')!
    expect(bs.gruende[0]).toContain('Strassentyp geschätzt')
    expect(bs.gruende[0]).toContain('verkehrsorientiert')
  })

  it('identische Note ohne Schätzung liefert keine Gründe', () => {
    // Bern als Referenz, Zürich-Note gleich → keine Gründe (Zürich wird nicht geschätzt).
    const v = vergleichsNoten({ dtv: 3000, v: 50, ist: 'Radstreifen', breite: 2.2, routentyp: 'Veloroute' }, 'bern')
    const zh = v.find(x => x.stadt === 'zurich')!
    const bern = fuehrungsformNote(3000, 50, 'Radstreifen', 2.2, 'Veloroute').note
    if (zh.note === bern) expect(zh.gruende).toEqual([])
  })
})

describe('Basel — DWV-Deckel Hinweis (siedlungsorientierte Strasse)', () => {
  // Je konforme Form (Vorzugsroute → Velostrasse breitenkonform, Pendler/Basis → Mischverkehr) →
  // der EINZIGE mögliche Hinweis ist der DWV-Deckel.
  const bs = (dtv: number, route: 'Velohauptroute' | 'Veloroute', st: 'siedlungsorientiert' | 'verkehrsorientiert') => {
    const ist = route === 'Velohauptroute' ? 'Velostrasse' : 'Mischverkehr'
    return fuehrungsformNote(dtv, 30, ist, ist === 'Velostrasse' ? 4.3 : undefined, route,
      'egal', undefined, 'keine', 'keine', undefined, false, BREITEN_BASEL[ist], 'basel', st)
  }

  it('Velohauptroute, siedlungsorientiert, DTV > 2500 → Hinweis (Deckel 2500)', () =>
    expect(bs(3000, 'Velohauptroute', 'siedlungsorientiert').hinweis).toContain('Höchstwert 2500'))
  it('Velohauptroute, siedlungsorientiert, DTV ≤ 2500 → kein Hinweis', () =>
    expect(bs(2000, 'Velohauptroute', 'siedlungsorientiert').hinweis).toBeUndefined())
  it('Veloroute, siedlungsorientiert, DTV < 5000 → kein Hinweis', () =>
    expect(bs(4000, 'Veloroute', 'siedlungsorientiert').hinweis).toBeUndefined())
  it('Veloroute, siedlungsorientiert, DTV ≥ 5000 → Hinweis (Deckel 5000)', () =>
    expect(bs(6000, 'Veloroute', 'siedlungsorientiert').hinweis).toContain('Höchstwert 5000'))
  it('verkehrsorientiert → nie ein Deckel-Hinweis (konforme Form, hoher DTV)', () =>
    expect(fuehrungsformNote(8000, 30, 'Radstreifen', 2.5, 'Veloroute',
      'egal', undefined, 'keine', 'keine', undefined, false,
      BREITEN_BASEL['Radstreifen'], 'basel', 'verkehrsorientiert').hinweis).toBeUndefined())
})

describe('Kombinierter Fuss-/Radweg (Q11)', () => {
  it('NICHT auf Note 4 gedeckelt: breitenkonform → Note 6 (Bern, ≥ 3,50)', () => {
    const r = fuehrungsformNote(5000, 50, 'Kombinierter Fuss-/Radweg', 3.5, 'Velohauptroute')
    expect(r.note).toBe(6)
  })
  it('zu schmal → Abzug, aber weiterhin > 4 (Bern 3,00 m statt 3,50)', () => {
    const r = fuehrungsformNote(5000, 50, 'Kombinierter Fuss-/Radweg', 3.0, 'Velohauptroute')
    expect(r.note).toBeGreaterThan(4)
    expect(r.note).toBeLessThan(6)
  })
  it('Kontrast: «Fussweg Velo gestattet» bleibt auf 4 gedeckelt (gleiche Breite)', () => {
    const r = fuehrungsformNote(5000, 50, 'Fussweg Velo gestattet', 3.5, 'Velohauptroute')
    expect(r.note).toBeLessThanOrEqual(4)
  })
  it('Basel: Velohauptroute Sollbreite 6,00 m → konform = Note 6', () => {
    const r = fuehrungsformNote(3000, 30, 'Kombinierter Fuss-/Radweg', 6.0, 'Velohauptroute',
      'egal', undefined, 'keine', 'keine', undefined, false,
      BREITEN_BASEL['Kombinierter Fuss-/Radweg'], 'basel', 'verkehrsorientiert')
    expect(r.sollbreite).toBe(6.0)
    expect(r.note).toBe(6)
  })
  it('Basel: Veloroute Sollbreite 4,80 m', () => {
    const r = fuehrungsformNote(3000, 30, 'Kombinierter Fuss-/Radweg', 4.8, 'Veloroute',
      'egal', undefined, 'keine', 'keine', undefined, false,
      BREITEN_BASEL['Kombinierter Fuss-/Radweg'], 'basel', 'verkehrsorientiert')
    expect(r.sollbreite).toBe(4.8)
    expect(r.note).toBe(6)
  })
})

describe('Sicherheitsstreifen (SN 640 060) hebt den Dooring-Abzug auf', () => {
  // Radstreifen 2,5 m (breitenkonform Bern), Parkierung rechts = ja. Letzter Arg = Sicherheitsstreifen.
  const rs = (stadt: 'bern' | 'zurich', streifen: boolean, breite = 2.5) =>
    fuehrungsformNote(1000, 30, 'Radstreifen', breite, 'Velohauptroute',
      'ja', undefined, 'keine', 'keine', undefined, false, undefined, stadt, undefined, streifen)

  it('Bern: ohne Streifen → Dooring-Abzug 1,0', () => {
    const r = rs('bern', false)
    expect(r.parkenAbzug).toBe(1.0)
  })
  it('Bern: mit Streifen → kein Abzug, Note 1 Stufe höher', () => {
    const ohne = rs('bern', false).note
    const mit = rs('bern', true)
    expect(mit.parkenAbzug).toBe(0)
    expect(mit.note).toBe(ohne + 1)
  })
  it('stadtunabhängig: Zürich verhält sich gleich', () => {
    expect(rs('zurich', false).parkenAbzug).toBe(1.0)
    expect(rs('zurich', true).parkenAbzug).toBe(0)
  })
  it('wirkungslos, wenn Parkierung rechts ≠ ja', () => {
    const r = fuehrungsformNote(1000, 30, 'Radstreifen', 2.5, 'Velohauptroute',
      'nein', undefined, 'keine', 'keine', undefined, false, undefined, 'bern', undefined, true)
    expect(r.parkenAbzug).toBe(0)
    expect(r.parkenSicherheitsstreifen).toBe(true)
  })
})
