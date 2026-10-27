import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { ObsStats } from './obs'
import type { Spuren } from './osm'
import { escapeHtml } from './netz'

// Ein OSM-Rohsegment (Kandidat) — auf der Karte anklickbar, vor dem Zusammenfassen.
export interface Cand {
  // Kennung des Kandidaten — eindeutig in der Liste, Schlüssel für Karte, Anreicherung und
  // Abschnitte. Bei einem ganzen Way = OSM-Way-ID; die Teile eines geteilten Ways erhalten
  // eigene, negative Kennungen (osm.ts, teileInListe), damit sie nie mit einer Way-ID kollidieren.
  id: number
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
    speed?: number                        // V_sig, Signalisierte Höchstgeschwindigkeit
    dtv?: number                          // 16×Nt + 8×Nn, Flächendeckende Verkehrsdaten
    dtvGeprueft?: boolean                 // nur Bern: Verkehrsdaten-Layer hat für DIESES Segment geantwortet (Grundlage der ≤-2000-Annahme)
    routentyp?: 'Velohauptroute' | 'Veloroute'   // Veloroutennetz Masterplan
    strassentyp?: 'verkehrsorientiert' | 'siedlungsorientiert'  // nur Basel (Strassen-/Wege-Datensatz)
    velostrasse?: boolean                 // Treffer im Velostrassen-Layer
    // Treffer im lokalen Markierungs-Snapshot (Velostreifen, siehe velostreifen.ts); rechts/links
    // = Seite der Striche, bezogen auf die Way-Richtung
    radstreifen?: { breite?: number; rechts?: { breite?: number }; links?: { breite?: number } }
    // Radstreifen aus dem Luftbild (luftbild.ts, nur Bern): Anteil der Länge mit Fund je Seite,
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
export interface Stop { lat: number; lon: number; name: string; bpuic?: string }

// Farbe je Führungsform (Linien auf der Karte). Seit 17.10.2026 kein Grau mehr: Mischverkehr war grau
// wie die abgewählten Segmente und auf dem Luftbild kaum zu sehen (Nutzerbefund). Abgewählt ist jetzt
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
export const BREIT_MQ = 'screen and (min-width: 1100px)'

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
const NAH_ZOOM = 19                                                 // ab hier gewählte Linien dünn (Markierungen sichtbar)
const BERN26 = 'Orthofoto Stadt Bern 2026'
const LUFTBILDER = [ORTHO, BERN26]                                  // Hintergründe mit Strassennamen-Kästchen

export function VeloMap({ cands, onLineClick, onMapClick, onReady, markers, highlightIds, stops,
                          attribution = 'Geoinformation Stadt Bern', center = [46.948, 7.447], fitKey = 0,
                          teilModus = false, orthofoto = false, bern2026 = false, messung = null, av = null, obsStand, formen, onMeldung, onMarkerClick }: {
  onMarkerClick?: (num: number) => void   // Abschnitts-Marker angeklickt (öffnet den Abschnitt im Panel, seit 22.10.2026)
  cands: Cand[]
  onLineClick: (id: number, lat: number, lon: number) => void   // Linie angeklickt (an-/abwählen oder teilen)
  onMapClick?: (lat: number, lon: number) => void
  onReady?: (map: L.Map) => void
  markers?: SectionMarker[]               // nummerierte Abschnitts-Marker
  highlightIds?: Set<number>              // Cand-IDs des gehoverten Abschnitts → hervorheben
  stops?: Stop[]                          // ÖV-Haltestellen im geladenen Bereich (Marker)
  attribution?: string                    // Quellenangabe der amtlichen Anreicherung (stadtabhängig)
  obsStand?: string                       // Stand des OpenBikeSensor-Exports (Tooltip)
  center?: [number, number]               // Anfangs-Kartenmitte (stadtabhängig)
  fitKey?: number                         // ändert sich → Karte auf die Segmente einpassen (nur «Strasse laden»)
  teilModus?: boolean                     // «Segment teilen» aktiv → Fadenkreuz über den Linien
  orthofoto?: boolean                     // true → Hintergrund aufs Orthofoto schalten (Breitenmessung); bleibt danach
  bern2026?: boolean                      // Stadt Bern gewählt → Knopf «Bern 2026» (Orthofoto der Stadt, seit 27.10.2026)
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
  const [namen, setNamen] = useState(false)                       // Strassennamen aus, bis sie gewählt sind (Nutzerentscheid 22.10.2026)
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
  // (Nutzerbefund 27.10.2026: «die Mittellinie ist nicht mehr zu sehen, es kann nicht gemessen werden»). Darum ab
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
    const map = L.map(elRef.current).setView(center, 13)  // Anfangs-Mitte je Stadt
    // Drei Hintergründe zur Wahl: CyclOSM (Velo-Infrastruktur betont), Orthofoto (Führungsform
    // am Luftbild prüfbar — OSM-Tags sagen nicht immer, was gebaut ist), Landeskarte grau (ruhiger
    // Kontrast für die Linienfarben; seit 22.10.2026 statt «Hell (Carto)», dessen Kacheln ohne
    // API-Schlüssel nur noch «API key required» zeigen). swisstopo deckt alle vier Städte ab.
    // Standard ist seit 16.10.2026 das Orthofoto (Nutzerwunsch), vorher CyclOSM.
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
      // Orthofoto der Stadt Bern, Flug 19.03.2026, 10 cm (Nutzerwunsch 27.10.2026: SWISSIMAGE zeigt in Bern
      // den Stand 2024). Nur als WMS (ArcGIS, liefert auch EPSG:3857, obwohl die Capabilities nur 2056/4326
      // nennen); deckt nur das Gemeindegebiet ab, darum auf dessen Ausdehnung begrenzt (LV95 2588000–2605000 /
      // 1196000–1205000, gerundet). Knopf nur, wenn Bern gewählt ist (bern2026).
      [BERN26]: L.tileLayer.wms('https://map.bern.ch/arcgis/services/Geoportal/Orthofoto_2026_1/MapServer/WMSServer', {
        layers: '0', styles: '', format: 'image/jpeg', version: '1.3.0', maxZoom: 21,
        bounds: L.latLngBounds([46.91, 7.27], [47.0, 7.51]),
        attribution: '© Geodaten Stadt Bern (Orthofoto 19.03.2026)',
      }),
    }
    basemaps[ORTHO].addTo(map)
    // Strassennamen über dem Orthofoto (Nutzerbefund 22.10.2026: auf dem Luftbild fehlen die Namen):
    // amtliches Strassenverzeichnis von swisstopo als WMS, ohne Schlüssel. Beim Wechsel auf eine
    // Karte mit eigenen Namen geht die Ebene aus, zurück aufs Orthofoto wieder an; von Hand abwählbar.
    namenRef.current = L.tileLayer.wms('https://wms.geo.admin.ch/', {
      layers: 'ch.swisstopo.amtliches-strassenverzeichnis', format: 'image/png', transparent: true,
      // erst ab Stufe 17: darunter zeichnet der WMS die Strassen als weisse Flächen und deckt das Luftbild zu
      minZoom: 17, maxZoom: 21, attribution: '© swisstopo (Strassennamen)',
    })
    basisRef.current = basemaps
    // Schmales Layout: Zoomen nur mit Ctrl/Cmd + Mausrad. Die Karte liegt mitten in einer scrollenden
    // Seite — ein «nacktes» Rad-Ereignis soll die Seite scrollen, nicht die Karte zoomen (Scroll-Falle).
    // Breitbild (BREIT_MQ, Karte links in voller Höhe, daneben scrollt nur das Panel): keine Scroll-Falle,
    // das Rad zoomt direkt wie in fgsCheck. Pinch-Zoom (Touch) und die +/−-Buttons bleiben unverändert.
    const breit = window.matchMedia(BREIT_MQ)
    const radSetzen = () => { if (breit.matches) map.scrollWheelZoom.enable(); else map.scrollWheelZoom.disable() }
    radSetzen()
    breit.addEventListener('change', radSetzen)
    const wheelEl = elRef.current
    const onWheel = (e: WheelEvent) => {
      if (breit.matches || (!e.ctrlKey && !e.metaKey)) return   // Breitbild: Leaflet zoomt selbst
      e.preventDefault()   // Browser-Seitenzoom unterdrücken, stattdessen Karte zoomen
      const p = map.mouseEventToContainerPoint(e as unknown as MouseEvent)
      map.setZoomAround(p, map.getZoom() + (e.deltaY < 0 ? 1 : -1))
    }
    wheelEl.addEventListener('wheel', onWheel, { passive: false })
    layerRef.current = L.layerGroup().addTo(map)
    // Breitenmessung in eigener Ebene über den Segmentlinien (Overlay 400 < messen 450 < Marker 600),
    // klick-durchlässig: die Klicks gehören der Messung selbst.
    map.createPane('messen')
    const messPane = map.getPane('messen')!
    messPane.style.zIndex = '450'
    messPane.style.pointerEvents = 'none'
    messRef.current = L.layerGroup().addTo(map)
    // AV-Flächen unter den Segmentlinien (av 350 < Overlay 400), klick-durchlässig.
    map.createPane('av')
    const avPane = map.getPane('av')!
    avPane.style.zIndex = '350'
    avPane.style.pointerEvents = 'none'
    avRef.current = L.layerGroup().addTo(map)
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
      if (suppress.current) { suppress.current = false; return }
      clickCb.current?.(e.latlng.lat, e.latlng.lng)
    })
    map.on('zoomend', () => stilSetzen())
    mapRef.current = map
    readyCb.current?.(map)
    return () => {
      wheelEl.removeEventListener('wheel', onWheel)
      breit.removeEventListener('change', radSetzen)
      map.remove()
      mapRef.current = null; layerRef.current = null; messRef.current = null; avRef.current = null
      lineRef.current.clear(); lastFit.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Stadtwechsel: Karte auf das neue Zentrum springen (greift, solange keine Segmente
  // geladen sind — beim Laden passt fitBounds ohnehin neu ein).
  useEffect(() => {
    const map = mapRef.current
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
        suppress.current = true
        onLineClick(c.id, e.latlng.lat, e.latlng.lng)
      })
      const bernParts = c.bern && [
        c.bern.speed != null ? `Tempo ${c.bern.speed}` : null,
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
        (bernParts && bernParts.length ? `<br>${escapeHtml(attribution)}: ${escapeHtml(bernParts.join(' · '))}` : '') +
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
    // ÖV-Haltestellen als kleine Marker (Punkt + Name im Tooltip; klick-transparent).
    for (const st of stops ?? []) {
      L.marker([st.lat, st.lon], {
        interactive: true,
        icon: L.divIcon({
          className: '',
          iconSize: [11, 11], iconAnchor: [6, 6],
          html: '<div style="width:11px;height:11px;border-radius:999px;background:#7c3aed;' +
            'border:2px solid #fff;box-shadow:0 0 0 1px #7c3aed"></div>',
        }),
      }).bindTooltip(`ÖV-Haltestelle: ${escapeHtml(st.name)}`, { direction: 'top' }).addTo(lg)
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
  }, [cands, onLineClick, markers, stops, attribution, fitKey, obsStand, formen, onMarkerClick])

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
        {LUFTBILDER.includes(basis) && (
          <label className="namen" title="Strassennamen aus dem amtlichen Strassenverzeichnis über dem Luftbild (swisstopo, ab Zoomstufe 17)">
            <input type="checkbox" checked={namen} onChange={e => { setNamen(e.target.checked); basisWechseln(basis, e.target.checked) }} />
            Strassennamen
          </label>
        )}
      </div>
    </div>
  )
}
