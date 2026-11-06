import type { Quelle } from './strecke'

export function QuellenHerkunft({ q, fehlt, amtlichTitle, avTitle }: { q?: Quelle; fehlt?: boolean; amtlichTitle?: string; avTitle?: string }) {
  const map: Record<string, { t: string; art?: string; title?: string }> = {
    abgeleitet: { t: 'abgeleitet', art: 'q-annahme', title: 'Aus amtlichen Ausgangsdaten abgeleitet: räumliche Zuordnung eines Zählstellenwerts zur Strasse oder Übersetzung einer örtlichen Netzklasse in den Routentyp. Kein unmittelbarer Originalwert und keine Bestätigung vor Ort.' },
    modell: {t:'ARE · NPVM',art:'q-annahme',title:'Modellierter Motorfahrzeug-DTV (ARE NPVM); Quellenwahl ist keine Bestätigung der Richtigkeit'},
    amtlich: { t: 'Geoportal', title: amtlichTitle },
    osm: { t: 'OSM', title: 'OpenStreetMap' },
    fahrplan: { t: 'opentransportdata', title: 'Fahrplan (opentransportdata.swiss / GTFS)' },
    markierung: { t: 'Markierung', title: 'Aus der Fahrbahnmarkierung ermittelt (lokale Auswertung): Velostreifen auf dieser Seite — oder keiner, wenn die Striche nur auf der anderen Seite liegen' },
    luftbild: { t: 'Luftbild', title: 'Aus dem Luftbild-Hinweis übernommen (Bern: SWISSIMAGE 2024 © swisstopo und Orthofoto Stadt Bern 2026, Zürich und Basel: SWISSIMAGE; Erkennung mit dem Modell remote_velo der ETH Zürich) — bitte am Luftbild prüfen' },
    av: { t: 'AV', title: `Aus der amtlichen Vermessung ermittelt: Fahrbahn von Bordstein zu Bordstein, Median der Querschnitte alle 5 m; bei der Velostrasse die Breite = Fahrbahn ohne Parkierung (${avTitle || 'Amtliche Vermessung, geodienste.ch'})` },
    gemessen: { t: 'gemessen', title: `Am Luftbild gemessen: ab der Bordsteinkante der amtlichen Vermessung bis zur angeklickten Stelle der Markierung (Luftbild © swisstopo; ${avTitle || 'Amtliche Vermessung, geodienste.ch'})` },
    angenommen: { t: '≤ 2000 angenommen', art: 'q-annahme', title: 'Flächendeckende Verkehrsdaten Bern: kein Eintrag ⇒ DTV ≤ 2000 (ausserhalb Altstadt)' },
    fehlt: { t: 'Eingabe nötig', art: 'q-fehlt' },
  }
  const key = fehlt ? 'fehlt'
    : q === 'abgeleitet' ? 'abgeleitet' : q === 'modell' ? 'modell' : q === 'amtlich' ? 'amtlich' : q === 'osm' ? 'osm' : q === 'fahrplan' ? 'fahrplan'
    : q === 'markierung' ? 'markierung' : q === 'angenommen' ? 'angenommen' : q === 'luftbild' ? 'luftbild'
    : q === 'gemessen' ? 'gemessen' : q === 'av' ? 'av' : null
  if (!key) return null
  const c = map[key]
  const chip = <span className={'quelle-chip' + (c.art ? ' ' + c.art : '')} style={{ cursor: c.title ? 'help' : 'default', marginLeft: c.title ? 0 : 6 }}>{c.t}</span>
  if (!c.title) return chip
  // Gleiche Darstellung und Maus-Erklärung wie im letzten Commit, ohne Klickaktion.
  return <span title={c.title} style={{marginLeft:6,cursor:'help',verticalAlign:'middle',font:'inherit'}}>{chip}</span>
}
