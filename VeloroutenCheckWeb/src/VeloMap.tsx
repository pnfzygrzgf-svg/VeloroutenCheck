import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { ObsStats } from './obs'

// Ein OSM-Rohsegment (Kandidat) — auf der Karte anklickbar, vor dem Zusammenfassen.
export interface Cand {
  id: number                              // OSM-Way-ID
  ist: string                             // abgeleitete Ist-Führungsform (für die Farbe)
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
    routentyp?: 'Velohauptroute' | 'Veloroute'   // Veloroutennetz Masterplan
    strassentyp?: 'verkehrsorientiert' | 'siedlungsorientiert'  // nur Basel (Strassen-/Wege-Datensatz)
    velostrasse?: boolean                 // Treffer im Velostrassen-Layer
    radstreifen?: { breite?: number }     // Treffer im lokalen Markierungs-Snapshot (Velostreifen, siehe velostreifen.ts)
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
export interface SectionMarker { num: number; lat: number; lon: number }

export function VeloMap({ cands, onToggle, onMapClick, onReady, markers, highlightIds, stops,
                          attribution = 'Geoinformation Stadt Bern', center = [46.948, 7.447] }: {
  cands: Cand[]
  onToggle: (id: number) => void
  onMapClick?: (lat: number, lon: number) => void
  onReady?: (map: L.Map) => void
  markers?: SectionMarker[]               // nummerierte Abschnitts-Marker
  highlightIds?: Set<number>              // Cand-IDs des gehoverten Abschnitts → hervorheben
  stops?: Stop[]                          // ÖV-Haltestellen im geladenen Bereich (Marker)
  attribution?: string                    // Quellenangabe der amtlichen Anreicherung (stadtabhängig)
  center?: [number, number]               // Anfangs-Kartenmitte (stadtabhängig)
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const lineRef = useRef<Map<number, L.Polyline>>(new Map())  // Cand-ID → Linie (für Highlight)
  const lastFit = useRef<string>('')   // Signatur der Kandidaten-IDs → nur bei Laden neu einpassen
  const suppress = useRef(false)        // Klick auf Linie soll keinen Karten-Klick auslösen
  const clickCb = useRef(onMapClick)    // immer den aktuellen Callback aufrufen
  clickCb.current = onMapClick
  const readyCb = useRef(onReady)       // dito (onReady wird inline übergeben → neue Referenz je Render)
  readyCb.current = onReady

  // Karte einmalig initialisieren (CyclOSM-Hintergrund); nur beim Mount — Callbacks laufen über
  // Refs, das Zentrum bei Stadtwechsel über den Folge-Effekt. Cleanup beim Unmount (z. B.
  // Rechner → Startseite), sonst bleibt je Wechsel eine verwaiste Leaflet-Instanz zurück (Leck).
  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current).setView(center, 13)  // Anfangs-Mitte je Stadt
    L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap-Mitwirkende · Stil: CyclOSM',
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    // Klick auf freie Karte (nicht auf eine Linie) → Segment an der Stelle hinzufügen.
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (suppress.current) { suppress.current = false; return }
      clickCb.current?.(e.latlng.lat, e.latlng.lng)
    })
    mapRef.current = map
    readyCb.current?.(map)
    return () => {
      map.remove()
      mapRef.current = null; layerRef.current = null; lineRef.current.clear(); lastFit.current = ''
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
      const hit = L.polyline(pts, { color: '#000', weight: 16, opacity: 0 })
      hit.on('click', () => { suppress.current = true; onToggle(c.id) })
      const bernParts = c.bern && [
        c.bern.speed != null ? `Tempo ${c.bern.speed}` : null,
        c.bern.dtv != null ? `DTV ≈ ${c.bern.dtv}` : null,
        c.bern.routentyp ?? null,
      ].filter(Boolean)
      const obsPart = c.obs && c.obs.count > 0
        ? `<br>OpenBikeSensor: Median ${c.obs.median.toFixed(2)} m (n ${c.obs.count})`
        : (c.obs && c.obs.usage > 0
            ? `<br>OpenBikeSensor: befahren (n ${c.obs.usage}), keine Überholmessung`
            : '')
      hit.bindTooltip(
        `${c.name} · ${Math.round(c.len)} m · ${c.ist}${c.selected ? '' : ' (abgewählt)'}` +
        (bernParts && bernParts.length ? `<br>${attribution}: ${bernParts.join(' · ')}` : '') +
        obsPart,
        { sticky: true })
      hit.addTo(lg)         // unten (Trefffläche)
      line.addTo(lg)        // sichtbare Linie darüber
      lineRef.current.set(c.id, line)
      pts.forEach(p => bounds.extend(p))
    }
    // Nummern-Marker je Abschnitt (dunkler Kreis, weisse Zahl; klick-transparent).
    for (const m of markers ?? []) {
      L.marker([m.lat, m.lon], {
        interactive: false,
        icon: L.divIcon({
          className: '',
          iconSize: [22, 22], iconAnchor: [11, 11],
          html: `<div style="width:22px;height:22px;border-radius:999px;background:#1e293b;` +
            `color:#fff;font:700 12px/22px system-ui,sans-serif;text-align:center;` +
            `box-shadow:0 0 0 2px #fff">${m.num}</div>`,
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
      }).bindTooltip(`ÖV-Haltestelle: ${st.name}`, { direction: 'top' }).addTo(lg)
    }
    // Nur einpassen, wenn sich die Menge der Segmente geändert hat (nicht bei jedem Klick).
    const sig = cands.map(c => c.id).sort((a, b) => a - b).join(',')
    if (sig !== lastFit.current && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24] })
      lastFit.current = sig
    }
  }, [cands, onToggle, markers, stops, attribution])

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
    <div ref={elRef}
         style={{ height: 'min(380px, 60vh)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-subtle)' }} />
  )
}
