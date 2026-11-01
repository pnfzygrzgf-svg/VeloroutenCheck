// ── Netz-Helfer: Abrufe mit Timeout, ArcGIS-Abfragen, HTML-Maskierung ─────────
//
// Geteilt von allen Stadt-Adaptern, den Snapshot-Ladern und der Karte. Drei Dinge, die
// vorher je Modul einzeln (und nicht überall gleich) gelöst waren:
//   - Timeout ohne `AbortSignal.timeout` (fehlt in Safari/iOS vor 16),
//   - Fehler, die der Server mit HTTP 200 ausliefert (ArcGIS, Overpass),
//   - Fremdtext (OSM-Namen, Haltestellennamen), der als HTML in die Karte geht.

// Abbruch-Signal nach `ms` Millisekunden. Ersetzt `AbortSignal.timeout(ms)`: das gibt es in
// Safari/iOS erst ab 16 — auf älteren Geräten warf schon der Aufruf, und weil jede Quelle
// ihren Fehler einzeln schluckt, fiel die GANZE Anreicherung still aus (29.09.2026).
export function timeoutSignal(ms: number): AbortSignal {
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl.signal
}

// JSON holen; wirft bei HTTP-Fehler. Wer das Ergebnis cacht, cacht damit nie eine Fehlantwort:
// ein einmaliges 503 fror vorher «keine Zählstellen» bis zum Neuladen der Seite ein.
export async function holeJson<T>(url: string, ms: number, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: timeoutSignal(ms) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json() as T
}

// ── ArcGIS REST (Bern, Luzern) ────────────────────────────────────────────────
interface ArcgisAntwort<F> {
  features?: F[]
  error?: { code?: number; message?: string }
  exceededTransferLimit?: boolean
  properties?: { exceededTransferLimit?: boolean }
}
const ARCGIS_MAX_SEITEN = 20

// Layer-Abfrage als GeoJSON, VOLLSTÄNDIG oder gar nicht.
//   - ArcGIS meldet Fehler mit HTTP 200 und `{"error":{…}}`. Ohne Prüfung wurde daraus ein
//     gültiges leeres Ergebnis — beim Berner Verkehrsdaten-Layer hiess das: «kein Eintrag»,
//     also «DTV ≤ 2000 angenommen» für jede Strasse.
//   - Über `maxRecordCount` hinaus kappt der Server und setzt `exceededTransferLimit`. Die
//     fehlenden Seiten werden nachgeladen; gelingt das nicht, gilt die Abfrage als gescheitert
//     (ein unvollständiger Layer ist für «kein Eintrag» so wertlos wie gar keiner).
export async function arcgisGeojson<F>(
  url: string, params: Record<string, string>, ms = 15000,
): Promise<F[]> {
  const out: F[] = []
  for (let seite = 0; seite < ARCGIS_MAX_SEITEN; seite++) {
    const q = new URLSearchParams({
      ...params, f: 'geojson',
      ...(out.length ? { resultOffset: String(out.length) } : {}),
    })
    const data = await holeJson<ArcgisAntwort<F>>(`${url}?${q}`, ms)
    if (data.error) throw new Error(`ArcGIS ${data.error.code ?? ''} ${data.error.message ?? ''}`.trim())
    const f = data.features ?? []
    out.push(...f)
    const gekappt = data.exceededTransferLimit === true || data.properties?.exceededTransferLimit === true
    if (!gekappt) return out
    if (f.length === 0) break   // gekappt, aber nichts geliefert → nicht endlos weiterfragen
  }
  throw new Error('ArcGIS: Ergebnis unvollständig (Übertragungsgrenze)')
}

// ── HTML-Maskierung ───────────────────────────────────────────────────────────
// Leaflet setzt Tooltip-Text per innerHTML. Namen aus OSM und aus den Geodiensten sind
// Fremdtext, den jede Person ändern kann — ohne Maskierung liefe ein Name wie
// `<img src=x onerror=…>` beim Überfahren der Linie als Skript.
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string)
}
