// ── Kartenebenen der Vorbelegung (seit 01.11.2026, Nutzerwunsch «damit dies optisch verifiziert werden kann») ───────────────
//
// Was der Rechner aus abrufbaren Quellen vorbelegt, ist auf der Karte als eigene Ebene einblendbar, je Quelle einzeln (Menü
// «Ebenen» neben der Hintergrundwahl; der Browser merkt sich die Wahl). Gezeigt werden die Objekte, die beim Laden gelesen
// wurden (keine neue Abfrage): Linien, Punkte oder Flächen, nach Wert gefärbt, ab NAH_ZOOM mit dem Wert beschriftet. Die
// Ebenen liegen unter den Segmentlinien und sind nicht anklickbar (Klicks gehören den Segmenten); die Segmentlinie nennt im
// Tooltip die übernommenen Werte. Punkte (Zählstellen, Haltestellen) haben einen eigenen Tooltip.
// Plan und Liste aller Ebenen: _lokal/kartenebenen-quellen-plan.md (V1–V17). Gleiche Farbstufen wie fgsCheck/SichtweitenCheck.

import type { LL } from './geo'
import type { Stadt } from './fuehrungsform'

export type EbeneId = 'routennetz' | 'tempo' | 'dtv' | 'velostrasse' | 'strassentyp' | 'hierarchie' | 'haltestellen' | 'oev' | 'luftbild' | 'obs'
  | 'parkfelder' | 'fussnetz' | 'av' | 'wartehallen' | 'markierung' | 'steigung'
/** Ebenen mit eigener Abfrage (App.tsx): nach dem Übernehmen automatisch, je Abschnitt um seine Segmente (Wartehallen gemeinsam) */
export interface NachladeStand { moeglich: boolean; laufend: Partial<Record<EbeneId, number>> }   // moeglich: es gibt übernommene Abschnitte
export const NACHLADEN: readonly EbeneId[] = ['parkfelder', 'fussnetz', 'wartehallen', 'steigung', 'av']

/** Ein gelesenes Objekt: Linie(n), Punkt oder Fläche, mit Klasse (Farbe), Beschriftung und Tooltip-Text */
export interface EbenenObjekt {
  id: string
  linien?: LL[][]
  punkt?: LL
  ringe?: LL[][]
  klasse: string
  wert?: string            // kurze Beschriftung (z. B. «30», «8 400»)
  text: string             // Tooltip bzw. Beschreibung (Punkte)
  gestrichelt?: boolean    // Ersatzquelle (z. B. OSM statt amtlich) bzw. Zuordnungslinie
  deckkraft?: number       // Füllung einer Fläche (Standard 0,3)
  symbol?: string          // Zeichen eines Punkts, wenn es nicht aus der Legende kommt (z. B. Zählstelle «Z»)
}
export type EbenenDaten = Partial<Record<EbeneId, EbenenObjekt[]>>

export interface EbeneDef {
  id: EbeneId
  titel: string
  kurz: string             // Beschriftung auf schmalen Bildschirmen
  quelle: Partial<Record<Stadt, string>> & { alle?: string }   // Herkunft je Stadt (Tooltip im Menü)
  // symbol: Zeichen im Quadrat der Punkte (Form statt Farbe allein, Nutzerbefund 01.11.2026); Punkte der Quellen sind Quadrate,
  // die Abschnitts-Marker Kreise
  legende: [klasse: string, farbe: string, text: string, symbol?: string][]
  legendeNur?: Partial<Record<string, Stadt[]>>   // Legendeneintrag nur in diesen Städten (z. B. Bus-Linien nur Bern)
  staedte?: Stadt[]        // nur dort; fehlt = alle
  standardAn?: boolean
  hinweis?: string         // wann die Ebene Daten hat (z. B. erst nach dem Öffnen der Planung)
}

// Gleiche Stufen in allen drei Rechnern (Plan, Grundsatz 5)
export const TEMPO_FARBEN: [string, string, string][] = [
  ['t20', '#16a34a', '20 km/h und weniger'], ['t30', '#65a30d', '30 km/h'], ['t40', '#ca8a04', '40 km/h'],
  ['t50', '#ea580c', '50 km/h'], ['t60', '#dc2626', '60 km/h und mehr'],
]
export const tempoKlasse = (v: number): string => (v <= 20 ? 't20' : v <= 30 ? 't30' : v <= 40 ? 't40' : v <= 50 ? 't50' : 't60')
export const DTV_FARBEN: [string, string, string][] = [
  ['d2', '#16a34a', 'bis 2 000'], ['d5', '#ca8a04', '2 000–5 000'], ['d10', '#ea580c', '5 000–10 000'],
  ['d20', '#dc2626', '10 000–20 000'], ['d99', '#7f1d1d', 'über 20 000'], ['zuordnung', '#334155', 'Zählstelle → Segment'],
]
export const dtvKlasse = (v: number): string => (v <= 2000 ? 'd2' : v <= 5000 ? 'd5' : v <= 10000 ? 'd10' : v <= 20000 ? 'd20' : 'd99')
const OBS_FARBEN: [string, string, string][] = [
  ['o1', '#dc2626', 'Median unter 1,50 m'], ['o2', '#ea580c', '1,50–2,00 m'], ['o3', '#16a34a', '2,00 m und mehr'],
  ['o0', '#64748b', 'befahren, keine Überholung'],
]
export const obsKlasse = (median: number): string => (!Number.isFinite(median) ? 'o0' : median < 1.5 ? 'o1' : median < 2 ? 'o2' : 'o3')

export const EBENEN: readonly EbeneDef[] = [
  { id: 'routennetz', titel: 'Routennetz (gelesen für den Routentyp)', kurz: 'Routen',
    legende: [['Velohauptroute', '#1d4ed8', 'Velohauptroute'], ['Veloroute', '#16a34a', 'Veloroute'], ['ohne', '#94a3b8', 'gelesen, ohne Routentyp']],
    quelle: { bern: 'Geoportal Stadt Bern, Veloroutennetz Masterplan (Feld Veloroutentyp)', zurich: 'Stadt Zürich, Velonetzplanung (Vorzugsroute → Velohauptroute, Hauptnetz → Veloroute)',
      basel: 'Kanton Basel-Stadt, Teilrichtplan Velo 2019 (geltend; Pendler- und Basisrouten → Veloroute)', luzern: 'Stadt Luzern, Velonetz (Velohauptroute → Velohauptroute, Hauptroute → Veloroute)' } },
  { id: 'tempo', titel: 'Tempo', kurz: 'Tempo', legende: TEMPO_FARBEN,
    quelle: { bern: 'Geoportal Stadt Bern, Signalisierte Höchstgeschwindigkeit; gestrichelt OSM maxspeed, wo amtlich nichts liegt',
      basel: 'data.bs.ch 100250 «Strassen und Wege»; gestrichelt OSM maxspeed', alle: 'OpenStreetMap maxspeed (gestrichelt)' } },
  { id: 'dtv', titel: 'Verkehrsmenge (DTV)', kurz: 'DTV', legende: DTV_FARBEN,
    quelle: { bern: 'Geoportal Stadt Bern, Flächendeckende Verkehrsdaten (DTV ≈ 16·Nt + 8·Nn)',
      zurich: 'Kanton Zürich, Verkehrsmessstellen; Linie zum Segment, das den Wert übernimmt',
      luzern: 'Stadt Luzern, Verkehrszähldaten; Linie zum Segment, das den Wert übernimmt',
      basel: 'Zählstellen Basel-Stadt (Snapshot dtv_basel.json); Linie zum Segment, das den Wert übernimmt' } },
  { id: 'velostrasse', titel: 'Velostrassen', kurz: 'Velostr.', staedte: ['bern', 'basel'],
    legende: [['velostrasse', '#2563eb', 'Velostrasse']],
    quelle: { bern: 'Geoportal Stadt Bern, Velostrassen', basel: 'data.bs.ch 100426 «Velostadtplan: Eignung», Klasse Velostrasse' } },
  { id: 'strassentyp', titel: 'Strassentyp', kurz: 'Typ', staedte: ['basel'],
    legende: [['verkehrsorientiert', '#b91c1c', 'verkehrsorientiert'], ['siedlungsorientiert', '#0f766e', 'siedlungsorientiert']],
    quelle: { basel: 'data.bs.ch 100250 «Strassen und Wege», Feld strassenkategorie' } },
  // Farben der amtlichen Legende (wie der lokale Rechner, soll_ist_analyse.py HIERARCHIE_FARBEN)
  { id: 'hierarchie', titel: 'Strassenhierarchie', kurz: 'Hierarchie', staedte: ['bern'],
    legende: [['Basisnetz', '#ff7f7f', 'Basisnetz'], ['Quartierverbindungsstrasse', '#ffd37f', 'Quartierverbindungsstrasse'],
      ['Quartierstrasse', '#a3ff73', 'Quartierstrasse (Bedingung der Velostrasse, Q 9)'], ['Quartierstrasse ergänzend', '#cccccc', 'Quartierstrasse ergänzend (Anliefer-/Privatstrassen)'],
      ['nicht befahrbar', '#cd8966', 'nicht befahrbar (Fuss-/Aare-/Waldwege)']],
    quelle: { bern: 'Geoportal Stadt Bern, Strassenhierarchie' } },
  { id: 'haltestellen', titel: 'ÖV-Haltestellen', kurz: 'Halte', standardAn: true,
    legende: [['tram', '#b91c1c', 'Tram (auch mit Bus)', 'T'], ['takt', '#1d4ed8', 'Bus mit Takt (Fahrplan)', 'B'], ['halt', '#60a5fa', 'Bus ohne Fahrt 17–18 Uhr', 'B'],
      ['unbekannt', '#475569', 'Verkehrsmittel unbekannt', 'H']],
    quelle: { bern: 'Geoportal Stadt Bern, Haltestellen; Bus-Takt aus dem GTFS-Fahrplan (Abendspitze 17–18 Uhr, nur Busse, Tram nicht gezählt)',
      alle: 'OpenStreetMap; Bus-Takt aus dem GTFS-Fahrplan (Abendspitze 17–18 Uhr, nur Busse, Tram nicht gezählt)' } },
  { id: 'oev', titel: 'ÖV-Linien und Tramgleise', kurz: 'ÖV', legende: [['tram', '#dc2626', 'Tram'], ['bus', '#7c3aed', 'Bus, Trolleybus']], legendeNur: { bus: ['bern'] },
    quelle: { bern: 'Tram: Geoportal Stadt Bern, Verkehrsdaten Tram (in der Fahrbahn, wenn parallele Abschnitte die halbe Länge bis 15 m neben der Achse abdecken); Bus: ÖV-Linien',
      alle: 'OpenStreetMap railway=tram (Tramgleise; Tram in der Fahrbahn, wenn das Gleis bis 8 m neben der Achse liegt)' } },
  { id: 'parkfelder', titel: 'Parkfelder', kurz: 'Parken', staedte: ['bern', 'zurich', 'luzern'],
    legende: [['auto', '#2563eb', 'Parkfeld'], ['verbot', '#f97316', 'Parkverbotsfeld (zählt als Parkierung)'], ['zweirad', '#0891b2', 'Velo-/Motorradfeld']],
    quelle: { bern: 'Geoportal Stadt Bern, Parkplätze (öffentlich)', zurich: 'Stadt Zürich, öffentlich zugängliche Parkplätze',
      luzern: 'Stadt Luzern, öffentliche Parkplätze' }, hinweis: 'für die übernommenen Abschnitte' },
  { id: 'fussnetz', titel: 'Fussverkehrsnetz', kurz: 'Fussnetz', staedte: ['bern', 'basel'],
    legende: [['basis', '#be185d', 'Basisnetz (Bern) bzw. kantonales Netz (Basel)'], ['stadt', '#f472b6', 'Stadtnetz (Basel)']],
    quelle: { bern: 'Geoportal Stadt Bern, Richtplan Fussverkehr (Basisnetz Fussweg bestehend)',
      basel: 'Kanton Basel-Stadt, Teilrichtplan Fuss- und Wanderwege' }, hinweis: 'für die übernommenen Abschnitte' },
  { id: 'av', titel: 'Amtliche Vermessung', kurz: 'AV',
    legende: [['Strasse_Weg', '#6e6e6e', 'Strasse, Weg'], ['Trottoir', '#c9c98f', 'Trottoir'], ['Verkehrsinsel', '#96c878', 'Verkehrsinsel'], ['Gebaeude', '#3f3f46', 'Gebäude']],
    quelle: { luzern: 'Stadt Luzern, Strassenflächen (Ersatz der AV)', alle: 'geodienste.ch, amtliche Vermessung (Bodenbedeckung)' },
    hinweis: 'für die übernommenen Abschnitte' },
  { id: 'wartehallen', titel: 'Wartehallen und Perrons', kurz: 'Halle',
    legende: [['halle', '#1e3a8a', 'Wartehalle', 'W'], ['perron', '#64748b', 'Perron ohne Wartehalle', 'P']],
    quelle: { alle: 'OpenStreetMap (amenity=shelter, public_transport=platform mit shelter)' }, hinweis: 'für die übernommenen Abschnitte' },
  { id: 'markierung', titel: 'Erkannte Markierungen', kurz: 'Markierung',
    legende: [['linie', '#facc15', 'erkannte Linie im Luftbild'], ['bord', '#f97316', 'Bordkante (AV)']],
    quelle: { bern: 'Orthofoto Stadt Bern 2026 und SWISSIMAGE, Bordkanten aus der AV', alle: 'SWISSIMAGE, Bordkanten aus der AV' },
    hinweis: 'zeigt die Querschnitte der Abschnitte, für die die Planung geöffnet wurde' },
  { id: 'steigung', titel: 'Steigung', kurz: 'Steigung',
    legende: [['s0', '#16a34a', 'bis 2 %'], ['s2', '#ca8a04', 'über 2 % (Umweltspur ab 4,50 m)'], ['s5', '#dc2626', 'über 5 %'], ['s?', '#64748b', 'nicht bestimmbar']],
    quelle: { alle: 'swissALTI3D (swisstopo), mittlere Steigung je Abschnitt; der Pfeil zeigt bergauf' },
    hinweis: 'je übernommenen Abschnitt' },
  { id: 'luftbild', titel: 'Luftbild-Erkennung', kurz: 'Luftbild', staedte: ['bern', 'zurich', 'basel'],
    legende: [['luftbild', '#e11d48', 'Radstreifen erkannt (remote_velo, ETH Zürich)']],
    quelle: { alle: 'remote_velo (ETH Zürich) auf SWISSIMAGE und Orthofoto, Snapshot' } },
  { id: 'obs', titel: 'Überholabstände (OBS)', kurz: 'OBS', staedte: ['bern', 'zurich'], legende: OBS_FARBEN,
    quelle: { alle: 'OpenBikeSensor, Snapshot; Farbe nach dem Median je Segment' } },
]

export const ebenenFuer = (stadt: Stadt): EbeneDef[] => EBENEN.filter(e => !e.staedte || e.staedte.includes(stadt))
export const ebenenQuelle = (e: EbeneDef, stadt: Stadt): string => e.quelle[stadt] ?? e.quelle.alle ?? ''
export const ebenenFarbe = (e: EbeneDef, klasse: string): string => e.legende.find(l => l[0] === klasse)?.[1] ?? '#334155'
export const ebenenSymbol = (e: EbeneDef, o: EbenenObjekt): string => o.symbol ?? e.legende.find(l => l[0] === o.klasse)?.[3] ?? '•'
export const legendeFuer = (e: EbeneDef, stadt: Stadt) => e.legende.filter(([k]) => !e.legendeNur?.[k] || e.legendeNur[k]!.includes(stadt))

/** Neue Objekte zu den vorhandenen (je Ebene nach id eindeutig; neuere ersetzen ältere) */
export function ebenenMischen(alt: EbenenDaten, neu: EbenenDaten | undefined): EbenenDaten {
  if (!neu) return alt
  const out: EbenenDaten = { ...alt }
  for (const [k, liste] of Object.entries(neu) as [EbeneId, EbenenObjekt[]][]) {
    const m = new Map((out[k] ?? []).map(o => [o.id, o]))
    for (const o of liste) m.set(o.id, o)
    out[k] = [...m.values()]
  }
  return out
}

const tausender = (n: number) => Math.round(n).toLocaleString('de-CH').replace(/[’']/g, ' ')
export const dtvText = (n: number) => tausender(n)

/** Linien-Objekt einer Quelle mit Tempo-Wert */
export const tempoObjekt = (id: string, linien: LL[][], v: number, quelle: string, ersatz = false): EbenenObjekt =>
  ({ id, linien, klasse: tempoKlasse(v), wert: String(v), text: `Tempo ${v} km/h (${quelle})`, ...(ersatz ? { gestrichelt: true } : {}) })
export const dtvLinie = (id: string, linien: LL[][], v: number, quelle: string): EbenenObjekt =>
  ({ id, linien, klasse: dtvKlasse(v), wert: dtvText(v), text: `DTV ≈ ${dtvText(v)} Fahrzeuge je Tag (${quelle})` })

/** Zählstellen als Punkte; Zuordnungslinie von der Station zum Segment, das ihren Wert übernommen hat */
export function dtvStationen(stationen: { lat: number; lon: number; dtv: number }[], quelle: string,
  zuordnung: { station: { lat: number; lon: number }; ziel: LL; candId: number }[]): EbenenObjekt[] {
  const out: EbenenObjekt[] = stationen.filter(s => s.dtv > 0).map(s => ({ id: `st:${s.lat.toFixed(6)},${s.lon.toFixed(6)}`,
    punkt: { lat: s.lat, lon: s.lon }, klasse: dtvKlasse(s.dtv), wert: dtvText(s.dtv), symbol: 'Z', text: `Zählstelle: DTV ${dtvText(s.dtv)} (${quelle})` }))
  for (const z of zuordnung) out.push({ id: `zu:${z.candId}`, linien: [[z.station, z.ziel]], klasse: 'zuordnung', gestrichelt: true,
    text: 'DTV dieser Zählstelle übernommen' })
  return out
}

// ── Ebenen aus den Segmenten selbst (keine eigene Quelle mit Geometrie) ─────────────────────────────────────────────────────
type CandLike = { id: number; geom: LL[]; speed?: number; bern?: { speed?: number }; obs?: { median: number; count: number; usage: number } }

/** OSM maxspeed der Segmente ohne amtlichen Wert (gestrichelt: Ersatzquelle) */
export const osmTempoObjekte = (cands: CandLike[]): EbenenObjekt[] => cands
  .filter(c => c.speed != null && c.bern?.speed == null && c.geom.length >= 2)
  .map(c => tempoObjekt(`osm:${c.id}`, [c.geom], c.speed!, 'OpenStreetMap maxspeed', true))

/** OpenBikeSensor: Segmente nach dem Median des Überholabstands */
export const obsObjekte = (cands: CandLike[]): EbenenObjekt[] => cands
  .filter(c => c.obs && (c.obs.count > 0 || c.obs.usage > 0) && c.geom.length >= 2)
  .map(c => {
    const o = c.obs!, m = o.count > 0 ? o.median : NaN
    return { id: `obs:${c.id}`, linien: [c.geom], klasse: obsKlasse(m), ...(Number.isFinite(m) ? { wert: m.toFixed(2).replace('.', ',') } : {}),
      text: Number.isFinite(m) ? `OpenBikeSensor: Median ${m.toFixed(2).replace('.', ',')} m aus ${o.count} Überholungen`
        : `OpenBikeSensor: ${o.usage}-mal befahren, keine Überholung gemessen` }
  })

/** ÖV-Haltestellen mit dem Bus-Takt des Fahrplans (Abendspitze, stärkste Richtung) */
export const haltestellenObjekte = (stops: { lat: number; lon: number; name: string; perH?: number; modi?: ('tram' | 'bus')[]; linien?: string[] }[]): EbenenObjekt[] => stops.map(s => {
  const takt = s.perH ? Math.round(60 / s.perH * 2) / 2 : undefined
  const tram = !!s.modi?.includes('tram'), bus = !!s.modi?.includes('bus')
  const art = tram && bus ? 'Tram- und Bushaltestelle' : tram ? 'Tramhaltestelle' : bus ? 'Bushaltestelle' : 'ÖV-Haltestelle'
  return { id: `h:${s.lat.toFixed(6)},${s.lon.toFixed(6)}`, punkt: { lat: s.lat, lon: s.lon },
    klasse: tram ? 'tram' : takt ? 'takt' : bus ? 'halt' : 'unbekannt',
    ...(takt ? { wert: `${String(takt).replace('.', ',')}′` } : tram ? { wert: 'Tram' } : {}),
    text: `${art} ${s.name}${s.linien?.length ? ` · Linien ${s.linien.join(', ')}` : ''}${takt ? ` · Bus-Takt ${String(takt).replace('.', ',')} Min (${Math.round(s.perH! * 10) / 10} Busfahrten/h, Abendspitze; Tram nicht gezählt)` : (bus || !tram ? ' · keine Busfahrt 17–18 Uhr im Fahrplan (Tram wird nicht gezählt)' : '')}` }
})

/** Nur Objekte nahe den geladenen Segmenten zeigen (nach «Karte leeren» verschwinden sie mit) */
export function imUmkreis(objekte: EbenenObjekt[], box: { s: number; n: number; w: number; e: number } | null): EbenenObjekt[] {
  if (!box) return []
  const innen = (p: LL) => p.lat >= box.s && p.lat <= box.n && p.lon >= box.w && p.lon <= box.e
  return objekte.filter(o => (o.punkt && innen(o.punkt)) || o.linien?.some(l => l.some(innen)) || o.ringe?.some(r => r.some(innen)))
}

// ── Ebenen aus den Abschnitten (Batch 2) ─────────────────────────────────────────────────────────────────────────────
export const steigungKlasse = (pct: number | null): string => (pct == null ? 's?' : Math.abs(pct) > 5 ? 's5' : Math.abs(pct) > 2 ? 's2' : 's0')
/** Steigung je Abschnitt auf seiner Achse (Stücke in Richtung Seite A), mit Wert und Richtung bergauf */
export function steigungObjekte(abschnitte: { id: number; nr: number; linien: LL[][]; steigung?: { pct: number | null; laenge: number; hinweis?: string } }[]): EbenenObjekt[] {
  return abschnitte.filter(a => a.steigung && a.linien.length).map(a => {
    const st = a.steigung!, b = st.pct == null ? '' : Math.abs(st.pct).toFixed(1).replace('.', ',')
    const richtung = st.pct == null || Math.abs(st.pct) < 0.5 ? '' : st.pct > 0 ? ' ↑ A' : ' ↑ B'
    return { id: `st:${a.id}`, linien: a.linien, klasse: steigungKlasse(st.pct), ...(st.pct != null ? { wert: `${b} %${richtung}` } : {}),
      text: st.pct == null ? `Abschnitt ${a.nr}: ${st.hinweis ?? 'Steigung nicht bestimmbar'}`
        : `Abschnitt ${a.nr}: Steigung ${b} %${richtung ? `, bergauf Richtung Seite ${richtung.slice(-1)}` : ''} (swissALTI3D, Mittel über ${Math.round(st.laenge)} m)${st.hinweis ? ` · ${st.hinweis}` : ''}` }
  })
}
const PFEIL_KURZ: Record<string, string> = { keine: '·', geradeaus: '↑', links: '←', rechts: '→', 'links-geradeaus': '←↑', 'geradeaus-rechts': '↑→', 'links-rechts': '←→', alle: '←↑→' }
/** Fahrspuren aus OSM für den Tooltip der Segmentlinie (V11): je Richtung die Spuren mit Pfeilen, dazu Busspuren */
export function spurenText(sp: { vor: string[]; rueck: string[]; busVor?: number; busRueck?: number } | undefined): string | null {
  if (!sp || (!sp.vor.length && !sp.rueck.length)) return null
  const teil = (xs: string[], bus?: number) => `${xs.length} ${xs.length === 1 ? 'Spur' : 'Spuren'}${xs.some(x => x !== 'keine') ? ` (${xs.map(x => PFEIL_KURZ[x] ?? x).join(' ')})` : ''}${bus ? `, davon ${bus} Bus` : ''}`
  return `Spuren (OSM): in Wegrichtung ${teil(sp.vor, sp.busVor)}${sp.rueck.length ? ` · Gegenrichtung ${teil(sp.rueck, sp.busRueck)}` : ' · Einbahn'}`
}

/** Welche Ebenen das Menü zeigt (Nutzerwunsch 01.11.2026: nur solche mit Daten): mit Objekten im Ausschnitt; nachladbare nur,
 *  solange sie laden (nach dem Übernehmen automatisch) oder wenn sie etwas gefunden haben. -> zeigen / ohne Daten */
export function ebenenSichtbar(defs: EbeneDef[], daten: EbenenDaten, stand: NachladeStand): { zeigen: EbeneDef[]; ohne: EbeneDef[] } {
  const zeigen: EbeneDef[] = [], ohne: EbeneDef[] = []
  for (const e of defs) {
    const n = (daten[e.id] ?? []).length
    const nach = NACHLADEN.includes(e.id)
    const ok = n > 0 || (nach && stand.moeglich && (stand.laufend[e.id] ?? 0) > 0)
    ;(ok ? zeigen : ohne).push(e)
  }
  return { zeigen, ohne }
}
