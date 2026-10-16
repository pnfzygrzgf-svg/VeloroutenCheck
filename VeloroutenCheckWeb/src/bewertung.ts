// ── Bewertung eines Abschnitts je Fahrtrichtung ──────────────────────────────
//
// Aus App.tsx herausgelöst (14.10.2026), seit ein Abschnitt zwei Seiten kennt (strecke.ts,
// Seite): Jede bewertete Seite wird mit den gemeinsamen Werten des Abschnitts (DTV, Tempo,
// Routentyp, Strassentyp, Tram, ÖV-Angebot) und ihren eigenen (Führungsform, Breite,
// Parkierung, öV-Takt, Haltestelle) gerechnet. Die Abschnittsnote ist die schlechtere Seite —
// wie im lokalen Berner Rechner. Die Notenrechnung selbst (fuehrungsform.ts) ist unverändert.

import {
  brauchtBreite, brauchtDtvTempo, fuehrungsformNote, vergleichsNoten,
  type BreitenSoll, type IstFuehrungsform, type NotenErgebnis, type Stadt, type VergleichsNote,
} from './fuehrungsform'
import { bewerteteSeiten, dtvEff, type Section, type Seite } from './strecke'

export interface SeitenErgebnis {
  seite: 'A' | 'B'
  felder: Seite
  bewertung: NotenErgebnis | null      // null = Seite unvollständig
  vergleich: VergleichsNote[] | null   // Endnoten nach den Standards der anderen Städte (null = unvollständig)
  fehlt: string[]                      // fehlende Pflichtfelder dieser Seite (leer = vollständig)
}
export interface AbschnittErgebnis {
  seiten: SeitenErgebnis[]             // [A] oder [A, B] (B nur bei abweichender Gegenseite)
  note: number | null                  // schlechtere Seite; null, solange eine Seite unvollständig ist
  massgebend?: 'A' | 'B'               // Seite mit der tieferen Note (nur bei zwei verschiedenen Noten)
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
    (!brauchtBreite(f.ist) || Number.isFinite(f.breite)) &&
    // Basel: Soll-Wahl ist strassentyp-basiert → Strassentyp nötig.
    (city !== 'basel' || s.strassentyp !== '')
  )
}

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
  if (f.ist !== '' && brauchtBreite(f.ist) && !Number.isFinite(f.breite)) fehlt.push('Breite')
  if (city === 'basel' && s.strassentyp === '') fehlt.push('Strassentyp')
  return fehlt
}

// Liste lesbar verbinden: «A», «A und B», «A, B und C».
export const aufzaehlen = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}`

// Abschnitt bewerten: je bewertete Seite Note und Vergleichsnoten, dazu die Abschnittsnote.
//   breiten: stadtspezifische Breiten-Sollwerte (App.tsx, CITIES); fehlt ein Wert → Bern.
export function bewerteAbschnitt(
  s: Section, city: Stadt, breiten?: Partial<Record<IstFuehrungsform, BreitenSoll>>,
): AbschnittErgebnis {
  const seiten: SeitenErgebnis[] = bewerteteSeiten(s).map(({ seite, felder: f }) => {
    if (!seiteKomplett(s, f, city)) return { seite, felder: f, bewertung: null, vergleich: null, fehlt: fehlendeEingaben(s, f, city) }
    const ist = f.ist as IstFuehrungsform
    // Breite bewerten, sobald eingegeben (Routentyp bestimmt die Vorgabe; Default Velohauptroute).
    const breite = Number.isFinite(f.breite) ? f.breite : undefined
    const routentyp = s.routentyp || 'Velohauptroute'
    const haltestelleBreite = Number.isFinite(f.haltestelleBreite) ? f.haltestelleBreite : undefined
    const oevTakt = Number.isFinite(f.oevTakt) ? f.oevTakt : undefined   // leeres Feld → unbekannter Takt
    // Seite ohne Haltestelle: das ÖV-Angebot des Abschnitts gilt auf dieser Seite nicht.
    const oevAngebot = f.ohneHaltestelle ? 'keine' : s.oevAngebot
    const haltestellentyp = f.ohneHaltestelle ? 'keine' : f.haltestellentyp
    const bewertung = fuehrungsformNote(dtvEff(s, city), s.speed, ist, breite, routentyp,
      f.parkenRechts, oevTakt, oevAngebot, haltestellentyp, haltestelleBreite, s.tram,
      breiten?.[ist],                                  // stadtspezifische Breiten-Sollwerte
      city,                                            // Stadt → Soll-Tabelle + Haltestellen-Logik
      s.strassentyp || undefined,                      // Strassentyp (nur Basel)
      f.parkenSicherheitsstreifen)                     // Sicherheitsstreifen ggü. Parkplätzen (SN 640 060)
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
          strassentyp: s.strassentyp || undefined,
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
