import { expect, it, vi } from 'vitest'
import { leaflet } from '../scripts/testhilfe/leaflet.mjs'
import { kartenKlick, segmentKlick } from './kartenKlick'
import { zeichneQuellenLinie } from './quellenLinie'
import { EBENEN } from './ebenen'
it('Klick auf E6 erreicht die Karte; darüberliegendes Segment löst nur die Segmentauswahl aus', () => {
 const L = leaflet(), gruppe = L.layerGroup(), auswahl = vi.fn(), hinzufuegen = vi.fn(), unterdruecken = { current: false }
 zeichneQuellenLinie(L.polyline, gruppe, [[[47.3, 8.5], [47.4, 8.6]]], EBENEN.find(e => e.id === 'e6.zh.netz')!, { id: 'netz', klasse: 'velo', text: 'Netzhinweis' }, '#123456')
 const netz = gruppe.getLayers()[1]
 const segment = L.polyline([[47.3, 8.5], [47.4, 8.6]])
 segment.on('click', (e: import('leaflet').LeafletMouseEvent) => segmentKlick(42, e, unterdruecken, auswahl))
 const map = Object.create(L.Map.prototype)
 map.mouseEventToContainerPoint = () => L.point(0, 0)
 map.containerPointToLayerPoint = () => L.point(0, 0)
 map.layerPointToLatLng = () => L.latLng(47.35, 8.55)
 map.on('click', (e: import('leaflet').LeafletMouseEvent) => kartenKlick(e, unterdruecken, hinzufuegen))
 map._findEventTargets = () => [netz, map]
 map._fireDOMEvent({ type: 'click' }, 'click')
 expect(hinzufuegen).toHaveBeenCalledWith(47.35, 8.55)
 expect(auswahl).not.toHaveBeenCalled()
 hinzufuegen.mockClear()
 // DOM liefert beim überlagernden Segment den oberen Treffer (overlayPane über ebenen).
 expect(segment.options.pane).toBe('overlayPane')
 expect((netz as import('leaflet').Polyline).options.pane).toBe('ebenen')
 map._findEventTargets = () => [segment, map]
 map._fireDOMEvent({ type: 'click' }, 'click')
 expect(auswahl).toHaveBeenCalledWith(42, 47.35, 8.55)
 expect(hinzufuegen).not.toHaveBeenCalled()
})
