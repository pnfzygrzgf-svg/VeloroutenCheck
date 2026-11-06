// Bericht: Datenquellen unter «Quellen», nur was in Bewertung, Planung oder Kartenbild eingeht
import { beforeEach, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Datenstaende, beruecksichtigteEbenen } from './Datenstaende'
import { datenlaufNeu, datenStaende, meldeAbruf, meldeQuelleStand, zeitText } from './datenstand'
import { E5Abschnitt } from './E5Abschnitt'
import type { Section } from './strecke'

const abschnitt = (p: Partial<Section> = {}): Section => ({ id: 1, ist: 'Mischverkehr', breite: NaN, dtv: 3416, dtvGeprueft: true, speed: 30,
  fahrbahnbreite: 8, richtung: 'eine', quelle: {}, ...p } as unknown as Section)
const ebenen = (p: Partial<Section>) => [...beruecksichtigteEbenen(abschnitt(p))].sort()

beforeEach(() => { datenlaufNeu() })

it('berücksichtigt: Strassennetz und Gebiet immer, sonst nach der Herkunft der Felder', () => {
  expect(ebenen({})).toEqual(['gebiet', 'orthofoto', 'osm', 'tram', 'velostrasse'])
  expect(ebenen({ quelle: { fahrbahnbreite: 'av', routentyp: 'amtlich', speed: 'amtlich', dtv: 'amtlich', parkenRechts: 'amtlich', tram: 'amtlich' },
    fussnetzGeoportal: 'basisnetz' as never, hierarchie: 'Quartierstrasse' }))
    .toEqual(['av', 'dtv', 'fussnetz', 'gebiet', 'hierarchie', 'orthofoto', 'osm', 'parkfelder', 'routennetz', 'tempo', 'tram', 'velostrasse'])
  expect(ebenen({ quelle: { dtv: 'modell' } })).toContain('npvm')
  expect(ebenen({ quelle: { ist: 'markierung' } })).toContain('markierung')
  expect(ebenen({ quelle: { ist: 'luftbild' } })).toContain('luftbild')
  expect(ebenen({ quelle: { ist: 'amtlich' } })).toContain('velostrasse')
  expect(ebenen({ quelle: { oevAngebot: 'fahrplan' } })).toEqual(expect.arrayContaining(['haltestellen', 'oev']))
})
it('von Hand geänderte Werte zählen nicht zur Quelle; Seite B zählt mit; geprüfte Lücke im DTV stützt sich auf die Quelle', () => {
  expect(ebenen({ quelle: { dtv: 'manuell', speed: 'manuell', routentyp: 'manuell', tram: 'manuell', ist: 'manuell' } })).toEqual(['gebiet', 'orthofoto', 'osm'])
  expect(ebenen({ gegen: { quelle: { parkenRechts: 'amtlich', ist: 'markierung' } } as never })).toEqual(expect.arrayContaining(['parkfelder', 'markierung']))
  expect(ebenen({ dtv: NaN })).toContain('dtv')
  expect(ebenen({ dtv: NaN, dtvGeprueft: false })).not.toContain('dtv')
})
it('Dienste ohne eigene Zuordnung bekommen ihr Thema (bisher «Weitere Quellen», obwohl sie in die Planung einfliessen)', () => {
  const G = 'https://map.bern.ch/arcgis/rest/services/Geoportal'
  meldeAbruf(`${G}/Richtplan_Fussverkehr/MapServer/0/query?f=geojson`, null)
  meldeAbruf(`${G}/Verkehrsdaten_Tram/MapServer/0/query?f=geojson`, null)
  meldeAbruf(`${G}/Velostrassen/MapServer/0/query?f=geojson`, null)
  meldeAbruf('https://map.bern.ch/arcgis/services/Geoportal/Parkplaetze_oeffentlich/MapServer/WFSServer?TYPENAMES=x', null)
  meldeAbruf('https://veloroutencheck.ch/velostreifen_bern.json', null)
  expect(Object.fromEntries(datenStaende().map(s => [s.name, s.ebene]))).toEqual({
    'Geoportal Stadt Bern: Richtplan Fussverkehr': 'fussnetz', 'Geoportal Stadt Bern: Verkehrsdaten Tram': 'tram',
    'Geoportal Stadt Bern: Velostrassen': 'velostrasse', 'Geoportal Stadt Bern: Parkplätze öffentlich': 'parkfelder',
    'Velostreifen · lokale Markierungsauswertung': 'markierung' })
})
it('Bericht: nur die Quellen des Abschnitts, das Luftbild der Karte und der genannte BAV-Punkt; im Panel weiterhin die aufklappbare Liste', () => {
  meldeQuelleStand('tempo1', 'Geoportal Stadt Bern: Signalisierte Hoechstgeschwindigkeit', 'https://map.bern.ch/x', 'tempo', '02.06.2026')
  meldeQuelleStand('unfall1', 'ch.astra.unfaelle-personenschaeden_alle', 'https://wmts.geo.admin.ch/y', 'unfaelle', '2025')
  meldeQuelleStand('datei1', 'Unbekannte Datei', 'https://veloroutencheck.ch/z.json', '', '5.7.2026')
  meldeQuelleStand('bild1', 'Luftbild SWISSIMAGE · swisstopo', 'https://wmts.geo.admin.ch/a', 'orthofoto', '2024')
  meldeQuelleStand('bav1', 'BAV · Haltestellenpunkte', 'https://data.geo.admin.ch/b', 'bav', '01.11.2026')
  const html = renderToStaticMarkup(<Datenstaende druck section={abschnitt({ quelle: { speed: 'amtlich' } })} />)
  expect(html).toContain('Signalisierte Hoechstgeschwindigkeit')
  expect(html).toContain('Luftbild SWISSIMAGE')
  expect(html).not.toContain('Weitere geladene')
  expect(html).not.toContain('unfaelle')
  expect(html).not.toContain('Unbekannte Datei')
  expect(html).not.toContain('Haltestellenpunkte')
  const mitBav = abschnitt({ e5: { belege: {}, vorschlaege: [], hinweise: ['1 BAV-Haltestellenpunkt bis 60 m'] } as never })
  expect(renderToStaticMarkup(<Datenstaende druck section={mitBav} />)).toContain('Haltestellenpunkte')
  expect(renderToStaticMarkup(<Datenstaende druck />)).not.toContain('<h3>')
  expect(renderToStaticMarkup(<Datenstaende />)).toContain('Datenquellen und Ladezustand</summary>')
})
it('Namen im Bericht: Umlaute, Stadt gross, Luftbild ohne Ebenenkennung; Datum einheitlich zweistellig', () => {
  const G = 'https://map.bern.ch/arcgis/rest/services/Geoportal'
  meldeAbruf(`${G}/Signalisierte_Hoechstgeschwindigkeit/MapServer/0/query`, null)
  meldeAbruf(`${G}/Flaechendeckende_Verkehrsdaten/MapServer/0/query`, null)
  meldeAbruf(`${G}/OeV_Linien/MapServer/0/query`, null)
  meldeAbruf('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/1/2/3.jpeg', null)
  meldeAbruf('https://veloroutencheck.ch/obs_bern.json', null)
  meldeAbruf('https://veloroutencheck.ch/oev_takt_zurich.json', null)
  meldeAbruf('https://overpass.osm.ch/api/interpreter', null, { osm3s: { timestamp_osm_base: '118270' } })
  const namen = datenStaende().map(s => s.name)
  expect(namen).toEqual(expect.arrayContaining(['Geoportal Stadt Bern: Signalisierte Höchstgeschwindigkeit', 'Geoportal Stadt Bern: Flächendeckende Verkehrsdaten',
    'Geoportal Stadt Bern: ÖV Linien', 'Luftbild SWISSIMAGE · swisstopo', 'Überholabstände · OpenBikeSensor Bern', 'ÖV-Takt · Fahrplandaten Zürich']))
  expect(datenStaende().find(s => s.id === 'osm')?.datenstand).toBe('unbekannt')
  expect(zeitText('2026-03-05T08:04:09')).toMatch(/^05\.03\.2026, 08:04:09$/)
})
it('Quellenzuordnung im Bericht: Abschnitt ohne Aufklapp-Pfeil, Tausender wie in der Tabelle; im Panel weiterhin aufklappbar', () => {
  const b = { feld: 'dtv', wert: 3416, quelle: 'Geoportal Stadt Bern', quelleId: 'bern.dtv', datenstand: '02.06.2026', abgerufen: '2026-11-06T09:32:07', url: 'https://map.bern.ch/x', objekte: [], hinweis: '' }
  const s = abschnitt({ e5: { belege: { dtv: b }, vorschlaege: [], hinweise: ['1 BAV-Haltestellenpunkt'] } as never })
  const druck = renderToStaticMarkup(<E5Abschnitt s={s} druck />)
  expect(druck).not.toContain('<details')
  expect(druck).toContain('<h2>Quellenzuordnung und Hinweise</h2>')
  // Das Apostroph ist je nach ICU ' (im Markup maskiert) oder ’
  expect(druck.replace(/&#x27;/g, "'")).toContain(`${(3416).toLocaleString('de-CH')} Fz/Tag`)
  expect(druck).toContain('Abruf 06.11.2026, 09:32:07')
  expect(renderToStaticMarkup(<E5Abschnitt s={s} />)).toContain('<details')
})
it('Flugjahr ersetzt im Bericht den unbekannten Datenstand des Luftbilds; im Panel bleibt die Meldung', () => {
  meldeQuelleStand('ch.swisstopo.swissimage', 'Luftbild SWISSIMAGE · swisstopo', 'https://wmts.geo.admin.ch/a', 'orthofoto', 'unbekannt (Metadaten nicht verfügbar)')
  const html = renderToStaticMarkup(<Datenstaende druck section={abschnitt()} flugjahr="2024" />)
  expect(html).toContain('Datenstand 2024 (Flugjahr)')
  expect(html).not.toContain('Metadaten nicht verfügbar')
  expect(renderToStaticMarkup(<Datenstaende druck section={abschnitt()} />)).toContain('Metadaten nicht verfügbar')
})
it('Luftbild des Kartenbilds steht in den Quellen, auch wenn die Karte ein anderes Hintergrundbild zeigte', () => {
  meldeQuelleStand('tempo1', 'Geoportal Stadt Bern: Signalisierte Hoechstgeschwindigkeit', 'https://map.bern.ch/x', 'tempo', '02.06.2026')
  const html = renderToStaticMarkup(<Datenstaende druck section={abschnitt()} flugjahr="2024" />)
  expect(html).toContain('Luftbild SWISSIMAGE')
  expect(html).toContain('Datenstand 2024 (Flugjahr)')
})
it('AV steht in den Quellen ohne erfundenen Abruf, wenn in diesem Lauf nichts abgerufen wurde', () => {
  meldeQuelleStand('tempo1', 'Geoportal Stadt Bern: Signalisierte Hoechstgeschwindigkeit', 'https://map.bern.ch/x', 'tempo', '02.06.2026')
  const html = renderToStaticMarkup(<Datenstaende druck section={abschnitt({ trottoirQuelle: 'av' })} avKanton="Bern" />)
  expect(html).toContain('Amtliche Vermessung, Kanton Bern, geodienste.ch')
  expect(html).toContain('gespeicherten Abschnitt')
  expect(renderToStaticMarkup(<Datenstaende druck section={abschnitt()} avKanton="Bern" />)).not.toContain('Amtliche Vermessung')
  expect(renderToStaticMarkup(<Datenstaende druck section={abschnitt()} avKanton="Luzern" avImBild />)).toContain('Strassenflächen Stadt Luzern')
})
