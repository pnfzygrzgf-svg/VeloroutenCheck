import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
// Echter Leaflet-Ereignisweg; nur DOM-Zielbestimmung und Bildschirmkoordinaten sind ersetzt.
export function leaflet() {
 const document = { documentElement: { style: {} }, createElement: () => ({ style: {}, getContext: () => ({}) }), createElementNS: () => ({ createSVGRect() {} }) }
 const exports = {}
 runInNewContext(readFileSync(createRequire(import.meta.url).resolve('leaflet/dist/leaflet-src.js'), 'utf8'), {
  window: { document, screen: {}, devicePixelRatio: 1 }, document, navigator: { userAgent: '', platform: '' },
  exports, module: { exports }, console, setTimeout, clearTimeout,
 })
 return exports
}
