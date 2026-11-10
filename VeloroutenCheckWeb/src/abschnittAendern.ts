import type { Section, QuelleFeld, SeitenQuelle } from './strecke'

const TRACKED: QuelleFeld[] = ['dtv', 'speed', 'ist', 'breite', 'routentyp', 'oevAngebot', 'tram', 'strassentyp', 'richtung',
  'fahrbahnbreite', 'parkenRechts', 'oevTakt', 'tempoRegime']

/** Gemeinsamer Zustandswechsel für Formular und Quellenwahl; aus dem App-Aufrufer herausgelöst. */
export function abschnittAendern(s: Section, patch: Partial<Section>, velostrasseNachfuehren: (s: Section) => Section = s => s): Section {
  const quelle = { ...s.quelle }
  for (const k of TRACKED) if (k in patch) {
    const wert = patch[k]
    if (wert === undefined || typeof wert === 'number' && !Number.isFinite(wert) || wert === '' || k === 'parkenRechts' && wert === 'egal') delete quelle[k]
    else quelle[k] = patch.quelle?.[k] ?? 'manuell'
  }
  if (patch.gegen) {
    patch = { ...patch, gegen: { ...patch.gegen, quelle: { ...patch.gegen.quelle } } }
    for (const k of ['ist', 'breite', 'parkenRechts', 'oevTakt'] as const) {
      const wert = patch.gegen![k]
      if (typeof wert === 'number' && !Number.isFinite(wert) || wert === '' || k === 'parkenRechts' && wert === 'egal') delete patch.gegen!.quelle[k]
    }
  }
  const neu = { ...s, ...patch, quelle }
  // Das bewusste Leeren ist kein fehlender Eintrag in einem vollständig abgefragten Berner Inventar.
  if ('dtv' in patch && !Number.isFinite(patch.dtv)) neu.dtvGeprueft = false
  if ('trottoir' in patch) neu.trottoirQuelle = 'manuell'
  neu.offeneQuellen = (patch.offeneQuellen ?? s.offeneQuellen ?? []).filter(f =>
    !Object.keys(patch).some(k => f === k || f === 'a.' + k) &&
    !(f.startsWith('b.') && patch.gegen?.quelle[f.slice(2) as keyof SeitenQuelle] === 'manuell'))
  if (!patch.feldAuswahl) {
    neu.feldAuswahl = { ...s.feldAuswahl }
    for (const k of TRACKED) if (k in patch) {
      delete neu.feldAuswahl[k]
      delete neu.feldAuswahl['a.' + k]
    }
    if (patch.gegen) for (const k of ['ist', 'breite']) {
      if (patch.gegen.quelle[k as 'ist' | 'breite'] === 'manuell') delete neu.feldAuswahl['b.' + k]
    }
  }
  for (const k of ['dtv', 'speed'] as const) if (k in patch && !patch.e5Auswahl) {
    neu.e5Auswahl = { ...neu.e5Auswahl }
    delete neu.e5Auswahl[k]
    neu.e5Bestaetigt = { ...neu.e5Bestaetigt }
    delete neu.e5Bestaetigt[k]
  }
  return ['fahrbahnbreite', 'ist', 'parkenRechts', 'gegen', 'richtung'].some(k => k in patch) ? velostrasseNachfuehren(neu) : neu
}
