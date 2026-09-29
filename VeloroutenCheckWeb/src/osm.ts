// ── OSM-Import (Overpass): Strassensegmente laden und in Kandidaten übersetzen ──
//
// Aus App.tsx herausgelöst (29.09.2026), damit die reine Logik — OSM-Tags → Ist-Führungsform,
// Breiten-/Tempo-Übernahme, Wahl des nächstgelegenen Segments — ohne Browser testbar ist
// (osm.test.ts). Die Bewertung selbst folgt im Rechner (fuehrungsform.ts).

import type { IstFuehrungsform } from './fuehrungsform'
import type { Cand } from './VeloMap'
import { distPointToLineM } from './geo'
import { overpassAbgebrochen } from './cityShared'

type LL = { lat: number; lon: number }

// Distanz [m] einer Geometrie (Haversine).
export function geomLength(geom?: LL[]): number {
  if (!geom || geom.length < 2) return 0
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180
  let tot = 0
  for (let i = 1; i < geom.length; i++) {
    const a = geom[i - 1], b = geom[i]
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
    tot += 2 * R * Math.asin(Math.sqrt(h))
  }
  return tot
}

// OSM-Tags → Ist-Führungsform (objektive Infrastruktur; Bewertung folgt im Rechner).
export function istFromTags(t: Record<string, string>, highway: string): IstFuehrungsform {
  const cw = [t.cycleway, t['cycleway:both'], t['cycleway:left'], t['cycleway:right']]
  const has = (v: string) => cw.includes(v)
  if (t.bicycle_road === 'yes' || t.cyclestreet === 'yes') return 'Velostrasse'
  // Zweirichtungsradweg (Q10): eigener Radweg, der AUSDRÜCKLICH in beide Richtungen freigegeben
  // ist. Bewusst nur bei explizitem Tag — ein `cycleway` ohne oneway-Angabe bleibt „Radweg
  // abgesetzt". (Formal gilt in OSM dort zwar Zweirichtung als Default, praktisch ist das Tag
  // aber oft schlicht nicht gesetzt; stillschweigend umzudeuten würde bestehende Bewertungen
  // verschieben — die Breitenvorgabe steigt von 2,5 auf 4,5 m.)
  if (highway === 'cycleway' && (t.oneway === 'no' || t['oneway:bicycle'] === 'no'))
    return 'Zweirichtungsradweg'
  if (highway === 'cycleway') return 'Radweg abgesetzt'
  // Gemeinsam genutzter Geh-/Radweg (Velo + Fuss je „designated", nicht getrennt) → kombiniert.
  if ((highway === 'footway' || highway === 'path') &&
      t.bicycle === 'designated' && (t.foot === 'designated' || t.foot === 'yes') &&
      t.segregated !== 'yes') return 'Kombinierter Fuss-/Radweg'
  if ((highway === 'footway' || highway === 'path') &&
      ['yes', 'designated', 'permissive'].includes(t.bicycle)) return 'Fussweg Velo gestattet'
  // „Einbahn mit Velogegenverkehr" (Q7) wird NICHT automatisch erkannt — im Dropdown von Hand wählbar.
  // Ein Contraflow-Velostreifen fällt hier auf die zugrundeliegende Anlage zurück (z. B. lane → Radstreifen).
  if (has('track')) return 'Radweg strassenbegleitend / Geschützter Radstreifen'
  if (has('share_busway')) return 'Umweltspur'
  if (has('lane')) return 'Radstreifen'
  return 'Mischverkehr'
}

const OSM_ROADS = ['primary', 'secondary', 'tertiary', 'residential', 'unclassified',
  'living_street', 'road', 'primary_link', 'secondary_link', 'tertiary_link']

export interface OsmWay { id: number; tags?: Record<string, string>; geometry?: LL[] }

// OSM-Breitenangabe → Meter. OSM schreibt «1.5», «1.5 m», vereinzelt «1,5» — parseFloat las
// das Komma als Ende der Zahl («1,5» → 1 m). Andere Einheiten (ft, ', ") werden nicht geraten.
export function osmBreite(roh: string | undefined): number | undefined {
  if (!roh) return undefined
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(m|meter)?\s*$/i.exec(roh)
  if (!m) return undefined
  const n = Number(m[1].replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

// Ein OSM-Way → Kandidat (Rohsegment für die Karte) — oder null, wenn nicht velo-relevant.
export function wayToCand(w: OsmWay): Cand | null {
  const t = w.tags || {}
  const hw = t.highway || ''
  const bike = ['yes', 'designated', 'permissive'].includes(t.bicycle)
  const isRoad = OSM_ROADS.includes(hw)
  const isCycle = hw === 'cycleway'
  const isFootBike = (hw === 'footway' || hw === 'path') && bike
  if (!isRoad && !isCycle && !isFootBike) return null  // z. B. reine Trottoirs ausfiltern
  if (!w.geometry || w.geometry.length < 2) return null
  // Tempo/Breite nur übernehmen, wenn OSM sie wirklich kennt — sonst leer lassen
  // (keine erfundenen Fallback-Werte; Herkunft bleibt ehrlich).
  const sp = parseInt(t.maxspeed, 10)
  // Breite der Veloanlage: zuerst ein cycleway:*:width-Tag. `width` (ohne Präfix) zählt nur,
  // wenn der Way SELBST die Veloanlage ist (Radweg/Fuss-Velo-Weg). An einer Strasse meint
  // `width` die Fahrbahn, nicht den Radstreifen — dann nicht übernehmen (z. B. Sulgeneckstrasse:
  // highway=residential, cycleway:right=lane, width=9 → die 9 m sind die Fahrbahn, kein Radstreifen).
  const cwW = t['cycleway:width'] || t['cycleway:both:width'] || t['cycleway:right:width'] || t['cycleway:left:width']
  return {
    id: w.id, ist: istFromTags(t, hw),
    speed: isFinite(sp) && sp > 0 ? sp : undefined,
    breite: osmBreite(cwW || ((isCycle || isFootBike) ? t.width : undefined)),
    len: geomLength(w.geometry),
    name: t.name || 'Segment', geom: w.geometry, selected: true,
  }
}

// Overpass-Endpunkte: Hauptinstanz + Ausweich-Mirror (Failover bei Überlastung/Ausfall).
const OVERPASS_ENDPOINTS = [
  'https://overpass.osm.ch/api/interpreter',       // Schweizer Mirror (SOSM) — schnell/zuverlässig für CH-Daten
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const REQUEST_TIMEOUT_MS = 12000   // Per-Versuch-Timeout: hängende Mirror schnell überspringen (Failover)
const MAX_BACKOFF_MS = 10000       // Obergrenze fürs Warten (auch bei grossem Retry-After)

// fetch mit hartem Timeout (AbortController) — verhindert, dass eine nicht antwortende
// Instanz den ganzen Ladevorgang blockiert.
async function fetchMitTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...init, signal: ctrl.signal }) }
  finally { clearTimeout(t) }
}

// Eine Overpass-Anfrage mit Robustheit gegen Rate-Limits (429), kurze Server-Fehler (5xx) und
// hängende Instanzen: Per-Versuch-Timeout, Retry mit exponentiellem Backoff (gedeckelt),
// `Retry-After`-Header beachten, über die Mirror-Liste rotieren. Erst wenn alle Endpunkte/Versuche
// scheitern, wird ein Fehler geworfen.
async function overpassFetch(query: string): Promise<unknown> {
  const init: RequestInit = { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query) }
  const maxRunden = 2                          // Runden über die gesamte Endpunkt-Liste
  let lastStatus = 0
  for (let runde = 0; runde < maxRunden; runde++) {
    for (const url of OVERPASS_ENDPOINTS) {
      let res: Response
      try {
        res = await fetchMitTimeout(url, init, REQUEST_TIMEOUT_MS)
      } catch { lastStatus = 0; continue }     // Timeout/Netzwerk-/CORS-Fehler → nächster Mirror
      if (res.ok) {
        // Auch HTTP 200 kann ein abgebrochenes Ergebnis sein (`remark`: Zeitüberschreitung/
        // Speichergrenze) oder gar kein JSON (Fehlerseite) → wie ein Server-Fehler behandeln.
        let data: { remark?: unknown }
        try { data = await res.json() } catch { lastStatus = 0; continue }
        if (overpassAbgebrochen(data)) { lastStatus = 504; continue }
        return data
      }
      lastStatus = res.status
      // 429 (Rate-Limit) / 504 (Timeout) / 5xx: kurz warten und weiterprobieren; 4xx sonst sofort werfen.
      if (res.status === 429 || res.status === 504 || res.status >= 500) {
        const ra = parseInt(res.headers.get('Retry-After') || '', 10)
        const wartMs = Math.min(MAX_BACKOFF_MS, Number.isFinite(ra) ? ra * 1000 : 1000 * 2 ** runde)
        await sleep(wartMs)
        continue
      }
      throw new Error('Overpass HTTP ' + res.status)
    }
  }
  throw new Error('Overpass überlastet (HTTP ' + (lastStatus || 'Netzwerkfehler') + ')')
}

// Overpass-Abfrage → Kandidaten (Rohsegmente).
async function overpassCands(query: string): Promise<Cand[]> {
  const data = await overpassFetch(query) as { elements?: (OsmWay & { type: string })[] }
  const ways = (data.elements || []).filter(e => e.type === 'way')
  return ways.map(wayToCand).filter((c): c is Cand => c !== null)
}

// Freitext → Overpass-QL-Zeichenkette für einen EXAKTEN Namensabgleich per Regex.
// Zwei Ebenen, in dieser Reihenfolge: (1) Regex-Sonderzeichen maskieren, (2) die QL-Zeichenkette
// maskieren — dort ist der Backslash selbst Maskierungszeichen und `"` beendet die Zeichenkette.
// Ohne (2) brach ein Anführungszeichen im Eingabefeld die Abfrage (Overpass antwortet mit einer
// HTML-Fehlerseite), und der Rest der Eingabe stand als QL im Abfragetext.
export function overpassRegexExakt(text: string): string {
  const regex = text.replace(/[\\.[\]{}()*+?^$|]/g, '\\$&')
  return regex.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\t]/g, ' ')
}

// Weg 1: Kandidaten nach Strassenname (in der gewählten Gemeinde).
// Case-insensitiver, exakter Namensabgleich (Overpass-Flag „,i"), damit z. B.
// „jungfraustrasse" oder „JUNGFRAUSTRASSE" ebenso gefunden werden wie „Jungfraustrasse".
export function loadStreetCandidates(street: string, area: string): Promise<Cand[]> {
  const areaQl = area.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return overpassCands(
    `[out:json][timeout:60];` +
    `area["name"="${areaQl}"]["admin_level"="8"]["boundary"="administrative"]->.a;` +
    `way["name"~"^${overpassRegexExakt(street)}$",i]["highway"](area.a);out tags geom;`)
}

// Weg 2: Kandidaten im Kartenausschnitt (Bounding-Box), auf velorelevante Strassentypen gefiltert.
export function loadBboxCandidates(s: number, w: number, n: number, e: number): Promise<Cand[]> {
  return overpassCands(
    `[out:json][timeout:60];` +
    `way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street|road|cycleway|footway|path)$"]` +
    `(${s},${w},${n},${e});out tags geom;`)
}

// Das der Klickstelle nächstgelegene Segment. Gemessen wird zur LINIE, nicht zum nächsten
// Stützpunkt (29.09.2026): Eine lange Gerade hat ihre Stützpunkte nur an den Enden — wer sie in
// der Mitte anklickte, war 2 m von der Strasse, aber 100 m von ihrem nächsten Stützpunkt
// entfernt, und ein querender Fussweg mit einem Stützpunkt in 15 m gewann.
export function naechsterKandidat(cs: Cand[], lat: number, lon: number): Cand | null {
  let best: Cand | null = null, bd = Infinity
  for (const c of cs) {
    const d = distPointToLineM({ lat, lon }, c.geom)
    if (d < bd) { bd = d; best = c }
  }
  return best
}

// Weg 3: Klick auf die Karte → nächstgelegenes velorelevantes Segment (im Umkreis von 25 m).
export async function loadNearestCandidate(lat: number, lon: number): Promise<Cand | null> {
  const cs = await overpassCands(
    `[out:json][timeout:25];` +
    `way(around:25,${lat},${lon})["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street|road|cycleway|footway|path)$"];` +
    `out tags geom;`)
  return naechsterKandidat(cs, lat, lon)
}
