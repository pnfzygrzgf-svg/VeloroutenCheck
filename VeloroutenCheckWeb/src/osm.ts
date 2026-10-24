// ── OSM-Import (Overpass): Strassensegmente laden und in Kandidaten übersetzen ──
//
// Aus App.tsx herausgelöst (29.09.2026), damit die reine Logik — OSM-Tags → Ist-Führungsform,
// Breiten-/Tempo-Übernahme, Wahl des nächstgelegenen Segments — ohne Browser testbar ist
// (osm.test.ts). Die Bewertung selbst folgt im Rechner (fuehrungsform.ts).

import type { IstFuehrungsform } from './fuehrungsform'
import type { Cand } from './VeloMap'
import type { Markierung } from './aufteilung'
import { distPointToLineM, teileLinie } from './geo'
import { overpassFetch } from './overpass'

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

// ── Seiten (seit 14.10.2026) ─────────────────────────────────────────────────
// istFromTags fasst beide Fahrbahnseiten zusammen: ein Radstreifen auf EINER Seite machte die
// ganze Strasse zum Radstreifen, die Gegenrichtung wurde überbewertet. istSeiten liest die
// Seiten getrennt, bezogen auf die Way-Richtung (Rechtsverkehr): `cycleway:right` gehört zur
// Fahrtrichtung des Ways, `cycleway:left` zur Gegenrichtung; `cycleway:both` und `cycleway`
// gelten für beide. Formen, die nicht an einer Fahrbahnseite hängen — Velostrasse, eigener
// Rad- oder Fussweg —, gelten für beide Seiten gleich. Einbahn-Gegenverkehr (Q7) wird wie in
// istFromTags nicht erkannt.
function formAusCycleway(v: string | undefined): IstFuehrungsform {
  if (v === 'track') return 'Radweg strassenbegleitend / Geschützter Radstreifen'
  if (v === 'share_busway') return 'Umweltspur'
  if (v === 'lane') return 'Radstreifen'
  return 'Mischverkehr'
}
export function istSeiten(t: Record<string, string>, highway: string): { rechts: IstFuehrungsform; links: IstFuehrungsform } {
  const ganz = istFromTags(t, highway)
  if (t.bicycle_road === 'yes' || t.cyclestreet === 'yes' || !OSM_ROADS.includes(highway)) return { rechts: ganz, links: ganz }
  const seite = (s: 'right' | 'left') => formAusCycleway(t[`cycleway:${s}`] ?? t['cycleway:both'] ?? t.cycleway)
  return { rechts: seite('right'), links: seite('left') }
}

// Einbahn für den Verkehr auf dem Way: 'vor' = nur in Way-Richtung, 'rueck' = nur dagegen.
// Ein Kreisel ist ohne eigenes oneway-Tag eine Einbahn (OSM-Konvention).
export function einbahnAusTags(t: Record<string, string>): 'vor' | 'rueck' | undefined {
  const o = t.oneway
  if (o === 'yes' || o === 'true' || o === '1') return 'vor'
  if (o === '-1' || o === 'reverse') return 'rueck'
  if (o == null && (t.junction === 'roundabout' || t.junction === 'circular')) return 'vor'
  return undefined
}

export interface OsmWay { id: number; tags?: Record<string, string>; geometry?: LL[] }

// Fahrspuren je Richtung mit ihren Pfeilen (seit 20.10.2026, Nutzerbefund Kirchenfeldstrasse): vor = in Way-Richtung,
// rueck = dagegen; je Spur von links nach rechts in Fahrtrichtung. Aus lanes, lanes:forward/backward und
// turn:lanes(:forward/:backward). Ohne Angabe je Richtung: bei Gegenverkehr die Hälfte von lanes (nur gerade Zahl).
// Busspuren zählt OSM in lanes mit; sie werden nicht abgezogen.
// bus: Busspuren je Richtung (lanes:bus:forward/backward, seit 21.10.2026): in lanes enthalten; mit Umweltspur ersetzt sie eine Spur
export interface Spuren { vor: Markierung[]; rueck: Markierung[]; busVor?: number; busRueck?: number }
const PFEIL_OSM: Record<string, 'links' | 'geradeaus' | 'rechts'> = {
  left: 'links', slight_left: 'links', sharp_left: 'links', through: 'geradeaus', right: 'rechts', slight_right: 'rechts', sharp_right: 'rechts',
}
function pfeilAusOsm(spur: string): Markierung {
  const ps = new Set(spur.split(';').map(x => PFEIL_OSM[x.trim()]).filter(Boolean))
  const l = ps.has('links'), g = ps.has('geradeaus'), r = ps.has('rechts')
  return l && g && r ? 'alle' : l && g ? 'links-geradeaus' : g && r ? 'geradeaus-rechts' : l && r ? 'links-rechts'
    : l ? 'links' : g ? 'geradeaus' : r ? 'rechts' : 'keine'
}
export function spurenAusTags(t: Record<string, string>, einbahn: 'vor' | 'rueck' | undefined): Spuren | undefined {
  const zahl = (v?: string) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : undefined }
  const pfeile = (v?: string) => (v ? v.split('|').map(pfeilAusOsm) : undefined)
  const richtung = (n: number | undefined, p: Markierung[] | undefined): Markierung[] | undefined => {
    const k = n ?? p?.length
    return k ? Array.from({ length: k }, (_, i) => (p && p.length === k ? p[i] : 'keine')) : undefined
  }
  if (einbahn) {
    const s = einbahn === 'vor' ? 'forward' : 'backward'
    const r = richtung(zahl(t.lanes) ?? zahl(t[`lanes:${s}`]), pfeile(t['turn:lanes'] ?? t[`turn:lanes:${s}`]))
    return r ? (einbahn === 'vor' ? { vor: r, rueck: [] } : { vor: [], rueck: r }) : undefined
  }
  const pv = pfeile(t['turn:lanes:forward']), pr = pfeile(t['turn:lanes:backward']), n = zahl(t.lanes)
  let nv = zahl(t['lanes:forward']) ?? pv?.length, nr = zahl(t['lanes:backward']) ?? pr?.length
  if (n != null && nv == null && nr != null && n > nr) nv = n - nr
  if (n != null && nr == null && nv != null && n > nv) nr = n - nv
  if (n != null && nv == null && nr == null && n % 2 === 0) nv = nr = n / 2
  const vor = richtung(nv, pv), rueck = richtung(nr, pr)
  if (!vor || !rueck) return undefined
  const bv = zahl(t['lanes:bus:forward']), br = zahl(t['lanes:bus:backward'])
  return { vor, rueck, ...(bv ? { busVor: bv } : {}), ...(br ? { busRueck: br } : {}) }
}

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
  // Je Seite (nur an Strassen): die eigene Breitenangabe, sonst die für beide Seiten.
  const brSeite = (s: 'right' | 'left') =>
    osmBreite(t[`cycleway:${s}:width`] || t['cycleway:both:width'] || t['cycleway:width'])
  const einbahn = einbahnAusTags(t)
  const spuren = isRoad ? spurenAusTags(t, einbahn) : undefined
  return {
    id: w.id, wayId: w.id, ist: istFromTags(t, hw), seiten: istSeiten(t, hw),
    ...(isRoad ? { breiteSeiten: { rechts: brSeite('right'), links: brSeite('left') } } : { ohneFahrbahn: true }),
    ...(einbahn ? { einbahn } : {}), ...(spuren ? { spuren } : {}),
    ...(einbahn && t['oneway:bicycle'] === 'no' ? { veloGegenverkehr: true } : {}),
    // Radweg als eigener Weg neben der Strasse (cycleway:*=separate; seit 21.10.2026): nur Hinweis, setzt keine Führungsform
    ...(isRoad && (['right', 'left'] as const).some(sd => (t[`cycleway:${sd}`] ?? t['cycleway:both'] ?? t.cycleway) === 'separate')
      ? { radwegSeparat: { rechts: (t['cycleway:right'] ?? t['cycleway:both'] ?? t.cycleway) === 'separate',
          links: (t['cycleway:left'] ?? t['cycleway:both'] ?? t.cycleway) === 'separate' } } : {}),
    // Einbahn, Bus bzw. ÖV in beide Richtungen (seit 21.10.2026, Nutzerbefund Helvetiaplatz)
    ...(einbahn && (t['oneway:bus'] === 'no' || t['oneway:psv'] === 'no' || t['oneway:tram'] === 'no') ? { oevGegen: true } : {}),
    speed: isFinite(sp) && sp > 0 ? sp : undefined,
    breite: osmBreite(cwW || ((isCycle || isFootBike) ? t.width : undefined)),
    len: geomLength(w.geometry),
    name: t.name || 'Segment', geom: w.geometry, selected: true,
  }
}

// ── Segment teilen ───────────────────────────────────────────────────────────
// Ein OSM-Way ist oft länger als ein gleichartiger Strassenabschnitt (Grosser Muristalden:
// 441 m, ein Way). «Segment teilen» (App.tsx) schneidet einen Kandidaten an der Klickstelle in
// zwei Teile. Beide behalten die OSM-Werte des Ways — die Tags gelten für den ganzen Way —,
// verlieren aber die Anreicherung (amtliche Werte, ÖV, Markierung, OpenBikeSensor): Sie ordnet
// über die Geometrie zu und kann je Teil anders ausfallen; die App fragt sie je Teil neu ab.

export const MIN_TEIL_M = 5   // kürzere Teile entstehen nicht (Klick zu nah am Ende)

// Kennungen der Teile: negativ und fortlaufend, damit sie nie mit einer OSM-Way-ID kollidieren.
let naechsteTeilId = -1

// Kandidat `id` in `cs` an der Stelle (lat, lon) teilen. Liefert die neue Liste (die beiden
// Teile stehen an der Stelle des alten Kandidaten, alle Teile des Ways neu nummeriert) und die
// zwei neuen Teile — oder null, wenn der Kandidat fehlt oder ein Teil kürzer als MIN_TEIL_M würde.
export function teileInListe(cs: Cand[], id: number, lat: number, lon: number): { cands: Cand[]; neu: [Cand, Cand] } | null {
  const c = cs.find(x => x.id === id)
  if (!c) return null
  const r = teileLinie(c.geom, { lat, lon })
  if (!r) return null
  const lenA = geomLength(r.a), lenB = geomLength(r.b)
  if (lenA < MIN_TEIL_M || lenB < MIN_TEIL_M) return null
  const start = c.teil?.startM ?? 0
  const teil = (geom: LL[], len: number, startM: number): Cand => {
    const t: Cand = { ...c, id: naechsteTeilId--, geom, len, teil: { nr: 0, anzahl: 0, startM } }
    delete t.bern; delete t.obs
    return t
  }
  const a = teil(r.a, lenA, start), b = teil(r.b, lenB, start + lenA)
  // Nummern 1…n entlang der Way-Richtung, über alle Teile des Ways (auch frühere Schnitte).
  const liste = cs.flatMap(x => (x.id === id ? [a, b] : [x]))
  const teile = liste.filter(x => x.wayId === c.wayId && x.teil)
    .sort((u, v) => u.teil!.startM - v.teil!.startM)
  const nr = new Map(teile.map((x, i) => [x.id, i + 1]))
  const cands = liste.map(x => (nr.has(x.id) ? { ...x, teil: { ...x.teil!, nr: nr.get(x.id)!, anzahl: teile.length } } : x))
  const neu = [cands.find(x => x.id === a.id)!, cands.find(x => x.id === b.id)!] as [Cand, Cand]
  return { cands, neu }
}

// Overpass: gemeinsame Anbindung in overpass.ts (seit 24.10.2026)

// Wartehallen und Perrons an Haltestellen um eine Geometrie (seit 21.10.2026, Nutzerbefund Monbijoustrasse): wo eine
// Wartehalle steht (amenity=shelter mit shelter_type=public_transport, Perron mit shelter=yes) bzw. ein Perron ohne
// Wartehalle (shelter=no). Mittelpunkte in WGS84; leer, wenn Overpass nicht antwortet.
export interface HaltestellenPunkt { lat: number; lon: number; wartehalle: boolean }
export async function ladeWartehallen(geom: { lat: number; lon: number }[]): Promise<HaltestellenPunkt[]> {
  if (!geom.length) return []
  const pad = 0.0004
  const s = Math.min(...geom.map(p => p.lat)) - pad, n = Math.max(...geom.map(p => p.lat)) + pad
  const w = Math.min(...geom.map(p => p.lon)) - pad, e = Math.max(...geom.map(p => p.lon)) + pad
  const bb = `${s},${w},${n},${e}`
  const q = `[out:json][timeout:20];(nwr[amenity=shelter][shelter_type=public_transport](${bb});nwr[public_transport=platform][shelter](${bb}););out center tags;`
  const data = await overpassFetch(q) as { elements?: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] }
  return (data.elements ?? []).flatMap(el => {
    const p = el.center ?? (el.lat != null && el.lon != null ? { lat: el.lat, lon: el.lon } : null)
    if (!p) return []
    const t = el.tags ?? {}
    const mit = t.amenity === 'shelter' || t.shelter === 'yes'
    return t.amenity === 'shelter' || t.shelter === 'yes' || t.shelter === 'no' ? [{ lat: p.lat, lon: p.lon, wartehalle: mit }] : []
  })
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
