import { describe, it, expect } from 'vitest'
import { beschreibeBasel, beschreibeBern, beschreibeLuzern, beschreibeZuerich, netzTexte, ROUTENNETZ } from './routennetz'

// Merkmale wie bei den Proben vom 30.10.2026 (GetFeatureInfo der vier Dienste)
describe('Routennetz: Erklärung beim Überfahren', () => {
  it('Bern: Veloroutentyp, Velohauptroute nur mit Nummer oder Name, «Null» zählt nicht', () => {
    expect(beschreibeBern({ VELOROUTENTYP: '2', NUMMER_VELOHAUPTROUTEN: 'Null', NAME_VELOHAUPTROUTEN: 'Null', STRASSENNAME: 'Speichergasse' }))
      .toBe('Velohauptroute abseits Hauptverkehrsachsen · Speichergasse')
    expect(beschreibeBern({ VELOROUTENTYP: '1', NUMMER_VELOHAUPTROUTEN: '3', NAME_VELOHAUPTROUTEN: 'Nord', STRASSENNAME: 'Papiermühlestrasse' }))
      .toBe('Velohauptroute entlang Hauptverkehrsachsen · Velohauptroute 3 «Nord» · Papiermühlestrasse')
    expect(beschreibeBern({ VELOROUTENTYP: 'Null' })).toBeNull()
  })
  it('Zürich: Kategorie der Velonetzplanung', () => {
    expect(beschreibeZuerich({ kategorie: 'Vorzugsroute' })).toBe('Velovorzugsroute (Velonetzplanung)')
    expect(beschreibeZuerich({ kategorie: 'Basisnetz' })).toBe('Basisnetz (Velonetzplanung)')
    expect(beschreibeZuerich({ kategorie: null })).toBeNull()
  })
  it('Basel: Netzstufe, Stand, Massnahmennummer (die Buchstaben auf der Karte), als Entwurf gekennzeichnet', () => {
    expect(beschreibeBasel({ Velovorzugsroute: true, Velohauptverbindung: null, Velonebenverbindung: null, Status: 'geplant (Festsetzung)',
      'Massnahmennummer Veloinfrastruktur': 'L' })).toBe('Velovorzugsroute · geplant (Festsetzung) · Massnahme L (Entwurf Teilrichtplan Velo 2026)')
    expect(beschreibeBasel({ Velonebenverbindung: true, Status: 'Bestand', 'Massnahmennummer Veloinfrastruktur': null }))
      .toBe('Velonebenverbindung · Bestand (Entwurf Teilrichtplan Velo 2026)')
    expect(beschreibeBasel({ Status: 'Bestand' })).toBeNull()
  })
  it('Luzern: Routentyp, Strasse, Massnahme mit Umsetzung', () => {
    expect(beschreibeLuzern({ VELO_ROUTENTYP: 'keine Velonetz-Route', STRASSE: 'Stiftsstrasse', VELO_MN_BEZEICHNUNG: 'Null' }))
      .toBe('keine Velonetz-Route · Stiftsstrasse')
    expect(beschreibeLuzern({ VELO_ROUTENTYP: 'Velohauptroute', STRASSE: 'Hirschmattstrasse', VELO_MN_BEZEICHNUNG: 'Velostreifen', VELO_MN_UMSETZUNG: 'geplant', VELO_MN_JAHR_ABSCHLUSS: '2028' }))
      .toBe('Velohauptroute · Hirschmattstrasse · Massnahme: Velostreifen (geplant, 2028)')
  })
  it('mehrere Linien an einer Stelle: höchste Netzstufe zuerst, doppelte nur einmal (Zürich: Vorzugsroute über Basisnetz)', () => {
    expect(netzTexte(['Basisnetz (Velonetzplanung)', 'Velovorzugsroute (Velonetzplanung)', 'Basisnetz (Velonetzplanung)']))
      .toEqual(['Velovorzugsroute (Velonetzplanung)', 'Basisnetz (Velonetzplanung)'])
  })
  it('QGIS Server (Zürich, Basel) mit Fangtoleranz, ArcGIS (Bern, Luzern) ohne', () => {
    expect(ROUTENNETZ.zurich?.infoExtra?.FI_LINE_TOLERANCE).toBe('8')
    expect(ROUTENNETZ.basel?.infoExtra?.FI_LINE_TOLERANCE).toBe('8')
    expect(ROUTENNETZ.bern?.infoExtra).toBeUndefined()
  })
  it('alle vier Städte haben ein Netz mit JSON-Format für die Abfrage', () => {
    for (const k of ['bern', 'zurich', 'basel', 'luzern'] as const) expect(ROUTENNETZ[k]?.infoFormat).toMatch(/json/)
  })
})
