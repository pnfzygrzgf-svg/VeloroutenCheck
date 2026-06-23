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

// Kürzeste Distanz [m] eines Punktes zu einer Polylinie (z. B. Haltestelle ↔ Strassen-Segment).
export function distPointToLineM(p: LL, line: LL[]): number {
  if (line.length < 2) return Infinity
  return distToLine(p, line, KY * Math.cos((p.lat * Math.PI) / 180))
}
