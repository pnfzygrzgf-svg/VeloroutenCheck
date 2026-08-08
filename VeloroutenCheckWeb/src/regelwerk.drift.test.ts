// ── Drift-Wächter: docs/regelwerk.json ↔ Code-Konstanten ─────────────────────
//
// docs/regelwerk.json ist die handgepflegte Parallel-Dokumentation (Quelle für
// docs/regelwerk.md und die Stadt-Prüf-PDFs). Sie wird von der App NICHT geladen —
// massgeblich bleibt fuehrungsform.ts. Genau deshalb driftet sie leise, wenn eine
// Konstante im Code ändert (so geschehen bei der Umweltspur-Decke und bei
// PARKEN_RELEVANT). Dieser Test bricht `npm test` (und damit das CI-Gate vor dem
// Deploy), bis die Dokumentation nachgezogen und neu generiert ist:
//   1. docs/regelwerk.json anpassen
//   2. python3 tools/generiere_dokumentation.py   (regelwerk.md)
//   3. python3 tools/generiere_stadt_pdf.py       (Stadt-PDFs)
//
// Bewusst NICHT abgeglichen: die Soll-Matrizen und Breiten-Tabellen je Stadt —
// deren JSON-Struktur (Q-Blatt-Labels, Zusatzspalten wie «minimum») ist Doku-
// eigen und ohne fragile Label-Zuordnung nicht maschinell vergleichbar.

import { describe, expect, it } from 'vitest'
import regelwerk from '../../docs/regelwerk.json'
import {
  FEELSAFE, FUSSWEG_BASIS, HALTESTELLE_ABZUG, NOTE_PRO_METER, PARKEN_RECHTS_ABZUG,
  PARKEN_RELEVANT, SCORE_PRO_NOTE, TRAM_MALUS, UMWELTSPUR_DECKE, UMWELTSPUR_TAKT,
} from './fuehrungsform'

const param = regelwerk.parameter

describe('regelwerk.json spiegelt die Code-Konstanten (Parameter)', () => {
  it('feelSafeProNote = SCORE_PRO_NOTE', () => {
    expect(param.feelSafeProNote.wert).toBe(SCORE_PRO_NOTE)
  })
  it('noteProMeter = NOTE_PRO_METER', () => {
    expect(param.noteProMeter.wert).toBe(NOTE_PRO_METER)
  })
  it('parkenRechtsAbzug = PARKEN_RECHTS_ABZUG', () => {
    expect(param.parkenRechtsAbzug.wert).toBe(PARKEN_RECHTS_ABZUG)
  })
  it('haltestelleAbzug = HALTESTELLE_ABZUG', () => {
    expect(param.haltestelleAbzug.wert).toBe(HALTESTELLE_ABZUG)
  })
  it('fusswegBasis = FUSSWEG_BASIS', () => {
    expect(param.fusswegBasis.wert).toBe(FUSSWEG_BASIS)
  })
  it('tramMalus (ruhig/schnell) = TRAM_MALUS', () => {
    expect(param.tramMalus.ruhig).toBe(TRAM_MALUS.ruhig)
    expect(param.tramMalus.schnell).toBe(TRAM_MALUS.schnell)
  })
  it('parkenRelevant.formen = PARKEN_RELEVANT (gleiche Menge)', () => {
    expect([...param.parkenRelevant.formen].sort()).toEqual([...PARKEN_RELEVANT].sort())
  })
})

describe('regelwerk.json spiegelt die feel-safe-Anker', () => {
  it('werte = FEELSAFE (Mischverkehr/Radstreifen/Radweg, ruhig+schnell)', () => {
    const w = regelwerk.feelSafe.werte
    for (const klasse of ['Mischverkehr', 'Radstreifen', 'Radweg'] as const) {
      expect(w[klasse].ruhig, `${klasse} ruhig`).toBe(FEELSAFE[klasse].ruhig)
      expect(w[klasse].schnell, `${klasse} schnell`).toBe(FEELSAFE[klasse].schnell)
    }
  })
})

describe('regelwerk.json spiegelt die Umweltspur-Regeln', () => {
  // JSON führt die Städte unter ihren Anzeigenamen, der Code unter den Ids.
  const STADT = { Bern: 'bern', 'Zürich': 'zurich', Luzern: 'luzern', Basel: 'basel' } as const
  const proStadt = regelwerk.umweltspuren.proStadt

  it('Decke je Stadt = UMWELTSPUR_DECKE', () => {
    for (const [name, id] of Object.entries(STADT)) {
      expect(proStadt[name as keyof typeof STADT].decke, name).toBe(UMWELTSPUR_DECKE[id])
    }
  })
  it('Bern: Stufen-Bänder + Warnschwelle = UMWELTSPUR_TAKT.bern', () => {
    const regel = UMWELTSPUR_TAKT.bern
    if (regel?.art !== 'stufen') throw new Error('Bern-Regel ist nicht mehr «stufen» — JSON prüfen')
    expect(proStadt.Bern.baender).toEqual(regel.baender)
    expect(proStadt.Bern.warnAb).toBe(regel.warnAb)
  })
  it('Zürich/Luzern: Rampen-Anker = UMWELTSPUR_TAKT', () => {
    for (const [name, id] of [['Zürich', 'zurich'], ['Luzern', 'luzern']] as const) {
      const regel = UMWELTSPUR_TAKT[id]
      if (regel?.art !== 'rampe') throw new Error(`${name}-Regel ist nicht mehr «rampe» — JSON prüfen`)
      expect(proStadt[name].taktNote1, `${name} taktNote1`).toBe(regel.taktNote1)
      expect(proStadt[name].taktOk, `${name} taktOk`).toBe(regel.taktOk)
    }
  })
  it('Basel: keine Takt-Abhängigkeit (Regel null, JSON-Anker null)', () => {
    expect(UMWELTSPUR_TAKT.basel).toBeNull()
    expect(proStadt.Basel.taktNote1).toBeNull()
    expect(proStadt.Basel.taktOk).toBeNull()
  })
})
