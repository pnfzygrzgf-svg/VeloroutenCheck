import { kartenKlick, segmentKlick } from './kartenKlick'
import { zeichneQuellenLinie } from './quellenLinie'
import { useHoehenkurven } from './hoehenkurven/Karte'
import { HoehenkurvenWahl } from './hoehenkurven/Wahl'
import { standText as hoehenkurvenStandText } from './hoehenkurven/modell'
import { meldeKartenbild, meldeQuelleStand, meldeQuellenFehler, ebenenStandText, datenGeneration } from './datenstand'
import { useDatenstaende } from './Datenstaende'
import { ASTRA_EBENEN, ladeAstraStand } from './astra'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { EbenenGruppe, HoehenprofilAnsicht } from './hoehenprofil/Ansicht'
import { profilObjekteWaehlen, standardProfil } from './hoehenprofil/modell'
import L from 'leaflet'
import { netzTexte, type RoutennetzWms } from './routennetz'
import { ebenenFarbe, ebenenFuer, ebenenQuelle, ebenenSichtbar, ebenenSymbol, legendeFuer, NACHLADEN, spurenText, type EbeneId, type EbenenDaten, type NachladeStand } from './ebenen'
import type { Stadt } from './fuehrungsform'
import { UEBERBLICK } from './ueberblick'
import 'leaflet/dist/leaflet.css'
import type { ObsStats } from './obs'
import type { Spuren } from './osm'
import { escapeHtml } from './netz'

// Ein OSM-Rohsegment (Kandidat) — auf der Karte anklickbar, vor dem Zusammenfassen.
export interface Cand {
  osmOev?: import('./bern').OevInfo
  velozaehlungen?: import('./velozaehlung').VeloZaehldaten[]
  datenOrt?: import('./gebiet').DatenOrt
  // Kennung des Kandidaten — eindeutig in der Liste, Schlüssel für Karte, Anreicherung und
  // Abschnitte. Bei einem ganzen Way = OSM-Way-ID; die Teile eines geteilten Ways erhalten
  // eigene, negative Kennungen (osm.ts, teileInListe), damit sie nie mit einer Way-ID kollidieren.
  id: number
  e5?: import('./e5').E5Daten
  osmTags?: Record<string,string>
  wayId: number                           // OSM-Way-ID (bei Teilen die des ursprünglichen Ways)
  // Nur bei Teilen eines von Hand geteilten Ways: Nummer entlang der Way-Richtung, Anzahl
  // Teile, Lage des Teilanfangs ab Way-Anfang [m]. Ein Schnitt bleibt beim Zusammenfassen
  // immer eine Abschnittsgrenze (strecke.ts, mergeSegs).
  teil?: { nr: number; anzahl: number; startM: number }
  ist: string                             // abgeleitete Ist-Führungsform (für die Farbe)
  // OSM je Fahrbahnseite, bezogen auf die WAY-Richtung (rechts = Fahrtrichtung des Ways,
  // links = Gegenrichtung; Rechtsverkehr). Fehlt `seiten`, gilt `ist` für beide Seiten.
  seiten?: { rechts: string; links: string }
  breiteSeiten?: { rechts?: number; links?: number }   // nur an Strassen (cycleway:right/left:width)
  einbahn?: 'vor' | 'rueck'               // OSM-Einbahn: in bzw. gegen die Way-Richtung
  ohneFahrbahn?: boolean                  // Weg ohne Fahrbahn (OSM highway=cycleway/footway/path), seit 20.10.2026
  spuren?: Spuren                         // Fahrspuren je Richtung mit Pfeilen (OSM lanes/turn:lanes), seit 20.10.2026
  veloGegenverkehr?: boolean              // Einbahn, Velo in der Gegenrichtung erlaubt (oneway:bicycle=no)
  radwegSeparat?: { rechts: boolean; links: boolean }   // OSM cycleway:*=separate je Way-Seite (Hinweis)
  parallel?: import('./parallelwege').Parallel          // parallele Wege als Veloführung je Way-Seite (parallelwege.ts), seit 21.10.2026
  oevGegen?: boolean                      // Einbahn, Bus/ÖV in der Gegenrichtung (oneway:bus|psv|tram=no), seit 21.10.2026
  speed?: number                          // nur wenn ein maxspeed-Tag vorhanden ist
  breite?: number                         // nur wenn ein width-/cycleway:width-Tag vorhanden ist
  len: number
  name: string
  geom: { lat: number; lon: number }[]
  selected: boolean
  // Amtliche Geodaten Stadt Bern (siehe bern.ts) — additiv, ergänzt die OSM-Werte oben.
  bern?: {
    dtvQuelle?: 'abgeleitet'
    routentypQuelle?: 'abgeleitet'
    speed?: number                        // V_sig, Signalisierte Höchstgeschwindigkeit
    dtv?: number                          // 16×Nt + 8×Nn, Flächendeckende Verkehrsdaten
    dtvGeprueft?: boolean                 // nur Bern: Verkehrsdaten-Layer hat für DIESES Segment geantwortet (Grundlage der ≤-2000-Annahme)
    routentyp?: 'Velohauptroute' | 'Veloroute'   // Veloroutennetz Masterplan
    strassentyp?: 'verkehrsorientiert' | 'siedlungsorientiert'  // nur Basel (Strassen-/Wege-Datensatz)
    velostrasse?: boolean                 // Treffer im Velostrassen-Layer
    hierarchie?: string                   // Strassenhierarchie der Stadt Bern (Kurzform wie im lokalen Rechner), seit 01.11.2026
    // Treffer im lokalen Markierungs-Snapshot (Velostreifen, siehe velostreifen.ts); rechts/links
    // = Seite der Striche, bezogen auf die Way-Richtung
    radstreifen?: { breite?: number; rechts?: { breite?: number }; links?: { breite?: number } }
    // Radstreifen aus dem Luftbild (luftbild.ts, Bern, Zürich, Basel): Anteil der Länge mit Fund je Seite,
    // bezogen auf die Way-Richtung. Nur Hinweis, setzt keine Form.
    luftbild?: { rechts: number; links: number }
    // Amtliche Parkfelder (parkierung.ts, Bern/Zürich/Luzern): Anteil der Länge je Seite,
    // bezogen auf die Way-Richtung. Belegt «Parkierung rechts» vor.
    parken?: { rechts: number; links: number }
    oevHalt?: boolean                     // Haltestelle im Abschnitt (Geoportal Haltestellen)
    oevHaltName?: string                  // Name der nächsten Haltestelle
    oevTram?: boolean                     // Tram-Linie verläuft entlang (OeV_Linien)
    oevBus?: boolean                      // Bus/Trolleybus verläuft entlang
    busPerH?: number                      // Bus-Fahrten/h Abendspitze (GTFS, stärkste Richtung)
    streckePerH?: number; streckeHalt?: string   // Bus-Takt auf der Strecke (nächste Haltekante einer Linie des Segments, Bern)
    oevQuelle?: 'amtlich' | 'osm'         // Herkunft der ÖV-Erkennung (Bern: amtlich/Geoportal; Zürich: OSM)
  }
  obs?: ObsStats                          // OpenBikeSensor-Überholabstände (Zusatzinfo, siehe obs.ts)
}

// ÖV-Haltestelle (Punkt) für die Karten-Marker.
// perH: Bus-Fahrten/h (GTFS, Ebene «ÖV-Haltestellen»); modi: Tram und/oder Bus an der Haltestelle; linien: Liniennummern (Bern)
export interface Stop { lat: number; lon: number; name: string; bpuic?: string; perH?: number; modi?: ('tram' | 'bus')[]; linien?: string[] }

// Farbe je Führungsform (Linien auf der Karte). Seit 17.10.2026 kein Grau mehr: Mischverkehr war grau
// wie die abgewählten Segmente und auf dem Luftbild kaum zu sehen. Abgewählt ist jetzt
// gestrichelt (ABGEWAEHLT), jede gewählte Linie hat einen weissen Rand.
export const ISTCOLOR: Record<string, string> = {
  'Mischverkehr': '#7c3aed',
  'Radstreifen': '#eab308',
  'Radweg strassenbegleitend / Geschützter Radstreifen': '#4d7c0f',
  'Radweg abgesetzt': '#16a34a',
  'Zweirichtungsradweg': '#be123c',   // fehlte bis 17.10.2026 (fiel auf das Ersatz-Petrol zurück)
  'Umweltspur': '#0891b2',
  'Velostrasse': '#2563eb',
  'Kombinierter Fuss-/Radweg': '#0d9488',
  'Fussweg Velo gestattet': '#ea580c',
  'Einbahn Velogegenverkehr ohne Markierung': '#c026d3',
  'Einbahn Velogegenverkehr mit Markierung': '#d97706',
  'Einbahn Velogegenverkehr mit baulicher Trennung': '#15803d',
}

// «Zum eigenen Standort» (seit 17.10.2026, wie fgsCheck Karte.tsx): Knopf unter den Zoom-Knöpfen. Der
// Standort wird nur auf der Karte gezeigt (Punkt + Genauigkeitskreis), nirgends gespeichert oder gesendet.
const STANDORT_MS = 10000
const STANDORT_ZOOM = 18
const STANDORT_UNGENAU_M = 100           // ungenauer: ganzen Genauigkeitskreis zeigen statt auf STANDORT_ZOOM
const STANDORT_FARBE = '#2563eb'
const STANDORT_SYMBOL = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>' +
  '<path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>'
export function standortFehlerText(code: number): string {
  if (code === 1) return 'Standort nicht freigegeben: Zugriff auf den Standort in den Einstellungen des Browsers erlauben.'
  if (code === 3) return `Standort nicht innert ${STANDORT_MS / 1000} s bestimmt; nochmals versuchen.`
  return 'Standort zurzeit nicht verfügbar (kein GPS- bzw. Netzempfang).'
}

// Nummern-Marker eines Abschnitts auf der Karte (num = Abschnitts-Nummer).
// Ab dieser Fensterbreite zweispaltig (Karte | Panel); muss mit der Media-Query in index.css
// übereinstimmen. «screen»: Drucken bleibt immer einspaltig.
export const BREIT_MQ = 'screen and (min-width: 700px)'   // Desktop-Ansicht (seit 28.10.2026, vorher 1100 px)
export const MOBIL_MQ = 'screen and (max-width: 699px)'   // Mobile-Ansicht (index.css)

// Farben der AV-Flächen und Parkfelder: farben.ts (ohne Leaflet, auch im Bericht verwendet)
export { AV_FARBEN, PARK_FARBE, PARKVERBOT_FARBE, ZWEIRAD_FARBE } from './farben'
import { AV_FARBEN, AV_DECKKRAFT, PARK_FARBE, PARKVERBOT_FARBE, ZWEIRAD_FARBE } from './farben'
export interface AvAnzeige {
  flaechen: { art: string; ringe: { lat: number; lon: number }[][] }[]
  park?: { verbot: boolean; zweirad?: boolean; ringe: { lat: number; lon: number }[][] }[]
  quelle: string            // Quellenangabe (Attribution der Karte)
}

// peilung: Fahrtrichtung der Seite A an der Marker-Stelle [Grad, 0 = Nord] → kleiner Pfeil am Kreis.
export interface SectionMarker { num: number; lat: number; lon: number; peilung?: number }

// Breitenmessung am Luftbild (App.tsx, breitenmessung.ts): was die Karte dazu zeigt — die
// Bordsteinkanten der amtlichen Vermessung, gesetzte Punkte und die Messlinie samt Wert.
type LLo = { lat: number; lon: number }
export interface MessAnzeige {
  kanten: LLo[][]           // Bordsteinkanten (orange)
  punkte: LLo[]             // gesetzte Punkte (Messung mit zwei Punkten)
  linie?: [LLo, LLo]        // Messlinie Bordsteinkante → Markierung
  label?: string            // Messwert, z. B. «1,62 m»
  // Querschnitt aufnehmen (seit 20.10.2026): die Querlinie durch alle Punkte und je Stück Nummer und Breite
  quer?: { punkte: LLo[]; marken: { p: LLo; text: string }[] }
}
const ORTHO = 'Orthofoto (swisstopo)'
const NAH_ZOOM = 19
const NETZ_FANG_PX = 4, NETZ_PAUSE_MS = 250                          // Erklärung der Netzlinien: Fangfenster, Pause vor der Abfrage                                                 // ab hier gewählte Linien dünn (Markierungen sichtbar)
const BERN26 = 'Orthofoto Stadt Bern 2026'
const LUFTBILDER = [ORTHO, BERN26]                                  // Hintergründe mit Strassennamen-Kästchen

/** Schlüssel der zuletzt gesehenen Kartenansicht im Browser (nur Bequemlichkeit, darf fehlen) */
const ANSICHT_SCHLUESSEL = 'vrc.karteAnsicht'
/** gemerkte Ansicht, nur wenn sie zur selben Stadt (Stadtmitte) gehört und in der Schweiz liegt */
function ansichtLesen(stadt: [number, number] | L.LatLngExpression): { c: [number, number]; z: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(ANSICHT_SCHLUESSEL) ?? 'null') as { stadt: unknown; c: [number, number]; z: number } | null
    if (!v || JSON.stringify(v.stadt) !== JSON.stringify(stadt)) return null
    return v.c[0] > 45.7 && v.c[0] < 47.9 && v.c[1] > 5.9 && v.c[1] < 10.6 && v.z >= 8 && v.z <= 22 ? { c: v.c, z: v.z } : null
  } catch { return null }
}

const BESCHRIFT_ZOOM = 17   // Kartenebenen: Werte als Beschriftung ab dieser Zoomstufe

export function VeloMap({ cands, onLineClick, onMapClick, onReady, markers, highlightIds, ebenen = {}, stadt = 'bern', onEbenenAn, nachladen = { moeglich: false, laufend: {} },
                          attribution = 'Geoinformation Stadt Bern', center = [46.948, 7.447], fitKey = 0,
                          teilModus = false, orthofoto = false, bern2026 = false, routennetz = null, messung = null, av = null, obsStand, formen, onMeldung, onMarkerClick }: {
  onMarkerClick?: (num: number) => void   // Abschnitts-Marker angeklickt (öffnet den Abschnitt im Panel, seit 22.10.2026)
  cands: Cand[]
  onLineClick: (id: number, lat: number, lon: number) => void   // Linie angeklickt (an-/abwählen oder teilen)
  onMapClick?: (lat: number, lon: number) => void
  onReady?: (map: L.Map) => void
  markers?: SectionMarker[]               // nummerierte Abschnitts-Marker
  highlightIds?: Set<number>              // Cand-IDs des gehoverten Abschnitts → hervorheben
  ebenen?: EbenenDaten                    // gelesene Objekte der Vorbelegung je Ebene (ebenen.ts), einzeln einblendbar
  stadt?: Stadt|'schweiz'                           // für die Liste der Ebenen und ihre Quellen
  onEbenenAn?: (ids: Set<EbeneId>) => void   // gewählte Ebenen (App lädt die nachzuladenden, ebenen.NACHLADEN)
  nachladen?: NachladeStand                // ob nachladbare Ebenen Daten bekommen können und welche gerade laden
  attribution?: string                    // Quellenangabe der amtlichen Anreicherung (stadtabhängig)
  obsStand?: string                       // Stand des OpenBikeSensor-Exports (Tooltip)
  center?: [number, number]               // Anfangs-Kartenmitte (stadtabhängig)
  fitKey?: number                         // ändert sich → Karte auf die Segmente einpassen (nur «Strasse laden»)
  teilModus?: boolean                     // «Segment teilen» aktiv → Fadenkreuz über den Linien
  orthofoto?: boolean                     // true → Hintergrund aufs Orthofoto schalten (Breitenmessung); bleibt danach
  bern2026?: boolean                      // Stadt Bern gewählt → Knopf «Bern 2026» (Orthofoto der Stadt, seit 27.10.2026)
  routennetz?: RoutennetzWms | null       // Veloroutennetz der Stadt als zuschaltbare Ebene (seit 30.10.2026; Bern)
  messung?: MessAnzeige | null            // Breitenmessung: Kanten, Punkte, Messlinie
  av?: AvAnzeige | null                   // AV-Flächen eines Abschnitts (Aufteilung planen)
  // Führungsform je Cand-ID aus dem übernommenen Abschnitt (seit 17.10.2026): Farbe nach Seite A, eine
  // abweichende Seite B gestrichelt darüber. Fehlt der Eintrag, gilt die Form aus OSM (c.ist).
  formen?: Map<number, { a: string; b?: string }>
  onMeldung?: (text: string, art: 'info' | 'error') => void   // Meldungen der Standortbestimmung
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const messRef = useRef<L.LayerGroup | null>(null)                 // eigene Ebene der Breitenmessung
  const avRef = useRef<L.LayerGroup | null>(null)                   // AV-Flächen (Planung)
  const basisRef = useRef<Record<string, L.TileLayer>>({})          // Hintergründe nach Name
  const aktiveBasis = useRef(ORTHO)                                 // gerade gezeigter Hintergrund
  const [basis, setBasis] = useState(ORTHO)                         // … für die Knöpfe auf der Karte
  const namenRef = useRef<L.TileLayer | null>(null)                 // Strassennamen (nur über dem Orthofoto)
  const [namen, setNamen] = useState(false)                       // Strassennamen aus, bis sie gewählt sind
  // Routennetz zuschalten (seit 30.10.2026): über jedem Hintergrund, unter den Segmentlinien; der Browser merkt sich die Wahl
  const [netzAn, setNetzAn] = useState(() => { try { return localStorage.getItem('vrc.routennetz') === '1' } catch { return false } })
  const netzRef = useRef<L.TileLayer | null>(null)
  // Kartenbilder zum Überblick (ueberblick.ts: Höhenlinien, Relief), je einzeln, gemerkt
  const [ueberAn, setUeberAn] = useState<Set<string>>(() => {
    try { const v = JSON.parse(localStorage.getItem('vrc.ueberblick') ?? 'null'); if (Array.isArray(v)) return new Set(v as string[]) } catch { /* ohne Speicher */ }
    return new Set<string>()
  })
  const ueberSchalten = (id: string, an: boolean) => setUeberAn(prev => {
    const n = new Set(prev); if (an) n.add(id); else n.delete(id)
    try { localStorage.setItem('vrc.ueberblick', JSON.stringify([...n])) } catch { /* nur für diese Sitzung */ }
    return n
  })
  const [astraAn, setAstraAn] = useState<Set<string>>(new Set())
  const [astraStaende, setAstraStaende] = useState<Record<string,string>>({})
  const datenlauf=datenGeneration()
  const [hkMap, setHkMap] = useState<L.Map | null>(null)
  const hk = useHoehenkurven(hkMap, datenlauf)
  useEffect(()=>{
    if(hk.stand.ergebnis)meldeQuelleStand('hoehenkurven',hk.titel,'https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swissalti3d','hoehenkurven',hoehenkurvenStandText(hk.stand.ergebnis),hk.stand.ergebnis.abgerufen,datenlauf)
    else if(hk.stand.phase==='fehler')meldeQuellenFehler('hoehenkurven',hk.titel,'https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swissalti3d','hoehenkurven',hk.stand.text,datenlauf)
  },[hk.stand,datenlauf])
  useEffect(() => {
    const aktiv=ASTRA_EBENEN.filter(a=>astraAn.has(a.id))
    if(!aktiv.length)return
    const ausstehend=new Set(aktiv.map(a=>a.id)),ctrl=new AbortController(),timer=setTimeout(()=>{if(datenlauf===datenGeneration())setAstraStaende(s=>({...s,...Object.fromEntries([...ausstehend].map(id=>[id,'unbekannt (Zeitlimit beim Metadatenabruf)']))}));ctrl.abort()},15000)
    for(const a of aktiv) void ladeAstraStand(a.layer,ctrl.signal).then(stand=>{
      if(!ctrl.signal.aborted&&datenlauf===datenGeneration()){
        setAstraStaende(s=>({...s,[a.id]:stand}))
        meldeQuelleStand(a.id,a.titel,a.url,'unfaelle',stand,new Date().toISOString(),datenlauf)
      }
    },()=>{if(!ctrl.signal.aborted&&datenlauf===datenGeneration())setAstraStaende(s=>({...s,[a.id]:'unbekannt (Metadaten nicht erreichbar)'}))}).finally(()=>{ausstehend.delete(a.id);if(!ausstehend.size)clearTimeout(timer)})
    return ()=>{clearTimeout(timer);ctrl.abort()}
  },[astraAn,datenlauf])
  useEffect(() => {
    const map=mapRef.current;if(!map)return
    if(!map.getPane('astra'))map.createPane('astra').style.zIndex='460'
    map.getPane('astra')!.style.pointerEvents='none'
    const lagen=ASTRA_EBENEN.filter(a=>astraAn.has(a.id)).map(a=>L.tileLayer(a.url,{pane:'astra',maxZoom:22,maxNativeZoom:18,attribution:a.attribution}).addTo(map))
    return ()=>{for(const l of lagen)l.remove()}
  },[astraAn])
  // Kartenebenen der Vorbelegung (seit 01.11.2026): gewählte Ebenen (der Browser merkt sich die Wahl), Menü, Zoom für die Beschriftung
  const [ebenenAn, setEbenenAn] = useState<Set<EbeneId>>(() => {
    try { const v = JSON.parse(localStorage.getItem('vrc.ebenen') ?? 'null'); if (Array.isArray(v)) return new Set(v as EbeneId[]) } catch { /* ohne Speicher */ }
    return new Set<EbeneId>(['haltestellen'])
  })
  const ebeneSchalten = (id: EbeneId, an: boolean) => setEbenenAn(prev => {
    const n = new Set(prev); if (an) n.add(id); else n.delete(id)
    try { localStorage.setItem('vrc.ebenen', JSON.stringify([...n])) } catch { /* nur für diese Sitzung */ }
    return n
  })
  const [ebenenOffen, setEbenenOffen] = useState(false)
  useDatenstaende()
  const [profilAuswahl, setProfilAuswahl] = useState<string | null>(null)
  const [alleGelaendeProfile, setAlleGelaendeProfile] = useState(false)
  const ebenenAnCb = useRef(onEbenenAn)
  ebenenAnCb.current = onEbenenAn
  useEffect(() => { ebenenAnCb.current?.(ebenenAn) }, [ebenenAn])
  // Fenster «Kartenebenen» an der Kopfzeile verschiebbar; die Lage
  // links oben in px relativ zur Karte, gemerkt; ohne Lage unten links über der Hintergrund-Leiste
  const [ebenenPos, setEbenenPos] = useState<{ x: number; y: number } | null>(() => {
    try { const v = JSON.parse(localStorage.getItem('vrc.ebenenPos') ?? 'null'); return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null } catch { return null }
  })
  const ebenenFensterRef = useRef<HTMLDivElement>(null)
  // Beim Öffnen: liegt die gemerkte Lage ausserhalb der Karte (kleineres Fenster, Mobile), zurück an den Ursprung
  useEffect(() => {
    const fenster = ebenenFensterRef.current, rahmen = fenster?.parentElement
    if (!ebenenOffen || !ebenenPos || !fenster || !rahmen) return
    if (ebenenPos.x + 60 > rahmen.clientWidth || ebenenPos.y + 60 > rahmen.clientHeight) setEbenenPos(null)
  }, [ebenenOffen])   // eslint-disable-line react-hooks/exhaustive-deps
  const ziehen = (e: React.PointerEvent<HTMLDivElement>) => {
    const fenster = ebenenFensterRef.current, rahmen = fenster?.parentElement
    if (!fenster || !rahmen || (e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const r = rahmen.getBoundingClientRect(), f = fenster.getBoundingClientRect()
    const dx = e.clientX - f.left, dy = e.clientY - f.top
    const lage = (ev: PointerEvent) => ({
      x: Math.round(Math.min(Math.max(0, ev.clientX - r.left - dx), Math.max(0, r.width - f.width))),
      y: Math.round(Math.min(Math.max(0, ev.clientY - r.top - dy), Math.max(0, r.height - 40))),
    })
    let zuletzt: { x: number; y: number } | null = null
    const bewegen = (ev: PointerEvent) => { zuletzt = lage(ev); setEbenenPos(zuletzt) }
    const los = () => {
      window.removeEventListener('pointermove', bewegen); window.removeEventListener('pointerup', los); window.removeEventListener('pointercancel', los)
      if (zuletzt) try { localStorage.setItem('vrc.ebenenPos', JSON.stringify(zuletzt)) } catch { /* nur für diese Sitzung */ }
    }
    window.addEventListener('pointermove', bewegen); window.addEventListener('pointerup', los); window.addEventListener('pointercancel', los)
  }
  const [zoom, setZoom] = useState(13)
  const ebenenRef = useRef<L.LayerGroup | null>(null)
  // Hintergrund wechseln (Knöpfe unten links auf der Karte, seit 22.10.2026 statt der Leaflet-Ebenenwahl):
  // die Strassennamen gehen mit dem Orthofoto an und aus, solange sie nicht abgewählt sind.
  const basisWechseln = (name: string, mitNamen = namen) => {
    const map = mapRef.current, b = basisRef.current, nm = namenRef.current
    if (!map || !b[name]) return
    if (aktiveBasis.current !== name) { b[aktiveBasis.current]?.remove(); b[name].addTo(map); aktiveBasis.current = name; setBasis(name) }
    if (nm) { if (LUFTBILDER.includes(name) && mitNamen) { if (!map.hasLayer(nm)) nm.addTo(map) } else nm.remove() }
  }

  const lineRef = useRef<Map<number, L.Polyline>>(new Map())  // Cand-ID → Linie (für Highlight)
  // Linien je Cand-ID (Rand, Linie, gestrichelte Seite B) für den Stil nach Zoom und Messung
  const gewaehltRef = useRef<Map<number, { sel: boolean; teile: L.Polyline[] }>>(new Map())
  const hlRef = useRef<Set<number> | undefined>(undefined)
  const messAktivRef = useRef(false)
  // Die Linie eines gewählten Segments liegt auf der OSM-Achse, meist genau auf der Mittellinie der Fahrbahn
  // («die Mittellinie ist nicht mehr zu sehen, es kann nicht gemessen werden»). Darum ab
  // NAH_ZOOM nur noch dünn und durchscheinend, und während einer Messung gar nicht (Klicks gehen weiter an die Messung).
  const stilSetzen = () => {
    const map = mapRef.current
    if (!map) return
    const nah = map.getZoom() >= NAH_ZOOM, weg = messAktivRef.current
    for (const [id, { sel, teile: [rand, line, b] }] of gewaehltRef.current) {
      if (!sel) {   // abgewählt: dünn gestrichelt, nah noch dünner
        rand.setStyle({ opacity: weg || nah ? 0 : 0.55 })
        line.setStyle(weg ? { opacity: 0 } : nah ? { weight: 1.5, opacity: 0.6 } : { weight: 2.5, opacity: 0.95 })
        continue
      }
      const on = !!hlRef.current?.has(id)
      rand.setStyle({ opacity: weg || nah ? 0 : 0.9 })
      line.setStyle(weg ? { opacity: 0 } : nah ? { weight: on ? 3 : 2, opacity: on ? 0.7 : 0.45 } : { weight: on ? 10 : 6, opacity: on ? 1 : 0.95 })
      b?.setStyle(weg ? { opacity: 0 } : nah ? { weight: 2, opacity: 0.45 } : { weight: 6, opacity: 0.95 })
      if (on && !weg) line.bringToFront()
    }
  }
  const lastFit = useRef(0)            // zuletzt umgesetzter fitKey
  const zentrumRef = useRef(center)    // Stadtmitte der aktuellen Stadt (Schlüssel der gemerkten Ansicht)
  const ansichtGemerkt = useRef(false) // Karte startete an der gemerkten Ansicht (Stadtwechsel-Effekt beim ersten Lauf überspringen)
  const suppress = useRef(false)        // Klick auf Linie soll keinen Karten-Klick auslösen
  const clickCb = useRef(onMapClick)    // immer den aktuellen Callback aufrufen
  clickCb.current = onMapClick
  const readyCb = useRef(onReady)       // dito (onReady wird inline übergeben → neue Referenz je Render)
  readyCb.current = onReady
  const meldungCb = useRef(onMeldung)
  meldungCb.current = onMeldung

  // Karte einmalig initialisieren (Hintergrund Orthofoto); nur beim Mount — Callbacks laufen über
  // Refs, das Zentrum bei Stadtwechsel über den Folge-Effekt. Cleanup beim Unmount (z. B.
  // Rechner → Startseite), sonst bleibt je Wechsel eine verwaiste Leaflet-Instanz zurück (Leck).
  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    // Anfangs-Mitte je Stadt; mit gemerkter Ansicht derselben Stadt (29.10.2026, wie fgsCheck) nach einem Neuladen dort weiter
    const gemerkt = ansichtLesen(center)
    const map = L.map(elRef.current).setView(gemerkt?.c ?? center, gemerkt?.z ?? 13)
    ansichtGemerkt.current = !!gemerkt
    map.on('moveend', () => {
      const c = map.getCenter()
      try { localStorage.setItem(ANSICHT_SCHLUESSEL, JSON.stringify({ stadt: zentrumRef.current, c: [c.lat, c.lng], z: map.getZoom() })) } catch { /* ohne Speicher */ }
    })
    // Drei Hintergründe zur Wahl: CyclOSM (Velo-Infrastruktur betont), Orthofoto (Führungsform
    // am Luftbild prüfbar — OSM-Tags sagen nicht immer, was gebaut ist), Landeskarte grau (ruhiger
    // Kontrast für die Linienfarben; seit 22.10.2026 statt «Hell (Carto)», dessen Kacheln ohne
    // API-Schlüssel nur noch «API key required» zeigen). swisstopo deckt alle vier Städte ab.
    // Standard ist seit 16.10.2026 das Orthofoto, vorher CyclOSM.
    const basemaps: Record<string, L.TileLayer> = {
      'CyclOSM': L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap-Mitwirkende · Stil: CyclOSM',
      }),
      // maxZoom 21 über der nativen Stufe 20 (10 cm): eine Stufe Vergrösserung zum genauen Klicken
      // beim Messen der Breite.
      [ORTHO]: L.tileLayer(
        'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg',
        { maxZoom: 21, maxNativeZoom: 20, attribution: '© swisstopo' }),
      'Landeskarte grau (swisstopo)': L.tileLayer(
        'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/{z}/{x}/{y}.jpeg',
        { maxZoom: 21, maxNativeZoom: 19, attribution: '© swisstopo' }),
      // Orthofoto der Stadt Bern, Flug 19.03.2026, 10 cm (SWISSIMAGE zeigt in Bern
      // den Stand 2024). Nur als WMS (ArcGIS, liefert auch EPSG:3857, obwohl die Capabilities nur 2056/4326
      // nennen); deckt nur das Gemeindegebiet ab, darum auf dessen Ausdehnung begrenzt (LV95 2588000–2605000 /
      // 1196000–1205000, gerundet). Knopf nur, wenn Bern gewählt ist (bern2026).
      [BERN26]: L.tileLayer.wms('https://map.bern.ch/arcgis/services/Geoportal/Orthofoto_2026/MapServer/WMSServer', {
        layers: '0', styles: '', format: 'image/jpeg', version: '1.3.0', maxZoom: 21,
        bounds: L.latLngBounds([46.91, 7.27], [47.0, 7.51]),
        attribution: '© Geodaten Stadt Bern (Orthofoto 19.03.2026)',
      }),
    }
    for(const [name,layer] of Object.entries(basemaps)){
      let gemeldeterLauf=-1
      layer.on('tileload',()=>{
        const lauf=datenGeneration();if(gemeldeterLauf===lauf)return;gemeldeterLauf=lauf
        const url=name===BERN26?'https://map.bern.ch/arcgis/services/Geoportal/Orthofoto_2026/MapServer/WMSServer?LAYERS=0'
          :name===ORTHO?'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg'
          :name==='CyclOSM'?'https://tile-cyclosm.openstreetmap.fr/':'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/{z}/{x}/{y}.jpeg'
        meldeKartenbild(url)
      })
    }
    basemaps[ORTHO].addTo(map)
    // Strassennamen über dem Orthofoto (auf dem Luftbild fehlen die Namen):
    // amtliches Strassenverzeichnis von swisstopo als WMS, ohne Schlüssel. Beim Wechsel auf eine
    // Karte mit eigenen Namen geht die Ebene aus, zurück aufs Orthofoto wieder an; von Hand abwählbar.
    namenRef.current = L.tileLayer.wms('https://wms.geo.admin.ch/', {
      layers: 'ch.swisstopo.amtliches-strassenverzeichnis', format: 'image/png', transparent: true,
      // erst ab Stufe 17: darunter zeichnet der WMS die Strassen als weisse Flächen und deckt das Luftbild zu
      minZoom: 17, maxZoom: 21, attribution: '© swisstopo (Strassennamen)',
    })
    basisRef.current = basemaps
    // Quellenangabe: auf Mobile einzeilig gekürzt (index.css), Tippen klappt sie auf (seit 28.10.2026)
    map.attributionControl.getContainer()?.addEventListener('click', ev => (ev.currentTarget as HTMLElement).classList.toggle('offen'))
    // Das Mausrad zoomt die Karte direkt wie in fgsCheck: In beiden Ansichten liegt die Karte fest, nur das Panel scrollt
    // (seit 28.10.2026; vorher lag sie schmal mitten in der scrollenden Seite, dort nur Ctrl/Cmd + Rad gegen die Scroll-Falle).
    layerRef.current = L.layerGroup().addTo(map)
    // Breitenmessung in eigener Ebene über den Segmentlinien (Overlay 400 < messen 450 < Marker 600),
    // klick-durchlässig: die Klicks gehören der Messung selbst.
    map.createPane('messen')
    const messPane = map.getPane('messen')!
    messPane.style.zIndex = '450'
    messPane.style.pointerEvents = 'none'
    messRef.current = L.layerGroup().addTo(map)
    // AV-Flächen unter den Segmentlinien (av 350 < Overlay 400), klick-durchlässig.
    // Routennetz (WMS) über dem Hintergrund, unter AV-Flächen und Linien (netz 340 < av 350 < Overlay 400), klick-durchlässig
    map.createPane('netz')
    const netzPane = map.getPane('netz')!
    netzPane.style.zIndex = '340'
    netzPane.style.pointerEvents = 'none'
    // Quellen unter AV/Segmenten: E6 empfängt Hover für Tooltips und gibt Klicks an die Karte weiter; übrige Linien/Flächen nicht interaktiv.
    map.createPane('ebenen')
    const hpPane = map.createPane('hoehenprofile'); hpPane.style.zIndex = '580'; hpPane.style.pointerEvents = 'none'
    const ebPane = map.getPane('ebenen')!
    ebPane.style.zIndex = '345'
    ebPane.style.pointerEvents = 'auto'
    map.createPane('av')
    const avPane = map.getPane('av')!
    avPane.style.zIndex = '350'
    avPane.style.pointerEvents = 'none'
    avRef.current = L.layerGroup().addTo(map)
    ebenenRef.current = L.layerGroup().addTo(map)
    // «Zum eigenen Standort» unter den Zoom-Knöpfen (eigene Ebene, nicht anklickbar)
    const standortEbene = L.layerGroup().addTo(map)
    const standort = () => {
      const melde = (t: string, art: 'info' | 'error') => meldungCb.current?.(t, art)
      if (!window.isSecureContext) { melde('Standort nur über eine sichere Verbindung (https) abrufbar.', 'error'); return }
      if (!('geolocation' in navigator)) { melde('Dieser Browser kann den Standort nicht bestimmen.', 'error'); return }
      melde('Standort wird bestimmt …', 'info')
      navigator.geolocation.getCurrentPosition(pos => {
        if (mapRef.current !== map) return            // Karte inzwischen entfernt
        const { latitude: lat, longitude: lon, accuracy } = pos.coords
        standortEbene.clearLayers()
        L.circle([lat, lon], { radius: accuracy, color: STANDORT_FARBE, weight: 1, fillColor: STANDORT_FARBE, fillOpacity: 0.12,
          interactive: false }).addTo(standortEbene)
        L.circleMarker([lat, lon], { radius: 6, color: '#ffffff', weight: 2, fillColor: STANDORT_FARBE, fillOpacity: 1, interactive: false })
          .addTo(standortEbene)
        if (accuracy > STANDORT_UNGENAU_M) map.fitBounds(L.latLng(lat, lon).toBounds(2 * accuracy))
        else map.setView([lat, lon], STANDORT_ZOOM)
        melde(`Standort gezeigt (Genauigkeit rund ${Math.round(accuracy)} m). Auf eine Strasse tippen, um ein Segment hinzuzufügen.`, 'info')
      }, err => melde(standortFehlerText(err.code), 'error'),
      { enableHighAccuracy: true, timeout: STANDORT_MS, maximumAge: 30000 })
    }
    const standortKnopf = new L.Control({ position: 'topleft' })
    standortKnopf.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-bar vrc-standort-knopf')
      const a = L.DomUtil.create('a', '', div)
      a.href = '#'; a.title = 'Zum eigenen Standort'; a.setAttribute('role', 'button'); a.setAttribute('aria-label', 'Zum eigenen Standort')
      a.innerHTML = STANDORT_SYMBOL
      L.DomEvent.disableClickPropagation(div)
      L.DomEvent.on(a, 'click', e => { L.DomEvent.preventDefault(e); standort() })
      return div
    }
    standortKnopf.addTo(map)
    // Klick auf freie Karte (nicht auf eine Linie) → Segment an der Stelle hinzufügen.
    map.on('click', (e: L.LeafletMouseEvent) => {
      kartenKlick(e, suppress, (lat, lon) => clickCb.current?.(lat, lon))
    })
    map.on('zoomend', () => { stilSetzen(); setZoom(map.getZoom()) })
    setZoom(map.getZoom())
    mapRef.current = map
    setHkMap(map)
    readyCb.current?.(map)
    return () => {
      map.remove()
      mapRef.current = null; layerRef.current = null; messRef.current = null; avRef.current = null; ebenenRef.current = null
      lineRef.current.clear(); lastFit.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Stadtwechsel: Karte auf das neue Zentrum springen (greift, solange keine Segmente
  // geladen sind — beim Laden passt fitBounds ohnehin neu ein).
  useEffect(() => {
    const map = mapRef.current
    zentrumRef.current = center
    // erster Lauf nach dem Laden mit gemerkter Ansicht: nicht auf die Stadtmitte springen
    if (ansichtGemerkt.current) { ansichtGemerkt.current = false; return }
    if (map && cands.length === 0) map.setView(center, 13)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center])

  // Linien + Nummern-Marker (neu) zeichnen, wenn sich Kandidaten/Auswahl/Marker ändern.
  useEffect(() => {
    const map = mapRef.current, lg = layerRef.current
    if (!map || !lg) return
    lg.clearLayers()
    lineRef.current.clear(); gewaehltRef.current.clear()
    const bounds = L.latLngBounds([])
    for (const c of cands) {
      const pts = c.geom.map(p => [p.lat, p.lon] as [number, number])
      if (pts.length < 2) continue
      // Sichtbare Linie = nur Anzeige; Klicks laufen über die breite Trefflinie darunter.
      const f = formen?.get(c.id), istA = f?.a || c.ist, istB = f?.b && f.b !== istA ? f.b : undefined
      // Gewählt: weisser Rand + Farbe der Führungsform; abgewählt: dunkler Rand + weiss gestrichelt (keine Legendenfarbe)
      const rand = L.polyline(pts, c.selected ? { color: '#ffffff', weight: 9, opacity: 0.9, interactive: false }
        : { color: '#1e293b', weight: 4.5, opacity: 0.55, interactive: false })
      const line = L.polyline(pts, c.selected
        ? { color: ISTCOLOR[istA] || '#0f766e', weight: 6, opacity: 0.95, interactive: false }
        : { color: '#ffffff', weight: 2.5, opacity: 0.95, dashArray: '5 6', interactive: false })
      // Unsichtbare, breite Trefflinie → leichteres An-/Abwählen per Finger (und Maus).
      // Die Klickstelle geht mit: im Teil-Modus schneidet die App dort.
      const hit = L.polyline(pts, { color: '#000', weight: 16, opacity: 0 })
      hit.on('click', (e: L.LeafletMouseEvent) => {
        segmentKlick(c.id, e, suppress, onLineClick)
      })
      const bernParts = c.bern && [
        c.bern.speed != null ? `Tempo ${c.bern.speed}` : null,
        c.bern.strassentyp ? `${c.bern.strassentyp}e Strasse` : null,
        c.bern.velostrasse ? 'Velostrasse' : null,
        c.bern.hierarchie ?? null,
        c.bern.oevTram ? 'Tram in der Fahrbahn' : null,
        c.bern.oevHaltName ? `Haltestelle ${c.bern.oevHaltName}` : null,
        c.bern.dtv != null ? `DTV ≈ ${c.bern.dtv}` : null,
        c.bern.routentyp ?? null,
      ].filter(Boolean)
      const obsPart = c.obs && c.obs.count > 0
        ? `<br>OpenBikeSensor${obsStand ? ` (Export ${escapeHtml(obsStand)})` : ''}: Median ${c.obs.median.toFixed(2)} m (n ${c.obs.count})`
        : (c.obs && c.obs.usage > 0
            ? `<br>OpenBikeSensor${obsStand ? ` (Export ${escapeHtml(obsStand)})` : ''}: befahren (n ${c.obs.usage}), keine Überholmessung`
            : '')
      // Leaflet setzt den Tooltip per innerHTML → Fremdtext (OSM-Name) maskieren, s. netz.ts.
      hit.bindTooltip(
        `${escapeHtml(c.name)} · ${Math.round(c.len)} m` +
        (c.teil ? ` · Teil ${c.teil.nr}/${c.teil.anzahl}` : '') +
        ` · ${escapeHtml(istB ? `Seite A ${istA} / Seite B ${istB}` : istA)}${c.selected ? '' : ' (abgewählt)'}` +
        (bernParts && bernParts.length ? `<br>${escapeHtml(c.datenOrt?.stadt ? ({bern:'Geoinformation Stadt Bern',zurich:'Geodaten Stadt Zürich',basel:'Geodaten Kanton Basel-Stadt',luzern:'Geodaten Stadt Luzern'}[c.datenOrt.stadt]) : c.datenOrt ? 'Örtliche Quellen · '+c.datenOrt.name : attribution)}: ${escapeHtml(bernParts.join(' · '))}` : '') +
        (c.speed != null && c.bern?.speed == null ? `<br>OpenStreetMap: Tempo ${c.speed}` : '') +
        (spurenText(c.spuren) ? `<br>${escapeHtml(spurenText(c.spuren)!)}` : '') +
        obsPart,
        { sticky: true })
      hit.addTo(lg)         // unten (Trefffläche)
      rand.addTo(lg)        // Rand für die Sichtbarkeit auf Karte und Luftbild
      line.addTo(lg)        // sichtbare Linie darüber
      const linieB = c.selected && istB   // Seite B anders: gestrichelt in ihrer Farbe über der Linie der Seite A
        ? L.polyline(pts, { color: ISTCOLOR[istB] || '#0f766e', weight: 6, opacity: 0.95, dashArray: '8 10', interactive: false }).addTo(lg)
        : undefined
      lineRef.current.set(c.id, line)
      gewaehltRef.current.set(c.id, { sel: !!c.selected, teile: linieB ? [rand, line, linieB] : [rand, line] })
      pts.forEach(p => bounds.extend(p))
    }
    // Schnittpunkte geteilter Ways: weisser Punkt am Anfang jedes Teils ausser dem ersten
    // (die Teile laufen in Way-Richtung, Teil n+1 beginnt am Schnitt). Klick-transparent.
    for (const c of cands) {
      if (!c.teil || c.teil.nr < 2 || c.geom.length < 2) continue
      L.circleMarker([c.geom[0].lat, c.geom[0].lon], {
        radius: 5, color: '#1e293b', weight: 2, fillColor: '#ffffff', fillOpacity: 1, interactive: false,
      }).addTo(lg)
    }
    // Nummern-Marker je Abschnitt (dunkler Kreis, weisse Zahl; klick-transparent). Ein kleines
    // Dreieck am Kreisrand zeigt die Fahrtrichtung der Seite A (Karte ist genordet → Peilung =
    // Drehung im Uhrzeigersinn).
    for (const m of markers ?? []) {
      const pfeil = m.peilung == null ? '' :
        `<div style="position:absolute;left:0;top:0;width:22px;height:22px;transform:rotate(${Math.round(m.peilung)}deg)">` +
        `<div style="position:absolute;left:5px;top:-10px;width:0;height:0;border-left:6px solid transparent;` +
        `border-right:6px solid transparent;border-bottom:10px solid #1e293b;` +
        `filter:drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff)"></div></div>`
      const mk = L.marker([m.lat, m.lon], {
        interactive: !!onMarkerClick,
        icon: L.divIcon({
          className: '',
          iconSize: [22, 22], iconAnchor: [11, 11],
          html: `<div style="position:relative;width:22px;height:22px${onMarkerClick ? ';cursor:pointer' : ''}">${pfeil}` +
            `<div style="position:absolute;left:0;top:0;width:22px;height:22px;border-radius:999px;background:#1e293b;` +
            `color:#fff;font:700 12px/22px system-ui,sans-serif;text-align:center;` +
            `box-shadow:0 0 0 2px #fff">${m.num}</div></div>`,
        }),
      }).addTo(lg)
      // Klick auf die Nummer öffnet den Abschnitt im Panel (seit 22.10.2026)
      if (onMarkerClick) mk.bindTooltip(`Abschnitt ${m.num} öffnen`, { direction: 'top' }).on('click', () => onMarkerClick(m.num))
    }
    stilSetzen()
    // Einpassen nur auf Anforderung (fitKey, gesetzt von «Strasse laden»). Bis zum 29.09.2026 passte
    // jede Änderung der Segment-Menge neu ein — auch jeder Klick-Zusatz: die Karte sprang, und das
    // erste kurze Segment zoomte sie auf die höchste Stufe. Klick und «Kartenausschnitt laden»
    // geschehen im Bild, das man gerade ansieht; dort bleibt die Karte stehen.
    if (fitKey !== lastFit.current && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 })
      lastFit.current = fitKey
    }
  }, [cands, onLineClick, markers, attribution, fitKey, obsStand, formen, onMarkerClick])

  // Kartenebenen: E6-Linien und Punkte mit Tooltip, übrige Linien/Flächen nicht interaktiv unter den Segmenten;
  // ab BESCHRIFT_ZOOM der Wert als Beschriftung (Linie: Mitte des längsten Stücks)
  useEffect(() => {
    const eg = ebenenRef.current
    if (!eg) return
    eg.clearLayers()
    const defs = ebenenFuer(stadt, ebenen)
    const profilId = standardProfil((ebenen.gelaende ?? []).flatMap(o => o.hoehenprofil ? [o.hoehenprofil] : []), profilAuswahl)?.id
    const beschriften = zoom >= BESCHRIFT_ZOOM
    const marke = (p: LLo, text: string, farbe: string) => L.marker([p.lat, p.lon], { interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'vrc-ebene-wert', iconSize: [0, 0],
        html: `<span style="border-color:${farbe}">${escapeHtml(text)}</span>` }) }).addTo(eg)
    for (const def of defs) {
      if (!ebenenAn.has(def.id)) continue
      for (const o of def.id === 'gelaende' ? profilObjekteWaehlen(ebenen.gelaende ?? [], profilAuswahl, alleGelaendeProfile) : ebenen[def.id] ?? []) {
        const farbe = ebenenFarbe(def, o.klasse)
        if (o.ringe) L.polygon(o.ringe.map(r => r.map(p => [p.lat, p.lon] as [number, number])), { pane: 'ebenen', color: farbe, weight: 1.5,
          fillColor: farbe, fillOpacity: o.deckkraft ?? 0.3, interactive: false }).addTo(eg)
        if (o.linien) {
          const ll = o.linien.map(l => l.map(p => [p.lat, p.lon] as [number, number]))
          // dunkler Rand: Quellen-Linien heben sich von den Segmentlinien (weisser Rand) ab (Form statt Farbe allein)
          zeichneQuellenLinie(L.polyline, eg, ll, def, o, farbe)
          if (beschriften && o.wert) {
            const l = o.linien.reduce((a, b) => (b.length > a.length ? b : a))
            marke(l[l.length >> 1], o.wert, farbe)
          }
          if (o.hoehenprofil && o.hoehenprofil.id === profilId) {
            L.polyline(ll, { pane: 'hoehenprofile', color: '#ffffff', weight: 11, interactive: false }).addTo(eg)
            L.polyline(ll, { pane: 'hoehenprofile', color: '#0369a1', weight: 5, interactive: false }).addTo(eg)
          }
        }
        if (o.punkt) {
          L.marker([o.punkt.lat, o.punkt.lon], { keyboard: false,
            icon: L.divIcon({ className: 'vrc-q-punkt', iconSize: [18, 18], html: `<span style="background:${farbe}">${escapeHtml(ebenenSymbol(def, o))}</span>` }) })
            .bindTooltip(escapeHtml(o.text), { direction: 'top' }).addTo(eg)
          if (beschriften && o.wert) marke(o.punkt, o.wert, farbe)
        }
      }
    }
  }, [ebenen, ebenenAn, zoom, stadt, profilAuswahl, alleGelaendeProfile])

  // Teil-Modus: Fadenkreuz über den Linien (CSS-Klasse am Karten-Container, index.css).
  useEffect(() => {
    mapRef.current?.getContainer().classList.toggle('vrc-teilmodus', teilModus)
  }, [teilModus])

  // Orthofoto einschalten (Breitenmessung). Es bleibt danach eingeschaltet: Zurück zu CyclOSM
  // (höchstens Stufe 19) hätte die Karte nach einer Messung auf Stufe 20/21 herausgezoomt
  // (16.10.2026). Den Hintergrund wechselt man unten links auf der Karte.
  useEffect(() => {
    if (orthofoto && !LUFTBILDER.includes(aktiveBasis.current)) basisWechseln(ORTHO)   // ein Luftbild bleibt stehen
  }, [orthofoto])   // eslint-disable-line react-hooks/exhaustive-deps

  // Kartenbilder zum Überblick (Höhenlinien, Relief) im Pane 'netz', unter Ebenen und Segmenten
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for(const u of (UEBERBLICK[stadt]??[]).filter(u=>ueberAn.has(u.id)))meldeKartenbild(u.url+(u.layers?'?LAYERS='+encodeURIComponent(u.layers):''))
    const lagen = (UEBERBLICK[stadt] ?? []).filter(u => ueberAn.has(u.id)).map(u => (u.art === 'wms'
      ? L.tileLayer.wms(u.url, { layers: u.layers ?? '', styles: '', format: 'image/png', transparent: true, version: '1.3.0', pane: 'netz',
          opacity: u.deckkraft, maxZoom: 21, attribution: u.attribution })
      : L.tileLayer(u.url, { pane: 'netz', opacity: u.deckkraft, maxZoom: 21, maxNativeZoom: 19, attribution: u.attribution })).addTo(map))
    return () => { for (const l of lagen) l.remove() }
  }, [ueberAn, stadt])

  // Routennetz ein- und ausblenden; bei Stadtwechsel (anderes oder kein Netz) die alte Ebene entfernen
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    netzRef.current?.remove(); netzRef.current = null
    if (!routennetz || !netzAn) return
    meldeKartenbild(routennetz.url+'?LAYERS='+encodeURIComponent(routennetz.layers))
    netzRef.current = L.tileLayer.wms(routennetz.url, {
      layers: routennetz.layers, styles: '', format: 'image/png', transparent: true, version: '1.3.0', pane: 'netz',
      opacity: 0.8, maxZoom: 21, attribution: routennetz.attribution,
    }).addTo(map)
  }, [routennetz, netzAn])

  // Erklärung beim Überfahren einer Netzlinie (seit 30.10.2026): nach einer kurzen Pause GetFeatureInfo an der Stelle
  // (Fenster ±NETZ_FANG_PX um den Zeiger, Mitte abgefragt), Text aus routennetz.beschreiben als Tooltip. Nur mit Maus (Touch kennt
  // kein Überfahren) und nicht während einer Messung; die jeweils letzte Abfrage gilt.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !routennetz || !netzAn) return
    let timer = 0, nr = 0
    const tip = L.tooltip({ direction: 'top', offset: [0, -8], className: 'vrc-netz-tip', opacity: 0.95 })
    const weg = () => { window.clearTimeout(timer); nr++; tip.remove(); map.getContainer().classList.remove('vrc-netz-info') }
    const abfragen = async (ll: L.LatLng, num: number) => {
      const pt = map.latLngToContainerPoint(ll), f = NETZ_FANG_PX
      const a = L.CRS.EPSG3857.project(map.containerPointToLatLng([pt.x - f, pt.y + f]))
      const b = L.CRS.EPSG3857.project(map.containerPointToLatLng([pt.x + f, pt.y - f]))
      const q = new URLSearchParams({ SERVICE: 'WMS', REQUEST: 'GetFeatureInfo', VERSION: '1.3.0', LAYERS: routennetz.layers,
        QUERY_LAYERS: routennetz.layers, STYLES: '', CRS: 'EPSG:3857', BBOX: [a.x, a.y, b.x, b.y].map(v => v.toFixed(2)).join(','),
        WIDTH: String(2 * f + 1), HEIGHT: String(2 * f + 1), I: String(f), J: String(f), INFO_FORMAT: routennetz.infoFormat, FEATURE_COUNT: '5',
        ...routennetz.infoExtra })
      try {
        const res = await fetch(`${routennetz.url}?${q}`)
        const text = res.ok ? await res.text() : ''
        if (num !== nr) return
        const feats = (text.trim() ? (JSON.parse(text) as { features?: { properties?: Record<string, unknown> }[] }).features : []) ?? []
        const texte = netzTexte(feats.map(x => routennetz.beschreiben(x.properties ?? {})).filter((t): t is string => !!t))
        if (!texte.length) { tip.remove(); map.getContainer().classList.remove('vrc-netz-info'); return }
        tip.setLatLng(ll).setContent(texte.map(escapeHtml).join('<br>')).addTo(map)
        map.getContainer().classList.add('vrc-netz-info')        // Mauszeiger «?» über einer erklärten Linie
      } catch { if (num === nr) { tip.remove(); map.getContainer().classList.remove('vrc-netz-info') } }
    }
    const bewegt = (e: L.LeafletMouseEvent) => {
      weg()
      if (messAktivRef.current) return
      const num = nr
      timer = window.setTimeout(() => void abfragen(e.latlng, num), NETZ_PAUSE_MS)
    }
    map.on('mousemove', bewegt); map.on('mouseout movestart', weg)
    return () => { weg(); map.off('mousemove', bewegt); map.off('mouseout movestart', weg) }
  }, [routennetz, netzAn])

  // Stadt gewechselt: das Berner Orthofoto deckt nur Bern ab → zurück auf SWISSIMAGE
  useEffect(() => {
    if (!bern2026 && aktiveBasis.current === BERN26) basisWechseln(ORTHO)
  }, [bern2026])   // eslint-disable-line react-hooks/exhaustive-deps

  // AV-Flächen zeichnen (Planung), mit Quellenangabe, solange sie zu sehen sind.
  useEffect(() => {
    const map = mapRef.current, ag = avRef.current
    if (!map || !ag || !av) return
    const ll = (p: LLo) => [p.lat, p.lon] as [number, number]
    for (const f of av.flaechen) {
      const farbe = AV_FARBEN[f.art]
      if (!farbe) continue
      L.polygon(f.ringe.map(r => r.map(ll)), { pane: 'av', color: farbe, weight: 1, fillColor: farbe,
        fillOpacity: AV_DECKKRAFT[f.art] ?? 0.25, interactive: false }).addTo(ag)
    }
    for (const f of av.park ?? []) {
      const farbe = f.verbot ? PARKVERBOT_FARBE : f.zweirad ? ZWEIRAD_FARBE : PARK_FARBE
      L.polygon(f.ringe.map(r => r.map(ll)), { pane: 'av', color: farbe, weight: 1.5, fillColor: farbe, fillOpacity: 0.35,
        interactive: false }).addTo(ag)
    }
    map.attributionControl.addAttribution(av.quelle)
    return () => { ag.clearLayers(); map.attributionControl.removeAttribution(av.quelle) }
  }, [av])

  // Breitenmessung zeichnen: Bordsteinkanten orange, Punkte, Messlinie gestrichelt mit Wert.
  useEffect(() => {
    const map = mapRef.current, mg = messRef.current
    if (!map || !mg) return
    mg.clearLayers()
    map.getContainer().classList.toggle('vrc-messmodus', !!messung)
    messAktivRef.current = !!messung; stilSetzen()
    if (!messung) return
    const ll = (p: LLo) => [p.lat, p.lon] as [number, number]
    // Alle Kanten als EINE Linie mit vielen Teilen (ein SVG-Pfad statt tausender Ebenen).
    if (messung.kanten.length)
      L.polyline(messung.kanten.map(k => k.map(ll)), { pane: 'messen', color: '#f97316', weight: 2.5, opacity: 0.95, interactive: false }).addTo(mg)
    for (const p of messung.punkte)
      L.circleMarker(ll(p), { pane: 'messen', radius: 4, color: '#111827', weight: 2, fillColor: '#ffffff', fillOpacity: 1, interactive: false }).addTo(mg)
    if (messung.linie) {
      const [a, b] = messung.linie
      L.polyline([ll(a), ll(b)], { pane: 'messen', color: '#ffffff', weight: 6, opacity: 0.85, interactive: false }).addTo(mg)
      L.polyline([ll(a), ll(b)], { pane: 'messen', color: '#111827', weight: 2.5, dashArray: '5 4', interactive: false }).addTo(mg)
      for (const p of [a, b])
        L.circleMarker(ll(p), { pane: 'messen', radius: 3.5, color: '#111827', weight: 2, fillColor: '#ffffff', fillOpacity: 1, interactive: false }).addTo(mg)
      if (messung.label) {
        L.marker([(a.lat + b.lat) / 2, (a.lon + b.lon) / 2], {
          interactive: false,
          icon: L.divIcon({
            className: '', iconSize: [70, 22], iconAnchor: [35, 30],
            html: `<div style="background:#111827;color:#fff;font:700 12px/22px system-ui,sans-serif;` +
              `text-align:center;border-radius:6px;box-shadow:0 0 0 2px #fff">${escapeHtml(messung.label)}</div>`,
          }),
        }).addTo(mg)
      }
    }
    if (messung.quer && messung.quer.punkte.length) {
      const q = messung.quer
      if (q.punkte.length > 1) {
        L.polyline(q.punkte.map(ll), { pane: 'messen', color: '#ffffff', weight: 6, opacity: 0.85, interactive: false }).addTo(mg)
        L.polyline(q.punkte.map(ll), { pane: 'messen', color: '#111827', weight: 2.5, interactive: false }).addTo(mg)
      }
      for (const p of q.punkte)
        L.circleMarker(ll(p), { pane: 'messen', radius: 4, color: '#111827', weight: 2, fillColor: '#ffffff', fillOpacity: 1, interactive: false }).addTo(mg)
      for (const m of q.marken)
        L.marker(ll(m.p), {
          interactive: false,
          icon: L.divIcon({
            className: '', iconSize: [64, 20], iconAnchor: [32, -6],
            html: `<div style="background:#111827;color:#fff;font:700 11px/20px system-ui,sans-serif;` +
              `text-align:center;border-radius:6px;box-shadow:0 0 0 2px #fff">${escapeHtml(m.text)}</div>`,
          }),
        }).addTo(mg)
    }
  }, [messung])

  // Highlight des gehoverten Abschnitts: betroffene Linien dicker + nach vorn, ohne Neuzeichnen.
  // Nur gewählte Segmente anfassen (abgewählte behalten ihren dünnen, gestrichelten Stil).
  useEffect(() => {
    hlRef.current = highlightIds
    stilSetzen()
  }, [highlightIds, cands])   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    // Höhe/Rahmen über die Klasse (index.css): im Breitbild-Layout füllt die Karte die linke Spalte.
    // Die Knöpfe für den Hintergrund liegen als eigenes Element neben dem Leaflet-Container (nicht darin:
    // React und Leaflet sollen sich keine Kindelemente teilen).
    <div className="vrc-velomap-wrap">
      <div ref={elRef} className="vrc-velomap" />
      <div className="vrc-hintergrund" role="group" aria-label="Kartenhintergrund">
        {([[ORTHO, 'Luftbild'], ...(bern2026 ? [[BERN26, 'Bern 2026']] : []), ['Landeskarte grau (swisstopo)', 'Karte'], ['CyclOSM', 'CyclOSM']] as [string, string][]).map(([name, label]) => (
          <button key={name} type="button" aria-pressed={basis === name} onClick={() => basisWechseln(name)} title={name}
                  className={basis === name ? 'aktiv' : undefined}>
            {label}
          </button>
        ))}
        {/* Ergänzung zum Luftbild, kein eigener Hintergrund: Kästchen «+ Strassennamen», nur bei den Luftbildern (seit
            22.10.2026 standardmässig aus) */}
        {/* «Kartenebenen» (seit 01.11.2026): Routennetz und die Quellen der Vorbelegung, je einzeln einblendbar */}
        <button type="button" aria-expanded={ebenenOffen} onClick={() => setEbenenOffen(o => !o)}
                className={ebenenOffen || netzAn || ebenenAn.size ? 'aktiv-rand' : undefined}
                title="Kartenebenen auf der Karte zeigen: Routennetz und die Quellen, aus denen die Felder vorbelegt sind">
          <span className="lang">Kartenebenen</span><span className="kurz">Quellen</span>{(() => { const k = (hk.an ? 1 : 0) + (netzAn && routennetz ? 1 : 0) + (UEBERBLICK[stadt] ?? []).filter(u => ueberAn.has(u.id)).length + astraAn.size + ebenenSichtbar(ebenenFuer(stadt, ebenen), ebenen, nachladen).zeigen.filter(e => ebenenAn.has(e.id)).length; return k ? ` (${k})` : '' })()} ▴
        </button>
        {LUFTBILDER.includes(basis) && (
          <label className="namen" title="Strassennamen aus dem amtlichen Strassenverzeichnis über dem Luftbild (swisstopo, ab Zoomstufe 17)">
            <input type="checkbox" checked={namen} onChange={e => { setNamen(e.target.checked); basisWechseln(basis, e.target.checked) }} />
            <span className="lang">Strassennamen</span><span className="kurz">Namen</span>
          </label>
        )}
      </div>
      {ebenenOffen && (
        <div className="vrc-ebenen" role="group" aria-label="Kartenebenen" ref={ebenenFensterRef}
             style={ebenenPos ? { left: ebenenPos.x, top: ebenenPos.y, bottom: 'auto', maxHeight: `calc(100% - ${ebenenPos.y + 10}px)` } : undefined}>
          <div className="vrc-ebenen-kopf" onPointerDown={ziehen} title="An dieser Zeile ziehen, um das Fenster zu verschieben (Doppelklick: zurück an den Ursprung)"
               onDoubleClick={() => { setEbenenPos(null); try { localStorage.removeItem('vrc.ebenenPos') } catch { /* egal */ } }}>
            <span><span className="griff" aria-hidden="true">⠿</span> Kartenebenen</span>
            <button type="button" onClick={() => setEbenenOffen(false)} aria-label="Schliessen">×</button>
          </div>
          {(() => {
            const eintraege: { id:string; titel:string; inhalt:ReactNode }[]=[]
            eintraege.push({id:'hoehenkurven',titel:hk.titel,inhalt:<HoehenkurvenWahl an={hk.an} setzen={hk.setzen} stand={hk.stand} klasse="vrc-ebene" />})
            for(const e of ebenenSichtbar(ebenenFuer(stadt, ebenen), ebenen, nachladen).zeigen) {
            const n = (ebenen[e.id] ?? []).length
            const zahl = n ? `${n} im Ausschnitt${(nachladen.laufend[e.id] ?? 0) > 0 ? ', lädt weiter …' : ''}` : (nachladen.laufend[e.id] ?? 0) > 0 ? 'lädt …' : ''
            eintraege.push({id:e.id,titel:e.titel,inhalt:(
              <EbenenGruppe key={e.id} mitProfil={e.id === 'gelaende'} titel={e.titel}><label className="vrc-ebene" title={ebenenQuelle(e, stadt)}>
                <input type="checkbox" checked={ebenenAn.has(e.id)} onChange={x => ebeneSchalten(e.id, x.target.checked)} />
                <span>
                  <b>{e.titel}</b> <small className="zahl">{zahl}</small>
                  <small>{ebenenQuelle(e, stadt)}{e.hinweis ? ` (${e.hinweis})` : ''}</small>
                  {ebenenAn.has(e.id) && (
                    <span className="vrc-legende">
                      {legendeFuer(e, stadt, ebenen).map(([k, farbe, text, symbol]) => <span key={k}>{symbol ? <i className="sym" style={{ background: farbe }}>{symbol}</i> : <i style={{ background: farbe }} />}{text}</span>)}
                    </span>
                  )}
                </span>
              </label>
              {e.id === 'gelaende' && <HoehenprofilAnsicht profile={(ebenen.gelaende ?? []).flatMap(o => o.hoehenprofil ? [o.hoehenprofil] : [])}
                onAuswahl={id => { setProfilAuswahl(id); if (id) ebeneSchalten('gelaende', true) }} kartenAlle={alleGelaendeProfile}
                onKartenAlle={an => { setAlleGelaendeProfile(an); if (an) ebeneSchalten('gelaende', true) }} />}
              </EbenenGruppe>
            )})
            }
            if(routennetz)eintraege.push({id:'netz-gesamt',titel:'Routennetz ganze Stadt (Plan der Stadt)',inhalt:(
            <label className="vrc-ebene" title={`${routennetz.titel} (${routennetz.attribution})`}>
              <input type="checkbox" checked={netzAn} onChange={e => {
                setNetzAn(e.target.checked)
                try { localStorage.setItem('vrc.routennetz', e.target.checked ? '1' : '0') } catch { /* nur für diese Sitzung */ }
              }} />
              <span><b>Routennetz ganze Stadt (Plan der Stadt)</b><small>{routennetz.attribution}; Kartenbild des Dienstes; Datenstand/Vollständigkeit unter «Datenquellen und Ladezustand»; Linie überfahren für Einzelheiten</small></span>
            </label>
            )})
            for(const u of UEBERBLICK[stadt]??[])eintraege.push({id:'ueberblick:'+u.id,titel:u.titel,inhalt:(
            <label key={u.id} className="vrc-ebene" title={`${u.titel} (${u.attribution})`}>
              <input type="checkbox" checked={ueberAn.has(u.id)} onChange={e => ueberSchalten(u.id, e.target.checked)} />
              <span><b>{u.titel}</b><small>{u.attribution}; {u.erklaerung}; {ebenenStandText(u.id==='relief'?'relief':'kartenbild')}</small></span>
            </label>
            )})
            for(const a of ASTRA_EBENEN)eintraege.push({id:a.id,titel:a.titel,inhalt:<label key={a.id} className="vrc-ebene">
            <input type="checkbox" checked={astraAn.has(a.id)} onChange={ev=>{const an=ev.target.checked;setAstraAn(s=>{const n=new Set(s);if(an)n.add(a.id);else n.delete(a.id);return n})}} />
            <span><b>{a.titel}</b><small>{a.attribution}; Datenstand {astraStaende[a.id] ?? 'unbekannt (Metadaten werden geladen)'}; Vollständigkeit unbekannt; alle angebotenen Jahre. Anonymisierte Lage, nur Kartenkontext, keine Wirkung auf die Bewertung.</small></span>
            </label>})
            const kollator=new Intl.Collator('de-CH',{sensitivity:'base',numeric:true})
            return eintraege.sort((a,b)=>kollator.compare(a.titel,b.titel)).map(e=><Fragment key={e.id}>{e.inhalt}</Fragment>)
          })()}
          {(() => {
            const ohne = ebenenSichtbar(ebenenFuer(stadt, ebenen), ebenen, nachladen).ohne
            return ohne.length ? <p className="vrc-ebenen-fuss">Ohne Daten im Ausschnitt: {ohne.map(e => e.titel.replace(/ \(.*\)$/, '')).join(', ')}
              {!nachladen.moeglich && ohne.some(e => NACHLADEN.includes(e.id)) ? ' (Parkfelder, Fussnetz, Wartehallen, Steigung und amtliche Vermessung lädt die App nach dem Übernehmen der Segmente)' : ''}.</p> : null
          })()}
          <p className="vrc-ebenen-fuss">Gezeigt wird, was beim Laden gelesen wurde; ab Zoomstufe {BESCHRIFT_ZOOM} mit dem Wert. Die Segmentlinie nennt im Tooltip, was übernommen ist.</p>
        </div>
      )}
    </div>
  )
}
