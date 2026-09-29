// ── Velostreifen-Anreicherung aus einem lokalen Markierungs-Snapshot ─────────
//
// Optionaler, rein LOKALER Snapshot (`public/velostreifen_bern.json`): wo ein
// OSM-Segment auf einem Velostreifen liegt, werden Ist-Führungsform „Radstreifen"
// und die Breite vorbefüllt (Herkunft-Chip „Markierung").
//
// Der Snapshot ist NICHT Teil des öffentlichen Builds (gitignored). Fehlt die
// Datei (z. B. auf der veröffentlichten Seite), liefert das Modul einfach eine
// leere Map — kein Fehler, keine Anreicherung.
//
// Zuordnung wie beim OpenBikeSensor (obs.ts): über GEOMETRIE-Überlappung
// (geo.ts), nicht über IDs; mit Bbox-Vorfilter für die Performance.

import type { Cand } from './VeloMap'
import { densify, naechsteLinieJePunkt, bboxOfLL, bboxOverlap, type LL } from './geo'
import { holeJson } from './netz'

export interface VeloInfo { breite?: number }   // aus der Markierung gemessene Streifenbreite [m]

const SAMPLE_M = 15      // Verdichtung der OSM-Geometrie
const OVERLAP_M = 12     // Punkt gilt als „am Streifen", wenn ≤ 12 m entfernt (Achse ↔ Fahrbahnrand)
const MIN_FRACTION = 0.5 // ≥ 50 % DES ABSCHNITTS liegen an einem Streifen → Zuordnung

interface VeloFeat { line: LL[]; breite?: number }

interface RawFeature {
  geometry?: { type?: string; coordinates?: number[][] }
  properties?: { breite_m?: number | null }
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Einmaliges Laden + Parsen je Datei. Fehlt die Datei → leer (kein Abbruch).
const caches = new Map<string, Promise<VeloFeat[]>>()
function loadVelostreifen(file: string): Promise<VeloFeat[]> {
  let cache = caches.get(file)
  if (!cache) {
    cache = holeJson<{ features?: RawFeature[] }>(import.meta.env.BASE_URL + file, 60000)
      .then(data => (data.features ?? []).flatMap(f => {
        const raw = f.geometry?.type === 'LineString' ? (f.geometry.coordinates ?? []) : []
        const line = raw.map(([lon, lat]) => ({ lat, lon }))
        if (line.length < 2) return []
        const b = f.properties?.breite_m
        return [{ line, breite: typeof b === 'number' ? b : undefined }]
      }))
      // Netzfehler → leer, nicht eingefroren. Ein 404 dagegen BLEIBT im Cache: die Datei fehlt im
      // öffentlichen Build dauerhaft, und ohne Merken fragte jeder Ladevorgang erneut danach.
      .catch((e: unknown) => { if (!/HTTP 404/.test(String(e))) caches.delete(file); return [] as VeloFeat[] })
    caches.set(file, cache)
  }
  return cache
}

// Kandidaten → Map cand.id → VeloInfo. Ein Kandidat gilt als Radstreifen, wenn mindestens
// MIN_FRACTION SEINER LÄNGE an Streifen-Linien liegt; Breite = Median der beteiligten Striche.
//
// GEMESSEN WIRD AM ABSCHNITT, nicht am Strich (29.09.2026). Der Snapshot besteht fast ganz aus
// einzelnen Markierungsstrichen (14'507 von 14'516 kürzer als 15 m, Median 2,9 m). Der frühere
// beidseitige overlapScore nahm das Maximum beider Richtungen — und ein 2,9-m-Strich liegt
// IMMER ganz am Abschnitt: Score 1,0. Ein einziger Strich machte so einen 500-m-Abschnitt zum
// Radstreifen, samt Breite. Jetzt stimmt jeder Punkt des Abschnitts für den nächsten parallelen
// Strich; gezählt wird, welcher Anteil des Abschnitts überhaupt einen Strich neben sich hat.
export async function enrichVelostreifen(
  cands: Cand[], file = 'velostreifen_bern.json',
): Promise<Map<number, VeloInfo>> {
  const feats = await loadVelostreifen(file)
  if (cands.length === 0 || feats.length === 0) return new Map()
  // Bbox-Vorfilter (Performance): nur Features im Umgriff der Kandidaten prüfen.
  // Schleife statt Spread: Math.min(...lats) sprengt bei sehr vielen Punkten den Stack.
  let s0 = Infinity, n0 = -Infinity, w0 = Infinity, e0 = -Infinity
  for (const c of cands) for (const p of c.geom) {
    if (p.lat < s0) s0 = p.lat; if (p.lat > n0) n0 = p.lat
    if (p.lon < w0) w0 = p.lon; if (p.lon > e0) e0 = p.lon
  }
  const pad = 0.003
  const s = s0 - pad, n = n0 + pad, w = w0 - pad, e = e0 + pad
  const inBox = feats.filter(f => f.line.some(p => p.lat >= s && p.lat <= n && p.lon >= w && p.lon <= e))
  if (inBox.length === 0) return new Map()
  const boxes = inBox.map(f => ({ f, bbox: bboxOfLL(f.line) }))
  const padDeg = (OVERLAP_M + 5) / 74000

  const out = new Map<number, VeloInfo>()
  for (const c of cands) {
    const dense = densify(c.geom, SAMPLE_M)
    const cbox = bboxOfLL(dense)
    const nahe = boxes.filter(({ bbox }) => bboxOverlap(cbox, bbox, padDeg)).map(({ f }) => f)
    if (nahe.length === 0) continue
    const stimmen = naechsteLinieJePunkt(dense, nahe.map(f => f.line), OVERLAP_M)
    const beteiligt = new Set(stimmen.filter(i => i >= 0))
    if (beteiligt.size === 0 || stimmen.filter(i => i >= 0).length / dense.length < MIN_FRACTION) continue
    const breiten = [...beteiligt].map(i => nahe[i].breite).filter((b): b is number => b != null)
    out.set(c.id, breiten.length ? { breite: median(breiten) } : {})
  }
  return out
}
