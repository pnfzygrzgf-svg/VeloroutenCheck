import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  fuehrungsart, fuehrungsformNote, haltestellenLoesung, haltestellenTypen, haltestellenMitBreite, PARKEN_RELEVANT,
  brauchtBreite, brauchtDtvTempo, erfuellungsgrad, vergleichsNoten, BREITEN_ZUERICH, BREITEN_BASEL, BREITEN_LUZERN,
  GEGENVERKEHR_FORMEN, GEGENVERKEHR_DEFAULT,
  type Fuehrungsart, type IstFuehrungsform, type Routentyp, type ParkenRechts,
  type OevAngebot, type Haltestellentyp, type Haltestellenloesung, type NotenErgebnis, type BreitenSoll,
  type Stadt, type Strassentyp, type VergleichsNote,
} from './fuehrungsform'
import { VeloMap, ISTCOLOR, type Cand, type SectionMarker, type Stop } from './VeloMap'
import {
  candsToSections, defaultSection, dtvAssumed, dtvEff,
  type Quelle, type QuelleFeld, type Section,
} from './strecke'
import { loadBboxCandidates, loadNearestCandidate, loadStreetCandidates } from './osm'
import { buildCsv, numDE, parseZahl } from './csv'
import type { Anreicherung } from './cityShared'
import * as bern from './bern'
import * as zurich from './zurich'
import * as basel from './basel'
import * as luzern from './luzern'
// import * as stgallen from './stgallen'   // St. Gallen vorerst nicht weiterverfolgt (siehe CITIES)
import { type OevInfo } from './bern'
import { enrichObs, type ObsStats } from './obs'
import { enrichVelostreifen, type VeloInfo } from './velostreifen'

// ── Städte-Registry: pro Stadt die Datenquellen + Beschriftungen bündeln ───────
// Alle Adapter (bern/zurich/basel/luzern/stgallen.ts) tragen dieselben Schnittstellen.
type CityId = Stadt   // 'bern' | 'zurich' | 'basel' | 'luzern' (St. Gallen vorerst nicht weiterverfolgt)
type LoadOevResult = { byId: Map<number, OevInfo & { oevQuelle?: 'amtlich' | 'osm' }>; stops: Stop[]; fehler: string[] }
interface CityCfg {
  label: string                                   // Anzeigename (Meldungen, UI)
  osmArea: string                                 // OSM-Gebietsname für die Strassen-Abfrage
  center: [number, number]                        // Anfangs-Kartenmitte
  attribution: string                             // Quellenangabe der amtlichen Anreicherung (Chip/Karte)
  enrichCands: (cands: Cand[]) => Promise<Anreicherung>
  loadOev: (cands: Cand[]) => Promise<LoadOevResult>
  obsFile?: string                                // OpenBikeSensor-Snapshot (public/), falls vorhanden
  velostreifenFile?: string                       // lokaler Markierungs-Snapshot (nicht öffentlich), falls vorhanden
  breiten?: Partial<Record<IstFuehrungsform, BreitenSoll>>  // stadtspezifische Breiten-Sollwerte (sonst Bern)
  breitenQuelle?: string                          // Quellenangabe der stadtspez. Breiten (sonst „Masterplan Bern")
  standardDoc: { titel: string; url: string }     // massgebendes Grundlagendokument (Rechnerseite)
  routenOptions?: { value: Routentyp; label: string }[]  // stadtspez. Routentyp-Labels (sonst kanonische Namen)
}
const CITIES: Record<CityId, CityCfg> = {
  bern: {
    label: 'Bern', osmArea: 'Bern', center: [46.948, 7.447],
    attribution: 'Geoinformation Stadt Bern',
    enrichCands: bern.enrichCands, loadOev: bern.loadOev, obsFile: 'obs_bern.json',
    velostreifenFile: 'velostreifen_bern.json',   // lokaler Snapshot; im öffentlichen Build nicht vorhanden
    standardDoc: {
      titel: 'Standards Masterplans Veloinfrastruktur Stadt Bern',
      url: 'https://www.bern.ch/velohauptstadt/infrastruktur/masterplan-veloinfrastruktur',
    },
    // Bern verwendet die kanonischen Namen direkt → kein routenOptions nötig
  },
  zurich: {
    label: 'Zürich', osmArea: 'Zürich', center: [47.374, 8.541],
    attribution: 'Geodaten Stadt Zürich',
    enrichCands: zurich.enrichCands, loadOev: zurich.loadOev, obsFile: 'obs_zurich.json',
    breiten: BREITEN_ZUERICH, breitenQuelle: 'Velostandards Zürich',   // Rest → Bern-Fallback
    standardDoc: {
      titel: 'Velostandards Stadt Zürich',
      url: 'https://www.stadt-zuerich.ch/content/dam/web/de/aktuell/publikationen/2024/velostandards-stadt-zuerich/velostandards-stadt-zuerich.pdf',
    },
    routenOptions: [
      { value: 'Velohauptroute', label: 'Velovorzugsroute' },
      { value: 'Veloroute',      label: 'Hauptnetz' },
    ],
  },
  basel: {
    label: 'Basel', osmArea: 'Basel', center: [47.557, 7.589],
    attribution: 'Geodaten Kanton Basel-Stadt',
    enrichCands: basel.enrichCands, loadOev: basel.loadOev,   // kein OBS-Snapshot
    breiten: BREITEN_BASEL, breitenQuelle: 'Standards Basel-Stadt',
    standardDoc: {
      titel: 'Standards Fuss- und Velo-Verkehrsinfrastruktur',
      url: 'https://media.bs.ch/original_file/72373a2c610e23b19ae61cd148ad22f35b3d1fe2/2024-09-27-standards-fvv-is-bs.pdf',
    },
    routenOptions: [
      { value: 'Velohauptroute', label: 'Vorzugsroute' },
      { value: 'Veloroute',      label: 'Pendler-/Basisroute' },
    ],
  },
  luzern: {
    label: 'Luzern', osmArea: 'Luzern', center: [47.050, 8.307],
    attribution: 'Geodaten Stadt Luzern',
    enrichCands: luzern.enrichCands, loadOev: luzern.loadOev,   // kein Tram, kein OBS-Snapshot
    breiten: BREITEN_LUZERN, breitenQuelle: 'Standards Stadt Luzern',
    standardDoc: {
      titel: 'Standards Veloverkehr Stadt Luzern',
      url: 'https://www.stadtluzern.ch/_docn/2965064/Standards_Veloverkehr.pdf',
    },
    routenOptions: [
      { value: 'Velohauptroute', label: 'Velohauptroute' },
      { value: 'Veloroute',      label: 'Hauptroute' },
    ],
  },
  // St. Gallen vorerst nicht weiterverfolgt → nicht auswählbar. Adapter (stgallen.ts) bleibt
  // erhalten; zum Reaktivieren den Eintrag (und den Import oben) wieder einkommentieren.
  // stgallen: {
  //   label: 'St. Gallen', osmArea: 'St. Gallen', center: [47.424, 9.377],
  //   attribution: 'Geodaten Stadt St. Gallen',
  //   enrichCands: stgallen.enrichCands, loadOev: stgallen.loadOev,   // kein Tram, kein OBS-Snapshot
  // },
}

// Kurzlabel je Stadt für die kompakte Vergleichszeile (andere Standards).
const STADT_KURZ: Record<CityId, string> = { bern: 'BE', zurich: 'ZH', basel: 'BS', luzern: 'LU' }

// Quellenangabe der amtlichen Anreicherung für den Herkunfts-Chip (stadtabhängig).
const AttribContext = createContext('Geoinformation Stadt Bern')

const COLOR: Record<Fuehrungsart, { bg: string; fg: string }> = {
  'Mischverkehr':                  { bg: '#9ca3af', fg: '#ffffff' },
  'Velostrasse':                   { bg: '#2563eb', fg: '#ffffff' },
  'Radstreifen':                   { bg: '#eab308', fg: '#3b2f00' },
  'Radstreifen oder Radweg':       { bg: '#84a44b', fg: '#ffffff' },
  'Radweg':                        { bg: '#4d7c0f', fg: '#ffffff' },
}

const IST_OPTIONS: IstFuehrungsform[] = [
  'Mischverkehr', 'Radstreifen', 'Radweg strassenbegleitend / Geschützter Radstreifen', 'Radweg abgesetzt',
  'Zweirichtungsradweg', 'Umweltspur', 'Velostrasse', 'Kombinierter Fuss-/Radweg', 'Fussweg Velo gestattet',
]
const ROUTE_OPTIONS: Routentyp[] = ['Velohauptroute', 'Veloroute']
const PARKEN_OPTIONS: { value: ParkenRechts; label: string }[] = [
  { value: 'egal', label: 'Egal' },
  { value: 'nein', label: 'Nein' },
  { value: 'ja', label: 'Ja' },
]
const OEV_OPTIONS: { value: OevAngebot; label: string }[] = [
  { value: 'keine', label: 'keine Haltestelle' },
  { value: 'bus_ab15', label: 'Bus ≥ 15 Min' },
  { value: 'bus_5_15', label: 'Bus 5–15 Min' },
  { value: 'bus_unter5', label: 'Bus < 5 Min' },
  { value: 'tram', label: 'Tram' },
]
// Haltestellentyp-Auswahl je Stadt (Labels mit Stadt-Code). Die verfügbaren Typen liefert
// haltestellenTypen(stadt); '— noch offen —' (keine) wird vorangestellt.
const HALTESTELLEN_LABEL: Partial<Record<Haltestellentyp, string>> = {
  'Haltestelle mit Veloumfahrung': 'Haltestelle mit Veloumfahrung',
  'Kaphaltestelle mit Veloüberfahrt': 'Kaphaltestelle mit Veloüberfahrt',
  'Kaphaltestelle': 'Kaphaltestelle (Ausnahme)',
  'Haltestelle mit rückwärtigem Radweg': 'Haltestelle mit rückw. Radweg',
  'Inselhaltestelle': 'Inselhaltestelle',
  'Fahrbahnhaltestelle Bus': 'Fahrbahnhaltestelle Bus',
  'Busbucht': 'Busbucht',
  'Fahrbahnhaltestelle mit Veloumfahrung': 'Fahrbahnhaltestelle mit Veloumfahrung',
  'Fahrbahnhaltestelle mit Veloüberfahrt': 'Fahrbahnhaltestelle mit Veloüberfahrt',
  'Fahrbahnhaltestelle mit Veloführung auf Fahrbahn': 'Fahrbahnhaltestelle, Veloführung auf Fahrbahn',
  'Kap': 'Kap',
  'Velobypass': 'Velobypass',
  'Velo-Zeitinsel': 'Velo-Zeitinsel',
  'Fahrbahnhaltestelle': 'Fahrbahnhaltestelle',
  'Fahrbahnhaltestelle in der Umweltspur': 'Fahrbahnhaltestelle in der Umweltspur',
}
function haltestellenOptions(city: CityId): { value: Haltestellentyp; label: string }[] {
  return [
    { value: 'keine' as Haltestellentyp, label: '— noch offen —' },
    ...haltestellenTypen(city).map(t => ({ value: t, label: HALTESTELLEN_LABEL[t] ?? t })),
  ]
}

// Voraussetzungen für die Mischfläche Fuss/Velo (Q12) — reine Hinweis-Checkliste (kein Noteneinfluss)
const FUSSWEG_VORAUSSETZUNGEN = [
  'Erhöhtes Schutzbedürfnis Veloverkehr (z. B. Schulwege)',
  'Geringe Frequenz durch Fuss- und Veloverkehr',
  'Steigung oder zumindest kein Gefälle',
  'Etablierte, konfliktarme Situation',
  'Ausreichende Breite (i. d. R. ≥ 3,50 m)',
  'Fehlende Alternativen',
]

// Farbe der Note (CH-Skala: 6 = beste/grün … 1 = schlechteste/rot). Die oberen drei Grenzen
// liegen auf den Wortgrenzen von erfuellungsgrad() (5,5 / 4,5 / 3,5) — vorher sprang die Farbe
// bei 4,0, das Wort aber bei 3,5: Note 3,5 hiess «Teilweise erfüllt» und war trotzdem orange.
// Farbtöne dunkel genug für weisse Schrift (Kontrast ≥ 4,5:1).
function noteColor(n: number): { bg: string; fg: string } {
  if (n >= 5.5) return { bg: '#15803d', fg: '#ffffff' }  // Vollständig erfüllt
  if (n >= 4.5) return { bg: '#4d7c0f', fg: '#ffffff' }  // Weitgehend erfüllt
  if (n >= 3.5) return { bg: '#a16207', fg: '#ffffff' }  // Teilweise erfüllt
  if (n >= 2.5) return { bg: '#c2410c', fg: '#ffffff' }  // Gar nicht erfüllt (oberer Bereich)
  return { bg: '#b91c1c', fg: '#ffffff' }                // Gar nicht erfüllt (unterer Bereich)
}

const DTV_BANDS   = ['< 2 000', '2 000 – 5 000', '5 000 – 10 000', '> 10 000']
const SPEED_BANDS = ['≤ 30', '31 – 40', '41 – 50', '51 – 80']
const DTV_REP     = [1000, 3500, 7500, 15000]   // Repräsentant je DTV-Band (für die Tabelle)
const SPEED_REP   = [30, 40, 50, 60]            // Repräsentant je Tempo-Band

// Entscheidungstabelle Haltestellen: ÖV-Angebot (Zeilen) × Routentyp (Spalten) → Soll-Lösung.
const OEV_ROWS: { label: string; v: OevAngebot }[] = [
  { label: 'Tram', v: 'tram' },
  { label: 'Bus < 5 Min', v: 'bus_unter5' },
  { label: 'Bus 5–15 Min', v: 'bus_5_15' },
  { label: 'Bus ≥ 15 Min', v: 'bus_ab15' },
]
const ROUTE_COLS: { label: string; r: Routentyp }[] = [
  { label: 'Veloroute', r: 'Veloroute' },
  { label: 'Velohauptroute', r: 'Velohauptroute' },
]
const HALT_COLOR: Record<Haltestellenloesung, { bg: string; fg: string }> = {
  'Separate Velofläche': { bg: '#15803d', fg: '#ffffff' },
  'Übergang':            { bg: '#5f7a2e', fg: '#ffffff' },
  'Mischverkehr':        { bg: '#6b7280', fg: '#ffffff' },
}

// Herkunfts-Chip am Feld: blau „amtlich" (Geodaten Stadt Bern), grau „OSM";
// bei „manuell"/leer kein Chip. Für leere Pflichtfelder ein rötlicher „Eingabe nötig"-Chip.
function QuelleChip({ q, fehlt }: { q?: Quelle; fehlt?: boolean }) {
  const amtlichTitle = useContext(AttribContext)   // stadtabhängige Quellenangabe (Bern/Zürich)
  const map: Record<string, { t: string; bg: string; fg: string; title?: string }> = {
    amtlich: { t: 'Geoportal', bg: '#dbeafe', fg: '#1e40af', title: amtlichTitle },
    osm: { t: 'OSM', bg: 'var(--border-subtle)', fg: 'var(--text-muted-strong)', title: 'OpenStreetMap' },
    fahrplan: { t: 'opentransportdata', bg: '#dcfce7', fg: '#166534', title: 'Fahrplan (opentransportdata.swiss / GTFS)' },
    markierung: { t: 'Markierung', bg: '#ffedd5', fg: '#9a3412', title: 'Aus der Fahrbahnmarkierung ermittelter Velostreifen (lokale Auswertung)' },
    angenommen: { t: '≤ 2000 angenommen', bg: '#fef9c3', fg: '#854d0e', title: 'Flächendeckende Verkehrsdaten Bern: kein Eintrag ⇒ DTV ≤ 2000 (ausserhalb Altstadt)' },
    fehlt: { t: 'Eingabe nötig', bg: '#fee2e2', fg: '#b91c1c' },
  }
  const key = fehlt ? 'fehlt'
    : q === 'amtlich' ? 'amtlich' : q === 'osm' ? 'osm' : q === 'fahrplan' ? 'fahrplan'
    : q === 'markierung' ? 'markierung' : q === 'angenommen' ? 'angenommen' : null
  if (!key) return null
  const c = map[key]
  return (
    <span title={c.title} style={{ fontSize: 10.5, fontWeight: 700, color: c.fg, background: c.bg,
                   borderRadius: 999, padding: '1px 7px', whiteSpace: 'nowrap',
                   display: 'inline-block', verticalAlign: 'middle', marginLeft: 6,
                   cursor: c.title ? 'help' : 'default' }}>
      {c.t}
    </span>
  )
}

// Label im normalen Textfluss (kein Flex): bei zweizeiligen Labels bricht der Chip
// um, statt nach rechts in die Nachbarspalte zu überlaufen. Mindesthöhe = 2 Zeilen,
// damit die Eingabefelder über die Spalten hinweg bündig auf gleicher Höhe stehen.
function FieldLabel({ label, chip }: { label: string; chip?: React.ReactNode }) {
  return (
    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4,
                   display: 'block', minHeight: '2.8em' }}>
      {label}{chip}
    </span>
  )
}

function NumberField({ label, unit, value, onChange, chip }: {
  label: string; unit: string; value: number; onChange: (v: number) => void
  step?: number; chip?: React.ReactNode
}) {
  // Text-Feld mit lokalem Rohtext statt type="number": erlaubt das Komma («2,3») und
  // Tipp-Zwischenstände («2,»), ohne dass der Wert unterwegs zu 0 kollabiert.
  const [text, setText] = useState(Number.isFinite(value) ? String(value).replace('.', ',') : '')
  // Externe Wertänderung (OSM-Übernahme, Leeren) ins Feld spiegeln — aber nicht das
  // gerade Getippte überschreiben, solange es denselben Wert bedeutet.
  useEffect(() => {
    const p = parseZahl(text)
    const gleich = Number.isFinite(value) ? p === value : Number.isNaN(p)
    if (!gleich) setText(Number.isFinite(value) ? String(value).replace('.', ',') : '')
  }, [value])  // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 150 }}>
      <FieldLabel label={label} chip={chip} />
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="text" inputMode="decimal" value={text}
          onChange={e => { setText(e.target.value); onChange(parseZahl(e.target.value)) }}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 8,
            border: '1px solid var(--border)', fontSize: 16, textAlign: 'right',
          }}
        />
        <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{unit}</span>
      </span>
    </label>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 16, background: '#fff',
}
const fieldStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 150,
}
// Dezente Gruppen-Überschrift in der Eingabemaske (Grunddaten / ÖV-Haltestelle).
const groupLabelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--text-muted)', marginBottom: 8,
}

// ── Karte für einen Abschnitt: Eingaben + Einzelbewertung ────────────────────
function SectionCard({ index, section, bewertung, vergleich, isWorst, modus, onChange, onRemove, canRemove, onHover, breitenQuelle, city }: {
  index: number
  section: Section
  bewertung: NotenErgebnis | null
  vergleich: VergleichsNote[] | null    // Endnoten nach den Standards der anderen Städte (null = unvollständig)
  isWorst: boolean
  modus: 'note' | 'erfuellung'
  onChange: (patch: Partial<Section>) => void
  onRemove: () => void
  canRemove: boolean
  onHover?: (hovering: boolean) => void
  breitenQuelle: string                 // Herkunft der Breiten-Vorgabe (stadtspez. Standard oder Masterplan Bern)
  city: CityId                          // Stadt → bestimmt Sichtbarkeit des Strassentyp-Felds (Basel)
}) {
  const { ist } = section
  const q = section.quelle
  const bezugLabel = section.routentyp === 'Veloroute' ? 'Minimal' : 'Optimal'
  const routenOptions = CITIES[city].routenOptions ?? ROUTE_OPTIONS.map(v => ({ value: v, label: v }))
  const hatMarker = (section.candIds?.length ?? 0) > 0   // nur OSM-Abschnitte sind auf der Karte markiert

  return (
    <div onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)}
         style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 12,
                  padding: 16, marginBottom: 14,
                  boxShadow: isWorst ? '0 0 0 2px #b91c1c' : 'none' }}>
      {/* Kopfzeile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {/* Nummer wie der Karten-Marker (dunkler Kreis) — nur bei OSM-Abschnitten */}
        {hatMarker && (
          <span title="Nummer auf der Karte"
                style={{ width: 22, height: 22, borderRadius: 999, background: 'var(--text-strong)',
                         color: '#fff', fontWeight: 700, fontSize: 12, lineHeight: '22px',
                         textAlign: 'center', flexShrink: 0 }}>
            {index + 1}
          </span>
        )}
        <strong style={{ fontSize: 15 }}>Abschnitt {index + 1}</strong>
        {section.label && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{section.label}</span>
        )}
        {isWorst && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c',
                         background: '#fee2e2', borderRadius: 999, padding: '2px 8px' }}>
            massgebend für die Strecke
          </span>
        )}
        <span style={{ flex: 1 }} />
        {canRemove && (
          <button onClick={onRemove}
                  style={{ border: '1px solid var(--border)', background: '#fff', color: 'var(--text-muted)',
                           borderRadius: 8, padding: '4px 10px', fontSize: 13, cursor: 'pointer' }}>
            Entfernen
          </button>
        )}
      </div>

      {/* Eingaben — Gruppe 1: Grunddaten (Führungsform & Kontext) */}
      <div style={groupLabelStyle}>Grunddaten</div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <NumberField label="DTV MIV" unit="Fz/Tag" value={section.dtv} step={100}
                     onChange={v => onChange({ dtv: v })}
                     chip={<QuelleChip q={dtvAssumed(section, city) ? 'angenommen' : q.dtv}
                                       fehlt={ist !== '' && brauchtDtvTempo(ist) && city !== 'basel' && !Number.isFinite(section.dtv) && !dtvAssumed(section, city)} />} />
        <NumberField label="Zul. Höchstgeschwindigkeit" unit="km/h" value={section.speed} step={10}
                     onChange={v => onChange({ speed: v })}
                     chip={<QuelleChip q={q.speed} fehlt={ist !== '' && brauchtDtvTempo(ist) && !Number.isFinite(section.speed)} />} />
        <label style={fieldStyle}>
          <FieldLabel label="Vorhandene Führungsform (Ist)"
                      chip={<QuelleChip q={q.ist} fehlt={ist === ''} />} />
          <select value={GEGENVERKEHR_FORMEN.includes(ist as IstFuehrungsform) ? '__gegenverkehr__' : ist}
                  onChange={e => onChange({ ist: e.target.value === '__gegenverkehr__'
                    ? GEGENVERKEHR_DEFAULT : e.target.value as IstFuehrungsform })}
                  style={selectStyle}>
            <option value="">— wählen —</option>
            {IST_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            <option value="__gegenverkehr__">Einbahn mit Velogegenverkehr</option>
          </select>
        </label>
        {/* Zweite Stufe: Sicherung der Gegenrichtung → bestimmt die Q7-Führungsform. */}
        {GEGENVERKEHR_FORMEN.includes(ist as IstFuehrungsform) && (
          <label style={fieldStyle}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Sicherung der Gegenrichtung</span>
            <select value={ist} onChange={e => onChange({ ist: e.target.value as IstFuehrungsform })}
                    style={selectStyle}>
              <option value="Einbahn Velogegenverkehr ohne Markierung">Ohne Markierung</option>
              <option value="Einbahn Velogegenverkehr mit Markierung">Mit Markierung</option>
              <option value="Einbahn Velogegenverkehr mit baulicher Trennung">Mit baulicher Trennung (Radweg)</option>
            </select>
          </label>
        )}
        {/* Breite nur bei Formen mit Breiten-Vorgabe (optimal/minimal in IST) — gleiche Regel wie der Note-Guard. */}
        {ist !== '' && brauchtBreite(ist) && (
          <NumberField label="Breite der Führungsform" unit="m" value={section.breite} step={0.1}
                       onChange={v => onChange({ breite: v })}
                       chip={<QuelleChip q={q.breite} fehlt={!Number.isFinite(section.breite)} />} />
        )}
        <label style={fieldStyle}>
          <FieldLabel label="Routentyp" chip={<QuelleChip q={q.routentyp} />} />
          <select value={section.routentyp}
                  onChange={e => onChange({ routentyp: e.target.value as Routentyp })}
                  style={selectStyle}>
            <option value="">— wählen —</option>
            {routenOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {/* Strassentyp — nur Basel: dort ist die Soll-Wahl strassentyp- statt DTV-basiert. */}
        {city === 'basel' && (
          <label style={fieldStyle}>
            <FieldLabel label="Strassentyp" chip={<QuelleChip q={q.strassentyp} fehlt={section.strassentyp === ''} />} />
            <select value={section.strassentyp}
                    onChange={e => onChange({ strassentyp: e.target.value as Strassentyp })}
                    style={selectStyle}>
              <option value="">— wählen —</option>
              <option value="verkehrsorientiert">verkehrsorientierte Strasse</option>
              <option value="siedlungsorientiert">siedlungsorientierte Strasse</option>
            </select>
          </label>
        )}
        {/* Parkierung rechts (Dooring) bei Fahrbahn-Führungsformen (siehe PARKEN_RELEVANT) */}
        {PARKEN_RELEVANT.includes(ist as IstFuehrungsform) && (
          <label style={fieldStyle}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              Parkierung rechts (Dooring)
            </span>
            <select value={section.parkenRechts}
                    onChange={e => onChange({ parkenRechts: e.target.value as ParkenRechts })}
                    style={selectStyle}>
              {PARKEN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        )}
        {/* Sicherheitsstreifen ggü. Parkplätzen (SN 640 060) — nur wenn Parkierung rechts = Ja; hebt den Dooring-Abzug auf */}
        {PARKEN_RELEVANT.includes(ist as IstFuehrungsform) && section.parkenRechts === 'ja' && (
          <label style={{ ...fieldStyle, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={section.parkenSicherheitsstreifen}
                   onChange={e => onChange({ parkenSicherheitsstreifen: e.target.checked })} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              Sicherheitsstreifen gegenüber Parkplätzen (SN 640 060)
            </span>
          </label>
        )}
        {/* öV-Takt nur bei der Umweltspur (Bus+Velo) */}
        {ist === 'Umweltspur' && (
          <NumberField label="öV-Takt (Bus)" unit="Min" value={section.oevTakt} step={0.5}
                       onChange={v => onChange({ oevTakt: v })} />
        )}
        {/* Tram in der Fahrbahn — entkoppelt von der Haltestelle; wirkt nur bei Mischverkehr. */}
        <label style={fieldStyle}>
          <FieldLabel label="Tram in der Fahrbahn" chip={<QuelleChip q={q.tram} />} />
          <select value={section.tram ? 'ja' : 'nein'}
                  onChange={e => onChange({ tram: e.target.value === 'ja' })}
                  style={selectStyle}>
            <option value="nein">Nein</option>
            <option value="ja">Ja (Schienen in der Fahrbahn)</option>
          </select>
        </label>
      </div>

      {/* Eingaben — Gruppe 2: ÖV-Haltestelle im Abschnitt (für die Soll-Haltestellenlösung) */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
        <div style={groupLabelStyle}>ÖV-Haltestelle</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <label style={fieldStyle}>
          <FieldLabel label="ÖV-Angebot (Haltestelle)" chip={<QuelleChip q={q.oevAngebot} />} />
          <select value={section.oevAngebot}
                  onChange={e => {
                    const v = e.target.value as OevAngebot
                    // «keine Haltestelle» räumt Typ und Breite mit ab: die Felder verschwinden aus
                    // der Maske, und was unsichtbar ist, darf nicht weiterrechnen (07.08.2026).
                    onChange(v === 'keine'
                      ? { oevAngebot: v, haltestellentyp: 'keine', haltestelleBreite: NaN }
                      : { oevAngebot: v })
                  }}
                  style={selectStyle}>
            {OEV_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {section.oevAngebot !== 'keine' && (
          <label style={fieldStyle}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              Vorhandener Haltestellentyp
            </span>
            <select value={section.haltestellentyp}
                    onChange={e => onChange({ haltestellentyp: e.target.value as Haltestellentyp })}
                    style={selectStyle}>
              {haltestellenOptions(city).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        )}
        {/* Breite der Veloführung an der Haltestelle — nur bei Typen mit Breitenkriterium (stadtabhängig) */}
        {section.oevAngebot !== 'keine' && haltestellenMitBreite(city).includes(section.haltestellentyp) && (
          <NumberField label="Breite Veloführung Haltestelle" unit="m" value={section.haltestelleBreite}
                       step={0.1} onChange={v => onChange({ haltestelleBreite: v })} />
        )}
        </div>
      </div>

      {/* ÖV-Hinweis: Tram → „Tram"; Bus → Frequenzband aus dem Fahrplan (Abendspitze). Typ manuell. */}
      {section.oev?.oevHalt && (() => {
        const o = section.oev!
        const name = o.oevHaltName ? ` „${o.oevHaltName}"` : ''
        const hatTakt = o.busPerH != null && o.busPerH > 0
        const takt = hatTakt ? Math.round(60 / o.busPerH!) : null
        return (
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8,
                        background: '#faf5ff', border: '1px solid #e9d5ff', color: '#6b21a8', fontSize: 12.5 }}>
            {o.oevTram
              ? <>Geoportal: <strong>Tramhaltestelle{name}</strong> im Abschnitt → ÖV-Angebot „Tram" gesetzt. Haltestellentyp bitte wählen.</>
              : hatTakt
                ? <>Geoportal + Fahrplan: <strong>Bushaltestelle{name}</strong>, Abendspitze 17–18 h ≈ <strong>{o.busPerH} Fahrten/h</strong> (Takt ~{takt} Min, stärkste Richtung) → ÖV-Angebot gesetzt. Haltestellentyp bitte wählen.</>
                : <>Geoportal: <strong>Bushaltestelle{name}</strong> im Abschnitt erkannt → ÖV-Angebot/Takt und Haltestellentyp bitte wählen (kein Takt in den Daten).</>}
          </div>
        )
      })()}

      {/* Ergebnis des Abschnitts — oder Hinweis, solange Pflichtfelder fehlen */}
      {bewertung == null ? (
        <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 10,
                      background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412',
                      fontSize: 13.5 }}>
          <strong>Eingabe nötig:</strong> Führungsform
          {(ist === '' || brauchtDtvTempo(ist)) && ', DTV, Tempo'}
          {ist !== '' && ist !== 'Mischverkehr' && brauchtBreite(ist) && ' und Breite'} angeben — dann wird die Note berechnet.
        </div>
      ) : (
      <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 10,
                    background: noteColor(bewertung.note).bg, color: noteColor(bewertung.note).fg,
                    display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', minWidth: modus === 'erfuellung' ? 120 : 70 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase', opacity: 0.85 }}>
            {modus === 'erfuellung' ? 'Beurteilung' : 'Note'}
          </div>
          {modus === 'erfuellung' ? (
            <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.15 }}>
              {erfuellungsgrad(bewertung.note)}
            </div>
          ) : (
            <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>
              {numDE(bewertung.note, 1)}
            </div>
          )}
        </div>
        <div style={{ fontSize: 13.5, opacity: 0.97 }}>
          {/* Ohne DTV/Tempo gibt es keine Soll-Führungsform — dieselbe Quelle wie die Pflichtfelder. */}
          {brauchtDtvTempo(bewertung.ist) &&
            <div><strong>Soll:</strong> {bewertung.soll}</div>}
          <div><strong>Ist:</strong> {bewertung.ist} ({bewertung.q})</div>

          {/* Aufbau der Erklärung (seit 29.09.2026):
                1. hinweis ERSETZT nur die Zeile zur Form-Note — nicht mehr die ganze Erklärung.
                2. Ist die Note FEST gesetzt (noteFix, Kap-Regel), wirken Breite/Parkierung/
                   Haltestelle nicht und werden nicht gezeigt.
                3. Sonst stehen alle Abzüge, auch neben einem hinweis. Vorher verschwanden sie:
                   Basel «nicht konform» mit zu schmaler Breite zeigte eine Note unter 4, ohne
                   dass der Breitenabzug irgendwo stand. */}
          {bewertung.hinweis ? (
            <div style={{ marginTop: 6, fontWeight: 700 }}>⚠ {bewertung.hinweis}</div>
          ) : (
              <div style={{ marginTop: 4, opacity: 0.85 }}>
                {ist === 'Umweltspur'
                  // Basisnote aus dem Ergebnis, nicht hartkodiert: die Decke ist stadtabhängig
                  // (Bern 5, übrige 4). Die Takt-Schwelle wird bewusst nicht genannt — sie ist
                  // ebenfalls stadtabhängig, und liegt der Takt darunter, steht oben der hinweis
                  // statt dieses Satzes.
                  ? (Number.isFinite(section.oevTakt)
                      ? `öV-Takt ${section.oevTakt} Min → Basis-Note ${bewertung.basisnote} (Decke); DTV/Tempo nicht massgebend.`
                      : `Kein öV-Takt angegeben → als zulässig angenommen (Basis-Note ${bewertung.basisnote} = Decke); DTV/Tempo nicht massgebend. Für die Prüfung «zu hohe Busfrequenz» den Takt eintragen.`)
                  : ist === 'Fussweg Velo gestattet'
                    ? 'Mischfläche Fuss/Velo · Basis-Note 4 (max. «genügend»); DTV/Tempo nicht massgebend.'
                    : bewertung.erfuellt
                      ? 'Form erfüllt den Soll → Form-Note 6.'
                      : `feel-safe-Defizit ${bewertung.defizit} Pkt. → Form-Note ${numDE(bewertung.basisnote, 1)}.`}
              </div>
          )}
          {bewertung.kapTramNote1 && (
            <div style={{ marginTop: 6, opacity: 0.9 }}>
              <strong>Kaphaltestelle an Tram-Haltestelle:</strong> Note 1 — Schiene im schmalen
              Abstand zur hohen Haltekante, ohne bauliche Trennung (überschreibt alle anderen Regeln)
            </div>
          )}
          {!bewertung.noteFix && !bewertung.kapTramNote1 && (
            <>
              {/* warnung steht ZUSÄTZLICH zur Erklärung. */}
              {bewertung.warnung && (
                <div style={{ marginTop: 4, fontWeight: 700 }}>⚠ {bewertung.warnung}</div>
              )}
              {bewertung.sollbreite == null ? (
                <div style={{ marginTop: 6, opacity: 0.75 }}>Keine Breitenvorgabe für diese Form.</div>
              ) : bewertung.breite == null ? (
                <div style={{ marginTop: 6, opacity: 0.9 }}>
                  <strong>Breite:</strong> nicht angegeben · Vorgabe{' '}
                  {bewertung.maxbreite != null
                    ? `${numDE(bewertung.sollbreite, 2)}–${numDE(bewertung.maxbreite, 2)} m`
                    : `${bezugLabel} ${numDE(bewertung.sollbreite, 2)} m`}
                  {` (Quelle: ${breitenQuelle})`}
                  {!section.routentyp && ' · Routentyp wählen'}
                </div>
              ) : (
                <div style={{ marginTop: 6, opacity: 0.9 }}>
                  <strong>Breite:</strong> {numDE(bewertung.breite, 2)} m · Vorgabe{' '}
                  {bewertung.maxbreite != null
                    ? `${numDE(bewertung.sollbreite, 2)}–${numDE(bewertung.maxbreite, 2)} m`
                    : `${bezugLabel} ${numDE(bewertung.sollbreite, 2)} m`}
                  {` (Quelle: ${breitenQuelle})`}
                  {' · '}
                  {bewertung.breiteErfuellt
                    ? '✓ erfüllt'
                    : `${bewertung.breitenStatus} (${numDE(bewertung.breitenDefizit, 2)} m) → Abzug ${numDE(bewertung.breitenabzug, 1)} Note`}
                </div>
              )}
              {city === 'basel' && ist === 'Velostrasse' && bewertung.sollbreite != null && (
                <div style={{ marginTop: 4, opacity: 0.75, fontSize: 12.5 }}>
                  Nettobreite der Fahrbahn (ohne Parkierung und Sicherheitsabstand zur Parkierung).
                </div>
              )}
              {city === 'bern' && ist === 'Velostrasse' && (
                <div style={{ marginTop: 4, opacity: 0.75, fontSize: 12.5 }}>
                  Einsatzbereich: Nebenstrasse mit übergeordneter Velobedeutung, viel Veloverkehr,
                  wenig MIV und ohne ÖV.
                  {bewertung.sollbreite != null && (
                    <> Die Breitenvorgabe ist die Nettobreite der Fahrbahn (ohne Parkierung).</>
                  )}
                </div>
              )}
              {city === 'luzern' && ist === 'Velostrasse' && (
                <div style={{ marginTop: 4, opacity: 0.75, fontSize: 12.5 }}>
                  Einsatzbereich: bei gebündelter Velonutzung auf Quartierstrassen in
                  Tempo-30-Zonen; bei geringer MIV-Belastung und hohem Veloanteil (&gt; 50 %).
                </div>
              )}
              {city === 'zurich' && ist === 'Velostrasse' && (
                <div style={{ marginTop: 4, opacity: 0.75, fontSize: 12.5 }}>
                  Velostrasse: im Zürcher Grundlagenpapier nicht vorgesehen.
                </div>
              )}
              {bewertung.parkenAbzug > 0 && (
                <div style={{ marginTop: 6, opacity: 0.9 }}>
                  <strong>Parkierung rechts (Dooring):</strong> Abzug{' '}
                  {numDE(bewertung.parkenAbzug, 1)} Note
                </div>
              )}
              {bewertung.parkenRechts === 'ja' && bewertung.parkenSicherheitsstreifen && (
                <div style={{ marginTop: 6, opacity: 0.9 }}>
                  <strong>Parkierung rechts (Dooring):</strong> Sicherheitsstreifen (SN 640 060) vorhanden → kein Abzug
                </div>
              )}
              {bewertung.tramDeckel != null && (
                <div style={{ marginTop: 6, opacity: 0.9 }}>
                  <strong>Tram in der Fahrbahn:</strong> Note höchstens{' '}
                  {numDE(bewertung.tramDeckel, 0)} (Schienen im Mischverkehr)
                </div>
              )}
              {bewertung.sollHaltestelle && (
                <div style={{ marginTop: 6, opacity: 0.9 }}>
                  <strong>Haltestelle:</strong> Soll {bewertung.sollHaltestelle}
                  {bewertung.haltestelleStatus === 'kompatibel' &&
                    ` · ${section.haltestellentyp} ✓ kompatibel`}
                  {bewertung.haltestelleStatus === 'inkompatibel' &&
                    ` · ${section.haltestellentyp} ✗ → Abzug ${numDE(bewertung.haltestelleAbzug, 1)} Note`}
                  {bewertung.haltestelleStatus === 'pruefen' &&
                    ` · Haltestellentyp wählen. Kompatibel: ${bewertung.kompatibleHaltestellen.join(', ')}`}
                  {bewertung.haltestelleStatus === 'inkompatibel' && (
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      Kompatibel wären: {bewertung.kompatibleHaltestellen.join(', ')}
                    </div>
                  )}
                </div>
              )}
              {bewertung.hsBreitenSoll != null && (
                <div style={{ marginTop: 6, opacity: 0.9 }}>
                  <strong>Breite Haltestelle:</strong>{' '}
                  {bewertung.haltestelleBreite != null
                    ? `${numDE(bewertung.haltestelleBreite, 2)} m`
                    : 'nicht angegeben'} · Vorgabe{' '}
                  {bezugLabel} {numDE(bewertung.hsBreitenSoll, 2)} m
                  {bewertung.haltestelleBreite != null && (' · ' + (bewertung.hsBreiteStatus === 'erfuellt'
                    ? '✓ erfüllt'
                    : `zu schmal → Abzug ${numDE(bewertung.hsBreitenabzug, 1)} Note`))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}

      {/* Vergleich: Endnoten nach den Standards der anderen Städte — reine Zusatzinfo.
          Schlanke Zeile (nur Kürzel + Note); Begründung der Abweichung in einem aufklappbaren
          „Warum?" mit konkreten Werten. Basel-Strassentyp ist geschätzt. */}
      {bewertung && vergleich && vergleich.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-muted)' }}>
          <span style={{ fontWeight: 600 }}>Andere Standards: </span>
          {vergleich.map((v, i) => (
            <span key={v.stadt}>
              {i > 0 && ' · '}
              {STADT_KURZ[v.stadt]} {numDE(v.note, 1)}
            </span>
          ))}
          {vergleich.some(v => v.gruende.length > 0) && (
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: 'pointer', userSelect: 'none', opacity: 0.85 }}>Warum?</summary>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {vergleich.filter(v => v.gruende.length > 0).map(v => (
                  <li key={v.stadt} style={{ marginTop: 2 }}>
                    {STADT_KURZ[v.stadt]} {numDE(v.note, 1)} — {v.gruende.join('; ')}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* OpenBikeSensor: gemessene Überholabstände — reine Zusatzinfo, kein Noteneinfluss.
          Auch „befahren, aber nicht überholt" (nur usage) wird gezeigt. */}
      {section.obs && (section.obs.count > 0 || section.obs.usage > 0) && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10,
                      background: '#f0f9ff', border: '1px solid #bae6fd', color: '#075985',
                      fontSize: 13 }}>
          {section.obs.count > 0 ? (
            <>
              <strong>OpenBikeSensor:</strong> Median Überholabstand{' '}
              <strong>{numDE(section.obs.median, 2)} m</strong>
              {' · '}{Math.round(100 * section.obs.below150 / section.obs.count)} % unter 1,5 m
              {' · '}n = {section.obs.count}
              {section.obs.usage > 0 && ` · ${section.obs.usage} Befahrungen`}
              <span style={{ opacity: 0.7 }}> (gemessene Werte, fliessen nicht in die Note ein)</span>
            </>
          ) : (
            <>
              <strong>OpenBikeSensor:</strong> befahren ({section.obs.usage} Befahrungen),
              aber keine Überholmessung aufgezeichnet
            </>
          )}
        </div>
      )}

      {/* Voraussetzungs-Checkliste für die Mischfläche Fuss/Velo (Q12) — reiner Hinweis */}
      {ist === 'Fussweg Velo gestattet' && (
        <div style={{ marginTop: 12, padding: '14px 16px', borderRadius: 10,
                      background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            ⚠ Mischfläche Fuss/Velo nur prüfen, wenn alle Voraussetzungen zutreffen:
          </div>
          <ul style={{ margin: '0 0 6px', paddingLeft: 20, fontSize: 13.5 }}>
            {FUSSWEG_VORAUSSETZUNGEN.map(v => <li key={v}>{v}</li>)}
          </ul>
          <div style={{ fontSize: 13 }}>
            Trifft eine Bedingung nicht zu, ist diese Führungsform i. d. R. nicht zulässig.
            <strong> Bei Gefälle ist besondere Vorsicht geboten</strong> (hohe Differenzgeschwindigkeit
            Velo ↔ Fuss).
          </div>
        </div>
      )}
    </div>
  )
}

// ── CSV-Export: Datei-Download (Aufbau der Datei: csv.ts) ────────────────────
function downloadCsv(csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })  // BOM → Excel erkennt UTF-8
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `velocheck_${new Date().toISOString().slice(0, 10)}.csv`
  // Safari braucht das <a> im DOM, und das sofortige revoke bricht dort den Download ab —
  // deshalb anhängen und erst nach dem Klick-Tick aufräumen.
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url) }, 1000)
}

// ── Einstiegsseite ───────────────────────────────────────────────────────────
function Landing({ onStart }: { onStart: () => void }) {
  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 56px',
                   fontFamily: 'system-ui, -apple-system, sans-serif', color: 'var(--text)' }}>
      <img src={import.meta.env.BASE_URL + 'logo.svg'} alt="VeloroutenCheck — zum Rechner"
           title="Zum Rechner" onClick={onStart}
           style={{ width: 225, maxWidth: '60%', display: 'block', margin: '8px auto 6px', cursor: 'pointer' }} />
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <button onClick={onStart}
                style={{ border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer',
                         borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 600 }}>
          Zum Rechner →
        </button>
      </div>
      <p style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 14px' }}>
        VeloroutenCheck bewertet die Qualität der Veloinfrastruktur anhand der Vorgaben der
        jeweiligen Stadt (z.&nbsp;B. in Bern anhand des Masterplans Veloinfrastruktur). Die
        Bewertung bezieht sich jeweils auf eine Velostrecke, die aus einem oder mehreren
        Abschnitten bestehen kann.
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 8px' }}>
        Entspricht die vorhandene Führungsform nicht dem vorgesehenen Soll-Zustand, wird
        berücksichtigt, wie stark sich dies auf das subjektive Sicherheitsgefühl auswirkt. Grundlage
        dafür sind die Feel-Safe-Werte aus der{' '}
        <a href="https://radwege-check.de/auswertung/"
           target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          radwege-check-/FixMyCity-Befragung
        </a>{' '}in Berlin.
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 8px' }}>
        Eine eigene Bildumfrage mit 5&nbsp;900 Bewertungen zu 51 Berner Szenen hat diese Werte
        überprüft: Die Rangfolge der Führungsformen bestätigt sich, und breitere Radstreifen werden
        als sicherer bewertet.
      </p>

      {/* Ergebnisbericht der Berner Bildumfrage (22.09.2026) */}
      <a href="https://github.com/pnfzygrzgf-svg/VeloroutenCheck/blob/main/docs/09_Umfrage_Subjektive_Sicherheit_Bern_2026/Subjektive_Sicherheit_auf_Berner_Velorouten.pdf"
         target="_blank" rel="noopener noreferrer"
         style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22, textDecoration: 'none',
                  background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 10,
                  padding: '12px 16px', color: 'var(--text)' }}>
        <img src={import.meta.env.BASE_URL + 'umfrage.jpg'} alt="" width={56} height={56}
             style={{ flexShrink: 0, borderRadius: 8 }} />
        <span>
          <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>Subjektive Sicherheit auf Berner Velorouten</span><br />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Ergebnisbericht der Bildumfrage 2026 (PDF).
          </span>
        </span>
      </a>

      {/* Querverweis auf KnotenCheck */}
      <a href="https://pnfzygrzgf-svg.github.io/KnotenCheck/" target="_blank" rel="noopener noreferrer"
         style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22, textDecoration: 'none',
                  background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 10,
                  padding: '12px 16px', color: 'var(--text)' }}>
        <img src={import.meta.env.BASE_URL + 'knotencheck.png'} alt="" width={56} height={56}
             style={{ flexShrink: 0, borderRadius: 8 }} />
        <span>
          <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>KnotenCheck</span><br />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Werkzeug zur Leistungsbeurteilung von Knoten innerorts.
          </span>
        </span>
      </a>

      {/* Datenspeicherung (nur auf der Einstiegsseite) — kompakt */}
      <div style={{ marginTop: 22, padding: '10px 14px', borderRadius: 10,
                    background: '#f8fafc', border: '1px solid var(--border-subtle)',
                    fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.45, textAlign: 'left' }}>
        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Datenspeicherung</div>
        <div>Alle Berechnungen laufen vollständig im Browser. Eingaben und Ergebnisse werden nie an einen
          Server übermittelt — es gibt keinen Server, der sie entgegennimmt.</div>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li>Eingaben existieren nur im Arbeitsspeicher des Browsers und gehen beim Schliessen des Tabs verloren.</li>
          <li>CSV-Export: „Als CSV exportieren" lädt die Bewertung als CSV-Datei auf den
            lokalen Rechner — kein Upload, kein Cloud-Speicher. Ein Datei-Import ist derzeit nicht vorgesehen.</li>
          <li>Nutzungsstatistik: Seitenaufrufe werden mit GoatCounter gezählt — datenschutzfreundlich: keine
            Cookies, keine Speicherung der IP-Adresse, keine personenbezogenen Daten. Übermittelt wird nur ein
            anonymer Seitenaufruf (mit groben Angaben wie Browser und Herkunftsland), nicht deine Eingaben oder
            Ergebnisse. GitHub Pages loggt zudem serverseitig Zugriffe (IP, User-Agent), wie jeder Webserver.</li>
        </ul>
      </div>
    </main>
  )
}

export default function App() {
  const [sections, setSections] = useState<Section[]>([defaultSection()])
  const [street, setStreet] = useState('')
  const [osmBusy, setOsmBusy] = useState(false)
  const [osmMsg, setOsmMsg] = useState('')
  const [osmKind, setOsmKind] = useState<'info' | 'ok' | 'error'>('info')  // Meldungstyp für Styling
  // Statusmeldung mit Typ setzen (info = neutral/Laden, ok = Erfolg, error = Fehler).
  const setMsg = (text: string, kind: 'info' | 'ok' | 'error' = 'info') => { setOsmMsg(text); setOsmKind(kind) }
  const [city, setCity] = useState<CityId>('bern')               // gewählte Stadt → Datenquellen/Beschriftung
  const cityCfg = CITIES[city]
  // OBS-Snapshot der Stadt (bis ~2,7 MB) im Hintergrund vorwärmen, sobald die Stadt feststeht —
  // damit der erste Strassen-Load nicht am Download/Parsen hängt (Cache in obs.ts; enrichObs([]) lädt nur).
  // Erst im Rechner: die Einstiegsseite braucht die Snapshots nicht — dort wären es tote Downloads.
  const [cands, setCands] = useState<Cand[]>([])
  const [fitKey, setFitKey] = useState(0)   // +1 → Karte passt sich den Segmenten an (nur «Strasse laden»)
  const [stops, setStops] = useState<Stop[]>([])                  // ÖV-Haltestellen für Karten-Marker
  // Stadtwechsel: geladene Segmente/Haltestellen UND Abschnitte verwerfen — die Abschnitte tragen
  // Quellen/Annahmen der alten Stadt (z. B. Bern-DTV-Annahme, Geoportal-Chips) und wären in der
  // neuen Stadt still falsch etikettiert.
  const wechsleStadt = (c: CityId) => {
    if (c === city) return
    ladeGen.current++   // hängige Lade-Ketten (falls doch eine läuft) als veraltet markieren
    const hatte = sections.some(s => s.ist !== '' || Number.isFinite(s.dtv) || s.candIds?.length)
    setCity(c); setCands([]); setStops([]); setStreet(''); setSections([defaultSection()])
    setOsmBusy(false)      // eine evtl. hängige Ladung ist verworfen — nicht als „Lädt …" stehen lassen
    undoRef.current = null; setUndoLabel(null)   // Undo über den Stadtwechsel hinweg wäre falsch etikettiert
    setMsg(hatte ? 'Stadtwechsel: die übernommenen Abschnitte wurden geleert.' : '')
  }
  // Herkunft der massgeblichen Breiten-Vorgabe eines Abschnitts: stadtspezifischer Standard,
  // wenn die Stadt für diese Führungsform/diesen Routentyp einen Wert liefert — sonst Masterplan Bern.
  const breitenQuelleFuer = (s: Section): string => {
    const ov = cityCfg.breiten?.[s.ist as IstFuehrungsform]
    const feld = (s.routentyp || 'Velohauptroute') === 'Veloroute' ? 'minimal' : 'optimal'
    return ov && ov[feld] != null && cityCfg.breitenQuelle ? cityCfg.breitenQuelle : 'Masterplan Bern'
  }
  const [hoverSec, setHoverSec] = useState<number | null>(null)   // gehoverter Abschnitt (für Karten-Highlight)
  const [modus, setModus] = useState<'note' | 'erfuellung'>('note')  // Anzeige: Schulnote oder Erfüllungsgrad
  const [hintDismissed, setHintDismissed] = useState(false)  // Karten-Einstiegshinweis: erst wegklicken, dann auswählen
  // Einstiegsseite ↔ Rechner; Deep-Link über #rechner.
  const [view, setView] = useState<'home' | 'rechner'>(() =>
    typeof location !== 'undefined' && location.hash === '#rechner' ? 'rechner' : 'home')
  // GoatCounter: Rechner-Aufruf als eigenen Pfad zählen (zusätzlich zum auto-gezählten Seitenaufruf).
  const zaehleRechner = () => (window as unknown as {
    goatcounter?: { count?: (o: { path: string; title?: string; event?: boolean }) => void }
  }).goatcounter?.count?.({ path: '/rechner', title: 'Rechner', event: false })
  const go = (v: 'home' | 'rechner') => {
    setView(v)
    if (typeof location !== 'undefined') {
      if (v === 'rechner') location.hash = 'rechner'
      // Zurück zur Startseite ohne History-Eintrag und ohne «#»-Rest in der URL:
      else history.replaceState(null, '', location.pathname + location.search)
    }
    if (v === 'rechner') zaehleRechner()
  }
  // Vor/Zurück-Navigation (Hash) berücksichtigen.
  useEffect(() => {
    const onHash = () => setView(location.hash === '#rechner' ? 'rechner' : 'home')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  // Direkt-Aufruf via #rechner einmalig zählen (best effort; count.js lädt asynchron).
  useEffect(() => { if (view === 'rechner') zaehleRechner() }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  // (Fortsetzung des Vorwärmens von oben — steht hier, weil `view` erst jetzt deklariert ist.)
  useEffect(() => {
    if (view === 'rechner' && cityCfg.obsFile) void enrichObs([], cityCfg.obsFile).catch(() => {})
  }, [view, cityCfg.obsFile])
  // Lokalen Velostreifen-Snapshot (falls vorhanden) ebenso vorwärmen; fehlt er (öffentlicher Build) → no-op.
  useEffect(() => {
    if (view === 'rechner' && cityCfg.velostreifenFile) void enrichVelostreifen([], cityCfg.velostreifenFile).catch(() => {})
  }, [view, cityCfg.velostreifenFile])
  const mapRef = useRef<import('leaflet').Map | null>(null)
  // Lade-Generation gegen Races: Stadtwechsel (und jeder neue Load) erhöht den Zähler; eine
  // hängige await-Kette erkennt am veralteten Wert, dass ihr Ergebnis nicht mehr in den State
  // gehört, und verwirft es still. Das Stadt-Select ist während osmBusy zusätzlich gesperrt —
  // der Zähler ist der Gurt für alles, was daran vorbeikommt (z. B. langsame Anreicherung).
  const ladeGen = useRef(0)
  const selCount = cands.filter(c => c.selected).length

  // Aktueller Kandidaten-Stand für die async-Ketten (der State im Closure ist dort veraltet).
  const candsRef = useRef<Cand[]>([])
  candsRef.current = cands

  // Kandidaten anreichern: die UNABHÄNGIGEN Quellen (amtlich/Adapter, OpenBikeSensor, ÖV, Markierung)
  // laufen PARALLEL und werden je Kandidat einmalig zusammengeführt (Latenz = Maximum statt Summe).
  // Ein Fehler je Quelle ist isoliert — die Anreicherung ist Zusatz und darf den OSM-Import nie
  // verhindern. Aber er bleibt nicht mehr still: `fehler` nennt die Quellen, die nicht geantwortet
  // haben, und steht danach in der Statusmeldung.
  //   bestehende = schon geladene Kandidaten (Klick/Ausschnitt): OpenBikeSensor ordnet jedes
  //   Mess-Teilstück genau EINEM Segment zu — das geht nur über ALLE Segmente zusammen. `obs`
  //   gilt darum für bestehende UND neue Kandidaten und ersetzt deren bisherige Werte.
  const enrichAll = async (c: Cand[], bestehende: Cand[] = []): Promise<{
    cands: Cand[]; stops: Stop[]; obs: Map<number, ObsStats>; fehler: string[]
  }> => {
    const fehler: string[] = []
    const neuIds = new Set(c.map(x => x.id))
    const alle = [...bestehende.filter(x => !neuIds.has(x.id)), ...c]
    const [ec, obs, oev, velo] = await Promise.all([
      cityCfg.enrichCands(c).catch(() => { fehler.push(cityCfg.attribution); return { cands: c, fehler: [] as string[] } }),
      cityCfg.obsFile
        ? enrichObs(alle, cityCfg.obsFile).catch(() => new Map<number, ObsStats>())
        : Promise.resolve(new Map<number, ObsStats>()),
      cityCfg.loadOev(c).catch(() => { fehler.push('ÖV'); return { byId: new Map<number, OevInfo>(), stops: [] as Stop[], fehler: [] as string[] } }),
      cityCfg.velostreifenFile
        ? enrichVelostreifen(c, cityCfg.velostreifenFile).catch(() => new Map<number, VeloInfo>())
        : Promise.resolve(new Map<number, VeloInfo>()),
    ])
    fehler.push(...ec.fehler, ...oev.fehler)
    const bernById = new Map(ec.cands.map(x => [x.id, x.bern]))
    const cands = c.map(cand => {
      const v = velo.get(cand.id)
      const bern = { ...bernById.get(cand.id), ...(oev.byId.get(cand.id) ?? {}),
                     ...(v ? { radstreifen: v } : {}) }
      const o = obs.get(cand.id)
      const out: Cand = { ...cand }
      if (Object.keys(bern).length) out.bern = bern
      if (o) out.obs = o
      return out
    })
    return { cands, stops: oev.stops, obs, fehler }
  }
  // Angereicherte Kandidaten in den State einspielen: neue je Id ersetzen (Auswahl erhalten),
  // OpenBikeSensor-Werte für ALLE setzen (neu verteilt, siehe enrichAll).
  const einspielen = (prev: Cand[], neu: Cand[], obs: Map<number, ObsStats>, obsAktiv: boolean): Cand[] => {
    const byId = new Map(neu.map(n => [n.id, n]))
    return prev.map(p => {
      const n = byId.get(p.id)
      const basis: Cand = n ? { ...n, selected: p.selected } : { ...p }
      if (obsAktiv) { const o = obs.get(p.id); if (o) basis.obs = o; else delete basis.obs }
      return basis
    })
  }
  // Zusatz zur Statusmeldung, wenn Quellen nicht geantwortet haben.
  const fehlerText = (fehler: string[]) => fehler.length
    ? ` ⚠ Nicht erreichbar: ${[...new Set(fehler)].join(', ')} — betroffene Felder bitte von Hand prüfen.`
    : ''
  // Trägt ein Kandidat amtliche WERTE (nicht bloss den Prüfvermerk des DTV-Layers)?
  const hatAmtlich = (x: Cand) => !!x.bern && Object.keys(x.bern).some(k => k !== 'dtvGeprueft')
  // Haltestellen-Marker zusammenführen (nach Name+Position eindeutig).
  const mergeStops = (prev: Stop[], neu: Stop[]) => {
    const seen = new Set(prev.map(s => `${s.name}|${s.lat}|${s.lon}`))
    return [...prev, ...neu.filter(s => !seen.has(`${s.name}|${s.lat}|${s.lon}`))]
  }

  // Weg 1: Strasse laden → Kandidaten auf die Karte (alle zunächst gewählt).
  // Anschliessend mit den amtlichen/öffentlichen Daten der gewählten Stadt anreichern
  // (Bern: Tempo/DTV/Routentyp/Velostrasse; Zürich: Routentyp); ein Fehler dabei darf den
  // OSM-Import nicht verhindern.
  const ladeStrasse = async () => {
    const name = street.trim()
    if (!name) return
    const gen = ++ladeGen.current
    setOsmBusy(true); setMsg('Lade Segmente aus OpenStreetMap …')
    try {
      const c = await loadStreetCandidates(name, cityCfg.osmArea)
      if (gen !== ladeGen.current) return          // inzwischen Stadtwechsel/neue Ladung → verwerfen
      setCands(c); setStops([])          // Segmente SOFORT zeigen (anklickbar) — Anreicherung folgt im Hintergrund
      setFitKey(k => k + 1)              // auf die geladene Strasse einpassen
      if (!c.length) {
        setMsg(`Keine Velo-relevanten Segmente für „${name}" (Stadt ${cityCfg.label}) gefunden.`, 'info')
        return
      }
      setMsg(`${c.length} Segmente geladen (© OpenStreetMap, ODbL) · reichere an …`, 'ok')
      const { cands: enriched, stops: st, obs, fehler } = await enrichAll(c)
      if (gen !== ladeGen.current) return
      // Angereicherte je Id einspielen; Auswahl (falls inzwischen getoggelt) erhalten. Ids, die nicht
      // mehr da sind (zwischenzeitlich neue Ladung), werden ignoriert.
      setCands(prev => einspielen(prev, enriched, obs, !!cityCfg.obsFile))
      setStops(st)
      const amtlichHit = enriched.some(hatAmtlich)
      setMsg(`${c.length} Segmente geladen (© OpenStreetMap, ODbL)` +
        (amtlichHit ? ` · Anreicherung: ${cityCfg.attribution}.` : '.') +
        ' Auf der Karte ab-/zuwählen, dann übernehmen.' + fehlerText(fehler), fehler.length ? 'info' : 'ok')
    } catch (e) { if (gen === ladeGen.current) setMsg('Fehler beim Laden: ' + (e as Error).message, 'error') }
    finally { if (gen === ladeGen.current) setOsmBusy(false) }
  }

  // Weg 2: Segmente im aktuellen Kartenausschnitt nachladen (zu den vorhandenen hinzufügen).
  const ladeAusschnitt = async () => {
    const map = mapRef.current
    if (!map) return
    const b = map.getBounds()
    const gen = ++ladeGen.current
    setOsmBusy(true); setMsg('Lade Segmente im Kartenausschnitt …')
    try {
      const roh = await loadBboxCandidates(b.getSouth(), b.getWest(), b.getNorth(), b.getEast())
      if (gen !== ladeGen.current) return
      setCands(prev => {                 // neue Segmente SOFORT hinzufügen (roh), Anreicherung folgt
        const ids = new Set(prev.map(c => c.id))
        return [...prev, ...roh.filter(c => !ids.has(c.id))]
      })
      setMsg(roh.length ? `${roh.length} Segmente im Ausschnitt · reichere an …` : 'Keine neuen Segmente im Ausschnitt.',
        roh.length ? 'ok' : 'info')
      if (!roh.length) return
      // Nur anreichern, was wirklich NEU ist — schon geladene Segmente behalten ihre Werte.
      const schon = new Set(candsRef.current.map(c => c.id))
      const neuRoh = roh.filter(c => !schon.has(c.id))
      if (!neuRoh.length) { setMsg('Keine neuen Segmente im Ausschnitt.', 'info'); return }
      const { cands: neu, stops: st, obs, fehler } = await enrichAll(neuRoh, candsRef.current)
      if (gen !== ladeGen.current) return
      setCands(prev => einspielen(prev, neu, obs, !!cityCfg.obsFile))
      setStops(prev => mergeStops(prev, st))
      setMsg(`${neu.length} Segmente im Ausschnitt (angereichert).` + fehlerText(fehler), fehler.length ? 'info' : 'ok')
    } catch (e) { if (gen === ladeGen.current) setMsg('Fehler beim Laden: ' + (e as Error).message, 'error') }
    finally { if (gen === ladeGen.current) setOsmBusy(false) }
  }

  // Stabil (useCallback): geht als Prop in den VeloMap-Zeichen-Effekt — eine neue Referenz je
  // Render würde die Karte bei jedem Tastendruck in einer SectionCard komplett neu zeichnen.
  const toggleCand = useCallback((id: number) =>
    setCands(prev => prev.map(c => (c.id === id ? { ...c, selected: !c.selected } : c))), [])

  // Weg 3: Klick auf die Karte → nächstes Segment laden, anreichern und hinzufügen.
  // Wie beim Strassen-/Ausschnitt-Laden mit den Stadt-Daten + OpenBikeSensor anreichern
  // (Klick ist der Hauptweg zum Strecken-Aufbau, daher müssen DTV/Tempo/Routentyp/OBS auch hier kommen).
  const klickHinzufuegen = async (lat: number, lon: number) => {
    if (osmBusy) return                         // läuft schon eine Anfrage → Klick ignorieren (Rate-Limit schonen)
    const gen = ++ladeGen.current
    setOsmBusy(true); setMsg('Suche Segment an der Klickstelle …')
    try {
      const roh = await loadNearestCandidate(lat, lon)
      if (gen !== ladeGen.current) return
      if (!roh) { setMsg('An dieser Stelle kein velorelevantes Segment gefunden.', 'info'); return }
      if (candsRef.current.some(p => p.id === roh.id)) { setMsg(`Segment „${roh.name}" ist bereits geladen.`, 'info'); return }
      setCands(prev => (prev.some(p => p.id === roh.id) ? prev : [...prev, roh]))   // sofort hinzufügen
      setMsg(`Segment „${roh.name}" hinzugefügt · reichere an …`, 'ok')
      const { cands: [c], stops: st, obs, fehler } = await enrichAll([roh], candsRef.current)
      if (gen !== ladeGen.current) return
      setCands(prev => einspielen(prev, [c], obs, !!cityCfg.obsFile))
      setStops(prev => mergeStops(prev, st))
      setMsg(`Segment „${c.name}" hinzugefügt.` + fehlerText(fehler), fehler.length ? 'info' : 'ok')
    } catch (e) { if (gen === ladeGen.current) setMsg('Fehler beim Laden: ' + (e as Error).message, 'error') }
    finally { if (gen === ladeGen.current) setOsmBusy(false) }
  }

  // Undo-Schnappschuss für die zwei Aktionen, die viel Zustand auf einmal ersetzen/verwerfen
  // («Übernehmen» überschreibt alle Abschnitte, «Karte leeren» wirft die geladenen Segmente weg).
  // Ein Slot genügt: der jeweils letzte destruktive Schritt ist rückgängig machbar.
  const undoRef = useRef<{ sections: Section[]; cands: Cand[]; stops: Stop[] } | null>(null)
  const [undoLabel, setUndoLabel] = useState<string | null>(null)
  const undoMerken = (label: string) => {
    undoRef.current = { sections, cands, stops }
    setUndoLabel(label)
  }
  const undoAusfuehren = () => {
    const u = undoRef.current
    if (!u) return
    setSections(u.sections); setCands(u.cands); setStops(u.stops)
    undoRef.current = null; setUndoLabel(null)
    setMsg('Letzte Aktion rückgängig gemacht.', 'ok')
  }

  // Auswahl in die Strecke übernehmen (ordnen + zusammenfassen).
  // Während einer laufenden Anreicherung gesperrt (Knopf unten): die Abschnitte entstehen aus
  // dem Stand der Kandidaten IM MOMENT der Übernahme und werden danach nicht nachgeführt — wer
  // zu früh übernahm, bekam Abschnitte ohne amtliche Werte.
  const uebernehmen = () => {
    if (osmBusy) return
    if (selCount === 0) { setMsg('Keine Segmente gewählt.', 'info'); return }
    undoMerken('Übernehmen rückgängig')
    setSections(candsToSections(cands, city))
    setMsg(`${selCount} Segmente übernommen → geordnet und zusammengefasst. ` +
      'Herkunft je Feld am Chip (amtlich/OSM); leere Felder bitte ergänzen.', 'ok')
  }

  // Manuelle Änderung eines getrackten Feldes setzt dessen Herkunft auf „manuell".
  const TRACKED: QuelleFeld[] = ['dtv', 'speed', 'ist', 'breite', 'routentyp', 'oevAngebot', 'tram', 'strassentyp']
  const update = (id: number, patch: Partial<Section>) =>
    setSections(prev => prev.map(s => {
      if (s.id !== id) return s
      const quelle = { ...s.quelle }
      for (const k of TRACKED) if (k in patch) quelle[k] = 'manuell'
      return { ...s, ...patch, quelle }
    }))
  const add = () => setSections(prev => [...prev, defaultSection()])
  const remove = (id: number) => setSections(prev => prev.filter(s => s.id !== id))

  // Eine Note braucht DTV, Tempo, Führungsform und – bei Formen mit Breiten-Vorgabe – die Breite.
  // Formen ohne Vorgabe (Mischverkehr, Einbahn ohne Markierung) sind ausgenommen; dort ist das
  // Breite-Feld auch ausgeblendet (gleiche Regel via brauchtBreite, sonst Sackgasse ohne Note).
  const sectionComplete = (s: Section) =>
    // Form zuerst: ohne sie lässt sich nicht sagen, welche Felder überhaupt gebraucht werden.
    s.ist !== '' &&
    // DTV/Tempo nur, wo die Form sie auswertet (nicht bei Umweltspur und Fussweg Velo gestattet).
    // DTV zählt als vorhanden, wenn er eingegeben ist oder (nur Bern) als ≤ 2000 angenommen wird.
    // Basel: die Soll-Wahl ist strassentyp-basiert — DTV ist dort nur Zusatzinfo (DWV-Deckel-
    // Hinweis) und darf die Note nicht blockieren; das TEMPO bleibt Pflicht (Velostrasse-Regel).
    (!brauchtDtvTempo(s.ist) ||
      ((city === 'basel' || Number.isFinite(dtvEff(s, city))) && Number.isFinite(s.speed))) &&
    (!brauchtBreite(s.ist) || Number.isFinite(s.breite)) &&
    // Basel: Soll-Wahl ist strassentyp-basiert → Strassentyp nötig.
    (city !== 'basel' || s.strassentyp !== '')
  // Einzelbewertungen je Abschnitt (null = unvollständig); Strecke = schlechtester Abschnitt.
  const results = sections.map(s => {
    if (!sectionComplete(s)) return null
    // Breite bewerten, sobald eingegeben (Routentyp bestimmt die Vorgabe; Default Velohauptroute).
    const breite = Number.isFinite(s.breite) ? s.breite : undefined
    const routentyp = s.routentyp || 'Velohauptroute'
    const haltestelleBreite = Number.isFinite(s.haltestelleBreite) ? s.haltestelleBreite : undefined
    const oevTakt = Number.isFinite(s.oevTakt) ? s.oevTakt : undefined   // leeres Feld → unbekannter Takt
    return fuehrungsformNote(dtvEff(s, city), s.speed, s.ist as IstFuehrungsform, breite, routentyp,
      s.parkenRechts, oevTakt, s.oevAngebot, s.haltestellentyp, haltestelleBreite, s.tram,
      cityCfg.breiten?.[s.ist as IstFuehrungsform],   // stadtspezifische Breiten-Sollwerte
      city,                                            // Stadt → Soll-Tabelle + Haltestellen-Logik
      s.strassentyp || undefined,                      // Strassentyp (nur Basel)
      s.parkenSicherheitsstreifen)                     // Sicherheitsstreifen ggü. Parkplätzen (SN 640 060)
  })
  // Vergleichsnoten je Abschnitt nach den Standards der ANDEREN Städte (null = unvollständig).
  // Reine Zusatzinfo; Basel-Strassentyp wird aus DTV/Tempo geschätzt (geschaetzt = true).
  const vergleiche = sections.map(s => {
    if (!sectionComplete(s)) return null
    // Ohne DTV (in Basel erlaubt) keine Vergleichsnoten: die DTV-basierten Soll-Tabellen der
    // anderen Städte ergäben mit NaN still «Mischverkehr» (alle Schwellen-Vergleiche false).
    if (brauchtDtvTempo(s.ist as IstFuehrungsform) && !Number.isFinite(dtvEff(s, city))) return null
    const breite = Number.isFinite(s.breite) ? s.breite : undefined
    const haltestelleBreite = Number.isFinite(s.haltestelleBreite) ? s.haltestelleBreite : undefined
    return vergleichsNoten({
      dtv: dtvEff(s, city), v: s.speed, ist: s.ist as IstFuehrungsform, breite,
      routentyp: s.routentyp || 'Velohauptroute', parkenRechts: s.parkenRechts,
      parkenSicherheitsstreifen: s.parkenSicherheitsstreifen,
      oevTakt: Number.isFinite(s.oevTakt) ? s.oevTakt : undefined,
      oevAngebot: s.oevAngebot, haltestellentyp: s.haltestellentyp, haltestelleBreite, tram: s.tram,
      // Amtlicher/manueller Basler Strassentyp mitgeben — sonst schätzte der Vergleich ihn neu
      // und die Referenz wich von der angezeigten Hauptnote ab (07.08.2026).
      strassentyp: s.strassentyp || undefined,
    }, city)
  })
  const offen = results.filter(r => r == null).length
  const alleVollstaendig = offen === 0 && results.length > 0
  // Strecken-Note nur, wenn alle Abschnitte vollständig sind.
  const streckeNote = alleVollstaendig
    ? Math.min(...results.map(r => (r as NotenErgebnis).note))
    : null
  const worstIdx = alleVollstaendig
    ? results.reduce((wi, r, i) =>
        ((r as NotenErgebnis).note < (results[wi] as NotenErgebnis).note ? i : wi), 0)
    : -1
  const sc = streckeNote != null ? noteColor(streckeNote) : { bg: 'var(--text-muted-strong)', fg: '#ffffff' }

  // Karten-Marker je Abschnitt: Nummer am Mittelpunkt des längsten zugehörigen OSM-Segments
  // (liegt auf der Linie). Nur Abschnitte mit OSM-Herkunft (candIds); manuelle ohne Marker.
  // useMemo: stabile Referenz, sonst zeichnet der VeloMap-Effekt bei jedem Render alles neu.
  // Abhängig nur von der candIds-STRUKTUR (Schlüssel unten), nicht vom sections-Array selbst —
  // sonst löste jeder Tastendruck in einer SectionCard ein komplettes Karten-Neuzeichnen aus.
  const candIdsKey = sections.map(s => `${s.id}:${(s.candIds ?? []).join('.')}`).join('|')
  const markers: SectionMarker[] = useMemo(() => {
    const candById = new Map(cands.map(c => [c.id, c]))
    return sections.flatMap((s, i) => {
      const segs = (s.candIds ?? [])
        .map(id => candById.get(id)).filter((c): c is Cand => !!c && c.geom.length >= 2)
      if (segs.length === 0) return []
      const longest = segs.reduce((a, b) => (b.len > a.len ? b : a))
      const mid = longest.geom[Math.floor(longest.geom.length / 2)]
      return [{ num: i + 1, lat: mid.lat, lon: mid.lon }]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cands, candIdsKey])
  // Cand-IDs des gehoverten Abschnitts → Karten-Highlight (useMemo: stabile Set-Referenz;
  // gleiche Schlüssel-Logik wie markers, siehe oben).
  const highlightIds = useMemo(() => hoverSec != null
    ? new Set(sections.find(s => s.id === hoverSec)?.candIds ?? [])
    : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hoverSec, candIdsKey])

  return (
    <AttribContext.Provider value={cityCfg.attribution}>
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', color: 'var(--text-strong)' }}>
      {/* Header (grün); Titel/Logo führen zur Einstiegsseite */}
      <header className="vrc-header">
        <div className="vrc-header-inner">
          <span className="vrc-header-title" onClick={() => go('home')}
                style={{ cursor: view !== 'home' ? 'pointer' : 'default' }}>VeloroutenCheck</span>
          {view === 'rechner' && (
            <button className="vrc-home-btn" onClick={() => go('home')}>← Startseite</button>
          )}
          <nav className="vrc-header-nav">
            <a href="https://github.com/pnfzygrzgf-svg/VeloroutenCheck"
               target="_blank" rel="noopener noreferrer">
              <span className="nav-long">Quellcode: </span>GitHub
            </a>
            <span style={{ opacity: 0.5 }}>·</span>
            <a href="https://creativecommons.org/licenses/by-nc/4.0/deed.de"
               target="_blank" rel="noopener noreferrer">
              <span className="nav-long">Lizenz: </span>CC BY-NC 4.0
            </a>
          </nav>
        </div>
      </header>

      {view === 'home' && <Landing onStart={() => go('rechner')} />}

      {view === 'rechner' && (
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px 16px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <img src={import.meta.env.BASE_URL + 'logo.svg'} alt="" width={40} height={40}
               style={{ flexShrink: 0, cursor: 'pointer' }} onClick={() => go('home')} title="Zur Einstiegsseite" />
          <h1 style={{ fontSize: 22, margin: 0 }}>VeloroutenCheck</h1>
        </div>

      {/* Anzeige-Umschalter: Schulnote (1–6) ↔ vierstufiger Erfüllungsgrad. Rein darstellend. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Anzeige:</span>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {([['note', 'Schulnote'], ['erfuellung', 'Erfüllungsgrad']] as const).map(([m, label]) => (
            <button key={m} onClick={() => setModus(m)}
                    style={{ border: 'none', padding: '6px 12px', fontSize: 13, fontWeight: 600,
                             cursor: 'pointer',
                             background: modus === m ? 'var(--accent)' : '#fff',
                             color: modus === m ? '#fff' : 'var(--text)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Sticky Ergebnis-Leiste: Strecken-Beurteilung jederzeit sichtbar (Punkt 1).
          Klick springt zum massgebenden bzw. ersten unvollständigen Abschnitt. Die volle
          Beurteilung steht weiterhin unten. */}
      {/* zIndex bewusst klein: der Karten-Wrapper isoliert Leaflet (eigener Stacking-Context,
          s. unten) — so muss die Sticky-Leiste native Dropdowns/Popover nicht mehr überbieten. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, marginBottom: 18 }}>
        <button
          onClick={() => {
            const ziel = streckeNote != null ? worstIdx : results.findIndex(r => r == null)
            if (ziel >= 0) document.getElementById('sec-' + ziel)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          title={streckeNote != null ? 'Zum massgebenden Abschnitt springen'
                                     : 'Zum ersten unvollständigen Abschnitt springen'}
          style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                   background: sc.bg, color: sc.fg, borderRadius: 10, padding: '10px 16px',
                   display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                   boxShadow: '0 2px 10px rgba(0,0,0,0.15)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                         textTransform: 'uppercase', opacity: 0.85 }}>Strecke</span>
          <span style={{ fontSize: modus === 'erfuellung' ? 16 : 24, fontWeight: 800, lineHeight: 1 }}>
            {streckeNote == null ? '–'
              : modus === 'erfuellung' ? erfuellungsgrad(streckeNote) : numDE(streckeNote, 1)}
          </span>
          <span style={{ fontSize: 13, opacity: 0.95 }}>
            {streckeNote != null
              ? `· massgebend: Abschnitt ${worstIdx + 1}`
              : `· unvollständig (${offen} von ${results.length} offen)`}
          </span>
        </button>
      </div>

      {/* Aus OpenStreetMap laden */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
                    background: '#fff', padding: 14, borderRadius: 12, border: '1px solid var(--border-subtle)',
                    marginBottom: 18 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Stadt</span>
          <select value={city} onChange={e => wechsleStadt(e.target.value as CityId)}
                  disabled={osmBusy}   // Stadtwechsel während einer laufenden Ladung sperren (Race-Schutz)
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 16,
                           background: '#fff' }}>
            {(Object.keys(CITIES) as CityId[]).map(k => (
              <option key={k} value={k}>{CITIES[k].label}</option>
            ))}
          </select>
          <span style={{ fontSize: 12, color: 'var(--text-muted-strong)' }}>
            Grundlage:{' '}
            <a href={cityCfg.standardDoc.url} target="_blank" rel="noopener noreferrer"
               style={{ color: 'var(--accent)' }}>
              {cityCfg.standardDoc.titel}
            </a>
          </span>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            Strasse aus OpenStreetMap laden (Stadt {cityCfg.label})
          </span>
          <input value={street} onChange={e => setStreet(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Enter' && !osmBusy) ladeStrasse() }}
                 placeholder="z. B. Thunstrasse"
                 style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 16 }} />
        </label>
        <button onClick={ladeStrasse} disabled={osmBusy}
                style={{ border: 'none', background: osmBusy ? 'var(--text-faint)' : 'var(--accent)', color: '#fff',
                         borderRadius: 8, padding: '9px 16px', fontSize: 14, fontWeight: 600,
                         cursor: osmBusy ? 'default' : 'pointer' }}>
          {osmBusy ? 'Lädt …' : 'Strasse laden'}
        </button>
        {osmMsg && (() => {
          // Drei klare Zustände: Laden (info, neutral), Erfolg (ok, grün), Fehler (error, rot).
          const kind = osmBusy ? 'info' : osmKind
          const sty = kind === 'error' ? { bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b', icon: '⚠' }
            : kind === 'ok' ? { bg: '#f0fdf4', bd: '#bbf7d0', fg: '#166534', icon: '✓' }
            : { bg: 'var(--bg)', bd: 'var(--border-subtle)', fg: 'var(--text-muted-strong)', icon: osmBusy ? '⏳' : 'ℹ' }
          return (
            <div role="status" aria-live="polite"
                 style={{ flexBasis: '100%', fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start',
                          background: sty.bg, border: `1px solid ${sty.bd}`, color: sty.fg,
                          borderRadius: 8, padding: '8px 12px' }}>
              <span aria-hidden style={{ flexShrink: 0 }}>{sty.icon}</span>
              <span>{osmMsg}</span>
            </div>
          )
        })()}

        {/* Karte: immer sichtbar. Strecke per Klick auf die Karte aufbauen (Segment hinzufügen),
            Linien an-/abwählen, dann übernehmen. „Strasse laden" ist optional. */}
        <div style={{ flexBasis: '100%' }}>
          {/* zIndex 0 isoliert Leaflets interne z-Indizes (Controls bis 1000) im eigenen
              Stacking-Context — sie können die Sticky-Leiste (zIndex 100) nicht mehr überdecken. */}
          <div style={{ position: 'relative', zIndex: 0 }}>
            <VeloMap cands={cands} onToggle={toggleCand} onMapClick={klickHinzufuegen}
                     onReady={m => { mapRef.current = m }}
                     markers={markers} highlightIds={highlightIds} stops={stops}
                     attribution={cityCfg.attribution} center={cityCfg.center} fitKey={fitKey} />
            {/* Empty-State als Dismiss-Schicht über der Karte: Die ERSTE Interaktion (Klick/Touch/
                Zoom) schliesst nur den Hinweis — sie wählt noch kein Segment aus und zoomt nicht.
                Die Schicht fängt das Ereignis ab (pointerEvents auto); erst danach ist die Karte frei. */}
            {cands.length === 0 && !osmBusy && !hintDismissed && (
              <div onPointerDown={() => setHintDismissed(true)}
                   onWheel={() => setHintDismissed(true)}
                   style={{ position: 'absolute', inset: 0, zIndex: 500, cursor: 'pointer',
                            display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
                <div style={{ marginTop: 12, maxWidth: 360, width: 'calc(100% - 24px)',
                              pointerEvents: 'none',
                              background: 'rgba(15,23,42,0.88)', color: '#fff', borderRadius: 10,
                              padding: '12px 16px', boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                              fontSize: 13, lineHeight: 1.45, textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                    So baust du eine Strecke auf
                  </div>
                  <div style={{ opacity: 0.9 }}>
                    Auf eine Strasse tippen = nächstgelegenes Segment hinzufügen · Linie antippen =
                    ab-/zuwählen · oder oben einen Strassennamen laden.
                  </div>
                  <div style={{ opacity: 0.7, marginTop: 6, fontSize: 12 }}>
                    Tippen schliesst diesen Hinweis.
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            <button onClick={ladeAusschnitt} disabled={osmBusy}
                    style={{ border: '1px solid var(--border)', background: '#fff', color: 'var(--text)',
                             borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: osmBusy ? 'default' : 'pointer' }}>
              Segmente im Kartenausschnitt laden
            </button>
            <button onClick={uebernehmen} disabled={selCount === 0 || osmBusy}
                    title={osmBusy ? 'Die Anreicherung läuft noch — danach übernehmen.' : undefined}
                    style={{ border: 'none', background: selCount && !osmBusy ? 'var(--accent)' : 'var(--text-faint)', color: '#fff',
                             borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600,
                             cursor: selCount && !osmBusy ? 'pointer' : 'default' }}>
              {selCount} Segmente in Strecke übernehmen
            </button>
            {cands.length > 0 && (
              <button onClick={() => { undoMerken('Karte leeren rückgängig'); setCands([]); setStops([]); setMsg('') }}
                      style={{ border: '1px solid var(--border)', background: '#fff', color: 'var(--text-muted)',
                               borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>
                Karte leeren
              </button>
            )}
            {undoLabel && (
              <button onClick={undoAusfuehren}
                      style={{ border: '1px dashed var(--border)', background: '#fff', color: 'var(--accent)',
                               borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>
                ↩ {undoLabel}
              </button>
            )}
          </div>
          <ol style={{ fontSize: 12.5, color: 'var(--text-muted-strong)', marginTop: 8, marginBottom: 0,
                       paddingLeft: 20, lineHeight: 1.6 }}>
            <li><strong>Auf die Karte klicken</strong> — fügt das nächstgelegene Segment hinzu.
              (Oder oben einen Strassennamen laden.)</li>
            <li><strong>Linien an-/abwählen</strong> per Klick — grau = nicht in der Strecke.</li>
            <li><strong>Übernehmen</strong> — benachbarte Segmente gleicher Führungsform und
              gleichen Tempos werden zu Abschnitten gruppiert.</li>
          </ol>
          {/* Legende Führungsform */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 6, fontSize: 12 }}>
            {Object.entries(ISTCOLOR).map(([k, col]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-muted-strong)' }}>
                <span style={{ width: 16, height: 4, background: col, borderRadius: 2 }} />{k}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Strecken-Beurteilung (schlechtester Abschnitt) */}
      <div style={{ padding: '20px 22px', borderRadius: 12, background: sc.bg, color: sc.fg,
                    display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', minWidth: modus === 'erfuellung' ? 130 : 90 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase', opacity: 0.85 }}>Strecke</div>
          {modus === 'erfuellung' ? (
            <div style={{ fontSize: streckeNote != null ? 20 : 18, fontWeight: 800, lineHeight: 1.15 }}>
              {streckeNote != null ? erfuellungsgrad(streckeNote) : '–'}
            </div>
          ) : (
            <div style={{ fontSize: streckeNote != null ? 48 : 22, fontWeight: 800, lineHeight: 1.1 }}>
              {streckeNote != null ? numDE(streckeNote, 1) : '–'}
            </div>
          )}
        </div>
        <div style={{ fontSize: 14, opacity: 0.95 }}>
          <div><strong>{sections.length}</strong> {sections.length === 1 ? 'Abschnitt' : 'Abschnitte'}</div>
          {streckeNote != null ? (
            <>
              <div style={{ marginTop: 4 }}>
                {modus === 'erfuellung' ? 'Beurteilung' : 'Note'} = schlechtester Abschnitt{' '}
                (<strong>Abschnitt {worstIdx + 1}</strong>,{' '}
                {modus === 'erfuellung'
                  ? erfuellungsgrad((results[worstIdx] as NotenErgebnis).note).toLowerCase()
                  : `Note ${numDE((results[worstIdx] as NotenErgebnis).note, 1)}`}).
              </div>
              <div style={{ marginTop: 4, opacity: 0.85, fontSize: 13 }}>
                {modus === 'erfuellung'
                  ? results.map((r, i) => `A${i + 1}: ${erfuellungsgrad((r as NotenErgebnis).note)}`).join(' · ')
                  : 'Einzelnoten: ' + results.map((r, i) => `A${i + 1}: ${numDE((r as NotenErgebnis).note, 1)}`).join(' · ')}
              </div>
            </>
          ) : (
            <div style={{ marginTop: 4 }}>
              Unvollständig — {offen} von {results.length}{' '}
              {results.length === 1 ? 'Abschnitt braucht' : 'Abschnitten brauchen'} noch Eingaben
              (DTV, Tempo und Führungsform).
            </div>
          )}
        </div>
      </div>

      {/* Abschnitte */}
      <h2 style={{ fontSize: 16, margin: '26px 0 12px' }}>Abschnitte</h2>
      {sections.map((s, i) => (
        <div key={s.id} id={'sec-' + i} style={{ scrollMarginTop: 64 }}>
          <SectionCard
            index={i} section={s} bewertung={results[i]} vergleich={vergleiche[i]}
            isWorst={i === worstIdx && sections.length > 1} modus={modus}
            onChange={patch => update(s.id, patch)}
            onRemove={() => remove(s.id)}
            canRemove={sections.length > 1}
            onHover={h => setHoverSec(h ? s.id : null)}
            breitenQuelle={breitenQuelleFuer(s)}
            city={city}
          />
        </div>
      ))}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={add}
                style={{ border: '1px dashed var(--text-faint)', background: '#fff', color: 'var(--accent)',
                         borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 600,
                         cursor: 'pointer', flex: 1, minWidth: 200 }}>
          + Abschnitt hinzufügen
        </button>
        <button onClick={() => downloadCsv(buildCsv(sections, results, streckeNote, city, cityCfg.label))}
                title="Alle Abschnitte mit Werten, Herkunft und Note als CSV (Excel) herunterladen"
                style={{ border: '1px solid var(--accent)', background: '#fff', color: 'var(--accent)',
                         borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 600,
                         cursor: 'pointer', flex: 1, minWidth: 200 }}>
          ↓ Als CSV exportieren
        </button>
      </div>

      {/* Referenz: Entscheidungstabellen + Hinweise — eingeklappt, um Scroll zu sparen (Punkt 6) */}
      <details style={{ marginTop: 28 }}>
        <summary style={{ cursor: 'pointer', fontSize: 16, fontWeight: 700, color: 'var(--text)',
                          listStyle: 'revert', userSelect: 'none' }}>
          Referenz: Entscheidungstabellen &amp; Hinweise
        </summary>
        <div style={{ marginTop: 12 }}>
      <h2 style={{ fontSize: 16, margin: '8px 0 10px' }}>Entscheidungstabelle (Soll-Führungsform)</h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>
        Gilt für <strong>Bern</strong> (Masterplan). Zürich, Basel und Luzern verwenden eigene
        Soll-Tabellen; die Note des Abschnitts berücksichtigt sie bereits.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>DTV MIV ↓ \ km/h →</th>
              {SPEED_BANDS.map(s => <th key={s} style={th}>{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {DTV_BANDS.map((dLabel, ri) => (
              <tr key={dLabel}>
                <th style={{ ...th, textAlign: 'left' }}>{dLabel}</th>
                {SPEED_BANDS.map((_, ci) => {
                  const art = fuehrungsart(DTV_REP[ri], SPEED_REP[ci])
                  const col = COLOR[art]
                  return (
                    <td key={ci} style={{ ...td, background: col.bg, color: col.fg }}>{art}</td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Entscheidungstabelle Haltestellen (Soll-Veloverkehrslösung) */}
      <h2 style={{ fontSize: 16, margin: '28px 0 10px' }}>Entscheidungstabelle (Soll-Haltestellenlösung)</h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>
        Gilt für <strong>Bern</strong>. Luzern verwendet ein abweichendes Schema (kein Tram);
        Zürich kriterienbasiert (kein automatischer Abzug); Basel über Typ und Breite.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>ÖV-Angebot ↓ \ Routentyp →</th>
              {ROUTE_COLS.map(c => <th key={c.r} style={th}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {OEV_ROWS.map(row => (
              <tr key={row.v}>
                <th style={{ ...th, textAlign: 'left' }}>{row.label}</th>
                {ROUTE_COLS.map(c => {
                  const loesung = haltestellenLoesung(c.r, row.v)
                  if (!loesung) return <td key={c.r} style={td}>—</td>
                  const col = HALT_COLOR[loesung]
                  const stern = loesung === 'Übergang' ? ' *' : ''
                  return (
                    <td key={c.r} style={{ ...td, background: col.bg, color: col.fg }}>{loesung}{stern}</td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-faint)' }}>
        Soll-Veloverkehrslösung an der Haltestelle (Masterplan). <strong>* Übergang</strong>:
        Einzelfallprüfung. Der vorhandene Haltestellentyp wird separat gegen die Soll-Lösung
        geprüft (Abzug nur, wenn «Separate Velofläche» gefordert ist, aber ein Mischverkehr-Typ
        vorliegt).
      </p>
      <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted-strong)' }}>
        <strong>Separate Velofläche</strong> meint: Veloumfahrung · Haltestelle mit rückwärtigem
        Radweg · Inselhaltestelle · Kapüberfahrt.<br />
        <strong>Mischverkehr</strong> meint: Kaphaltestelle ohne Umfahrung · Fahrbahnhaltestelle Bus
        · Busbucht.
      </p>

      <p style={{ marginTop: 24, fontSize: 12, color: 'var(--text-faint)' }}>
        <strong>Zum DTV:</strong> Der amtliche DTV-Wert stammt aus den Flächendeckenden
        Verkehrsdaten (Geoportal Stadt Bern) und wird aus den Tages-/Nachtwerten geschätzt
        (DTV ≈ 16·Nt + 8·Nn). Er gibt nur eine <strong>Grössenordnung</strong> an und ist
        <strong> kein verbindliches Zählresultat</strong>; geführt nur für Strassen mit
        DTV&nbsp;&gt;&nbsp;2&apos;000&nbsp;Mfz/Tag bzw. die Altstadt. Herkunft je Feld am Chip
        (Geoportal/OSM). Herleitung und Quellen: siehe README.
      </p>
        </div>
      </details>

      {/* Fusszeile: Lizenz + Quellcode */}
      <footer style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--border-subtle)',
                       fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        VeloroutenCheck · Code &amp; eigene Inhalte unter{' '}
        <a href="https://creativecommons.org/licenses/by-nc/4.0/deed.de"
           target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          CC BY-NC 4.0
        </a>{' '}
        (eingebundene Daten behalten ihre eigenen Lizenzen) ·{' '}
        <a href="https://github.com/pnfzygrzgf-svg/VeloroutenCheck"
           target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          Quellcode auf GitHub
        </a>
      </footer>
      </div>
      )}
    </div>
    </AttribContext.Provider>
  )
}

const th: React.CSSProperties = {
  border: '1px solid var(--border-subtle)', padding: '6px 8px', background: '#f8fafc',
  fontSize: 12, color: 'var(--text-muted-strong)', textAlign: 'center', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  border: '1px solid #ffffff', padding: '8px', textAlign: 'center', whiteSpace: 'nowrap',
}
