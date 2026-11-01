import { describe, it, expect } from 'vitest'
import { mitParallelen, parallelWege } from './parallelwege'
import { candsToSections, candToSection, seiteA, seiteB } from './strecke'
import type { Cand } from './VeloMap'

// Strasse nach Osten (100 m), Radweg 6 m südlich (rechts der Way-Richtung), Fussweg-Velo 6 m nördlich
const lat = 46.95, lon = 7.44, dLat = 6 / 111320
const strasse: Cand = { id: 1, wayId: 1, ist: 'Mischverkehr', seiten: { rechts: 'Mischverkehr', links: 'Mischverkehr' }, len: 100, name: 'Schwarzenburgstrasse',
  geom: [{ lat, lon }, { lat, lon: lon + 100 / (111320 * Math.cos(lat * Math.PI / 180)) }], selected: true, speed: 50 }
const radweg: Cand = { id: 2, wayId: 26177986, ist: 'Radweg abgesetzt', len: 100, name: 'Schwarzenburgstrasse', ohneFahrbahn: true, einbahn: 'vor', breite: 1.5,
  geom: strasse.geom.map(p => ({ lat: p.lat - dLat, lon: p.lon })), selected: true }
const fussweg: Cand = { id: 3, wayId: 3, ist: 'Fussweg Velo gestattet', len: 100, name: 'Schwarzenburgstrasse', ohneFahrbahn: true,
  geom: strasse.geom.map(p => ({ lat: p.lat + dLat, lon: p.lon })), selected: true }

describe('Parallele Wege als Veloführung der Strasse (Schwarzenburgstrasse, 21.10.2026)', () => {
  it('Einbahn-Radweg rechts in Way-Richtung → Way-Seite rechts; Fussweg beidseitig', () => {
    const { zuordnung, wege } = parallelWege([strasse, radweg, fussweg])
    expect([...wege]).toEqual([2, 3])
    const z = zuordnung.get(1)!
    expect(z.rechts).toMatchObject({ wayId: 26177986, form: 'Radweg abgesetzt', breite: 1.5, beide: false })
    expect(z.links).toMatchObject({ wayId: 3, form: 'Fussweg Velo gestattet', beide: true })
  })
  it('Abschnitt: Seite A Radweg abgesetzt 1,50 m aus dem Weg, Seite B der Fussweg; der Weg ist abgewählt', () => {
    const mit = mitParallelen([strasse, radweg, fussweg])
    expect(mit.filter(c => c.selected).map(c => c.id)).toEqual([1])
    const s = candToSection(mit[0])
    expect([seiteA(s).ist, seiteA(s).breite, s.quelle.ist, s.quelle.breite]).toEqual(['Radweg abgesetzt', 1.5, 'osm', 'osm'])
    expect(seiteB(s).ist).toBe('Fussweg Velo gestattet')
    expect(s.parallelWeg).toEqual({ a: 26177986, b: 3 })
    expect(candsToSections(mit)).toHaveLength(1)
  })
  it('ein Weg weit weg bleibt eigener Abschnitt', () => {
    const fern: Cand = { ...radweg, id: 4, wayId: 4, geom: radweg.geom.map(p => ({ lat: p.lat - 10 * dLat, lon: p.lon })) }
    const mit = mitParallelen([strasse, fern])
    expect(mit.every(c => c.selected)).toBe(true)
    expect(candsToSections(mit)).toHaveLength(2)
  })
})
