// ── Steigung je Abschnitt aus dem Höhenmodell swissALTI3D (© swisstopo), seit 01.11.2026 ─────────────────────────────────
//
// Übernommen aus fgsCheck (knotensicht/daten/hoehen.ts und rechner/neigung.ts):
// GET api3.geo.admin.ch/rest/services/profile.json mit der Achse als GeoJSON-LineString in LV95 (sr=2056) und nb_points
// Stützpunkten; CORS offen. Antwort: Liste {dist, alts: {COMB, DTM2, DTM25}}; COMB = swissALTI3D, wo vorhanden. Hinaus geht nur
// die Linie. Mittlere Steigung = Ausgleichsgerade (kleinste Quadrate) über (dist, Höhe); Punkte weit neben der ersten Geraden
// (Brücke, Mauer, Böschung im Höhenmodell) fallen weg, bleibt die Streuung gross, gibt es einen Hinweis.
// Gebraucht nur als Hinweis an der Umweltspur (Masterplan Q 4, S. 20: bei Steigung über 2 % Umweltspur ab 4,50 m oder separater
// Velobereich); die Note bleibt unverändert (wie im lokalen Regelwerk).
// Vorzeichen: positiv = bergauf in Fahrtrichtung der Seite A.
// In der Stadt Bern kommt das Profil zuerst aus dem DTM 2023 der Stadt (ImageServer auf gisapp.bern.ch, Raster 25 cm, Aufbau wie fgsCheck
// daten/bernDtm.ts). Fällt der Dienst aus oder deckt er die Linie nicht, gilt swissALTI3D.

import type { P } from './lv95'
import { holeJson } from './netz'

export const HOEHEN_QUELLE = 'swissALTI3D (swisstopo)'
export const BERN_DTM_KURZ = 'DTM 2023 Stadt Bern'
const BERN_DTM_URL = 'https://gisapp.bern.ch/server/rest/services/StadtBern_DTM_Hoehe_25cm_2023/ImageServer/getSamples'
/** Ausdehnung des Dienstes in LV95 [w, s, e, n] */
const BERN_DTM_RECHTECK = [2588000, 1196000, 2605000, 1205000] as const
/** Annahme: Mit weniger Höhen als diesem Anteil der Stützpunkte deckt das DTM die Linie nicht */
const BERN_DTM_ABDECKUNG = 0.7
/** Masterplan Q 4: über dieser Steigung [%] Umweltspur ab 4,50 m oder separater Velobereich */
export const UMWELTSPUR_STEIGUNG_PCT = 2
/** Stützpunkte je Profil; Ecken der Linie höchstens so viele (gleichmässig ausgedünnt, Anfang und Ende bleiben) */
export const PROFIL_PUNKTE = 30
const PROFIL_ECKEN_MAX = 8
const PROFIL_MS = 15000
/** Ausreisser: Abweichung von der ersten Geraden mindestens so viel [m] und das Vielfache des Medians (wie fgsCheck) */
const AUSREISSER_M = 0.5, AUSREISSER_FAKTOR = 4
/** Streuung um die Gerade, ab der die Messung einen Hinweis gibt [m] */
const STREUUNG_M = 0.3
const MIN_PUNKTE = 3, MIN_LAENGE_M = 20

export interface ProfilPunkt { dist: number; h: number }
/** Steigung eines Abschnitts: pct null = unbekannt (Dienst nicht erreichbar, zu kurz), dann mit Hinweis */
export interface Steigung { pct: number | null; laenge: number; hinweis?: string; profil?: import('./hoehenprofil/modell').HoehenProfil
  modell?: string   // gesetzt, wenn nicht swissALTI3D gemessen hat; ältere Abschnitte haben keines
}

const r2 = (x: number) => Math.round(x * 100) / 100
function profilEcken(linie: P[]): P[] {
  const schritt = Math.max(1, Math.ceil((linie.length - 1) / (PROFIL_ECKEN_MAX - 1)))
  return linie.filter((_, k) => k % schritt === 0 || k === linie.length - 1).map(p => [r2(p[0]), r2(p[1])] as P)
}

export function profilUrl(linie: P[], punkte = PROFIL_PUNKTE): string {
  const geom = JSON.stringify({ type: 'LineString', coordinates: profilEcken(linie) })
  return `https://api3.geo.admin.ch/rest/services/profile.json?geom=${encodeURIComponent(geom)}&sr=2056&nb_points=${punkte}`
}

export const imBernerDtm = (linie: P[]) => linie.every(p => p[0] >= BERN_DTM_RECHTECK[0] && p[0] <= BERN_DTM_RECHTECK[2] && p[1] >= BERN_DTM_RECHTECK[1] && p[1] <= BERN_DTM_RECHTECK[3])

export function bernDtmUrl(linie: P[], punkte = PROFIL_PUNKTE): string {
  const ecken = profilEcken(linie), laenge = ecken.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - ecken[i][0], p[1] - ecken[i][1]), 0)
  const q = new URLSearchParams({ f: 'json', geometryType: 'esriGeometryPolyline', geometry: JSON.stringify({ paths: [ecken], spatialReference: { wkid: 2056 } }),
    sampleDistance: String(Math.max(0.25, r2(laenge / Math.max(1, punkte - 1)))), returnFirstValueOnly: 'true', interpolation: 'RSP_BilinearInterpolation' })
  return `${BERN_DTM_URL}?${q}`
}

/** Antwort von getSamples -> Profilpunkte; dist kumuliert entlang der Proben, Proben ohne Höhe fallen weg */
export function bernDtmLesen(roh: unknown): ProfilPunkt[] {
  const r = roh as { samples?: unknown; error?: { message?: unknown; code?: unknown } } | null
  if (r?.error) throw new Error(`Fehler des Dienstes: ${String(r.error.message ?? r.error.code ?? 'unbekannt')}`)
  if (!Array.isArray(r?.samples)) throw new Error('Antwort ist keine Liste')
  const out: ProfilPunkt[] = []
  let d = 0, vorher: P | null = null
  for (const s of r.samples as { location?: { x?: unknown; y?: unknown }; value?: unknown }[]) {
    const x = s?.location?.x, y = s?.location?.y
    if (typeof x !== 'number' || typeof y !== 'number') continue
    if (vorher) d += Math.hypot(x - vorher[0], y - vorher[1])
    vorher = [x, y]
    const h = typeof s.value === 'number' ? s.value : typeof s.value === 'string' ? Number(s.value) : NaN
    if (Number.isFinite(h)) out.push({ dist: r2(d), h })
  }
  return out
}

/** Antwort von profile.json -> Profilpunkte (Höhe COMB, sonst DTM2 bzw. DTM25; Punkte ohne Höhe fallen weg) */
export function profilLesen(roh: unknown): ProfilPunkt[] {
  if (!Array.isArray(roh)) throw new Error('Antwort ist keine Liste')
  const out: ProfilPunkt[] = []
  for (const x of roh as { dist?: number; alts?: { COMB?: number | null; DTM2?: number | null; DTM25?: number | null } }[]) {
    const h = x?.alts?.COMB ?? x?.alts?.DTM2 ?? x?.alts?.DTM25
    if (typeof x?.dist === 'number' && typeof h === 'number' && Number.isFinite(h)) out.push({ dist: x.dist, h })
  }
  return out
}

function ausgleichsgerade(pkt: ProfilPunkt[]): { a: number; b: number } | null {
  const n = pkt.length
  if (n < 2) return null
  const mx = pkt.reduce((s, p) => s + p.dist, 0) / n, my = pkt.reduce((s, p) => s + p.h, 0) / n
  let sxx = 0, sxy = 0
  for (const p of pkt) { sxx += (p.dist - mx) ** 2; sxy += (p.dist - mx) * (p.h - my) }
  return sxx < 1e-9 ? null : { a: my - sxy / sxx * mx, b: sxy / sxx }
}
const median = (x: number[]): number => {
  const s = [...x].sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const f1 = (x: number) => x.toFixed(1).replace('.', ',')

/** Mittlere Steigung [%] entlang des Profils (positiv = bergauf in Profilrichtung), auf 0,1 % gerundet */
export function steigungAusProfil(profil: ProfilPunkt[]): Steigung {
  const pkt = profil.filter(p => Number.isFinite(p.dist) && Number.isFinite(p.h))
  const laenge = pkt.length ? Math.max(...pkt.map(p => p.dist)) - Math.min(...pkt.map(p => p.dist)) : 0
  const g0 = pkt.length >= MIN_PUNKTE && laenge >= MIN_LAENGE_M ? ausgleichsgerade(pkt) : null
  if (!g0) return { pct: null, laenge, hinweis: `Höhenprofil zu kurz (${Math.round(laenge)} m, ${pkt.length} Punkte): Steigung nicht bestimmbar.` }
  const abw = pkt.map(p => Math.abs(p.h - (g0.a + g0.b * p.dist)))
  const grenze = Math.max(AUSREISSER_M, AUSREISSER_FAKTOR * median(abw))
  const gut = pkt.filter((_, k) => abw[k] <= grenze)
  const genutzt = gut.length >= MIN_PUNKTE ? gut : pkt
  const g = ausgleichsgerade(genutzt) ?? g0
  const streuung = Math.sqrt(genutzt.reduce((s, p) => s + (p.h - (g.a + g.b * p.dist)) ** 2, 0) / genutzt.length)
  const pct = Math.round(g.b * 1000) / 10 || 0
  return { pct, laenge, ...(streuung > STREUUNG_M ? { hinweis: `Höhenprofil uneben (Streuung ${f1(streuung)} m um die Gerade, z. B. Kuppe oder Brücke): Steigung von Hand prüfen.` } : {}) }
}

/** Achsstücke (je in Richtung der Seite A) zu einer Linie: nach der Lage entlang der Fahrtrichtung A ordnen und aneinanderhängen */
export function achseInRichtungA(stuecke: P[][], peilungA?: number): P[] {
  const st = stuecke.filter(l => l.length >= 2)
  if (st.length <= 1) return st[0] ?? []
  const w = (peilungA ?? 0) * Math.PI / 180, d: P = [Math.sin(w), Math.cos(w)]
  const lage = (l: P[]) => { const m = l[l.length >> 1]; return m[0] * d[0] + m[1] * d[1] }
  return [...st].sort((a, b) => lage(a) - lage(b)).flat()
}

const PROFIL_ZWECK = 'Geländehöhen entlang der Strassenachse zur Ermittlung der mittleren Steigung. Keine Prüfung einer Sichtverdeckung.'

/** Steigung entlang der Linie (in Richtung Seite A); Fehler des Dienstes ergeben pct = null mit Hinweis */
export async function ladeSteigung(linie: P[]): Promise<Steigung> {
  if (linie.length < 2) return { pct: null, laenge: 0, hinweis: 'Keine Achse auf der Karte: Steigung nicht bestimmbar.' }
  if (imBernerDtm(linie)) try {
    const url = bernDtmUrl(linie), punkte = bernDtmLesen(await holeJson<unknown>(url, PROFIL_MS))
    if (punkte.length < PROFIL_PUNKTE * BERN_DTM_ABDECKUNG) throw new Error('DTM deckt die Linie nicht')
    return { ...steigungAusProfil(punkte), modell: BERN_DTM_KURZ, profil: {
      id: url, titel: 'Strassenprofil', linie: profilEcken(linie), punkte, zweck: PROFIL_ZWECK, quelle: `Geodaten Stadt Bern; Höhenprofil ${BERN_DTM_KURZ}`, abgerufen: new Date().toISOString(),
    } }
  } catch { /* Rückfall auf swissALTI3D */ }
  try {
    const url = profilUrl(linie), punkte = profilLesen(await holeJson<unknown>(url, PROFIL_MS))
    return { ...steigungAusProfil(punkte), profil: {
      id: url, titel: 'Strassenprofil', linie: (JSON.parse(new URL(url).searchParams.get('geom')!) as { coordinates: P[] }).coordinates, punkte,
      zweck: PROFIL_ZWECK,
      quelle: '© swisstopo; Höhenprofil swissALTI3D/Kombinationsmodell', abgerufen: new Date().toISOString(),
    } }
  } catch (e) {
    return { pct: null, laenge: 0, hinweis: `Höhenmodell nicht erreichbar (${(e as Error).message}): Steigung nicht geprüft.` }
  }
}

/** Hinweis an der Umweltspur der Seite (A bzw. B) nach der Steigung des Abschnitts */
export function umweltspurSteigungText(st: Steigung | undefined, seite: 'A' | 'B' | undefined): string {
  const regel = `bei Steigung über ${UMWELTSPUR_STEIGUNG_PCT} % Umweltspur ab 4,50 m oder separater Velobereich`
  if (!st) return `Steigung noch nicht geladen (${regel}).`
  if (st.pct == null) return `${st.hinweis ?? 'Steigung unbekannt.'} (${regel})`
  const betrag = Math.abs(st.pct)
  const quelle = `${st.modell ?? HOEHEN_QUELLE}, Mittel über ${Math.round(st.laenge)} m`
  const zusatz = st.hinweis ? ` ${st.hinweis}` : ''
  if (betrag <= UMWELTSPUR_STEIGUNG_PCT) return `Steigung ${f1(betrag)} % (${quelle}): nicht über ${UMWELTSPUR_STEIGUNG_PCT} %.${zusatz}`
  // Bergauf ist Seite A bei positiver Steigung; ohne Seite (Teil ohne klare Lage) nur die Richtung nennen
  const bergauf: 'A' | 'B' = st.pct > 0 ? 'A' : 'B'
  if (!seite) return `Steigung ${f1(betrag)} % bergauf in Richtung Seite ${bergauf} (${quelle}): ${regel}.${zusatz}`
  return seite === bergauf
    ? `Steigung ${f1(betrag)} % bergauf (${quelle}): Masterplan Q 4, Umweltspur ab 4,50 m oder separater Velobereich.${zusatz}`
    : `Steigung ${f1(betrag)} %, auf dieser Seite bergab (${quelle}): die Vorgabe über ${UMWELTSPUR_STEIGUNG_PCT} % betrifft die Bergauf-Richtung.${zusatz}`
}
