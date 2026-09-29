// ── Zahlen-Ein-/Ausgabe (de-CH) und CSV-Export (client-seitig, ohne Library) ──
//
// Aus App.tsx herausgelöst (29.09.2026), damit Zahlen-Parser und Export testbar sind (csv.test.ts).

import { brauchtDtvTempo, erfuellungsgrad, type NotenErgebnis, type Stadt } from './fuehrungsform'
import { dtvAssumed, type Quelle, type Section } from './strecke'

// «2,3» (Schweizer Komma) und «2.3» gleichermassen lesen; Unlesbares/Leeres wird NaN
// («Eingabe nötig») statt still 0 — 0 wäre notenwirksam falsch (DTV 0, Breite 0).
// Tausender-Trennzeichen der Schweizer Schreibweise (Apostroph, auch typografisch, und
// Leerzeichen) werden überlesen: «10'000» war bis zum 29.09.2026 unlesbar. Der PUNKT bleibt
// Dezimalzeichen («5.000» = 5) — er ist in der Schweiz keines für Tausender, und ihn
// umzudeuten machte aus der Breite «2.500» m zweieinhalb Kilometer.
export function parseZahl(r: string): number {
  const t = r.trim().replace(/['’`\s  ]/g, '').replace(',', '.')
  if (t === '') return NaN
  const n = Number(t)
  return Number.isFinite(n) ? Math.max(0, n) : NaN
}

// Zahl im de-CH-Format (Komma-Dezimal); leer, wenn nicht gesetzt.
export const numDE = (x: number, dec = 0) => (Number.isFinite(x) ? x.toFixed(dec).replace('.', ',') : '')

export const QUELLE_LABEL: Record<Quelle, string> = {
  amtlich: 'Geoportal', osm: 'OSM', manuell: 'manuell', fahrplan: 'opentransportdata',
  markierung: 'Markierung', angenommen: 'angenommen ≤2000',
}

// CSV-Feld maskieren (Semikolon-getrennt, de-CH/Excel).
// Text, der mit = + - @ (oder Tab/CR) beginnt, liest eine Tabellenkalkulation als FORMEL. Die
// Spalte «Strecke/Herkunft» trägt den OSM-Strassennamen, also Fremdtext — ein vorangestellter
// Apostroph macht daraus wieder Text. Zahlen (auch negative) bleiben unberührt.
export const csvCell = (v: string | number) => {
  let s = String(v ?? '')
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function buildCsv(
  sections: Section[], results: (NotenErgebnis | null)[], streckeNote: number | null,
  city: Stadt, stadtLabel: string, abrufdatum = new Date().toISOString().slice(0, 10),
): string {
  const head = [
    'Abschnitt', 'Strecke/Herkunft', 'DTV [Fz/Tag]', 'DTV-Quelle', 'Tempo [km/h]', 'Tempo-Quelle',
    'Ist-Führungsform', 'Ist-Quelle', 'Breite [m]', 'Breite-Quelle', 'Routentyp', 'Routentyp-Quelle',
    'Strassentyp', 'Strassentyp-Quelle',
    'Parkierung rechts', 'Sicherheitsstreifen', 'Tram in Fahrbahn', 'ÖV-Angebot', 'Haltestellentyp', 'Soll-Führungsform', 'Note', 'Erfüllungsgrad',
    'OBS Median [m]', 'OBS n', 'OBS <1,5m [%]', 'OBS Befahrungen',
    'Stadt', 'Abrufdatum',   // Kontext des Exports: welcher Standard galt, wann waren die Live-Quellen gezogen
    // Neue Spalten stehen AM ENDE, damit bestehende Auswertungen ihre Spaltenpositionen behalten.
    // Beide Werte wirken auf die Note und fehlten bis zum 29.09.2026 — die Note liess sich aus
    // dem Export nicht nachrechnen.
    'ÖV-Takt [Min]', 'Breite Haltestelle [m]',
  ]
  const rows = sections.map((s, i) => {
    const r = results[i]
    const obs = s.obs
    const obsPct = obs && obs.count > 0 ? Math.round(100 * obs.below150 / obs.count) : NaN
    return [
      `Abschnitt ${i + 1}`, s.label ?? '',
      numDE(s.dtv), s.quelle.dtv ? QUELLE_LABEL[s.quelle.dtv] : (dtvAssumed(s, city) ? QUELLE_LABEL.angenommen : ''),
      numDE(s.speed), s.quelle.speed ? QUELLE_LABEL[s.quelle.speed] : '',
      s.ist || '', s.quelle.ist ? QUELLE_LABEL[s.quelle.ist] : '',
      numDE(s.breite, 2), s.quelle.breite ? QUELLE_LABEL[s.quelle.breite] : '',
      s.routentyp || '', s.quelle.routentyp ? QUELLE_LABEL[s.quelle.routentyp] : '',
      s.strassentyp || '', s.quelle.strassentyp ? QUELLE_LABEL[s.quelle.strassentyp] : '',
      s.parkenRechts,
      s.parkenRechts === 'ja' ? (s.parkenSicherheitsstreifen ? 'ja' : 'nein') : '',
      s.tram ? 'ja' : 'nein', s.oevAngebot, s.haltestellentyp,
      r && brauchtDtvTempo(r.ist) ? r.soll : '',   // ohne DTV/Tempo hätte ein Soll keine Bedeutung
      r ? numDE(r.note, 1) : 'unvollständig', r ? erfuellungsgrad(r.note) : '',
      obs && obs.count > 0 ? numDE(obs.median, 2) : '',
      obs ? String(obs.count) : '', Number.isFinite(obsPct) ? String(obsPct) : '',
      obs ? String(obs.usage) : '',
      stadtLabel, abrufdatum,
      s.ist === 'Umweltspur' ? numDE(s.oevTakt, 1) : '',
      s.oevAngebot !== 'keine' ? numDE(s.haltestelleBreite, 2) : '',
    ]
  })
  // Schlusszeile: Strecken-Note (schlechtester Abschnitt). Spalten aus dem Kopf abgeleitet,
  // damit die Zeile bei Spaltenänderungen ausgerichtet bleibt.
  const foot = head.map((h, i) =>
    i === 0 ? 'Strecke' : i === 1 ? 'schlechtester Abschnitt' :
    h === 'Note' ? (streckeNote != null ? numDE(streckeNote, 1) : 'unvollständig') :
    h === 'Erfüllungsgrad' ? (streckeNote != null ? erfuellungsgrad(streckeNote) : '') : '')
  return [head, ...rows, foot].map(row => row.map(csvCell).join(';')).join('\r\n')
}
