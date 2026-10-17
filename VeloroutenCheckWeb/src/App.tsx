import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  fuehrungsart, haltestellenLoesung, haltestellenTypen, haltestellenMitBreite, PARKEN_RELEVANT,
  brauchtBreite, brauchtDtvTempo, erfuellungsgrad, BREITEN_ZUERICH, BREITEN_BASEL, BREITEN_LUZERN,
  GEGENVERKEHR_FORMEN, GEGENVERKEHR_DEFAULT,
  type Fuehrungsart, type IstFuehrungsform, type Routentyp, type ParkenRechts,
  type OevAngebot, type Haltestellentyp, type Haltestellenloesung, type NotenErgebnis, type BreitenSoll,
  type Stadt, type Strassentyp, type VergleichsNote,
} from './fuehrungsform'
import { VeloMap, ISTCOLOR, BREIT_MQ, AV_FARBEN, PARK_FARBE, PARKVERBOT_FARBE, type Cand, type SectionMarker, type Stop, type MessAnzeige } from './VeloMap'
import { zuLv95, zuWgs, type P } from './lv95'
import { ladeAvFuer, avQuelle } from './av'
import Strassensuche from './Strassensuche'
import { bordkanten, messeAbKante, abstand, aufZentimeter, fahrbahnbreite, parkierungAufTrottoir, trottoirbreiten, FANG_M, type Kante } from './breitenmessung'
import type { AvFlaeche } from './av'
import {
  candsToSections, defaultSection, dtvAssumed, gegenVon, seiteA, seiteB, tauscheSeiten,
  luftbildHinweis, luftbildUebernehmen, setzeGemesseneBreite,
  type Quelle, type QuelleFeld, type Section, type Seite, type SeitenQuelle,
} from './strecke'
import { bewerteAbschnitt, aufzaehlen, type AbschnittErgebnis } from './bewertung'
import { QuerschnittSkizze, breiteCm } from './Querschnitt'
import Bericht from './Bericht'
import { ladeFussnetz, ladeFussnetzBasel, FUSSNETZ_BASEL, FUSSNETZ_GEOPORTAL } from './fussnetz'
import {
  bilanz, bilanzText, bewerteAufteilung, fussnetzOptionen, FUSS_QUELLE, STANDARD_QUELLE, mitSeitenraum, bildVon, linksDerMitte, markierungenFuer, pruefungText, richtungenFuer, richtungVon, FUSSNETZ, mitTrottoirs, pruefeKernfahrbahn, pruefeTeil, standardBreite, startAufteilung, umfeldVon,
  BILDER, BILD_LABEL, MARKIERUNG_LABEL, TEIL_ARTEN, TEIL_LABEL,
  type Aufteilung, type Bild, type FussNetz, type Markierung, type Richtung, type Teil, type TeilArt, type TeilPruefung,
} from './aufteilung'
import { himmelsrichtung, peilung } from './geo'
import { loadBboxCandidates, loadNearestCandidate, loadStreetCandidates, teileInListe, MIN_TEIL_M } from './osm'
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
import { enrichLuftbild, LUFTBILD_SCHWELLE, type LuftbildInfo } from './luftbild'
import { enrichParkierung, ladeParkflaechen, PARK_MAX_M, PARK_QUELLE, type Box as ParkBox, type ParkFlaeche, type ParkInfo, type ParkStadt } from './parkierung'

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
  // Stand des OpenBikeSensor-Exports, angezeigt im Hinweis, Tooltip und CSV. Der Export selbst
  // trägt kein Datum; «Juni 2026» stützt sich auf die Dateidaten (Bern 22.06., Zürich 27.06.2026).
  obsStand?: string
  // Parkierung je Seite aus amtlichen Parkfeldern vorbelegen (parkierung.ts); fehlt der Eintrag,
  // gibt es keine Quelle (Basel: Parkfelder ohne Geometrie).
  parkierung?: ParkStadt
  velostreifenFile?: string                       // lokaler Markierungs-Snapshot (nicht öffentlich), falls vorhanden
  luftbildFile?: string                           // Radstreifen aus dem Luftbild (öffentlicher Snapshot, nur Hinweis; Bern, Zürich, Basel)
  // Breite am Luftbild messen: Kanton der amtlichen Vermessung (geodienste.ch) für die Quellenangabe.
  // Fehlt er, gibt es die Messung nicht. Luzern gibt die AV nur mit Freigabe ab; dort dienen seit
  // 17.10.2026 die offenen Strassenflächen der Stadt als Ersatz (av.ts, ladeAvLuzern).
  avKanton?: string
  // Aufteilung planen (aufteilung.ts): Vorgaben der Stadt, wo sie fehlen die Berner (als «Ersatz Bern» ausgewiesen).
  aufteilung?: boolean
  breiten?: Partial<Record<IstFuehrungsform, BreitenSoll>>  // stadtspezifische Breiten-Sollwerte (sonst Bern)
  breitenQuelle?: string                          // Quellenangabe der stadtspez. Breiten (sonst „Masterplan Bern")
  standardDoc: { titel: string; url: string }     // massgebendes Grundlagendokument (Rechnerseite)
  routenOptions?: { value: Routentyp; label: string }[]  // stadtspez. Routentyp-Labels (sonst kanonische Namen)
}
const CITIES: Record<CityId, CityCfg> = {
  bern: {
    label: 'Bern', osmArea: 'Bern', center: [46.948, 7.447],
    attribution: 'Geoinformation Stadt Bern',
    enrichCands: bern.enrichCands, loadOev: bern.loadOev, obsFile: 'obs_bern.json', obsStand: 'Juni 2026',
    parkierung: 'bern',
    velostreifenFile: 'velostreifen_bern.json',   // lokaler Snapshot; im öffentlichen Build nicht vorhanden
    luftbildFile: 'luftbild_bern.json',           // öffentlich (tools/luftbild_bern.py)
    avKanton: 'Bern',                             // Breitenmessung (seit 15.10.2026)
    aufteilung: true,                             // Aufteilung planen (seit 16.10.2026, Etappe 1)
    standardDoc: {
      titel: 'Standards Masterplans Veloinfrastruktur Stadt Bern',
      url: 'https://www.bern.ch/velohauptstadt/infrastruktur/masterplan-veloinfrastruktur',
    },
    // Bern verwendet die kanonischen Namen direkt → kein routenOptions nötig
  },
  zurich: {
    label: 'Zürich', osmArea: 'Zürich', center: [47.374, 8.541],
    attribution: 'Geodaten Stadt Zürich',
    enrichCands: zurich.enrichCands, loadOev: zurich.loadOev, obsFile: 'obs_zurich.json', obsStand: 'Juni 2026',
    parkierung: 'zurich',
    breiten: BREITEN_ZUERICH, breitenQuelle: 'Velostandards Zürich',   // Rest → Bern-Fallback
    avKanton: 'Zürich',                           // Breitenmessung (seit 16.10.2026)
    aufteilung: true,                             // Aufteilung planen (seit 17.10.2026, Etappe 4)
    luftbildFile: 'luftbild_zurich.json',         // öffentlich (tools/luftbild_stadt.py), seit 16.10.2026
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
    avKanton: 'Basel-Stadt',                      // Breitenmessung (seit 16.10.2026)
    aufteilung: true,                             // Aufteilung planen (seit 17.10.2026, Etappe 4)
    luftbildFile: 'luftbild_basel.json',          // öffentlich (tools/luftbild_stadt.py), seit 16.10.2026
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
    parkierung: 'luzern',
    breiten: BREITEN_LUZERN, breitenQuelle: 'Standards Stadt Luzern',
    avKanton: 'Luzern',                           // Strassenflächen der Stadt statt AV (seit 17.10.2026)
    aufteilung: true,                             // Aufteilung planen (seit 17.10.2026, Etappe 4)
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
// Quellenangabe der amtlichen Vermessung für den Chip «gemessen» (stadtabhängig, leer ohne Messung).
const AvContext = createContext('')

const COLOR: Record<Fuehrungsart, { bg: string; fg: string }> = {
  'Mischverkehr':                  { bg: '#7c3aed', fg: '#ffffff' },   // wie auf der Karte (ISTCOLOR)
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
  'Kaphaltestelle': 'Kaphaltestelle',
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
  const avTitle = useContext(AvContext)            // Quellenangabe der amtlichen Vermessung (Messung)
  const map: Record<string, { t: string; bg: string; fg: string; title?: string }> = {
    amtlich: { t: 'Geoportal', bg: '#dbeafe', fg: '#1e40af', title: amtlichTitle },
    osm: { t: 'OSM', bg: 'var(--border-subtle)', fg: 'var(--text-muted-strong)', title: 'OpenStreetMap' },
    fahrplan: { t: 'opentransportdata', bg: '#dcfce7', fg: '#166534', title: 'Fahrplan (opentransportdata.swiss / GTFS)' },
    markierung: { t: 'Markierung', bg: '#ffedd5', fg: '#9a3412', title: 'Aus der Fahrbahnmarkierung ermittelt (lokale Auswertung): Velostreifen auf dieser Seite — oder keiner, wenn die Striche nur auf der anderen Seite liegen' },
    luftbild: { t: 'Luftbild', bg: '#e0f2fe', fg: '#075985', title: 'Aus dem Luftbild-Hinweis übernommen (SWISSIMAGE © swisstopo, Erkennung mit dem Modell remote_velo der ETH Zürich) — bitte am Orthofoto prüfen' },
    av: { t: 'AV', bg: '#f1f5f9', fg: '#334155', title: `Aus der amtlichen Vermessung ermittelt: Fahrbahn von Bordstein zu Bordstein, Median der Querschnitte alle 5 m (${avTitle || 'Amtliche Vermessung, geodienste.ch'})` },
    gemessen: { t: 'gemessen', bg: '#ede9fe', fg: '#5b21b6', title: `Am Luftbild gemessen: ab der Bordsteinkante der amtlichen Vermessung bis zur angeklickten Stelle der Markierung (Luftbild © swisstopo; ${avTitle || 'Amtliche Vermessung, geodienste.ch'})` },
    angenommen: { t: '≤ 2000 angenommen', bg: '#fef9c3', fg: '#854d0e', title: 'Flächendeckende Verkehrsdaten Bern: kein Eintrag ⇒ DTV ≤ 2000 (ausserhalb Altstadt)' },
    fehlt: { t: 'Eingabe nötig', bg: '#fee2e2', fg: '#b91c1c' },
  }
  const key = fehlt ? 'fehlt'
    : q === 'amtlich' ? 'amtlich' : q === 'osm' ? 'osm' : q === 'fahrplan' ? 'fahrplan'
    : q === 'markierung' ? 'markierung' : q === 'angenommen' ? 'angenommen' : q === 'luftbild' ? 'luftbild'
    : q === 'gemessen' ? 'gemessen' : q === 'av' ? 'av' : null
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

function NumberField({ label, unit, value, onChange, chip, kompakt }: {
  label: string; unit: string; value: number; onChange: (v: number) => void
  step?: number; chip?: React.ReactNode
  kompakt?: boolean                     // ohne sichtbare Beschriftung, schmal (Zeilen der Aufteilung)
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
    <label style={kompakt ? { display: 'flex', width: 120, flexShrink: 0 }
                          : { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 150 }}>
      {!kompakt && <FieldLabel label={label} chip={chip} />}
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="text" inputMode="decimal" value={text} aria-label={kompakt ? label : undefined}
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

// Ein- und ausklappbare Gruppe der Abschnittsmaske (Nutzerwunsch 16.10.2026: weniger scrollen).
// Natives <details>, anfangs offen; der Zustand bleibt beim Neuzeichnen erhalten.
function Klappe({ titel, children, stil }: { titel: React.ReactNode; children: React.ReactNode; stil?: React.CSSProperties }) {
  return (
    <details open className="vrc-klappe" style={stil}>
      <summary style={{ ...groupLabelStyle, cursor: 'pointer', userSelect: 'none' }}>{titel}</summary>
      {children}
    </details>
  )
}

// Kasten je Seite (Seite A / Seite B / Beide Seiten) in der Abschnittsmaske, mit Überschrift.
const seiteKastenStyle: React.CSSProperties = {
  marginTop: 12, padding: 12, borderRadius: 10, background: '#f8fafc', border: '1px solid var(--border-subtle)',
}
const seiteTitelStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8,
}
// Kopfzeile eines Seiten-Kastens (Titel links, Knöpfe rechts) und die kleinen Knöpfe darin.
const kastenKopfStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8,
}
const kleinKnopfStyle: React.CSSProperties = {
  border: '1px solid var(--border)', background: '#fff', color: 'var(--text)',
  borderRadius: 8, padding: '5px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
}

// ── Eingaben einer Fahrtrichtung (Seite A oder B, strecke.ts: Seite) ─────────
// Was je Fahrtrichtung verschieden sein kann: Führungsform samt Breite, Parkierung rechts,
// öV-Takt der Umweltspur, Haltestellentyp und -breite. Seite A und B nutzen dieselbe Maske.
function SeiteFelder({ felder, quelle, onChange, city, oevAngebot, onMessen }: {
  felder: Seite
  quelle: SeitenQuelle
  onChange: (patch: Partial<Seite>) => void
  city: CityId
  oevAngebot: OevAngebot                // gilt für den Abschnitt; Haltestellenfelder nur, wenn ≠ keine
  onMessen?: () => void                 // Breite am Luftbild messen (Städte mit avKanton)
}) {
  const { ist } = felder
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      <label style={fieldStyle}>
        <FieldLabel label="Vorhandene Führungsform (Ist)"
                    chip={<QuelleChip q={quelle.ist} fehlt={ist === ''} />} />
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
        <NumberField label="Breite der Führungsform" unit="m" value={felder.breite} step={0.1}
                     onChange={v => onChange({ breite: v })}
                     chip={<QuelleChip q={quelle.breite} fehlt={!Number.isFinite(felder.breite)} />} />
      )}
      {/* Breite am Luftbild messen: ab Bordsteinkante bis zur Markierung (App.tsx, Messung). */}
      {ist !== '' && brauchtBreite(ist) && onMessen && (
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button type="button" onClick={onMessen} style={{ ...kleinKnopfStyle, padding: '8px 10px' }}
                  title="Auf dem Luftbild ab der Bordsteinkante bis zur Markierung messen">
            📏 Am Luftbild messen
          </button>
        </div>
      )}
      {/* Parkierung rechts (Dooring) bei Fahrbahn-Führungsformen (siehe PARKEN_RELEVANT) */}
      {PARKEN_RELEVANT.includes(ist as IstFuehrungsform) && (
        <label style={fieldStyle}>
          <FieldLabel label="Parkierung rechts (Dooring)" chip={<QuelleChip q={quelle.parkenRechts} />} />
          <select value={felder.parkenRechts}
                  onChange={e => onChange({ parkenRechts: e.target.value as ParkenRechts })}
                  style={selectStyle}>
            {PARKEN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      )}
      {/* Sicherheitsstreifen ggü. Parkplätzen (SN 640 060) — nur wenn Parkierung rechts = Ja; hebt den Dooring-Abzug auf */}
      {PARKEN_RELEVANT.includes(ist as IstFuehrungsform) && felder.parkenRechts === 'ja' && (
        <label style={{ ...fieldStyle, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={felder.parkenSicherheitsstreifen}
                 onChange={e => onChange({ parkenSicherheitsstreifen: e.target.checked })} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            Sicherheitsstreifen gegenüber Parkplätzen (SN 640 060)
          </span>
        </label>
      )}
      {/* öV-Takt nur bei der Umweltspur (Bus+Velo) */}
      {ist === 'Umweltspur' && (
        <NumberField label="öV-Takt (Bus)" unit="Min" value={felder.oevTakt} step={0.5}
                     onChange={v => onChange({ oevTakt: v })} />
      )}
      {/* Haltestellentyp je Seite. «keine Haltestelle auf dieser Seite»: das ÖV-Angebot des
          Abschnitts gilt hier nicht (bewertung.ts). */}
      {oevAngebot !== 'keine' && (
        <label style={fieldStyle}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            Vorhandener Haltestellentyp
          </span>
          <select value={felder.ohneHaltestelle ? '__ohne__' : felder.haltestellentyp}
                  onChange={e => onChange(e.target.value === '__ohne__'
                    ? { ohneHaltestelle: true, haltestellentyp: 'keine', haltestelleBreite: NaN }
                    : { ohneHaltestelle: false, haltestellentyp: e.target.value as Haltestellentyp })}
                  style={selectStyle}>
            {haltestellenOptions(city).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            <option value="__ohne__">keine Haltestelle auf dieser Seite</option>
          </select>
        </label>
      )}
      {/* Breite der Veloführung an der Haltestelle — nur bei Typen mit Breitenkriterium (stadtabhängig) */}
      {oevAngebot !== 'keine' && !felder.ohneHaltestelle && haltestellenMitBreite(city).includes(felder.haltestellentyp) && (
        <NumberField label="Breite Veloführung Haltestelle" unit="m" value={felder.haltestelleBreite}
                     step={0.1} onChange={v => onChange({ haltestelleBreite: v })} />
      )}
    </div>
  )
}

// ── Ergebnis einer Seite: Note mit Erklärung — oder Hinweis, solange Pflichtfelder fehlen ──
function ErgebnisBox({ bewertung, vergleich, felder, fehlt, routentyp, modus, city, breitenQuelle }: {
  bewertung: NotenErgebnis | null
  fehlt: string[]                       // fehlende Pflichtfelder (bewertung.ts, fehlendeEingaben)
  vergleich: VergleichsNote[] | null    // Endnoten nach den Standards der anderen Städte (null = unvollständig)
  felder: Seite
  routentyp: Routentyp | ''
  modus: 'note' | 'erfuellung'
  city: CityId
  breitenQuelle: string                 // Herkunft der Breiten-Vorgabe (stadtspez. Standard oder Masterplan Bern)
}) {
  const { ist } = felder
  const bezugLabel = routentyp === 'Veloroute' ? 'Minimal' : 'Optimal'
  return (
    <>
      {/* Ergebnis der Seite — oder Hinweis, solange Pflichtfelder fehlen */}
      {bewertung == null ? (
        <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 10,
                      background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412',
                      fontSize: 13.5 }}>
          <strong>Eingabe nötig:</strong> {aufzaehlen(fehlt)} angeben — dann wird die Note berechnet.
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
          {/* Erklärung der Note einklappbar (Nutzerwunsch 16.10.2026); Soll und Ist bleiben sichtbar */}
          <details className="vrc-klappe auf-farbe" style={{ marginTop: 4 }}>
            <summary style={{ cursor: 'pointer', userSelect: 'none', fontSize: 12.5, opacity: 0.9 }}>
              Details zur Note{bewertung.hinweis ? ' · ⚠ Hinweis' : ''}
            </summary>
            {bewertung.hinweis ? (
              <div style={{ marginTop: 6, fontWeight: 700 }}>⚠ {bewertung.hinweis}</div>
            ) : (
                <div style={{ marginTop: 4, opacity: 0.85 }}>
                  {ist === 'Umweltspur'
                    // Basisnote aus dem Ergebnis, nicht hartkodiert: die Decke ist stadtabhängig
                    // (Bern 5, übrige 4). Die Takt-Schwelle wird bewusst nicht genannt — sie ist
                    // ebenfalls stadtabhängig, und liegt der Takt darunter, steht oben der hinweis
                    // statt dieses Satzes.
                    ? (Number.isFinite(felder.oevTakt)
                        ? `öV-Takt ${felder.oevTakt} Min → Basis-Note ${bewertung.basisnote} (Decke); DTV/Tempo nicht massgebend.`
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
                    {!routentyp && ' · Routentyp wählen'}
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
                      ` · ${felder.haltestellentyp} ✓ kompatibel`}
                    {bewertung.haltestelleStatus === 'inkompatibel' &&
                      ` · ${felder.haltestellentyp} ✗ → Abzug ${numDE(bewertung.haltestelleAbzug, 1)} Note`}
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
          </details>
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
            <details className="vrc-klappe" style={{ marginTop: 4 }}>
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

    </>
  )
}

// ── Aufteilung planen (Etappen 1–4; aufteilung.ts) ────────────────────────────
// Der Querschnitt wird von Hand aus Teilen zusammengestellt; die App schlägt nichts vor
// (Nutzerentscheid 16.10.2026). Sie zeigt die Bilanz gegen die verfügbare Fahrbahnbreite, die
// Prüfung je Teil und die Note mit dieser Aufteilung neben der von heute (dieselbe Bewertung).
const TEIL_FARBE: Record<TeilPruefung['status'], string> = {
  ok: '#15803d', 'zu schmal': '#b91c1c', 'zu breit': '#b91c1c', 'unter Richtwert': '#a16207', leer: '#9a3412',
  'keine Vorgabe': 'var(--text-muted)',
}

// AV auf der Karte während der Planung (nur Karten-Abschnitte in Städten mit AV)
interface PlanAv { gezeigt: boolean; laden: boolean; park: boolean; zeigen: () => void; ausblenden: () => void }
const AV_LEGENDE: [string, string][] = [['Strasse_Weg', 'Strasse'], ['Trottoir', 'Trottoir'], ['Verkehrsinsel', 'Verkehrsinsel'], ['Gebaeude', 'Gebäude']]

function AufteilungPlanen({ section, heute, city, modus, rA, rB, onChange, av, onFahrbahnbreite, fbLaden, onBericht }: {
  section: Section
  heute: AbschnittErgebnis               // Bewertung des Abschnitts wie eingegeben
  city: CityId
  modus: 'note' | 'erfuellung'
  rA: string | null; rB: string | null   // Fahrtrichtung der Seiten (ausgeschrieben), falls bekannt
  onChange: (a: Aufteilung | undefined) => void
  av?: PlanAv
  onFahrbahnbreite?: () => void           // verfügbare Fahrbahnbreite aus der AV (Median der Querschnitte)
  fbLaden?: boolean
  onBericht?: () => void                  // Bericht (Druckansicht, als PDF) öffnen
}) {
  const a = section.aufteilung
  // Ziehen einer Zeile (Drag and Drop): gezogenes Teil und Zeile, über der es gerade schwebt
  const [zieh, setZieh] = useState<number | null>(null)
  const [ueber, setUeber] = useState<number | null>(null)
  const kopf = <div style={groupLabelStyle}>Aufteilung planen</div>
  // Einstieg hervorgehoben (Nutzerbefund 16.10.2026: als graue Zeile am Kartenende schlecht
  // auffindbar); dazu der Knopf in der Kopfzeile der Abschnittskarte.
  if (!a) return (
    <div id={`plan-${section.id}`} style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, scrollMarginTop: 64,
                                           background: '#f0fdfa', border: '1px solid #99f6e4' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>Neue Aufteilung der Strasse planen</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted-strong)', marginTop: 2 }}>
            Den Querschnitt neu aufteilen und prüfen: Fahrspuren, Velostreifen, Parkierung … Ausgangslage ist der
            Querschnitt von heute; welche Teile wie breit werden, legt man selbst fest. Die Note mit der neuen
            Aufteilung steht neben der von heute.
          </div>
          {/* Ohne Abschnitt von der Karte fehlen Fahrbahnbreite, Trottoirs, AV und Parkfelder (Nutzerbefund 16.10.2026) */}
          {!section.candIds?.length && (
            <div style={{ fontSize: 12.5, color: '#92400e', marginTop: 4 }}>
              Dieser Abschnitt stammt nicht von der Karte: Fahrbahnbreite, Trottoirs, amtliche Vermessung und Parkfelder
              fehlen. Zuerst Segmente auf der Karte wählen und «Segmente in Strecke übernehmen» — oder von Hand planen.
            </div>
          )}
        </div>
        <button type="button" onClick={() => { onChange(startAufteilung(section, city, CITIES[city].breiten)); av?.zeigen() }}
                style={section.candIds?.length
                  ? { border: 'none', background: 'var(--accent)', color: '#fff', borderRadius: 8,
                      padding: '8px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }
                  : { ...kleinKnopfStyle, padding: '8px 12px' }}>
          {section.candIds?.length ? 'Aufteilung planen' : 'Von Hand planen'}
        </button>
      </div>
    </div>
  )

  const breiten = CITIES[city].breiten
  const rt: Routentyp = section.routentyp || 'Veloroute'
  const umfeld = umfeldVon(section, a.teile, a.fussnetz, city)
  const einbahn = section.richtung === 'eine'
  const links = linksDerMitte(a.teile)
  const richtungText = (r: Richtung) => (r === 'beide' ? 'beide Richtungen (Gegenverkehr)'
    : r === 'A' ? `Richtung Seite A${rA ? ` (${rA})` : ''}, von hinten` : `Richtung Seite B${rB ? ` (${rB})` : ''}, von vorne`)
  const vorgabe = (art: TeilArt, bild?: Bild) => standardBreite({ art, breite: NaN, bild }, rt, breiten, umfeld)
  // Anderes Bild: Hatte das Teil noch die vorbelegte Breite, gilt die des neuen Bilds (Lastwagen 3,50 statt 3,00).
  const bildWechsel = (i: number, t: Teil, bild: Bild) => {
    const alt = vorgabe(t.art, t.bild)
    aendere(i, { ...t, bild, breite: Math.abs(t.breite - alt) < 1e-9 ? vorgabe(t.art, bild) : t.breite })
  }
  const setTeile = (teile: Teil[]) => onChange({ ...a, teile })
  const aendere = (i: number, t: Teil) => setTeile(a.teile.map((x, j) => (j === i ? t : x)))
  const einfuegen = (an: number, art: TeilArt) => {
    if (!art) return
    const t = [...a.teile]; t.splice(an, 0, { art, breite: vorgabe(art) })
    setTeile(t)
  }
  const schiebe = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= a.teile.length) return
    const t = [...a.teile];[t[i], t[j]] = [t[j], t[i]]
    setTeile(t)
  }
  // Teil von «von» an die Stelle «nach» setzen (die übrigen rücken nach)
  const verschiebe = (von: number, nach: number) => {
    if (von === nach) return
    const t = [...a.teile], [x] = t.splice(von, 1)
    t.splice(nach, 0, x)
    setTeile(t)
  }
  const ziehEnde = () => { setZieh(null); setUeber(null) }
  const ausgang = startAufteilung(section, city, CITIES[city].breiten)
  const massstab = Math.max(breiteCm(ausgang.teile), breiteCm(a.teile))
  const aq = mitSeitenraum(a, section), b = bilanz(aq), bt = bilanzText(aq, b)
  const plan = bewerteAufteilung(section, a, city, breiten)
  const planFehlt = [...new Set(plan.seiten.flatMap(se => se.fehlt))]
  const kern = pruefeKernfahrbahn(section, a.teile, city)
  const NoteMarke = ({ note }: { note: number | null }) => note == null
    ? <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>—</span>
    : <span style={{ background: noteColor(note).bg, color: noteColor(note).fg, borderRadius: 8,
                     padding: '3px 10px', fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap' }}>
        {modus === 'erfuellung' ? erfuellungsgrad(note) : numDE(note, 1)}
      </span>
  const seiteName = (s: 'A' | 'B') => (s === 'A' ? `Seite A${rA ? ` (Richtung ${rA})` : ''}` : `Seite B${rB ? ` (Richtung ${rB})` : ''}`)
  const formText = (f: Seite) => `${f.ist || '—'}${Number.isFinite(f.breite) ? ` ${numDE(f.breite, 2)} m` : ''}` +
    `${f.parkenRechts === 'ja' ? ', neben Parkierung' : ''}`

  return (
    <div id={`plan-${section.id}`} style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', scrollMarginTop: 64 }}>
      {kopf}
      <div style={{ ...seiteKastenStyle, marginTop: 0 }}>
        <div style={kastenKopfStyle}>
          <NumberField label="Verfügbare Fahrbahnbreite ohne Randsteinanpassung (Bordstein–Bordstein)" unit="m" value={a.fahrbahn} step={0.1}
                       onChange={v => onChange({ ...a, fahrbahn: v })} />
          <NumberField label="Heute ausserhalb der Fahrbahn (Trottoirs beider Seiten)" unit="m" value={aq.seitenraum ?? NaN} step={0.1}
                       onChange={v => onChange({ ...a, seitenraum: v })} />
          {/* Vorgabe der Trottoirs je Stadt: Bern Fussverkehrsnetz, Zürich Bedeutung des Stadtraums, Basel
              Fusswegnetz (Auswahl); Luzern nach Tempo und Velostreifen (nur Hinweis, keine Auswahl) */}
          {fussnetzOptionen(city).length > 0 ? (
          <label style={{ ...fieldStyle, flex: '1 1 200px' }}>
            <FieldLabel label={city === 'zurich' ? 'Bedeutung des Stadtraums (Vorgabe Trottoir)'
              : city === 'basel' ? 'Fusswegnetz (Vorgabe Trottoir)' : 'Fussverkehrsnetz (Vorgabe Trottoir)'} />
            <select value={a.fussnetz && FUSSNETZ[a.fussnetz]?.stadt === city ? a.fussnetz : ''} style={selectStyle}
                    onChange={e => onChange({ ...a, fussnetz: (e.target.value || undefined) as FussNetz | undefined, fussnetzQuelle: undefined })}>
              <option value="">— nicht gewählt —</option>
              {fussnetzOptionen(city).map(k => (
                <option key={k} value={k}>{FUSSNETZ[k].label} (≥ {numDE(FUSSNETZ[k].min, 2)} m)</option>
              ))}
            </select>
            {a.fussnetzQuelle === 'geoportal' && city === 'bern' && (
              <span style={{ fontSize: 11.5, color: 'var(--text-muted-strong)' }}>
                Aus dem Richtplan Fussverkehr ({a.fussnetz === 'basis' ? 'auf dem Basisnetz' : 'nicht auf dem Basisnetz'}).
                «Publikumsintensiv» steht nicht in den Daten und ist von Hand zu wählen.
              </span>
            )}
            {a.fussnetzQuelle === 'geoportal' && city === 'basel' && (
              <span style={{ fontSize: 11.5, color: 'var(--text-muted-strong)' }}>
                Aus dem Teilrichtplan Fuss- und Wanderwege ({a.fussnetz === 'bs_kanton' ? 'kantonales Netz'
                  : a.fussnetz === 'bs_stadt' ? 'kommunales Netz' : 'nicht im Fusswegnetz'}).
              </span>
            )}
            {city === 'zurich' && (
              <span style={{ fontSize: 11.5, color: 'var(--text-muted-strong)' }}>
                Lichte Breite nach dem Leitfaden Fussverkehr; dazu kommen Umfeldzuschläge (z. B. +0,50 m neben Tempo 50
                ohne Radstreifen, +1,50 m bei ÖV-Haltestellen).
              </span>
            )}
          </label>
          ) : city === 'luzern' ? (
            <span style={{ flex: '1 1 200px', fontSize: 12, color: 'var(--text-muted-strong)', alignSelf: 'flex-end' }}>
              Trottoir nach den Standards des Kantons Luzern: 2,50 m mit Velostreifen oder unter Tempo 50, sonst 3,00 m;
              mindestens 2,00 m (Stadt Luzern).
            </span>
          ) : null}
          {onFahrbahnbreite && (
            <button type="button" onClick={onFahrbahnbreite} disabled={fbLaden}
                    title="Aus der amtlichen Vermessung: Median der Querschnitte alle 5 m entlang des Abschnitts"
                    style={{ ...kleinKnopfStyle, padding: '8px 10px', alignSelf: 'flex-end', cursor: fbLaden ? 'default' : 'pointer' }}>
              {fbLaden ? 'Ermittle …' : 'aus AV ermitteln'}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', alignSelf: 'flex-end' }}>
            {onBericht && (
              <button type="button" onClick={onBericht} style={{ ...kleinKnopfStyle, borderColor: 'var(--accent)', color: 'var(--accent)' }}
                      title="Druckansicht mit Luftbild, Skizzen, Prüfung, Bewertung und Quellen; als PDF speichern über den Druckdialog">
                Bericht / PDF
              </button>
            )}
            <button type="button" onClick={() => onChange(startAufteilung(section, city, CITIES[city].breiten))} style={kleinKnopfStyle}
                    title="Eigene Änderungen verwerfen und wieder vom Querschnitt von heute ausgehen">
              Auf heute zurücksetzen
            </button>
            <button type="button" onClick={() => onChange(undefined)} style={kleinKnopfStyle}>
              Planung verwerfen
            </button>
          </div>
        </div>
        {/* AV auf der Karte: Bestand zum Ablesen der Aufteilung */}
        {av && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8, fontSize: 12.5 }}>
            <button type="button" onClick={av.gezeigt ? av.ausblenden : av.zeigen} disabled={av.laden}
                    style={{ ...kleinKnopfStyle, cursor: av.laden ? 'default' : 'pointer' }}>
              {av.laden ? 'Lade AV …' : av.gezeigt ? 'AV auf der Karte ausblenden' : 'AV auf der Karte zeigen'}
            </button>
            {av.gezeigt && [...AV_LEGENDE.map(([art, text]) => [AV_FARBEN[art], text]),
                            ...(av.park ? [[PARK_FARBE, 'Parkfeld'], [PARKVERBOT_FARBE, 'Parkverbotsfeld']] : [])].map(([farbe, text]) => (
              <span key={text} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-muted-strong)' }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: farbe, border: '1px solid rgba(0,0,0,0.25)' }} />
                {text}
              </span>
            ))}
          </div>
        )}
        <div style={{ fontSize: 12.5, color: 'var(--text-muted-strong)', marginBottom: 8 }}>
          Reihenfolge von links nach rechts, in Fahrtrichtung der Seite A{rA ? ` (Richtung ${rA})` : ''} gesehen:
          links der Rand der Seite B, rechts der Rand der Seite A.
        </div>

        {/* Skizze: heute und Planung untereinander, im selben Massstab */}
        <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '6px 10px', marginBottom: 10 }}>
          <QuerschnittSkizze titel="Heute" teile={ausgang.teile} einbahn={section.richtung === 'eine'} massstabCm={massstab} />
          <QuerschnittSkizze titel="Planung" teile={a.teile} einbahn={section.richtung === 'eine'} massstabCm={massstab} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            «Heute» ist die Ausgangslage aus den Eingaben des Abschnitts{section.trottoir ? ' und den Trottoirs aus der AV' : ''}.
            Illustrationen (Personen, Velos, Fahrzeuge vom Auto bis zum Tram, Ausstattung, Markierungen): <a href="https://streetmix.net" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>Streetmix</a>,{' '}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.de" target="_blank" rel="noopener noreferrer"
               style={{ color: 'inherit' }}>CC BY-SA 4.0</a>.
          </div>
        </div>

        {/* Teile: ziehen am Griff ⠿ (Drag and Drop) oder mit den Pfeilen verschieben */}
        {a.teile.map((t, i) => {
          const p = pruefeTeil(t, rt, breiten, umfeld)
          const bilder = BILDER[t.art]
          const marks = markierungenFuer(t.art)
          const richtungen = richtungenFuer(t.art, einbahn)
          return (
            <div key={i}
                 onDragOver={e => { if (zieh == null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (ueber !== i) setUeber(i) }}
                 onDrop={e => { e.preventDefault(); if (zieh != null) verschiebe(zieh, i); ziehEnde() }}
                 style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0',
                          opacity: zieh === i ? 0.45 : 1,
                          borderTop: ueber === i && zieh != null && zieh > i ? '2px solid var(--accent)'
                            : i ? '1px solid var(--border-subtle)' : '2px solid transparent',
                          borderBottom: ueber === i && zieh != null && zieh < i ? '2px solid var(--accent)' : '2px solid transparent' }}>
              <span draggable title="Ziehen zum Verschieben" aria-hidden
                    onDragStart={e => {
                      setZieh(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i))
                      const zeile = e.currentTarget.parentElement
                      if (zeile) e.dataTransfer.setDragImage(zeile, 12, 16)
                    }}
                    onDragEnd={ziehEnde}
                    style={{ cursor: 'grab', fontSize: 16, color: 'var(--text-muted)', padding: '0 2px', userSelect: 'none' }}>⠿</span>
              <span style={{ width: 18, fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{i + 1}</span>
              <select value={t.art} aria-label={`Teil ${i + 1}`} style={{ ...selectStyle, flex: '1 1 200px', minWidth: 0 }}
                      onChange={e => { const art = e.target.value as TeilArt; aendere(i, { art, breite: vorgabe(art) }) }}>
                {TEIL_ARTEN.map(x => <option key={x} value={x}>{TEIL_LABEL[x]}</option>)}
              </select>
              <NumberField kompakt label={`Breite Teil ${i + 1}`} unit="m" value={t.breite} step={0.05}
                           onChange={v => aendere(i, { ...t, breite: v, angenommen: undefined })} />
              {/* Bild (was darauf steht) und Markierung, wo es eine Wahl gibt */}
              {bilder && (
                <select value={bildVon(t)} aria-label={`Bild Teil ${i + 1}`} title="Was auf dem Teil steht (Skizze; bei der Fahrspur auch die Vorgabe)"
                        onChange={e => bildWechsel(i, t, e.target.value as Bild)} style={{ ...selectStyle, flex: '0 1 150px', minWidth: 0 }}>
                  {bilder.map(b => <option key={b} value={b}>{BILD_LABEL[b]}</option>)}
                </select>
              )}
              {marks.length > 0 && (
                <select value={t.markierung && marks.includes(t.markierung) ? t.markierung : 'keine'} aria-label={`Markierung Teil ${i + 1}`}
                        title="Markierung auf dem Teil (Skizze)"
                        onChange={e => aendere(i, { ...t, markierung: e.target.value as Markierung })}
                        style={{ ...selectStyle, flex: '0 1 160px', minWidth: 0 }}>
                  {marks.map(m => <option key={m} value={m}>{MARKIERUNG_LABEL[m]}</option>)}
                </select>
              )}
              {t.art === 'Parkierung' && (
                <label title="Parkierung hinter dem Randstein, auf der Trottoirfläche: ausserhalb der Fahrbahn (Bilanz, Skizze); bewertet weiter als Parkierung"
                       style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--text)' }}>
                  <input type="checkbox" checked={!!t.trottoirniveau}
                         onChange={e => aendere(i, { ...t, trottoirniveau: e.target.checked || undefined })} />
                  auf Trottoirniveau
                </label>
              )}
              {richtungen.length > 1 && (
                <select value={richtungVon(t, links[i], einbahn)} aria-label={`Richtung Teil ${i + 1}`}
                        title="Fahrtrichtung (Skizze: Fahrzeug von vorne oder hinten, Richtung der Pfeile)"
                        onChange={e => aendere(i, { ...t, richtung: e.target.value as Richtung })}
                        style={{ ...selectStyle, flex: '0 1 220px', minWidth: 0 }}>
                  {richtungen.map(r => <option key={r} value={r}>{richtungText(r)}</option>)}
                </select>
              )}
              <span style={{ display: 'flex', gap: 4 }}>
                <button type="button" onClick={() => schiebe(i, -1)} disabled={i === 0} style={kleinKnopfStyle}
                        aria-label={`Teil ${i + 1} nach links`} title="nach links">←</button>
                <button type="button" onClick={() => schiebe(i, 1)} disabled={i === a.teile.length - 1} style={kleinKnopfStyle}
                        aria-label={`Teil ${i + 1} nach rechts`} title="nach rechts">→</button>
                <button type="button" onClick={() => setTeile(a.teile.filter((_, j) => j !== i))} style={kleinKnopfStyle}
                        aria-label={`Teil ${i + 1} entfernen`} title="entfernen">✕</button>
                {/* Einfügen direkt rechts dieses Teils; die Art wird gleich hier gewählt (vorher kam
                    jedes neue Teil an den rechten Rand und musste verschoben werden, Nutzerbefund 16.10.2026). */}
                <select value="" onChange={e => einfuegen(i + 1, e.target.value as TeilArt)}
                        aria-label={`Neues Teil rechts von Teil ${i + 1} einfügen`} title="Neues Teil rechts davon einfügen"
                        style={{ ...kleinKnopfStyle, width: 40, textAlign: 'center' }}>
                  <option value="" disabled hidden>＋</option>
                  {TEIL_ARTEN.map(x => <option key={x} value={x}>{TEIL_LABEL[x]}</option>)}
                </select>
              </span>
              <span style={{ flex: '1 1 100%', paddingLeft: 26, fontSize: 12.5, fontWeight: 600, color: TEIL_FARBE[p.status] }}>
                {pruefungText(t, p)}
                {t.angenommen && (
                  <span style={{ display: 'block', fontWeight: 500, color: '#92400e' }}>
                    Breite heute unbekannt (keine Angabe in OSM, nicht gemessen): Vorgabe eingesetzt. Am Luftbild messen
                    («📏 Am Luftbild messen» bei der Seite) und «Auf heute zurücksetzen» oder hier eintragen.
                  </span>
                )}
              </span>
            </div>
          )
        })}
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          {a.teile.length ? (
            <>Neues Teil: «＋» in der Zeile fügt es rechts davon ein; ganz links:{' '}
              <select value="" onChange={e => einfuegen(0, e.target.value as TeilArt)} aria-label="Neues Teil ganz links einfügen"
                      style={{ ...kleinKnopfStyle, width: 40, textAlign: 'center' }}>
                <option value="" disabled hidden>＋</option>
                {TEIL_ARTEN.map(x => <option key={x} value={x}>{TEIL_LABEL[x]}</option>)}
              </select></>
          ) : (
            <select value="" onChange={e => einfuegen(0, e.target.value as TeilArt)} aria-label="Teil hinzufügen" style={selectStyle}>
              <option value="" disabled hidden>+ Teil hinzufügen …</option>
              {TEIL_ARTEN.map(x => <option key={x} value={x}>{TEIL_LABEL[x]}</option>)}
            </select>
          )}
        </div>

        {/* Bilanz über den ganzen Querschnitt (bilanz, bilanzText) */}
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 13,
                      ...(bt.fehlmass
                        ? { background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }
                        : { background: '#fff', border: '1px solid var(--border-subtle)', color: 'var(--text)' }) }}>
          {bt.kopf} · <strong>{bt.ergebnis}</strong>
          {bt.zusatz.length > 0 && <span style={{ fontSize: 12 }}> · {bt.zusatz.join(' · ')}</span>}
        </div>

        {/* Kernfahrbahn: Bedingungen des Masterplans (Q 5) */}
        {kern.length > 0 && (
          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, fontSize: 12.5,
                        ...(kern.some(k => k.streng)
                          ? { background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }
                          : { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }) }}>
            <strong>Kernfahrbahn:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {kern.map(k => <li key={k.text}>{k.text}</li>)}
            </ul>
          </div>
        )}

        {/* Note mit der Aufteilung neben der von heute */}
        <div style={{ marginTop: 12, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
          <span>Heute <NoteMarke note={heute.note} /></span>
          <span>Mit dieser Aufteilung <NoteMarke note={plan.note} /></span>
        </div>
        <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text-muted-strong)' }}>
          {plan.seiten.map(se => (
            <div key={se.seite}>
              {plan.seiten.length > 1 || section.richtung === 'eine' ? seiteName(se.seite) : 'Beide Seiten'}: {formText(se.felder)}
              {plan.seiten.length > 1 && se.bewertung && <> → {modus === 'erfuellung' ? erfuellungsgrad(se.bewertung.note) : numDE(se.bewertung.note, 1)}</>}
            </div>
          ))}
          {plan.note == null && planFehlt.length > 0 && <div>Für die Note fehlt: {aufzaehlen(planFehlt)}.</div>}
          {Number.isFinite(b.rest) && b.rest < -0.005 &&
            <div style={{ color: '#991b1b' }}>Die Teile haben im verfügbaren Querschnitt keinen Platz; die Note setzt voraus, dass sie passen.</div>}
        </div>
        {/* Erläuterung: ein Satz sichtbar, der Rest in einer Klappe (Nutzerentscheid 16.10.2026, aus der fgsCheck-Sitzung
            weitergeleitet); im Bericht steht alles offen unter «Annahmen und Grenzen» und «Quellen». */}
        <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-muted)' }}>
          {city === 'bern'
            ? 'Geprüft werden die Breiten nach den Masterplänen Velo- und Fussverkehr der Stadt Bern, dem Lichtraum nach SN 640 201 und einzelnen eigenen Festlegungen; die Note rechnet wie oben.'
            : `Geprüft werden die Breiten nach den ${STANDARD_QUELLE[city]} und dem Lichtraum nach SN 640 201; was dort fehlt, nach dem Berner Masterplan (gekennzeichnet). Die Note rechnet wie oben.`}
          <details className="vrc-klappe" style={{ marginTop: 4 }}>
            <summary style={{ fontWeight: 600, color: 'var(--text-muted-strong)' }}>Was geprüft wird, Annahmen und Quellen</summary>
            <div style={{ marginTop: 4 }}>
            Trottoirs werden gegen das Fussverkehrsnetz geprüft. Die Bilanz zählt den ganzen Querschnitt, sobald die Breite ausserhalb der Fahrbahn von heute bekannt ist; der Bordstein darf dabei wandern. Eine Kernfahrbahn ändert die
            Note nicht; bewertet werden die Velostreifen an ihren Rändern. Nicht geprüft: Mittelinseln,
            Abbiegespuren; von der Haltestelle nur die Breite (Wartehäuschen und Warteraum). DTV, Tempo,
            Routentyp und die Bewertung der Haltestelle gelten wie oben eingegeben.
            {!section.routentyp && ' Ohne Routentyp gelten für Velostreifen und Radweg die Werte der Veloroute.'}
            {' '}Richtwerte und Vorgaben: {STANDARD_QUELLE[city]}
            {city !== 'bern' && '; was diese nicht regeln, nach dem Masterplan Veloinfrastruktur Stadt Bern (in der Prüfung als «Ersatz Bern» gekennzeichnet)'};
            Trottoirs: {FUSS_QUELLE[city]}; Lichtraum von Lastwagen und Bus nach SN 640 201, Tram 2,80 m
            (1,40 m ab Gleisachse, Masterplan Bern).
            {city !== 'bern' && ' Die Fahrbahn ohne Mittellinie wird nach den Mindestbreiten der Stadt geprüft.'} Jede Fahrspur ist ab 3,00 m gültig. Ein Velostreifen direkt neben einer
            Trennung mit Pfosten gilt als geschützter Radstreifen; Veloabstellplatz und Parklet zählen nicht als Parkierung.
            {av?.gezeigt && ` Karte: ${avQuelle(CITIES[city].avKanton ?? '')}${av.park && CITIES[city].parkierung ? `; Parkfelder: ${PARK_QUELLE[CITIES[city].parkierung!]}` : ''}.`}
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}

// ── Karte für einen Abschnitt: Eingaben + Bewertung je Seite ─────────────────
// Aufbau (seit 14.10.2026): gemeinsame Grunddaten und ÖV-Angebot, dann die Seiten — ein
// gemeinsamer Kasten, solange beide gleich sind, sonst je ein Kasten für Seite A und Seite B
// (eigene Werte oder nicht bewertet) — und das Ergebnis je bewertete Seite. Die Abschnittsnote
// ist die schlechtere Seite (bewertung.ts).
function SectionCard({ index, section, ergebnis, isWorst, modus, zu, onKlappen, onChange, onTauschen, onLuftbild, onMessen, onFahrbahnbreite, fbLaden, av, onBericht, onRemove, canRemove, onHover, breitenQuelle, city }: {
  onBericht?: () => void                 // Bericht der Planung öffnen
  zu?: boolean                           // Abschnitt eingeklappt (nur Kopfzeile)
  onKlappen?: () => void
  // Fahrbahnbreite aus der AV ermitteln (Städte mit avKanton; nur Karten-Abschnitte); 'plan' = in die Aufteilung
  onFahrbahnbreite?: (ziel?: 'abschnitt' | 'plan') => void
  av?: PlanAv                            // AV auf der Karte während der Planung (nur Karten-Abschnitte)
  fbLaden?: boolean                      // Ermittlung läuft
  index: number
  section: Section
  ergebnis: AbschnittErgebnis
  isWorst: boolean
  modus: 'note' | 'erfuellung'
  onChange: (patch: Partial<Section>) => void
  onTauschen: () => void
  onLuftbild: (welche: { a: boolean; b: boolean }) => void   // Luftbild-Hinweis übernehmen
  onMessen?: (seite: 'A' | 'B') => void  // Breite am Luftbild messen (Städte mit avKanton)
  onRemove: () => void
  canRemove: boolean
  onHover?: (hovering: boolean) => void
  breitenQuelle: (ist: IstFuehrungsform | '') => string   // Herkunft der Breiten-Vorgabe je Form
  city: CityId                          // Stadt → bestimmt Sichtbarkeit des Strassentyp-Felds (Basel)
}) {
  const q = section.quelle
  const routenOptions = CITIES[city].routenOptions ?? ROUTE_OPTIONS.map(v => ({ value: v, label: v }))
  const hatMarker = (section.candIds?.length ?? 0) > 0   // nur OSM-Abschnitte sind auf der Karte markiert
  const obsStand = CITIES[city].obsStand
  const beide = section.richtung === 'beide'
  const abweichend = beide && !!section.gegen
  // Formen der bewerteten Seiten: DTV/Tempo sind Pflicht, sobald eine davon sie auswertet.
  const formen = abweichend ? [section.ist, section.gegen!.ist] : [section.ist]
  const brauchtVerkehr = formen.some(f => f !== '' && brauchtDtvTempo(f))
  const fussweg = formen.includes('Fussweg Velo gestattet')
  const rA = section.peilungA != null ? himmelsrichtung(section.peilungA) : null
  const rB = section.peilungA != null ? himmelsrichtung(section.peilungA + 180) : null
  const titelA = `Seite A${rA ? ` · Richtung ${rA}` : ''}`
  const titelB = `Seite B${rB ? ` · Richtung ${rB}` : ''}`
  // Zustand von Seite B: gleich wie A (ein gemeinsamer Kasten für beide Seiten), eigene Werte
  // oder nicht bewertet (je ein Kasten für A und B). Die Knöpfe stehen in den Kopfzeilen.
  const seitenModus: 'gleich' | 'verschieden' | 'eine' = !beide ? 'eine' : abweichend ? 'verschieden' : 'gleich'
  const seitenModusSetzen = (m: typeof seitenModus) => {
    if (m === seitenModus) return
    if (m === 'gleich') onChange({ richtung: 'beide', gegen: undefined })
    // Eine schon vorbelegte Gegenseite (z. B. aus OSM auf einer Einbahn) bleibt; sonst Kopie von A.
    else if (m === 'verschieden') onChange({ richtung: 'beide', gegen: section.gegen ?? gegenVon(section) })
    else onChange({ richtung: 'eine' })
  }
  // Luftbild-Hinweis (Bern, Zürich, Basel): welche Seiten zeigen im Luftbild einen Radstreifen, der in der
  // Maske noch fehlt? Seite A und B werden für den Text getrennt benannt; bei gleichen Seiten mit
  // Fund auf beiden genügt «beide Seiten».
  const lbHinweis = luftbildHinweis(section, LUFTBILD_SCHWELLE)
  const lbProzent = (x: number) => `${Math.round(100 * x)} %`
  const lbSeiten = [
    ...(lbHinweis.a ? [`Seite A${rA ? ` (Richtung ${rA})` : ''} auf ${lbProzent(section.luftbild!.a)} der Länge`] : []),
    ...(lbHinweis.b ? [`Seite B${rB ? ` (Richtung ${rB})` : ''} auf ${lbProzent(section.luftbild!.b)} der Länge`] : []),
  ]
  const lbKnopf = lbHinweis.a && lbHinweis.b ? 'Auf beiden Seiten Radstreifen übernehmen'
    : lbHinweis.a ? 'Für Seite A Radstreifen übernehmen' : 'Für Seite B Radstreifen übernehmen'
  // Änderung an Seite B: Herkunft von Form/Breite wird «manuell» (wie update() für Seite A).
  const aendereB = (patch: Partial<Seite>) => {
    const g = section.gegen
    if (!g) return
    const quelle = { ...g.quelle }
    if ('ist' in patch) quelle.ist = 'manuell'
    if ('breite' in patch) quelle.breite = 'manuell'
    if ('parkenRechts' in patch) quelle.parkenRechts = 'manuell'
    onChange({ gegen: { ...g, ...patch, quelle } })
  }

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
        {/* Ein-/Ausklappen in derselben Form wie alle Klappen (index.css, .vrc-klappe): «▾ Titel · einklappen» */}
        {onKlappen ? (
          <button type="button" onClick={onKlappen} aria-expanded={!zu} className="vrc-klapp-knopf"
                  title={zu ? 'Abschnitt aufklappen' : 'Abschnitt einklappen'}>
            <span className="vrc-klapp-pfeil">{zu ? '▸' : '▾'}</span>
            <strong style={{ fontSize: 15 }}>Abschnitt {index + 1}</strong>
            <span className="vrc-klapp-zustand">· {zu ? 'aufklappen' : 'einklappen'}</span>
          </button>
        ) : <strong style={{ fontSize: 15 }}>Abschnitt {index + 1}</strong>}
        {zu && ergebnis.note != null && (
          <span style={{ fontSize: 12, fontWeight: 800, borderRadius: 6, padding: '2px 8px',
                         background: noteColor(ergebnis.note).bg, color: noteColor(ergebnis.note).fg }}>
            {modus === 'erfuellung' ? erfuellungsgrad(ergebnis.note) : numDE(ergebnis.note, 1)}
          </span>
        )}
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
        {CITIES[city].aufteilung && (hatMarker || section.aufteilung) && (
          <button type="button"
                  onClick={() => {
                    if (!section.aufteilung) { onChange({ aufteilung: startAufteilung(section, city, CITIES[city].breiten) }); av?.zeigen() }
                    // nach dem Rendern zur Planung scrollen (sie steht unter dem Ergebnis)
                    setTimeout(() => document.getElementById(`plan-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
                  }}
                  title="Den Querschnitt neu aufteilen und prüfen (unter dem Ergebnis)"
                  style={{ border: '1px solid var(--accent)', background: '#fff', color: 'var(--accent)',
                           borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {section.aufteilung ? 'Zur Aufteilung ↓' : 'Aufteilung planen'}
          </button>
        )}
        {canRemove && (
          <button onClick={onRemove}
                  style={{ border: '1px solid var(--border)', background: '#fff', color: 'var(--text-muted)',
                           borderRadius: 8, padding: '4px 10px', fontSize: 13, cursor: 'pointer' }}>
            Entfernen
          </button>
        )}
      </div>

      {!zu && (<>
      {/* Eingaben — Gruppe 1: Grunddaten, gemeinsam für beide Seiten */}
      <Klappe titel="Grunddaten (beide Seiten)">
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <NumberField label="DTV MIV" unit="Fz/Tag" value={section.dtv} step={100}
                     onChange={v => onChange({ dtv: v })}
                     chip={<QuelleChip q={dtvAssumed(section, city) ? 'angenommen' : q.dtv}
                                       fehlt={brauchtVerkehr && city !== 'basel' && !Number.isFinite(section.dtv) && !dtvAssumed(section, city)} />} />
        <NumberField label="Zul. Höchstgeschwindigkeit" unit="km/h" value={section.speed} step={10}
                     onChange={v => onChange({ speed: v })}
                     chip={<QuelleChip q={q.speed} fehlt={brauchtVerkehr && !Number.isFinite(section.speed)} />} />
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
        {/* Fahrbahnbreite von Bordstein zu Bordstein — Information, nicht in der Note. */}
        <NumberField label="Fahrbahnbreite (Bordstein–Bordstein)" unit="m" value={section.fahrbahnbreite} step={0.1}
                     onChange={v => onChange({ fahrbahnbreite: v })}
                     chip={<QuelleChip q={q.fahrbahnbreite} />} />
        {onFahrbahnbreite && (
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" onClick={() => onFahrbahnbreite()} disabled={fbLaden}
                    title="Aus der amtlichen Vermessung: Median der Querschnitte alle 5 m entlang des Abschnitts"
                    style={{ ...kleinKnopfStyle, padding: '8px 10px', cursor: fbLaden ? 'default' : 'pointer' }}>
              {fbLaden ? 'Ermittle …' : 'aus AV ermitteln'}
            </button>
          </div>
        )}
      </div>
      </Klappe>

      {/* Eingaben — Gruppe 2: ÖV-Haltestelle im Abschnitt (Angebot gemeinsam, Typ je Seite) */}
      <Klappe titel="ÖV-Haltestelle" stil={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={fieldStyle}>
          <FieldLabel label="ÖV-Angebot (Haltestelle)" chip={<QuelleChip q={q.oevAngebot} />} />
          <select value={section.oevAngebot}
                  onChange={e => {
                    const v = e.target.value as OevAngebot
                    // «keine Haltestelle» räumt Typ und Breite mit ab, auf beiden Seiten: die Felder
                    // verschwinden aus der Maske, und was unsichtbar ist, darf nicht weiterrechnen (07.08.2026).
                    const leer = { haltestellentyp: 'keine' as Haltestellentyp, haltestelleBreite: NaN, ohneHaltestelle: false }
                    onChange(v === 'keine'
                      ? { oevAngebot: v, ...leer, ...(section.gegen ? { gegen: { ...section.gegen, ...leer } } : {}) }
                      : { oevAngebot: v })
                  }}
                  style={selectStyle}>
            {OEV_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {section.oevAngebot !== 'keine' && (
          <span style={{ flex: 1, minWidth: 150, fontSize: 12.5, color: 'var(--text-muted-strong)', paddingBottom: 10 }}>
            Den Haltestellentyp unten je Seite wählen.
          </span>
        )}
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
      </Klappe>

      {/* Eingaben — Gruppe 3: Seiten (Fahrtrichtungen). Seite A = Fahrtrichtung entlang der
          Strecke (auf einer Einbahn: die des Verkehrs), Seite B = Gegenrichtung. Sind beide gleich,
          steht ein gemeinsamer Kasten da; sonst je ein Kasten, und Seite B zeigt ihren Zustand
          (eigene Werte / nicht bewertet). Die Knöpfe stehen in den Kopfzeilen und nennen Seite B
          ausdrücklich. Seit 15.10.2026 — vorher eine Dreierwahl «Beide Seiten gleich / Seiten
          verschieden / Nur Seite A», in der Seite B nur verneint vorkam: Der Weg zu ihrer
          Erfassung war nicht zu finden. */}
      <Klappe titel="Seiten (Fahrtrichtungen)" stil={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
      <div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted-strong)' }}>
          Seite A ist die Fahrtrichtung entlang der Strecke, Seite B die Gegenrichtung. Die Note des
          Abschnitts ist die schlechtere der bewerteten Seiten.
          {hatMarker && section.peilungA != null && ' Der Pfeil am Karten-Marker zeigt die Fahrtrichtung der Seite A.'}
        </div>
        {/* Luftbild-Hinweis: nur Funde, nie «nicht erkannt» (ein fehlender Fund sagt wenig). */}
        {(lbHinweis.a || lbHinweis.b) && (
          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, fontSize: 12.5,
                        background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a' }}>
            <div>
              <strong>Luftbild:</strong> Radstreifen erkannt auf {lbSeiten.join(' und ')}. Das ist nur ein
              Hinweis aus einer automatischen Erkennung — bitte am Orthofoto prüfen (Kartenhintergrund
              «Orthofoto»). Eine Breite liefert das Luftbild nicht.
            </div>
            <button type="button" onClick={() => onLuftbild(lbHinweis)}
                    style={{ marginTop: 6, border: '1px solid #93c5fd', background: '#fff', color: '#1e3a8a',
                             borderRadius: 8, padding: '5px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              {lbKnopf}
            </button>
            <div style={{ marginTop: 6, fontSize: 11.5, opacity: 0.8 }}>
              SWISSIMAGE © swisstopo · Erkennung: Modell remote_velo, ETH Zürich
            </div>
          </div>
        )}
      </div>

      {/* Beide Seiten gleich: EIN gemeinsamer Kasten, eine Erfassung für beide Fahrtrichtungen
          (Nutzerwunsch 15.10.2026: beide Seiten in einem Schritt erfassen). Die Knöpfe zum
          Trennen stehen in seiner Kopfzeile und nennen Seite B ausdrücklich. */}
      {seitenModus === 'gleich' && (
        <div style={seiteKastenStyle}>
          <div style={kastenKopfStyle}>
            <span style={{ ...seiteTitelStyle, marginBottom: 0 }}>
              Seite A und Seite B{rA ? ` · Richtung ${rA} und Richtung ${rB}` : ''}
            </span>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => seitenModusSetzen('verschieden')} style={kleinKnopfStyle}>
              Seite B anders erfassen
            </button>
            <button type="button" onClick={() => seitenModusSetzen('eine')} style={kleinKnopfStyle}>
              Seite B nicht bewerten
            </button>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted-strong)', marginBottom: 8 }}>
            Beide Seiten gleich: Was hier steht, gilt für beide Fahrtrichtungen, mit einer gemeinsamen Note.
          </div>
          <SeiteFelder felder={seiteA(section)} quelle={{ ist: q.ist, breite: q.breite, parkenRechts: q.parkenRechts }}
                       onChange={onChange} city={city} oevAngebot={section.oevAngebot}
                       onMessen={onMessen && (() => onMessen('A'))} />
        </div>
      )}

      {/* Seiten getrennt: Seite A (immer bewertet) … */}
      {seitenModus !== 'gleich' && (
      <div style={seiteKastenStyle}>
        <div style={kastenKopfStyle}>
          <span style={{ ...seiteTitelStyle, marginBottom: 0 }}>{titelA}</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onTauschen} style={kleinKnopfStyle}
                  title="Seite A und Seite B vertauschen (die andere Fahrtrichtung wird Seite A)">
            ⇄ Seiten tauschen
          </button>
        </div>
        <SeiteFelder felder={seiteA(section)} quelle={{ ist: q.ist, breite: q.breite, parkenRechts: q.parkenRechts }}
                     onChange={onChange} city={city} oevAngebot={section.oevAngebot}
                       onMessen={onMessen && (() => onMessen('A'))} />
      </div>
      )}

      {/* … und Seite B mit eigenen Werten oder nicht bewertet */}
      {seitenModus !== 'gleich' && (
      <div style={seiteKastenStyle}>
        <div style={kastenKopfStyle}>
          <span style={{ ...seiteTitelStyle, marginBottom: 0 }}>{titelB}</span>
          {seitenModus === 'eine' && <QuelleChip q={q.richtung} />}
          <span style={{ flex: 1 }} />
          {seitenModus === 'verschieden' && (
            <>
              <button type="button" onClick={() => seitenModusSetzen('gleich')} style={kleinKnopfStyle}
                      title="Zurück zur gemeinsamen Erfassung: Seite B übernimmt wieder die Werte von Seite A, ihre eigenen Werte gehen verloren">
                Wie Seite A
              </button>
              <button type="button" onClick={() => seitenModusSetzen('eine')} style={kleinKnopfStyle}>
                Seite B nicht bewerten
              </button>
            </>
          )}
          {seitenModus === 'eine' && (
            <button type="button" onClick={() => onChange({ richtung: 'beide' })} style={kleinKnopfStyle}>
              Seite B bewerten
            </button>
          )}
        </div>
        {seitenModus === 'verschieden' && (
          <SeiteFelder felder={seiteB(section)} quelle={section.gegen!.quelle}
                       onChange={aendereB} city={city} oevAngebot={section.oevAngebot}
                       onMessen={onMessen && (() => onMessen('B'))} />
        )}
        {seitenModus === 'eine' && (
          <div style={{ fontSize: 13, color: 'var(--text-muted-strong)' }}>
            Wird nicht bewertet{q.richtung === 'osm' ? ', weil OSM hier eine Einbahn kennt' : ''}. Die Note des
            Abschnitts ist die von Seite A.
          </div>
        )}
        {seitenModus === 'eine' && section.osmVeloGegenverkehr && (
          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, fontSize: 12.5,
                        background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
            OSM: Einbahn mit Velogegenverkehr. Für die Gegenrichtung «Seite B bewerten» wählen und die
            Form angeben (z. B. «Einbahn mit Velogegenverkehr»).
          </div>
        )}
      </div>
      )}

      </Klappe>

      {/* Ergebnis je bewertete Seite (bei zwei Seiten mit Überschrift; die schlechtere ist massgebend) */}
      {ergebnis.seiten.map(se => (
        <div key={se.seite}>
          {ergebnis.seiten.length > 1 && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                          fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>
              Ergebnis {se.seite === 'A' ? titelA : titelB}
              {ergebnis.massgebend === se.seite && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c',
                               background: '#fee2e2', borderRadius: 999, padding: '2px 8px' }}>
                  massgebend für den Abschnitt
                </span>
              )}
            </div>
          )}
          <ErgebnisBox bewertung={se.bewertung} vergleich={se.vergleich} felder={se.felder} fehlt={se.fehlt}
                       routentyp={section.routentyp} modus={modus} city={city}
                       breitenQuelle={breitenQuelle(se.felder.ist)} />
        </div>
      ))}

      {/* Aufteilung planen — Städte mit aufteilung: true */}
      {CITIES[city].aufteilung && (
        <AufteilungPlanen section={section} heute={ergebnis} city={city} modus={modus} rA={rA} rB={rB}
                          onChange={aufteilung => { onChange({ aufteilung }); if (!aufteilung) av?.ausblenden() }} av={av}
                          onFahrbahnbreite={onFahrbahnbreite && (() => onFahrbahnbreite('plan'))} fbLaden={fbLaden}
                          onBericht={onBericht} />
      )}

      {/* OpenBikeSensor: gemessene Überholabstände — reine Zusatzinfo, kein Noteneinfluss.
          Auch „befahren, aber nicht überholt" (nur usage) wird gezeigt. Mit Stand des Exports:
          Die Werte sind ein gebündelter Snapshot, kein Live-Bezug (obs.ts). */}
      {section.obs && (section.obs.count > 0 || section.obs.usage > 0) && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10,
                      background: '#f0f9ff', border: '1px solid #bae6fd', color: '#075985',
                      fontSize: 13 }}>
          {section.obs.count > 0 ? (
            <>
              <strong>OpenBikeSensor{obsStand ? ` (Export ${obsStand})` : ''}:</strong> Median Überholabstand{' '}
              <strong>{numDE(section.obs.median, 2)} m</strong>
              {' · '}{Math.round(100 * section.obs.below150 / section.obs.count)} % unter 1,5 m
              {' · '}n = {section.obs.count}
              {section.obs.usage > 0 && ` · ${section.obs.usage} Befahrungen`}
              <span style={{ opacity: 0.7 }}> (gemessene Werte, fliessen nicht in die Note ein)</span>
            </>
          ) : (
            <>
              <strong>OpenBikeSensor{obsStand ? ` (Export ${obsStand})` : ''}:</strong> befahren ({section.obs.usage} Befahrungen),
              aber keine Überholmessung aufgezeichnet
            </>
          )}
        </div>
      )}

      {/* Voraussetzungs-Checkliste für die Mischfläche Fuss/Velo (Q12) — reiner Hinweis */}
      {fussweg && (
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
      </>)}
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
/** Aufklappbare Einstiegshilfe im Panel (Standard der Check-Apps): Schritte und Grenzen */
function SoFunktionierts() {
  return (
    <details className="hilfe">
      <summary>So funktioniert's</summary>
      <ol>
        <li><b>Stadt wählen:</b> oben auf der Karte. Die Bewertung folgt den Vorgaben der gewählten Stadt (z.&nbsp;B. Masterplan
          Veloinfrastruktur Bern); der Link über der Karte führt zur Grundlage.</li>
        <li><b>Strecke aufbauen:</b> auf die Karte klicken (nächstgelegenes Segment), oben auf der Karte eine Strasse suchen (beim
          Tippen erscheinen Vorschläge; Vorschlag wählen oder Enter lädt die Strasse) oder «Segmente im Kartenausschnitt laden». Linien per Klick an- und abwählen (weiss gestrichelt = nicht in der Strecke);
          «Segment teilen» schneidet ein langes Segment an der angeklickten Stelle.</li>
        <li><b>Übernehmen:</b> benachbarte Segmente gleicher Führungsform und gleichen Tempos werden zu Abschnitten gruppiert.</li>
        <li><b>Abschnitte prüfen:</b> je Abschnitt stehen Führungsform, Tempo und weitere Angaben aus OpenStreetMap und dem
          Geoportal der Stadt, mit Herkunft am Chip. Was nicht stimmt, lässt sich von Hand anpassen; die Bewertung rechnet sofort neu.</li>
        <li><b>Luftbild-Hinweis (Bern, Zürich, Basel):</b> Zeigt das Luftbild auf einer Seite einen Radstreifen, erscheint ein Hinweis
          zum Übernehmen; eine Breite liefert er nicht.</li>
        <li><b>Breite messen:</b> «📏 Am Luftbild messen» je Seite schaltet aufs Orthofoto, weit
          hineinzoomen und im Modus «Ab Bordsteinkante (AV)» auf die Markierung klicken, bis zu der die Breite zählt;
          gemessen wird rechtwinklig bis zur Bordsteinkante der amtlichen Vermessung (orange). Wo die AV keine
          Strassenfläche kennt oder die Kante nicht auf dem Bordstein im Foto liegt, im Modus «Zwei Punkte» zuerst die
          Bordsteinkante und dann die Markierung anklicken. «… m übernehmen» trägt den Wert ein, mit Herkunft «gemessen»
          am Chip.</li>
        <li><b>Aufteilung planen:</b> oben bei «Aufteilung planen» oder in der Kopfzeile eines Abschnitts. Die Planung
          beginnt mit dem Querschnitt von heute (Fahrbahn und Trottoirs aus der amtlichen Vermessung, in Luzern aus den
          Strassenflächen der Stadt; Parkierung, Velostreifen).
          Teile wählen, mit «＋» einfügen, am Griff ⠿ verschieben und in der Breite ändern; die App prüft jedes Teil gegen die
          Vorgaben der Stadt (wo eine Stadt kein Mass nennt, gilt das Berner, mit «Ersatz Bern» ausgewiesen), rechnet die Bilanz über den ganzen Querschnitt und zeigt die Note mit der Planung neben der von heute. Die Karte
          zeigt dazu die amtliche Vermessung und die Parkfelder (Basel: keine Parkfelder in den offenen Daten). «Bericht / PDF» druckt Karte, Skizzen, Prüfung und Bewertung.</li>
        <li><b>Ergebnis lesen:</b> oben zwischen Schulnote (1 bis 6) und Erfüllungsgrad umschalten; die Bewertung gilt je Abschnitt
          und für die ganze Strecke. «Als CSV exportieren» sichert die Bewertung als Datei.</li>
      </ol>
      <p><b>Grenzen</b></p>
      <ul>
        <li>Daten aus OpenStreetMap und den städtischen Geoportalen haben ihren eigenen Stand; fehlende oder falsche Angaben
          müssen von Hand korrigiert werden.</li>
        <li>Die Bewertung ist eine Einordnung nach den Vorgaben der Stadt, keine Beurteilung vor Ort. Vibecoding. Don't trust, verify!</li>
      </ul>
    </details>
  )
}

function Landing({ onStart }: { onStart: () => void }) {
  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 56px',
                   fontFamily: 'system-ui, -apple-system, sans-serif', color: 'var(--text)' }}>
      <img src={import.meta.env.BASE_URL + 'logo.svg'} alt="" aria-hidden="true"
           title="Zum Rechner" onClick={onStart}
           style={{ width: 225, maxWidth: '60%', display: 'block', margin: '8px auto 6px', cursor: 'pointer' }} />
      <h1 className="start-titel">VeloroutenCheck</h1>
      <p className="start-untertitel">Qualität der Veloinfrastruktur <span className="marke">Beta</span></p>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <button onClick={onStart}
                style={{ border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer',
                         borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 600 }}>
          Zum Rechner →
        </button>
      </div>
      <p style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 14px' }}>
        <b>VeloroutenCheck bewertet Velostrecken nach den Vorgaben der jeweiligen Stadt:</b> in Bern
        nach dem Masterplan Veloinfrastruktur, in Zürich, Basel und Luzern nach den städtischen
        Velostandards. Die Strecke wählst du auf der Karte. Sie wird in Abschnitte gegliedert, und jeder
        Abschnitt erhält eine Note für beide Fahrtrichtungen.
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 14px' }}>
        <b>Daten:</b> Führungsform, Tempo, Verkehrsmenge und Routentyp kommen aus OpenStreetMap und den
        Geoportalen der Städte. Breiten lassen sich am Luftbild ab der Bordsteinkante messen, in Luzern
        anhand der Strassenflächen der Stadt. In Bern, Zürich und Basel weist eine automatische
        Luftbild-Erkennung (Modell der ETH Zürich) auf Radstreifen hin, die in den Daten fehlen.
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 8px' }}>
        <b>Bewertungsgrundlage:</b> Entspricht die vorhandene Führungsform nicht dem vorgesehenen Soll-Zustand, wird
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
      <p style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 8px' }}>
        <b>Neu: Aufteilung planen.</b> Den Querschnitt einer Strasse neu aufteilen, mit Fahrspuren,
        Velostreifen, Parkierung, Trottoirs und Haltestelle. Jeder Teil wird gegen die Vorgaben der Stadt
        geprüft; wo eine Stadt kein Mass nennt, gilt das Berner, mit Hinweis. Die Note der Planung steht
        neben der von heute. Eine Skizze zeigt beide Querschnitte; der Bericht lässt sich als PDF drucken.
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
      <a href="https://knotencheck.ch/" target="_blank" rel="noopener noreferrer"
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

      {/* Querverweis auf fgsCheck */}
      <a href="https://fgscheck.ch/" target="_blank" rel="noopener noreferrer"
         style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, textDecoration: 'none',
                  background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 10,
                  padding: '12px 16px', color: 'var(--text)' }}>
        <img src={import.meta.env.BASE_URL + 'fgscheck.svg'} alt="" width={56} height={56}
             style={{ flexShrink: 0, borderRadius: 8, background: '#fff' }} />
        <span>
          <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>fgsCheck</span><br />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Sichtprüfung an Fussgängerstreifen.
          </span>
        </span>
      </a>

      {/* Datenspeicherung (nur auf der Einstiegsseite) — kompakt */}
      <div style={{ marginTop: 22, padding: '10px 14px', borderRadius: 10,
                    background: '#f8fafc', border: '1px solid var(--border-subtle)',
                    fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.45, textAlign: 'left' }}>
        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Datenspeicherung</div>
        <div>Alle Berechnungen laufen vollständig im Browser. Eingaben und Ergebnisse bleiben im Browser. Um
          Daten zu laden, schickt der Browser nur den Kartenausschnitt bzw. die Lage des Abschnitts und den
          Suchtext der Strassensuche an die Datendienste (OpenStreetMap, Geoportale der Städte, swisstopo,
          geodienste.ch).</div>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li>Eingaben existieren nur im Arbeitsspeicher des Browsers und gehen beim Schliessen des Tabs verloren.</li>
          <li>CSV-Export: „Als CSV exportieren" lädt die Bewertung als CSV-Datei auf den
            lokalen Rechner — kein Upload, kein Cloud-Speicher. Ein Datei-Import ist derzeit nicht vorgesehen.</li>
          <li>Bericht / PDF: entsteht über den Druckdialog des Browsers, ebenfalls ohne Upload.</li>
          <li>Nutzungsstatistik: Seitenaufrufe werden mit GoatCounter gezählt — datenschutzfreundlich: keine
            Cookies, keine Speicherung der IP-Adresse, keine personenbezogenen Daten. Übermittelt wird nur ein
            anonymer Seitenaufruf (mit groben Angaben wie Browser und Herkunftsland), nicht deine Eingaben oder
            Ergebnisse. GitHub Pages loggt zudem serverseitig Zugriffe (IP, User-Agent), wie jeder Webserver.</li>
        </ul>
      </div>
      <footer className="start-fuss">
        VeloroutenCheck · Code &amp; eigene Inhalte unter{' '}
        <a href="https://creativecommons.org/licenses/by-nc/4.0/deed.de" target="_blank" rel="noopener noreferrer">CC BY-NC 4.0</a>
        {' '}(eingebundene Daten behalten ihre eigenen Lizenzen) ·{' '}
        <a href="https://github.com/pnfzygrzgf-svg/VeloroutenCheck" target="_blank" rel="noopener noreferrer">Quellcode auf GitHub</a>
      </footer>
    </main>
  )
}

// AV-Ausschnitt (LV95-Mitte und Halbseite) für ein Rechteck in Grad: deckt das Rechteck mit 20 m
// Rand, mindestens ±120 m, höchstens ±300 m (Fair Use von geodienste.ch, Antwortgrösse).
function avAusschnitt(s: number, w: number, n: number, o: number): { e: number; n: number; r: number } {
  const [ea, na] = zuLv95(s, w), [eb, nb] = zuLv95(n, o)
  const r = Math.min(300, Math.max(120, Math.max(Math.abs(eb - ea), Math.abs(nb - na)) / 2 + 20))
  return { e: (ea + eb) / 2, n: (na + nb) / 2, r }
}

// Breite am Luftbild messen: Zustand der laufenden Messung.
interface Messung {
  secId: number
  seite: 'A' | 'B'
  titel: string                                   // «Abschnitt 2, Seite A»
  modus: 'kante' | 'hand'                         // ab AV-Bordsteinkante | zwei Punkte von Hand
  kanten: Kante[]                                 // Bordsteinkanten der amtlichen Vermessung (LV95)
  geladen?: { e: number; n: number; r: number }   // Mitte und Halbseite des geladenen AV-Ausschnitts
  laden: boolean
  fehler?: string
  punkte: P[]                                     // gesetzte Punkte (zwei Punkte von Hand)
  ergebnis?: { breite: number; von: P; bis: P }   // Messlinie Bordsteinkante → Markierung
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
    setCity(c); setCands([]); setStops([]); setStreet(''); setSections([defaultSection()]); setTeilModus(false)
    setMessung(null)
    setOsmBusy(false)      // eine evtl. hängige Ladung ist verworfen — nicht als „Lädt …" stehen lassen
    undoRef.current = null; setUndoLabel(null)   // Undo über den Stadtwechsel hinweg wäre falsch etikettiert
    setMsg(hatte ? 'Stadtwechsel: die übernommenen Abschnitte wurden geleert.' : '')
  }
  // Herkunft der massgeblichen Breiten-Vorgabe eines Abschnitts: stadtspezifischer Standard,
  // wenn die Stadt für diese Führungsform/diesen Routentyp einen Wert liefert — sonst Masterplan Bern.
  const breitenQuelleFuer = (ist: IstFuehrungsform | '', routentyp: Routentyp | ''): string => {
    const ov = cityCfg.breiten?.[ist as IstFuehrungsform]
    const feld = (routentyp || 'Velohauptroute') === 'Veloroute' ? 'minimal' : 'optimal'
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
  // Luftbild-Snapshot (Bern, Zürich, Basel) ebenso vorwärmen.
  useEffect(() => {
    if (view === 'rechner' && cityCfg.luftbildFile) void enrichLuftbild([], cityCfg.luftbildFile).catch(() => {})
  }, [view, cityCfg.luftbildFile])
  const mapRef = useRef<import('leaflet').Map | null>(null)
  // Breitbild-Layout (Karte links, Panel rechts) schaltet rein per CSS (index.css, gleiche
  // Media-Query). Leaflet misst seine Containergrösse aber nur bei window-resize (trackResize)
  // nach — beim Wechsel zwischen den Layouts die Grösse deshalb ausdrücklich neu einlesen.
  // Die Karte bleibt dabei dieselbe Instanz (gleiche Stelle im React-Baum, kein Remount).
  useEffect(() => {
    if (view !== 'rechner') return
    const mq = window.matchMedia(BREIT_MQ)
    let raf = 0
    const neuMessen = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => mapRef.current?.invalidateSize()) }
    mq.addEventListener('change', neuMessen)
    return () => { mq.removeEventListener('change', neuMessen); cancelAnimationFrame(raf) }
  }, [view])
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
    const [ec, obs, oev, velo, luftbild, park] = await Promise.all([
      cityCfg.enrichCands(c).catch(() => { fehler.push(cityCfg.attribution); return { cands: c, fehler: [] as string[] } }),
      cityCfg.obsFile
        ? enrichObs(alle, cityCfg.obsFile).catch(() => new Map<number, ObsStats>())
        : Promise.resolve(new Map<number, ObsStats>()),
      cityCfg.loadOev(c).catch(() => { fehler.push('ÖV'); return { byId: new Map<number, OevInfo>(), stops: [] as Stop[], fehler: [] as string[] } }),
      cityCfg.velostreifenFile
        ? enrichVelostreifen(c, cityCfg.velostreifenFile).catch(() => new Map<number, VeloInfo>())
        : Promise.resolve(new Map<number, VeloInfo>()),
      cityCfg.luftbildFile
        ? enrichLuftbild(c, cityCfg.luftbildFile).catch(() => new Map<number, LuftbildInfo>())
        : Promise.resolve(new Map<number, LuftbildInfo>()),
      cityCfg.parkierung
        ? enrichParkierung(c, cityCfg.parkierung).catch(() => { fehler.push('Parkfelder'); return new Map<number, ParkInfo>() })
        : Promise.resolve(new Map<number, ParkInfo>()),
    ])
    fehler.push(...ec.fehler, ...oev.fehler)
    const bernById = new Map(ec.cands.map(x => [x.id, x.bern]))
    const cands = c.map(cand => {
      const v = velo.get(cand.id), lb = luftbild.get(cand.id), pk = park.get(cand.id)
      const bern = { ...bernById.get(cand.id), ...(oev.byId.get(cand.id) ?? {}),
                     ...(v ? { radstreifen: v } : {}), ...(lb ? { luftbild: lb } : {}), ...(pk ? { parken: pk } : {}) }
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
  const ladeStrasse = async (nameArg?: string) => {
    const name = (nameArg ?? street).trim()
    if (!name) return
    const gen = ++ladeGen.current
    setOsmBusy(true); setMsg('Lade Segmente aus OpenStreetMap …')
    try {
      const c = await loadStreetCandidates(name, cityCfg.osmArea)
      if (gen !== ladeGen.current) return          // inzwischen Stadtwechsel/neue Ladung → verwerfen
      setCands(c); setStops([])          // Segmente SOFORT zeigen (anklickbar) — Anreicherung folgt im Hintergrund
      setTeilModus(false)                // die Liste ist neu — ein angefangenes Teilen gilt nicht mehr
      setMessung(null)
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
      // Abgleich über die WAY-ID, nicht die Kandidaten-Kennung: ein geteilter Way ist schon da
      // (als Teile mit eigenen Kennungen) und darf nicht ein zweites Mal ganz dazukommen.
      setCands(prev => {                 // neue Segmente SOFORT hinzufügen (roh), Anreicherung folgt
        const ways = new Set(prev.map(c => c.wayId))
        return [...prev, ...roh.filter(c => !ways.has(c.wayId))]
      })
      setMsg(roh.length ? `${roh.length} Segmente im Ausschnitt · reichere an …` : 'Keine neuen Segmente im Ausschnitt.',
        roh.length ? 'ok' : 'info')
      if (!roh.length) return
      // Nur anreichern, was wirklich NEU ist — schon geladene Segmente behalten ihre Werte.
      const schon = new Set(candsRef.current.map(c => c.wayId))
      const neuRoh = roh.filter(c => !schon.has(c.wayId))
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

  // «Segment teilen»: Der Knopf schaltet den Modus ein, der NÄCHSTE Klick auf eine Linie schneidet
  // sie am Fusspunkt der Klickstelle (osm.ts, teileInListe); danach ist der Modus wieder aus.
  // Esc oder der Knopf brechen ab. Beide Teile werden neu angereichert — amtliche Werte, ÖV,
  // Markierung und OpenBikeSensor ordnen über die Geometrie zu und können je Teil anders ausfallen.
  const [teilModus, setTeilModus] = useState(false)
  const teilModusRef = useRef(false)
  teilModusRef.current = teilModus
  useEffect(() => {
    if (!teilModus) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setTeilModus(false); setMsg('Teilen abgebrochen.', 'info') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [teilModus])
  const teilen = async (id: number, lat: number, lon: number) => {
    setTeilModus(false)
    if (osmBusy) { setMsg('Teilen nicht möglich, solange noch geladen wird — danach erneut versuchen.', 'info'); return }
    const r = teileInListe(candsRef.current, id, lat, lon)
    if (!r) {
      setMsg(`Zu nah am Ende des Segments — ein Teil wäre kürzer als ${MIN_TEIL_M} m. ` +
        '«Segment teilen» erneut wählen und weiter innen antippen.', 'info')
      return
    }
    const [a, b] = r.neu
    const warUebernommen = sections.some(s => s.candIds?.includes(id))
    undoMerken('Teilen rückgängig')
    const gen = ++ladeGen.current
    setCands(r.cands)                           // Teile SOFORT zeigen, Anreicherung folgt
    setOsmBusy(true); setMsg(`Segment „${a.name}" geteilt · reichere die Teile an …`, 'ok')
    try {
      // Bestehende = alle übrigen Kandidaten OHNE den alten, ungeteilten: OpenBikeSensor verteilt
      // jedes Mess-Teilstück auf genau einen Kandidaten — der alte darf dabei nicht mehr mitbieten.
      const rest = r.cands.filter(c => c.id !== a.id && c.id !== b.id)
      const { cands: neu, stops: st, obs, fehler } = await enrichAll([a, b], rest)
      if (gen !== ladeGen.current) return
      setCands(prev => einspielen(prev, neu, obs, !!cityCfg.obsFile))
      setStops(prev => mergeStops(prev, st))
      setMsg(`Segment „${a.name}" geteilt: Teil ${a.teil!.nr} (${Math.round(a.len)} m) und ` +
        `Teil ${b.teil!.nr} (${Math.round(b.len)} m) von ${a.teil!.anzahl}.` +
        (warUebernommen ? ' Die Abschnitte folgen erst nach erneutem «in Strecke übernehmen».' : '') +
        fehlerText(fehler), fehler.length ? 'info' : 'ok')
    } catch (e) { if (gen === ladeGen.current) setMsg('Fehler beim Anreichern: ' + (e as Error).message, 'error') }
    finally { if (gen === ladeGen.current) setOsmBusy(false) }
  }
  // Stabil (wie toggleCand): der aktuelle Modus und die aktuelle teilen-Funktion laufen über Refs.
  const teilenRef = useRef(teilen)
  teilenRef.current = teilen
  // ── Breite am Luftbild messen (Städte mit avKanton; breitenmessung.ts) ──────
  // Nutzerentscheid 15.10.2026: ab der Bordsteinkante der amtlichen Vermessung bis zur
  // angeklickten Stelle auf der Markierung; der Messwert ist die Breite an dieser Stelle.
  // Passt die AV-Kante nicht zum Bord (etwa Parkfelder dazwischen), misst man mit zwei Punkten.
  // Die Bordsteinkanten kommen von geodienste.ch, nur beim Messen und nur um den Abschnitt
  // (Fair Use); verschiebt man die Karte weit, wird um die neue Mitte nachgeladen.
  const [messung, setMessung] = useState<Messung | null>(null)
  const messungRef = useRef<Messung | null>(null)
  messungRef.current = messung
  const messGen = useRef(0)
  const messAvLaden = async (e: number, n: number, r: number) => {
    const gen = ++messGen.current
    setMessung(m => m && { ...m, laden: true, fehler: undefined })
    try {
      const kanten = bordkanten(await ladeAvFuer(cityCfg.avKanton ?? '', e, n, r))
      if (gen !== messGen.current) return
      setMessung(m => m && { ...m, kanten, geladen: { e, n, r }, laden: false,
        fehler: kanten.length ? undefined : 'Hier kennt die amtliche Vermessung keine Strassenfläche. Mit «Zwei Punkte» messen.' })
    } catch (err) {
      if (gen !== messGen.current) return
      setMessung(m => m && { ...m, laden: false,
        fehler: `Amtliche Vermessung nicht erreichbar (${(err as Error).message}). Mit «Zwei Punkte» messen.` })
    }
  }
  // ── Fahrbahnbreite aus der AV (Städte mit avKanton; breitenmessung.ts) ──────
  // Nur auf Knopfdruck (Fair Use von geodienste.ch). Lange Abschnitte in Kacheln zu höchstens
  // ±260 m, höchstens 6 Abfragen; dieselbe Fläche aus zwei Kacheln zählt einmal.
  const [fbLaden, setFbLaden] = useState<number | null>(null)
  // AV eines Abschnitts: Achsen (LV95) und Flächen. Zwischengespeichert je Abschnitt und Lage der
  // Segmente (Schlüssel aus den Kandidaten-Kennungen), damit Fahrbahnbreite und Planung dieselbe
  // Abfrage teilen und erneutes Zeigen nichts nachlädt (Fair Use). Wirft Error mit Meldungstext.
  const avCacheRef = useRef(new Map<string, AvFlaeche[]>())
  // inRichtungA: Segmente, die gegen Seite A laufen (candsGegenA), umdrehen — dann ist «rechts»
  // überall Seite A (für die Trottoirs je Seite).
  const avAchsen = (s: Section, inRichtungA = false): P[][] => {
    const candById = new Map(candsRef.current.map(c => [c.id, c]))
    const gegen = new Set(inRichtungA ? s.candsGegenA ?? [] : [])
    return (s.candIds ?? []).map(id => candById.get(id)).filter((c): c is Cand => !!c)
      .map(c => { const l = c.geom.map(p => zuLv95(p.lat, p.lon)); return gegen.has(c.id) ? l.reverse() : l })
  }
  const avFuerAbschnitt = async (s: Section): Promise<{ achsen: P[][]; flaechen: AvFlaeche[] }> => {
    const achsen = avAchsen(s)
    if (!achsen.length) throw new Error('Der Abschnitt hat keine Geometrie auf der Karte.')
    const schluessel = (s.candIds ?? []).join(',')
    const gemerkt = avCacheRef.current.get(schluessel)
    if (gemerkt) return { achsen, flaechen: gemerkt }
    const KACHEL = 500
    const kacheln = new Map<string, [number, number]>()
    for (const l of achsen) for (const [e, n] of l) {
      const k: [number, number] = [Math.floor(e / KACHEL), Math.floor(n / KACHEL)]
      kacheln.set(k.join('|'), k)
    }
    if (kacheln.size > 6) throw new Error('Der Abschnitt ist zu lang für eine Abfrage (über 6 Ausschnitte). Bitte teilen.')
    const flaechen: AvFlaeche[] = [], gesehen = new Set<string>()
    for (const [x, y] of kacheln.values()) {
      let liste: AvFlaeche[]
      try { liste = await ladeAvFuer(cityCfg.avKanton ?? '', x * KACHEL + KACHEL / 2, y * KACHEL + KACHEL / 2, KACHEL / 2 + 10) }
      catch (err) { throw new Error(`amtliche Vermessung nicht erreichbar (${(err as Error).message}).`) }
      for (const f of liste) {
        const sig = `${f.art}|${f.ringe[0]?.slice(0, 3).join(';')}|${f.ringe[0]?.length}`
        if (!gesehen.has(sig)) { gesehen.add(sig); flaechen.push(f) }
      }
    }
    avCacheRef.current.set(schluessel, flaechen)
    return { achsen, flaechen }
  }
  // ziel 'plan': in die verfügbare Fahrbahnbreite der Aufteilung statt ins Feld der Grunddaten.
  const fahrbahnbreiteErmitteln = async (secId: number, ziel: 'abschnitt' | 'plan' = 'abschnitt') => {
    const s = sections.find(x => x.id === secId)
    if (!s || fbLaden != null) return
    if (!avAchsen(s).length) { setMsg('Fahrbahnbreite: Der Abschnitt hat keine Geometrie auf der Karte.', 'info'); return }
    setFbLaden(secId); setMsg('Ermittle die Fahrbahnbreite aus der amtlichen Vermessung …', 'info')
    try {
      let av: { achsen: P[][]; flaechen: AvFlaeche[] }
      try { av = await avFuerAbschnitt(s) }
      catch (err) {
        const t = (err as Error).message
        setMsg(`Fahrbahnbreite: ${t}`, t.includes('nicht erreichbar') ? 'error' : 'info'); return
      }
      const { achsen, flaechen } = av
      const r = fahrbahnbreite(achsen, flaechen)
      if (!r) { setMsg('Fahrbahnbreite: Die amtliche Vermessung liefert hier keine eindeutige Strassenfläche (zu kurz, Platz oder Kreuzung). Bitte von Hand eintragen.', 'info'); return }
      const wert = Math.round(r.median * 10) / 10
      setSections(prev => prev.map(x => (x.id !== secId ? x
        : ziel === 'plan' ? (x.aufteilung ? { ...x, aufteilung: { ...x.aufteilung, fahrbahn: wert } } : x)
        : { ...x, fahrbahnbreite: wert, quelle: { ...x.quelle, fahrbahnbreite: 'av' } })))
      setMsg(`Fahrbahnbreite ${numDE(wert, 1)} m: Median aus ${r.n} Querschnitten, Spannweite ${numDE(r.min, 1)}–${numDE(r.max, 1)} m. ` +
        'Die Fläche umfasst auch Parkierung, Busbuchten und Tramgleise.', 'ok')
    } catch (err) {
      setMsg(`Fahrbahnbreite: amtliche Vermessung nicht erreichbar (${(err as Error).message}).`, 'error')
    } finally { setFbLaden(null) }
  }

  // Zoom und Ausschnitt bleiben, solange der Abschnitt (ganz oder teilweise) im Bild ist — wer
  // schon an der Messstelle steht, soll nicht herausgeworfen werden (Nutzer-Rückmeldung
  // 16.10.2026; vorher passte die Karte sich immer an den ganzen Abschnitt an). Nur wenn er gar
  // nicht zu sehen ist, springt die Karte hin. -> neuer Ausschnitt oder null (Karte blieb).
  const abschnittInsBild = (map: import('leaflet').Map, s: Section): [[number, number], [number, number]] | null => {
    const candById = new Map(candsRef.current.map(c => [c.id, c]))
    const pts = (s.candIds ?? []).flatMap(id => candById.get(id)?.geom ?? [])
    if (!pts.length) return null
    let s0 = Infinity, n0 = -Infinity, w0 = Infinity, e0 = -Infinity
    for (const p of pts) { s0 = Math.min(s0, p.lat); n0 = Math.max(n0, p.lat); w0 = Math.min(w0, p.lon); e0 = Math.max(e0, p.lon) }
    if (map.getBounds().intersects([[s0, w0], [n0, e0]])) return null
    const ziel: [[number, number], [number, number]] = [[s0, w0], [n0, e0]]
    map.fitBounds(ziel, { padding: [40, 40], maxZoom: 19 })
    return ziel
  }

  // ── AV in der Planung (Aufteilung planen) ────────────────────────────────────
  // Wie in fgsCheck: Strasse, Trottoir, Verkehrsinsel und Gebäude als Flächen über dem Orthofoto,
  // damit sich die Aufteilung am Bestand ablesen lässt. Gezeigt wird höchstens ein Abschnitt; die
  // Abfrage teilt sich den Zwischenspeicher mit der Fahrbahnbreite (avFuerAbschnitt).
  // Dazu die amtlichen Parkfelder (parkierung.ts, ladeParkflaechen; Bern, Zürich, Luzern), je Abschnitt
  // zwischengespeichert. Fehlen sie, bleibt die AV trotzdem stehen.
  const [planAv, setPlanAv] = useState<{ secId: number; flaechen: AvFlaeche[]; park: ParkFlaeche[] } | null>(null)
  const [planAvLaden, setPlanAvLaden] = useState<number | null>(null)
  const [berichtSec, setBerichtSec] = useState<number | null>(null)   // Bericht der Planung offen (Abschnitt-Id)
  const [zuSec, setZuSec] = useState<Set<number>>(new Set())          // eingeklappte Abschnitte
  const klappen = (id: number) => setZuSec(z => { const n = new Set(z); if (n.has(id)) n.delete(id); else n.add(id); return n })
  // Planung eines Abschnitts öffnen (Knopf oben neben «Anzeige»): aufklappen, anlegen, AV laden, hinscrollen
  const planungOeffnen = (secId: number) => {
    const s = sections.find(x => x.id === secId)
    if (!s) return
    setZuSec(z => { const n = new Set(z); n.delete(secId); return n })
    if (!s.aufteilung) {
      update(secId, { aufteilung: startAufteilung(s, city, cityCfg.breiten) })
      if (cityCfg.avKanton && s.candIds?.length) void planAvZeigen(secId)
    }
    setTimeout(() => document.getElementById(`plan-${secId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }
  const berichtSchliessen = useCallback(() => setBerichtSec(null), [])
  const parkCacheRef = useRef(new Map<string, ParkFlaeche[]>())
  const parkFuerAbschnitt = async (s: Section): Promise<ParkFlaeche[]> => {
    const stadt = cityCfg.parkierung
    if (!stadt || !PARK_QUELLE[stadt]) return []
    const schluessel = (s.candIds ?? []).join(',')
    const gemerkt = parkCacheRef.current.get(schluessel)
    if (gemerkt) return gemerkt
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
    for (const l of avAchsen(s)) for (const [e, n] of l) { a = Math.min(a, e); b = Math.min(b, n); c = Math.max(c, e); d = Math.max(d, n) }
    if (!Number.isFinite(a)) return []
    const r = PARK_MAX_M + 6
    const park = await ladeParkflaechen(stadt, [a - r, b - r, c + r, d + r].map(v => Math.round(v * 10) / 10) as ParkBox)
    parkCacheRef.current.set(schluessel, park)
    return park
  }
  const planAvZeigen = async (secId: number) => {
    const s = sections.find(x => x.id === secId)
    if (!s || planAvLaden != null) return
    if (mapRef.current) abschnittInsBild(mapRef.current, s)
    setPlanAvLaden(secId)
    const parkLaden = parkFuerAbschnitt(s).catch(() => null)   // parallel zur AV
    // Fussverkehrsnetz vorbelegen: Bern Richtplan Fussverkehr, Basel Teilrichtplan Fuss- und Wanderwege
    // Basel: Teilrichtplan Fuss- und Wanderwege (kantonal/kommunal); Zürich und Luzern: keine offenen Daten
    const netzLaden = !cityCfg.aufteilung || !avAchsen(s).length ? Promise.resolve(null)
      : city === 'bern' ? ladeFussnetz(avAchsen(s)).catch(() => null)
      : city === 'basel' ? ladeFussnetzBasel(avAchsen(s)).catch(() => null) : Promise.resolve(null)
    try {
      const { flaechen } = await avFuerAbschnitt(s)
      const park = await parkLaden
      setPlanAv({ secId, flaechen, park: park ?? [] })
      if (park == null) setMsg('Parkfelder der Stadt nicht erreichbar; die Karte zeigt nur die amtliche Vermessung.', 'info')
      // Mit der AV gleich messen: Trottoirs je Seite und, falls leer, die Fahrbahnbreite (wie
      // «aus AV ermitteln»). Ist die Planung noch die unveränderte Ausgangslage, wird sie mit den
      // Messwerten neu aufgebaut; sonst bleiben die eigenen Teile. Die bestehenden Trottoirs gehen
      // dabei nie verloren (Nutzerbefund 16.10.2026): Hat eine schon geänderte Planung keine,
      // kommen die gemessenen an die Ränder (mitTrottoirs).
      const achsen = avAchsen(s, true), kanten = bordkanten(flaechen)
      const tr = trottoirbreiten(achsen, flaechen, kanten)
      const pt = parkierungAufTrottoir(achsen, flaechen, park ?? [])   // Parkierung auf der Trottoirfläche je Seite
      const fb = Number.isFinite(s.fahrbahnbreite) ? null : fahrbahnbreite(achsen, flaechen, kanten)
      const netz = await netzLaden
      setSections(prev => prev.map(x => {
        if (x.id !== secId) return x
        const neu: Section = { ...x, trottoir: { a: tr.rechts ?? NaN, b: tr.links ?? NaN,
          ...(pt.rechts && tr.rechts != null ? { parkA: true } : {}), ...(pt.links && tr.links != null ? { parkB: true } : {}) } }
        if (fb) { neu.fahrbahnbreite = Math.round(fb.median * 10) / 10; neu.quelle = { ...x.quelle, fahrbahnbreite: 'av' } }
        if (netz) neu.fussnetzGeoportal = netz.netz
        if (x.aufteilung && JSON.stringify(x.aufteilung) === JSON.stringify(startAufteilung(x, city, cityCfg.breiten))) neu.aufteilung = startAufteilung(neu, city, cityCfg.breiten)
        else if (x.aufteilung) {
          neu.aufteilung = mitTrottoirs(x.aufteilung, neu.trottoir!)
          // ein schon gewähltes Netz bleibt; sonst das aus dem Geoportal
          if (netz && !neu.aufteilung.fussnetz) neu.aufteilung = { ...neu.aufteilung, fussnetz: netz.netz, fussnetzQuelle: 'geoportal' }
        }
        return neu
      }))
      const trText = (m: number | null) => (m != null ? `${numDE(m, 2)} m` : 'keines')
      const aufTr = (ja: boolean, m: number | null) => (ja && m != null ? ' (mit Parkierung auf Trottoirniveau)' : '')
      if (park != null) setMsg(`Amtliche Vermessung${park.length ? ' und Parkfelder' : ''} geladen. Trottoir Seite A ${trText(tr.rechts)}${aufTr(pt.rechts, tr.rechts)}, Seite B ${trText(tr.links)}${aufTr(pt.links, tr.links)}` +
        `${fb ? `, Fahrbahnbreite ${numDE(Math.round(fb.median * 10) / 10, 1)} m` : ''} (Median der Querschnitte alle 5 m).`, 'ok')
    } catch (err) {
      const t = (err as Error).message
      setMsg(`Amtliche Vermessung: ${t}`, t.includes('nicht erreichbar') ? 'error' : 'info')
    } finally { setPlanAvLaden(null) }
  }
  // Planung verworfen oder Abschnitt weg → AV ausblenden.
  useEffect(() => {
    if (planAv && !sections.some(s => s.id === planAv.secId && s.aufteilung)) setPlanAv(null)
  }, [sections, planAv])
  // Für die Karte nur die gezeigten Arten umrechnen (viele hundert Flächen je Kachel).
  const planAvWgs = useMemo(() => (planAv ? {
    flaechen: planAv.flaechen.filter(f => f.art in AV_FARBEN)
      .map(f => ({ art: f.art, ringe: f.ringe.map(r => r.map(p => zuWgs(p[0], p[1]))) })),
    park: planAv.park.map(f => ({ verbot: f.verbot, ringe: f.ringe.map(r => r.map(p => zuWgs(p[0], p[1]))) })),
    quelle: [avQuelle(cityCfg.avKanton ?? ''), ...(planAv.park.length && cityCfg.parkierung ? [PARK_QUELLE[cityCfg.parkierung] ?? ''] : [])]
      .filter(Boolean).join(' · '),
  } : null), [planAv, cityCfg.avKanton, cityCfg.parkierung])

  const messungStarten = (secId: number, seite: 'A' | 'B') => {
    const map = mapRef.current
    if (!map) return
    setTeilModus(false)
    const idx = sections.findIndex(s => s.id === secId)
    if (idx < 0) return
    // Die Bordsteinkanten kommen für das, was nach abschnittInsBild im Bild ist.
    const ziel = abschnittInsBild(map, sections[idx])
    const b = map.getBounds()
    const { e, n, r } = ziel ? avAusschnitt(ziel[0][0], ziel[0][1], ziel[1][0], ziel[1][1])
      : avAusschnitt(b.getSouth(), b.getWest(), b.getNorth(), b.getEast())
    setMessung({ secId, seite, titel: `Abschnitt ${idx + 1}, Seite ${seite}`, modus: 'kante',
      kanten: [], laden: true, punkte: [] })
    void messAvLaden(e, n, r)
  }
  // Karte weit verschoben → Bordsteinkanten um die neue Mitte nachladen.
  const messAktiv = messung != null
  useEffect(() => {
    const map = mapRef.current
    if (!map || !messAktiv) return
    const onMove = () => {
      const m = messungRef.current
      if (!m || m.laden || !m.geladen) return
      const b = map.getBounds(), neu = avAusschnitt(b.getSouth(), b.getWest(), b.getNorth(), b.getEast())
      if (Math.hypot(neu.e - m.geladen.e, neu.n - m.geladen.n) > 0.6 * m.geladen.r) void messAvLaden(neu.e, neu.n, neu.r)
    }
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setMessung(null) }
    map.on('moveend', onMove)
    window.addEventListener('keydown', onKey)
    return () => { map.off('moveend', onMove); window.removeEventListener('keydown', onKey) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messAktiv])
  const messKlick = (lat: number, lon: number) => {
    const m = messungRef.current
    if (!m) return
    const p = zuLv95(lat, lon)
    if (m.modus === 'kante') {
      if (m.laden) return
      const r = messeAbKante(p, m.kanten)
      setMessung({ ...m, punkte: [],
        ergebnis: r ? { breite: r.breite, von: r.fuss, bis: p } : undefined,
        fehler: r ? undefined : `Keine Bordsteinkante innert ${FANG_M} m. Näher bei der Kante klicken oder mit «Zwei Punkte» messen.` })
    } else {
      const punkte = m.punkte.length >= 2 ? [p] : [...m.punkte, p]
      setMessung({ ...m, punkte, fehler: undefined,
        ergebnis: punkte.length === 2 ? { breite: abstand(punkte[0], punkte[1]), von: punkte[0], bis: punkte[1] } : undefined })
    }
  }
  const messKlickRef = useRef(messKlick)
  messKlickRef.current = messKlick
  const messungUebernehmen = () => {
    const m = messungRef.current
    if (!m?.ergebnis) return
    const wert = aufZentimeter(m.ergebnis.breite)
    setSections(prev => prev.map(s => (s.id === m.secId ? setzeGemesseneBreite(s, m.seite, wert) : s)))
    setMessung(null)
    setMsg(`Breite ${numDE(wert, 2)} m gemessen (${m.titel}).`, 'ok')
  }
  // Für die Karte: Kanten nur bei neuem Ausschnitt umrechnen (viele tausend Strecken).
  const messKantenWgs = useMemo(() => (messung?.kanten ?? []).map(k => [zuWgs(k.a[0], k.a[1]), zuWgs(k.b[0], k.b[1])]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messung?.kanten])
  const messAnzeige: MessAnzeige | null = useMemo(() => {
    if (!messung) return null
    const w = (p: P) => zuWgs(p[0], p[1])
    const erg = messung.ergebnis
    return {
      kanten: messung.modus === 'kante' ? messKantenWgs : [],
      punkte: messung.modus === 'hand' && !erg ? messung.punkte.map(w) : [],
      ...(erg ? { linie: [w(erg.von), w(erg.bis)] as [{ lat: number; lon: number }, { lat: number; lon: number }],
                  label: `${numDE(erg.breite, 2)} m` } : {}),
    }
  }, [messung, messKantenWgs])

  const linieGeklickt = useCallback((id: number, lat: number, lon: number) => {
    if (messungRef.current) messKlickRef.current(lat, lon)   // Breitenmessung: Klick gilt der Messung
    else if (teilModusRef.current) void teilenRef.current(id, lat, lon)
    else toggleCand(id)
  }, [toggleCand])

  // Weg 3: Klick auf die Karte → nächstes Segment laden, anreichern und hinzufügen.
  // Wie beim Strassen-/Ausschnitt-Laden mit den Stadt-Daten + OpenBikeSensor anreichern
  // (Klick ist der Hauptweg zum Strecken-Aufbau, daher müssen DTV/Tempo/Routentyp/OBS auch hier kommen).
  const klickHinzufuegen = async (lat: number, lon: number) => {
    if (messung) { messKlick(lat, lon); return }
    if (teilModus) { setMsg('Teilen: bitte direkt auf die Linie tippen, die geteilt werden soll (Esc bricht ab).', 'info'); return }
    if (osmBusy) return                         // läuft schon eine Anfrage → Klick ignorieren (Rate-Limit schonen)
    const gen = ++ladeGen.current
    setOsmBusy(true); setMsg('Suche Segment an der Klickstelle …')
    try {
      const roh = await loadNearestCandidate(lat, lon)
      if (gen !== ladeGen.current) return
      if (!roh) { setMsg('An dieser Stelle kein velorelevantes Segment gefunden.', 'info'); return }
      // Über die Way-ID: auch ein geteilter Way (Teile mit eigenen Kennungen) ist «bereits geladen».
      if (candsRef.current.some(p => p.wayId === roh.wayId)) { setMsg(`Segment „${roh.name}" ist bereits geladen.`, 'info'); return }
      setCands(prev => (prev.some(p => p.wayId === roh.wayId) ? prev : [...prev, roh]))   // sofort hinzufügen
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
  const TRACKED: QuelleFeld[] = ['dtv', 'speed', 'ist', 'breite', 'routentyp', 'oevAngebot', 'tram', 'strassentyp', 'richtung',
    'fahrbahnbreite', 'parkenRechts']
  const update = (id: number, patch: Partial<Section>) =>
    setSections(prev => prev.map(s => {
      if (s.id !== id) return s
      const quelle = { ...s.quelle }
      for (const k of TRACKED) if (k in patch) quelle[k] = 'manuell'
      return { ...s, ...patch, quelle }
    }))
  const add = () => setSections(prev => [...prev, defaultSection()])
  const remove = (id: number) => setSections(prev => prev.filter(s => s.id !== id))
  const tauschen = (id: number) => setSections(prev => prev.map(s => (s.id === id ? tauscheSeiten(s) : s)))
  const luftbildAnnehmen = (id: number, welche: { a: boolean; b: boolean }) =>
    setSections(prev => prev.map(s => (s.id === id ? luftbildUebernehmen(s, welche) : s)))

  // Bewertung je Abschnitt und Seite (bewertung.ts); die Abschnittsnote ist die schlechtere Seite,
  // null solange eine Seite unvollständig ist. Strecke = schlechtester Abschnitt.
  const ergebnisse: AbschnittErgebnis[] = sections.map(s => bewerteAbschnitt(s, city, cityCfg.breiten))
  const offen = ergebnisse.filter(e => e.note == null).length
  const alleVollstaendig = offen === 0 && ergebnisse.length > 0
  // Abschnittsnoten (nur gelesen, wenn alle vollständig sind).
  const noten = ergebnisse.map(e => e.note ?? NaN)
  // Strecken-Note nur, wenn alle Abschnitte vollständig sind.
  const streckeNote = alleVollstaendig ? Math.min(...noten) : null
  const worstIdx = alleVollstaendig
    ? noten.reduce((wi, n, i) => (n < noten[wi] ? i : wi), 0)
    : -1
  const sc = streckeNote != null ? noteColor(streckeNote) : { bg: 'var(--text-muted-strong)', fg: '#ffffff' }

  // Karten-Marker je Abschnitt: Nummer am Mittelpunkt des längsten zugehörigen OSM-Segments
  // (liegt auf der Linie). Nur Abschnitte mit OSM-Herkunft (candIds); manuelle ohne Marker.
  // useMemo: stabile Referenz, sonst zeichnet der VeloMap-Effekt bei jedem Render alles neu.
  // Abhängig nur von der candIds-STRUKTUR (Schlüssel unten), nicht vom sections-Array selbst —
  // sonst löste jeder Tastendruck in einer SectionCard ein komplettes Karten-Neuzeichnen aus.
  // Der Schlüssel trägt auch die Fahrtrichtung (Seiten tauschen dreht den Pfeil).
  const candIdsKey = sections.map(s =>
    `${s.id}:${(s.candIds ?? []).join('.')}:${(s.candsGegenA ?? []).join('.')}:${s.peilungA != null}`).join('|')
  // Führungsform der übernommenen Abschnitte für die Linienfarbe (eine Änderung von Hand färbt die Karte mit)
  // Schlüssel als Text: die Karte zeichnet nur neu, wenn sich eine Form ändert, nicht bei jeder Eingabe
  const formenSchluessel = sections.map(s => `${(s.candIds ?? []).join(',')}:${seiteA(s).ist}|${s.richtung === 'beide' ? seiteB(s).ist : ''}`).join(';')
  const formen = useMemo(() => {
    const m = new Map<number, { a: string; b?: string }>()
    for (const s of sections) {
      const a = seiteA(s).ist, b = s.richtung === 'beide' ? seiteB(s).ist : ''
      if (!a && !b) continue
      for (const id of s.candIds ?? []) m.set(id, { a: a || b, ...(b && b !== a ? { b } : {}) })
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formenSchluessel])
  const markers: SectionMarker[] = useMemo(() => {
    const candById = new Map(cands.map(c => [c.id, c]))
    return sections.flatMap((s, i) => {
      const segs = (s.candIds ?? [])
        .map(id => candById.get(id)).filter((c): c is Cand => !!c && c.geom.length >= 2)
      if (segs.length === 0) return []
      const longest = segs.reduce((a, b) => (b.len > a.len ? b : a))
      const g = longest.geom, k = Math.floor(g.length / 2)
      const mid = g[k]
      // Pfeil = Fahrtrichtung der Seite A an der Marker-Stelle: Richtung der Kante dort, umgedreht,
      // wenn dieser Way gegen Seite A läuft. Lokal statt der Sehne des Abschnitts — in einer Kehre
      // zeigt die Sehne sonst quer zur Strasse.
      const [p, q] = k + 1 < g.length ? [g[k], g[k + 1]] : [g[k - 1], g[k]]
      const lokal = peilung(p, q)
      const pfeil = s.peilungA == null ? undefined
        : (s.candsGegenA?.includes(longest.id) ? (lokal + 180) % 360 : lokal)
      return [{ num: i + 1, lat: mid.lat, lon: mid.lon, peilung: pfeil }]
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
    <AvContext.Provider value={cityCfg.avKanton ? avQuelle(cityCfg.avKanton) : ''}>
    <div className={view === 'rechner' ? 'vrc-app-rechner' : undefined}
         style={{ fontFamily: 'system-ui, -apple-system, sans-serif', color: 'var(--text-strong)' }}>
      {/* Keine Kopfleiste (Standard der Check-Apps seit 16.10.2026): Logo, Name und Marke stehen im Panel bzw. auf der Startseite */}

      {view === 'home' && <Landing onStart={() => go('rechner')} />}

      {/* Rechner: schmal einspaltig (max. 820 px, wie bisher); ab BREIT_MQ zweispaltig —
          Karte links in voller Höhe, rechts das Panel mit eigenem Scrollen. Beide Layouts
          haben dieselbe Elementstruktur, nur das CSS unterscheidet sich (index.css). */}
      {view === 'rechner' && (
      <div className="vrc-rechner">
      <div className="vrc-panel" style={{ padding: '20px 16px 64px' }}>
        <h1 className="vrc-h1">
          <button className="logo-knopf" onClick={() => go('home')} title="Zur Startseite" aria-label="Zur Startseite">
            <img src={import.meta.env.BASE_URL + 'logo.svg'} alt="" width={36} height={36} />
          </button>
          VeloroutenCheck <span className="marke">Beta</span>
        </h1>
        <SoFunktionierts />

      {/* Anzeige-Umschalter: Schulnote (1–6) ↔ vierstufiger Erfüllungsgrad. Rein darstellend. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
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
      {/* Aufteilung planen, gleich oben und hervorgehoben (Nutzerwünsche 16.10.2026); je Abschnitt von der Karte
          ein Knopf. Ohne Abschnitt von der Karte lief das ins Leere (keine Geometrie, also keine AV, Trottoirs,
          Parkfelder; «übernehmen» bildet die Abschnitte neu): dann nur der Hinweis, was zuerst zu tun ist. */}
      {cityCfg.aufteilung && (
        <div style={{ margin: '-8px 0 20px', padding: '10px 14px', borderRadius: 10, background: '#f0fdfa',
                      border: '1px solid #99f6e4', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>Aufteilung der Strasse planen</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted-strong)' }}>
              {sections.some(s => s.candIds?.length)
                ? 'Querschnitt neu aufteilen, gegen die Vorgaben prüfen und als Bericht drucken.'
                : 'Zuerst Segmente auf der Karte wählen und «Segmente in Strecke übernehmen», dann hier den Abschnitt wählen.'}
            </div>
          </div>
          {sections.map((s, i) => !s.candIds?.length ? null : (
            <button key={s.id} type="button" onClick={() => planungOeffnen(s.id)}
                    title={s.label ? `Abschnitt ${i + 1}: ${s.label}` : `Abschnitt ${i + 1}`}
                    style={{ border: s.aufteilung ? '1px solid var(--accent)' : 'none', background: s.aufteilung ? '#fff' : 'var(--accent)',
                             color: s.aufteilung ? 'var(--accent)' : '#fff', borderRadius: 8, padding: '8px 14px',
                             fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              {sections.filter(x => x.candIds?.length).length === 1 ? 'Abschnitt planen' : `Abschnitt ${i + 1} planen`}
              {s.aufteilung ? ' ✓' : ''}
            </button>
          ))}
        </div>
      )}

      {/* Sticky Ergebnis-Leiste: Strecken-Beurteilung jederzeit sichtbar (Punkt 1).
          Klick springt zum massgebenden bzw. ersten unvollständigen Abschnitt. Die volle
          Beurteilung steht weiterhin unten. */}
      {/* zIndex bewusst klein: der Karten-Wrapper isoliert Leaflet (eigener Stacking-Context,
          s. unten) — so muss die Sticky-Leiste native Dropdowns/Popover nicht mehr überbieten. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, marginBottom: 18 }}>
        <button
          onClick={() => {
            const ziel = streckeNote != null ? worstIdx : ergebnisse.findIndex(e => e.note == null)
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
              : `· unvollständig (${offen} von ${ergebnisse.length} offen)`}
          </span>
        </button>
      </div>

      {/* Aus OpenStreetMap laden */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
                    background: '#fff', padding: 14, borderRadius: 12, border: '1px solid var(--border-subtle)',
                    marginBottom: 18 }}>
        {/* Stadt und Strassensuche stehen seit 17.10.2026 über der Karte (Kartenkopf, wie fgsCheck) */}
        <div style={{ flexBasis: '100%', fontSize: 12, color: 'var(--text-muted-strong)' }}>
          Grundlage {cityCfg.label}:{' '}
          <a href={cityCfg.standardDoc.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
            {cityCfg.standardDoc.titel}
          </a>
        </div>
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
            Linien an-/abwählen, dann übernehmen. Die Strassensuche oben auf der Karte ist optional. */}
        <div style={{ flexBasis: '100%' }}>
          {/* .vrc-karte (index.css): position relative + z-index 0 isoliert Leaflets interne
              z-Indizes (Controls bis 1000) im eigenen Stacking-Context — sie können die
              Sticky-Leiste (zIndex 100) nicht mehr überdecken. Im Breitbild liegt .vrc-karte
              absolut über der linken Spalte (Bezug .vrc-rechner, nicht das scrollende Panel) und
              bleibt so beim Scrollen des Panels stehen. */}
          <div className="vrc-karte">
            <VeloMap cands={cands} onLineClick={linieGeklickt} onMapClick={klickHinzufuegen}
                     onReady={m => { mapRef.current = m }}
                     markers={markers} highlightIds={highlightIds} stops={stops}
                     attribution={cityCfg.attribution} center={cityCfg.center} fitKey={fitKey} obsStand={cityCfg.obsStand}
                     teilModus={teilModus} orthofoto={messAktiv || planAv != null} messung={messAnzeige} av={planAvWgs} formen={formen} />
            {/* Kartenkopf: Stadt und Strassensuche (während einer Messung steht dort deren Werkzeugleiste) */}
            {!messung && (
              <div className="vrc-kartenkopf">
                <select value={city} onChange={e => wechsleStadt(e.target.value as CityId)} aria-label="Stadt"
                        disabled={osmBusy}   // Stadtwechsel während einer laufenden Ladung sperren (Race-Schutz)
                        title={`Grundlage: ${cityCfg.standardDoc.titel}`}>
                  {(Object.keys(CITIES) as CityId[]).map(k => <option key={k} value={k}>{CITIES[k].label}</option>)}
                </select>
                <Strassensuche text={street} setText={setStreet} stadt={cityCfg.label} busy={osmBusy}
                               onLaden={name => void ladeStrasse(name)} />
              </div>
            )}
            {/* Breitenmessung: Werkzeugleiste auf der Karte (klickbar, liegt über dem Kartenrand). */}
            {messung && (
              <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 600,
                            width: 'min(470px, calc(100% - 110px))', background: '#fff', borderRadius: 10,
                            boxShadow: '0 4px 14px rgba(0,0,0,0.25)', padding: '10px 12px', fontSize: 12.5,
                            color: 'var(--text)', lineHeight: 1.45 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-strong)', marginBottom: 6 }}>
                  📏 Breite messen · {messung.titel}
                </div>
                <div role="group" aria-label="Messart"
                     style={{ display: 'inline-flex', flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 8,
                              overflow: 'hidden', marginBottom: 6 }}>
                  {([['kante', 'Ab Bordsteinkante (AV)'], ['hand', 'Zwei Punkte']] as const).map(([m, label]) => (
                    <button key={m} type="button" aria-pressed={messung.modus === m}
                            onClick={() => setMessung({ ...messung, modus: m, punkte: [], ergebnis: undefined,
                              fehler: m === 'kante' && !messung.laden && messung.kanten.length === 0 ? messung.fehler : undefined })}
                            style={{ border: 'none', padding: '5px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                                     background: messung.modus === m ? 'var(--accent)' : '#fff',
                                     color: messung.modus === m ? '#fff' : 'var(--text)' }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div>
                  {messung.modus === 'kante'
                    ? 'Weit hineinzoomen und auf die Markierung klicken, an der Stelle, bis zu der die Breite zählt. Gemessen wird rechtwinklig bis zur Bordsteinkante (orange).'
                    : 'Weit hineinzoomen, zuerst die Bordsteinkante und dann die Markierung anklicken.'}
                </div>
                <div style={{ marginTop: 6, fontWeight: 600, color: messung.fehler ? '#b91c1c' : 'var(--text-strong)' }}>
                  {messung.modus === 'kante' && messung.laden ? 'Lade Bordsteinkanten …'
                    : messung.fehler ?? (messung.ergebnis ? `Breite: ${numDE(messung.ergebnis.breite, 2)} m`
                      : messung.modus === 'hand' && messung.punkte.length === 1 ? 'Jetzt die Markierung anklicken.' : 'Noch nicht gemessen.')}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={messungUebernehmen} disabled={!messung.ergebnis}
                          style={{ border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600,
                                   background: messung.ergebnis ? 'var(--accent)' : 'var(--text-faint)', color: '#fff',
                                   cursor: messung.ergebnis ? 'pointer' : 'default' }}>
                    {messung.ergebnis ? `${numDE(aufZentimeter(messung.ergebnis.breite), 2)} m übernehmen` : 'Übernehmen'}
                  </button>
                  <button type="button" onClick={() => setMessung(null)} style={kleinKnopfStyle}>Abbrechen</button>
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                  Luftbild © swisstopo · {avQuelle(cityCfg.avKanton ?? '')}
                </div>
              </div>
            )}
            {/* Teil-Modus: Hinweis direkt auf der Karte (im Breitbild steht die Anleitung im Panel
                rechts, weit weg von der Stelle, an der man tippen soll). Klick-transparent. */}
            {teilModus && (
              <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                            zIndex: 500, pointerEvents: 'none', maxWidth: 'calc(100% - 120px)',
                            background: 'rgba(15,23,42,0.88)', color: '#fff', borderRadius: 10,
                            padding: '7px 14px', fontSize: 13, fontWeight: 600, textAlign: 'center',
                            boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}>
                ✂ Linie dort antippen, wo geteilt werden soll · Esc bricht ab
              </div>
            )}
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
                    ab-/zuwählen · oder oben eine Strasse suchen.
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
              <button onClick={() => {
                        if (teilModus) { setTeilModus(false); setMsg('Teilen abgebrochen.', 'info'); return }
                        setTeilModus(true)
                        setMsg('Teilen: auf die Linie tippen, wo sie geteilt werden soll (Esc bricht ab).', 'info')
                      }}
                      disabled={osmBusy || messAktiv}
                      aria-pressed={teilModus}
                      title="Ein Segment an der angeklickten Stelle in zwei Teile schneiden"
                      style={{ border: teilModus ? '1px solid var(--accent)' : '1px solid var(--border)',
                               background: teilModus ? 'var(--accent)' : '#fff',
                               color: teilModus ? '#fff' : 'var(--text)',
                               borderRadius: 8, padding: '8px 12px', fontSize: 13,
                               cursor: osmBusy ? 'default' : 'pointer' }}>
                {teilModus ? 'Teilen abbrechen' : '✂ Segment teilen'}
              </button>
            )}
            {cands.length > 0 && (
              <button onClick={() => { undoMerken('Karte leeren rückgängig'); setCands([]); setStops([]); setMsg(''); setTeilModus(false); setMessung(null) }}
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
          {/* Teil-Modus: eigene Anleitung. Die drei Schritte zum Aufbau der Strecke standen bis
              16.10.2026 immer hier; sie stehen in «So funktioniert's» und im Hinweis auf der leeren
              Karte (Nutzerentscheid: doppelt, entfernt). */}
          {teilModus && (
            <div style={{ fontSize: 12.5, marginTop: 8, padding: '8px 12px', borderRadius: 8, lineHeight: 1.6,
                          background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
              <strong>Segment teilen:</strong> Auf die Linie tippen, genau an der Stelle, an der das Segment
              geteilt werden soll. Danach ist der Teil-Modus wieder aus; für einen weiteren Schnitt erneut
              «✂ Segment teilen» wählen. Esc oder «Teilen abbrechen» bricht ab, «Teilen rückgängig» nimmt
              einen Schnitt zurück.
            </div>
          )}
          {/* Legende Führungsform, einklappbar (Nutzerwunsch 16.10.2026) */}
          <details className="vrc-klappe" style={{ marginTop: 6, fontSize: 12 }}>
            <summary style={{ cursor: 'pointer', userSelect: 'none', color: 'var(--text-muted-strong)' }}>Legende Führungsform</summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 4 }}>
              {Object.entries(ISTCOLOR).map(([k, col]) => (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-muted-strong)' }}>
                  <span style={{ width: 16, height: 4, background: col, borderRadius: 2 }} />{k}
                </span>
              ))}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-muted-strong)' }}>
                <span style={{ width: 16, height: 4, borderRadius: 2, background: '#1e293b',
                               backgroundImage: 'repeating-linear-gradient(90deg, #fff 0 4px, transparent 4px 8px)', backgroundClip: 'content-box',
                               padding: 1 }} />nicht gewählt
              </span>
            </div>
            <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>
              Übernommene Abschnitte in der Führungsform des Rechners (auch von Hand geändert), sonst wie in OpenStreetMap;
              ist Seite B anders, liegt sie gestrichelt darüber.
            </div>
          </details>
        </div>
      </div>

      {/* Strecken-Beurteilung (schlechtester Abschnitt). Kompakt, Einzelheiten einklappbar (Nutzerwunsch 16.10.2026). */}
      <div style={{ padding: '8px 14px', borderRadius: 10, background: sc.bg, color: sc.fg,
                    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85 }}>Strecke</span>
          <span style={{ fontSize: modus === 'erfuellung' ? 17 : 26, fontWeight: 800, lineHeight: 1.1 }}>
            {streckeNote == null ? '–' : modus === 'erfuellung' ? erfuellungsgrad(streckeNote) : numDE(streckeNote, 1)}
          </span>
        </div>
        <details className="vrc-klappe auf-farbe" style={{ fontSize: 13, opacity: 0.95, flex: 1, minWidth: 200 }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
            {streckeNote != null ? `${sections.length} ${sections.length === 1 ? 'Abschnitt' : 'Abschnitte'} · Details`
              : `Unvollständig — ${offen} von ${ergebnisse.length} ${ergebnisse.length === 1 ? 'Abschnitt braucht' : 'Abschnitten brauchen'} noch Eingaben`}
          </summary>
          {streckeNote != null ? (
            <>
              <div style={{ marginTop: 4 }}>
                {modus === 'erfuellung' ? 'Beurteilung' : 'Note'} = schlechtester Abschnitt{' '}
                (<strong>Abschnitt {worstIdx + 1}</strong>,{' '}
                {modus === 'erfuellung'
                  ? erfuellungsgrad(noten[worstIdx]).toLowerCase()
                  : `Note ${numDE(noten[worstIdx], 1)}`}).
              </div>
              <div style={{ marginTop: 2, opacity: 0.85, fontSize: 12.5 }}>
                {modus === 'erfuellung'
                  ? noten.map((n, i) => `A${i + 1}: ${erfuellungsgrad(n)}`).join(' · ')
                  : 'Einzelnoten: ' + noten.map((n, i) => `A${i + 1}: ${numDE(n, 1)}`).join(' · ')}
              </div>
            </>
          ) : (
            <div style={{ marginTop: 4 }}>Es fehlen DTV, Tempo oder Führungsform.</div>
          )}
        </details>
      </div>

      {/* Bericht der Planung (Druckansicht, Portal im body) */}
      {(() => {
        const i = sections.findIndex(x => x.id === berichtSec)
        const s = sections[i]
        if (!s?.aufteilung) return null
        const rA = s.peilungA != null ? himmelsrichtung(s.peilungA) : null
        const rB = s.peilungA != null ? himmelsrichtung(s.peilungA + 180) : null
        const mitAv = planAv?.secId === s.id
        const quellen = [
          `Abschnittsdaten (DTV, Tempo, Routentyp u. a.): ${cityCfg.attribution}`,
          ...(mitAv && cityCfg.avKanton ? [`Bodenbedeckung und Trottoirs: ${avQuelle(cityCfg.avKanton)}`] : []),
          ...(mitAv && planAv!.park.length && cityCfg.parkierung ? [`Parkfelder: ${PARK_QUELLE[cityCfg.parkierung]}`] : []),
          ...(s.aufteilung.fussnetzQuelle === 'geoportal' ? [`Fussverkehrsnetz: ${city === 'basel' ? FUSSNETZ_BASEL : FUSSNETZ_GEOPORTAL}`] : []),
        ]
        return <Bericht section={{ ...s, aufteilung: s.aufteilung }} nr={i + 1} heute={ergebnisse[i]} city={city} breiten={cityCfg.breiten}
                        stadtName={cityCfg.label} modus={modus} rA={rA} rB={rB} achsen={avAchsen(s, true)}
                        routenLabel={Object.fromEntries((cityCfg.routenOptions ?? []).map(o => [o.value, o.label]))}
                        av={mitAv ? planAv!.flaechen : []} park={mitAv ? planAv!.park : []} quellen={quellen}
                        schliessen={berichtSchliessen} />
      })()}

      {/* Abschnitte */}
      <h2 style={{ fontSize: 16, margin: '26px 0 12px' }}>Abschnitte</h2>
      {sections.map((s, i) => (
        <div key={s.id} id={'sec-' + i} style={{ scrollMarginTop: 64 }}>
          <SectionCard
            index={i} section={s} ergebnis={ergebnisse[i]}
            isWorst={i === worstIdx && sections.length > 1} modus={modus}
            onChange={patch => update(s.id, patch)}
            onTauschen={() => tauschen(s.id)}
            onLuftbild={welche => luftbildAnnehmen(s.id, welche)}
            onMessen={cityCfg.avKanton ? (seite => messungStarten(s.id, seite)) : undefined}
            onFahrbahnbreite={cityCfg.avKanton && s.candIds?.length ? (ziel => void fahrbahnbreiteErmitteln(s.id, ziel)) : undefined}
            fbLaden={fbLaden === s.id}
            onBericht={() => setBerichtSec(s.id)}
            zu={zuSec.has(s.id)} onKlappen={() => klappen(s.id)}
            av={cityCfg.avKanton && s.candIds?.length ? {
              gezeigt: planAv?.secId === s.id, laden: planAvLaden === s.id, park: planAv?.secId === s.id && planAv.park.length > 0,
              zeigen: () => void planAvZeigen(s.id), ausblenden: () => setPlanAv(p => (p?.secId === s.id ? null : p)),
            } : undefined}
            onRemove={() => remove(s.id)}
            canRemove={sections.length > 1}
            onHover={h => setHoverSec(h ? s.id : null)}
            breitenQuelle={ist => breitenQuelleFuer(ist, s.routentyp)}
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
        <button onClick={() => downloadCsv(buildCsv(sections, ergebnisse, streckeNote, city, cityCfg.label, undefined, cityCfg.obsStand))}
                title="Alle Abschnitte mit Werten, Herkunft und Note als CSV (Excel) herunterladen"
                style={{ border: '1px solid var(--accent)', background: '#fff', color: 'var(--accent)',
                         borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 600,
                         cursor: 'pointer', flex: 1, minWidth: 200 }}>
          ↓ Als CSV exportieren
        </button>
      </div>

      {/* Referenz: Entscheidungstabellen + Hinweise — eingeklappt, um Scroll zu sparen (Punkt 6) */}
      <details className="vrc-klappe" style={{ marginTop: 28 }}>
        <summary style={{ cursor: 'pointer', fontSize: 16, fontWeight: 700, color: 'var(--text)', userSelect: 'none' }}>
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
      </div>
      )}
    </div>
    </AvContext.Provider>
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
