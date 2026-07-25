// ── Geometrie-Helfer: Überlappung zweier Polylinien (geteilt von bern.ts + obs.ts) ──
//
// Externe Datensätze (Bern-Geodaten, OpenBikeSensor) segmentieren OSM-Strassen anders
// als der aktuelle OSM-Stand im Tool: andere OSM-Schnappschüsse, geteilte/neu nummerierte
// Ways, eigene Analyse-Abschnitte. Ein reiner way_id-Join greift dann nicht zuverlässig.
// Darum wird über die GEOMETRIE gematcht (schnappschuss-unabhängig).

export type LL = { lat: number; lon: number }

const KY = 111320  // m pro Breitengrad (planar-Näherung)

// Haversine-Distanz [m] Punkt–Punkt.
function havM(a: LL, b: LL): number {
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Polylinie verdichten: Zwischenpunkte einfügen, bis der Abstand ≤ stepM ist. So ist der
// Überlappungstest auch bei wenigen Stützpunkten (lange gerade Stücke) zuverlässig.
export function densify(geom: LL[], stepM: number): LL[] {
  if (geom.length < 2) return geom
  const out: LL[] = []
  for (let i = 1; i < geom.length; i++) {
    const a = geom[i - 1], b = geom[i]
    out.push(a)
    const n = Math.floor(havM(a, b) / stepM)
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1)
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t })
    }
  }
  out.push(geom[geom.length - 1])
  return out
}

// Distanz [m] Punkt → Strecke AB (lokal planar projiziert).
function projDistPointSeg(p: LL, a: LL, b: LL, kx: number): number {
  const px = p.lon * kx, py = p.lat * KY
  const ax = a.lon * kx, ay = a.lat * KY, bx = b.lon * kx, by = b.lat * KY
  const dx = bx - ax, dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
function distToLine(p: LL, line: LL[], kx: number): number {
  let best = Infinity
  for (let i = 1; i < line.length; i++) best = Math.min(best, projDistPointSeg(p, line[i - 1], line[i], kx))
  return best
}
// Anteil der Punkte aus `points`, die innerhalb maxDistM der Linie `line` liegen (0…1).
function fracNear(points: LL[], line: LL[], kx: number, maxDistM: number): number {
  if (line.length < 2 || points.length === 0) return 0
  let n = 0
  for (const p of points) if (distToLine(p, line, kx) <= maxDistM) n++
  return n / points.length
}

// Beidseitiger Überlappungs-Score zweier Polylinien (0…1):
//   - kurzes Segment auf langer Linie → Anteil der Segmentpunkte an der Linie hoch,
//   - langes Segment über viele kurze Teilstücke → Anteil der Teilstück-Punkte am Segment hoch.
// Score = max(beide Anteile). Eine bloss kreuzende Strasse ist in beiden Richtungen niedrig.
// `candGeom` sollte verdichtet (densify) übergeben werden.
export function overlapScore(candGeom: LL[], line: LL[], maxDistM: number): number {
  if (line.length < 2 || candGeom.length === 0) return 0
  const kx = KY * Math.cos((candGeom[0].lat * Math.PI) / 180)
  return Math.max(fracNear(candGeom, line, kx, maxDistM), fracNear(line, candGeom, kx, maxDistM))
}

// Richtung (Einheitsvektor, planar) der zu p nächstgelegenen Kante von `line`.
function dirAt(p: LL, line: LL[], kx: number): [number, number] {
  let best = Infinity, dx = 1, dy = 0
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i]
    const d = projDistPointSeg(p, a, b, kx)
    if (d < best) {
      best = d
      const vx = (b.lon - a.lon) * kx, vy = (b.lat - a.lat) * KY
      const n = Math.hypot(vx, vy) || 1
      dx = vx / n; dy = vy / n
    }
  }
  return [dx, dy]
}

const COS_MAX_ANGLE = Math.cos((30 * Math.PI) / 180)   // lokale Parallelität: ≤ 30° (Richtungssinn egal)

// MEHRHEITS-Zuordnung: welcher Linien-Kandidat deckt den grössten Teil des (verdichteten)
// Abschnitts ab? Jeder Abschnitts-Punkt stimmt für die nächstgelegene, LOKAL PARALLELE
// (≤ 30°) Linie ≤ maxDistM; der Index mit den meisten Stimmen gewinnt, sofern er
// ≥ minFraction der Punkte abdeckt (sonst -1). GERICHTET statt symmetrisch (overlapScore):
//   a) eine kurze Fremdlinie (z. B. DTV-Segment einer Nachbarstrasse), die selbst ganz am
//      Abschnitt liegt, aber nur einen Bruchteil des Abschnitts abdeckt, gewinnt nicht mehr;
//   b) quer einmündende Linien werden über die Parallelitäts-Prüfung verworfen.
// Restrisiko bleibt eine parallele Nachbarlinie < maxDistM, wenn die eigene Strasse keine
// Linie im Datensatz hat.
export function majorityLineIndex(candGeom: LL[], lines: LL[][], maxDistM: number, minFraction: number): number {
  if (candGeom.length === 0 || lines.length === 0) return -1
  const votes = new Array<number>(lines.length).fill(0)
  for (const i of naechsteLinieJePunkt(candGeom, lines, maxDistM)) if (i >= 0) votes[i]++
  let bi = -1, bv = 0
  for (let i = 0; i < lines.length; i++) if (votes[i] > bv) { bv = votes[i]; bi = i }
  return bi >= 0 && bv / candGeom.length >= minFraction ? bi : -1
}

// Je Abschnitts-Punkt der Index der nächstgelegenen, LOKAL PARALLELEN Linie ≤ maxDistM
// (sonst -1). Gemeinsamer Kern von majorityLineIndex und majorityValue.
function naechsteLinieJePunkt(candGeom: LL[], lines: LL[][], maxDistM: number): number[] {
  const kx = KY * Math.cos((candGeom[0].lat * Math.PI) / 180)
  return candGeom.map(p => {
    let bestD = maxDistM, bestI = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length < 2) continue
      const d = distToLine(p, lines[i], kx)
      if (d <= bestD) { bestD = d; bestI = i }
    }
    if (bestI < 0) return -1
    const [fx, fy] = dirAt(p, lines[bestI], kx)
    const [cx, cy] = dirAt(p, candGeom, kx)
    return Math.abs(fx * cx + fy * cy) < COS_MAX_ANGLE ? -1 : bestI   // quer → keine Stimme
  })
}

// MEHRHEIT NACH WERT statt nach Linie — für Attribute, die sich VIELE Features TEILEN.
//
// Warum es das braucht: majorityLineIndex verlangt, dass EIN EINZELNES Feature ≥ minFraction
// des Abschnitts abdeckt. Die Geoportal-Layer sind aber je AchsenABSCHNITT segmentiert und
// damit feiner als die OSM-Wege — gemessen an der Bremgartenstrasse (842 m): fünf
// Verkehrsdaten-Abschnitte, ALLE mit DTV 8350, Stimmen 29/24/19/16/12 % → keiner erreicht
// 50 %, der Abschnitt bliebe ohne DTV, obwohl er zu 100 % abgedeckt ist. Dasselbe beim
// Routentyp und beim Tempo. Hier wird deshalb je Punkt die nächste Linie bestimmt, die Stimme
// aber ihrem WERT gutgeschrieben; gewinnt der Wert, der die Mehrheit des Abschnitts abdeckt.
// (Bei echt unterschiedlichen Abschnittswerten — z. B. DTV 2470 vs. 2679 — entscheidet damit
// die Mehrheit, statt gar nichts zu liefern.)
//
// Werte werden über `String(wert)` gruppiert; `null`/`undefined` stimmen nicht mit.
export function majorityValue<T>(
  candGeom: LL[], lines: LL[][], values: (T | null | undefined)[],
  maxDistM: number, minFraction: number,
): T | undefined {
  if (candGeom.length === 0 || lines.length === 0) return undefined
  const votes = new Map<string, { n: number; wert: T }>()
  for (const i of naechsteLinieJePunkt(candGeom, lines, maxDistM)) {
    const v = i >= 0 ? values[i] : null
    if (v == null) continue
    const k = String(v)
    const e = votes.get(k)
    if (e) e.n++
    else votes.set(k, { n: 1, wert: v })
  }
  let best: { n: number; wert: T } | undefined
  for (const e of votes.values()) if (!best || e.n > best.n) best = e
  return best && best.n / candGeom.length >= minFraction ? best.wert : undefined
}

// Kürzeste Distanz [m] eines Punktes zu einer Polylinie (z. B. Haltestelle ↔ Strassen-Segment).
export function distPointToLineM(p: LL, line: LL[]): number {
  if (line.length < 2) return Infinity
  return distToLine(p, line, KY * Math.cos((p.lat * Math.PI) / 180))
}

// Bounding-Box einer Polylinie (für den billigen Vorfilter vor dem teuren overlapScore).
export type BboxLL = { s: number; n: number; w: number; e: number }
export function bboxOfLL(line: LL[]): BboxLL {
  let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity
  for (const p of line) {
    if (p.lat < s) s = p.lat; if (p.lat > n) n = p.lat
    if (p.lon < w) w = p.lon; if (p.lon > e) e = p.lon
  }
  return { s, n, w, e }
}
// Überlappen sich zwei Bboxen (mit Puffer padDeg in Grad)?
export function bboxOverlap(a: BboxLL, b: BboxLL, padDeg: number): boolean {
  return a.s - padDeg <= b.n && a.n + padDeg >= b.s && a.w - padDeg <= b.e && a.e + padDeg >= b.w
}
