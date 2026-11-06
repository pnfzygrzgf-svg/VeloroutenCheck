// ── Eingaben im Browser merken (06.11.2026) ──
//
// Der offene Fall liegt im lokalen Speicher (dieselbe Form wie die Fall-Datei, fallDatei.ts) und kommt beim Öffnen des Rechners
// zurück, wenn der Tab geschlossen oder neu geladen wurde. «Karte leeren» löscht ihn. Hinaus geht dabei nichts.
// Passt der Fall nicht in den Speicher, wird ein älterer Stand gelöscht: Er würde sonst später als aktuell zurückkommen.

import type { Section } from './strecke'

export const FALL_SCHLUESSEL = 'vrc.fall'
type Speicher = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const lokal = (): Speicher | null => { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }

/** true: gemerkt; false: nicht möglich (voller oder gesperrter Speicher) */
export function fallMerken(text: string, speicher: Speicher | null = lokal()): boolean {
  try { if (!speicher) return false; speicher.setItem(FALL_SCHLUESSEL, text); return true }
  catch { fallVergessen(speicher); return false }
}
export function fallGemerkt(speicher: Speicher | null = lokal()): string | null {
  try { return speicher?.getItem(FALL_SCHLUESSEL) ?? null } catch { return null }
}
export function fallVergessen(speicher: Speicher | null = lokal()): void {
  try { speicher?.removeItem(FALL_SCHLUESSEL) } catch { /* ohne Speicher gibt es nichts zu löschen */ }
}

/** Enthält der Fall etwas, das verloren gehen könnte? Ein unberührter leerer Abschnitt zählt nicht. */
export const hatEingaben = (sections: readonly Section[]): boolean => sections.some(s => !!s.candIds?.length || !!s.ist || !!s.aufteilung
  || !!s.routentyp || !!s.label || Number.isFinite(s.dtv) || Number.isFinite(s.speed) || Number.isFinite(s.breite) || Number.isFinite(s.fahrbahnbreite))
