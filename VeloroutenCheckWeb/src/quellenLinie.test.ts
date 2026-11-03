import { expect, it, vi } from 'vitest'
import { zeichneQuellenLinie } from './quellenLinie'
import { EBENEN, type EbenenObjekt } from './ebenen'
function zeichnen(id: string) {
 const tooltip = vi.fn(), optionen: Record<string, unknown>[] = []
 const polyline = vi.fn((_punkte, opt) => { optionen.push(opt); return { addTo() { return this }, bindTooltip: tooltip } })
 const objekt: EbenenObjekt = { id: '1', klasse: 'velo', text: 'Weg <img src=x> · Datenstand 2026 · Originalattribute: velo=1' }
 zeichneQuellenLinie(polyline as never, {} as never, [[[47.3, 8.5], [47.4, 8.6]]], EBENEN.find(e => e.id === id)!, objekt, '#123456')
 return { tooltip, optionen }
}
it('E6-Netzlinie besitzt einen echten Leaflet-Tooltip und eine interaktive Kontur', () => {
 const r = zeichnen('e6.zh.netz')
 expect(r.optionen[0].interactive).toBe(false)
 expect(r.optionen[1].interactive).toBe(true)
 expect(r.tooltip).toHaveBeenCalledWith(expect.stringContaining('Originalattribute: velo=1'), expect.objectContaining({ sticky: true }))
 expect(r.tooltip.mock.calls[0][0]).toContain('&lt;img src=x&gt;')
 expect(r.tooltip.mock.calls[0][0]).not.toContain('<img')
})
it('gewöhnliche Quellenlinien bleiben nicht interaktiv', () => {
 const r = zeichnen('tempo')
 expect(r.optionen.every(o => o.interactive === false)).toBe(true)
 expect(r.tooltip).not.toHaveBeenCalled()
})
