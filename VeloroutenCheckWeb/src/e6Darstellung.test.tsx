import { ladeMeldungen, feldFehlerText } from './ladeMeldungen'
import { beforeEach, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Datenstaende } from './Datenstaende'
import { KartenHinweise } from './KartenHinweise'
import { datenGeneration, datenlaufNeu, datenStaende, meldeTeilQuelle } from './datenstand'
import { EBENEN, ebenenQuelle } from './ebenen'
import { buildCsv, csvCell } from './csv'
import { defaultSection } from './strecke'
import { bewerteAbschnitt } from './bewertung'
beforeEach(() => datenlaufNeu())
function teil(zelle: string, fehler?: string) {
 meldeTeilQuelle('e6.zh.netz', 'Fuss- und Velowegnetz (Stadt Zürich)', 'https://example.test/', 'e6.zh.netz', {
  zelle, url: 'https://example.test/' + zelle, datenstand: '01.11.2026', abgerufen: '2026-11-03T12:00:00Z', ...(fehler ? { fehler } : {}),
 }, datenGeneration())
}
it('Quellenliste und Bericht führen den Dienst einmal, mit einzeln verlinkten Teilfehlern', () => {
 teil('west'); teil('mitte', 'Ausfall Mitte'); teil('ost', 'Ausfall Ost')
 for (const druck of [false, true]) {
  const html = renderToStaticMarkup(<Datenstaende druck={druck} />)
  expect(html.split('>Fuss- und Velowegnetz (Stadt Zürich)</a>').length - 1).toBe(1)
  expect(html).toContain('Zelle mitte'); expect(html).toContain('Ausfall Mitte')
  expect(html).toContain('Zelle ost'); expect(html).toContain('Ausfall Ost')
  expect(html).toContain('nur Kartenkontext')
 }
 expect(ebenenQuelle(EBENEN.find(e => e.id === 'e6.zh.netz')!, 'schweiz')).toContain('Ausfall Mitte')
})
it('CSV enthält einen Dienst mit Teilfehlern, statt eines Quellenobjekts je Zelle', () => {
 teil('west'); teil('ost', 'Teil nicht erreichbar')
 const s = defaultSection(), quellen = datenStaende()
 const csv = buildCsv([s], [bewerteAbschnitt(s, 'bern')], null, 'bern', 'Bern')
 expect(quellen).toHaveLength(1)
 expect(csv).toContain(csvCell(JSON.stringify(quellen)))
 expect(csv.split('Fuss- und Velowegnetz (Stadt Zürich)').length - 1).toBe(1)
 expect(csv).toContain('Teil nicht erreichbar')
})
it('erneuter Erfolg derselben Zelle beseitigt nur ihren Teilfehler und zählt sie nicht doppelt', () => {
 teil('west', 'West fehlt'); teil('ost', 'Ost fehlt'); teil('west')
 expect(datenStaende()[0]).toMatchObject({ status: 'teilweise', geladeneZellen: 1, teilfehler: [{ zelle: 'ost', fehler: 'Ost fehlt' }] })
 teil('ost')
 expect(datenStaende()[0]).toMatchObject({ status: 'geladen', geladeneZellen: 2, teilfehler: [] })
})
it('Kartenhinweise nennen die Zellgrenze ohne Korrekturaufforderung für Bewertungsfelder', () => {
 const html = renderToStaticMarkup(<KartenHinweise hinweise={['E6-Kartenkontext: 4 Zellen nicht geladen.', 'Wegnetzzelle nicht verfügbar']} />)
 expect(html).toContain('Kartenhinweis:'); expect(html).toContain('4 Zellen nicht geladen')
 expect(html).not.toContain('betroffene Felder'); expect(html).not.toContain('von Hand prüfen')
 expect(renderToStaticMarkup(<KartenHinweise hinweise={[]} />)).toBe('')
})

it('tatsächlich verwendeter Ladeweg erzeugt bei reinem Kontextausfall keinen Hinweis auf betroffene Eingabefelder', () => {
 const meldungen = ladeMeldungen([], ['E6-Kartenkontext: 4 Zellen nicht geladen.', 'Wegnetzzelle nicht verfügbar'])
 expect(meldungen.fehler).toEqual([])
 expect(feldFehlerText(meldungen.fehler)).toBe('')
 expect(renderToStaticMarkup(<KartenHinweise hinweise={meldungen.kartenHinweise} />)).toContain('4 Zellen nicht geladen')
})
it('gleichzeitige fachliche Ladefehler behalten ihre Korrekturaufforderung, ohne E6 darunter zu mischen', () => {
 const meldungen = ladeMeldungen(['Verkehrsmenge'], ['Wegnetz nicht verfügbar'])
 expect(meldungen.fehler).toEqual(['Verkehrsmenge'])
 expect(feldFehlerText(meldungen.fehler)).toContain('von Hand prüfen')
 expect(feldFehlerText(meldungen.fehler)).not.toContain('Wegnetz')
 expect(meldungen.kartenHinweise).toEqual(['Wegnetz nicht verfügbar'])
})
