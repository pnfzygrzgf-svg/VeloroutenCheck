import { kontextGemeinden } from './gebiet'
import type { Cand } from './VeloMap'
import { E6_KONTEXT, type EbenenDaten, type EbenenObjekt, type EbeneId } from './ebenen'
import { densify } from './geo'
import { E6_DIENSTE, e6Fuer, ladeE6, e6Url, type E6Dienst, type E6LadeLauf } from './e5/daten/anbieter/gemeinsam/e6'
import { lv95, wgs, type P } from './e5/geo'
import { datenGeneration, meldeTeilQuelle } from './datenstand'

interface Zelle { key: string; mitte: P; dienste: Set<string>; nachbarn: Set<string> }
const vergleichen = (a: Zelle, b: Zelle) => a.mitte[0] - b.mitte[0] || a.mitte[1] - b.mitte[1]
/** Rasterzellen entlang der verbundenen Strassenstücke, unabhängig von OSM-Listen- und Way-Richtung.
 * Bei Verzweigungen und getrennten Teilstrecken entscheidet eine stabile räumliche Reihenfolge. */
export function e6ZellenPlanen(cs: readonly Cand[]): Zelle[] {
  const zellen = new Map<string, Zelle>()
  for (const c of cs) {
    const dienste = e6Fuer(kontextGemeinden(c.datenOrt)).filter(d => E6_KONTEXT.includes(d))
    if (!dienste.length) continue
    let vorher: Zelle | undefined
    for (const p of densify(c.geom, 100)) {
      const [e, n] = lv95(p.lat, p.lon)
      const mitte: P = [Math.floor(e / 300) * 300 + 150, Math.floor(n / 300) * 300 + 150]
      const key = mitte.join(',')
      const z = zellen.get(key) ?? { key, mitte, dienste: new Set(), nachbarn: new Set() }
      for (const d of dienste) z.dienste.add(d.id)
      zellen.set(key, z)
      if (vorher && vorher.key !== key) { vorher.nachbarn.add(key); z.nachbarn.add(vorher.key) }
      vorher = z
    }
  }
  const offen = new Set(zellen.keys()), folge: Zelle[] = []
  while (offen.size) {
    const rest = [...offen].map(k => zellen.get(k)!).sort(vergleichen)
    const start = rest.find(z => z.nachbarn.size <= 1) ?? rest[0]
    const stapel = [start]
    while (stapel.length) {
      const z = stapel.pop()!
      if (!offen.delete(z.key)) continue
      folge.push(z)
      stapel.push(...[...z.nachbarn].filter(k => offen.has(k)).map(k => zellen.get(k)!).sort(vergleichen).reverse())
    }
  }
  return folge
}

/** Ausschliesslich Kartenkontext: verändert weder Kandidaten noch ihre Bewertungseingaben. */
export async function ladeE6Kontext(cs: readonly Cand[]): Promise<{ ebenen: EbenenDaten; fehler: string[] }> {
  const generation = datenGeneration(), alle = e6ZellenPlanen(cs), zellen = alle.slice(0, 24)
  const fehler: string[] = [], ebenen: EbenenDaten = {}
  if (alle.length > zellen.length) fehler.push(`Kartenkontext: ${alle.length - zellen.length} Zellen nicht geladen (Grenze: 24 räumliche Zellen).`)
  const jobs = zellen.flatMap(z => E6_DIENSTE.filter(d => z.dienste.has(d.id)).map(d => ({ d, z })))
  const lauf: E6LadeLauf = { metadaten: new Map() }
  const id = (d: E6Dienst) => d.id as EbeneId
  const ll = (p: P) => { const [lat, lon] = wgs(...p); return { lat, lon } }
  for (let i = 0; i < jobs.length; i += 3) {
    if (generation !== datenGeneration()) break
    await Promise.all(jobs.slice(i, i + 3).map(async ({ d, z }) => {
      try {
        const r = await ladeE6(d, z.mitte, 200, undefined, lauf)
        if (generation !== datenGeneration()) return
        const objekte = r.daten.objekte.flatMap<EbenenObjekt>(o => {
          const basis = { id: o.id, klasse: o.kontext,
            text: `${o.name}; ${d.anbieter}; ${o.hinweis} Datenstand ${r.daten.datenstand}; Vollständigkeit unbekannt; abgerufen ${new Date(r.daten.abgerufen).toLocaleString('de-CH')}` }
          return o.punkte ? o.punkte.map((p, j) => ({ ...basis, id: `${o.id}:${j}`, punkt: ll(p) }))
            : [{ ...basis, linien: (o.teile ?? []).map(l => l.map(ll)) }]
        })
        const vorhandene = new Map((ebenen[id(d)] ?? []).map(o => [o.id, o]))
        for (const o of objekte) vorhandene.set(o.id, o)
        ebenen[id(d)] = [...vorhandene.values()]
        meldeTeilQuelle(d.id, d.name, d.url, d.id, { zelle: z.key, url: r.daten.url,
          datenstand: r.daten.datenstand, abgerufen: r.daten.abgerufen }, generation)
      } catch (e) {
        if (generation !== datenGeneration()) return
        const text = (e as Error).message
        fehler.push(`${d.name}, Zelle ${z.key}: ${text}`)
        meldeTeilQuelle(d.id, d.name, d.url, d.id, { zelle: z.key, url: e6Url(d, z.mitte),
          datenstand: 'unbekannt', abgerufen: new Date().toISOString(), fehler: text }, generation)
      }
    }))
  }
  return generation === datenGeneration() ? { ebenen, fehler } : { ebenen: {}, fehler: [] }
}
