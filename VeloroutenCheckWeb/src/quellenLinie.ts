import type { LayerGroup, polyline } from 'leaflet'
import { escapeHtml } from './netz'
import type { EbeneDef, EbenenObjekt } from './ebenen'

/** Quellenlinien behalten ihren dunklen Rand und liegen unter den auswählbaren Segmenten. */
export function zeichneQuellenLinie(zeichnen: typeof polyline, ziel: LayerGroup, punkte: [number, number][][],
  ebene: EbeneDef, objekt: EbenenObjekt, farbe: string): void {
  zeichnen(punkte, { pane: 'ebenen', color: '#111827', weight: 7, opacity: 0.75, interactive: false }).addTo(ziel)
  const kontext = ebene.id.startsWith('e6.')
  const linie = zeichnen(punkte, { pane: 'ebenen', color: farbe, weight: 4, opacity: 0.95, interactive: kontext, bubblingMouseEvents: true,
    ...(objekt.gestrichelt ? { dashArray: '6 6' } : {}) }).addTo(ziel)
  if (kontext) linie.bindTooltip(escapeHtml(objekt.text), { direction: 'top', sticky: true })
}
