// ── Radstreifen aus dem Luftbild: Hinweis je Seite (Bern, Zürich, Basel) ─────
//
// Gebündelte Snapshots `public/luftbild_<stadt>.json` (Bern: tools/luftbild_bern.py; Zürich und
// Basel seit 16.10.2026: tools/luftbild_stadt.py): Mittellinien der Radstreifen-Funde des Modells
// «remote_velo» (ETH Zürich) auf SWISSIMAGE, beide Modelle. Die Prüfung der Seiten unten stammt aus
// Bern; für Zürich und Basel gibt es keine handverifizierten Seiten zum Vergleich.
// Öffentlich — anders als der Markierungs-Snapshot (velostreifen.ts).
//
// Das Ergebnis ist NUR EIN HINWEIS (Nutzerentscheid 14.10.2026): Es setzt keine Führungsform
// und keine Breite, sondern die Maske zeigt «Radstreifen im Luftbild erkannt» und bietet das
// Übernehmen an (strecke.ts, luftbildHinweis/luftbildUebernehmen).
//
// Seite aus der Lage der Funde zur Strassenachse (geo.ts, naechsteLinieJeSeite). Gegen die
// handverifizierten Berner Seiten geprüft (14.10.2026): bei 50 einseitigen Radstreifen mit
// eindeutiger Markierungsseite 41-mal die richtige, nie die falsche Seite. Ein FEHLENDER Fund
// sagt dagegen wenig (Schatten, parkierte Autos) — darum zeigt die Maske nur Funde, keine
// «nicht erkannt»-Aussage.

import type { Cand } from './VeloMap'
import { densify, naechsteLinieJeSeite, bboxOfLL, bboxOverlap, type LL } from './geo'
import { holeJson } from './netz'

// Anteil der Länge [0…1], an dem rechts bzw. links der WAY-Richtung ein Fund liegt.
export interface LuftbildInfo { rechts: number; links: number }

const SAMPLE_M = 15
const OVERLAP_M = 12   // wie bei der Markierung: Achse ↔ Streifen
// Ab diesem Anteil der Länge gilt eine Seite als «Radstreifen erkannt». 30 % statt der 50 % der
// Markierung: die Funde haben Lücken (Schatten, Autos); bei 30 % fand der Test vom 14.10.2026
// 195 von 247 beidseitigen Radstreifen auf beiden Seiten, ohne eine falsche Seite.
export const LUFTBILD_SCHWELLE = 0.3

// Einmal laden je Datei. Fehlt sie → leer; ein 404 bleibt im Cache (wie velostreifen.ts).
const caches = new Map<string, Promise<LL[][]>>()
function ladeLuftbild(file: string): Promise<LL[][]> {
  let cache = caches.get(file)
  if (!cache) {
    cache = holeJson<{ linien?: number[][] }>(import.meta.env.BASE_URL + file, 60000)
      .then(d => (d.linien ?? []).filter(l => l.length === 4)
        .map(([lon1, lat1, lon2, lat2]) => [{ lat: lat1, lon: lon1 }, { lat: lat2, lon: lon2 }]))
      .catch((e: unknown) => { if (!/HTTP 404/.test(String(e))) caches.delete(file); return [] as LL[][] })
    caches.set(file, cache)
  }
  return cache
}

// Reine Rechnung (testbar): je Kandidat der Anteil mit Fund je Seite. Jeder Kandidat erhält
// einen Eintrag, auch 0/0 — «nachgesehen, nichts gefunden» ist etwas anderes als «nicht geprüft».
export function luftbildJeKandidat(cands: Cand[], linien: LL[][]): Map<number, LuftbildInfo> {
  const out = new Map<number, LuftbildInfo>()
  if (linien.length === 0) return out
  const boxes = linien.map(line => ({ line, bbox: bboxOfLL(line) }))
  const padDeg = (OVERLAP_M + 5) / 74000
  for (const c of cands) {
    const dense = densify(c.geom, SAMPLE_M)
    if (dense.length < 2) continue
    const cb = bboxOfLL(dense)
    const nahe = boxes.filter(b => bboxOverlap(cb, b.bbox, padDeg)).map(b => b.line)
    const r = naechsteLinieJeSeite(dense, nahe, OVERLAP_M)
    const anteil = (xs: number[]) => xs.filter(i => i >= 0).length / xs.length
    out.set(c.id, { rechts: anteil(r.rechts), links: anteil(r.links) })
  }
  return out
}

export async function enrichLuftbild(cands: Cand[], file = 'luftbild_bern.json'): Promise<Map<number, LuftbildInfo>> {
  const linien = await ladeLuftbild(file)
  if (cands.length === 0) return new Map()
  return luftbildJeKandidat(cands, linien)
}
