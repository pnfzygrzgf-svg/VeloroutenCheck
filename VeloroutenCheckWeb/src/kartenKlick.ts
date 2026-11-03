import type { LeafletMouseEvent } from 'leaflet'
interface Unterdrueckung { current: boolean }
export function kartenKlick(e: LeafletMouseEvent, unterdruecken: Unterdrueckung, weiter: (lat: number, lon: number) => void) {
  if (unterdruecken.current) { unterdruecken.current = false; return }
  weiter(e.latlng.lat, e.latlng.lng)
}
export function segmentKlick(id: number, e: LeafletMouseEvent, unterdruecken: Unterdrueckung,
  weiter: (id: number, lat: number, lon: number) => void) {
  unterdruecken.current = true
  weiter(id, e.latlng.lat, e.latlng.lng)
}
