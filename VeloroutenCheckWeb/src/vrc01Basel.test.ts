// Abnahmetests Prüfung VRC-01 (10.11.2026): Basler Standards Fuss- und Veloverkehrsinfrastruktur (27.09.2024), Tab. 3 (S. 15),
// Tab. 4 und 5 (S. 16), Abschnitt 1.3 (S. 6) und 5.1.2 (S. 42); Festlegung vom 10.11.2026 (DTV-Annahme, Tempo und Strassenfunktion
// getrennt). Übertragung der Tabellen: Review_2026-11-10/BERICHT.md, Abschnitt «VRC-01: Vollständige Übertragung der Basler Tabellen 3–5».
import { describe, expect, it } from 'vitest'
import { BASEL_TAB3, baselBreite, baselFormBefund, baselSoll, baselTempo, baselZuschlaege, BASEL_DTV_ANNAHME, BASEL_DWV_NAEHERUNG,
  RADSPUR_TEXT, type BaselSpalte } from './baselStandard'
import { BREITEN_BASEL, BREITEN_ZUERICH, formAnzeige, fuehrungsart, fuehrungsformNote, vergleichsNoten, type IstFuehrungsform } from './fuehrungsform'
import { bewerteAbschnitt } from './bewertung'
import { defaultSection, gegenVon, type Section } from './strecke'
import { fallLesen, fallText } from './fallDatei'
import { notenHerleitung } from './Bericht'
import { tempoRegimeAus } from './basel'
import { vorschlagRechnen } from './vorschlag'

const abschnitt = (x: Partial<Section>): Section => ({ ...defaultSection(), ...x })
const note = (ist: IstFuehrungsform, breite: number | undefined, route: 'Velohauptroute' | 'Veloroute', strassentyp: 'verkehrsorientiert' | 'siedlungsorientiert',
  v = 30, extra: Parameters<typeof fuehrungsformNote>[15] = { regime: 'dauerhaft' }, dtv = 8000) =>
  fuehrungsformNote(dtv, v, ist, breite, route, 'egal', undefined, 'keine', 'keine', undefined, false, BREITEN_BASEL[ist], 'basel', strassentyp, false, extra)

describe('VRC-01 · Tab. 3 vollständig (6 Zeilen × 6 Führungsformen, mit DWV-Grenzen)', () => {
  // Erwartung: Übertragung im Bericht (E = empfohlen, A = Ausnahmefall, - = keine Zuordnung)
  const SP: BaselSpalte[] = ['Mischverkehr', 'Velostrasse', 'Radstreifen', 'Radspur', 'Radweg', 'Busspur mit Velozulassung']
  const SOLL: [30 | 50, 'siedlungsorientiert' | 'verkehrsorientiert', 'Velohauptroute' | 'Veloroute', string[]][] = [
    [30, 'siedlungsorientiert', 'Velohauptroute', ['-', 'E2500', '-', '-', '-', '-']],
    [30, 'siedlungsorientiert', 'Veloroute', ['E5000', 'A', '-', '-', '-', '-']],
    [30, 'verkehrsorientiert', 'Velohauptroute', ['-', '-', 'A', 'E', 'E', 'A']],
    [30, 'verkehrsorientiert', 'Veloroute', ['A5000', '-', 'E', 'E', 'A', 'A']],
    [50, 'verkehrsorientiert', 'Velohauptroute', ['-', '-', 'A', 'E', 'E', 'A']],
    [50, 'verkehrsorientiert', 'Veloroute', ['-', '-', 'E', 'E', 'A', 'A']],
  ]
  it('jede Zelle wie im Original; keine Zeile «Tempo 50, nicht verkehrsorientiert»', () => {
    expect(BASEL_TAB3).toHaveLength(6)
    for (const [t, f, r, zellen] of SOLL) {
      const z = BASEL_TAB3.find(x => x.tempo === t && x.funktion === f && x.route === r)!
      expect(SP.map(s => (z.zellen[s] ? `${z.zellen[s]!.stufe}${z.zellen[s]!.dwvMax ?? ''}` : '-')), `${t} ${f} ${r}`).toEqual(zellen)
    }
    expect(BASEL_TAB3.some(z => z.tempo === 50 && z.funktion === 'siedlungsorientiert')).toBe(false)
  })
  it('Tempo 30, verkehrsorientiert: Vorzugsroute Radspur oder Radweg empfohlen; Basis-/Pendlerroute Radstreifen oder Radspur', () => {
    expect(baselSoll('verkehrsorientiert', 'Velohauptroute', 30, 'dauerhaft')).toMatchObject({ status: 'bestimmt', empfohlen: ['Radspur', 'Radweg'], ausnahme: ['Radstreifen', 'Busspur mit Velozulassung'] })
    expect(baselSoll('verkehrsorientiert', 'Veloroute', 30, 'dauerhaft')).toMatchObject({ empfohlen: ['Radstreifen', 'Radspur'], ausnahme: ['Mischverkehr', 'Radweg', 'Busspur mit Velozulassung'] })
    expect(fuehrungsart(NaN, 30, 'basel', 'Velohauptroute', 'verkehrsorientiert', 'dauerhaft')).toBe('Radspur oder Radweg')
    expect(fuehrungsart(NaN, 30, 'basel', 'Veloroute', 'verkehrsorientiert', 'dauerhaft')).toBe('Radstreifen oder Radspur')
  })
  it('Ausnahmeform: Hinweis «nur im Ausnahmefall», kein zusätzlicher Abzug; leere Zelle ist kein Verbot', () => {
    const rs = note('Radstreifen', 1.8, 'Velohauptroute', 'verkehrsorientiert'), sp = note('Radspur', 2.5, 'Velohauptroute', 'verkehrsorientiert')
    expect(rs.basel!.form.status).toBe('ausnahme')
    expect(rs.warnung).toContain('nur im Ausnahmefall')
    expect(rs.note).toBe(sp.note)   // gleiche Trennstufe, gleiche Note
    expect(baselFormBefund(baselSoll('verkehrsorientiert', 'Velohauptroute', 50), 'Mischverkehr').text).toContain('keine Aussage über ein Verbot')
  })
})

describe('VRC-01 · Begleitregeln zu Tempo, Regime und Strassenfunktion', () => {
  it('Tempo 40 und zeitweise Tempo 30 → Vorgaben Tempo 50; dauerhaft Tempo 30 → Zeile Tempo 30', () => {
    expect(baselTempo(40).klasse).toBe(50)
    expect(baselTempo(30, 'zeitweise').klasse).toBe(50)
    expect(baselTempo(30, 'dauerhaft').klasse).toBe(30)
    expect(baselSoll('verkehrsorientiert', 'Veloroute', 40).text).toContain('Tempo 40: es gelten die Vorgaben von Tempo 50')
  })
  it('verkehrsorientiert mit Tempo 30 bleibt Tempo 30 (keine Umdeutung zu Tempo 50 oder zu nicht verkehrsorientiert)', () => {
    const s = baselSoll('verkehrsorientiert', 'Veloroute', 30, 'dauerhaft')
    expect(s.zeilen).toHaveLength(1)
    expect(s.zeilen[0]).toMatchObject({ tempo: 30, funktion: 'verkehrsorientiert' })
    expect(baselFormBefund(s, 'Mischverkehr')).toMatchObject({ status: 'ausnahme', dwvMax: 5000 })
  })
  it('nicht verkehrsorientiert mit Tempo 50, 40 bzw. zeitweise 30: «durch Tab. 3 nicht abgedeckt», keine Ersatzzeile, keine Note', () => {
    for (const [v, r] of [[50, undefined], [40, undefined], [30, 'zeitweise']] as const) {
      const s = baselSoll('siedlungsorientiert', 'Velohauptroute', v, r)
      expect(s.status, `${v} ${r}`).toBe('nicht_abgedeckt')
      expect(s.text).toContain('durch Tab. 3 nicht abgedeckt')
      const e = bewerteAbschnitt(abschnitt({ speed: v, ist: 'Mischverkehr', routentyp: 'Velohauptroute', strassentyp: 'siedlungsorientiert',
        ...(r ? { tempoRegime: r } : {}) }), 'basel', BREITEN_BASEL)
      expect(e.note).toBeNull()
      expect(e.seiten[0].offen).toContain('nicht abgedeckt')
    }
  })
  it('Regime unbekannt (alte Falldatei): offen nur, wo das Ergebnis davon abhängt', () => {
    // nicht verkehrsorientiert, Tempo 30: dauerhaft → Zeile Tempo 30, zeitweise → nicht abgedeckt
    const e = bewerteAbschnitt(abschnitt({ speed: 30, ist: 'Mischverkehr', routentyp: 'Veloroute', strassentyp: 'siedlungsorientiert' }), 'basel', BREITEN_BASEL)
    expect(e.note).toBeNull()
    expect(e.seiten[0].offen).toContain('Regime unbekannt')
    // verkehrsorientiert, Basisroute: nur der Mischverkehr (Ausnahme bis 5’000 nur bei Tempo 30) hängt am Regime
    const mv = bewerteAbschnitt(abschnitt({ speed: 30, ist: 'Mischverkehr', routentyp: 'Veloroute', strassentyp: 'verkehrsorientiert' }), 'basel', BREITEN_BASEL)
    expect(mv.seiten[0].offen).toContain('hängt vom Tempo-Regime ab')
    const rs = bewerteAbschnitt(abschnitt({ speed: 30, ist: 'Radstreifen', breite: 1.8, routentyp: 'Veloroute', strassentyp: 'verkehrsorientiert' }), 'basel', BREITEN_BASEL)
    expect(rs.note).toBe(6)
  })
  it('Tempo 20 (Begegnungszone) bzw. 60: nicht abgedeckt, mit Hinweis zur Begegnungszone', () => {
    expect(baselSoll('siedlungsorientiert', 'Velohauptroute', 20).text).toContain('Begegnungszonen soll vermieden werden')
    expect(baselSoll('verkehrsorientiert', 'Velohauptroute', 60).status).toBe('nicht_abgedeckt')
  })
  it('Formen mit eigener Regel bleiben ohne bestimmbare Vorgabe bewertbar (Umweltspur, Fussweg Velo gestattet)', () => {
    const e = bewerteAbschnitt(abschnitt({ speed: 50, ist: 'Umweltspur', breite: 4.5, routentyp: 'Veloroute', strassentyp: 'siedlungsorientiert' }), 'basel', BREITEN_BASEL)
    expect(e.note).toEqual(expect.any(Number))
  })
  it('Strassenfunktion fehlt: kein Basler Vergleich, die anderen Städte bleiben; keine Schätzung aus dem Tempo', () => {
    const v = vergleichsNoten({ dtv: 9000, v: 50, ist: 'Radstreifen', breite: 1.8 }, 'bern')
    expect(v.find(x => x.stadt === 'basel')).toMatchObject({ note: null, offen: 'Strassenfunktion fehlt' })
    expect(v.filter(x => x.note != null).map(x => x.stadt).sort()).toEqual(['luzern', 'zurich'])
  })
  it('Regime aus data.bs.ch 100250 (Feld «regime»)', () => {
    expect(tempoRegimeAus('Tempo 50 generell - zeitlich auf Tempo 30 begrenzt (Schule)')).toBe('zeitweise')
    expect(tempoRegimeAus('Tempo 30-Zone (Lärmschutz, Lufthygiene)')).toBe('dauerhaft')
    expect(tempoRegimeAus('Tempo 30-Strecke')).toBe('dauerhaft')
    expect(tempoRegimeAus('Tempo 50 generell')).toBeUndefined()
    expect(tempoRegimeAus('Begegnungszone')).toBeUndefined()
  })
})

describe('VRC-01 · Radspur und Breiten nach Tab. 4', () => {
  it('Radspur heisst überall «Radspur (überbreiter Velostreifen)»', () => {
    expect(formAnzeige('Radspur')).toBe(RADSPUR_TEXT)
    expect(formAnzeige('Radspur oder Radweg')).toBe('Radspur (überbreiter Velostreifen) oder Radweg')
    expect(formAnzeige('Radstreifen oder Radspur')).toBe('Velostreifen oder Radspur (überbreiter Velostreifen)')
  })
  it('2,50-m-Radspur auf der Vorzugsroute (Tempo 30, verkehrsorientiert): empfohlen, Standardmass erfüllt, Note 5 (Abstufung nach Separation bleibt)', () => {
    const r = note('Radspur', 2.5, 'Velohauptroute', 'verkehrsorientiert')
    expect(r.basel!.form.status).toBe('empfohlen')
    expect(r.sollbreite).toBe(2.5)
    expect(r.breitenStatus).toBe('erfuellt')
    expect(r.note).toBe(5)
    expect(note('Radweg strassenbegleitend / Geschützter Radstreifen', 2.5, 'Velohauptroute', 'verkehrsorientiert').note).toBe(6)
  })
  it('Radstreifen 1,80 / 1,60 m, Radspur 2,50 / 2,20 m; reduziert nur mit Begründung', () => {
    expect(baselBreite('Radstreifen', 'Veloroute')).toMatchObject({ standard: 1.8, reduziert: 1.6, soll: 1.8, reduziertAngewendet: false })
    expect(baselBreite('Radstreifen', 'Veloroute', { abweichung: 'Engstelle 40 m, Baumreihe' })).toMatchObject({ soll: 1.6, reduziertAngewendet: true })
    expect(baselBreite('Radstreifen', 'Veloroute', { abweichung: '   ' })).toMatchObject({ soll: 1.8, reduziertAngewendet: false })
    expect(baselBreite('Radspur', 'Velohauptroute')).toMatchObject({ standard: 2.5, reduziert: 2.2, soll: 2.5 })
    expect(baselBreite('Radspur', 'Velohauptroute', { abweichung: 'Brücke' })).toMatchObject({ soll: 2.2, reduziertAngewendet: true })
  })
  it('Routenklasse allein reduziert nichts: Basisroute misst gegen das Standardmass', () => {
    const r = note('Radweg strassenbegleitend / Geschützter Radstreifen', 2.2, 'Veloroute', 'verkehrsorientiert')
    expect(r.sollbreite).toBe(2.5)
    expect(r.breitenStatus).toBe('zu schmal')
    const b = note('Radweg strassenbegleitend / Geschützter Radstreifen', 2.2, 'Veloroute', 'verkehrsorientiert', 30, { regime: 'dauerhaft', abweichung: 'Platz fehlt' })
    expect(b).toMatchObject({ sollbreite: 2.2, breitenStatus: 'erfuellt' })
    expect(b.basel!.breite!.reduziertAngewendet).toBe(true)
  })
  it('gewöhnlicher Radstreifen auf der Vorzugsroute: auch mit Begründung mindestens 1,80 m', () => {
    expect(baselBreite('Radstreifen', 'Velohauptroute', { abweichung: 'Engstelle' })).toMatchObject({ soll: 1.8, reduziertAngewendet: false })
    expect(note('Radstreifen', 1.6, 'Velohauptroute', 'verkehrsorientiert', 30, { regime: 'dauerhaft', abweichung: 'Engstelle' }).breitenStatus).toBe('zu schmal')
  })
  it('Zweirichtungsradweg: 4,00 m bei Vorzugsroute, Landsicherung bzw. langlebigem Neubau (je eigenständig); sonst 3,40 / 2,80; unbekannt → offen', () => {
    expect(baselBreite('Zweirichtungsradweg', 'Velohauptroute')!.soll).toBe(4.0)
    expect(baselBreite('Zweirichtungsradweg', 'Veloroute', { zrw: { landsicherung: true } })!.soll).toBe(4.0)
    expect(baselBreite('Zweirichtungsradweg', 'Veloroute', { zrw: { neubau: true } })!.soll).toBe(4.0)
    expect(baselBreite('Zweirichtungsradweg', 'Veloroute', { zrw: { landsicherung: false, neubau: false } })).toMatchObject({ soll: 3.4, reduziert: 2.8 })
    expect(baselBreite('Zweirichtungsradweg', 'Velohauptroute', { abweichung: 'x' })).toMatchObject({ soll: 4.0, reduziert: null })
    const offen = note('Zweirichtungsradweg', 3.6, 'Veloroute', 'verkehrsorientiert')
    expect(offen.breitenStatus).toBe('offen')
    expect(offen.breitenabzug).toBe(0)
    expect(note('Zweirichtungsradweg', 3.6, 'Veloroute', 'verkehrsorientiert', 30, { regime: 'dauerhaft', zrw: { landsicherung: false, neubau: false } }).breitenStatus).toBe('erfuellt')
  })
  it('Velostrasse: Nettofahrbahnbreite 4,50 / 4,30 m, unter 1’000 Fz/d (nicht genau 1’000) 4,00 m; Busspur 4,50 / 3,00 m mit Überholbedingung', () => {
    expect(baselBreite('Velostrasse', 'Velohauptroute', { dtv: 999 })!.soll).toBe(4.0)
    expect(baselBreite('Velostrasse', 'Velohauptroute', { dtv: 1000 })!.soll).toBe(4.5)
    expect(baselBreite('Umweltspur', 'Veloroute')).toMatchObject({ standard: 4.5, reduziert: 3.0, soll: 4.5 })
    expect(baselBreite('Umweltspur', 'Veloroute')!.texte.join(' ')).toContain('damit Busse Velos überholen können')
  })
  it('Einbahn mit Velogegenverkehr: markiert wie Radstreifen; baulich getrennt als Annahme wie Einrichtungsradweg', () => {
    expect(baselBreite('Einbahn Velogegenverkehr mit Markierung', 'Veloroute')).toMatchObject({ standard: 1.8, reduziert: 1.6 })
    const b = baselBreite('Einbahn Velogegenverkehr mit baulicher Trennung', 'Veloroute')!
    expect(b).toMatchObject({ standard: 2.5, reduziert: 2.2 })
    expect(b.texte.join(' ')).toContain('Annahme')
  })
})

describe('VRC-01 · Tab. 5 nur als Prüfliste (keine erfundene Rechenregel)', () => {
  it('Sollbreite ohne Zuschlag, auch bei Steigung 6 % und Parkierung; Positionen offen bzw. zu prüfen', () => {
    const r = fuehrungsformNote(8000, 30, 'Radspur', 2.5, 'Velohauptroute', 'ja', undefined, 'keine', 'keine', undefined, false,
      BREITEN_BASEL.Radspur, 'basel', 'verkehrsorientiert', false, { regime: 'dauerhaft', steigungPct: -6 })
    expect(r.sollbreite).toBe(2.5)
    const z = Object.fromEntries(r.basel!.zuschlaege.map(x => [x.titel, x]))
    expect(z['Steigung und Gefälle']).toMatchObject({ status: 'zu_pruefen' })
    expect(z['Steigung und Gefälle'].text).toContain('Zwischenwerte nicht geregelt')
    expect(z['Sicherheitsabstand zur Parkierung']).toMatchObject({ status: 'offen' })
    expect(z['Seitliche Hindernisse über mehr als 10 m'].status).toBe('offen')
  })
  it('Sicherheitsstreifen erfasst: vorhanden, getrennt von der Velobreite; Trennstreifen nur bei Radwegen Gegenrichtung', () => {
    expect(baselZuschlaege('Radstreifen', { parken: 'ja', sicherheitsstreifen: true })[1]).toMatchObject({ status: 'vorhanden' })
    expect(baselZuschlaege('Zweirichtungsradweg', { parken: 'nein', sicherheitsstreifen: false }).some(x => x.titel.startsWith('Trennstreifen'))).toBe(true)
    expect(baselZuschlaege('Radstreifen', { parken: 'nein', sicherheitsstreifen: false }).some(x => x.titel.startsWith('Trennstreifen'))).toBe(false)
  })
})

describe('VRC-01 · DTV-Annahme (Festlegung 10.11.2026)', () => {
  it('DWV-Grenzen werden mit dem DTV geprüft und als Näherung bezeichnet; fehlendes DWV sperrt nicht', () => {
    const r = note('Mischverkehr', undefined, 'Veloroute', 'siedlungsorientiert', 30, { regime: 'dauerhaft' }, 6000)
    expect(r.note).toEqual(expect.any(Number))
    expect(r.basel!.dwv).toContain(BASEL_DWV_NAEHERUNG)
    expect(r.basel!.dtvAnnahme).toBe(BASEL_DTV_ANNAHME)
    expect(note('Mischverkehr', undefined, 'Veloroute', 'siedlungsorientiert', 30, { regime: 'dauerhaft' }, NaN).basel!.dwv).toContain('nicht geprüft')
  })
})

describe('VRC-01 · Falldatei, Bericht, bestehende Fälle und andere Städte', () => {
  const datei = (s: Partial<Section>) => fallText({ standard: 'basel', gebiet: 'basel', strasse: 'x', sections: [abschnitt(s)], cands: [], quellen: [] })
  it('Radspur, Regime, Auslöser und Abweichung im Rundlauf; ungültige Werte abgelehnt; alte Datei ohne neue Felder bleibt lesbar', () => {
    const f = fallLesen(datei({ ist: 'Radspur', breite: 2.3, abweichung: 'Brückenkopf', tempoRegime: 'zeitweise', regimeText: 'Tempo 50 generell - zeitlich auf Tempo 30 begrenzt',
      zrw: { landsicherung: true }, gegen: { ...gegenVon(defaultSection()), ist: 'Radstreifen', abweichung: '' } }))
    expect(f.sections[0]).toMatchObject({ ist: 'Radspur', abweichung: 'Brückenkopf', tempoRegime: 'zeitweise', zrw: { landsicherung: true } })
    expect(f.sections[0].gegen?.abweichung).toBe('')
    expect(() => fallLesen(datei({ tempoRegime: 'immer' as never }))).toThrow()
    expect(() => fallLesen(datei({ zrw: { landsicherung: 'ja' } as never }))).toThrow()
    const alt = fallLesen(datei({ ist: 'Radstreifen', breite: 2.5 }))
    expect(alt.sections[0].ist).toBe('Radstreifen')   // nicht stillschweigend zur Radspur
    expect(alt.sections[0].tempoRegime).toBeUndefined()   // unbekannt, nicht «dauerhaft»
  })
  it('Bericht: reduziertes Mass mit Begründung, nie als Standardmass', () => {
    const r = note('Radspur', 2.2, 'Velohauptroute', 'verkehrsorientiert', 30, { regime: 'dauerhaft', abweichung: 'Brückenkopf' })
    const t = notenHerleitung(r, 'Brückenkopf')
    expect(t).toContain('reduziertes Standardmass 2,20 m (Abweichung nach Abschnitt 1.3: Brückenkopf)')
    expect(t).not.toContain('Standardmass 2,50')
    expect(notenHerleitung(note('Radspur', 2.5, 'Velohauptroute', 'verkehrsorientiert'))).toContain('Breitenvorgabe Standardmass 2,50 m')
  })
  it('andere Städte unverändert: Bern-Soll, Zürcher Breiten, Radstreifen ausserhalb Basels', () => {
    expect(fuehrungsart(3000, 50, 'bern')).toBe('Radstreifen oder Radweg')
    expect(BREITEN_ZUERICH.Radstreifen).toEqual({ optimal: 2.5, minimal: 2.2 })
    expect(fuehrungsformNote(3000, 50, 'Radstreifen', 2.5, 'Velohauptroute').basel).toBeUndefined()
  })
  it('Massnahmenvorschlag in Basel, Vorzugsroute verkehrsorientiert: Radspur statt gewöhnlichem Velostreifen', () => {
    const s = abschnitt({ dtv: 9000, speed: 50, ist: 'Mischverkehr', fahrbahnbreite: 12, routentyp: 'Velohauptroute', strassentyp: 'verkehrsorientiert',
      parkenRechts: 'nein', gegen: { ...gegenVon(defaultSection()), ist: 'Mischverkehr', parkenRechts: 'nein' } })
    const v = vorschlagRechnen(s, 12, 'basel', BREITEN_BASEL)
    expect(v.text).toBe('Radspur markieren (überbreiter Velostreifen) beidseitig 2,50 m')
    expect(vorschlagRechnen(s, 9, 'basel', BREITEN_BASEL).blocker).toContain('für eine Radspur')
  })
})
