import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { ObsStats } from './obs'
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
  veloGegenverkehr?: boolean              // Einbahn, Velo in der Gegenrichtung erlaubt (oneway:bicycle=no)
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
    oevQuelle?: 'amtlich' | 'osm'         // Herkunft der ÖV-Erkennung (Bern: amtlich/Geoportal; Zürich: OSM)
  }
  obs?: ObsStats                          // OpenBikeSensor-Überholabstände (Zusatzinfo, siehe obs.ts)
}

// ÖV-Haltestelle (Punkt) für die Karten-Marker.
export interface Stop { lat: number; lon: number; name: string; bpuic?: string }

// Farbe je Führungsform (Linien auf der Karte)
export const ISTCOLOR: Record<string, string> = {
  'Mischverkehr': '#9ca3af',
  'Radstreifen': '#eab308',
  'Radweg strassenbegleitend / Geschützter Radstreifen': '#4d7c0f',
  'Radweg abgesetzt': '#16a34a',
  'Umweltspur': '#0891b2',
  'Velostrasse': '#2563eb',
  'Kombinierter Fuss-/Radweg': '#0d9488',
  'Fussweg Velo gestattet': '#ea580c',
  'Einbahn Velogegenverkehr ohne Markierung': '#78716c',
  'Einbahn Velogegenverkehr mit Markierung': '#d97706',
  'Einbahn Velogegenverkehr mit baulicher Trennung': '#15803d',
}

// Nummern-Marker eines Abschnitts auf der Karte (num = Abschnitts-Nummer).
// Ab dieser Fensterbreite zweispaltig (Karte | Panel); muss mit der Media-Query in index.css
// übereinstimmen. «screen»: Drucken bleibt immer einspaltig.
export const BREIT_MQ = 'screen and (min-width: 1100px)'

// Farben der AV-Flächen und Parkfelder: farben.ts (ohne Leaflet, auch im Bericht verwendet)
export { AV_FARBEN, PARK_FARBE, PARKVERBOT_FARBE } from './farben'
import { AV_FARBEN, AV_DECKKRAFT, PARK_FARBE, PARKVERBOT_FARBE } from './farben'
export interface AvAnzeige {
  flaechen: { art: string; ringe: { lat: number; lon: number }[][] }[]
  park?: { verbot: boolean; ringe: { lat: number; lon: number }[][] }[]
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
}
const ORTHO = 'Orthofoto (swisstopo)'

export function VeloMap({ cands, onLineClick, onMapClick, onReady, markers, highlightIds, stops,
                          attribution = 'Geoinformation Stadt Bern', center = [46.948, 7.447], fitKey = 0,
                          teilModus = false, orthofoto = false, messung = null, av = null, obsStand }: {
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
  messung?: MessAnzeige | null            // Breitenmessung: Kanten, Punkte, Messlinie
  av?: AvAnzeige | null                   // AV-Flächen eines Abschnitts (Aufteilung planen)
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const messRef = useRef<L.LayerGroup | null>(null)                 // eigene Ebene der Breitenmessung
  const avRef = useRef<L.LayerGroup | null>(null)                   // AV-Flächen (Planung)
  const basisRef = useRef<Record<string, L.TileLayer>>({})          // Hintergründe nach Name
  const aktiveBasis = useRef(ORTHO)                                 // gerade gezeigter Hintergrund

  const lineRef = useRef<Map<number, L.Polyline>>(new Map())  // Cand-ID → Linie (für Highlight)
  const lastFit = useRef(0)            // zuletzt umgesetzter fitKey
  const suppress = useRef(false)        // Klick auf Linie soll keinen Karten-Klick auslösen
  const clickCb = useRef(onMapClick)    // immer den aktuellen Callback aufrufen
  clickCb.current = onMapClick
  const readyCb = useRef(onReady)       // dito (onReady wird inline übergeben → neue Referenz je Render)
  readyCb.current = onReady

  // Karte einmalig initialisieren (Hintergrund Orthofoto); nur beim Mount — Callbacks laufen über
  // Refs, das Zentrum bei Stadtwechsel über den Folge-Effekt. Cleanup beim Unmount (z. B.
  // Rechner → Startseite), sonst bleibt je Wechsel eine verwaiste Leaflet-Instanz zurück (Leck).
  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current).setView(center, 13)  // Anfangs-Mitte je Stadt
    // Drei Hintergründe zur Wahl: CyclOSM (Velo-Infrastruktur betont), Orthofoto (Führungsform
    // am Luftbild prüfbar — OSM-Tags sagen nicht immer, was gebaut ist), Hell (ruhiger Kontrast
    // für die Linienfarben). swisstopo deckt alle vier Städte ab. Standard ist seit 16.10.2026 das
    // Orthofoto (Nutzerwunsch), vorher CyclOSM.
    const basemaps: Record<string, L.TileLayer> = {
      'CyclOSM': L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap-Mitwirkende · Stil: CyclOSM',
      }),
      // maxZoom 21 über der nativen Stufe 20 (10 cm): eine Stufe Vergrösserung zum genauen Klicken
      // beim Messen der Breite.
      [ORTHO]: L.tileLayer(
        'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg',
        { maxZoom: 21, maxNativeZoom: 20, attribution: '© swisstopo' }),
      'Hell (Carto)': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20, attribution: '© OpenStreetMap-Mitwirkende · © CARTO',
      }),
    }
    basemaps[ORTHO].addTo(map)
    L.control.layers(basemaps, undefined, { position: 'topright' }).addTo(map)
    basisRef.current = basemaps
    // Die Ebenen-Auswahl meldet auch programmatische Wechsel (Leaflet: baselayerchange).
    map.on('baselayerchange', (e: L.LayersControlEvent) => { aktiveBasis.current = e.name })
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
    // Klick auf freie Karte (nicht auf eine Linie) → Segment an der Stelle hinzufügen.
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (suppress.current) { suppress.current = false; return }
      clickCb.current?.(e.latlng.lat, e.latlng.lng)
    })
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
    lineRef.current.clear()
    const bounds = L.latLngBounds([])
    for (const c of cands) {
      const pts = c.geom.map(p => [p.lat, p.lon] as [number, number])
      if (pts.length < 2) continue
      // Sichtbare Linie = nur Anzeige; Klicks laufen über die breite Trefflinie darunter.
      const line = L.polyline(pts, {
        color: c.selected ? (ISTCOLOR[c.ist] || '#0f766e') : '#cbd5e1',
        weight: c.selected ? 6 : 3,
        opacity: c.selected ? 0.9 : 0.6,
        interactive: false,
      })
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
        ` · ${escapeHtml(c.ist)}${c.selected ? '' : ' (abgewählt)'}` +
        (bernParts && bernParts.length ? `<br>${escapeHtml(attribution)}: ${escapeHtml(bernParts.join(' · '))}` : '') +
        obsPart,
        { sticky: true })
      hit.addTo(lg)         // unten (Trefffläche)
      line.addTo(lg)        // sichtbare Linie darüber
      lineRef.current.set(c.id, line)
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
      L.marker([m.lat, m.lon], {
        interactive: false,
        icon: L.divIcon({
          className: '',
          iconSize: [22, 22], iconAnchor: [11, 11],
          html: `<div style="position:relative;width:22px;height:22px">${pfeil}` +
            `<div style="position:absolute;left:0;top:0;width:22px;height:22px;border-radius:999px;background:#1e293b;` +
            `color:#fff;font:700 12px/22px system-ui,sans-serif;text-align:center;` +
            `box-shadow:0 0 0 2px #fff">${m.num}</div></div>`,
        }),
      }).addTo(lg)
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
    // Einpassen nur auf Anforderung (fitKey, gesetzt von «Strasse laden»). Bis zum 29.09.2026 passte
    // jede Änderung der Segment-Menge neu ein — auch jeder Klick-Zusatz: die Karte sprang, und das
    // erste kurze Segment zoomte sie auf die höchste Stufe. Klick und «Kartenausschnitt laden»
    // geschehen im Bild, das man gerade ansieht; dort bleibt die Karte stehen.
    if (fitKey !== lastFit.current && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 })
      lastFit.current = fitKey
    }
  }, [cands, onLineClick, markers, stops, attribution, fitKey, obsStand])

  // Teil-Modus: Fadenkreuz über den Linien (CSS-Klasse am Karten-Container, index.css).
  useEffect(() => {
    mapRef.current?.getContainer().classList.toggle('vrc-teilmodus', teilModus)
  }, [teilModus])

  // Orthofoto einschalten (Breitenmessung). Es bleibt danach eingeschaltet: Zurück zu CyclOSM
  // (höchstens Stufe 19) hätte die Karte nach einer Messung auf Stufe 20/21 herausgezoomt
  // (16.10.2026). Den Hintergrund wechselt man oben rechts.
  useEffect(() => {
    const map = mapRef.current, b = basisRef.current
    if (!map || !b[ORTHO] || !orthofoto || aktiveBasis.current === ORTHO) return
    b[aktiveBasis.current]?.remove()
    b[ORTHO].addTo(map)
  }, [orthofoto])

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
      const farbe = f.verbot ? PARKVERBOT_FARBE : PARK_FARBE
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
  }, [messung])

  // Highlight des gehoverten Abschnitts: betroffene Linien dicker + nach vorn, ohne Neuzeichnen.
  // Nur gewählte Segmente anfassen (abgewählte behalten ihren dünnen, grauen Stil).
  useEffect(() => {
    const hl = highlightIds
    const selected = new Set(cands.filter(c => c.selected).map(c => c.id))
    for (const [id, line] of lineRef.current) {
      if (!selected.has(id)) continue
      const on = !!hl && hl.has(id)
      line.setStyle({ weight: on ? 10 : 6, opacity: on ? 1 : 0.9 })
      if (on) line.bringToFront()
    }
  }, [highlightIds, cands])

  return (
    // Höhe/Rahmen über die Klasse (index.css): im Breitbild-Layout füllt die Karte die linke Spalte.
    <div ref={elRef} className="vrc-velomap" />
  )
}
