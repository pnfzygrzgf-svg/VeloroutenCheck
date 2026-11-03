import type { Section } from './strecke'
import type { Stadt } from './fuehrungsform'
import type { P } from './lv95'
import type { AvFlaeche } from './av'
import { haltestelleninselUebernehmen } from './aufteilung'
import { fahrbahnbreite, mittelinsel, type Fahrbahnbreite, type Mittelinsel, type Haltestelleninsel } from './breitenmessung'

export interface AvBreitenErgebnis { messung: Fahrbahnbreite | null; insel: Mittelinsel | null; hsi: Haltestelleninsel | null }
/** Dieselbe Ermittlung für Messknopf und automatisches Nachladen. Die Haltestellenzuordnung liefert der bestehende OSM-/AV-Weg. */
export function avBreiteErmitteln(achsen: P[][], flaechen: AvFlaeche[], hsi: Haltestelleninsel | null = null): AvBreitenErgebnis {
  return { messung: fahrbahnbreite(achsen, flaechen), insel: mittelinsel(achsen, flaechen), hsi }
}
export function avBreiteUebernehmen(s: Section, r: AvBreitenErgebnis, stadt: Stadt, nachfuehren: (s: Section) => Section = s => s): Section {
  if (r.hsi && Number.isFinite(r.hsi.innen)) return haltestelleninselUebernehmen(s, r.hsi, stadt, true)
  if (!r.messung || !Number.isFinite(r.messung.median)) return s
  return nachfuehren({ ...s, fahrbahnbreite: Math.round(r.messung.median * 10) / 10,
    mittelinsel: r.insel, quelle: { ...s.quelle, fahrbahnbreite: 'av' } })
}
/** Erst im aktuellen Zustand entscheiden: Eine eigene oder bestätigte Änderung während des Abrufs bleibt erhalten. */
export function avNachladenUebernehmen(s: Section, r: AvBreitenErgebnis, stadt: Stadt, nachfuehren: (s: Section) => Section = s => s): Section {
  return s.quelle.fahrbahnbreite === 'av' ? avBreiteUebernehmen(s, r, stadt, nachfuehren) : s
}
