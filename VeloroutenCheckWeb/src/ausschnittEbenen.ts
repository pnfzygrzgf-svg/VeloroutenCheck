// ── Ebenen, die der VeloroutenCheck auch ohne Segmente für den Kartenausschnitt lädt ──
// Nur Anzeige: Sie fliessen nicht in die Bewertung. Laden und Stand kommen aus dem Baustein, hier stehen nur die Quellen und ihre Meldung für den Bericht.

import { ladeBundAusschnitt, bundAbfrage } from './kartenbaustein/bund'
import { ausschnittKreis, BAUZONEN, STRASSENKLASSEN_TLM, type BundEbene, type EigeneEbene } from './kartenbaustein/ebenenAusschnitt'
import type { KartenObjekt } from './kartenbaustein/modell'
import { ladeAstraStand } from './kartenbaustein/unfaelle'
import { datenGeneration, meldeQuelleStand, meldeQuellenFehler } from './datenstand'
import { ladeGebiet } from './e5/daten/anbieter/gemeinsam/gebiet'
import { ladeRegional, type RegionalObjekt } from './e5/daten/anbieter/gemeinsam/regional'
import { regionalFuer, type RegionalDienst } from './e5/daten/anbieter/gemeinsam/regionalDienste'
import type { Gemeinde } from './e5/daten/anbieter/gemeinsam/typen'
import { wgs } from './e5/geo'

export const TEXT_ANZEIGE = 'nur Kartenkontext, keine Wirkung auf die Bewertung'

const staende = new Map<string, Promise<string>>()
const standVon = (layer: string): Promise<string> => {
  const s = staende.get(layer) ?? ladeAstraStand(layer).catch(() => { staende.delete(layer); return 'unbekannt' })
  staende.set(layer, s)
  return s
}

/** Ebene des Bundes mit Meldung an «Datenquellen und Ladezustand» */
function mitMeldung(e: BundEbene, name: string): EigeneEbene {
  return { ...e, async laden(box, signal) {
    const generation = datenGeneration(), url = bundAbfrage(e.layer, box), id = `ausschnitt.${e.id}`
    try {
      const liste = (await ladeBundAusschnitt(e.layer, box, signal)).flatMap(e.lesen)
      meldeQuelleStand(id, name, url, e.id, await standVon(e.layer), new Date().toISOString(), generation)
      return liste
    } catch (x) {
      if (!signal.aborted) meldeQuellenFehler(id, name, url, e.id, x, generation)
      throw x
    }
  } }
}

export const lsaDienste = (orte: readonly Gemeinde[]): RegionalDienst[] => regionalFuer(orte).filter(d => d.art === 'lsa')

export function lsaObjekte(d: Pick<RegionalDienst, 'name' | 'anbieter'>, objekte: readonly RegionalObjekt[]): KartenObjekt[] {
  return objekte.flatMap(o => (o.verkehr === 'lsa' ? (o.punkte ?? []).map((punkt, i) => ({ id: `${o.id}:${i}`, punkt, klasse: 'lsa', quelle: `${d.anbieter}, ${d.name}`,
    text: `${o.name || 'Lichtsignalanlage'}; Anlagenpunkt, keine Signalgruppe; ${d.anbieter}` })) : []))
}

/** Alle Inventare der Gemeinden im Ausschnitt, die fünf der gemeinsamen Liste */
export const LICHTSIGNALE: EigeneEbene = {
  id: 'lsa', titel: 'Lichtsignale', quelle: `Amtliche Inventare; Anlagenpunkte, keine Signalgruppen; ${TEXT_ANZEIGE}`, legende: [['lsa', '#b91c1c', 'Anlagenstandort', 'L']],
  async laden(box, signal) {
    const generation = datenGeneration(), { mitte, r } = ausschnittKreis(box), [lat, lon] = wgs(mitte[0], mitte[1])
    const orte = (await ladeGebiet(lat, lon, r, signal)).daten.imAusschnitt
    const teile = await Promise.all(lsaDienste(orte).map(async d => {
      const name = `${d.anbieter}: ${d.name}`
      try {
        const a = await ladeRegional(d, mitte, r, signal)
        meldeQuelleStand(`ausschnitt.${d.id}`, name, a.daten.url, 'lsa', a.daten.datenstand, a.daten.abgerufen, generation)
        return lsaObjekte(d, a.daten.objekte)
      } catch (x) {
        if (!signal.aborted) meldeQuellenFehler(`ausschnitt.${d.id}`, name, d.url, 'lsa', x, generation)
        throw x
      }
    }))
    return teile.flat()
  },
}

/** Flächen zuerst, damit sie nicht über den Linien liegen */
export const AUSSCHNITT_EBENEN: readonly EigeneEbene[] = [mitMeldung(BAUZONEN, 'Bauzonen Schweiz (ARE)'), mitMeldung(STRASSENKLASSEN_TLM, 'Strassen swissTLM3D (swisstopo)'), LICHTSIGNALE]
