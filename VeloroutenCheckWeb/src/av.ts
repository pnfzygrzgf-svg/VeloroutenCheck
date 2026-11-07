// ── Amtliche Vermessung: Bodenbedeckung (LCSF) über den WFS von geodienste.ch ─
//
// Für die Breitenmessung (breitenmessung.ts): Die Kante der Fläche «Strasse_Weg» ist die
// Bordsteinkante. Muster aus fgsCheck (src/daten/av.ts): GeoJSON in LV95 (E, N), die Flächen
// werden nicht auf die BBOX zugeschnitten. CORS offen (geprüft in fgsCheck, 10.10.2026).
//
// Nutzung nach den Betriebsbestimmungen von geodienste.ch (Fair Use: rund 10 WFS-Abfragen pro
// Minute bei 1 MB); geladen wird beim Messen je ein Rechteck um den sichtbaren Ausschnitt, für die Kartenebene siehe kartenbaustein/avAusschnitt.ts.
// Freigeschaltet für Bern, Zürich und Basel; Luzern gibt die AV
// über geodienste.ch nur mit Freigabe ab, dort seit 17.10.2026 die Strassenflächen der Stadt
// (ladeAvLuzern). Quellenangabe je Kanton (avQuelle).

import { ladeAv, ladeAvLuzern, type AvFlaeche, type AvHolen } from './kartenbaustein/avDienst'
import { holeJson } from './netz'

export { luArt, type AvFlaeche } from './kartenbaustein/avDienst'

// Luzern: Strassenflächen der Stadt statt der AV
export const avQuelle = (kanton: string) => (kanton === 'Luzern'
  ? 'Strassenflächen Stadt Luzern, © Geoinformationszentrum Stadt Luzern'
  : kanton === 'Schweiz' ? 'Amtliche Vermessung der zuständigen Kantone, geodienste.ch' : `Amtliche Vermessung, Kanton ${kanton}, geodienste.ch`)

/** Verweis zur Quelle aus avQuelle (Bericht, Quellen) */
export const avQuelleUrl = (kanton: string) => (kanton === 'Luzern'
  ? 'https://map.stadtluzern.ch/server/rest/services/OGD/strassenflaeche/MapServer' : 'https://www.geodienste.ch/')

const holen: AvHolen = url => holeJson<unknown>(url, 30000)

// Bodenbedeckung je Kanton: Luzern aus den Strassenflächen der Stadt, sonst die AV von geodienste.ch.
export const ladeAvFuer = (kanton: string, e: number, n: number, radiusM: number): Promise<AvFlaeche[]> =>
  (kanton === 'Luzern' ? ladeAvLuzern(e, n, radiusM, holen) : ladeAv(e, n, radiusM, holen))
