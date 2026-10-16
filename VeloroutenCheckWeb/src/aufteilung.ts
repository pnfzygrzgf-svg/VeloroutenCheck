// ── Aufteilung planen: Querschnitt von Hand, geprüft gegen die Vorgaben (Etappe 1, nur Bern) ──
//
// Nutzerentscheid 16.10.2026: Die App schlägt keine Massnahmen vor (anders als der lokale
// Berner Rechner mit seinem Zielbild). Der Nutzer stellt den Querschnitt aus Teilen zusammen;
// die App rechnet die Summe gegen das verfügbare Mass, prüft jedes Teil gegen die Vorgabe der
// Stadt und zeigt, welche Note der Abschnitt mit dieser Aufteilung erhielte — mit derselben
// Bewertung wie heute (bewertung.ts), nur mit Führungsform und Breite aus der Aufteilung.
//
// Reihenfolge der Teile: von links nach rechts, in Fahrtrichtung der Seite A gesehen. Links ist
// der Rand der Seite B (Gegenrichtung), rechts der Rand der Seite A (Rechtsverkehr). Trottoirs
// liegen ausserhalb der Fahrbahn (Bordstein–Bordstein) und zählen nicht zur Summe.
//
// Richtwerte Bern aus dem Masterplan Veloinfrastruktur (Standards, Oktober 2025): Fahrspur 3,00
// (Fahrbahn 6,00 zweispurig), Fahrspur mit Tram 3,25, Parkierung 1,90, Sicherheitsstreifen zur
// Parkierung 0,80 (mindestens 0,50), Trennstreifen zum Radweg 0,15; Velostreifen und Radweg nach
// den Soll-Breiten der Bewertung (fuehrungsform.ts, je Routentyp). Für das Trottoir macht der
// Masterplan keine Vorgabe.
//
// Kernfahrbahn (Masterplan, Querschnitt Q 5): Fahrbahn ohne Mittellinie, der Kern trägt beide
// Richtungen, die Velostreifen liegen an den Rändern. Kern 4,50–5,50 m; nur mit Velostreifen auf
// beiden Seiten, nicht auf der Einbahn, bis Tempo 50 und DTV unter 10 000 (optimal unter 5 000).
// Mit Tramgleis nur ein Hinweis: Im Kern von 4,50 m bleibt zwischen Schiene und Velostreifen wenig
// Platz. Die Note ändert die Kernfahrbahn nicht: Bewertet wird der Velostreifen.

import {
  maxBreite, sollBreite, type BreitenSoll, type IstFuehrungsform, type ParkenRechts, type Routentyp, type Stadt,
} from './fuehrungsform'
import { bewerteAbschnitt, type AbschnittErgebnis } from './bewertung'
import { gegenVon, seiteA, seiteB, seitenGleich, type Section, type Seite } from './strecke'
import { numDE } from './csv'

export type TeilArt = 'Trottoir' | 'Haltestelle' | 'Gruen' | 'Parkierung' | 'Veloabstellplatz' | 'Parklet' | 'Sicherheitsstreifen' | 'Velostreifen'
  | 'Pfosten' | 'Radweg' | 'Trennstreifen' | 'Fahrspur' | 'Gemeinsam' | 'Kernfahrbahn' | 'Velostrasse' | 'Tram'
// Bild: was auf dem Teil steht (Skizze; bei der Fahrspur auch die Vorgabe). Markierung: Draufsicht
// auf dem Teil (nur Skizze). Fehlt eines, gilt das erste der Liste in BILDER bzw. 'keine'.
export type Bild = 'fuss' | 'sitzbank' | 'baum' | 'strauch' | 'blumen' | 'auto' | 'lastwagen' | 'bus'
export type Markierung = 'keine' | 'geradeaus' | 'links' | 'rechts'
// Fahrtrichtung eines Teils (nur Skizze: Fahrzeug von vorne oder hinten, Richtung der Pfeile).
// A = in Richtung der Seite A (vom Betrachter weg), B = entgegen, beide = Gegenverkehr im selben Teil.
export type Richtung = 'A' | 'B' | 'beide'
// Trottoir-Vorgabe nach dem Fussverkehrsnetz (Masterplan Fussverkehr Stadt Bern, Nutzerangabe 16.10.2026)
export type FussNetz = 'basis_pi' | 'basis' | 'fein_pi' | 'fein'
export const FUSSNETZ: Record<FussNetz, { label: string; min: number }> = {
  basis_pi: { label: 'Basisnetz, publikumsintensiv', min: 3.5 }, basis: { label: 'Basisnetz', min: 2.5 },
  fein_pi: { label: 'Feinverteilernetz, publikumsintensiv', min: 2.5 }, fein: { label: 'Feinverteilernetz', min: 2.0 },
}
export const FUSSNETZ_QUELLE = 'Masterplan Fussverkehr Stadt Bern'
// breite NaN = leer; angenommen: Breite heute unbekannt, Vorgabe eingesetzt (startAufteilung)
export interface Teil { art: TeilArt; breite: number; bild?: Bild; markierung?: Markierung; richtung?: Richtung; angenommen?: boolean }
// fahrbahn: verfügbares Mass Bordstein–Bordstein [m], NaN = leer; fussnetz: Netz für die Trottoir-Vorgabe
// fussnetzQuelle 'geoportal': aus dem Richtplan Fussverkehr vorbelegt (fussnetz.ts), sonst von Hand
// seitenraum: Breite ausserhalb der Fahrbahn heute, beide Seiten zusammen [m] (Trottoirs aus der AV),
// NaN oder fehlend = unbekannt; dann gilt die Bilanz nur für die Fahrbahn.
export interface Aufteilung { fahrbahn: number; teile: Teil[]; seitenraum?: number; fussnetz?: FussNetz; fussnetzQuelle?: 'geoportal' }

export const TEIL_ARTEN: TeilArt[] = ['Trottoir', 'Haltestelle', 'Gruen', 'Parkierung', 'Veloabstellplatz', 'Parklet', 'Sicherheitsstreifen', 'Velostreifen',
  'Pfosten', 'Radweg', 'Trennstreifen', 'Fahrspur', 'Gemeinsam', 'Kernfahrbahn', 'Velostrasse', 'Tram']
export const TEIL_LABEL: Record<TeilArt, string> = {
  Trottoir: 'Trottoir', Haltestelle: 'Haltestelle (Wartehäuschen und Warteraum)', Gruen: 'Grünstreifen', Parkierung: 'Längsparkierung (Autos)', Veloabstellplatz: 'Veloabstellplatz',
  Parklet: 'Parklet', Sicherheitsstreifen: 'Sicherheitsstreifen zur Parkierung', Velostreifen: 'Velostreifen',
  Pfosten: 'Trennung mit Pfosten', Radweg: 'Radweg (baulich getrennt)', Trennstreifen: 'Trennstreifen zum Radweg',
  Fahrspur: 'Fahrspur', Gemeinsam: 'Fahrbahn ohne Mittellinie (Gegenverkehr)', Kernfahrbahn: 'Kernfahrbahn (ohne Mittellinie, beide Richtungen)',
  Velostrasse: 'Velostrasse (ganze Fahrbahn)', Tram: 'Fahrspur mit Tramgleis',
}
export const BILDER: Partial<Record<TeilArt, Bild[]>> = {
  // Das Wartehäuschen gehört zur Haltestelle, nicht zum Trottoir (Nutzerbefund 16.10.2026)
  Trottoir: ['fuss', 'sitzbank'], Gruen: ['baum', 'strauch', 'blumen'],
  Fahrspur: ['auto', 'lastwagen', 'bus'], Gemeinsam: ['auto', 'lastwagen', 'bus'],
}
export const BILD_LABEL: Record<Bild, string> = {
  fuss: 'Fussgänger*in', sitzbank: 'Sitzbank', baum: 'Baum', strauch: 'Strauch', blumen: 'Blumen',
  auto: 'Auto', lastwagen: 'Lastwagen', bus: 'Bus',
}
export const bildVon = (t: Teil): Bild | undefined =>
  (t.bild && BILDER[t.art]?.includes(t.bild) ? t.bild : BILDER[t.art]?.[0])
// Kein Velo-Piktogramm (Nutzerentscheid 16.10.2026): Das Streetmix-Bild ist ein Sharrow, keine
// Schweizer Markierung. Doppelpfeil (je einer in jede Richtung) nur für Teile, die beide
// Richtungen tragen, und nicht auf der Einbahn.
export const MARKIERUNG_LABEL: Record<Markierung, string> = {
  keine: 'keine Markierung', geradeaus: 'Pfeil geradeaus', links: 'Pfeil links', rechts: 'Pfeil rechts',
}
// Teile mit Verkehr: Richtung und Markierung wählbar. Gegenverkehr im selben Teil nur bei den
// Teilen ohne Mittellinie und nicht auf der Einbahn; dann zeigt die Skizze je ein Fahrzeug von
// vorne und von hinten und die Pfeile in beide Richtungen (ersetzt den Doppelpfeil).
const MIT_VERKEHR: TeilArt[] = ['Velostreifen', 'Radweg', 'Fahrspur', 'Gemeinsam', 'Kernfahrbahn', 'Velostrasse', 'Tram']
const BEIDE_RICHTUNGEN: TeilArt[] = ['Gemeinsam', 'Kernfahrbahn', 'Velostrasse']
export const markierungenFuer = (art: TeilArt): Markierung[] => (MIT_VERKEHR.includes(art) ? ['keine', 'geradeaus', 'links', 'rechts'] : [])
export const richtungenFuer = (art: TeilArt, einbahn: boolean): Richtung[] =>
  !MIT_VERKEHR.includes(art) ? [] : einbahn ? ['A'] : BEIDE_RICHTUNGEN.includes(art) ? ['beide', 'A', 'B'] : ['A', 'B']
// Liegt das Teil links der Fahrbahnmitte (Mitte der Fahrbahnteile nach Breite)? Wie in der Skizze.
export function linksDerMitte(teile: Teil[]): boolean[] {
  const b = teile.map(t => (Number.isFinite(t.breite) ? t.breite : 0))
  const x0 = b.map((_, i) => b.slice(0, i).reduce((s, v) => s + v, 0))
  const fb = teile.map((_, i) => i).filter(i => istFahrbahnTeil(teile[i]) && b[i] > 0)
  if (!fb.length) return teile.map(() => false)
  const mitte = (x0[fb[0]] + x0[fb[fb.length - 1]] + b[fb[fb.length - 1]]) / 2
  return teile.map((_, i) => x0[i] + b[i] / 2 < mitte)
}
// Richtung ohne eigene Wahl: Gegenverkehr bei Teilen ohne Mittellinie, sonst nach der Lage (links der
// Mitte Seite B), auf der Einbahn immer A.
export function richtungVon(t: Teil, links: boolean, einbahn: boolean): Richtung {
  const moeglich = richtungenFuer(t.art, einbahn)
  if (t.richtung && moeglich.includes(t.richtung)) return t.richtung
  if (einbahn) return 'A'
  return BEIDE_RICHTUNGEN.includes(t.art) ? 'beide' : links ? 'B' : 'A'
}

// Richtwerte (siehe Kopf). `min` = Untergrenze, `max` = Obergrenze eines Bandes (Kernfahrbahn
// 4,50–5,50: unter 4,50 zu schmal, über 5,50 zu breit). Die Fahrspur hängt von Fahrzeug, Tempo
// und Radweg ab und steht in pruefeTeil; ebenso das Tram (Einbahn).
export const RICHTWERT: Partial<Record<TeilArt, { wert: number; min?: number; max?: number }>> = {
  Fahrspur: { wert: 3.0, min: 3.0 }, Tram: { wert: 3.0, min: 2.8 }, Parkierung: { wert: 1.9 },
  Sicherheitsstreifen: { wert: 0.8, min: 0.5 }, Trennstreifen: { wert: 0.15 }, Pfosten: { wert: 0.7 },
  // Haltestelle: Wartehäuschen samt Platz davor, zwischen Bordstein und Trottoir (Nutzerangabe 16.10.2026)
  Haltestelle: { wert: 3.1, min: 3.1 },
  Kernfahrbahn: { wert: 4.5, min: 4.5, max: 5.5 },
}
// Vorbelegte Breite für Teile ohne Vorgabe (Nutzerentscheid 16.10.2026: Veloabstellplatz 1,90)
export const STANDARD_BREITE: Partial<Record<TeilArt, number>> = {
  Veloabstellplatz: 1.9, Parklet: 1.9, Gruen: 1.5, Trottoir: 2.0, Gemeinsam: 4.5,
}
export const KERN_DTV_MAX = 10000, KERN_DTV_OPT = 5000, KERN_KMH_MAX = 50
export const RICHTWERT_QUELLE = 'Masterplan Veloinfrastruktur Stadt Bern'
export const LICHTRAUM_QUELLE = 'SN 640 201 (Lichtraumprofil)'
const FESTLEGUNG = 'Festlegung VeloroutenCheck 16.10.2026'

// Lichtraum nach SN 640 201: Grundbreite + je Seite Bewegungsspielraum (nach Tempo, Tab. 5) und
// Sicherheitszuschlag. Personenwagen 1,80 (Zuschlag 0,20), Lastwagen/Bus 2,50 (Zuschlag 0,30).
// Ohne Tempo: 50 km/h.
export function lichtraum(fahrzeug: 'auto' | 'lastwagen' | 'bus', kmh: number): number {
  const v = Number.isFinite(kmh) ? kmh : 50
  const spiel = v <= 20 ? 0 : v <= 40 ? 0.1 : v <= 70 ? 0.2 : v <= 100 ? 0.3 : 0.4
  return fahrzeug === 'auto' ? 1.8 + 2 * (spiel + 0.2) : 2.5 + 2 * (spiel + 0.3)
}
// Lichtraum des Trams: 1,40 m ab Gleisachse zu einer festen Kante (Masterplan, Kaphaltestelle) je Seite.
export const TRAM_LICHTRAUM_M = 2.8

export const auf5cm = (m: number): number => Math.round(m * 20) / 20
export const istFahrbahnTeil = (t: Teil): boolean => t.art !== 'Trottoir' && t.art !== 'Haltestelle' && t.art !== 'Gruen'

// Summe der Fahrbahn-Teile und Rest gegenüber dem verfügbaren Mass (negativ = Fehlmass).
// Bilanz über den ganzen Querschnitt (Nutzerentscheid 16.10.2026): Verfügbar sind die Fahrbahn
// (Bordstein–Bordstein) und die Breite ausserhalb der Fahrbahn von heute (seitenraum, Trottoirs aus
// der AV); alle Teile zählen, auch Trottoirs, Haltestelle und Grünstreifen. Der Bordstein darf also
// wandern: Ein breiteres Trottoir geht zulasten der Fahrbahn. Ist der Seitenraum unbekannt, gilt die
// Bilanz nur für die Fahrbahnteile (ganz = false). fahrbahnSumme: Summe der Fahrbahnteile (Information).
export interface Bilanz { summe: number; verfuegbar: number; rest: number; offen: number; ganz: boolean; fahrbahnSumme: number }
// Bilanz als Sätze für Planung und Bericht: Kopf (was gegen was), Ergebnis, Zusätze.
export function bilanzText(a: Aufteilung, b: Bilanz): { kopf: string; ergebnis: string; fehlmass: boolean; zusatz: string[] } {
  const m = (x: number) => `${numDE(x, 2)} m`
  const kopf = b.ganz
    ? `Ganzer Querschnitt: Summe aller Teile ${m(b.summe)}` + (Number.isFinite(b.verfuegbar)
      ? ` von ${m(b.verfuegbar)} (Fahrbahn ${m(a.fahrbahn)} + heute ausserhalb der Fahrbahn ${m(a.seitenraum!)})` : '')
    : `Summe der Fahrbahnteile ${m(b.summe)}` + (Number.isFinite(b.verfuegbar) ? ` von ${m(b.verfuegbar)}` : '')
  const ergebnis = !Number.isFinite(b.rest) ? 'verfügbare Fahrbahnbreite angeben'
    : Math.abs(b.rest) < 0.005 ? 'geht auf' : b.rest < 0 ? `Fehlmass ${m(-b.rest)}` : `Rest ${m(b.rest)} nicht verteilt`
  const zusatz: string[] = []
  if (b.ganz) zusatz.push(`davon Fahrbahnteile ${m(b.fahrbahnSumme)}`)
  else if (a.teile.some(t => !istFahrbahnTeil(t)))
    zusatz.push('Breite ausserhalb der Fahrbahn heute unbekannt: Bilanz nur für die Fahrbahn, Trottoirs und Haltestelle zählen nicht')
  if (b.offen > 0) zusatz.push(`${b.offen === 1 ? 'ein Teil' : `${b.offen} Teile`} ohne Breite`)
  return { kopf, ergebnis, fehlmass: Number.isFinite(b.rest) && b.rest < -0.005, zusatz }
}

export function bilanz(a: Aufteilung): Bilanz {
  const sum = (ts: Teil[]) => ts.reduce((s, t) => s + (Number.isFinite(t.breite) ? t.breite : 0), 0)
  const fb = a.teile.filter(istFahrbahnTeil)
  const ganz = a.seitenraum != null && Number.isFinite(a.seitenraum)
  const zaehlt = ganz ? a.teile : fb
  const summe = sum(zaehlt)
  const verfuegbar = Number.isFinite(a.fahrbahn) ? a.fahrbahn + (ganz ? a.seitenraum! : 0) : NaN
  return { summe, verfuegbar, rest: verfuegbar - summe, offen: zaehlt.filter(t => !Number.isFinite(t.breite)).length, ganz, fahrbahnSumme: sum(fb) }
}

// Vorgabe und Status eines Teils. Velostreifen/Radweg/Velostrasse nach der Soll-Breite der
// Bewertung (je Routentyp, Stadt-Override); übrige Teile nach Richtwert.
// Fahrspur (Nutzerentscheide 16.10.2026): Richtwert 3,00; neben einem Radweg 3,25 (Masterplan
// Q 2a/2b); mit Lastwagen oder Bus der Lichtraum nach SN 640 201 (3,30 bis Tempo 40, 3,50 bis
// Tempo 70), wenn er grösser ist. Zu schmal ist jede Fahrspur erst unter 3,00.
// Tram: 3,00 bei Gegenverkehr (2 × 3,00 nach Masterplan), 3,25 auf der Einbahn (eigene
// Herleitung: sonst nur 0,65 m zwischen Schiene und Velostreifen); zu schmal unter dem Lichtraum 2,80.
export type TeilStatus = 'leer' | 'ok' | 'zu schmal' | 'zu breit' | 'unter Richtwert' | 'keine Vorgabe'
export interface TeilPruefung { soll?: number; min?: number; max?: number; status: TeilStatus; quelle?: string }
export interface Umfeld { kmh?: number; einbahn?: boolean; radweg?: boolean; fussnetz?: FussNetz }
export const umfeldVon = (s: Section, teile: Teil[], fussnetz?: FussNetz): Umfeld =>
  ({ kmh: s.speed, einbahn: s.richtung === 'eine', radweg: teile.some(t => t.art === 'Radweg'), fussnetz })

function band(t: Teil, v: { wert: number; min?: number; max?: number }, quelle: string): TeilPruefung {
  const p = { soll: v.wert, min: v.min, max: v.max, quelle }
  if (!Number.isFinite(t.breite)) return { ...p, status: 'leer' }
  if (v.min != null && t.breite < v.min - 1e-9) return { ...p, status: 'zu schmal' }
  if (v.max != null && t.breite > v.max + 1e-9) return { ...p, status: 'zu breit' }
  return { ...p, status: t.breite < v.wert - 1e-9 ? 'unter Richtwert' : 'ok' }
}

export function pruefeTeil(t: Teil, routentyp: Routentyp, breiten?: Partial<Record<IstFuehrungsform, BreitenSoll>>,
  umfeld: Umfeld = {}, breitenQuelle = RICHTWERT_QUELLE): TeilPruefung {
  if (t.art === 'Velostreifen' || t.art === 'Radweg') {
    const ist: IstFuehrungsform = t.art === 'Velostreifen' ? 'Radstreifen' : 'Radweg strassenbegleitend / Geschützter Radstreifen'
    const soll = sollBreite(ist, routentyp, breiten?.[ist])
    if (!Number.isFinite(t.breite)) return { soll, status: 'leer', quelle: breitenQuelle }
    return { soll, status: soll != null && t.breite < soll - 1e-9 ? 'zu schmal' : 'ok', quelle: breitenQuelle }
  }
  if (t.art === 'Velostrasse') {
    const soll = sollBreite('Velostrasse', routentyp, breiten?.Velostrasse) ?? 4.5
    return band(t, { wert: soll, min: soll, max: maxBreite('Velostrasse', breiten?.Velostrasse) }, breitenQuelle)
  }
  if (t.art === 'Fahrspur') {
    const fz = bildVon(t) as 'auto' | 'lastwagen' | 'bus'
    const lr = fz === 'auto' ? 0 : lichtraum(fz, umfeld.kmh ?? NaN)
    const wert = Math.max(umfeld.radweg ? 3.25 : 3.0, lr)
    return band(t, { wert, min: 3.0 }, lr > (umfeld.radweg ? 3.25 : 3.0) ? LICHTRAUM_QUELLE : RICHTWERT_QUELLE)
  }
  if (t.art === 'Trottoir') {
    if (!umfeld.fussnetz) return { status: Number.isFinite(t.breite) ? 'keine Vorgabe' : 'leer' }
    const min = FUSSNETZ[umfeld.fussnetz].min
    return band(t, { wert: min, min }, FUSSNETZ_QUELLE)
  }
  if (t.art === 'Tram')
    return band(t, { wert: umfeld.einbahn ? 3.25 : 3.0, min: TRAM_LICHTRAUM_M },
      umfeld.einbahn ? 'eigene Herleitung (Einbahn mit Gleis)' : RICHTWERT_QUELLE)
  const r = RICHTWERT[t.art]
  if (!r) return { status: Number.isFinite(t.breite) ? 'keine Vorgabe' : 'leer' }
  return band(t, r, t.art === 'Pfosten' || t.art === 'Haltestelle' ? FESTLEGUNG : RICHTWERT_QUELLE)
}

// Prüfung als Satz für Liste und Bericht (z. B. «✓ Richtwert 3,00 m», «Zu schmal · Vorgabe 2,50 m»).
export function pruefungText(t: Teil, p: TeilPruefung): string {
  if (t.art === 'Gruen') return 'ausserhalb der Fahrbahn, keine Vorgabe'
  if (t.art === 'Haltestelle' && p.soll != null) {
    const v = `Vorgabe mindestens ${numDE(p.soll, 2)} m für Wartehäuschen und Warteraum (${p.quelle})`
    return p.status === 'ok' ? `✓ ${v}` : p.status === 'leer' ? `Breite fehlt · ${v}` : `Zu schmal · ${v}`
  }
  if (t.art === 'Trottoir') {
    if (p.soll == null) return 'Vorgabe nach Fussverkehrsnetz: oben das Netz wählen'
    const v = `Vorgabe mindestens ${numDE(p.soll, 2)} m (${FUSSNETZ_QUELLE})`
    return p.status === 'ok' ? `✓ ${v}` : p.status === 'leer' ? `Breite fehlt · ${v}` : `Zu schmal · ${v}`
  }
  if (p.soll == null) return p.status === 'leer' ? 'Breite fehlt' : 'keine Vorgabe'
  const velo = t.art === 'Velostreifen' || t.art === 'Radweg' || t.art === 'Velostrasse'
  const quelle = p.quelle && p.quelle !== RICHTWERT_QUELLE ? ` (${p.quelle})` : ''
  const vorgabe = (p.max != null ? `Vorgabe ${numDE(p.min ?? p.soll, 2)}–${numDE(p.max, 2)} m`
    : `${velo ? 'Vorgabe' : 'Richtwert'} ${numDE(p.soll, 2)} m${p.min != null && p.min < p.soll - 1e-9 ? `, mindestens ${numDE(p.min, 2)} m` : ''}`) + quelle
  if (p.status === 'ok') return `✓ ${vorgabe}`
  if (p.status === 'leer') return `Breite fehlt · ${vorgabe}`
  return `${p.status === 'zu schmal' ? 'Zu schmal' : p.status === 'zu breit' ? 'Zu breit' : 'Unter dem Richtwert'} · ${vorgabe}`
}

// Vorbelegte Breite eines neuen oder umgestellten Teils: Vorgabe, sonst STANDARD_BREITE.
export function standardBreite(t: Teil, routentyp: Routentyp, breiten?: Partial<Record<IstFuehrungsform, BreitenSoll>>, umfeld: Umfeld = {}): number {
  return pruefeTeil({ ...t, breite: NaN }, routentyp, breiten, umfeld).soll ?? STANDARD_BREITE[t.art] ?? NaN
}

// Bedingungen der Kernfahrbahn (siehe Kopf). Leer, wenn keine Kernfahrbahn in den Teilen steht
// oder alles passt; sonst je Befund ein Satz. `streng` = nicht zulässig (sonst nur Hinweis).
export interface KernBefund { text: string; streng: boolean }
export function pruefeKernfahrbahn(s: Section, teile: Teil[]): KernBefund[] {
  const n = teile.filter(t => t.art === 'Kernfahrbahn').length
  if (!n) return []
  const b: KernBefund[] = []
  if (s.richtung === 'eine') b.push({ text: 'Auf der Einbahn gibt es keine Kernfahrbahn: Sie teilt die Mitte zwischen zwei Richtungen.', streng: true })
  const fa = formJeSeite(teile, 'A'), fb = formJeSeite(teile, 'B')
  if (fa?.ist !== 'Radstreifen' || (s.richtung === 'beide' && fb?.ist !== 'Radstreifen'))
    b.push({ text: 'Eine Kernfahrbahn braucht auf beiden Seiten einen Velostreifen.', streng: true })
  if (teile.some(t => t.art === 'Tram'))
    b.push({ text: 'Mit Tramgleis prüfen: Im Kern bleibt zwischen Schiene und Velostreifen wenig Platz.', streng: false })
  if (n > 1 || teile.some(t => t.art === 'Fahrspur' || t.art === 'Gemeinsam'))
    b.push({ text: 'Die Kernfahrbahn ersetzt die Fahrspuren beider Richtungen; es braucht nur eine und keine Fahrspur daneben.', streng: true })
  if (!Number.isFinite(s.dtv)) b.push({ text: 'DTV fehlt: Die Grenze (unter 10 000, optimal unter 5 000) lässt sich nicht prüfen.', streng: false })
  else if (s.dtv >= KERN_DTV_MAX) b.push({ text: 'Nicht zulässig ab DTV 10 000.', streng: true })
  else if (s.dtv >= KERN_DTV_OPT) b.push({ text: 'DTV über dem Optimalbereich (unter 5 000), aber unter 10 000 zulässig.', streng: false })
  if (!Number.isFinite(s.speed)) b.push({ text: 'Tempo fehlt: Die Grenze (bis 50 km/h) lässt sich nicht prüfen.', streng: false })
  else if (s.speed > KERN_KMH_MAX) b.push({ text: 'Nicht zulässig über Tempo 50.', streng: true })
  return b
}

// Führungsform einer Seite aus der Aufteilung: vom Rand nach innen gelesen. Trottoir und
// Grünstreifen übergehen; Längsparkierung (mit oder ohne Sicherheitsstreifen) merken;
// Veloabstellplatz und Parklet übergehen, sie zählen nicht als Parkierung (kein Dooring,
// Nutzerentscheid 16.10.2026); dann das erste Teil der Fahrbahn: Velostreifen → Radstreifen, mit
// einer Trennung mit Pfosten direkt daneben → geschützter Radstreifen (Nutzerentscheid 16.10.2026);
// Radweg → Radweg strassenbegleitend; Velostrasse → Velostrasse; Fahrspur/Tram → Mischverkehr.
export interface SeitenForm { ist: IstFuehrungsform; breite: number; parkenRechts: ParkenRechts; sicherheitsstreifen: boolean }
export function formJeSeite(teile: Teil[], seite: 'A' | 'B'): SeitenForm | null {
  const vomRand = seite === 'A' ? [...teile].reverse() : teile
  let parken = false, sicher = false
  for (let i = 0; i < vomRand.length; i++) {
    const t = vomRand[i]
    if (t.art === 'Trottoir' || t.art === 'Haltestelle' || t.art === 'Gruen' || t.art === 'Veloabstellplatz' || t.art === 'Parklet') continue
    if (t.art === 'Parkierung' && !parken) { parken = true; continue }
    if (t.art === 'Sicherheitsstreifen' && parken) { sicher = true; continue }
    const parkenRechts: ParkenRechts = parken ? 'ja' : 'nein'
    if (t.art === 'Velostreifen' && vomRand[i + 1]?.art === 'Pfosten')
      return { ist: 'Radweg strassenbegleitend / Geschützter Radstreifen', breite: t.breite, parkenRechts: 'nein', sicherheitsstreifen: false }
    if (t.art === 'Velostreifen') return { ist: 'Radstreifen', breite: t.breite, parkenRechts, sicherheitsstreifen: sicher }
    if (t.art === 'Velostrasse') return { ist: 'Velostrasse', breite: t.breite, parkenRechts, sicherheitsstreifen: sicher }
    if (t.art === 'Radweg') return { ist: 'Radweg strassenbegleitend / Geschützter Radstreifen', breite: t.breite, parkenRechts: 'nein', sicherheitsstreifen: false }
    if (t.art === 'Fahrspur' || t.art === 'Gemeinsam' || t.art === 'Kernfahrbahn' || t.art === 'Tram')
      return { ist: 'Mischverkehr', breite: NaN, parkenRechts, sicherheitsstreifen: sicher }
    // Sicherheits-/Trennstreifen ohne passendes Nachbarteil: weiterlesen
  }
  return null
}

// Der Abschnitt, wie er mit dieser Aufteilung wäre: Führungsform, Breite, Parkierung und
// Sicherheitsstreifen je Seite aus den Teilen, Tram aus den Teilen; alles Übrige wie heute.
export function abschnittMitAufteilung(s: Section, a: Aufteilung): Section {
  const fa = formJeSeite(a.teile, 'A'), fb = formJeSeite(a.teile, 'B')
  const setze = (f: Seite, x: SeitenForm | null): Seite => (x ? { ...f, ist: x.ist, breite: x.breite, parkenRechts: x.parkenRechts, parkenSicherheitsstreifen: x.sicherheitsstreifen } : f)
  const neuA = setze(seiteA(s), fa), neuB = setze(seiteB(s), fb)
  const tram = a.teile.some(t => t.art === 'Tram')
  const neu: Section = { ...s, ...neuA, tram, quelle: { ...s.quelle } }
  if (s.richtung === 'beide' && !seitenGleich(neuA, neuB)) neu.gegen = { ...gegenVon(s), ...neuB }
  else delete neu.gegen
  return neu
}

export function bewerteAufteilung(s: Section, a: Aufteilung, city: Stadt, breiten?: Partial<Record<IstFuehrungsform, BreitenSoll>>): AbschnittErgebnis {
  return bewerteAbschnitt(abschnittMitAufteilung(s, a), city, breiten)
}

// Startzustand aus dem heutigen Abschnitt: je Seite Parkierung (1,90, aus der Vorbelegung),
// Sicherheitsstreifen (0,80, wenn angegeben), Velostreifen bzw. Radweg mit der heutigen Breite;
// dazwischen die Fahrspuren (eine auf der Einbahn, sonst zwei; mit Tram als Fahrspur mit Gleis),
// die sich den Rest des verfügbaren Masses teilen. Ohne Fahrbahnbreite: Richtwert 3,00 je Spur.
// Reicht der Rest bei Gegenverkehr nicht für zwei Spuren zum Richtwert (unter 6,00 m), ist es
// eine gemeinsame Fahrbahn ohne Mittellinie (Nutzerbefund 16.10.2026, Manuelstrasse: zwei
// Spuren zu 2,05 m gibt es nicht).
// Ganz aussen die Trottoirs, sobald sie aus der AV gemessen sind (auf 5 cm gerundet).
const trottoir = (m?: number): Teil[] => (m != null && Number.isFinite(m) ? [{ art: 'Trottoir', breite: auf5cm(m) }] : [])

// Gemessene Trottoirs in eine schon geänderte Aufteilung, die noch keines hat: ganz aussen,
// links Seite B, rechts Seite A. Hat sie schon ein Trottoir, bleibt sie unverändert.
export function mitTrottoirs(a: Aufteilung, tr: { a: number; b: number }): Aufteilung {
  const mitRaum = a.seitenraum != null && Number.isFinite(a.seitenraum) ? a : { ...a, seitenraum: seitenraumVon(tr) }
  if (a.teile.some(t => t.art === 'Trottoir')) return mitRaum
  return { ...mitRaum, teile: [...trottoir(tr.b), ...a.teile, ...trottoir(tr.a)] }
}
// Aufteilung mit dem Seitenraum des Abschnitts, wo sie selbst keinen hat (etwa eine Planung, die vor
// dem Feld angelegt wurde): Die Gesamtbreite ist bekannt, sobald die Trottoirs gemessen sind.
export function mitSeitenraum(a: Aufteilung, s: Section): Aufteilung {
  return a.seitenraum != null && Number.isFinite(a.seitenraum) ? a : { ...a, seitenraum: seitenraumVon(s.trottoir) }
}
// Breite ausserhalb der Fahrbahn heute aus den gemessenen Trottoirs (keines gefunden = 0 m)
export const seitenraumVon = (tr?: { a: number; b: number }): number =>
  (tr ? (Number.isFinite(tr.a) ? auf5cm(tr.a) : 0) + (Number.isFinite(tr.b) ? auf5cm(tr.b) : 0) : NaN)

export function startAufteilung(s: Section): Aufteilung {
  const rand = (f: Seite): Teil[] => {
    const t: Teil[] = []
    const radweg = f.ist === 'Radweg strassenbegleitend / Geschützter Radstreifen'
    if (!radweg && f.parkenRechts === 'ja') {
      t.push({ art: 'Parkierung', breite: RICHTWERT.Parkierung!.wert })
      if (f.parkenSicherheitsstreifen) t.push({ art: 'Sicherheitsstreifen', breite: RICHTWERT.Sicherheitsstreifen!.wert })
    }
    // Breite heute unbekannt (online oft: OSM ohne Breite, nicht gemessen): Vorgabe einsetzen und als
    // angenommen kennzeichnen. Vorher zählte sie als 0 m, und die Fahrspuren bekamen den ganzen Rest
    // (Laubeggstrasse, Nutzerbefund 16.10.2026: 2 × 4,90 m statt Velostreifen + 2 Spuren).
    const velo = (art: 'Velostreifen' | 'Radweg', ist: IstFuehrungsform): Teil => (Number.isFinite(f.breite) ? { art, breite: f.breite }
      : { art, breite: sollBreite(ist, s.routentyp || 'Veloroute') ?? NaN, angenommen: true })
    if (f.ist === 'Radstreifen' || f.ist === 'Einbahn Velogegenverkehr mit Markierung') t.push(velo('Velostreifen', 'Radstreifen'))
    if (radweg) { t.push(velo('Radweg', f.ist as IstFuehrungsform)); t.push({ art: 'Trennstreifen', breite: RICHTWERT.Trennstreifen!.wert }) }
    return t
  }
  // Trottoirs aus der AV (s.trottoir), sobald gemessen: ausserhalb der Fahrbahn, ganz aussen.
  const links = [...trottoir(s.trottoir?.b), ...rand(seiteB(s))], rechts = [...rand(seiteA(s)).reverse(), ...trottoir(s.trottoir?.a)]
  const nSpuren = s.richtung === 'eine' ? 1 : 2
  // Fussverkehrsnetz aus dem Geoportal, sobald geladen (Trottoir-Vorgabe)
  const netz: Partial<Aufteilung> = s.fussnetzGeoportal ? { fussnetz: s.fussnetzGeoportal, fussnetzQuelle: 'geoportal' } : {}
  const art: TeilArt = s.tram ? 'Tram' : 'Fahrspur'
  const belegt = [...links, ...rechts].filter(istFahrbahnTeil).reduce((m, t) => m + (Number.isFinite(t.breite) ? t.breite : 0), 0)
  const rest = Number.isFinite(s.fahrbahnbreite) ? Math.max(0, s.fahrbahnbreite - belegt) : NaN
  if (nSpuren === 2 && art === 'Fahrspur' && rest < 2 * RICHTWERT.Fahrspur!.wert - 1e-9)
    return { fahrbahn: s.fahrbahnbreite, teile: [...links, { art: 'Gemeinsam', breite: auf5cm(rest) }, ...rechts], seitenraum: seitenraumVon(s.trottoir), ...netz }
  // Ohne Fahrbahnbreite der Richtwert (neben einem Radweg 3,25; Tram auf der Einbahn 3,25)
  const umfeld: Umfeld = { kmh: s.speed, einbahn: s.richtung === 'eine', radweg: [...links, ...rechts].some(t => t.art === 'Radweg') }
  const jeSpur = Number.isFinite(rest) ? auf5cm(rest / nSpuren) : pruefeTeil({ art, breite: NaN }, 'Veloroute', undefined, umfeld).soll!
  const spuren: Teil[] = Array.from({ length: nSpuren }, () => ({ art, breite: jeSpur }))
  return { fahrbahn: s.fahrbahnbreite, teile: [...links, ...spuren, ...rechts], seitenraum: seitenraumVon(s.trottoir), ...netz }
}
