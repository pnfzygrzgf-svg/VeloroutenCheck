import { describe, it, expect } from 'vitest'
import { istFromTags, naechsterKandidat, osmBreite, overpassRegexExakt, wayToCand } from './osm'
import { escapeHtml } from './netz'
import type { Cand } from './VeloMap'

const M_LAT = 1 / 111320
const M_LON = 1 / (111320 * Math.cos((47 * Math.PI) / 180))
const pt = (xM: number, yM: number) => ({ lat: 47 + yM * M_LAT, lon: 7.4 + xM * M_LON })
const cand = (id: number, geom: { lat: number; lon: number }[]): Cand =>
  ({ id, wayId: id, ist: 'Mischverkehr', len: 0, name: 'x', geom, selected: true })

describe('naechsterKandidat — Klick auf die Karte', () => {
  // Lange Gerade mit Stützpunkten nur an den Enden; querender Fussweg mit Stützpunkt in 15 m.
  const strasse = cand(1, [pt(0, 0), pt(200, 0)])
  const fussweg = cand(2, [pt(110, 15), pt(110, 40)])

  it('Klick 2 m neben der Strassenmitte wählt die Strasse (nicht den Fussweg mit näherem Stützpunkt)', () =>
    expect(naechsterKandidat([fussweg, strasse], pt(100, 2).lat, pt(100, 2).lon)?.id).toBe(1))
  it('Klick auf dem Fussweg wählt den Fussweg', () =>
    expect(naechsterKandidat([fussweg, strasse], pt(110, 30).lat, pt(110, 30).lon)?.id).toBe(2))
  it('keine Kandidaten → null', () =>
    expect(naechsterKandidat([], 47, 7.4)).toBeNull())
})

describe('istFromTags — OSM-Tags → Ist-Führungsform', () => {
  it('Velostrasse', () => expect(istFromTags({ bicycle_road: 'yes' }, 'residential')).toBe('Velostrasse'))
  it('Radweg abgesetzt / Zweirichtungsradweg nur bei ausdrücklichem Tag', () => {
    expect(istFromTags({}, 'cycleway')).toBe('Radweg abgesetzt')
    expect(istFromTags({ oneway: 'no' }, 'cycleway')).toBe('Zweirichtungsradweg')
  })
  it('Radstreifen / Umweltspur / geschützter Radstreifen je Seite', () => {
    expect(istFromTags({ 'cycleway:right': 'lane' }, 'secondary')).toBe('Radstreifen')
    expect(istFromTags({ 'cycleway:right': 'share_busway' }, 'secondary')).toBe('Umweltspur')
    expect(istFromTags({ 'cycleway:left': 'track' }, 'secondary')).toBe('Radweg strassenbegleitend / Geschützter Radstreifen')
  })
  it('Fussweg: kombiniert nur bei designated/designated, sonst «Velo gestattet»', () => {
    expect(istFromTags({ bicycle: 'designated', foot: 'designated' }, 'path')).toBe('Kombinierter Fuss-/Radweg')
    expect(istFromTags({ bicycle: 'yes' }, 'footway')).toBe('Fussweg Velo gestattet')
  })
  it('ohne Velo-Tags → Mischverkehr', () => expect(istFromTags({}, 'residential')).toBe('Mischverkehr'))
})

describe('wayToCand / osmBreite', () => {
  const geom = [pt(0, 0), pt(100, 0)]
  it('reines Trottoir wird ausgefiltert', () =>
    expect(wayToCand({ id: 1, tags: { highway: 'footway' }, geometry: geom })).toBeNull())
  it('`width` einer STRASSE ist die Fahrbahn, nicht der Radstreifen → keine Breite', () =>
    expect(wayToCand({ id: 1, tags: { highway: 'residential', 'cycleway:right': 'lane', width: '9' }, geometry: geom })?.breite).toBeUndefined())
  it('`width` eines Radwegs zählt', () =>
    expect(wayToCand({ id: 1, tags: { highway: 'cycleway', width: '2.5' }, geometry: geom })?.breite).toBe(2.5))
  it('maxspeed nur als Zahl («CH:urban» bleibt leer)', () => {
    expect(wayToCand({ id: 1, tags: { highway: 'residential', maxspeed: '30' }, geometry: geom })?.speed).toBe(30)
    expect(wayToCand({ id: 1, tags: { highway: 'residential', maxspeed: 'CH:urban' }, geometry: geom })?.speed).toBeUndefined()
  })
  it('Breite: Komma, Einheit m; fremde Einheiten werden nicht geraten', () => {
    expect(osmBreite('1,5')).toBe(1.5)      // parseFloat las hier 1
    expect(osmBreite('1.8 m')).toBe(1.8)
    expect(osmBreite("5'")).toBeUndefined()
    expect(osmBreite('0')).toBeUndefined()
    expect(osmBreite(undefined)).toBeUndefined()
  })
})

describe('overpassRegexExakt — Freitext in der Overpass-Abfrage', () => {
  it('Punkt wird als Regex-Zeichen maskiert, der Backslash für QL verdoppelt', () =>
    expect(overpassRegexExakt('St. Alban-Vorstadt')).toBe('St\\\\. Alban-Vorstadt'))
  it('Anführungszeichen beendet die Zeichenkette nicht', () =>
    expect(overpassRegexExakt('a"](1,2,3,4);out;//')).toBe('a\\"\\\\]\\\\(1,2,3,4\\\\);out;//'))
  it('gewöhnlicher Name bleibt unverändert', () =>
    expect(overpassRegexExakt('Thunstrasse')).toBe('Thunstrasse'))
})

describe('escapeHtml — Fremdtext in Karten-Tooltips', () => {
  it('maskiert Markup', () =>
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'))
  it('gewöhnlicher Name bleibt lesbar', () =>
    expect(escapeHtml("Rue de l'Hôpital & Co")).toBe('Rue de l&#39;Hôpital &amp; Co'))
})

import { istStrassenHalt } from './cityShared'
describe('istStrassenHalt — nur Halte auf der Strasse zählen als ÖV-Haltestelle', () => {
  it('Bus-, Trolleybus- und Tramhalte zählen', () => {
    expect(istStrassenHalt({ highway: 'bus_stop' })).toBe(true)
    expect(istStrassenHalt({ railway: 'tram_stop' })).toBe(true)
    expect(istStrassenHalt({ public_transport: 'stop_position', bus: 'yes' })).toBe(true)
    expect(istStrassenHalt({ public_transport: 'stop_position', trolleybus: 'yes' })).toBe(true)
    expect(istStrassenHalt({ public_transport: 'stop_position', tram: 'yes' })).toBe(true)
  })
  it('Bahn-, Schiffs- und Seilbahnhalte zählen nicht', () => {
    expect(istStrassenHalt({ public_transport: 'stop_position', train: 'yes' })).toBe(false)
    expect(istStrassenHalt({ public_transport: 'stop_position', ferry: 'yes' })).toBe(false)
    expect(istStrassenHalt({ public_transport: 'stop_position', aerialway: 'yes' })).toBe(false)
    expect(istStrassenHalt({ public_transport: 'stop_position' })).toBe(false)
  })
})

import { teileInListe, geomLength, MIN_TEIL_M } from './osm'
import { teileLinie } from './geo'
describe('teileLinie — Polylinie am Fusspunkt zerlegen', () => {
  const linie = [pt(0, 0), pt(100, 0), pt(200, 0)]
  it('Schnitt mitten in einer Kante: beide Teile enthalten den Schnittpunkt', () => {
    const r = teileLinie(linie, pt(60, 7))!
    expect(r.a).toHaveLength(2)
    expect(r.b).toHaveLength(3)
    expect(r.a[1]).toEqual(r.b[0])
    expect(geomLength(r.a)).toBeCloseTo(60, 0)
    expect(geomLength(r.b)).toBeCloseTo(140, 0)
  })
  it('Schnitt genau auf einem Stützpunkt: keine Dublette', () => {
    const r = teileLinie(linie, pt(100, 3))!
    expect(r.a).toEqual([linie[0], linie[1]])
    expect(r.b).toEqual([linie[1], linie[2]])
  })
  it('zu kurze Linie → null', () => expect(teileLinie([pt(0, 0)], pt(0, 0))).toBeNull())
})

describe('teileInListe — Segment teilen', () => {
  const way = (): Cand => ({ ...cand(44278347, [pt(0, 0), pt(441, 0)]), len: 441, name: 'Grosser Muristalden',
    ist: 'Radstreifen', speed: 50, breite: 1.5,
    bern: { speed: 50, dtv: 9000 }, obs: { median: 1.4, mean: 1.4, count: 3, below150: 2, usage: 4 } })
  const nachbar = cand(7, [pt(441, 0), pt(600, 0)])

  it('zwei Teile mit eigenen, negativen Kennungen; Way-ID, OSM-Werte und Auswahl bleiben', () => {
    const r = teileInListe([way(), nachbar], 44278347, pt(200, 4).lat, pt(200, 4).lon)!
    const [a, b] = r.neu
    expect(a.id).toBeLessThan(0)
    expect(b.id).toBeLessThan(0)
    expect(a.id).not.toBe(b.id)
    expect([a.wayId, b.wayId]).toEqual([44278347, 44278347])
    expect([a.ist, a.speed, a.breite, a.selected]).toEqual(['Radstreifen', 50, 1.5, true])
    expect(a.len + b.len).toBeCloseTo(441, 0)
  })
  it('die Anreicherung fällt weg (wird je Teil neu abgefragt)', () => {
    const [a, b] = teileInListe([way()], 44278347, pt(200, 0).lat, pt(200, 0).lon)!.neu
    expect(a.bern).toBeUndefined()
    expect(b.obs).toBeUndefined()
  })
  it('die Teile stehen an der Stelle des alten Kandidaten, der Nachbar bleibt', () => {
    const r = teileInListe([way(), nachbar], 44278347, pt(200, 0).lat, pt(200, 0).lon)!
    expect(r.cands.map(c => c.id)).toEqual([r.neu[0].id, r.neu[1].id, 7])
  })
  it('ein zweiter Schnitt nummeriert alle Teile des Ways entlang der Way-Richtung neu', () => {
    const r1 = teileInListe([way()], 44278347, pt(300, 0).lat, pt(300, 0).lon)!
    const r2 = teileInListe(r1.cands, r1.neu[0].id, pt(100, 0).lat, pt(100, 0).lon)!
    expect(r2.cands.map(c => [c.teil!.nr, c.teil!.anzahl])).toEqual([[1, 3], [2, 3], [3, 3]])
    expect(r2.cands.map(c => Math.round(c.len))).toEqual([100, 200, 141])
  })
  it(`Klick näher als ${MIN_TEIL_M} m am Ende → kein Schnitt`, () => {
    expect(teileInListe([way()], 44278347, pt(3, 0).lat, pt(3, 0).lon)).toBeNull()
    expect(teileInListe([way()], 44278347, pt(439, 0).lat, pt(439, 0).lon)).toBeNull()
  })
  it('unbekannte Kennung → null', () => expect(teileInListe([way()], 1, 47, 7.4)).toBeNull())
})

import { istSeiten, einbahnAusTags } from './osm'
describe('istSeiten — OSM-Form je Fahrbahnseite (Way-Richtung)', () => {
  it('einseitiger Radstreifen: rechts Radstreifen, links Mischverkehr', () =>
    expect(istSeiten({ 'cycleway:right': 'lane' }, 'secondary'))
      .toEqual({ rechts: 'Radstreifen', links: 'Mischverkehr' }))
  it('cycleway:both und cycleway gelten für beide; die Seitenangabe geht vor', () => {
    expect(istSeiten({ 'cycleway:both': 'lane' }, 'tertiary')).toEqual({ rechts: 'Radstreifen', links: 'Radstreifen' })
    expect(istSeiten({ cycleway: 'lane', 'cycleway:left': 'no' }, 'tertiary'))
      .toEqual({ rechts: 'Radstreifen', links: 'Mischverkehr' })
  })
  it('verschiedene Formen je Seite (istFromTags nimmt nur die stärkste)', () =>
    expect(istSeiten({ 'cycleway:right': 'track', 'cycleway:left': 'share_busway' }, 'primary'))
      .toEqual({ rechts: 'Radweg strassenbegleitend / Geschützter Radstreifen', links: 'Umweltspur' }))
  it('eigener Weg und Velostrasse: beide Seiten gleich', () => {
    expect(istSeiten({ oneway: 'no' }, 'cycleway')).toEqual({ rechts: 'Zweirichtungsradweg', links: 'Zweirichtungsradweg' })
    expect(istSeiten({ bicycle_road: 'yes', 'cycleway:right': 'lane' }, 'residential'))
      .toEqual({ rechts: 'Velostrasse', links: 'Velostrasse' })
  })
})

describe('einbahnAusTags', () => {
  it('yes/true/1 = in Way-Richtung, -1 = dagegen', () => {
    expect(einbahnAusTags({ oneway: 'yes' })).toBe('vor')
    expect(einbahnAusTags({ oneway: '1' })).toBe('vor')
    expect(einbahnAusTags({ oneway: '-1' })).toBe('rueck')
  })
  it('Kreisel ohne oneway-Tag ist Einbahn; oneway=no nicht', () => {
    expect(einbahnAusTags({ junction: 'roundabout' })).toBe('vor')
    expect(einbahnAusTags({ junction: 'roundabout', oneway: 'no' })).toBeUndefined()
    expect(einbahnAusTags({})).toBeUndefined()
  })
})

describe('wayToCand — Seiten, Breite je Seite, Einbahn', () => {
  const geom = [pt(0, 0), pt(100, 0)]
  it('Strasse: Form und Breite je Seite', () => {
    const c = wayToCand({ id: 1, geometry: geom, tags: { highway: 'secondary',
      'cycleway:right': 'lane', 'cycleway:right:width': '1.5', 'cycleway:left': 'lane', 'cycleway:left:width': '1,2' } })!
    expect(c.seiten).toEqual({ rechts: 'Radstreifen', links: 'Radstreifen' })
    expect(c.breiteSeiten).toEqual({ rechts: 1.5, links: 1.2 })
    expect(c.einbahn).toBeUndefined()
  })
  it('Radweg: keine Breite je Seite (die Breite des Wegs gilt für beide)', () =>
    expect(wayToCand({ id: 1, geometry: geom, tags: { highway: 'cycleway', width: '3' } })!.breiteSeiten).toBeUndefined())
  it('Einbahn mit Velogegenverkehr', () => {
    const c = wayToCand({ id: 1, geometry: geom, tags: { highway: 'residential', oneway: 'yes', 'oneway:bicycle': 'no' } })!
    expect(c.einbahn).toBe('vor')
    expect(c.veloGegenverkehr).toBe(true)
  })
})

import { spurenAusTags } from './osm'
import { candToSection, defaultSection } from './strecke'
import type { Markierung } from './aufteilung'
import { startAufteilung, pfeileVon, markierungAus, pruefeTeil, umfeldVon, formJeSeite } from './aufteilung'
describe('Fahrspuren und Pfeile aus OSM (lanes, turn:lanes; Kirchenfeldstrasse, way 44425592)', () => {
  const kirchenfeld = { highway: 'primary', name: 'Kirchenfeldstrasse', 'cycleway:both': 'lane', lanes: '3', 'lanes:forward': '2',
    'lanes:backward': '1', maxspeed: '50', 'turn:lanes:forward': 'left|through;right' }
  it('je Richtung Anzahl und Pfeile, von links nach rechts', () => {
    expect(spurenAusTags(kirchenfeld, undefined)).toEqual({ vor: ['links', 'geradeaus-rechts'], rueck: ['keine'] })
    expect(spurenAusTags({ lanes: '4' }, undefined)).toEqual({ vor: ['keine', 'keine'], rueck: ['keine', 'keine'] })
    expect(spurenAusTags({ lanes: '3' }, undefined)).toBeUndefined()            // ungerade, ohne Aufteilung: offen
    expect(spurenAusTags({ lanes: '3', 'lanes:backward': '1' }, undefined)).toEqual({ vor: ['keine', 'keine'], rueck: ['keine'] })
    expect(spurenAusTags({ lanes: '2', 'turn:lanes': 'left|through' }, 'vor')).toEqual({ vor: ['links', 'geradeaus'], rueck: [] })
    expect(spurenAusTags({ highway: 'residential' }, undefined)).toBeUndefined()
    // alle Spuren in einer Richtung (Kirchenfeldstrasse 1349754377): Gegenrichtung ohne Spur
    expect(spurenAusTags({ lanes: '2', 'turn:lanes:forward': 'left|through;right' }, undefined)).toEqual({ vor: ['links', 'geradeaus-rechts'], rueck: [] })
  })
  it('alle Spuren in Richtung A (Kirchenfeldstrasse 1349754377): Ausgangslage mit zwei Spuren der Seite A, keine Spur B', () => {
    const s = { ...defaultSection(), ist: 'Radstreifen' as const, breite: 1.5, fahrbahnbreite: 10,
      spuren: { a: ['links', 'geradeaus-rechts'] as Markierung[], b: [] as Markierung[] } }
    const sp = startAufteilung(s).teile.filter(t => t.art === 'Fahrspur')
    expect(sp.map(t => [t.richtung, t.markierung])).toEqual([['A', 'links'], ['A', 'geradeaus-rechts']])
  })
  it('Pfeile kombiniert und zurück', () => {
    expect(pfeileVon('geradeaus-rechts')).toEqual(['geradeaus', 'rechts'])
    expect(markierungAus(['rechts', 'links', 'geradeaus'])).toBe('alle')
    expect(markierungAus([])).toBe('keine')
  })
  const geom = [{ lat: 46.9401504, lon: 7.4502236 }, { lat: 46.9401713, lon: 7.4508273 }]
  it('Ausgangslage: links eine Spur entgegen, rechts zwei mit «←» und «↑→»; gegen die Way-Richtung gespiegelt', () => {
    const c = wayToCand({ id: 44425592, tags: kirchenfeld, geometry: geom })!
    const s = { ...candToSection(c), fahrbahnbreite: 13.0 }
    expect(s.spuren).toEqual({ a: ['links', 'geradeaus-rechts'], b: ['keine'] })
    const spuren = startAufteilung(s, 'bern').teile.filter(t => t.art === 'Fahrspur')
    expect(spuren.map(t => [t.richtung, t.markierung ?? 'keine'])).toEqual([['B', 'keine'], ['A', 'links'], ['A', 'geradeaus-rechts']])
    expect(spuren.map(t => t.breite)).toEqual([3.1, 3.15, 3.15])   // 9,40 m auf drei Spuren, der Rest links
    const g = candToSection(c, false)
    expect(g.spuren).toEqual({ a: ['keine'], b: ['links', 'geradeaus-rechts'] })
  })
})

describe('Einbahn mit Bus bzw. Tram im Gegenverkehr (Helvetiaplatz, way 498934010)', () => {
  const tags = { highway: 'tertiary', lanes: '1', maxspeed: '50', name: 'Helvetiaplatz', oneway: 'yes', 'oneway:bus': 'no' }
  const geom = [{ lat: 46.9438406, lon: 7.449296 }, { lat: 46.9436614, lon: 7.4497644 }]
  it('erkannt aus oneway:bus=no; die Ausgangslage hat eine Gegenspur in Richtung B (mit Tram je ein Tram pro Richtung)', () => {
    const c = wayToCand({ id: 498934010, tags, geometry: geom })!
    expect(c.oevGegen).toBe(true)
    const s = { ...candToSection(c), fahrbahnbreite: 7.3, tram: true }
    expect(s.richtung).toBe('eine')
    const spuren = startAufteilung(s, 'bern').teile.filter(t => t.art === 'Tram' || t.art === 'Fahrspur')
    expect(spuren.map(t => [t.art, t.richtung])).toEqual([['Tram', 'B'], ['Tram', 'A']])
    const bus = startAufteilung({ ...s, tram: false }, 'bern').teile.filter(t => t.art === 'Fahrspur')
    expect(bus.map(t => [t.richtung, t.bild])).toEqual([['B', 'bus'], ['A', undefined]])
  })
  it('ohne oneway:bus=no keine Gegenspur', () =>
    expect(wayToCand({ id: 1, tags: { ...tags, 'oneway:bus': undefined as unknown as string }, geometry: geom })!.oevGegen).toBeUndefined())
})

describe('OSM: Radweg als eigener Weg (cycleway:left=separate, Monbijoustrasse)', () => {
  it('als Hinweis je Seite, ohne Führungsform', () => {
    const c = wayToCand({ id: 44425585, tags: { highway: 'secondary', 'cycleway:left': 'separate', 'cycleway:right': 'no', maxspeed: '30' },
      geometry: [{ lat: 46.93655, lon: 7.43656 }, { lat: 46.93698, lon: 7.43645 }] })!
    expect(c.radwegSeparat).toEqual({ rechts: false, links: true })
    const s = candToSection(c)
    expect(s.radwegSeparat).toEqual({ a: false, b: true })
    expect(s.ist).toBe('Mischverkehr')
  })
})

describe('Umweltspur (Schwarzenburgstrasse, way 1568298241; 21.10.2026)', () => {
  const tags = { highway: 'secondary', 'cycleway:left': 'share_busway', lanes: '3', 'lanes:backward': '2', 'lanes:bus:backward': '1', 'lanes:forward': '1', maxspeed: '50' }
  const geom = [{ lat: 46.9372, lon: 7.4260 }, { lat: 46.9362, lon: 7.4252 }]
  it('Seite B Umweltspur mit Busspur in OSM; Takt aus dem Fahrplan vorbelegt', () => {
    const c = wayToCand({ id: 1568298241, tags, geometry: geom })!
    expect(c.spuren).toEqual({ vor: ['keine'], rueck: ['keine', 'keine'], busRueck: 1 })
    const s = candToSection({ ...c, bern: { oevBus: true, streckePerH: 8, streckeHalt: 'Dübystrasse' } }, true)
    expect([s.ist, s.gegen?.ist]).toEqual(['Mischverkehr', 'Umweltspur'])
    expect([s.gegen?.oevTakt, s.gegen?.quelle.oevTakt]).toEqual([7.5, 'fahrplan'])
    expect(s.spuren).toEqual({ a: ['keine'], b: ['keine', 'keine'], busB: 1 })
  })
  it('Ausgangslage: die Umweltspur ersetzt die Busspur der Seite B; Vorgabe Q 4 und Takt-Hinweis', () => {
    const c = wayToCand({ id: 1568298241, tags, geometry: geom })!
    const s = { ...candToSection({ ...c, bern: { oevBus: true, streckePerH: 10 } }, true), fahrbahnbreite: 10.2, routentyp: 'Velohauptroute' as const }
    const a = startAufteilung(s, 'bern')
    expect(a.teile.map(t => [t.art, t.breite])).toEqual([['Umweltspur', 4.5], ['Fahrspur', 2.85], ['Fahrspur', 2.85]])
    const p = pruefeTeil(a.teile[0], 'Velohauptroute', undefined, umfeldVon(s, a.teile, undefined, 'bern'))
    expect([p.soll, p.status]).toEqual([4.5, 'ok'])
    expect(p.hinweis).toContain('Bus-Takt 6,0 Min: unter 7,5 Min')
    expect(formJeSeite(a.teile, 'B')?.ist).toBe('Umweltspur')
  })
})
