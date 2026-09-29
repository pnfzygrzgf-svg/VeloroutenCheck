import { describe, it, expect } from 'vitest'
import { istFromTags, naechsterKandidat, osmBreite, overpassRegexExakt, wayToCand } from './osm'
import { escapeHtml } from './netz'
import type { Cand } from './VeloMap'

const M_LAT = 1 / 111320
const M_LON = 1 / (111320 * Math.cos((47 * Math.PI) / 180))
const pt = (xM: number, yM: number) => ({ lat: 47 + yM * M_LAT, lon: 7.4 + xM * M_LON })
const cand = (id: number, geom: { lat: number; lon: number }[]): Cand =>
  ({ id, ist: 'Mischverkehr', len: 0, name: 'x', geom, selected: true })

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
