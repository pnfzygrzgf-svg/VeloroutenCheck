import type { Quelle } from './strecke'

export function QuellenHerkunft({ q, fehlt, amtlichTitle, avTitle }: { q?: Quelle; fehlt?: boolean; amtlichTitle?: string; avTitle?: string }) {
  const map: Record<string, { t: string; bg: string; fg: string; title?: string }> = {
    abgeleitet: { t: 'abgeleitet', bg: '#fef3c7', fg: '#92400e', title: 'Aus amtlichen Ausgangsdaten abgeleitet: räumliche Zuordnung eines Zählstellenwerts zur Strasse oder Übersetzung einer örtlichen Netzklasse in den Routentyp. Kein unmittelbarer Originalwert und keine Bestätigung vor Ort.' },
    modell: {t:'ARE · NPVM',bg:'#ccfbf1',fg:'var(--accent)',title:'Modellierter Motorfahrzeug-DTV (ARE NPVM); Quellenwahl ist keine Bestätigung der Richtigkeit'},
    amtlich: { t: 'Geoportal', bg: '#dbeafe', fg: '#1e40af', title: amtlichTitle },
    osm: { t: 'OSM', bg: 'var(--border-subtle)', fg: 'var(--text-muted-strong)', title: 'OpenStreetMap' },
    fahrplan: { t: 'opentransportdata', bg: '#dcfce7', fg: '#166534', title: 'Fahrplan (opentransportdata.swiss / GTFS)' },
    markierung: { t: 'Markierung', bg: '#ffedd5', fg: '#9a3412', title: 'Aus der Fahrbahnmarkierung ermittelt (lokale Auswertung): Velostreifen auf dieser Seite — oder keiner, wenn die Striche nur auf der anderen Seite liegen' },
    luftbild: { t: 'Luftbild', bg: '#e0f2fe', fg: '#075985', title: 'Aus dem Luftbild-Hinweis übernommen (Bern: SWISSIMAGE 2024 © swisstopo und Orthofoto Stadt Bern 2026, Zürich und Basel: SWISSIMAGE; Erkennung mit dem Modell remote_velo der ETH Zürich) — bitte am Luftbild prüfen' },
    av: { t: 'AV', bg: '#f1f5f9', fg: '#334155', title: `Aus der amtlichen Vermessung ermittelt: Fahrbahn von Bordstein zu Bordstein, Median der Querschnitte alle 5 m; bei der Velostrasse die Breite = Fahrbahn ohne Parkierung (${avTitle || 'Amtliche Vermessung, geodienste.ch'})` },
    gemessen: { t: 'gemessen', bg: '#ede9fe', fg: '#5b21b6', title: `Am Luftbild gemessen: ab der Bordsteinkante der amtlichen Vermessung bis zur angeklickten Stelle der Markierung (Luftbild © swisstopo; ${avTitle || 'Amtliche Vermessung, geodienste.ch'})` },
    angenommen: { t: '≤ 2000 angenommen', bg: '#fef9c3', fg: '#854d0e', title: 'Flächendeckende Verkehrsdaten Bern: kein Eintrag ⇒ DTV ≤ 2000 (ausserhalb Altstadt)' },
    fehlt: { t: 'Eingabe nötig', bg: '#fee2e2', fg: '#b91c1c' },
  }
  const key = fehlt ? 'fehlt'
    : q === 'abgeleitet' ? 'abgeleitet' : q === 'modell' ? 'modell' : q === 'amtlich' ? 'amtlich' : q === 'osm' ? 'osm' : q === 'fahrplan' ? 'fahrplan'
    : q === 'markierung' ? 'markierung' : q === 'angenommen' ? 'angenommen' : q === 'luftbild' ? 'luftbild'
    : q === 'gemessen' ? 'gemessen' : q === 'av' ? 'av' : null
  if (!key) return null
  const c = map[key]
  const chip = (
    <span style={{ fontSize: 'var(--fs-105)', fontWeight: 700, color: c.fg, background: c.bg,
                   borderRadius: 999, padding: '1px 7px', whiteSpace: 'nowrap',
                   display: 'inline-block', verticalAlign: 'middle', marginLeft: c.title ? 0 : 6,
                   cursor: c.title ? 'help' : 'default' }}>
      {c.t}
    </span>
  )
  if (!c.title) return chip
  // Gleiche Darstellung und Maus-Erklärung wie im letzten Commit, ohne Klickaktion.
  return <span title={c.title} style={{marginLeft:6,cursor:'help',verticalAlign:'middle',font:'inherit'}}>{chip}</span>
}
