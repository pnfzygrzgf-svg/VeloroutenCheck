// ── Fussverkehrsnetz aus dem Richtplan Fussverkehr Stadt Bern (Vorgabe der Trottoirs) ──
//
// Geoportal-Produkt «Richtplan_Fussverkehr» (map.bern.ch, ArcGIS REST, Layer 4
// «Basisnetz_Fussweg_bestehend»). Geprüft am 16.10.2026: Der Dienst führt nur das Basisnetz als
// Linien auf der Strassenachse (nicht je Seite), dazu Massnahmen und Wanderwege. «Publikumsintensiv»
// und das Feinverteilernetz stehen nicht als Daten darin. Darum belegt die App vor: Basisnetz, wenn
// die Linie auf mindestens BASIS_ANTEIL der Länge des Abschnitts bis BASIS_MAX_M neben der Achse
// liegt (in Bins von BIN_M), sonst Feinverteilernetz. Publikumsintensiv bleibt eine Wahl von Hand.

import type { P } from './lv95'
import { holeJson } from './netz'
import { verdichten } from './parkierung'
import type { FussNetz } from './aufteilung'

export const FUSSNETZ_DIENST = 'https://map.bern.ch/arcgis/rest/services/Geoportal/Richtplan_Fussverkehr/MapServer/4/query'
export const FUSSNETZ_GEOPORTAL = 'Geodaten Stadt Bern, Richtplan Fussverkehr (Basisnetz Fussweg bestehend)'
const BASIS_MAX_M = 6, BASIS_ANTEIL = 0.5, BIN_M = 10

// Anteil der Länge [0…1] aller Achsen, auf dem ein Punkt höchstens maxM neben der Achse liegt:
// jeder Punkt wird rechtwinklig auf das nächste Achsstück projiziert und markiert dort seinen Bin.
export function anteilNahe(achsen: P[][], punkte: P[], maxM = BASIS_MAX_M): number {
  let bins = 0, treffer = 0
  for (const achse of achsen) {
    for (let i = 1; i < achse.length; i++) {
      const a = achse[i - 1], b = achse[i], de = b[0] - a[0], dn = b[1] - a[1], l = Math.hypot(de, dn)
      if (l < 0.01) continue
      const n = Math.max(1, Math.round(l / BIN_M)), belegt = new Array<boolean>(n).fill(false)
      for (const p of punkte) {
        const s = ((p[0] - a[0]) * de + (p[1] - a[1]) * dn) / l          // Lage entlang des Stücks [m]
        if (s < 0 || s > l) continue
        const quer = Math.abs((p[1] - a[1]) * de - (p[0] - a[0]) * dn) / l
        if (quer <= maxM) belegt[Math.min(n - 1, Math.floor(s / l * n))] = true
      }
      bins += n; treffer += belegt.filter(Boolean).length
    }
  }
  return bins ? treffer / bins : 0
}

export const netzAusAnteil = (anteil: number): FussNetz => (anteil >= BASIS_ANTEIL ? 'basis' : 'fein')

// Netz für die Achsen eines Abschnitts (LV95) aus dem Geoportal.
export async function ladeFussnetz(achsen: P[][]): Promise<{ netz: FussNetz; anteil: number }> {
  const pts = achsen.flat()
  const r = 20
  const env = [Math.min(...pts.map(p => p[0])) - r, Math.min(...pts.map(p => p[1])) - r,
    Math.max(...pts.map(p => p[0])) + r, Math.max(...pts.map(p => p[1])) + r].map(v => v.toFixed(1)).join(',')
  const q = new URLSearchParams({ geometry: env, geometryType: 'esriGeometryEnvelope', inSR: '2056', outSR: '2056',
    spatialRel: 'esriSpatialRelIntersects', outFields: 'Layer', returnGeometry: 'true', f: 'json' })
  const j = await holeJson<{ features?: { geometry?: { paths?: number[][][] } }[] }>(`${FUSSNETZ_DIENST}?${q}`, 30000)
  const punkte = (j.features ?? []).flatMap(f => (f.geometry?.paths ?? [])
    .flatMap(path => verdichten(path.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1])).map(p => [p[0], p[1]] as P))))
  const anteil = anteilNahe(achsen, punkte)
  return { netz: netzAusAnteil(anteil), anteil }
}
