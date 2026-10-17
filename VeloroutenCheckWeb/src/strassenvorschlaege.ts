// ── Strassensuche mit Vorschlägen (seit 17.10.2026, nach der Ortssuche von fgsCheck) ──────────
//
// Vorschläge vom SearchServer von swisstopo (api3.geo.admin.ch, Adressen): gesucht wird «Text Stadt»,
// übernommen werden nur Adressen der gewählten Stadt (Ortsname der Postleitzahl = Stadtname, z. B.
// «8004 Zürich», «6015 Luzern»; Nachbargemeinden wie «Muri b. Bern» fallen weg), je Strassenname
// einmal (die Hausnummern fallen weg). Der Name muss den getippten Text enthalten. Strassen ohne
// Adressen (Brücken, Plätze ohne Häuser) schlägt der Dienst nicht vor; Enter lädt den getippten
// Namen trotzdem. Geladen wird wie bisher aus OpenStreetMap (loadStreetCandidates).
// CORS offen; Fair Use: Abfrage erst nach einer Tipp-Pause, alte Anfragen werden abgebrochen.

export const SUCHE_URL = 'https://api3.geo.admin.ch/rest/services/api/SearchServer'
export const SUCHE_MAX = 8

interface RohTreffer { attrs?: { origin?: string; label?: string } }

const ohneHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const klein = (s: string) => s.toLocaleLowerCase('de-CH').normalize('NFC')

// «Kanzleistrasse 12 <b>8004 Zürich</b>» → { name: Kanzleistrasse, ort: Zürich }; Strasse ohne Nummer mit «#»
export function adresseLesen(label: string): { name: string; ort: string } | null {
  const [vorne, ...hinten] = label.split(/<b>/i)
  const ort = ohneHtml(hinten.join(' ')).replace(/^\d{4}\s+/, '')
  const name = ohneHtml(vorne).replace(/\s+(#|\d[\w./-]*)$/, '').trim()
  return name && ort ? { name, ort } : null
}

// Antwort → Strassennamen der Stadt, die den Suchtext enthalten (ohne Doppel, höchstens SUCHE_MAX)
export function strassenTreffer(data: { results?: RohTreffer[] }, text: string, stadt: string): string[] {
  const q = klein(text.trim()), aus: string[] = []
  for (const r of data.results ?? []) {
    if (r.attrs?.origin && r.attrs.origin !== 'address') continue
    const a = adresseLesen(r.attrs?.label ?? '')
    if (!a || a.ort !== stadt || !klein(a.name).includes(q) || aus.includes(a.name)) continue
    aus.push(a.name)
    if (aus.length >= SUCHE_MAX) break
  }
  return aus
}

export async function sucheStrasse(text: string, stadt: string, signal?: AbortSignal): Promise<string[]> {
  const url = `${SUCHE_URL}?type=locations&lang=de&origins=address&limit=50&searchText=${encodeURIComponent(`${text} ${stadt}`)}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return strassenTreffer(await res.json() as { results?: RohTreffer[] }, text, stadt)
}
