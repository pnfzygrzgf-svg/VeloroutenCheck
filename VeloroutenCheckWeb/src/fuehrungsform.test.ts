import { describe, it, expect } from 'vitest'
import {
  fuehrungsart, fuehrungsformNote, haltestellenLoesung, haltestellenTypen, haltestellenMitBreite,
  BREITEN_ZUERICH, BREITEN_BASEL, BREITEN_LUZERN,
  vergleichsNoten, baselStrassentypAusVerkehr, brauchtBreite, brauchtDtvTempo, erfuellungsgrad,
  roundToHalf, BREITE_SATZ,
} from './fuehrungsform'
import type { BreitenSoll, IstFuehrungsform } from './fuehrungsform'

// ════════════════════════════════════════════════════════════════════════════
// Charakterisierungs-/Regressionstests. Bern soll unverändert bleiben; die neuen
// Städte (Zürich/Basel/Luzern) prüfen die stadtspezifische Soll-Wahl, Breiten
// und Haltestellen.
// ════════════════════════════════════════════════════════════════════════════

describe('fuehrungsart — Bern (Default)', () => {
  it('< 2000 / ≤30 → Mischverkehr', () => expect(fuehrungsart(1000, 30)).toBe('Mischverkehr'))
  it('< 2000 / 31–40 → Radstreifen', () => expect(fuehrungsart(1000, 40)).toBe('Radstreifen'))
  it('2000–5000 / ≤40 → Radstreifen', () => expect(fuehrungsart(3000, 40)).toBe('Radstreifen'))
  it('5000–10000 / ≤30 → Radstreifen oder Radweg', () =>
    expect(fuehrungsart(7000, 30)).toBe('Radstreifen oder Radweg'))
  it('> 10000 → Radweg', () => expect(fuehrungsart(12000, 30)).toBe('Radweg'))
  it('> 50 km/h → Radweg', () => expect(fuehrungsart(500, 60)).toBe('Radweg'))
})

// Am 10.08.2026 an den lokalen Rechner angeglichen (soll_ist_analyse.py, soll_bern). Die drei
// Gruppen unten sind genau die 18 Zellen, die vorher abwichen — je eine Zusage pro Gruppe,
// damit die Angleichung nicht unbemerkt zurückfallen kann. Begründung: Kommentar bei
// fuehrungsartBern (Masterplan S. 11, L-förmig schraffiertes Feld + drei Grenzwerte).
describe('fuehrungsart — Bern: die angeglichenen Zellen', () => {
  it('Band 41–50 km/h ist Übergang, unabhängig vom DTV-Band', () => {
    // Vorher: unter 2'000 «Radstreifen», 2'000–5'000 «Radweg» — beides steht im Schema als
    // «Radstreifen oder Radweg» (der waagrechte Schenkel der Schraffur).
    for (const dtv of [500, 1999, 2000, 4999])
      for (const v of [45, 50])
        expect(fuehrungsart(dtv, v), `DTV ${dtv} / ${v}`).toBe('Radstreifen oder Radweg')
  })
  it('DTV genau 5000 ist NOCH Radstreifen (Bandgrenze des Schemas)', () => {
    expect(fuehrungsart(5000, 40)).toBe('Radstreifen')
    expect(fuehrungsart(5001, 40)).toBe('Radstreifen oder Radweg')
  })
  it('DTV genau 10000 ist NOCH Übergang («stark belastet» heisst > 10 000)', () => {
    expect(fuehrungsart(10000, 30)).toBe('Radstreifen oder Radweg')
    expect(fuehrungsart(10001, 30)).toBe('Radweg')
  })
  it('DTV genau 2000 ist SCHON Radstreifen («verkehrsarm» heisst < 2 000)', () => {
    expect(fuehrungsart(1999, 30)).toBe('Mischverkehr')
    expect(fuehrungsart(2000, 30)).toBe('Radstreifen')
  })
  it('die strengere der beiden Achsen entscheidet (Tempo kann DTV überstimmen)', () => {
    // Verkehrsarm, aber schnell: das Tempo hebt die Zeile an.
    expect(fuehrungsart(500, 30)).toBe('Mischverkehr')
    expect(fuehrungsart(500, 35)).toBe('Radstreifen')
    expect(fuehrungsart(500, 45)).toBe('Radstreifen oder Radweg')
    expect(fuehrungsart(500, 60)).toBe('Radweg')
  })
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

  // Bern: dreistufige Tabelle, deckungsgleich mit dem lokalen Batch-Rechner.
  it('Bern: Takt 6 (< 7,5) → Note 2', () =>
    expect(us('bern', 6, 4.5, undefined).note).toBe(2))
  it('Bern: Takt 8 (7,5 bis < 15) → Note 4', () =>
    expect(us('bern', 8, 4.5, undefined).note).toBe(4))
  it('Bern: Takt 20 (≥ 15) → Decke 5', () =>
    expect(us('bern', 20, 4.5, undefined).note).toBe(5))
  it('Bern: ohne Takt-Angabe → Decke 5 (ein Eintrag kann nur senken)', () =>
    expect(us('bern', undefined, 4.5, undefined).note).toBe(5))
  it('Bern: unter 7,5 Min warnt der Standard, erzwingt die Note aber nicht', () => {
    const r = us('bern', 6, 4.5, undefined)
    expect(r.warnung).toMatch(/nicht zulässig/)
    expect(r.hinweis).toBeUndefined()   // ersetzt die Erklärung NICHT
  })
  it('Zürich behält Decke 4 und den Notenzwang unter 5 Min (Rampe, nicht Stufen)', () => {
    expect(us('zurich', undefined, 4.8, BREITEN_ZUERICH['Umweltspur']).note).toBe(4)
    expect(us('zurich', 4, 4.8, BREITEN_ZUERICH['Umweltspur']).hinweis).toMatch(/nicht zulässig/)
  })

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

describe('fuehrungsformNote — Bern Beispiel aus README', () => {
  // 10.08.2026: DTV 3'000 → 12'000. Bei 50 km/h ist 3'000 seit der Angleichung an den lokalen
  // Rechner «Radstreifen oder Radweg»; mit 12'000 bleibt das Soll «Radweg» und die ganze
  // Beispielrechnung unverändert (91 − 73 = 18 → 4,75). Nur die Grundlage der Soll-Wahl wechselt
  // vom DTV-Band 2'000–5'000 auf «> 10'000».
  it('DTV 12000 / 50 / Radstreifen / 1,8 m / Velohauptroute → 4.5', () => {
    // Form 6 − (91−73)/14,4 = 4,75 · Breite −0,7 m × 0,70 = −0,49 → 4,26 → 4,5
    const r = fuehrungsformNote(12000, 50, 'Radstreifen', 1.8, 'Velohauptroute')
    expect(r.soll).toBe('Radweg')
    expect(r.note).toBe(4.5)
  })
  it('Ist = Soll (Radweg) → Note 6', () => {
    const r = fuehrungsformNote(12000, 50, 'Radweg strassenbegleitend / Geschützter Radstreifen', 2.5, 'Velohauptroute')
    expect(r.note).toBe(6)
  })
})

describe('Zweirichtungsradweg (Q10) — baulich getrennt, Breite entscheidet', () => {
  // Rang 2 wie der Radweg: erfüllt jedes Soll. Die Note steuert allein die Breite, und die
  // liegt höher als beim Einrichtungs-Radweg (4,50 Velohauptroute / 3,20 Veloroute), weil
  // zwei Fahrtrichtungen samt Begegnungsfall hineinmüssen.
  it('erfüllt auch das strengste Soll (Radweg) bei genügender Breite → Note 6', () => {
    const r = fuehrungsformNote(12000, 60, 'Zweirichtungsradweg', 4.5, 'Velohauptroute')
    expect(r.soll).toBe('Radweg')
    expect(r.note).toBe(6)
  })
  it('Velohauptroute mit 3,0 m → zu schmal, Abzug', () => {
    const r = fuehrungsformNote(3000, 50, 'Zweirichtungsradweg', 3.0, 'Velohauptroute')
    expect(r.note).toBeLessThan(6)
  })
  it('Veloroute: 3,20 m genügt (dort wo die Hauptroute noch Abzug bekäme)', () => {
    expect(fuehrungsformNote(3000, 50, 'Zweirichtungsradweg', 3.2, 'Veloroute').note).toBe(6)
    expect(fuehrungsformNote(3000, 50, 'Zweirichtungsradweg', 3.2, 'Velohauptroute').note).toBeLessThan(6)
  })
  it('strenger als der Einrichtungs-Radweg: 2,5 m sind dort ok, hier nicht', () => {
    expect(fuehrungsformNote(3000, 50, 'Radweg abgesetzt', 2.5, 'Velohauptroute').note).toBe(6)
    expect(fuehrungsformNote(3000, 50, 'Zweirichtungsradweg', 2.5, 'Velohauptroute').note).toBeLessThan(6)
  })
})

describe('Breitensatz — tempoabhängig (BREITE_SATZ, seit 10.08.2026)', () => {
  // Der Satz stammt aus derselben Geraden wie der feel-safe-Anker: der Anker ist ihr Wert
  // bei der Sollbreite, der Satz ihre Steigung. Die Steigung ist bei Tempo 50 spürbar
  // steiler als bei Tempo 30 — hinter baulicher Trennung dagegen kaum. Bis zum 10.08.2026
  // stand je Klasse ein einzelner Wert (die Tempo-30-Steigung), ohne dass das irgendwo
  // vermerkt war; diese Tests halten die Tempo-Abhängigkeit fest.
  it('Fahrbahn: derselbe Streifen wird an der schnellen Strasse härter abgezogen', () => {
    // Radstreifen 2,0 m an einer Velohauptroute (Soll 2,5) → 0,5 m Defizit.
    const langsam = fuehrungsformNote(6000, 30, 'Radstreifen', 2.0, 'Velohauptroute')
    const schnell = fuehrungsformNote(6000, 50, 'Radstreifen', 2.0, 'Velohauptroute')
    expect(langsam.breitenabzug).toBeCloseTo(0.29)   // 0,5 × 0,58
    expect(schnell.breitenabzug).toBeCloseTo(0.35)   // 0,5 × 0,70
    expect(schnell.breitenabzug).toBeGreaterThan(langsam.breitenabzug)
  })
  it('hinter baulicher Trennung fällt der Tempo-Unterschied fast weg', () => {
    const langsam = fuehrungsformNote(6000, 30, 'Radweg abgesetzt', 2.0, 'Velohauptroute')
    const schnell = fuehrungsformNote(6000, 50, 'Radweg abgesetzt', 2.0, 'Velohauptroute')
    expect(langsam.breitenabzug).toBeCloseTo(0.175)  // 0,5 × 0,35
    expect(schnell.breitenabzug).toBeCloseTo(0.19)   // 0,5 × 0,38
    // Der Sprung ist auf der Fahrbahn ein Vielfaches dessen hinter der Trennung.
    const spanneFahrbahn = BREITE_SATZ.Radstreifen.schnell - BREITE_SATZ.Radstreifen.ruhig
    const spanneBaulich = BREITE_SATZ.Radweg.schnell - BREITE_SATZ.Radweg.ruhig
    expect(spanneFahrbahn).toBeGreaterThan(spanneBaulich * 3)
  })
  it('Fahrgassen-Band (Mischverkehr-Klasse) bleibt tempo-unabhängig bei 0,9', () => {
    // Normativ, kein Gradient aus der Befragung ableitbar — hier darf das Tempo nichts ändern.
    expect(BREITE_SATZ.Mischverkehr.ruhig).toBe(0.9)
    expect(BREITE_SATZ.Mischverkehr.schnell).toBe(0.9)
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
    // Ruhiger Mischverkehr: Bern und Zürich verlangen beide Mischverkehr → Note beidseits 6.
    // (Der frühere Fall DTV 3000/T50 hatte unterschiedliche Solls — die Assertion hinter dem
    // `if (zh.note === bern)` lief daher NIE; jetzt wird die Gleichheit selbst mitgeprüft.)
    const v = vergleichsNoten({ dtv: 1000, v: 30, ist: 'Mischverkehr', routentyp: 'Veloroute' }, 'bern')
    const zh = v.find(x => x.stadt === 'zurich')!
    const bern = fuehrungsformNote(1000, 30, 'Mischverkehr', undefined, 'Veloroute').note
    expect(zh.note).toBe(bern)
    expect(zh.gruende).toEqual([])
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
  it('zu schmal → Abzug, aber weiterhin > 4 (Bern 2,50 m statt 3,50)', () => {
    // Satz baulich 0,35: 1,0 m Defizit → 6 − 0,35 = 5,65 → 5,5. (Ein 0,5-m-Defizit
    // verschwände beim 0,35er-Satz in der Rundung — darum hier das grössere.)
    const r = fuehrungsformNote(5000, 50, 'Kombinierter Fuss-/Radweg', 2.5, 'Velohauptroute')
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

  // 09.08.2026: Der Abzug ist pauschal 1,0 — vorher 1,5 aus der breitenabhängigen Formel
  // 0,6 + 0,9 × (3,5 − 2,5). Die Formel ist zurückgenommen (offener Punkt, s. fuehrungsform.ts).
  it('Bern: ohne Streifen → Dooring-Abzug 1,0 (pauschal, breitenunabhängig)', () => {
    const r = rs('bern', false)
    expect(r.parkenAbzug).toBeCloseTo(1.0)
  })
  it('Bern: der Abzug hängt NICHT mehr an der Streifenbreite', () => {
    expect(rs('bern', false, 1.5).parkenAbzug).toBeCloseTo(1.0)
    expect(rs('bern', false, 3.5).parkenAbzug).toBeCloseTo(1.0)
  })
  it('Bern: mit Streifen → kein Abzug, Note 1,0 Stufen höher', () => {
    const ohne = rs('bern', false).note
    const mit = rs('bern', true)
    expect(mit.parkenAbzug).toBe(0)
    expect(mit.note).toBe(ohne + 1.0)
  })
  it('stadtunabhängig: Zürich verhält sich gleich', () => {
    expect(rs('zurich', false).parkenAbzug).toBeCloseTo(1.0)
    expect(rs('zurich', true).parkenAbzug).toBe(0)
  })
  it('wirkungslos, wenn Parkierung rechts ≠ ja', () => {
    const r = fuehrungsformNote(1000, 30, 'Radstreifen', 2.5, 'Velohauptroute',
      'nein', undefined, 'keine', 'keine', undefined, false, undefined, 'bern', undefined, true)
    expect(r.parkenAbzug).toBe(0)
    expect(r.parkenSicherheitsstreifen).toBe(true)
  })
})

describe('Q7 — Einbahn mit Velogegenverkehr (dreistufig)', () => {
  const q7 = (ist: Parameters<typeof fuehrungsformNote>[2], breite: number | undefined, dtv: number, v = 50) =>
    fuehrungsformNote(dtv, v, ist, breite, 'Velohauptroute',
      'egal', undefined, 'keine', 'keine', undefined, false, undefined, 'bern', undefined)

  // Gegenstand dieser drei Zusagen ist die RANG-Logik (welche Q7-Stufe erfüllt welches Soll),
  // nicht die Soll-Tabelle. DTV/Tempo sind darum nur Mittel zum Zweck — sie wurden am
  // 10.08.2026 nachgezogen, weil das Band 41–50 km/h jetzt durchgehend «Übergang» ist.
  it('mit Markierung erfüllt Soll „Radstreifen" (Rang 1), breitenkonform → Note 6', () => {
    const r = q7('Einbahn Velogegenverkehr mit Markierung', 2.0, 3000, 40)  // fuehrungsart(3000,40)=Radstreifen
    expect(r.soll).toBe('Radstreifen')
    expect(r.note).toBe(6)
  })
  it('ohne Markierung verfehlt Soll „Radstreifen" (Rang 0) → Note < 6', () =>
    expect(q7('Einbahn Velogegenverkehr ohne Markierung', undefined, 3000, 40).note).toBeLessThan(6))
  it('mit baulicher Trennung erfüllt Soll „Radweg" (Rang 2) → Note 6', () => {
    const r = q7('Einbahn Velogegenverkehr mit baulicher Trennung', 2.0, 12000)  // fuehrungsart(12000,50)=Radweg
    expect(r.soll).toBe('Radweg')
    expect(r.note).toBe(6)
  })
  it('Stadt-Breiten je Q7-Variante', () => {
    expect(BREITEN_LUZERN['Einbahn Velogegenverkehr mit Markierung']).toEqual({ optimal: 2.5, minimal: 2.0 })
    expect(BREITEN_BASEL['Einbahn Velogegenverkehr mit Markierung']).toEqual({ optimal: 2.5, minimal: 1.8 })
    expect(BREITEN_ZUERICH['Einbahn Velogegenverkehr mit baulicher Trennung']).toEqual({ optimal: 1.8, minimal: 1.8 })
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Abzugsmechanik + Sonderfälle (Review-Nachrüstung): Tram-Malus, Velostrasse-
// Grenzen, Haltestellen-Abzug/-Breite, Erfüllungsskala, Breitenpflicht.
// ════════════════════════════════════════════════════════════════════════════

describe('Tram in der Fahrbahn (TRAM_MALUS)', () => {
  it('Mischverkehr T30: 6,0 → 5,0 (Malus 1,2; 4,8 rundet auf 5,0)', () => {
    const ohne = fuehrungsformNote(1000, 30, 'Mischverkehr')
    const mit = fuehrungsformNote(1000, 30, 'Mischverkehr', undefined, 'Velohauptroute',
      'egal', undefined, 'keine', 'keine', undefined, true)
    expect(ohne.note).toBe(6)
    expect(mit.tramAbzug).toBeCloseTo(1.2)
    expect(mit.note).toBe(5)
  })
  it('kein Malus bei Radstreifen (nur Mischverkehr betroffen)', () => {
    const r = fuehrungsformNote(3000, 30, 'Radstreifen', 2.5, 'Velohauptroute',
      'egal', undefined, 'keine', 'keine', undefined, true)
    expect(r.tramAbzug).toBe(0)
    expect(r.note).toBe(6)
  })
})

describe('Velostrasse — Grenzen', () => {
  it('v > 30 → Note 1 (nicht zulässig)', () => {
    const r = fuehrungsformNote(1000, 50, 'Velostrasse', 4.5)
    expect(r.note).toBe(1)
    expect(r.hinweis).toContain('Tempo 30')
  })
  it('zu breit (7,5 m > Band 6,5) → Abzug, Status „zu breit"', () => {
    const r = fuehrungsformNote(1000, 30, 'Velostrasse', 7.5)
    expect(r.breitenStatus).toBe('zu breit')
    expect(r.breitenDefizit).toBeCloseTo(1.0)
    expect(r.note).toBe(5)   // 6 − 1,0 · 0,9 = 5,1 → 5,0
  })
})

describe('Haltestelle — Abzug und Breite (Bern)', () => {
  it('Separate gefordert (Tram, Velohauptroute), Mischverkehr-Typ → Abzug 1,0', () => {
    const r = fuehrungsformNote(1000, 30, 'Mischverkehr', undefined, 'Velohauptroute',
      'egal', undefined, 'tram', 'Kaphaltestelle')
    expect(r.sollHaltestelle).toBe('Separate Velofläche')
    expect(r.haltestelleStatus).toBe('inkompatibel')
    expect(r.haltestelleAbzug).toBe(1)
    expect(r.note).toBe(5)
  })
  it('Übergang (Bus 5–15, Velohauptroute): Mischverkehr-Typ kompatibel, kein Abzug — und in der Typenliste', () => {
    const r = fuehrungsformNote(1000, 30, 'Mischverkehr', undefined, 'Velohauptroute',
      'egal', undefined, 'bus_5_15', 'Kaphaltestelle')
    expect(r.sollHaltestelle).toBe('Übergang')
    expect(r.haltestelleStatus).toBe('kompatibel')
    expect(r.haltestelleAbzug).toBe(0)
    // Liste und Abzugslogik deckungsgleich: der akzeptierte Typ steht auch in der Liste.
    expect(r.kompatibleHaltestellen).toContain('Kaphaltestelle')
    expect(r.note).toBe(6)
  })
  it('zu schmale Veloführung an der Haltestelle → hsBreitenabzug', () => {
    const r = fuehrungsformNote(1000, 30, 'Mischverkehr', undefined, 'Velohauptroute',
      'egal', undefined, 'tram', 'Haltestelle mit Veloumfahrung', 1.3)
    expect(r.hsBreitenSoll).toBe(1.8)
    expect(r.hsBreiteStatus).toBe('zu schmal')
    expect(r.hsBreitenabzug).toBeCloseTo(0.29)
    expect(r.note).toBe(5.5)   // 6 − 0,5 × 0,58 = 5,71 → 5,5
  })
  it('Haltestellen-Breite: der Abzug folgt dem Tempo wie auf der Strecke', () => {
    // Dieselbe zu schmale Haltestelle, nur an einer schnelleren Strasse: 0,5 m fehlen
    // × 0,70 statt × 0,58. Die Haltestellen-Breite nutzt bewusst den Radstreifen-Satz
    // (markierte Velofläche auf Fahrbahnniveau) — dann muss sie auch dessen Tempo-Logik
    // erben, sonst driftet sie gegen die Strecke.
    const langsam = fuehrungsformNote(1000, 30, 'Mischverkehr', undefined, 'Velohauptroute',
      'egal', undefined, 'tram', 'Haltestelle mit Veloumfahrung', 1.3)
    const schnell = fuehrungsformNote(1000, 50, 'Mischverkehr', undefined, 'Velohauptroute',
      'egal', undefined, 'tram', 'Haltestelle mit Veloumfahrung', 1.3)
    expect(schnell.hsBreitenabzug).toBeCloseTo(0.35)
    expect(schnell.hsBreitenabzug).toBeGreaterThan(langsam.hsBreitenabzug)
  })
})

describe('erfuellungsgrad + brauchtBreite', () => {
  it('Notenstufen → Erfüllungsskala', () => {
    expect(erfuellungsgrad(6)).toBe('Vollständig erfüllt')
    expect(erfuellungsgrad(5.5)).toBe('Vollständig erfüllt')
    expect(erfuellungsgrad(5)).toBe('Weitgehend erfüllt')
    expect(erfuellungsgrad(4)).toBe('Teilweise erfüllt')
    expect(erfuellungsgrad(3)).toBe('Gar nicht erfüllt')
  })
  it('Formen ohne Breiten-Vorgabe brauchen keine Breite (Guard-/UI-Kopplung)', () => {
    expect(brauchtBreite('Mischverkehr')).toBe(false)
    expect(brauchtBreite('Einbahn Velogegenverkehr ohne Markierung')).toBe(false)
    expect(brauchtBreite('Radstreifen')).toBe(true)
    expect(brauchtBreite('Velostrasse')).toBe(true)
  })
  it('Einbahn ohne Markierung: Note auch ohne Breite berechenbar (keine Sackgasse)', () => {
    const r = fuehrungsformNote(1000, 30, 'Einbahn Velogegenverkehr ohne Markierung')
    expect(r.note).toBeGreaterThanOrEqual(1)
    expect(r.breitenStatus).toBe('keine')
  })
})

describe('DTV/Tempo-Unabhängigkeit — brauchtDtvTempo()', () => {
  const DTVS = [0, 1500, 12000, NaN]
  const TEMPI = [20, 30, 50, 60, NaN]
  // Note über alle DTV×Tempo-Kombinationen sammeln; bei den unabhängigen Formen muss es genau
  // EINEN Wert geben. Das ist der Nachweis, dass das Prädikat die richtigen Formen nennt.
  const noten = (ist: IstFuehrungsform, breite: number | undefined, takt?: number) =>
    new Set(DTVS.flatMap(dtv => TEMPI.map(v =>
      fuehrungsformNote(dtv, v, ist, breite, 'Velohauptroute',
        'egal', takt, 'keine', 'keine', undefined, false, undefined, 'bern').note)))

  it('Umweltspur ohne Takt: Note unabhängig von DTV und Tempo', () =>
    expect(noten('Umweltspur', undefined)).toEqual(new Set([5])))
  it('Umweltspur mit Takt 6: Note unabhängig von DTV und Tempo', () =>
    expect(noten('Umweltspur', undefined, 6)).toEqual(new Set([2])))
  it('Umweltspur mit Takt 8: Note unabhängig von DTV und Tempo', () =>
    expect(noten('Umweltspur', undefined, 8)).toEqual(new Set([4])))
  it('Fussweg Velo gestattet: Note unabhängig von DTV und Tempo', () =>
    expect(noten('Fussweg Velo gestattet', 3.5)).toEqual(new Set([4])))

  it('brauchtDtvTempo: false nur für diese beiden Formen', () => {
    expect(brauchtDtvTempo('Umweltspur')).toBe(false)
    expect(brauchtDtvTempo('Fussweg Velo gestattet')).toBe(false)
    expect(brauchtDtvTempo('Mischverkehr')).toBe(true)
    expect(brauchtDtvTempo('Velostrasse')).toBe(true)
    expect(brauchtDtvTempo('Zweirichtungsradweg')).toBe(true)
  })

  // Gegenprobe: wo die Felder wirken, MUSS die Note variieren — sonst wäre das Prädikat zu weit.
  it('Gegenprobe Velostrasse: Tempo entscheidet (30 → 6, 50 → 1)', () => {
    const vs = (v: number) => fuehrungsformNote(1000, v, 'Velostrasse', 4.5, 'Velohauptroute',
      'egal', undefined, 'keine', 'keine', undefined, false, undefined, 'bern').note
    expect(vs(30)).toBe(6)
    expect(vs(50)).toBe(1)
  })
  it('Gegenprobe Mischverkehr: DTV entscheidet (1000/30 → 6, 12000/30 → schlechter)', () => {
    const mv = (dtv: number) => fuehrungsformNote(dtv, 30, 'Mischverkehr', undefined, 'Velohauptroute',
      'egal', undefined, 'keine', 'keine', undefined, false, undefined, 'bern').note
    expect(mv(1000)).toBe(6)
    expect(mv(12000)).toBeLessThan(6)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Runde AS6: Lücken aus dem Review — Rundung, Übergangs-Soll, Kumulation/Boden,
// Decken exakt, Haltestellen-Typlisten inhaltlich.
// ════════════════════════════════════════════════════════════════════════════

describe('roundToHalf — kaufmännisch auf halbe Noten (half-up)', () => {
  it('rundet exakt auf 0,5-Schritte, Viertelwerte nach oben', () => {
    expect(roundToHalf(3.25)).toBe(3.5)   // x,25 → aufwärts (Math.round(0.5) = 1)
    expect(roundToHalf(3.75)).toBe(4.0)
    expect(roundToHalf(3.24)).toBe(3.0)
    expect(roundToHalf(3.26)).toBe(3.5)
    expect(roundToHalf(5.999)).toBe(6.0)
    expect(roundToHalf(1.0)).toBe(1.0)
  })
})

describe('Übergangs-Soll «Radstreifen oder Radweg» — Zielwert ist der Mittelwert', () => {
  it('Ist Radstreifen bei Soll «Radstreifen oder Radweg» → exakt 5,5', () => {
    // Bern DTV 6000/T30 → Soll «Radstreifen oder Radweg» (Ziel = Mittel aus 74 und 92 = 83).
    // Radstreifen 74 → Defizit 9 Pkt = 0,625 Noten → 5,375 → gerundet 5,5.
    const r = fuehrungsformNote(6000, 30, 'Radstreifen', 2.5, 'Velohauptroute')
    expect(r.soll).toBe('Radstreifen oder Radweg')
    expect(r.note).toBe(5.5)
  })
})

describe('Abzugs-Kumulation — Boden bei Note 1,0', () => {
  it('Formdefizit + Parkierung + Tram drücken nie unter 1,0', () => {
    // Mischverkehr bei Soll Radweg/T50: Basis 1 (Defizit 72 Pkt = 5 Noten); Parken −1, Tram −0,55.
    const r = fuehrungsformNote(15000, 50, 'Mischverkehr', undefined, 'Velohauptroute',
      'ja', undefined, 'keine', 'keine', undefined, true)
    expect(r.note).toBe(1)
  })
})

describe('Decken exakt (nicht durch Rundung überschreitbar)', () => {
  it('Fussweg Velo gestattet ohne Abzüge → exakt 4,0', () => {
    const r = fuehrungsformNote(1000, 30, 'Fussweg Velo gestattet')
    expect(r.note).toBe(4)
  })
  it('Umweltspur Bern mit gutem Takt (≥ 15) → exakt 5,0 (Berner Decke)', () => {
    const r = fuehrungsformNote(1000, 30, 'Umweltspur', undefined, 'Velohauptroute',
      'egal', 20, 'keine', 'keine', undefined, false, undefined, 'bern')
    expect(r.note).toBe(5)
  })
  it('Umweltspur Zürich mit gutem Takt → exakt 4,0 (Decke der übrigen Städte)', () => {
    const r = fuehrungsformNote(1000, 30, 'Umweltspur', undefined, 'Velohauptroute',
      'egal', 20, 'keine', 'keine', undefined, false, undefined, 'zurich')
    expect(r.note).toBe(4)
  })
})

describe('Haltestellen-Typlisten — inhaltlich (Familien-Konsistenz)', () => {
  it('Bern: Breite nur bei den Separate-Typen, Mischverkehr-Familie ohne Breitenfeld', () => {
    const mitBreite = haltestellenMitBreite('bern')
    expect(mitBreite.sort()).toEqual([
      'Haltestelle mit Veloumfahrung', 'Haltestelle mit rückwärtigem Radweg',
      'Inselhaltestelle', 'Kaphaltestelle mit Veloüberfahrt',
    ].sort())
    for (const typ of ['Kaphaltestelle', 'Fahrbahnhaltestelle', 'Busbucht'] as const) {
      expect(mitBreite, typ).not.toContain(typ)
    }
  })
  it('jede Stadt: haltestellenMitBreite ist Teilmenge von haltestellenTypen', () => {
    for (const stadt of ['bern', 'zurich', 'basel', 'luzern'] as const) {
      const alle = haltestellenTypen(stadt)
      for (const typ of haltestellenMitBreite(stadt)) expect(alle, `${stadt}: ${typ}`).toContain(typ)
    }
  })
})
