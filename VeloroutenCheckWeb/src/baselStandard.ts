// ════════════════════════════════════════════════════════════════════════════
// Basel-Stadt — Standards Fuss- und Veloverkehrsinfrastruktur (27.09.2024): Tabellen 3–5
// ════════════════════════════════════════════════════════════════════════════
//
// Prüfung VRC-01 (10.11.2026). Quelle: Kanton Basel-Stadt, «Standards Fuss- und Veloverkehrsinfrastruktur»,
// Stand 27.09.2024 (Grundlagen/2024-09-27-standards-fvv-is-bs.pdf). Gedruckte Seite = PDF-Seite − 4.
//   • Tab. 3 «Führungsform», S. 15: Führungsform nach Tempo, Strassenfunktion und Netzhierarchie; E = empfohlen,
//     A = weitere mögliche Führungsform im Ausnahmefall; leere Zelle = keine Zuordnung (kein Verbot).
//     Begleittext S. 15: verkehrsorientiert = Hauptverkehrs- und Hauptsammelstrassen; Tempo 40 und betriebszeitlich
//     begrenztes Tempo 30 → Vorgaben Tempo 50; Begegnungszonen für Vorzugs- und Pendlerrouten vermeiden.
//   • Tab. 4 «Dimensionierung Veloverkehr», S. 16: Standardmass und reduziertes Standardmass je Führungsform,
//     ohne Umfeldzuschläge und ohne Sicherheitszuschlag bei Parkierung.
//   • Tab. 5 «Umfeldzuschlag / Sicherheitsabstand», S. 16: nur als Prüfliste; die App addiert keinen Zuschlag
//     (Zwischenwerte und Bandbreiten regelt die Tabelle nicht).
//   • Abschnitt 1.3, S. 6: Abweichungen vom Standardmass sind zu begründen und schriftlich festzuhalten → das
//     reduzierte Standardmass gilt nur mit einer Begründung.
//   • Abschnitt 5.1.2, S. 42: Radspur = überbreiter Radstreifen.
// Festlegungen vom 10.11.2026 (Review VRC-01, Ergänzung): die Basler Zählwerte gelten im Rechner als DTV; die
// DWV-Grenzen der Tab. 3 werden näherungsweise damit geprüft. Die Strassenfunktion wird nie aus dem Tempo
// bestimmt. «Nicht verkehrsorientiert, Tempo 50» ist durch Tab. 3 nicht abgedeckt.

import type { IstFuehrungsform, Routentyp, Strassentyp } from './fuehrungsform'

/** Spalten der Tab. 3 */
export type BaselSpalte = 'Mischverkehr' | 'Velostrasse' | 'Radstreifen' | 'Radspur' | 'Radweg' | 'Busspur mit Velozulassung'
/** Regime eines signalisierten Tempo 30 (fehlt = unbekannt) */
export type TempoRegime = 'dauerhaft' | 'zeitweise'
export interface BaselZelle { stufe: 'E' | 'A'; dwvMax?: number }
export interface BaselZeile { tempo: 30 | 50; funktion: Strassentyp; route: Routentyp; zellen: Partial<Record<BaselSpalte, BaselZelle>> }

const E: BaselZelle = { stufe: 'E' }, A: BaselZelle = { stufe: 'A' }
const BUS = 'Busspur mit Velozulassung'
/** Tab. 3, S. 15 (Vorzugsroute → Velohauptroute, Pendler-/Basisrouten → Veloroute; nicht verkehrsorientiert → siedlungsorientiert) */
export const BASEL_TAB3: readonly BaselZeile[] = [
  { tempo: 30, funktion: 'siedlungsorientiert', route: 'Velohauptroute', zellen: { Velostrasse: { stufe: 'E', dwvMax: 2500 } } },
  { tempo: 30, funktion: 'siedlungsorientiert', route: 'Veloroute', zellen: { Mischverkehr: { stufe: 'E', dwvMax: 5000 }, Velostrasse: A } },
  { tempo: 30, funktion: 'verkehrsorientiert', route: 'Velohauptroute', zellen: { Radstreifen: A, Radspur: E, Radweg: E, [BUS]: A } },
  { tempo: 30, funktion: 'verkehrsorientiert', route: 'Veloroute', zellen: { Mischverkehr: { stufe: 'A', dwvMax: 5000 }, Radstreifen: E, Radspur: E, Radweg: A, [BUS]: A } },
  { tempo: 50, funktion: 'verkehrsorientiert', route: 'Velohauptroute', zellen: { Radstreifen: A, Radspur: E, Radweg: E, [BUS]: A } },
  { tempo: 50, funktion: 'verkehrsorientiert', route: 'Veloroute', zellen: { Radstreifen: E, Radspur: E, Radweg: A, [BUS]: A } },
]
export const BASEL_QUELLE = 'Standards Fuss- und Veloverkehrsinfrastruktur Basel-Stadt (27.09.2024)'
export const BASEL_TAB3_FUNDSTELLE = 'Tab. 3, S. 15'
export const BASEL_TAB4_FUNDSTELLE = 'Tab. 4, S. 16'
export const BASEL_TAB5_FUNDSTELLE = 'Tab. 5, S. 16'
/** Hinweistexte der Festlegung vom 10.11.2026 (DTV-Annahme) */
export const BASEL_DTV_ANNAHME = 'Die aus den Basler Zähldaten abgeleiteten Verkehrswerte werden im Rechner als DTV angenommen.'
export const BASEL_DWV_NAEHERUNG = 'Vergleich mit den Basler DWV-Grenzen näherungsweise anhand des verwendeten DTV.'
/** Anzeigename der Basler Radspur */
export const RADSPUR_TEXT = 'Radspur (überbreiter Velostreifen)'

const routeText = (r: Routentyp) => (r === 'Velohauptroute' ? 'Vorzugsroute' : 'Pendler-/Basisroute')
const funktionText = (f: Strassentyp) => (f === 'verkehrsorientiert' ? 'verkehrsorientierte Strasse' : 'nicht verkehrsorientierte Strasse')
const tsd = (n: number) => n.toLocaleString('de-CH').replace(/,/g, '’')

/** Spalte der Tab. 3 für eine Ist-Form; null: Form in Tab. 3 nicht aufgeführt */
export function baselSpalte(ist: IstFuehrungsform): BaselSpalte | null {
  switch (ist) {
    case 'Mischverkehr': case 'Einbahn Velogegenverkehr ohne Markierung': return 'Mischverkehr'
    case 'Velostrasse': return 'Velostrasse'
    case 'Radstreifen': case 'Einbahn Velogegenverkehr mit Markierung': return 'Radstreifen'
    case 'Radspur': return 'Radspur'
    case 'Radweg strassenbegleitend / Geschützter Radstreifen': case 'Radweg abgesetzt': case 'Zweirichtungsradweg':
    case 'Einbahn Velogegenverkehr mit baulicher Trennung': return 'Radweg'
    case 'Umweltspur': return BUS
    default: return null   // Kombinierter Fuss-/Radweg, Fussweg Velo gestattet
  }
}

/** Tempo-Klasse der Tab. 3: 30, 50 oder nicht bestimmt (Grund) */
export type BaselTempo = { klasse: 30 | 50; text: string } | { klasse: 'unklar30'; text: string } | { klasse: null; status: 'offen' | 'nicht_abgedeckt'; text: string }
export function baselTempo(speed: number, regime?: TempoRegime): BaselTempo {
  if (!Number.isFinite(speed)) return { klasse: null, status: 'offen', text: 'Tempo fehlt' }
  if (speed === 50) return { klasse: 50, text: 'Tempo 50' }
  if (speed === 40) return { klasse: 50, text: 'Tempo 40: es gelten die Vorgaben von Tempo 50 (Tab. 3, Begleittext)' }
  if (speed === 30) {
    if (regime === 'dauerhaft') return { klasse: 30, text: 'Tempo 30 (dauerhaft)' }
    if (regime === 'zeitweise') return { klasse: 50, text: 'Tempo 30 betriebszeitlich begrenzt: es gelten die Vorgaben von Tempo 50 (Tab. 3, Begleittext)' }
    return { klasse: 'unklar30', text: 'Tempo 30, Regime unbekannt (dauerhaft oder zeitweise)' }
  }
  if (speed === 20) return { klasse: null, status: 'nicht_abgedeckt', text: 'Tempo 20 (Begegnungszone): Tab. 3 enthält nur Tempo 30 und Tempo 50; die Führung von Vorzugs- und Pendlerrouten durch Begegnungszonen soll vermieden werden' }
  return { klasse: null, status: 'nicht_abgedeckt', text: `Tempo ${speed}: Tab. 3 enthält nur Tempo 30 und Tempo 50 (Tempo 40 und zeitweise Tempo 30 wie Tempo 50)` }
}

/** Soll nach Tab. 3 für einen Abschnitt */
export interface BaselSoll {
  status: 'bestimmt' | 'offen' | 'nicht_abgedeckt'
  /** Text der Zeile bzw. des Grunds */
  text: string
  /** massgebende Zeilen: eine; zwei, wenn das Regime bei Tempo 30 unbekannt ist und beide Zeilen gelten könnten */
  zeilen: BaselZeile[]
  /** empfohlene Formen (E) bzw. Ausnahmeformen (A) der Zeile (bei zwei Zeilen: in beiden gleich) */
  empfohlen: BaselSpalte[]
  ausnahme: BaselSpalte[]
}
const zeileFuer = (tempo: 30 | 50, funktion: Strassentyp, route: Routentyp) =>
  BASEL_TAB3.find(z => z.tempo === tempo && z.funktion === funktion && z.route === route) ?? null
const spalten = (z: BaselZeile, stufe: 'E' | 'A') => (Object.keys(z.zellen) as BaselSpalte[]).filter(k => z.zellen[k]!.stufe === stufe)
const gleich = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(x => b.includes(x))

export function baselSoll(strassentyp: Strassentyp | '' | undefined, route: Routentyp, speed: number, regime?: TempoRegime): BaselSoll {
  const leer = { zeilen: [], empfohlen: [], ausnahme: [] }
  if (!strassentyp) return { status: 'offen', text: 'Strassenfunktion fehlt (amtlich bzw. von Hand wählen)', ...leer }
  const t = baselTempo(speed, regime)
  if (t.klasse === null) return { status: t.status, text: t.text, ...leer }
  const kopf = (tempo: 30 | 50) => `${BASEL_TAB3_FUNDSTELLE}: Tempo ${tempo}, ${funktionText(strassentyp)}, ${routeText(route)}`
  if (t.klasse === 'unklar30') {
    const z30 = zeileFuer(30, strassentyp, route), z50 = zeileFuer(50, strassentyp, route)
    if (!z50) return { status: 'offen', text: `${t.text}: dauerhaft gilt die Zeile Tempo 30, zeitweise wäre die Kombination durch Tab. 3 nicht abgedeckt`, ...leer }
    const e = spalten(z30!, 'E'), a = spalten(z30!, 'A')
    return { status: 'bestimmt', text: `${kopf(30)} bzw. Tempo 50 (${t.text})`, zeilen: [z30!, z50],
      empfohlen: gleich(e, spalten(z50, 'E')) ? e : [], ausnahme: a.filter(x => spalten(z50, 'A').includes(x)) }
  }
  const z = zeileFuer(t.klasse, strassentyp, route)
  if (!z) return { status: 'nicht_abgedeckt', text: `${t.text}, ${funktionText(strassentyp)}: durch Tab. 3 nicht abgedeckt (keine Zeile; keine Ersatzzeile angewendet)`, ...leer }
  return { status: 'bestimmt', text: `${kopf(t.klasse)}${t.klasse === 50 && speed !== 50 ? ` (${t.text})` : ''}`, zeilen: [z], empfohlen: spalten(z, 'E'), ausnahme: spalten(z, 'A') }
}

/** Einordnung der Ist-Form in die Zeile der Tab. 3 */
export interface BaselFormBefund {
  status: 'empfohlen' | 'ausnahme' | 'nicht_zugeordnet' | 'nicht_in_tabelle' | 'offen' | 'nicht_abgedeckt'
  text: string
  /** Grenze der Zelle (DWV) */
  dwvMax?: number
}
const formName = (s: BaselSpalte) => (s === 'Radspur' ? RADSPUR_TEXT : s === 'Radstreifen' ? 'Velostreifen' : s)
export const baselFormenText = (xs: readonly BaselSpalte[]): string => xs.map(formName).join(' oder ')

export function baselFormBefund(soll: BaselSoll, ist: IstFuehrungsform): BaselFormBefund {
  if (soll.status !== 'bestimmt') return { status: soll.status, text: soll.text }
  const sp = baselSpalte(ist)
  if (sp === null) return { status: 'nicht_in_tabelle', text: `${ist}: in Tab. 3 nicht aufgeführt` }
  const zellen = soll.zeilen.map(z => z.zellen[sp] ?? null)
  const k = (c: BaselZelle | null) => (c ? `${c.stufe}${c.dwvMax ?? ''}` : '-')
  if (zellen.some(c => k(c) !== k(zellen[0]))) return { status: 'offen', text: `${formName(sp)}: Einordnung hängt vom Tempo-Regime ab (dauerhaft bzw. zeitweise Tempo 30); Regime angeben` }
  const c = zellen[0]
  const grenze = c?.dwvMax ? `, bis max. ${tsd(c.dwvMax)} DWV` : ''
  if (!c) return { status: 'nicht_zugeordnet', text: `${formName(sp)}: in dieser Zeile der Tab. 3 nicht zugeordnet (keine Aussage über ein Verbot)` }
  return c.stufe === 'E'
    ? { status: 'empfohlen', text: `${formName(sp)}: empfohlene Führungsform${grenze}`, ...(c.dwvMax ? { dwvMax: c.dwvMax } : {}) }
    : { status: 'ausnahme', text: `${formName(sp)}: weitere mögliche Führungsform nur im Ausnahmefall${grenze}; Ausnahme begründen`, ...(c.dwvMax ? { dwvMax: c.dwvMax } : {}) }
}

/** DWV-Grenze der Zelle mit dem DTV des Rechners prüfen (Festlegung 10.11.2026: näherungsweise) */
export function baselDwvText(befund: BaselFormBefund, dtv: number): string | undefined {
  if (!befund.dwvMax) return undefined
  if (!Number.isFinite(dtv)) return `Grenze ${tsd(befund.dwvMax)} DWV nicht geprüft (Verkehrsmenge fehlt)`
  return dtv <= befund.dwvMax
    ? `DTV ${tsd(dtv)} innerhalb der Grenze ${tsd(befund.dwvMax)} DWV. ${BASEL_DWV_NAEHERUNG}`
    : `DTV ${tsd(dtv)} über der Grenze ${tsd(befund.dwvMax)} DWV für diese Führungsform. ${BASEL_DWV_NAEHERUNG}`
}

// ── Tab. 4: Breiten ─────────────────────────────────────────────────────────
/** Standardmass und reduziertes Standardmass je Ist-Form [m] (Tab. 4); Zweirichtungsradweg siehe baselBreite */
const TAB4: Partial<Record<IstFuehrungsform, { standard: number; reduziert: number; zeile: string; annahme?: string }>> = {
  'Radstreifen':                                         { standard: 1.8, reduziert: 1.6, zeile: 'Radstreifen' },
  'Einbahn Velogegenverkehr mit Markierung':             { standard: 1.8, reduziert: 1.6, zeile: 'Radstreifen' },
  'Radspur':                                             { standard: 2.5, reduziert: 2.2, zeile: 'Radspur' },
  'Radweg strassenbegleitend / Geschützter Radstreifen': { standard: 2.5, reduziert: 2.2, zeile: 'Einrichtungsradweg' },
  'Radweg abgesetzt':                                    { standard: 2.5, reduziert: 2.2, zeile: 'Einrichtungsradweg' },
  'Einbahn Velogegenverkehr mit baulicher Trennung':     { standard: 2.5, reduziert: 2.2, zeile: 'Einrichtungsradweg',
    annahme: 'Annahme: wie Einrichtungsradweg (Tab. 4 hat keine eigene Zeile für die baulich getrennte Gegenrichtung)' },
  'Velostrasse':                                         { standard: 4.5, reduziert: 4.3, zeile: 'Velorouten in Tempo 30 / Velostrassen (Nettofahrbahnbreite)' },
  'Umweltspur':                                          { standard: 4.5, reduziert: 3.0, zeile: 'Busspur mit Velozulassung' },
}
/** 4,00-m-Auslöser beim Zweirichtungsradweg (Tab. 4): je ja / nein / unbekannt (undefined) */
export interface ZrwAusloeser { landsicherung?: boolean; neubau?: boolean }

export interface BaselBreite {
  standard: number
  reduziert: number | null
  /** massgebende Sollbreite: Standardmass, mit begründeter Abweichung das reduzierte Standardmass */
  soll: number
  reduziertAngewendet: boolean
  /** Erläuterungen (Zeile, Bedingungen, Annahmen) */
  texte: string[]
  /** Breitenprüfung offen (Grund), z. B. 4,00-m-Auslöser unbekannt */
  offen?: string
}
/**
 * Sollbreite nach Tab. 4. abweichung: Begründung der Abweichung nach Abschnitt 1.3 (leer bzw. fehlt = keine; dann gilt das
 * Standardmass). dtv: für «unter 1’000 Fz/d» der Velostrasse (DTV-Annahme). breite: Ist-Breite (nur für «offen» beim
 * Zweirichtungsradweg). null: Form ohne Basler Breitenvorgabe in Tab. 4.
 */
export function baselBreite(ist: IstFuehrungsform, route: Routentyp, o: { abweichung?: string; dtv?: number; zrw?: ZrwAusloeser; breite?: number } = {}): BaselBreite | null {
  const begruendet = !!o.abweichung?.trim()
  if (ist === 'Zweirichtungsradweg') {
    const vier = route === 'Velohauptroute' || o.zrw?.landsicherung === true || o.zrw?.neubau === true
    const grund = [route === 'Velohauptroute' ? 'Velovorzugsroute' : '', o.zrw?.landsicherung ? 'längerfristige Landsicherung' : '',
      o.zrw?.neubau ? 'Neubau mit längerfristigem Erneuerungszyklus (Brücke/Unterführung)' : ''].filter(Boolean).join(', ')
    if (vier) return { standard: 4.0, reduziert: null, soll: 4.0, reduziertAngewendet: false,
      texte: [`Zweirichtungsradweg: mindestens 4,00 m als Standardmass (${grund}); Tab. 4 nennt dafür kein reduziertes Mass`] }
    const unbekannt = o.zrw?.landsicherung === undefined || o.zrw?.neubau === undefined
    const soll = begruendet ? 2.8 : 3.4
    const offen = unbekannt && o.breite != null && o.breite >= soll - 1e-9 && o.breite < 4.0 - 1e-9
      ? 'Ob 4,00 m gelten (Landsicherung bzw. Neubau mit langem Erneuerungszyklus), ist nicht angegeben' : undefined
    return { standard: 3.4, reduziert: 2.8, soll, reduziertAngewendet: begruendet,
      texte: ['Zweirichtungsradweg: Standardmass 3,40 m, reduziert 2,80 m; 4,00 m bei Velovorzugsrouten, längerfristiger Landsicherung bzw. Neubau mit längerfristigem Erneuerungszyklus'],
      ...(offen ? { offen } : {}) }
  }
  const t = TAB4[ist]
  if (!t) return null
  const texte = [`${t.zeile}: Standardmass ${m(t.standard)}, reduziertes Standardmass ${m(t.reduziert)}`]
  if (t.annahme) texte.push(t.annahme)
  let reduziert = t.reduziert, standard = t.standard
  if (ist === 'Radstreifen' && route === 'Velohauptroute') {
    reduziert = 1.8
    texte.push('Auf Velovorzugsrouten nur im Ausnahmefall und mindestens mit dem Standardmass 1,80 m, auch bei begründeter Abweichung')
  }
  if (ist === 'Velostrasse' && o.dtv != null && Number.isFinite(o.dtv) && o.dtv < 1000) {
    standard = Math.min(standard, 4.0); reduziert = Math.min(reduziert, 4.0)
    texte.push(`Geringe MIV-Menge unter 1’000 Fz/d (DTV ${tsd(o.dtv)}): Nettofahrbahnbreite 4,00 m genügt. ${BASEL_DWV_NAEHERUNG.replace('DWV-Grenzen', 'Mengengrenzen')}`)
  }
  if (ist === 'Umweltspur') texte.push('Mindestens 4,50 m sind notwendig, damit Busse Velos überholen können')
  const soll = begruendet ? reduziert : standard
  return { standard, reduziert, soll, reduziertAngewendet: begruendet && reduziert < standard, texte }
}
const m = (x: number) => `${x.toFixed(2).replace('.', ',')} m`

// ── Tab. 5: Prüfliste (keine Rechenregel) ───────────────────────────────────
export interface BaselZuschlag { titel: string; status: 'zu_pruefen' | 'offen' | 'vorhanden' | 'nicht_anwendbar'; text: string }
const SPURGEBUNDEN = (ist: IstFuehrungsform) => !['Mischverkehr', 'Einbahn Velogegenverkehr ohne Markierung', 'Velostrasse'].includes(ist)
/**
 * Umfeldzuschläge und Sicherheitsabstand nach Tab. 5 als Prüfliste. Die App addiert nichts zur Sollbreite: die Tabelle legt
 * Zwischenwerte (Steigung zwischen 4 % und 8 %) und die Bandbreiten nicht fest. steigungPct: gemessene Steigung (Betrag) bzw.
 * undefined; parken: Parkierung auf dieser Seite; sicherheitsstreifen: Sicherheitsstreifen zur Parkierung erfasst.
 */
export function baselZuschlaege(ist: IstFuehrungsform, o: { steigungPct?: number; parken: 'ja' | 'nein' | 'egal'; sicherheitsstreifen: boolean }): BaselZuschlag[] {
  const aus: BaselZuschlag[] = []
  const radweg = baselSpalte(ist) === 'Radweg' || ist === 'Kombinierter Fuss-/Radweg'
  aus.push(o.steigungPct == null || !Number.isFinite(o.steigungPct)
    ? { titel: 'Steigung und Gefälle', status: 'offen', text: 'Steigung nicht bekannt (Tab. 5: bei 4 % +0,20 m, bei 8 % +0,60 m)' }
    : { titel: 'Steigung und Gefälle', status: 'zu_pruefen', text: `Steigung ${Math.abs(o.steigungPct).toFixed(1).replace('.', ',')} % (Tab. 5: bei 4 % +0,20 m, bei 8 % +0,60 m; Zwischenwerte nicht geregelt)` })
  if (o.parken === 'ja') {
    aus.push(o.sicherheitsstreifen
      ? { titel: 'Sicherheitsabstand zur Parkierung', status: 'vorhanden', text: 'Sicherheitsstreifen erfasst, Breite nicht erfasst (Tab. 5: 0,50–0,75 m, getrennt von der Velobreite)' }
      : SPURGEBUNDEN(ist)
        ? { titel: 'Sicherheitsabstand zur Parkierung', status: 'offen', text: 'Bei spurgebundenen Führungsformen zwingend (Tab. 5: 0,50–0,75 m); nicht erfasst' }
        : { titel: 'Sicherheitsabstand zur Parkierung', status: 'zu_pruefen', text: 'Mischverkehr: auf Vorzugsrouten und Hauptverbindungen zwingend, sonst im Einzelfall (Tab. 5: 0,50–0,75 m)' })
  } else if (o.parken === 'egal') aus.push({ titel: 'Sicherheitsabstand zur Parkierung', status: 'offen', text: 'Parkierung nicht geprüft' })
  if (radweg) aus.push({ titel: 'Kurvenzuschlag', status: 'offen', text: 'Radius unter 20 m: +0,50 m (nicht erhoben)' })
  if (ist === 'Einbahn Velogegenverkehr mit baulicher Trennung' || ist === 'Zweirichtungsradweg')
    aus.push({ titel: 'Trennstreifen zur Fahrbahn (Radweg Gegenrichtung)', status: 'zu_pruefen', text: 'Tab. 5: 0,30–0,50 m (nicht erhoben)' })
  aus.push({ titel: 'Seitliche Hindernisse über mehr als 10 m', status: 'offen', text: 'bis 10 cm kein Zuschlag, 10–130 cm +0,20 m, über 130 cm +0,40 m (nicht erhoben)' })
  return aus
}
