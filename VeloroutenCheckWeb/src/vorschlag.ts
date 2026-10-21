// ── Massnahmenvorschlag für die Aufteilung (seit 17.10.2026 Bern, seit 20.10.2026 alle Städte mit Planung) ──
//
// Portierung des lokalen Zielbild-Rechners (VeloAuslegeordnung/Rechner/zielbild/massnahmen.py und
// querschnitt.py, Stand 08.10.2026). Nutzerentscheide 17.10.2026: Vorschläge nur im Berner Rechner, als
// Startpunkt der Planung (danach frei änderbar); je eine Variante ohne und mit Randsteinanpassung;
// Tempo 30 nur, wenn sonst nichts reicht.
//
// Gesucht ist die erste Massnahme, die die Note auf mindestens ZIEL (4,5, «weitgehend erfüllt») bringt,
// in der Rangfolge des lokalen Rechners:
//   Rang 1  Markierung ohne Parkierungsabbau: Sicherheitsstreifen · Radstreifen verbreitern · Radstreifen
//           markieren (eine Seite / beide) · Velo vom Fussweg in die Fahrbahn
//   Rang 2  Kernfahrbahn (Q 5); der schmale Kern (Pilot) nur als Alternative
//   Rang 3  Parkierung aufheben (zuerst eine Seite, dann beide) + Rang 1/2
//   Rang 4  Velostrasse signalisieren (Q 9), mit oder ohne Parkierungsabbau
//   Rang 5  Haltestelle umbauen (Typ → «Haltestelle mit Veloumfahrung», je Seite) + Rang 1–3 (seit 20.10.2026, mit Platzprüfung)
//   Rang 6  Bau: Radweg nach Q 2a/2b, ohne/mit Parkierungsabbau
//   Rang 7  Tempo 30, allein und mit Rang 1–6
// Unter gleichem Rang: weniger Parkierung weg, weniger Eingriffe, eine Seite vor beiden, bessere Note.
//
// Abweichungen zum lokalen Rechner (online fehlen die Daten bzw. der Abschnitt ist zurückgestellt):
//   - Rang 5 (Haltestelle umbauen) prüft online zusätzlich den Platz der Veloumfahrung (hsPlatz).
//   - Keine Parkplatzzahl: unter gleichem Rang zählt «nichts < eine Seite < beide» (lokal ohne Zählung ebenso).
//   - Velostrasse ohne die Bedingung «Quartierstrasse» (die Strassenhierarchie fehlt online).
//   - Keine Hinweise zu Steigung, Schwerverkehr und Sicht (Daten fehlen online).
//   - Die Note rechnet die Online-Bewertung (bewertung.ts), nicht die lokale Notenkette.
// Parkierung je Seite statt «beidseitig/Seite»; Parkierung auf Trottoirniveau braucht keine Fahrbahnbreite.
//
// Andere Städte (Nutzerentscheid 20.10.2026): dieselbe Rangfolge (eine normative Festlegung, keine städtische).
// Die Unterschiede kommen über die Note der Stadt (Soll-Führungsform, Breiten) und die Masse der Platzprüfung:
// die der Stadt, wo ihre Standards etwas nennen (vorgabe(), Breiten der Stadt), sonst die Berner als Ersatz
// (im Vermerk genannt). Den schmalen Kern (Pilot) gibt es nur in Bern; die Hinweise auf die Berner
// Querschnittsblätter (Q …) fallen weg.
//
// Randsteinanpassung (Nutzerentscheid 17.10.2026): die Trottoirs auf die Vorgabe des Fussverkehrsnetzes
// (FUSSNETZ, Masterplan Fussverkehr) — schmalere werden auf die Vorgabe verbreitert (zulasten der Fahrbahn),
// breitere dürfen bis auf die Vorgabe schmaler werden. Ohne gewähltes Netz gibt es diese Variante nicht.

import { brauchtBreite, fuehrungsart, haltestellenFamilie, haltestellenTypen, istRang, sollBreite, type BreitenSoll, type Fuehrungsart,
  type Haltestellentyp, type IstFuehrungsform, type Routentyp, type Stadt, type Strassentyp } from './fuehrungsform'
import { bewerteAbschnitt } from './bewertung'
import { dtvEff, gegenVon, seiteA, seiteB, type Section } from './strecke'
import { FUSSNETZ, KERN_DTV_MAX, KERN_KMH_MAX, STANDARD_QUELLE, WEG_TEIL, auf5cm, einbahnParkLinks, gruenAusAv, vorgabe, type Aufteilung, type Teil } from './aufteilung'
import { numDE } from './csv'
import type { ParkTiefe } from './breitenmessung'

export const ZIEL = 4.5
const RS: IstFuehrungsform = 'Radstreifen'
const RW: IstFuehrungsform = 'Radweg strassenbegleitend / Geschützter Radstreifen'
const MISCH: IstFuehrungsform = 'Mischverkehr'
const VELOSTRASSE: IstFuehrungsform = 'Velostrasse'
const FUSSWEG: IstFuehrungsform = 'Fussweg Velo gestattet'
const UMWELTSPUR: IstFuehrungsform = 'Umweltspur'
const KOMBI: IstFuehrungsform = 'Kombinierter Fuss-/Radweg'
const ZWEIRICHTUNG: IstFuehrungsform = 'Zweirichtungsradweg'
const RW_ABGESETZT: IstFuehrungsform = 'Radweg abgesetzt'
const FUSS_NEBEN_M = 2.0      // Fussweg neben dem getrennten Radweg (Standardbreite des Trottoirs)
const SOLL_MIT_RS: Fuehrungsart[] = ['Radstreifen', 'Radstreifen oder Radweg']

// Masse (querschnitt.py; Masterplan Veloinfrastruktur, Querschnittsblätter Q 1, Q 2a/2b, Q 5)
const PARK_M = 1.9
const MIV_M = 6.0, MIV_EINBAHN_M = 3.0, MIV_KERN_M = 4.5, MIV_RW_M = 6.5, MIV_RW_EINBAHN_M = 3.25, MIV_TRAM_EINBAHN_M = 3.25
const TRENNUNG_M = 0.15
type Stufe = 'standard' | 'minimal'
const STUFEN: Stufe[] = ['standard', 'minimal']
const SICHERHEIT: Record<Stufe, number> = { standard: 0.8, minimal: 0.5 }
const MINIMAL = {
  rs: { Velohauptroute: 1.8, Veloroute: 1.5 }, kern: { Velohauptroute: 1.5, Veloroute: 1.5 }, rw: { Velohauptroute: 1.8, Veloroute: 1.8 },
}
const KERN_STANDARD_M = 4.5, KERN_STANDARD_MAX_M = 5.5, KERN_PILOT_MIN_M = 3.0, KERN_RS_MIN_M = 1.5, KERN_PILOT_RS_MIN_M = 1.8

type S = 'A' | 'B'
type Breiten = Partial<Record<IstFuehrungsform, BreitenSoll>>
// Masse der Platzprüfung je Stadt (masseFuer); Bern = die Konstanten oben
interface Masse {
  park: number; miv: number; mivEinbahn: number; mivKern: number; mivRw: number; mivRwEinbahn: number; mivTramEinbahn: number
  trennung: number; sicherheit: Record<Stufe, number>
  minimal: { rs: Record<Routentyp, number>; kern: Record<Routentyp, number>; rw: Record<Routentyp, number> }
  kernStd: number; kernMax: number; kernPilot: number | null; kernRsMin: number; kernPilotRsMin: number
  vsMin: number; vsMax: number
  ersatz: string[]                 // Masse nach Bern als Ersatz (Vermerk)
}
const MASSE_BERN: Masse = {
  park: PARK_M, miv: MIV_M, mivEinbahn: MIV_EINBAHN_M, mivKern: MIV_KERN_M, mivRw: MIV_RW_M, mivRwEinbahn: MIV_RW_EINBAHN_M,
  mivTramEinbahn: MIV_TRAM_EINBAHN_M, trennung: TRENNUNG_M, sicherheit: SICHERHEIT, minimal: MINIMAL,
  kernStd: KERN_STANDARD_M, kernMax: KERN_STANDARD_MAX_M, kernPilot: KERN_PILOT_MIN_M, kernRsMin: KERN_RS_MIN_M, kernPilotRsMin: KERN_PILOT_RS_MIN_M,
  vsMin: 4.5, vsMax: 6.5, ersatz: [],
}
export function masseFuer(stadt: Stadt, breiten?: Breiten): Masse {
  if (stadt === 'bern') return MASSE_BERN
  const ersatz: string[] = []
  const v = (art: Parameters<typeof vorgabe>[0], name: string) => {
    const x = vorgabe(art, stadt)!
    if (x.quelle.startsWith('Ersatz')) ersatz.push(name)
    return x
  }
  const fs = v('Fahrspur', 'Fahrstreifen'), park = v('Parkierung', 'Längsparkierung'), sich = v('Sicherheitsstreifen', 'Sicherheitsstreifen')
  const trenn = v('Trennstreifen', 'Trennstreifen'), kern = v('Kernfahrbahn', 'Kernfahrbahn')
  const spur = fs.min ?? fs.wert
  // reduziertes Mass: das Minimum der Stadt für beide Routentypen; ohne eigene Breite das Berner
  const min = (f: IstFuehrungsform, bern: Record<Routentyp, number>, name: string): Record<Routentyp, number> => {
    const m = breiten?.[f]?.minimal
    if (m == null) { ersatz.push(name); return bern }
    return { Velohauptroute: m, Veloroute: m }
  }
  const vs = breiten?.Velostrasse?.minimal
  if (vs == null) ersatz.push('Velostrasse')
  ersatz.push('Restbreite neben Radweg und Tram', 'Velostreifen neben der Kernfahrbahn', 'Grenzen der Kernfahrbahn (DTV, Tempo)')
  return {
    park: park.wert, miv: 2 * spur, mivEinbahn: spur, mivKern: kern.min ?? kern.wert, mivRw: MIV_RW_M, mivRwEinbahn: MIV_RW_EINBAHN_M,
    mivTramEinbahn: MIV_TRAM_EINBAHN_M, trennung: trenn.wert, sicherheit: { standard: sich.wert, minimal: sich.min ?? sich.wert },
    minimal: { rs: min(RS, MINIMAL.rs, 'reduzierte Radstreifen'), kern: MINIMAL.kern, rw: min(RW, MINIMAL.rw, 'reduzierte Radwege') },
    kernStd: kern.min ?? kern.wert, kernMax: kern.max ?? Infinity, kernPilot: null, kernRsMin: KERN_RS_MIN_M, kernPilotRsMin: KERN_PILOT_RS_MIN_M,
    vsMin: vs ?? 4.5, vsMax: 6.5, ersatz,
  }
}
// Platzprüfung, die zu einer Variante gehört (für den Querschnitt der Planung)
interface Quer { form: IstFuehrungsform; stufe: Stufe; kern: boolean; kernM?: number; pilot?: boolean; sichJe: number; ersatz: number }
// Eingaben einer Variante (wie e im lokalen Rechner)
export interface Eingaben {
  ist: IstFuehrungsform | null; geg: IstFuehrungsform | null      // geg null = Einbahn
  breite: Record<S, number | null>
  park: Record<S, boolean>                                       // Parkreihe am Rand dieser Seite
  parkFb: Record<S, boolean>                                     // … und sie liegt in der Fahrbahn (nicht auf Trottoirniveau)
  parkTiefe: Record<S, number>                                   // Tiefe der Parkreihe (gemessen, sonst 1,90 m; seit 20.10.2026)
  parkArt: Partial<Record<S, ParkTiefe>>                         // Anordnung aus den Parkfeldern (für die Planung)
  parkVersetzt?: S                                               // Parkierung abwechselnd A und B: diese Seite zählt nicht (seit 20.10.2026)
  sich: Record<S, boolean>                                       // Sicherheitsstreifen neben der Parkreihe
  einbahn: boolean; route: Routentyp; dtv: number | null; kmh: number | null; tram: boolean
  dtvBelegt: boolean                                             // DTV gemessen/eingegeben, nicht «≤ 2000 angenommen»
  fahrbahn: number | null; halt: boolean; uTakt: boolean
  // Haltestelle je Seite (Rang 5, seit 20.10.2026): Typ, Seite ohne Haltestelle, umgebaute Seiten, Trottoir heute [m]
  hsTyp: Record<S, Haltestellentyp>; hsOhne: Record<S, boolean>; hsUmbau?: S[]; trottoir: Record<S, number | null>
  oevGegen?: boolean   // Einbahn mit Bus bzw. Tram in der Gegenrichtung: eine Gegenspur (seit 21.10.2026)
  hbSeiten: S[]   // Seiten im Haltestellenbereich (Note allein aus der Haltestelle): dort nur Rang 5 (Nutzerbefund 20.10.2026)
  ohnePlatz?: boolean; parkWeg?: boolean; quer?: Quer
  angenommen?: string[]                                          // Ist-Breiten, die fehlten und mit der Vorgabe angenommen sind
  // Angenommene Breite je Seite: nur für die Note (wie die Ausgangslage der Planung); für Platz und Regeln gilt
  // die Breite als unbekannt wie im lokalen Rechner (Abgleich 20.10.2026)
  annahme?: Partial<Record<S, { form: IstFuehrungsform; breite: number }>>
  ohneFahrbahn: boolean                                          // Weg ohne Fahrbahn (OSM-Rad-/Fussweg)
  insel: number                                                  // Mittelinsel (AV) in der Fahrbahn [m]; 0 = keine. fahrbahn ist ohne sie
  fussNeben?: Partial<Record<S, number>>                         // eigener Fussweg neben dem Radweg (Wege trennen)
  platzOffen?: boolean                                           // Weg verbreitert: Platz daneben nicht geprüft
  stadt: Stadt; breiten?: Breiten; strassentyp?: Strassentyp; m: Masse   // Stadt, ihre Breiten und Masse (seit 20.10.2026)
}
type Kand = { rang: number; text: string; k: Eingaben; weg: 0 | 1 | 2 }   // weg: 0 nichts, 1 eine Reihe, 2 alle

const kopie = (e: Eingaben): Eingaben => ({ ...e, breite: { ...e.breite }, park: { ...e.park }, parkFb: { ...e.parkFb }, sich: { ...e.sich },
  hsTyp: { ...e.hsTyp }, ...(e.hsUmbau ? { hsUmbau: [...e.hsUmbau] } : {}),
  parkTiefe: { ...e.parkTiefe },
  annahme: { ...e.annahme },
  fussNeben: { ...e.fussNeben }, quer: undefined })
const m2 = (x: number) => `${numDE(x, 2)} m`
const abrunden = (x: number) => Math.round(Math.floor(x / 0.05 + 1e-9) * 5) / 100
const r2 = (x: number) => Math.round(x * 100) / 100
const seitenVon = (e: Eingaben): S[] => (e.einbahn ? ['A'] : ['A', 'B'])
const formVon = (e: Eingaben, s: S) => (s === 'A' ? e.ist : e.geg)
const parkseiten = (e: Eingaben) => (e.park.A ? 1 : 0) + (e.park.B ? 1 : 0)
const tief = (p?: ParkTiefe) => (p && p.art !== 'laengs' ? p : undefined)
// Versetzte Parkierung (abwechselnd A und B): die Seite parkVersetzt braucht keinen Platz, solange gegenüber parkiert wird
const versetztZaehlt = (e: Eingaben, s: S) => !(e.parkVersetzt === s && e.park[s === 'A' ? 'B' : 'A'])
const parkFbBreite = (e: Eingaben) => (e.park.A && e.parkFb.A && versetztZaehlt(e, 'A') ? e.parkTiefe.A : 0)
  + (e.park.B && e.parkFb.B && versetztZaehlt(e, 'B') ? e.parkTiefe.B : 0)
const sollVon = (e: Eingaben): Fuehrungsart | null =>
  (e.dtv != null && e.kmh != null ? fuehrungsart(e.dtv, e.kmh, e.stadt, e.route, e.strassentyp) : null)
const soll = (e: Eingaben, f: IstFuehrungsform) => sollBreite(f, e.route, e.breiten?.[f])

function velobreite(e: Eingaben, form: IstFuehrungsform, stufe: Stufe, kern = false): number {
  if (stufe === 'standard') return soll(e, form) ?? e.m.minimal.rs[e.route]
  return (kern ? e.m.minimal.kern : form === RW ? e.m.minimal.rw : e.m.minimal.rs)[e.route]
}
// Stufen, die sich unterscheiden: das reduzierte Mass nur, wenn es kleiner ist als das Standardmass
const stufenFuer = (e: Eingaben, form: IstFuehrungsform | null): Stufe[] =>
  e.m.sicherheit.minimal < e.m.sicherheit.standard - 1e-9 || (form != null && velobreite(e, form, 'minimal') < velobreite(e, form, 'standard') - 1e-9)
    ? STUFEN : ['standard']
function miv(form: IstFuehrungsform, e: Eingaben, kern: boolean): number {
  // Einbahn mit Bus bzw. Tram in der Gegenrichtung: zwei Spuren wie bei Gegenverkehr
  const ein = e.einbahn && !e.oevGegen
  if (form === RW) return ein ? e.m.mivRwEinbahn : e.m.mivRw
  if (ein) return e.tram ? e.m.mivTramEinbahn : e.m.mivEinbahn
  return kern && !e.tram ? e.m.mivKern : e.m.miv
}
// Benötigte Fahrbahnbreite; sichDa: kein Sicherheitsstreifen nötig (keine Parkreihe neben dem Streifen)
function bedarf(form: IstFuehrungsform, e: Eingaben, stufe: Stufe, kern: boolean, sichDa: boolean) {
  const n = e.einbahn ? 1 : 2
  const velo = velobreite(e, form, stufe, kern) * n
  const trennung = form === RW ? e.m.trennung * n : 0
  const sicherheit = (sichDa ? 0 : e.m.sicherheit[stufe]) * parkseiten(e)
  const mv = miv(form, e, kern)
  return { summe: r2(mv + velo + trennung + parkFbBreite(e) + sicherheit), velo, miv: mv }
}
const kernErlaubt = (form: IstFuehrungsform, e: Eingaben) =>
  form === RS && !e.einbahn && !e.tram && !e.insel && e.dtvBelegt && e.dtv != null && e.dtv < KERN_DTV_MAX && e.kmh != null && e.kmh <= KERN_KMH_MAX
function passt(e: Eingaben, form: IstFuehrungsform, stufe: Stufe, kern: boolean, summe: number | null, sichNoetig: boolean): boolean {
  if (kern && !kernErlaubt(form, e)) return false
  if (e.ohnePlatz) return true
  if (e.fahrbahn == null) return false
  const b = bedarf(form, e, stufe, kern, !sichNoetig)
  return e.fahrbahn + 1e-9 >= (summe != null ? b.summe - b.velo + summe : b.summe)
}
function formSetzen(e: Eingaben, s: S, form: IstFuehrungsform, breite: number | null): Eingaben {
  const k = kopie(e)
  if (s === 'A') k.ist = form; else k.geg = form
  k.breite[s] = breite
  return k
}
const parkAnliegend = (e: Eingaben, seiten: S[]) => seiten.some(s => e.park[s])
const sichSetzen = (k: Eingaben) => { for (const s of ['A', 'B'] as S[]) if (k.park[s]) k.sich[s] = true }
const sichFehlt = (e: Eingaben) => (['A', 'B'] as S[]).some(s => e.park[s] && !e.sich[s])
function parkLage(k: Eingaben): string {
  return k.park.A && k.park.B ? 'beidseitig' : k.park.A ? 'Seite A' : k.park.B ? 'Seite B' : ''
}
function sichTexte(e: Eingaben, k: Eingaben, sichM: number, besteht: boolean): [string, string] {
  const lage = parkLage(k)
  const vor = e.parkWeg ? '' : `Parkierung ${lage ? lage + ' ' : ''}bleibt + `
  if (besteht) return [vor, `, bestehender Sicherheitsstreifen ${m2(sichM)} gezählt`]
  return [vor, `, Sicherheitsstreifen ${m2(sichM)} neben der Parkierung${lage && e.parkWeg ? ` ${lage}` : ''}`]
}

// ── Atomare Änderungen ──
function ohneParkierung(e: Eingaben, seite: S | null): Eingaben | null {
  if (!parkseiten(e)) return null
  const k = kopie(e); k.parkWeg = true
  for (const s of ['A', 'B'] as S[]) if (seite == null || s === seite) { k.park[s] = false; k.sich[s] = false }
  return k
}
function tempo30(e: Eingaben): Eingaben | null {
  if (e.kmh == null || e.kmh <= 30) return null
  const k = kopie(e); k.kmh = 30; return k
}
function inDieFahrbahn(e: Eingaben): Eingaben | null {
  if (e.ist !== FUSSWEG && e.geg !== FUSSWEG) return null
  let k = e
  for (const s of seitenVon(e)) if (formVon(e, s) === FUSSWEG) k = formSetzen(k, s, MISCH, null)
  return k
}
function velostrasse(e: Eingaben): Eingaben | null {
  if (e.ist !== MISCH || (e.geg && e.geg !== MISCH)) return null
  const sv = sollVon(e)
  if (e.kmh !== 30 || e.fahrbahn == null || (sv !== 'Mischverkehr' && sv !== 'Velostrasse') || e.tram || e.halt || e.uTakt || e.insel) return null
  const netto = r2(e.fahrbahn - parkFbBreite(e))
  if (netto < e.m.vsMin - 1e-9 || netto > e.m.vsMax + 1e-9) return null
  let k = formSetzen(e, 'A', VELOSTRASSE, netto)
  if (!e.einbahn) k = formSetzen(k, 'B', VELOSTRASSE, netto)
  k.quer = { form: VELOSTRASSE, stufe: 'standard', kern: false, sichJe: e.m.sicherheit.standard, ersatz: netto }
  return k
}

// Haltestelle umbauen (Rang 5, wie im lokalen Rechner): Typ der Seite auf «Haltestelle mit Veloumfahrung» (HS 1), nur wo
// heute ein Typ der Familie Mischverkehr steht (ohne Angabe gilt wie lokal die Kaphaltestelle) und die Stadt den Typ kennt.
// Platz (online zusätzlich): An der Haltestelle liegt auf dieser Seite alles ausserhalb der Haltekante — Wartebereich
// 3,10 + Abstand 0,30 + Radweg 1,60 + Trottoir 2,00 = HS1_MIN_M (Standard 3,10 + 0,50 + 1,80 + 2,50 = HS1_STD_M). Verfügbar
// sind das Trottoir der Seite und die Fahrbahn ohne die Autos (MIV) und die Teile der Gegenseite.
export const HS_UMFAHRUNG: Haltestellentyp = 'Haltestelle mit Veloumfahrung'
export const HS1_MIN_M = 7.0, HS1_STD_M = 7.9
function hsPlatz(e: Eingaben, s: S): number | null {
  const tr = e.trottoir[s]
  if (tr == null || e.fahrbahn == null) return null
  const o: S = s === 'A' ? 'B' : 'A'
  const fo = e.einbahn ? null : formVon(e, o)
  const veloO = fo === RS || fo === RW ? (e.breite[o] ?? velobreite(e, fo, 'minimal')) + (fo === RW ? e.m.trennung : 0) : 0
  const parkO = e.park[o] && e.parkFb[o] && versetztZaehlt(e, o) ? e.parkTiefe[o] + (e.sich[o] ? e.m.sicherheit.minimal : 0) : 0
  return r2(tr + Math.max(0, e.fahrbahn - miv(MISCH, e, false) - veloO - parkO))
}
function haltestelleUmbauen(e: Eingaben, s: S): Eingaben | null {
  if (!e.halt || e.hsOhne[s] || !haltestellenTypen(e.stadt).includes(HS_UMFAHRUNG)) return null
  const typ = e.hsTyp[s] !== 'keine' ? e.hsTyp[s] : 'Kaphaltestelle'
  if (haltestellenFamilie(e.stadt, typ) === 'Separate') return null
  const platz = hsPlatz(e, s)
  if (platz != null && platz < HS1_MIN_M - 1e-9) return null
  const k = kopie(e); k.hsTyp[s] = HS_UMFAHRUNG; k.hsUmbau = [...(e.hsUmbau ?? []), s]
  return k
}

// ── Varianten ──
function sicherheitsstreifen(e: Eingaben): Kand[] {
  if (!parkseiten(e) || !sichFehlt(e)) return []
  const rs = seitenVon(e).filter(s => formVon(e, s) === RS)
  if (!rs.length || !parkAnliegend(e, rs)) return []
  const ersatz = velobreite(e, RS, 'minimal')
  const summe = rs.reduce((x, s) => x + (e.breite[s] ?? ersatz), 0)
  const out: Kand[] = []
  for (const stufe of e.m.sicherheit.minimal < e.m.sicherheit.standard - 1e-9 ? STUFEN : ['standard'] as Stufe[]) {
    if (!passt(e, RS, stufe, false, summe, true)) continue
    const k = kopie(e); sichSetzen(k)
    k.quer = { form: RS, stufe, kern: false, sichJe: e.m.sicherheit[stufe], ersatz }
    out.push({ rang: 1, text: `Sicherheitsstreifen ${m2(e.m.sicherheit[stufe])} markieren` + (stufe === 'minimal' ? ' (minimal)' : ''), k, weg: 0 })
  }
  return out
}
function verbreitern(e: Eingaben): Kand[] {
  const seiten = seitenVon(e).filter(s => formVon(e, s) === RS)
  if (!seiten.length) return []
  const out: Kand[] = []
  for (const stufe of stufenFuer(e, RS)) {
    const breite = velobreite(e, RS, stufe)
    const zuSchmal = seiten.filter(s => e.breite[s] == null || e.breite[s]! + 1e-9 < breite)
    if (!zuSchmal.length) continue
    let k = e
    for (const s of zuSchmal) k = formSetzen(k, s, RS, breite)
    const summe = seiten.reduce((x, s) => x + (k.breite[s] ?? 0), 0)
    const anl = parkAnliegend(k, zuSchmal)
    if (!passt(k, RS, stufe, false, summe, anl)) continue
    const mitSich = anl && sichFehlt(k), besteht = anl && !sichFehlt(k)
    if (mitSich) sichSetzen(k)
    k.quer = { form: RS, stufe, kern: false, sichJe: e.m.sicherheit[stufe], ersatz: breite }
    const [vor, nach] = mitSich || besteht ? sichTexte(e, k, e.m.sicherheit[stufe], besteht) : ['', '']
    out.push({ rang: 1, text: `${vor}Radstreifen verbreitern auf ${m2(breite)} (${zuSchmal.join('/')})${nach}`, k, weg: 0 })
  }
  return out
}
// Reserve auf die Radstreifen: zuerst den schmaleren bis zum breiteren, dann gleichmässig, je bis zum Standard
function reserveAufRadstreifen(k: Eingaben, reserve: number, std: number): { k: Eingaben; plus: number; breiter: Partial<Record<S, number>> } {
  const seiten = seitenVon(k).filter(s => formVon(k, s) === RS)
  if (!seiten.length || reserve < 0.05 - 1e-9 || seiten.some(s => k.breite[s] == null)) return { k, plus: 0, breiter: {} }
  const w = Object.fromEntries(seiten.map(s => [s, k.breite[s]!])) as Record<S, number>
  const neu = { ...w }
  let rest = reserve
  if (seiten.length === 2) {
    const [schmal, breit] = [...seiten].sort((x, y) => neu[x] - neu[y])
    const ziel = abrunden(Math.min(neu[schmal] + rest, Math.max(neu[breit], neu[schmal]), std))
    if (ziel > neu[schmal] + 1e-9) { rest -= ziel - neu[schmal]; neu[schmal] = r2(ziel) }
  }
  const je = rest / seiten.length
  for (const s of seiten) { const ziel = abrunden(Math.min(neu[s] + je, std)); if (ziel > neu[s] + 1e-9) neu[s] = r2(ziel) }
  const breiter: Partial<Record<S, number>> = {}
  let out = k
  for (const s of seiten) if (neu[s] > w[s] + 1e-9) { breiter[s] = neu[s]; out = formSetzen(out, s, RS, neu[s]) }
  return { k: out, plus: r2(seiten.reduce((x, s) => x + neu[s] - w[s], 0)), breiter }
}
function veloVarianten(e: Eingaben, rang: number, form: IstFuehrungsform): Kand[] {
  const out: Kand[] = []
  const alle = seitenVon(e)
  const ziele: S[][] = alle.length === 2 ? [alle, ['A'], ['B']] : [alle]
  const rangNeu = istRang(form)
  const ersetzbar = (f: IstFuehrungsform | null) => f == null || f === form || f === MISCH || f === UMWELTSPUR || f === FUSSWEG || istRang(f) < rangNeu
  for (const stufe of stufenFuer(e, form)) {
    const breite = velobreite(e, form, stufe)
    for (const seiten of ziele) {
      if (!seiten.every(s => ersetzbar(formVon(e, s)))) continue
      let k = e
      for (const s of seiten) k = formSetzen(k, s, form, breite)
      let summe = 0
      for (const s of alle) {
        const f = formVon(k, s), b = k.breite[s]
        summe += f === RS || f === RW ? (b ?? breite) : f === MISCH ? 0 : (b ?? 0)
      }
      const anl = parkAnliegend(k, seiten)
      if (!passt(k, form, stufe, false, summe, anl)) continue
      let breiter: Partial<Record<S, number>> = {}
      if (form === RS && k.fahrbahn != null && !k.ohnePlatz) {
        const b0 = bedarf(form, k, stufe, false, !anl)
        const r = reserveAufRadstreifen(k, k.fahrbahn - (b0.summe - b0.velo + summe), soll(k, RS) ?? breite)
        k = r.k; breiter = r.breiter
      }
      const mitSich = anl && sichFehlt(k), besteht = anl && !sichFehlt(k)
      if (k === e) k = kopie(e)
      if (mitSich) sichSetzen(k)
      k.quer = { form, stufe, kern: false, sichJe: e.m.sicherheit[stufe], ersatz: breite }
      const neuAuf = seiten.some(s => formVon(e, s) === form)
      const was = form === RS ? (neuAuf ? 'Radstreifen neu aufteilen' : 'Radstreifen markieren')
        : (neuAuf ? 'Radweg umbauen (Q 2a/2b)' : 'Radweg bauen (Q 2a/2b)')
      const end = Object.fromEntries(seiten.map(s => [s, k.breite[s] ?? breite])) as Record<S, number>
      const mass = seiten.length === 2 && Math.abs(end.A - end.B) > 1e-9 ? `Seite A ${m2(end.A)} und Seite B ${m2(end.B)}`
        : `${seiten.length === 2 ? 'beidseitig' : `Seite ${seiten[0]}`} ${m2(end[seiten[0]])}`
      const minimal = stufe === 'minimal' && seiten.every(s => Math.abs(end[s] - breite) < 1e-9)
      const zusatz = (Object.entries(breiter) as [S, number][]).filter(([s]) => !seiten.includes(s))
        .map(([s, b]) => `, Radstreifen Seite ${s} verbreitern auf ${m2(b)}`).join('')
      const [vor, nach] = mitSich || besteht ? sichTexte(e, k, e.m.sicherheit[stufe], besteht) : ['', '']
      out.push({ rang, text: `${vor}${was} ${mass}${minimal ? ' (minimal)' : ''}${zusatz}${nach}`, k, weg: 0 })
    }
  }
  return out
}
function kernVarianten(e: Eingaben): Kand[] {
  const out: Kand[] = []
  if (!kernErlaubt(RS, e) || !SOLL_MIT_RS.includes(sollVon(e) as Fuehrungsart)) return out
  const ersetzbar = [MISCH, RS, UMWELTSPUR, FUSSWEG]
  if (!e.ist || !ersetzbar.includes(e.ist) || !ersetzbar.includes(e.geg ?? e.ist)) return out
  const maxRs = soll(e, RS) ?? 1.8
  const ps = parkseiten(e)
  const neuAuf = e.ist === RS || e.geg === RS
  const was = neuAuf ? 'Radstreifen neu aufteilen' : 'Radstreifen markieren'
  for (const sst of ps ? (e.m.sicherheit.minimal < e.m.sicherheit.standard - 1e-9 ? STUFEN : ['standard'] as Stufe[]) : [null]) {
    const sichJe = sst ? e.m.sicherheit[sst] : 0
    let varianten: [number, number, boolean][]
    if (e.ohnePlatz || e.fahrbahn == null) {
      if (!e.ohnePlatz) continue
      varianten = [[maxRs, e.m.kernStd, false]]
    } else {
      const verf = e.fahrbahn - parkFbBreite(e) - ps * sichJe
      varianten = []
      const rsStd = abrunden(Math.min(maxRs, (verf - e.m.kernStd) / 2))
      if (rsStd + 1e-9 >= e.m.kernRsMin) varianten.push([rsStd, r2(Math.min(e.m.kernMax, verf - 2 * rsStd)), false])
      // schmaler Kern (Pilot): nur in Bern
      const pilotMin = e.m.kernPilot
      const rsP = pilotMin == null ? NaN : abrunden(Math.min(maxRs, (verf - pilotMin) / 2))
      if (rsP + 1e-9 >= e.m.kernPilotRsMin && (!varianten.length || rsP > rsStd + 1e-9))
        varianten.push([rsP, r2(Math.min(e.m.kernStd, verf - 2 * rsP)), true])
    }
    for (const [rsRoh, kernM, pilot] of varianten) {
      const rs = r2(rsRoh)
      const k = formSetzen(formSetzen(e, 'A', RS, rs), 'B', RS, rs)
      if (sst) sichSetzen(k)
      k.quer = { form: RS, stufe: sst ?? 'standard', kern: true, kernM, pilot, sichJe, ersatz: rs }
      const [vor, nach] = sst ? sichTexte(e, k, sichJe, !sichFehlt(e)) : ['', '']
      out.push({ rang: 2, k, weg: 0, text: `${vor}${was} beidseitig ${m2(rs)} als Kernfahrbahn `
        + (pilot ? `mit schmalem Kern ${m2(kernM)} (Pilot)` : `(Kern ${m2(kernM)})`)
        + (!pilot && rs < 1.8 - 1e-9 ? ' (Minimalfall)' : '') + nach })
    }
  }
  return out
}
const gegenSchiene = (e: Eingaben) => e.tram && (e.ist === MISCH || e.geg === MISCH)

// ── Wege ohne bzw. neben der Fahrbahn (Nutzerentscheid 20.10.2026; nicht im Katalog des lokalen Rechners) ──
// Fussweg mit Velo bzw. gemeinsamer Fuss-/Radweg: Rang 1 als Fuss-/Radweg signalisieren, wenn er die Vorgabe
// (Q 11) schon hat; Rang 6 auf die Vorgabe verbreitern oder Fuss- und Veloverkehr trennen (Zweirichtungsradweg
// Q 10 auf dem Weg ohne Fahrbahn, sonst abgesetzter Radweg Q 3, dazu ein Fussweg von 2,00 m). Den Platz neben dem
// Weg kennt die App nicht: Ein Vorschlag, der verbreitert, trägt den Vermerk.
function wegVarianten(e: Eingaben): Kand[] {
  const seiten = seitenVon(e).filter(s => formVon(e, s) === FUSSWEG || formVon(e, s) === KOMBI)
  if (!seiten.length) return []
  const out: Kand[] = []
  const sollKombi = soll(e, KOMBI) ?? 3.5
  const breit = (s: S) => (e.breite[s] ?? 0) + 1e-9 >= sollKombi
  const setzen = (form: IstFuehrungsform, breite: (s: S) => number) => {
    let k = e
    for (const s of seiten) k = formSetzen(k, s, form, breite(s))
    return k
  }
  if (seiten.some(s => formVon(e, s) === FUSSWEG) && seiten.every(breit))
    out.push({ rang: 1, text: 'Als Fuss-/Radweg signalisieren (Q 11)', k: setzen(KOMBI, s => e.breite[s]!), weg: 0 })
  if (!seiten.every(breit)) {
    const k = setzen(KOMBI, s => Math.max(e.breite[s] ?? 0, sollKombi)); k.platzOffen = true
    out.push({ rang: 6, text: `Fuss-/Radweg auf ${m2(sollKombi)} verbreitern (Q 11)`, k, weg: 0 })
  }
  const velo = e.ohneFahrbahn ? ZWEIRICHTUNG : RW_ABGESETZT
  const vb = soll(e, velo) ?? 2.5
  const k = setzen(velo, () => vb)
  k.fussNeben = Object.fromEntries((e.ohneFahrbahn ? ['A'] : seiten).map(s => [s, FUSS_NEBEN_M]))
  k.platzOffen = true
  out.push({ rang: 6, k, weg: 0, text: `Fuss- und Veloverkehr trennen: ${velo === ZWEIRICHTUNG ? 'Zweirichtungsradweg' : 'Radweg abgesetzt'} ${m2(vb)}`
    + ` + Fussweg ${m2(FUSS_NEBEN_M)}` })
  return out
}

// ── Ränge ──
function rang12(e: Eingaben): Kand[] {
  const out: Kand[] = []
  if (e.ohneFahrbahn) return wegVarianten(e).filter(c => c.rang === 1)   // ohne Fahrbahn keine Markierung auf der Strasse
  const f = inDieFahrbahn(e)
  if (f) out.push({ rang: 1, text: 'Velo in die Fahrbahn (Mischverkehr statt Fussweg)', k: f, weg: 0 })
  out.push(...sicherheitsstreifen(e), ...verbreitern(e), ...kernVarianten(e))
  if (SOLL_MIT_RS.includes(sollVon(e) as Fuehrungsart) || gegenSchiene(e)) out.push(...veloVarianten(e, 1, RS))
  return out
}
function parkOptionen(e: Eingaben, schlechtere: (e: Eingaben) => S): [string, Eingaben, 1 | 2][] {
  if (!parkseiten(e)) return []
  if (e.park.A && e.park.B) {
    const erste = e.einbahn ? 'A' : schlechtere(e)   // Einbahn: zuerst die Reihe auf der Radstreifen-Seite
    return [[`Parkierung Seite ${erste} aufheben`, ohneParkierung(e, erste)!, 1], ['Parkierung beidseitig aufheben', ohneParkierung(e, null)!, 2]]
  }
  return [[`Parkierung Seite ${e.park.A ? 'A' : 'B'} aufheben`, ohneParkierung(e, null)!, 2]]
}

export interface Vorschlag {
  erreicht: boolean | null          // null: keine Aussage (Eingaben fehlen)
  rang?: number
  text: string
  noteVor: number | null
  noteNach?: number
  alternative: string
  alternativen: { text: string; noteNach: number; k: Eingaben }[]   // zum Übernehmen (Nutzerwunsch 20.10.2026)
  blocker: string
  vermerk: string
  varianten: number                 // geprüfte Varianten
  k?: Eingaben                      // die Eingaben des Vorschlags (für die Aufteilung)
}
export const RANG_TEXT: Record<number, string> = {
  0: 'keine Massnahme nötig', 1: 'Markierung', 2: 'Kernfahrbahn', 3: 'Parkierung aufheben', 4: 'Velostrasse', 5: 'Haltestelle umbauen',
  6: 'Bau (Radweg)', 7: 'Tempo 30',
}

// Eingaben aus dem Abschnitt (Berner Rechner): Formen und Breiten je Seite, Parkierung wie die
// Ausgangslage der Planung (startAufteilung; Einbahn: links nach den amtlichen Parkfeldern)
export function eingabenVon(s: Section, stadt: Stadt = 'bern', breiten?: Breiten): Eingaben {
  const m = masseFuer(stadt, breiten)
  const a = seiteA(s), b = seiteB(s), einbahn = s.richtung === 'eine'
  const form = (f: typeof a) => (f.ist || null) as IstFuehrungsform | null
  // Fehlt eine Ist-Breite, gilt wie in der Ausgangslage der Planung die Vorgabe, als «angenommen» vermerkt
  // (Nutzerentscheid 20.10.2026: Planen auch ohne vollständige Ist-Angaben)
  const angenommen: string[] = []
  const annahme: Partial<Record<S, { form: IstFuehrungsform; breite: number }>> = {}
  const breite = (f: typeof a, seite: S) => {
    if (f.ist === MISCH || !f.ist) return null
    if (Number.isFinite(f.breite)) return f.breite
    // Weg ohne Fahrbahn: die gemessene «Fahrbahnbreite» ist die Wegfläche der AV
    if (s.ohneFahrbahn && WEG_TEIL[f.ist] && Number.isFinite(s.fahrbahnbreite)) return s.fahrbahnbreite
    if (!brauchtBreite(f.ist)) return null
    const v = sollBreite(f.ist, s.routentyp || 'Veloroute', breiten?.[f.ist])
    if (v == null) return null
    angenommen.push(`Breite Seite ${seite} (${f.ist}) mit der Vorgabe ${m2(v)} angenommen`)
    annahme[seite] = { form: f.ist, breite: v }
    return null
  }
  const parkJa = (f: typeof a) => f.parkenRechts === 'ja' && f.ist !== RW
  const dtv = dtvEff(s, stadt)
  const inselB = s.mittelinsel && !einbahn && a.ist !== VELOSTRASSE ? s.mittelinsel.breite : 0
  return {
    ist: form(a), geg: einbahn ? null : form(b),
    breite: { A: breite(a, 'A'), B: einbahn ? null : breite(b, 'B') },
    park: { A: parkJa(a), B: einbahn ? einbahnParkLinks(s) : parkJa(b) },
    parkFb: { A: !s.trottoir?.parkA, B: !s.trottoir?.parkB },
    // Schräg- und Querparkierung mit gemessener Tiefe, Längsparkierung mit 1,90 m (wie die Ausgangslage)
    parkTiefe: { A: tief(s.parkTiefe?.a)?.tiefe ?? m.park, B: tief(s.parkTiefe?.b)?.tiefe ?? m.park },
    parkArt: { ...(tief(s.parkTiefe?.a) ? { A: s.parkTiefe!.a } : {}), ...(tief(s.parkTiefe?.b) ? { B: s.parkTiefe!.b } : {}) },
    ...(s.parkVersetzt && !einbahn ? { parkVersetzt: s.parkVersetzt === 'a' ? 'A' as S : 'B' as S } : {}),
    sich: { A: parkJa(a) && a.parkenSicherheitsstreifen, B: !einbahn && parkJa(b) && b.parkenSicherheitsstreifen },
    einbahn, route: s.routentyp || 'Veloroute', dtv: Number.isFinite(dtv) ? dtv : null, kmh: Number.isFinite(s.speed) ? s.speed : null,
    dtvBelegt: Number.isFinite(s.dtv),   // Kernfahrbahn nur mit belegtem DTV (querschnitt.kern_erlaubt)
    // Mit Mittelinsel: der Querschnitt durch die Insel (wie die Ausgangslage), die Insel selbst steht nicht zur Verfügung
    tram: s.tram, insel: inselB,
    fahrbahn: inselB ? s.mittelinsel!.fahrbahn - inselB : Number.isFinite(s.fahrbahnbreite) ? s.fahrbahnbreite : null,
    halt: s.oevAngebot !== 'keine' || [a, b].some(f => f.haltestellentyp !== 'keine'),
    hsTyp: { A: a.haltestellentyp, B: b.haltestellentyp }, hsOhne: { A: a.ohneHaltestelle, B: einbahn || b.ohneHaltestelle },
    ...(einbahn && s.oevGegen ? { oevGegen: true } : {}),
    hbSeiten: stadt === 'bern' && s.haltestellenbereich ? (['A', 'B'] as S[]).filter(x => !(x === 'A' ? a : b).ohneHaltestelle && !(x === 'B' && einbahn)) : [],
    trottoir: { A: Number.isFinite(trottoirHeute(s, 'A', m.park)) ? trottoirHeute(s, 'A', m.park) : null,
      B: Number.isFinite(trottoirHeute(s, 'B', m.park)) ? trottoirHeute(s, 'B', m.park) : null },
    uTakt: [a, b].some(f => Number.isFinite(f.oevTakt)),
    angenommen, annahme,
    ohneFahrbahn: !!s.ohneFahrbahn,
    stadt, ...(breiten ? { breiten } : {}), ...(s.strassentyp ? { strassentyp: s.strassentyp } : {}), m,
  }
}

// Der Abschnitt, wie er mit den Eingaben einer Variante wäre (für die Note)
const breiteFuerNote = (e: Eingaben, s: S): number => {
  const an = e.annahme?.[s]
  return e.breite[s] ?? (an && an.form === formVon(e, s) ? an.breite : NaN)
}
export function abschnittAus(base: Section, e: Eingaben): Section {
  const sb = { ...base, routentyp: e.route, quelle: { ...base.quelle } }
  const s: Section = { ...sb, ist: e.ist ?? '', breite: breiteFuerNote(e, 'A'), parkenRechts: e.park.A ? 'ja' : 'nein',
    parkenSicherheitsstreifen: e.park.A && e.sich.A, speed: e.kmh ?? NaN, haltestellentyp: e.hsTyp.A }
  // Weg ohne Fahrbahn ohne Verkehrsdaten: ohne Motorfahrzeugverkehr rechnen (DTV 0, Tempo 30); sonst bleibt
  // ein Fuss-/Radweg oder Zweirichtungsradweg ohne Note
  if (e.ohneFahrbahn && !Number.isFinite(dtvEff(base, e.stadt))) { s.dtv = 0; s.dtvGeprueft = false }
  if (e.ohneFahrbahn && !Number.isFinite(s.speed)) s.speed = 30
  if (e.einbahn) delete s.gegen
  else s.gegen = { ...gegenVon(sb), ist: e.geg ?? '', breite: breiteFuerNote(e, 'B'), parkenRechts: e.park.B ? 'ja' : 'nein',
    parkenSicherheitsstreifen: e.park.B && e.sich.B, haltestellentyp: e.hsTyp.B }
  return s
}

function noten(base: Section, e: Eingaben): { n: number | null; a: number | null; b: number | null; fehlt: string[] } {
  const r = bewerteAbschnitt(abschnittAus(base, e), e.stadt, e.breiten)
  return { n: r.note, a: r.seiten[0]?.bewertung?.note ?? null, b: r.seiten[1]?.bewertung?.note ?? null,
    fehlt: [...new Set(r.seiten.flatMap(x => x.fehlt.map(f => (r.seiten.length > 1 ? `${f} (Seite ${x.seite})` : f))))] }
}

// Fehlende Meter für die knappste Veloanlage, die das Soll verlangt, ohne jede Parkierung
function fehltText(e: Eingaben): string {
  if (e.fahrbahn == null) return ''
  const formen: IstFuehrungsform[] = SOLL_MIT_RS.includes(sollVon(e) as Fuehrungsart) || gegenSchiene(e) ? [RS] : []
  if (sollVon(e) === 'Radweg' || !formen.length) formen.push(RW)
  const ohne = kopie(e); ohne.park = { A: false, B: false }
  let best: { b: number; f: IstFuehrungsform } | null = null
  for (const f of formen) for (const stufe of stufenFuer(ohne, f)) for (const kern of kernErlaubt(f, ohne) ? [false, true] : [false]) {
    const b = bedarf(f, ohne, stufe, kern, true).summe
    if (!best || b < best.b) best = { b, f }
  }
  if (!best || e.fahrbahn + 1e-9 >= best.b) return ''
  return `Fahrbahn zu schmal: auch ohne Parkierung fehlen ${m2(best.b - e.fahrbahn)} für `
    + `${best.f === RS ? 'einen Radstreifen' : 'einen Radweg'} (${numDE(e.fahrbahn, 1)} von ${m2(best.b)})`
}

// Der Vorschlag für einen Abschnitt; fahrbahn: verfügbares Mass (mit Randsteinanpassung grösser)
export function vorschlagRechnen(base: Section, fahrbahn?: number | null, stadt: Stadt = 'bern', breiten?: Breiten): Vorschlag {
  const res = vorschlagStadt(base, fahrbahn, stadt, breiten)
  if (stadt === 'bern') return res
  // Ausser Bern ohne die Hinweise auf die Berner Querschnittsblätter
  const ohneQ = (t: string) => t.replace(/ \(Q [^)]*\)/g, '')
  return { ...res, text: ohneQ(res.text), alternative: ohneQ(res.alternative), alternativen: res.alternativen.map(a => ({ ...a, text: ohneQ(a.text) })) }
}
function vorschlagStadt(base: Section, fahrbahn: number | null | undefined, stadt: Stadt, breiten?: Breiten): Vorschlag {
  const e = eingabenVon(base, stadt, breiten)
  if (fahrbahn !== undefined) e.fahrbahn = fahrbahn == null ? null : r2(fahrbahn - e.insel)
  const nv = noten(base, e), n0 = nv.n
  const res: Vorschlag = { erreicht: null, text: '', noteVor: n0, alternative: '', alternativen: [], blocker: '', vermerk: '', varianten: 0 }
  const vermerke: string[] = []
  if (e.angenommen?.length) vermerke.push(`Ist nicht vollständig erfasst: ${e.angenommen.join('; ')}`)
  if (!base.routentyp) vermerke.push('Routentyp fehlt: gerechnet als Veloroute')
  if (e.ohneFahrbahn && (!Number.isFinite(dtvEff(base, stadt)) || !Number.isFinite(base.speed)))
    vermerke.push('Weg ohne Fahrbahn ohne DTV oder Tempo: gerechnet ohne Motorfahrzeugverkehr')
  if (!e.ist) { res.blocker = 'keine Führungsform erfasst'; return res }
  if (n0 != null && n0 >= ZIEL) { Object.assign(res, { erreicht: true, rang: 0, text: RANG_TEXT[0], noteNach: n0, vermerk: vermerke.join(' · ') }); return res }
  // Die Note braucht online bei Formen mit Breitenvorgabe die Breite (lokal nicht): dann zuerst ergänzen
  // Masse ausser Bern: die der Stadt, sonst die Berner als Ersatz (nur wenn eine Massnahme gesucht wird)
  if (e.m.ersatz.length) vermerke.push(`Masse nach ${STANDARD_QUELLE[stadt]}; Ersatz Bern (${STANDARD_QUELLE.bern}): ${e.m.ersatz.join(', ')}`)
  if (n0 == null) { res.blocker = `Note von heute fehlt: ${nv.fehlt.join(', ') || 'Eingaben unvollständig'}`; return res }
  if (!sollVon(e) && !e.ohneFahrbahn) { res.blocker = 'kein Soll (DTV oder Tempo fehlt)'; return res }
  const e0 = e.fahrbahn == null ? { ...kopie(e), ohnePlatz: true } : e
  const schlechtere = (x: Eingaben): S => { const r = noten(base, x); return r.b != null && r.a != null && r.b < r.a ? 'B' : 'A' }
  const mitPark = (rang: number, x: Eingaben, f: (k: Eingaben) => Kand[]): Kand[] =>
    parkOptionen(x, schlechtere).flatMap(([ptxt, k, weg]) => f(k).map(c => ({ rang, text: `${ptxt} + ${c.text}`, k: c.k, weg })))
  const rang3 = (x: Eingaben): Kand[] => [
    ...parkOptionen(x, schlechtere).map(([text, k, weg]) => ({ rang: 3, text, k, weg })),
    ...mitPark(3, x, rang12)]
  const rang4 = (x: Eingaben): Kand[] => {
    const out: Kand[] = []
    const v = velostrasse(x)
    if (v) out.push({ rang: 4, text: 'Velostrasse signalisieren (Q 9)', k: v, weg: 0 })
    for (const [ptxt, k, weg] of parkOptionen(x, schlechtere)) {
      const w = velostrasse(k)
      if (w) out.push({ rang: 4, text: `${ptxt} + Velostrasse signalisieren (Q 9)`, k: w, weg })
    }
    return out
  }
  const rang5 = (x: Eingaben): Kand[] => {
    if (x.ohneFahrbahn) return []
    const out: Kand[] = []
    for (const s of seitenVon(x)) {
      const h = haltestelleUmbauen(x, s)
      if (!h) continue
      const txt = `Haltestelle Seite ${s} umbauen (separate Velofläche)`
      out.push({ rang: 5, text: txt, k: h, weg: 0 })
      for (const c of rang12(h)) out.push({ rang: 5, text: `${txt} + ${c.text}`, k: c.k, weg: 0 })
      for (const c of rang3(h)) out.push({ rang: 5, text: `${txt} + ${c.text}`, k: c.k, weg: c.weg })
    }
    return out
  }
  const rang6 = (x: Eingaben): Kand[] => {
    // Wege-Regeln nur für Wege ohne Fahrbahn (Nutzerentscheid 20.10.2026); an Strassen gilt der Katalog des lokalen Rechners
    if (x.ohneFahrbahn) return wegVarianten(x).filter(c => c.rang === 6)
    if (![x.ist, x.geg].some(f => f === MISCH || f === RS || f === FUSSWEG || f === UMWELTSPUR)) return []
    return [...veloVarianten(x, 6, RW), ...mitPark(6, x, k => veloVarianten(k, 6, RW))]
  }
  const rang7 = (x: Eingaben): Kand[] => {
    const t = x.ohneFahrbahn ? null : tempo30(x)
    if (!t) return []
    const davor = (c: Kand): Kand => ({ ...c, rang: 7, text: `Tempo 30 + ${c.text}` })
    return [{ rang: 7, text: 'Tempo 30', k: t, weg: 0 }, ...rang12(t).map(davor), ...rang3(t).map(davor), ...rang4(t).map(davor),
      ...rang5(t).map(davor), ...rang6(t).map(davor)]
  }
  const kand = e.ohneFahrbahn ? [...rang12(e), ...rang6(e)] : [...rang12(e0), ...rang3(e0), ...rang4(e0), ...rang5(e0), ...rang6(e0), ...rang7(e0)]
  // Haltestellenbereich (Nutzerbefund Muristrasse 20.10.2026): An der Haltestelle selbst ändert nur der Umbau etwas; eine
  // Markierung, ein Kern oder ein Radweg auf dieser Seite ist dort nicht möglich (Tramhaltestelle) und zählt für die Note nicht
  const hbUnberuehrt = (c: Kand) => !e.hbSeiten.length || (!c.k.quer?.kern && e.hbSeiten.every(s =>
    formVon(c.k, s) === formVon(e, s) && c.k.breite[s] === e.breite[s] && c.k.park[s] === e.park[s] && c.k.sich[s] === e.sich[s]))
  const kandHb = kand.filter(hbUnberuehrt)
  res.varianten = kandHb.length
  const treffer = kandHb.map(c => ({ ...c, n: noten(base, c.k).n }))
    .filter((c): c is Kand & { n: number } => c.n != null && c.n >= ZIEL)
    .sort((x, y) => x.rang - y.rang || x.weg - y.weg || x.text.split(' + ').length - y.text.split(' + ').length
      || Number(x.text.includes('beidseitig')) - Number(y.text.includes('beidseitig')) || y.n - x.n)
  const piloten = treffer.filter(t => t.text.includes('(Pilot)'))
  const haupt = treffer.filter(t => !t.text.includes('(Pilot)'))
  const altText = (t: Kand & { n: number }) => `${t.text} → ${numDE(t.n, 1)}`
  if (!haupt.length) {
    res.erreicht = false
    res.blocker = (e.ohneFahrbahn ? '' : fehltText(e)) || ([e.ist, e.geg].includes(UMWELTSPUR)
      ? 'Umweltspur bei dichtem Bus-Takt (Massnahme liegt beim ÖV)' : 'mit keiner Massnahme des Katalogs auf 4,5')
    if (piloten.length) {
      res.alternative = `nur im Pilot möglich: ${altText(piloten[0])}`
      res.alternativen = [{ text: piloten[0].text, noteNach: piloten[0].n, k: piloten[0].k }]
    }
    res.vermerk = vermerke.join(' · ')
    return res
  }
  const r1 = haupt[0]
  Object.assign(res, { erreicht: true, rang: r1.rang, text: r1.text, noteNach: r1.n, k: r1.k })
  if (r1.k.hsUmbau?.length) {
    if (r1.k.hsUmbau.some(s => hsPlatz(e, s) == null))
      vermerke.push(`Platz für die Veloumfahrung nicht geprüft (Trottoir oder Fahrbahnbreite unbekannt): je Seite ausserhalb der Haltekante ${m2(HS1_MIN_M)}, im Standard ${m2(HS1_STD_M)}`)
    if (e.tram) vermerke.push('Tramhaltestelle: Platzbedarf der Haltekante nicht geprüft')
  }
  if (r1.k.platzOffen) vermerke.push('Platz neben dem Weg nicht geprüft: die App kennt die Fläche daneben nicht')
  else if (e.fahrbahn == null && !e.ohneFahrbahn && !/^(Tempo 30|Velo in die Fahrbahn)/.test(r1.text.replace(/^Tempo 30 \+ /, '')))
    vermerke.push('Fahrbahnbreite unbekannt: Platz nicht geprüft, der Vorschlag nennt nur die nötige Führungsform')
  res.vermerk = vermerke.join(' · ')
  // Alternative: anderer Rang, andere Parkierung oder (bei Wegen) Trennen statt Verbreitern
  const trennt = (x: string) => x.startsWith('Fuss- und Veloverkehr trennen')
  const alt = haupt.slice(1).find(t => t.text !== r1.text && (t.rang !== r1.rang || t.weg !== r1.weg || trennt(t.text) !== trennt(r1.text)))
  let alts = alt ? [alt] : []
  if (r1.text.includes('als Kernfahrbahn (Kern')) {
    const stamm = r1.text.split('als Kernfahrbahn')[0].split(' beidseitig')[0]
    const pil = piloten.find(t => t.weg === r1.weg && t.text.startsWith(stamm))
    if (pil) alts = [pil]
  }
  const spar = piloten.find(t => t.weg < r1.weg && !alts.includes(t))
  if (spar) alts.push(spar)
  res.alternative = alts.map(altText).join('; oder: ')
  res.alternativen = alts.map(x => ({ text: x.text, noteNach: x.n, k: x.k }))
  return res
}

// ── Randsteinanpassung: Trottoirs je Seite gegen die Vorgabe des Fussverkehrsnetzes ──
// ist: Trottoir heute (ohne Parkierung auf Trottoirniveau, auf 5 cm wie seitenraumVon), NaN = keines;
// frei: was über der Vorgabe liegt (darf weg); fehlt: was bis zur Vorgabe fehlt (kommt dazu)
export interface TrottoirAnpassung { vorgabe: number; ist: Record<S, number>; frei: Record<S, number>; fehlt: Record<S, number> }
const trottoirHeute = (s: Section, seite: S, parkM = PARK_M): number => {
  const m = seite === 'A' ? s.trottoir?.a : s.trottoir?.b
  if (m == null || !Number.isFinite(m)) return NaN
  const park = seite === 'A' ? s.trottoir?.parkA && seiteA(s).parkenRechts === 'ja'
    : s.trottoir?.parkB && (s.richtung === 'eine' ? einbahnParkLinks(s) : seiteB(s).parkenRechts === 'ja')
  return auf5cm(park ? m - (tief(s.parkTiefe?.[seite === 'A' ? 'a' : 'b'])?.tiefe ?? parkM) : m)
}
export function trottoirAnpassung(s: Section, a: Aufteilung, stadt: Stadt = 'bern'): TrottoirAnpassung | null {
  const v = a.fussnetz ? FUSSNETZ[a.fussnetz] : undefined
  if (!v || v.stadt !== stadt || !s.trottoir) return null
  const parkM = masseFuer(stadt).park
  const ist = { A: trottoirHeute(s, 'A', parkM), B: trottoirHeute(s, 'B', parkM) }
  const je = (f: (m: number) => number) => ({ A: Number.isFinite(ist.A) ? r2(f(ist.A)) : 0, B: Number.isFinite(ist.B) ? r2(f(ist.B)) : 0 })
  return { vorgabe: v.wert, ist, frei: je(m => Math.max(0, m - v.wert)), fehlt: je(m => Math.max(0, v.wert - m)) }
}
// verfügbare Fahrbahn mit Randsteinanpassung
export const fahrbahnMitRandstein = (fb: number, t: TrottoirAnpassung): number => r2(fb + t.frei.A + t.frei.B - t.fehlt.A - t.fehlt.B)

// ── Aufteilung aus einem Vorschlag: Teile von links (Rand Seite B) nach rechts (Rand Seite A) ──
// randstein: Anpassung der Trottoirs (null = Randstein bleibt)
export function aufteilungAusVorschlag(base: Section, a0: Aufteilung, v: Vorschlag, randstein: TrottoirAnpassung | null): Aufteilung | null {
  const k = v.k
  // verfügbar ist das Mass der Planung (Feld «Verfügbare Fahrbahnbreite»), sonst das des Abschnitts
  const fb0 = Number.isFinite(a0.fahrbahn) ? a0.fahrbahn : base.fahrbahnbreite
  if (!k) return null
  const wegTeile = (s: S): Teil[] => {
    const f = s === 'B' && k.einbahn ? null : formVon(k, s)
    const art = f ? WEG_TEIL[f] : undefined
    if (!art) return []
    const an = k.annahme?.[s]
    const b = k.breite[s] ?? (an && an.form === f ? an.breite : undefined) ?? soll(k, f!) ?? NaN
    return [...(k.fussNeben?.[s] ? [{ art: 'Trottoir', breite: k.fussNeben[s]! } as Teil] : []), { art, breite: b }]
  }
  // Weg ohne Fahrbahn: nur der Weg (ein Teil für beide Richtungen), getrennt mit dem Fussweg daneben
  if (k.ohneFahrbahn) {
    const teile = wegTeile('A').reverse()
    if (!k.einbahn && formVon(k, 'B') !== formVon(k, 'A')) teile.unshift(...wegTeile('B').filter(x => x.art !== 'Trottoir'))
    return { ...a0, fahrbahn: 0, teile, tempo: undefined, vorschlag: v.text }
  }
  if (!Number.isFinite(fb0)) return null
  const q = k.quer
  const umbau = (s: S) => !!k.hsUmbau?.includes(s)
  const rand = (s: S): Teil[] => {
    // Haltestelle umgebaut: an der Haltestelle liegt auf dieser Seite nichts in der Fahrbahn (siehe unten)
    if (umbau(s)) return []
    const t: Teil[] = [...wegTeile(s)]
    if (k.park[s]) {
      const pa = k.parkArt[s]
      t.push({ art: 'Parkierung', breite: k.parkTiefe[s], ...(pa && pa.art !== 'laengs' ? { parkart: pa.art, ...(pa.winkel ? { winkel: pa.winkel } : {}) } : {}),
        ...(pa && pa.art !== 'laengs' ? (pa.angenommen ? { angenommen: true } : { tiefeGemessen: true }) : {}), ...(k.parkFb[s] ? {} : { trottoirniveau: true }),
        ...(versetztZaehlt(k, s) ? {} : { versetzt: true }) })
      if (k.sich[s]) t.push({ art: 'Sicherheitsstreifen', breite: q?.sichJe || k.m.sicherheit.standard })
    }
    const f = s === 'B' && k.einbahn ? null : formVon(k, s)
    const an = k.annahme?.[s]
    const b = k.breite[s] ?? (an && an.form === f ? an.breite : undefined) ?? q?.ersatz ?? velobreite(k, RS, 'minimal')
    if (f === RS) t.push({ art: 'Velostreifen', breite: b })
    if (f === RW) { t.push({ art: 'Radweg', breite: b }); t.push({ art: 'Trennstreifen', breite: k.m.trennung }) }
    return t
  }
  const links = rand('B'), rechts = rand('A').reverse()
  const imFb = (t: Teil) => !t.trottoirniveau
  const seitlich = r2([...links, ...rechts].filter(imFb).reduce((x, t) => x + t.breite, 0))
  const velostr = q?.form === VELOSTRASSE
  const mittelMin = (velostr ? k.m.vsMin : q?.kern ? q.kernM! : miv(q?.form === RW ? RW : RS, k, false)) + k.insel
  // Trottoirs: heute gemessen (ohne Parkierung auf Trottoirniveau, auf 5 cm wie der Seitenraum der Bilanz).
  // Mit Randsteinanpassung zuerst die zu schmalen auf die Vorgabe (zulasten der Fahrbahn), dann von den zu
  // breiten nur den nötigen Teil, anteilig nach ihrem Überschuss.
  let trA = trottoirHeute(base, 'A', k.m.park), trB = trottoirHeute(base, 'B', k.m.park)
  let fb = fb0
  if (randstein) {
    trA = r2(trA + randstein.fehlt.A); trB = r2(trB + randstein.fehlt.B)
    fb = r2(fb - randstein.fehlt.A - randstein.fehlt.B)
    const noetig = Math.max(0, Math.ceil((seitlich + mittelMin - fb) / 0.05 - 1e-9) * 0.05)
    const total = randstein.frei.A + randstein.frei.B
    if (noetig > 1e-9 && total > 1e-9) {
      const nimmA = Math.min(randstein.frei.A, abrunden(noetig * randstein.frei.A / total))
      const nimmB = Math.min(randstein.frei.B, r2(noetig - nimmA))
      trA = r2(trA - nimmA); trB = r2(trB - nimmB); fb = r2(fb + nimmA + nimmB)
    }
  }
  // Haltestelle umgebaut (Rang 5): vom Rand Trottoir, Radweg, Abstand, Wartebereich (HS 1, Masterplan S. 64/65), im Standard
  // wenn der Platz reicht, sonst minimal. Was das Trottoir von heute (samt Grünstreifen) nicht hergibt, kommt aus der Fahrbahn.
  const hsTeile: Partial<Record<S, Teil[]>> = {}
  for (const s of ['A', 'B'] as S[]) {
    if (!umbau(s)) continue
    const std = (hsPlatz(k, s) ?? HS1_STD_M) >= HS1_STD_M - 1e-9
    const gr = (s === 'A' ? base.trottoir?.gruenA : base.trottoir?.gruenB) ?? 0
    const heute = (s === 'A' ? trA : trB) + gr
    const R = std ? 1.8 : 1.6, A = std ? 0.5 : 0.3, H = 3.1, Tmin = std ? 2.5 : 2.0
    // Trottoir heute unbekannt: kein Platz ausserhalb angenommen, alles kommt aus der Fahrbahn (die Prüfung der Fahrspuren
    // zeigt, wenn es nicht reicht; Nutzerbefund Muristrasse: vorher entstanden 7,90 m aus dem Nichts)
    const da = Number.isFinite(heute) ? heute : 0
    const T = da >= R + A + H + Tmin - 1e-9 ? r2(da - R - A - H) : Tmin
    if (da < R + A + H + Tmin - 1e-9) fb = r2(fb - (R + A + H + Tmin - da))
    hsTeile[s] = [{ art: 'Trottoir', breite: T }, { art: 'RadwegAbgesetzt', breite: R }, { art: 'HaltAbstand', breite: A }, { art: 'Haltestelle', breite: H }]
  }
  const mitte = r2(fb - seitlich - k.insel)
  let kern: Teil[]
  if (k.insel && !velostr) {
    const art = k.tram ? 'Tram' : 'Fahrspur'
    kern = [{ art, breite: abrunden(mitte / 2) }, { art: 'Mittelinsel', breite: k.insel }, { art, breite: abrunden(mitte / 2) }] as Teil[]
  } else if (velostr) kern = [{ art: 'Velostrasse', breite: mitte }]
  else if (q?.kern) kern = [{ art: 'Kernfahrbahn', breite: q.kernM! }]
  else {
    const n = k.einbahn && !k.oevGegen ? 1 : 2, art = k.tram ? 'Tram' : 'Fahrspur'
    if (n === 2 && !k.einbahn && art === 'Fahrspur' && mitte < k.m.miv - 1e-9 && (k.ist === MISCH || k.geg === MISCH)) kern = [{ art: 'Gemeinsam', breite: abrunden(mitte) }]
    else kern = Array.from({ length: n }, (_, j) => ({ art, breite: abrunden(mitte / n),
      // Einbahn mit Bus bzw. Tram in der Gegenrichtung: die linke Spur fährt entgegen (Richtung B)
      ...(k.einbahn && k.oevGegen ? { richtung: j === 0 ? 'B' : 'A', ...(j === 0 && art === 'Fahrspur' ? { bild: 'bus' } : {}) } : {}) }) as Teil)
  }
  const trottoir = (m: number): Teil[] => (Number.isFinite(m) && m > 0.005 ? [{ art: 'Trottoir', breite: r2(m) }] : [])
  // Grünstreifen zwischen Fahrbahn und Trottoir bleibt (aus der AV)
  const randB = hsTeile.B ?? [...trottoir(trB), ...gruenAusAv(base.trottoir?.gruenB)]
  const randA = hsTeile.A ? [...hsTeile.A].reverse() : [...gruenAusAv(base.trottoir?.gruenA), ...trottoir(trA)]
  const teile = [...randB, ...links, ...kern, ...rechts, ...randA]
  const hsTyp = k.hsUmbau?.length ? { haltestellentyp: { ...a0.haltestellentyp, ...Object.fromEntries(k.hsUmbau.map(s => [s, HS_UMFAHRUNG])) } } : {}
  return { ...a0, ...hsTyp, fahrbahn: fb0, teile,
    ...(k.kmh != null && k.kmh !== base.speed ? { tempo: k.kmh } : { tempo: undefined }),
    vorschlag: `${v.text}${randstein ? ' (mit Randsteinanpassung)' : ''}` }
}
