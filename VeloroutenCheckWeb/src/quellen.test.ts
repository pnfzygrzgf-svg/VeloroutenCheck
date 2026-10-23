import { describe, expect, it } from 'vitest'
import { QUELLEN, quellenFuer, quellenZeile } from './quellen'

describe('Quellenverzeichnis (quellen.ts)', () => {
  it('Kennungen sind eindeutig, Adressen sind https, Städte gültig', () => {
    const ids = QUELLEN.map(q => q.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const q of QUELLEN) {
      if (q.url) expect(q.url.startsWith('https://')).toBe(true)
      for (const s of q.staedte ?? []) expect(['bern', 'zurich', 'basel', 'luzern']).toContain(s)
      expect(q.verwendung.length).toBeGreaterThan(20)
    }
  })
  it('je Stadt die allgemeinen und die eigenen Werke, nicht die der anderen', () => {
    const bern = quellenFuer('bern').map(q => q.id), zh = quellenFuer('zurich').map(q => q.id)
    expect(bern).toContain('mp_velo_bern'); expect(bern).toContain('mp_fuss_bern'); expect(bern).not.toContain('velostandards_zh')
    expect(zh).toContain('mp_velo_bern'); expect(zh).toContain('velostandards_zh'); expect(zh).not.toContain('mp_fuss_bern')
    expect(quellenFuer('luzern', 'daten').some(q => q.id === 'av')).toBe(false)   // Luzern: Strassenflächen statt AV
    expect(quellenFuer('basel', 'vorgabe').every(q => q.gruppe === 'vorgabe')).toBe(true)
  })
  it('Zeile für den Bericht: Name, Titel, Herausgeber, Ausgabe, Adresse', () => {
    const q = QUELLEN.find(x => x.id === 'velostandards_zh')!
    expect(quellenZeile(q)).toBe(`Velostandards Stadt Zürich · Stadt Zürich, Tiefbauamt (2024-03-22) · ${q.url}`)
    const n = QUELLEN.find(x => x.id === 'sn640201')!
    expect(quellenZeile(n)).toBe('SN 640 201: Geometrisches Normalprofil; Grundabmessungen und Lichtraumprofil der Verkehrsteilnehmer · VSS')
  })
})
