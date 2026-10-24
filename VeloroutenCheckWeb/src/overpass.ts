// ── Overpass-Anbindung (seit 24.10.2026, eine für die ganze App) ─────────────────────────────────────────────────
//
// Vorher gab es zwei: osm.ts (Strassen, Wartehallen; mit Wiederholung bei 429/5xx) und cityShared.ts (ÖV-Haltestellen
// und Tram für Zürich, Basel, Luzern; ein Versuch je Server). Befund 24.10.2026 (Feierabendstrasse Basel, Sälistrasse
// Luzern: «Nicht erreichbar: ÖV-Haltestellen und Tram»): Overpass weist GLEICHZEITIGE IDENTISCHE Abfragen derselben
// Adresse ab («Dispatcher_Client::request_read_and_idx::duplicate_query»), und zwar mit HTTP 200 und einer HTML-Seite
// statt JSON. Beim Hinzufügen oder Teilen eines Segments lief dieselbe Haltestellen-Abfrage mehrfach zugleich; die
// Doubletten scheiterten, und weil die Ausweich-Server zu der Zeit gestört waren (502 bzw. keine Antwort), blieb es bei
// der Fehlermeldung. Die Probe im Browser zeigte genauer: overpass.osm.ch weist DIESELBE Abfrage derselben Adresse innert
// rund 10 bis 15 s ab, auch nacheinander; eine leicht andere geht sofort durch. Darum:
//   0. Alle Abfragen laufen nacheinander (Warteschlange); sie dauern 0,1 bis 0,4 s.
//   1. Gleiche Abfragen, die noch laufen oder warten, teilen sich eine Antwort (laufend), und ein Ergebnis wird
//      ERGEBNIS_MS lang wiederverwendet (Teilen: beide Teile fragen denselben Ausschnitt ab).
//   2. «duplicate_query»: sofort nochmals, mit einem um n Sekunden höheren Zeitlimit ([timeout:N]); das macht sie für den
//      Server zu einer anderen Abfrage und ändert am Ergebnis nichts. (Kommentare und Leerzeichen reichen nicht, der Server
//      vergleicht ohne sie; Probe 24.10.2026.)
//   3. Andere Antworten ohne JSON oder mit abgebrochenem Ergebnis: derselbe Server nach kurzer Wartezeit nochmals
//      (Rate-Limit, Zeitüberschreitung), erst dann der nächste.
//   4. 429 und 5xx: warten (Retry-After beachten, gedeckelt) und nochmals; andere 4xx: nächster Server.

export const OVERPASS_ENDPOINTS = [
  'https://overpass.osm.ch/api/interpreter',          // Schweizer Mirror (SOSM) — schnell und zuverlässig für CH-Daten
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const TIMEOUT_MS = 12000          // je Versuch: hängende Server schnell überspringen
const VERSUCHE_JE_SERVER = 3      // gleicher Server bei vorübergehendem Fehler
const MAX_WARTEN_MS = 8000        // Obergrenze fürs Warten (auch bei grossem Retry-After)
const ERGEBNIS_MS = 60000         // Ergebnis einer Abfrage so lange wiederverwenden (Server sperrt Wiederholung ~15 s)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Overpass liefert auch ein ABGEBROCHENES Ergebnis mit HTTP 200: Zeitüberschreitung oder Speichergrenze stehen dann als
// `remark` in der Antwort, `elements` ist leer oder unvollständig. Das ist ein Fehler, kein «hier gibt es nichts».
export function overpassAbgebrochen(data: { remark?: unknown }): boolean {
  return typeof data.remark === 'string' && /runtime error|timed out|out of memory/i.test(data.remark)
}

// Antworttext auswerten: JSON mit Daten → { ok }, sonst der Grund (für die Wiederholung und die Fehlermeldung).
export function overpassAntwort(text: string): { ok: unknown } | { fehler: string } {
  let data: unknown
  try { data = JSON.parse(text) } catch {
    const grund = text.match(/runtime error[^<]*/i)?.[0] ?? text.match(/<title>([^<]*)</i)?.[1] ?? 'keine JSON-Antwort'
    return { fehler: grund.replace(/\s+/g, ' ').trim() }
  }
  if (data && typeof data === 'object' && overpassAbgebrochen(data as { remark?: unknown })) return { fehler: String((data as { remark: string }).remark) }
  return { ok: data }
}

async function mitTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...init, signal: ctrl.signal }) }
  finally { clearTimeout(t) }
}

// Abfrage mit um n Sekunden höherem Zeitlimit: für den Server eine andere Abfrage, gleiches Ergebnis (gegen «duplicate_query»)
export const mitKennung = (query: string, n: number): string => {
  if (!n) return query
  return /\[timeout:\d+\]/.test(query) ? query.replace(/\[timeout:(\d+)\]/, (_, t) => `[timeout:${Number(t) + n}]`)
    : query.startsWith('[') ? `[timeout:${25 + n}]${query}` : `[timeout:${25 + n}];${query}`
}

async function abfragen(query: string): Promise<unknown> {
  const init = (q: string): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) })
  let letzter = 'keine Antwort', kennung = 0
  for (const url of OVERPASS_ENDPOINTS) {
    for (let v = 0; v < VERSUCHE_JE_SERVER; v++) {
      let res: Response
      try { res = await mitTimeout(url, init(mitKennung(query, kennung)), TIMEOUT_MS) }
      catch { letzter = 'Zeitüberschreitung oder Netzwerkfehler'; break }   // hängt bzw. nicht erreichbar → nächster Server
      if (res.ok) {
        const a = overpassAntwort(await res.text())
        if ('ok' in a) return a.ok
        letzter = a.fehler
        if (/duplicate_query/i.test(a.fehler)) { kennung++; continue }            // sofort, als andere Abfrage
        await sleep(Math.min(MAX_WARTEN_MS, 700 * 2 ** v + Math.random() * 400))   // Rate-Limit, Abbruch
        continue
      }
      letzter = `HTTP ${res.status}`
      if (res.status === 429 || res.status >= 500) {
        const ra = parseInt(res.headers.get('Retry-After') || '', 10)
        await sleep(Math.min(MAX_WARTEN_MS, Number.isFinite(ra) ? ra * 1000 : 1000 * 2 ** v))
        continue
      }
      break                                                                   // anderer 4xx → nächster Server
    }
  }
  throw new Error(`Overpass nicht erreichbar (${letzter})`)
}

// Warteschlange: eine Abfrage nach der anderen (overpass.osm.ch erlaubt nur eine laufende je Adresse); gleiche Abfragen,
// die noch laufen oder warten, teilen sich die Antwort
let kette: Promise<unknown> = Promise.resolve()
const laufend = new Map<string, { p: Promise<unknown>; bis: number }>()
export function overpassFetch(query: string): Promise<unknown> {
  const da = laufend.get(query)
  if (da && da.bis > Date.now()) return da.p
  const p = kette.then(() => abfragen(query))
  const eintrag = { p, bis: Infinity }
  // erfolgreich: ERGEBNIS_MS wiederverwenden; Fehler: gleich wieder freigeben
  p.then(() => { eintrag.bis = Date.now() + ERGEBNIS_MS }, () => { if (laufend.get(query) === eintrag) laufend.delete(query) })
  kette = p.catch(() => undefined)
  laufend.set(query, eintrag)
  return p
}
