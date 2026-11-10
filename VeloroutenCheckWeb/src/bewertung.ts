// ── Bewertung eines Abschnitts je Fahrtrichtung ──────────────────────────────
//
// Aus App.tsx herausgelöst (14.10.2026), seit ein Abschnitt zwei Seiten kennt (strecke.ts,
// Seite): Jede bewertete Seite wird mit den gemeinsamen Werten des Abschnitts (DTV, Tempo,
// Routentyp, Strassentyp, Tram, ÖV-Angebot) und ihren eigenen (Führungsform, Breite,
// Parkierung, öV-Takt, Haltestelle) gerechnet. Die Abschnittsnote ist die schlechtere Seite —
// wie im lokalen Berner Rechner. Die Notenrechnung selbst (fuehrungsform.ts) ist unverändert.

import {
  baselEigeneRegel, brauchtBreite, brauchtDtvTempo, fuehrungsformNote, gueltigeBreite, haltestellenbereichNote, haltestellenMitBreite, haltestellenTypen, vergleichsNoten,
  type BaselExtra, type BreitenSoll, type Haltestellentyp, type IstFuehrungsform, type NotenErgebnis, type Stadt, type VergleichsNote,
} from './fuehrungsform'
import { baselFormBefund, baselSoll } from './baselStandard'
import { bewerteteSeiten, dtvEff, type Section, type Seite } from './strecke'

export interface SeitenErgebnis {
  seite: 'A' | 'B'
  felder: Seite
  bewertung: NotenErgebnis | null      // null = Seite unvollständig
  vergleich: VergleichsNote[] | null   // Endnoten nach den Standards der anderen Städte (null = unvollständig)
  fehlt: string[]                      // fehlende Pflichtfelder dieser Seite (leer = vollständig)
  offen?: string                       // Basel: Vorgabe nach Tab. 3 nicht bestimmbar (Grund); dann keine Note (VRC-01)
}
export interface AbschnittErgebnis {
  seiten: SeitenErgebnis[]             // [A] oder [A, B] (B nur bei abweichender Gegenseite)
  note: number | null                  // schlechtere Seite; null, solange eine Seite unvollständig ist
  massgebend?: 'A' | 'B'               // Seite mit der tieferen Note (nur bei zwei verschiedenen Noten)
}

// ── Erforderliche Breiten (Prüfung VRC-03, 10.11.2026) ──
// Hat die Führungsform bzw. die Haltestellenlösung im konkreten Fall eine Breitenvorgabe, gibt es ohne gültige Breite keine Note.
// Gültig ist nur eine endliche Zahl über 0 m (gueltigeBreite); leer, NaN, Infinity, 0 und negative Werte schalten nichts frei.
// Eine bekannte zu geringe Breite wird wie bisher mit Abzug bewertet. Formen und Haltestellentypen ohne Vorgabe verlangen nichts.
export interface BreitenPflicht { feld: 'breite' | 'haltestelleBreite'; name: string; wert: number }
/** Name der Breite an der Haltestelle nach dem Typ */
export function haltestellenBreiteName(typ: Haltestellentyp): string {
  if (/Veloumfahrung/.test(typ)) return 'Breite der Veloumfahrung'
  if (/Veloüberfahrt/.test(typ)) return 'Breite der Veloüberfahrt'
  if (/rückwärtigem Radweg/.test(typ)) return 'Breite des rückwärtigen Radwegs'
  if (typ === 'Velobypass') return 'Breite des Velobypasses'
  return `Breite der Veloführung an der Haltestelle («${typ}»)`
}
/** Breiten, die diese Seite im konkreten Fall braucht (imBereich: Haltestellenbereich, die Note kommt allein aus der Haltestelle) */
export function erforderlicheBreiten(s: Section, f: Seite, city: Stadt, imBereich = imHaltestellenbereich(s, f, city)): BreitenPflicht[] {
  const aus: BreitenPflicht[] = []
  if (!imBereich && f.ist !== '' && brauchtBreite(f.ist)) aus.push({ feld: 'breite', name: 'Breite der Führungsform', wert: f.breite })
  const hsGilt = s.oevAngebot !== 'keine' && !f.ohneHaltestelle && f.haltestellentyp !== 'keine' && haltestellenMitBreite(imBereich ? 'bern' : city).includes(f.haltestellentyp)
  if (hsGilt) aus.push({ feld: 'haltestelleBreite', name: haltestellenBreiteName(f.haltestellentyp), wert: f.haltestelleBreite })
  return aus
}
const massText = (x: number) => (Number.isNaN(x) ? '' : !Number.isFinite(x) ? 'unendlich' : `${String(x).replace('.', ',')} m`)
/** Fehlende bzw. ungültige erforderliche Breiten als Hinweis («Breite der Veloumfahrung», «… (0 m ist keine gültige Angabe)») */
export function breitenMaengel(s: Section, f: Seite, city: Stadt, imBereich?: boolean): string[] {
  return erforderlicheBreiten(s, f, city, imBereich).filter(p => !gueltigeBreite(p.wert))
    .map(p => (p.wert == null || Number.isNaN(p.wert) ? p.name : `${p.name} (${massText(p.wert)} ist keine gültige Angabe)`))
}

/** Haltestellentyp, den die Stadt nicht kennt (z. B. aus einer anderen Stadt bzw. einer fehlerhaften Datei): kein regulärer
 *  Bewertungspfad (Prüfung VRC-04) */
export function haltestellentypUnbekannt(s: Section, f: Seite, city: Stadt, imBereich = imHaltestellenbereich(s, f, city)): string | null {
  if (f.haltestellentyp === 'keine' || (!imBereich && (s.oevAngebot === 'keine' || f.ohneHaltestelle))) return null
  const stadt = imBereich ? 'bern' : city
  return haltestellenTypen(stadt).includes(f.haltestellentyp) ? null : `Haltestellentyp («${f.haltestellentyp}» ist hier nicht bekannt)`
}

// Eine Note braucht DTV, Tempo, Führungsform und – bei Formen mit Breiten-Vorgabe – die Breite.
// Formen ohne Vorgabe (Mischverkehr, Einbahn ohne Markierung) sind ausgenommen; dort ist das
// Breite-Feld auch ausgeblendet (gleiche Regel via brauchtBreite, sonst Sackgasse ohne Note).
export function seiteKomplett(s: Section, f: Seite, city: Stadt): boolean {
  return (
    // Form zuerst: ohne sie lässt sich nicht sagen, welche Felder überhaupt gebraucht werden.
    f.ist !== '' &&
    // DTV/Tempo nur, wo die Form sie auswertet (nicht bei Umweltspur und Fussweg Velo gestattet).
    // DTV zählt als vorhanden, wenn er eingegeben ist oder (nur Bern) als ≤ 2000 angenommen wird.
    // Basel: die Soll-Wahl ist strassentyp-basiert — DTV ist dort nur Zusatzinfo (DWV-Deckel-
    // Hinweis) und darf die Note nicht blockieren; das TEMPO bleibt Pflicht (Velostrasse-Regel).
    (!brauchtDtvTempo(f.ist) ||
      ((city === 'basel' || Number.isFinite(dtvEff(s, city))) && Number.isFinite(s.speed))) &&
    // Erforderliche Breiten (Führungsform, Haltestelle): gültig, also endlich und über 0 m (VRC-03)
    breitenMaengel(s, f, city, false).length === 0 &&
    haltestellentypUnbekannt(s, f, city, false) === null &&
    // Basel: Soll-Wahl ist strassentyp-basiert → Strassentyp nötig; dazu muss Tab. 3 die Kombination abdecken
    // (Prüfung VRC-01): sonst keine Note, ausser für Formen mit eigener Regel.
    (city !== 'basel' || (s.strassentyp !== '' && baselOffen(s, f) === null))
  )
}

/** Basel: Grund, warum die Vorgabe nach Tab. 3 für diese Seite nicht bestimmbar ist (null: bestimmbar bzw. eigene Regel) */
export function baselOffen(s: Section, f: Seite): string | null {
  if (f.ist === '' || !brauchtDtvTempo(f.ist) || !Number.isFinite(s.speed) || s.strassentyp === '') return null
  if (baselEigeneRegel(f.ist, s.speed)) return null
  const b = baselFormBefund(baselSoll(s.strassentyp, s.routentyp || 'Velohauptroute', s.speed, s.tempoRegime), f.ist)
  return b.status === 'offen' || b.status === 'nicht_abgedeckt' ? b.text : null
}
/** Basler Zusatzangaben eines Abschnitts für die Note */
export const baselExtra = (s: Section, f: Seite): BaselExtra => ({
  ...(s.tempoRegime ? { regime: s.tempoRegime } : {}), ...(f.abweichung !== undefined ? { abweichung: f.abweichung } : {}),
  ...(s.zrw ? { zrw: s.zrw } : {}), ...(s.steigung?.pct != null ? { steigungPct: s.steigung.pct } : {}),
})

// Welche Pflichtfelder fehlen dieser Seite? Dieselbe Regel wie seiteKomplett, aber als Liste für
// den Hinweis «Eingabe nötig» (seit 16.10.2026; vorher nannte er immer Führungsform, DTV und
// Tempo, auch wenn sie gesetzt waren). Ohne Führungsform werden DTV und Tempo mitgenannt, sofern
// sie fehlen: Die meisten Formen brauchen sie.
export function fehlendeEingaben(s: Section, f: Seite, city: Stadt): string[] {
  const fehlt: string[] = []
  if (f.ist === '') fehlt.push('Führungsform')
  if (f.ist === '' || brauchtDtvTempo(f.ist)) {
    if (city !== 'basel' && !Number.isFinite(dtvEff(s, city))) fehlt.push('DTV')
    if (!Number.isFinite(s.speed)) fehlt.push('Tempo')
  }
  fehlt.push(...breitenMaengel(s, f, city, false))
  const hsU = haltestellentypUnbekannt(s, f, city, false)
  if (hsU) fehlt.push(hsU)
  if (city === 'basel' && s.strassentyp === '') fehlt.push('Strassentyp')
  return fehlt
}

// Haltestellenbereich: Schalter des Abschnitts, nur in Bern, nur auf der Seite mit Haltestelle
export const imHaltestellenbereich = (s: Section, f: Seite, city: Stadt): boolean =>
  city === 'bern' && !!s.haltestellenbereich && !f.ohneHaltestelle

// Liste lesbar verbinden: «A», «A und B», «A, B und C».
export const aufzaehlen = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}`

// Abschnitt bewerten: je bewertete Seite Note und Vergleichsnoten, dazu die Abschnittsnote.
//   breiten: stadtspezifische Breiten-Sollwerte (App.tsx, CITIES); fehlt ein Wert → Bern.
export function bewerteAbschnitt(
  s: Section, city: Stadt, breiten?: Partial<Record<IstFuehrungsform, BreitenSoll>>,
): AbschnittErgebnis {
  const seiten: SeitenErgebnis[] = bewerteteSeiten(s).map(({ seite, felder: f }) => {
    const quellFelder=(s.offeneQuellen??[]).filter(k=>!k.startsWith(seite==='A'?'b.':'a.'))
    if(quellFelder.length)return {seite,felder:f,bewertung:null,vergleich:null,fehlt:quellFelder.map(k=>({ist:'Führungsform',breite:'Breite',tram:'Tram in der Fahrbahn',oevAngebot:'ÖV-Angebot'}[k.replace(/^[ab]\./,'')]??k)+' (gewählte Quelle nicht verfügbar)')}
    // Haltestellenbereich (nur Bern, seit 20.10.2026): die Seite mit Haltestelle zählt allein nach der Haltestelle
    if (imHaltestellenbereich(s, f, city)) {
      const fehlt = [...(s.oevAngebot === 'keine' ? ['ÖV-Angebot'] : []), ...(f.haltestellentyp === 'keine' ? ['Haltestellentyp'] : []),
        ...breitenMaengel(s, f, city, true),   // VRC-03: erforderliche Breite der Haltestelle
        ...[haltestellentypUnbekannt(s, f, city, true)].filter((x): x is string => !!x)]   // VRC-04: unbekannter Typ
      if (fehlt.length) return { seite, felder: f, bewertung: null, vergleich: null, fehlt }
      const bewertung = haltestellenbereichNote(s.routentyp || 'Velohauptroute', s.oevAngebot, f.haltestellentyp,
        gueltigeBreite(f.haltestelleBreite) ? f.haltestelleBreite : undefined, s.tram, s.speed)
      return { seite, felder: f, bewertung, vergleich: null, fehlt: [] }
    }
    if (!seiteKomplett(s, f, city)) {
      const offen = city === 'basel' ? baselOffen(s, f) : null
      return { seite, felder: f, bewertung: null, vergleich: null, fehlt: fehlendeEingaben(s, f, city), ...(offen ? { offen } : {}) }
    }
    const ist = f.ist as IstFuehrungsform
    // Breite bewerten, sobald eingegeben (Routentyp bestimmt die Vorgabe; Default Velohauptroute).
    const breite = gueltigeBreite(f.breite) ? f.breite : undefined
    const routentyp = s.routentyp || 'Velohauptroute'
    const haltestelleBreite = gueltigeBreite(f.haltestelleBreite) ? f.haltestelleBreite : undefined
    const oevTakt = Number.isFinite(f.oevTakt) ? f.oevTakt : undefined   // leeres Feld → unbekannter Takt
    // Seite ohne Haltestelle: das ÖV-Angebot des Abschnitts gilt auf dieser Seite nicht.
    const oevAngebot = f.ohneHaltestelle ? 'keine' : s.oevAngebot
    const haltestellentyp = f.ohneHaltestelle ? 'keine' : f.haltestellentyp
    const bewertung = fuehrungsformNote(dtvEff(s, city), s.speed, ist, breite, routentyp,
      f.parkenRechts, oevTakt, oevAngebot, haltestellentyp, haltestelleBreite, s.tram,
      breiten?.[ist],                                  // stadtspezifische Breiten-Sollwerte
      city,                                            // Stadt → Soll-Tabelle + Haltestellen-Logik
      s.strassentyp || undefined,                      // Strassentyp (nur Basel)
      f.parkenSicherheitsstreifen,                     // Sicherheitsstreifen ggü. Parkplätzen (SN 640 060)
      city === 'basel' ? baselExtra(s, f) : {})        // Basel: Regime, Abweichung, Zweirichtungsradweg, Steigung
    // Vergleichsnoten nach den Standards der ANDEREN Städte — reine Zusatzinfo. Ohne DTV (in Basel
    // erlaubt) keine: die DTV-basierten Soll-Tabellen der anderen Städte ergäben mit NaN still
    // «Mischverkehr» (alle Schwellen-Vergleiche false).
    const vergleich = brauchtDtvTempo(ist) && !Number.isFinite(dtvEff(s, city)) ? null
      : vergleichsNoten({
          dtv: dtvEff(s, city), v: s.speed, ist, breite, routentyp, parkenRechts: f.parkenRechts,
          parkenSicherheitsstreifen: f.parkenSicherheitsstreifen, oevTakt, oevAngebot, haltestellentyp,
          haltestelleBreite, tram: s.tram,
          // Amtlicher/manueller Basler Strassentyp mitgeben — sonst schätzte der Vergleich ihn neu
          // und die Referenz wich von der angezeigten Hauptnote ab (07.08.2026).
          strassentyp: s.strassentyp || undefined, basel: baselExtra(s, f),
        }, city)
    return { seite, felder: f, bewertung, vergleich, fehlt: [] }
  })
  const fertig = seiten.every(x => x.bewertung != null)
  const note = fertig ? Math.min(...seiten.map(x => x.bewertung!.note)) : null
  const [a, b] = seiten
  const massgebend = fertig && b && a.bewertung!.note !== b.bewertung!.note
    ? (a.bewertung!.note < b.bewertung!.note ? 'A' : 'B') : undefined
  return { seiten, note, ...(massgebend ? { massgebend } : {}) }
}
