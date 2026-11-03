import { expect, it, afterEach } from 'vitest'
import * as stand from './datenstand'
afterEach(() => stand.datenlaufNeu())
it('Ergänzung behält übernommene Quellen, verwirft aber nicht übernommene Teilergebnisse des alten Ladevorgangs', () => {
  stand.datenlaufNeu()
  stand.meldeQuelleStand('alt', 'Übernommene Quelle', 'https://example.test/alt', 'av', '2026')
  const a = stand.datenlaufNeu({ behalten: true, uebernahmeAbwarten: true })
  stand.meldeQuelleStand('nieGezeigt', 'E6 einer offenen Ladung', 'https://example.test/a', 'e6.sg.licht', '2026')
  const b = stand.datenlaufNeu({ behalten: true, uebernahmeAbwarten: true })
  expect(stand.datenStaende().map(s => s.id)).toEqual(['alt'])
  stand.meldeQuelleStand('verspaetet', 'Verspätet', 'https://example.test/spaet', 'e6.sg.licht', '2026', undefined, a)
  expect(stand.datenStaende().map(s => s.id)).toEqual(['alt'])
  let angewandt = false
  expect(stand.datenlaufUebernehmen(a, () => { angewandt = true })).toBe(false)
  expect(angewandt).toBe(false)
  stand.meldeQuelleStand('neu', 'Neue Ebene', 'https://example.test/neu', 'e6.sg.licht', '2026', undefined, b)
  expect(stand.datenlaufUebernehmen(b, () => { angewandt = true })).toBe(true)
  expect(angewandt).toBe(true)
  stand.datenlaufNeu({ behalten: true, uebernahmeAbwarten: true })
  expect(stand.datenStaende().map(s => s.id).sort()).toEqual(['alt', 'neu'])
})
