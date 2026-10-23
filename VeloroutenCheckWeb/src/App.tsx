import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  haltestellenTypen, haltestellenMitBreite, PARKEN_RELEVANT,
  brauchtBreite, brauchtDtvTempo, erfuellungsgrad, FEELSAFE, SCORE_PRO_NOTE, BREITE_SATZ, PARKEN_ABZUG, HALTESTELLE_ABZUG, TRAM_DECKEL,
  FUSSWEG_BASIS, HALTESTELLENBEREICH_MAX_M, HALTESTELLENBEREICH_NICHT_ERFUELLT, BREITEN_ZUERICH, BREITEN_BASEL, BREITEN_LUZERN,
  GEGENVERKEHR_FORMEN, GEGENVERKEHR_DEFAULT,
  type IstFuehrungsform, type Routentyp, type ParkenRechts,
  type OevAngebot, type Haltestellentyp, type NotenErgebnis, type BreitenSoll,
  type Stadt, type Strassentyp, type VergleichsNote,
} from './fuehrungsform'
import { VeloMap, ISTCOLOR, BREIT_MQ, AV_FARBEN, PARK_FARBE, PARKVERBOT_FARBE, ZWEIRAD_FARBE, type Cand, type SectionMarker, type Stop, type MessAnzeige } from './VeloMap'
import { zuLv95, zuWgs, type P } from './lv95'
import { ladeAvFuer, avQuelle } from './av'
import Strassensuche from './Strassensuche'
import { vorschlagRechnen, aufteilungAusVorschlag, trottoirAnpassung, fahrbahnMitRandstein, RANG_TEXT, type TrottoirAnpassung, type Vorschlag } from './vorschlag'
import { bordkanten, messeAbKante, messeFlaeche, abstand, aufZentimeter, fahrbahnbreite, haltestelleninsel, haltestellenperron, wartehalleLage, zweiradJeSeite, wegAufTrottoir, type Haltestelleninsel, mittelinsel, mittelstreifen, parkierungAufTrottoir, parkierungTiefe, parkierungVersetzt, trottoirbreiten, FANG_M, type Kante } from './breitenmessung'
import type { AvFlaeche } from './av'
import { artVorschlag, aufnahmeTeile, avArtAn, fangeLage, grenzenAufLinie, querLinie, GANZ, type QsArt, FANG_MAX_M as QS_FANG_MAX_M, FANG_PX as QS_FANG_PX } from './querschnittAufnahme'
import {
  candsToSections, defaultSection, dtvAssumed, gegenVon, seiteA, seiteB, tauscheSeiten,
  luftbildHinweis, luftbildUebernehmen, setzeGemesseneBreite,
  type Quelle, type QuelleFeld, type Section, type Seite, type SeitenQuelle,
} from './strecke'
import { bewerteAbschnitt, aufzaehlen, type AbschnittErgebnis } from './bewertung'
import { QuerschnittSkizze, breiteCm } from './Querschnitt'
import { quellenFuer, type QuellenGruppe } from './quellen'
import Bericht from './Bericht'
import { ladeFussnetz, ladeFussnetzBasel, FUSSNETZ_BASEL, FUSSNETZ_GEOPORTAL } from './fussnetz'
import {
  bilanz, bilanzText, bewerteAufteilung, haltUmfeld, hatHaltestelle, haltestelleninselUebernehmen, haltestelleEinfuegen, HS_VORLAGEN, fussnetzOptionen, FUSS_QUELLE, STANDARD_QUELLE, mitSeitenraum, bildVon, linksDerMitte, markierungenFuer, pruefungText, richtungenFuer, richtungVon, FUSSNETZ, mitTrottoirs, pruefeKernfahrbahn, pruefeTeil, standardBreite, startAufteilung, umfeldVon, istFahrbahnTeil,
  BILDER, BILD_LABEL, MARKIERUNG_LABEL, PFEILE, markierungAus, parkTiefeVorbelegt, pfeileVon, TEIL_GRUPPEN, TEIL_LABEL, auf5cm,
  type Aufteilung, type Bild, type FussNetz, type Pfeil, type Richtung, type Teil, type TeilArt, type TeilPruefung,
} from './aufteilung'
import { himmelsrichtung, peilung } from './geo'
import { mitParallelen } from './parallelwege'
import { ladeWartehallen, loadBboxCandidates, loadNearestCandidate, loadStreetCandidates, teileInListe, MIN_TEIL_M } from './osm'
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

// Beurteilung einer Note (seit 22.10.2026, Nutzerwunsch): vorne der Erfüllungsgrad, dahinter klein die
// Schulnote als Herleitung. Vorher schaltete «Anzeige: Schulnote | Erfüllungsgrad» oben im Panel zwischen
// beiden um (Standard Schulnote); der Schalter ist weg, jede Stelle zeigt beides in dieser Reihenfolge.
function Beurteilung({ note }: { note: number }) {
  return <>{erfuellungsgrad(note)}<span style={{ fontWeight: 600, fontSize: '0.85em', opacity: 0.85 }}> · Note {numDE(note, 1)}</span></>
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

function NumberField({ label, unit, value, onChange, chip, kompakt, dezimalen }: {
  label: string; unit: string; value: number; onChange: (v: number) => void
  step?: number; chip?: React.ReactNode
  kompakt?: boolean                     // ohne sichtbare Beschriftung, schmal (Zeilen der Aufteilung)
  dezimalen?: number                    // Nachkommastellen der Anzeige (Meter 2, sonst 0); getippt wird frei
}) {
  // Text-Feld mit lokalem Rohtext statt type="number": erlaubt das Komma («2,3») und
  // Tipp-Zwischenstände («2,»), ohne dass der Wert unterwegs zu 0 kollabiert.
  // Anzeige mit festen Nachkommastellen (seit 22.10.2026: Meter «3,60» statt «3,6»; vorher kamen auch
  // Gleitkomma-Reste wie 2,405000000000 ins Feld). Beim Tippen bleibt der Rohtext stehen.
  const dez = dezimalen ?? (unit === 'm' ? 2 : 0)
  const anzeige = (v: number) => (Number.isFinite(v) ? numDE(v, dez) : '')
  const [text, setText] = useState(anzeige(value))
  // Externe Wertänderung (OSM-Übernahme, Leeren) ins Feld spiegeln — aber nicht das
  // gerade Getippte überschreiben, solange es denselben Wert bedeutet.
  useEffect(() => {
    const p = parseZahl(text)
    const gleich = Number.isFinite(value) ? p === value : Number.isNaN(p)
    if (!gleich) setText(anzeige(value))
  }, [value])  // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label style={kompakt ? { display: 'flex', width: 120, flexShrink: 0 }
                          : { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 150 }}>
      {!kompakt && <FieldLabel label={label} chip={chip} />}
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="text" inputMode="decimal" value={text} aria-label={kompakt ? label : undefined}
          onChange={e => { setText(e.target.value); onChange(parseZahl(e.target.value)) }}
          onBlur={() => setText(anzeige(value))}
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
// Werkzeugleiste auf der Karte (seit 22.10.2026 ein Rahmen für alle Messwerkzeuge: Breite einer Seite, Element für
// Element, Querschnitt): Titel mit ✕ (auch Esc), Inhalt, Quellenzeile.
function Kartenleiste({ titel, breit, onSchliessen, quelle, children }: {
  titel: string; breit?: boolean; onSchliessen: () => void; quelle: string; children: React.ReactNode
}) {
  return (
    <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 600,
                  width: `min(${breit ? 500 : 470}px, calc(100% - 110px))`, maxHeight: 'calc(100% - 30px)', overflowY: 'auto',
                  background: '#fff', borderRadius: 10, boxShadow: '0 4px 14px rgba(0,0,0,0.25)', padding: '10px 12px',
                  fontSize: 12.5, color: 'var(--text)', lineHeight: 1.45 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-strong)', flex: 1 }}>{titel}</span>
        <button type="button" onClick={onSchliessen} aria-label="Schliessen (Esc)" title="Schliessen (Esc)"
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 15, color: 'var(--text-muted)', padding: '0 4px', minHeight: 0 }}>✕</button>
      </div>
      {children}
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>Luftbild © swisstopo · {quelle}</div>
    </div>
  )
}

// «1 Segment», «2 Segmente» (Befund 22.10.2026: «1 Segmente» im Knopf und in der Meldung)
const segmente = (n: number) => `${n} ${n === 1 ? 'Segment' : 'Segmente'}`

// Erklärung hinter einem ⓘ (seit 22.10.2026): kurzer Text als Tooltip und auf Klick (auch auf Touch) unter dem Feld.
// Vorher standen die Sätze offen unter den Feldern und verlängerten jede Zeile.
function Info({ text }: { text: string }) {
  const [auf, setAuf] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAuf(v => !v)} aria-expanded={auf} aria-label={auf ? 'Erklärung schliessen' : 'Erklärung'} title={text}
              style={{ border: 'none', background: 'none', padding: '0 4px', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, lineHeight: 1, minHeight: 0, verticalAlign: 'middle' }}>
        ⓘ
      </button>
      {auf && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 400, color: 'var(--text-muted-strong)', marginTop: 2 }}>{text}</span>}
    </>
  )
}
// Aufklappmenü (index.css .vrc-menu): schliesst nach der Wahl eines Eintrags und bei Klick daneben
function menuZu(e: React.SyntheticEvent) { const d = (e.currentTarget as HTMLElement).closest('details'); if (d) d.open = false }
function Menu({ label, klasse, titel, children }: { label: React.ReactNode; klasse?: string; titel?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const zu = (ev: Event) => { const d = ref.current; if (d?.open && !d.contains(ev.target as Node)) d.open = false }
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && ref.current) ref.current.open = false }
    document.addEventListener('pointerdown', zu); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', zu); document.removeEventListener('keydown', esc) }
  }, [])
  return (
    <details ref={ref} className={`vrc-menu${klasse ? ` ${klasse}` : ''}`}>
      <summary title={titel}>{label}</summary>
      <div>{children}</div>
    </details>
  )
}
// Stelle des Karten-Markers und Fahrtrichtung der Seite A (Street View; in der Kopfzeile und in der Planung)
type Ort = { lat: number; lon: number; peilung?: number }
// Google Street View an der Stelle des Karten-Markers, Blick in Fahrtrichtung der Seite A (Nutzerwunsch 20.10.2026);
// Google Maps URLs (map_action=pano) sucht das nächste Panorama
function StreetViewLink({ ort, stil }: { ort: Ort; stil?: React.CSSProperties }) {
  return (
    <a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ort.lat.toFixed(6)},${ort.lon.toFixed(6)}`
             + (ort.peilung != null ? `&heading=${Math.round(ort.peilung)}` : '')}
       target="_blank" rel="noopener noreferrer"
       title={`Google Street View an der Stelle des Markers${ort.peilung != null ? ', Blick in Fahrtrichtung der Seite A' : ''} (öffnet Google Maps)`}
       style={{ ...kleinKnopfStyle, color: 'var(--text-muted)', fontWeight: 400, fontSize: 13, padding: '4px 10px', textDecoration: 'none', ...stil }}>
      Street View ↗
    </a>
  )
}

// ── Eingaben einer Fahrtrichtung (Seite A oder B, strecke.ts: Seite) ─────────
// Was je Fahrtrichtung verschieden sein kann: Führungsform samt Breite, Parkierung rechts,
// öV-Takt der Umweltspur, Haltestellentyp und -breite. Seite A und B nutzen dieselbe Maske.
function SeiteFelder({ felder, quelle, onChange, city, oevAngebot, onMessen, typAngenommen, onTypBestaetigt }: {
  typAngenommen?: boolean               // Haltestellentyp aus der AV vorbelegt (Haltestelleninsel, seit 21.10.2026)
  onTypBestaetigt?: () => void          // Vermerk «angenommen» entfernen (Typ gewählt)
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
                     onChange={v => onChange({ oevTakt: v })}
                     chip={<QuelleChip q={quelle.oevTakt} />} />
      )}
      {/* Haltestellentyp je Seite. «keine Haltestelle auf dieser Seite»: das ÖV-Angebot des
          Abschnitts gilt hier nicht (bewertung.ts). */}
      {oevAngebot !== 'keine' && (
        <label style={fieldStyle}>
          <FieldLabel label="Vorhandener Haltestellentyp" chip={typAngenommen ? <QuelleChip q="angenommen" /> : undefined} />
          <select value={felder.ohneHaltestelle ? '__ohne__' : felder.haltestellentyp}
                  title={typAngenommen ? 'Aus der amtlichen Vermessung angenommen (Insel an der Haltestelle): bitte prüfen und wählen' : undefined}
                  onChange={e => { onTypBestaetigt?.(); onChange(e.target.value === '__ohne__'
                    ? { ohneHaltestelle: true, haltestellentyp: 'keine', haltestelleBreite: NaN }
                    : { ohneHaltestelle: false, haltestellentyp: e.target.value as Haltestellentyp }) }}
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

// Sprung zur Herleitung im Referenzteil unten (seit 22.10.2026): den eingeklappten Teil öffnen, dann hinscrollen.
function zurHerleitung() {
  const ref = document.getElementById('referenz')
  if (ref instanceof HTMLDetailsElement) ref.open = true
  setTimeout(() => document.getElementById('herleitung-note')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
}

// ── Herleitung der Note einer Seite als Abzugsliste (seit 22.10.2026, Nutzerwunsch) ──
// Vorher stand hier «feel-safe-Defizit 41 Pkt. → Form-Note 3,1»: richtig, aber nur für Leute
// verständlich, die das Verfahren kennen. Jetzt steht jeder Schritt als Zeile mit seinem Abzug:
// Ausgangspunkt, Führungsform (6 − Form-Note), Breite, Parkierung, Haltestelle, dann die gerundete
// Note. Wie der Abzug für die Führungsform aus den Feel-Safe-Werten entsteht, erklärt der Abschnitt
// «Wie die Note entsteht» im Referenzteil (zurHerleitung).
// Aufbau wie bisher (seit 29.09.2026):
//   1. hinweis ERSETZT nur die Zeile zur Führungsform — nicht die ganze Herleitung.
//   2. Ist die Note FEST gesetzt (noteFix, Kap-Regel), wirken Breite/Parkierung/Haltestelle
//      nicht und werden nicht gezeigt.
//   3. Sonst stehen alle Abzüge, auch neben einem hinweis. Vorher verschwanden sie: Basel
//      «nicht konform» mit zu schmaler Breite zeigte eine Note unter 4, ohne dass der
//      Breitenabzug irgendwo stand.
function Herleitung({ bewertung, felder, routentyp, city, breitenQuelle }: {
  bewertung: NotenErgebnis
  felder: Seite
  routentyp: Routentyp | ''
  city: CityId
  breitenQuelle: string
}) {
  const { ist } = felder
  const bezugLabel = routentyp === 'Veloroute' ? 'Minimal' : 'Optimal'
  const abzug = (x: number) => `− ${numDE(x, 1)}`
  const zeilen: { text: React.ReactNode; wert?: string; warn?: boolean }[] = []
  let formLink = false
  const vorgabeBreite = bewertung.sollbreite == null ? ''
    : bewertung.maxbreite != null
      ? `${numDE(bewertung.sollbreite, 2)}–${numDE(bewertung.maxbreite, 2)} m`
      : `${bezugLabel} ${numDE(bewertung.sollbreite, 2)} m`

  if (bewertung.kapTramNote1) {
    zeilen.push({ text: <>Kaphaltestelle an einer Tramhaltestelle: Die Schiene liegt im schmalen Abstand zur hohen
      Haltekante, ohne bauliche Trennung. Diese Regel gilt vor allen anderen.</>, wert: 'Note 1' })
  } else {
    // Ausgangspunkt und Führungsform
    if (bewertung.hinweis) {
      zeilen.push({ text: <>⚠ {bewertung.hinweis}</>, warn: true })
      if (!bewertung.noteFix) zeilen.push({ text: 'Ausgangspunkt nach dieser Regel', wert: numDE(bewertung.basisnote, 1) })
    } else if (ist === 'Umweltspur') {
      // Basisnote aus dem Ergebnis, nicht hartkodiert: die Decke ist stadtabhängig (Bern 5, übrige 4).
      // Die Takt-Schwelle wird bewusst nicht genannt — sie ist ebenfalls stadtabhängig, und liegt der
      // Takt darunter, steht oben der hinweis statt dieser Zeile.
      zeilen.push({
        text: Number.isFinite(felder.oevTakt)
          ? `Umweltspur: Ausgangspunkt nach dem Bustakt (alle ${felder.oevTakt} Min); Verkehrsmenge und Tempo zählen hier nicht`
          : 'Umweltspur ohne Angabe zum Bustakt, als zulässig angenommen; für die Prüfung «zu viele Busse» den Takt eintragen',
        wert: numDE(bewertung.basisnote, 1),
      })
    } else if (ist === 'Fussweg Velo gestattet') {
      zeilen.push({ text: 'Fussweg, Velo gestattet: Fläche mit dem Fussverkehr geteilt, darum höchstens «genügend»; Verkehrsmenge und Tempo zählen hier nicht',
                    wert: numDE(bewertung.basisnote, 1) })
    } else {
      zeilen.push({ text: 'Ausgangspunkt: Vorgabe ganz erfüllt', wert: '6,0' })
      formLink = !bewertung.erfuellt
      zeilen.push(bewertung.erfuellt
        ? { text: `Führungsform: ${bewertung.ist} entspricht der Vorgabe`, wert: abzug(0) }
        : { text: <>Führungsform: {bewertung.ist} statt {bewertung.soll}, fühlt sich weniger sicher an{' '}
            (<button type="button" className="vrc-link-knopf" onClick={zurHerleitung}>wie dieser Abzug entsteht</button>)</>,
            wert: abzug(6 - bewertung.basisnote) })
    }

    if (!bewertung.noteFix) {
      if (bewertung.warnung) zeilen.push({ text: <>⚠ {bewertung.warnung}</>, warn: true })
      // Breite
      if (bewertung.sollbreite == null) {
        zeilen.push({ text: `Breite: Für ${ist} gibt es keine Breitenvorgabe` })
      } else if (bewertung.breite == null) {
        zeilen.push({ text: `Breite nicht angegeben; Vorgabe ${vorgabeBreite} (Quelle: ${breitenQuelle})${!routentyp ? ' · Routentyp wählen' : ''}`, wert: '–' })
      } else if (bewertung.breiteErfuellt) {
        zeilen.push({ text: `Breite ${numDE(bewertung.breite, 2)} m erfüllt die Vorgabe ${vorgabeBreite} (Quelle: ${breitenQuelle})`, wert: abzug(0) })
      } else {
        zeilen.push({ text: `Breite ${numDE(bewertung.breite, 2)} m, ${numDE(bewertung.breitenDefizit, 2)} m ${bewertung.breitenStatus === 'zu breit' ? 'breiter' : 'schmaler'} als die Vorgabe ${vorgabeBreite} (Quelle: ${breitenQuelle})`,
                      wert: abzug(bewertung.breitenabzug) })
      }
      if (city === 'basel' && ist === 'Velostrasse' && bewertung.sollbreite != null)
        zeilen.push({ text: 'Die Breite ist die Nettobreite der Fahrbahn (ohne Parkierung und Sicherheitsabstand zur Parkierung).' })
      if (city === 'bern' && ist === 'Velostrasse')
        zeilen.push({ text: <>Einsatzbereich: Nebenstrasse mit übergeordneter Velobedeutung, viel Veloverkehr, wenig MIV und ohne ÖV.
          {bewertung.sollbreite != null && <> Die Breitenvorgabe ist die Nettobreite der Fahrbahn (ohne Parkierung).</>}</> })
      if (city === 'luzern' && ist === 'Velostrasse')
        zeilen.push({ text: 'Einsatzbereich: bei gebündelter Velonutzung auf Quartierstrassen in Tempo-30-Zonen; bei geringer MIV-Belastung und hohem Veloanteil (> 50 %).' })
      if (city === 'zurich' && ist === 'Velostrasse')
        zeilen.push({ text: 'Velostrasse: im Zürcher Grundlagenpapier nicht vorgesehen.' })
      // Parkierung
      if (bewertung.parkenAbzug > 0)
        zeilen.push({ text: 'Parkierung rechts: Gefahr durch sich öffnende Autotüren (Dooring)', wert: abzug(bewertung.parkenAbzug) })
      if (bewertung.parkenRechts === 'ja' && bewertung.parkenSicherheitsstreifen)
        zeilen.push({ text: 'Parkierung rechts mit Sicherheitsstreifen (SN 640 060)', wert: abzug(0) })
      // Haltestelle
      if (bewertung.sollHaltestelle) {
        const typ = felder.haltestellentyp
        if (bewertung.haltestelleStatus === 'inkompatibel')
          zeilen.push({ text: `Haltestelle: ${typ} passt nicht zur Vorgabe «${bewertung.sollHaltestelle}»; passen würden ${bewertung.kompatibleHaltestellen.join(', ')}`,
                        wert: abzug(bewertung.haltestelleAbzug) })
        else if (bewertung.haltestelleStatus === 'kompatibel')
          zeilen.push({ text: `Haltestelle: ${typ} passt zur Vorgabe «${bewertung.sollHaltestelle}»`, wert: abzug(0) })
        else if (bewertung.haltestelleStatus === 'pruefen')
          zeilen.push({ text: `Haltestelle: Vorgabe «${bewertung.sollHaltestelle}»; Haltestellentyp wählen (passend: ${bewertung.kompatibleHaltestellen.join(', ')})`, wert: '–' })
      }
      if (bewertung.hsBreitenSoll != null) {
        const b = bewertung.haltestelleBreite
        zeilen.push(b == null
          ? { text: `Breite an der Haltestelle nicht angegeben; Vorgabe ${bezugLabel} ${numDE(bewertung.hsBreitenSoll, 2)} m`, wert: '–' }
          : bewertung.hsBreiteStatus === 'erfuellt'
            ? { text: `Breite an der Haltestelle ${numDE(b, 2)} m erfüllt die Vorgabe ${bezugLabel} ${numDE(bewertung.hsBreitenSoll, 2)} m`, wert: abzug(0) }
            : { text: `Breite an der Haltestelle ${numDE(b, 2)} m, schmaler als die Vorgabe ${bezugLabel} ${numDE(bewertung.hsBreitenSoll, 2)} m`,
                wert: abzug(bewertung.hsBreitenabzug) })
      }
      if (bewertung.tramDeckel != null)
        zeilen.push({ text: 'Tram in der Fahrbahn: Schienen im Mischverkehr', wert: `höchstens ${numDE(bewertung.tramDeckel, 1)}` })
    }
  }

  return (
    <div style={{ marginTop: 6 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <tbody>
          {zeilen.map((z, i) => (
            <tr key={i}>
              <td style={{ padding: '2px 10px 2px 0', verticalAlign: 'top', fontWeight: z.warn ? 700 : 400 }}>{z.text}</td>
              <td style={{ padding: '2px 0', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{z.wert ?? ''}</td>
            </tr>
          ))}
          <tr>
            <td style={{ padding: '4px 10px 2px 0', borderTop: '1px solid currentColor', fontWeight: 700 }}>
              Note, auf halbe Noten gerundet{bewertung.noteFix || bewertung.kapTramNote1 ? ' (fest gesetzt)' : ''}: {erfuellungsgrad(bewertung.note)}
            </td>
            <td style={{ padding: '4px 0 2px', borderTop: '1px solid currentColor', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {numDE(bewertung.note, 1)}
            </td>
          </tr>
        </tbody>
      </table>
      {/* Der Link steht in der Zeile zur Führungsform, wo es einen Abzug für sie gibt; sonst hier */}
      {!formLink && (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
          <button type="button" className="vrc-link-knopf" onClick={zurHerleitung}>Wie die Note entsteht</button>
          {' '}— Ausgangspunkt, Abzüge und Erfüllungsgrad im Referenzteil unten.
        </div>
      )}
    </div>
  )
}

// ── «Wie die Note entsteht»: Herleitung im Referenzteil (seit 22.10.2026, Nutzerwunsch) ──
// Ziel des Links aus jedem Ergebnis (zurHerleitung). Erklärt den Abzug für die Führungsform aus den Feel-Safe-Werten,
// die übrigen Abzüge und den Erfüllungsgrad. Alle Zahlen kommen aus den Konstanten der Rechnung (fuehrungsform.ts),
// damit der Text nicht von ihr abweicht. Gilt für die Regeln aller Städte; abweichende Sonderregeln (Basel, Umweltspur
// je Stadt) nennt das Ergebnis selbst.
function HerleitungNote() {
  const pkt = (n: number) => numDE(n, 0)
  const mittel = (k: 'ruhig' | 'schnell') => (FEELSAFE.Radstreifen[k] + FEELSAFE.Radweg[k]) / 2
  const bspDefizit = mittel('ruhig') - FEELSAFE.Mischverkehr.ruhig
  const zelle: React.CSSProperties = { border: '1px solid var(--border-subtle)', padding: '4px 8px', textAlign: 'right' }
  const kopf: React.CSSProperties = { ...zelle, textAlign: 'left', background: 'var(--bg)' }
  return (
    <div id="herleitung-note" style={{ scrollMarginTop: 150, fontSize: 13.5, lineHeight: 1.55, marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, margin: '8px 0 10px' }}>Wie die Note entsteht</h2>
      <p style={{ margin: '0 0 8px' }}>
        Jede Fahrtrichtung eines Abschnitts wird für sich beurteilt; der Abschnitt zählt mit der schlechteren, die Strecke
        mit ihrem schlechtesten Abschnitt. Ausgangspunkt ist die Note 6: die Vorgabe der Stadt ist ganz erfüllt. Davon gehen
        Abzüge ab. Das Ergebnis wird auf halbe Noten gerundet, nie unter 1, und in den Erfüllungsgrad übersetzt.
      </p>
      <h3 style={{ fontSize: 14.5, margin: '14px 0 6px' }}>1. Abzug für die Führungsform</h3>
      <p style={{ margin: '0 0 8px' }}>
        Aus Verkehrsmenge und Tempo ergibt sich, welche Führungsform die Stadt verlangt (Entscheidungstabelle unten). Ist die
        vorhandene Form schwächer, etwa Mischverkehr statt Radstreifen, gibt es einen Abzug. Wie gross er ist, richtet sich
        danach, wie sicher sich Velofahrende auf den beiden Formen fühlen: Der <b>Feel-Safe-Wert</b> ist der Anteil der
        Befragten, die eine Szene dieser Form als sicher beurteilen (Befragung radwege-check / FixMyCity in Berlin, mit einer
        Berner Bildumfrage überprüft).
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 13, margin: '4px 0 8px' }}>
          <thead>
            <tr><th style={kopf}>Führungsform</th><th style={kopf}>bis 30 km/h</th><th style={kopf}>über 30 km/h</th></tr>
          </thead>
          <tbody>
            {(['Mischverkehr', 'Radstreifen', 'Radweg'] as const).map(f => (
              <tr key={f}><td style={{ ...zelle, textAlign: 'left' }}>{f}</td>
                <td style={zelle}>{pkt(FEELSAFE[f].ruhig)} %</td><td style={zelle}>{pkt(FEELSAFE[f].schnell)} %</td></tr>
            ))}
            <tr><td style={{ ...zelle, textAlign: 'left' }}>Vorgabe «Radstreifen oder Radweg»</td>
              <td style={zelle}>{numDE(mittel('ruhig'), 1)} %</td><td style={zelle}>{numDE(mittel('schnell'), 1)} %</td></tr>
          </tbody>
        </table>
      </div>
      <p style={{ margin: '0 0 8px' }}>
        Der Abzug ist der Unterschied zwischen dem Wert der verlangten und dem der vorhandenen Form, geteilt durch{' '}
        {numDE(SCORE_PRO_NOTE, 1)}: {numDE(SCORE_PRO_NOTE, 1)} Prozentpunkte kosten eine Note. So ergibt der grösste Unterschied
        (Radweg verlangt, Mischverkehr vorhanden, über 30 km/h: {pkt(FEELSAFE.Radweg.schnell)} − {pkt(FEELSAFE.Mischverkehr.schnell)}{' '}
        = {pkt(FEELSAFE.Radweg.schnell - FEELSAFE.Mischverkehr.schnell)} Punkte) genau fünf Noten Abzug, also Note 1.{' '}
        <i>Beispiel:</i> Verlangt sind Radstreifen oder Radweg bei Tempo 30 ({numDE(mittel('ruhig'), 1)} %), vorhanden ist
        Mischverkehr ({pkt(FEELSAFE.Mischverkehr.ruhig)} %): {numDE(bspDefizit, 1)} Punkte ÷ {numDE(SCORE_PRO_NOTE, 1)}{' '}
        = Abzug {numDE(bspDefizit / SCORE_PRO_NOTE, 1)}. Erfüllt die vorhandene Form die Vorgabe oder übertrifft sie,
        gibt es keinen Abzug.
      </p>
      <p style={{ margin: '0 0 8px' }}>
        Sonderregeln: Die <b>Umweltspur</b> beginnt nicht bei 6, sondern bei einem Wert, der vom Bustakt abhängt; der
        <b> Fussweg, Velo gestattet</b> beginnt bei {numDE(FUSSWEG_BASIS, 0)} (höchstens «genügend»), weil Velo und Fussverkehr
        die Fläche teilen. Bei beiden zählen Verkehrsmenge und Tempo nicht.
      </p>
      <h3 style={{ fontSize: 14.5, margin: '14px 0 6px' }}>2. Weitere Abzüge</h3>
      <ul style={{ margin: '0 0 8px', paddingLeft: 20 }}>
        <li><b>Breite:</b> je Meter, um den Radstreifen oder Radweg schmaler sind als die Vorgabe der Stadt, ein Abzug
          (Radstreifen {numDE(BREITE_SATZ.Radstreifen.ruhig, 1)} Noten je Meter, Radweg {numDE(BREITE_SATZ.Radweg.ruhig, 2)}{' '}
          bis {numDE(BREITE_SATZ.Radweg.schnell, 2)}). Für Mischverkehr gibt es keine Breitenvorgabe.</li>
        <li><b>Parkierung rechts:</b> {numDE(PARKEN_ABZUG, 1)} Note, weil sich öffnende Autotüren Velofahrende gefährden
          (Dooring); kein Abzug mit Sicherheitsstreifen zur Parkierung.</li>
        <li><b>Haltestelle:</b> {numDE(HALTESTELLE_ABZUG, 1)} Note, wenn die Stadt eine eigene Velofläche verlangt, die
          Haltestelle aber keine hat.</li>
        <li><b>Tram in der Fahrbahn:</b> im Mischverkehr höchstens Note {numDE(TRAM_DECKEL, 0)}.</li>
      </ul>
      <h3 style={{ fontSize: 14.5, margin: '14px 0 6px' }}>3. Erfüllungsgrad</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 13, margin: '4px 0 0' }}>
          <thead><tr><th style={kopf}>Note</th><th style={kopf}>Erfüllungsgrad</th></tr></thead>
          <tbody>
            {([['5,5 – 6,0', 6], ['4,5 – 5,0', 5], ['3,5 – 4,0', 4], ['1,0 – 3,0', 2]] as const).map(([band, n]) => (
              <tr key={band}><td style={zelle}>{band}</td>
                <td style={{ ...zelle, textAlign: 'left', background: noteColor(n).bg, color: noteColor(n).fg, fontWeight: 700 }}>{erfuellungsgrad(n)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Ergebnis einer Seite: Note mit Erklärung — oder Hinweis, solange Pflichtfelder fehlen ──
function ErgebnisBox({ bewertung, vergleich, felder, fehlt, routentyp, city, breitenQuelle }: {
  bewertung: NotenErgebnis | null
  fehlt: string[]                       // fehlende Pflichtfelder (bewertung.ts, fehlendeEingaben)
  vergleich: VergleichsNote[] | null    // Endnoten nach den Standards der anderen Städte (null = unvollständig)
  felder: Seite
  routentyp: Routentyp | ''
  city: CityId
  breitenQuelle: string                 // Herkunft der Breiten-Vorgabe (stadtspez. Standard oder Masterplan Bern)
}) {
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
        {/* Erfüllungsgrad gross, die Schulnote klein darunter (seit 22.10.2026; vorher je nach Schalter das eine oder das andere) */}
        <div style={{ textAlign: 'center', minWidth: 120 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase', opacity: 0.85 }}>
            Erfüllungsgrad
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.15 }}>
            {erfuellungsgrad(bewertung.note)}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.9, marginTop: 2 }}>
            Note {numDE(bewertung.note, 1)}
          </div>
        </div>
        {bewertung.haltestellenbereich ? (
          // Haltestellenbereich (nur Bern, seit 20.10.2026): Haltestellentyp gegen die Lösung des Masterplans
          <div style={{ fontSize: 13.5, opacity: 0.97 }}>
            <div><strong>Haltestellenbereich</strong> · Vorgabe: {bewertung.sollHaltestelle ?? '–'}</div>
            <div><strong>Heute:</strong> {bewertung.haltestellentyp}</div>
            <div style={{ marginTop: 4, opacity: 0.9 }}>
              {bewertung.kapTramNote1
                ? 'Kaphaltestelle an einer Tramhaltestelle: Note 1 (Schiene im schmalen Abstand zur hohen Haltekante).'
                : !bewertung.erfuellt
                  ? `Nicht erfüllt: Der Masterplan verlangt eine separate Velofläche → Note ${numDE(bewertung.note, 0)}. Erfüllen würden: ${bewertung.kompatibleHaltestellen.join(', ')}.`
                  : 'Erfüllt → Note 6.'}
            </div>
            {bewertung.erfuellt && bewertung.hsBreitenSoll != null && (
              <div style={{ marginTop: 4, opacity: 0.9 }}>
                <strong>Breite der Velofläche:</strong>{' '}
                {bewertung.haltestelleBreite != null ? `${numDE(bewertung.haltestelleBreite, 2)} m` : 'nicht angegeben'} · Vorgabe{' '}
                {bezugLabel} {numDE(bewertung.hsBreitenSoll, 2)} m
                {bewertung.haltestelleBreite != null && (' · ' + (bewertung.hsBreiteStatus === 'erfuellt'
                  ? '✓ erfüllt' : `zu schmal → Abzug ${numDE(bewertung.hsBreitenabzug, 1)} Note`))}
              </div>
            )}
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>Führungsform, DTV, Tempo und Parkierung zählen hier nicht.</div>
          </div>
        ) : (
        <div style={{ fontSize: 13.5, opacity: 0.97, flex: '1 1 240px', minWidth: 0 }}>
          {/* Ohne DTV/Tempo gibt es keine Vorgabe für die Führungsform — dieselbe Quelle wie die Pflichtfelder.
              «Soll/Ist» heisst seit 22.10.2026 «Vorgabe/Heute», der Querschnittstyp (Q1…) steht nicht mehr da. */}
          {brauchtDtvTempo(bewertung.ist) &&
            <div><strong>Vorgabe:</strong> {bewertung.soll}</div>}
          <div><strong>Heute:</strong> {bewertung.ist}</div>
          {/* Herleitung einklappbar (Nutzerwunsch 16.10.2026); Vorgabe und Heute bleiben sichtbar */}
          <details className="vrc-klappe auf-farbe" style={{ marginTop: 4 }}>
            <summary style={{ cursor: 'pointer', userSelect: 'none', fontSize: 12.5, opacity: 0.9 }}>
              Wie die Beurteilung entsteht{bewertung.hinweis || bewertung.warnung ? ' · ⚠ Hinweis' : ''}
            </summary>
            <Herleitung bewertung={bewertung} felder={felder} routentyp={routentyp} city={city} breitenQuelle={breitenQuelle} />
          </details>
        </div>
        )}
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

// Auswahl der Teile, thematisch gruppiert (TEIL_GRUPPEN)
function TeilOptionen() {
  return <>{TEIL_GRUPPEN.map(([g, xs]) => (
    <optgroup key={g} label={g}>{xs.map(x => <option key={x} value={x}>{TEIL_LABEL[x]}</option>)}</optgroup>
  ))}</>
}
const PFEIL_ZEICHEN: Record<Pfeil, string> = { links: '←', geradeaus: '↑', rechts: '→' }
const PFEIL_NAME: Record<Pfeil, string> = { links: 'links', geradeaus: 'geradeaus', rechts: 'rechts' }

// ── Massnahmenvorschlag (seit 17.10.2026 Bern, seit 20.10.2026 alle Städte mit Planung; vorschlag.ts) ──
// Erste Massnahme in der Rangfolge, die die Note auf 4,5 bringt; Note und Masse nach der Stadt (Ersatz Bern).
// Je eine Zeile ohne und mit Randsteinanpassung; «Übernehmen» ersetzt die Teile (danach frei änderbar), ebenso bei jeder Alternative.
function VorschlagKasten({ section, a, onChange, city }: { section: Section; a: Aufteilung; onChange: (a: Aufteilung) => void; city: Stadt }) {
  const breiten = CITIES[city].breiten
  const ta = trottoirAnpassung(section, a, city)
  const aendert = !!ta && ta.frei.A + ta.frei.B + ta.fehlt.A + ta.fehlt.B > 0.001
  // verfügbare Fahrbahnbreite der Planung (Feld oben), sonst die des Abschnitts
  const fb = Number.isFinite(a.fahrbahn) ? a.fahrbahn : section.fahrbahnbreite
  const ohne = useMemo(() => vorschlagRechnen(section, Number.isFinite(fb) ? fb : null, city, breiten), [section, fb, city, breiten])
  const mit = useMemo(() => (ta && aendert && Number.isFinite(fb) ? vorschlagRechnen(section, fahrbahnMitRandstein(fb, ta), city, breiten) : null),
    [section, fb, a.fussnetz, city])   // eslint-disable-line react-hooks/exhaustive-deps
  // Was die Randsteinanpassung an den Trottoirs tut, je Seite
  const trText = ta && aendert ? (['A', 'B'] as const).filter(s => Number.isFinite(ta.ist[s])).map(s =>
    ta.fehlt[s] > 0.001 ? `Seite ${s} ${numDE(ta.ist[s], 2)} → ${numDE(ta.vorgabe, 2)} m`
      : ta.frei[s] > 0.001 ? `Seite ${s} ${numDE(ta.ist[s], 2)} m, bis ${numDE(ta.vorgabe, 2)} m schmaler möglich`
      : `Seite ${s} ${numDE(ta.ist[s], 2)} m wie die Vorgabe`).join(' · ') : ''
  const zeile = (titel: string, v: Vorschlag | null, randstein: TrottoirAnpassung | null, ersatz?: string, zusatz?: string) => {
    if (!v) return (
      <div style={{ padding: '6px 0', borderTop: '1px solid var(--border-subtle)' }}>
        <b>{titel}:</b> <span style={{ color: 'var(--text-muted-strong)' }}>{ersatz}</span>
      </div>
    )
    const plan = v.erreicht && v.rang ? aufteilungAusVorschlag(section, a, v, randstein) : null
    const planNote = plan ? bewerteAufteilung(section, plan, city, breiten).note : null
    return (
      <div style={{ padding: '6px 0', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <b>{titel}:</b>{' '}
          {v.erreicht === true && v.rang === 0 && <span>Die Note erreicht schon {numDE(4.5, 1)}; keine Massnahme nötig.</span>}
          {v.erreicht === true && v.rang != null && v.rang > 0 && (
            <span>{v.text} <span style={{ color: 'var(--text-muted-strong)' }}>(Rang {v.rang}, {RANG_TEXT[v.rang]}; Note {
              v.noteVor != null ? numDE(v.noteVor, 1) : '–'} → {v.noteNach != null ? numDE(v.noteNach, 1) : '–'})</span></span>
          )}
          {v.erreicht !== true && <span style={{ color: '#92400e' }}>kein Vorschlag: {v.blocker}</span>}
          {zusatz && <div style={{ fontSize: 12, color: 'var(--text-muted-strong)' }}>Trottoirs auf die Vorgabe: {zusatz}</div>}
          {v.alternativen.map((alt, j) => {
            const altPlan = aufteilungAusVorschlag(section, a, { ...v, text: alt.text, noteNach: alt.noteNach, k: alt.k }, randstein)
            return (
              <div key={j} style={{ fontSize: 12, color: 'var(--text-muted-strong)', display: 'flex', gap: 8, alignItems: 'center',
                                    flexWrap: 'wrap', marginTop: 3 }}>
                <span style={{ flex: '1 1 220px' }}>{v.erreicht ? 'Alternative' : 'Nur im Pilot möglich'}: {alt.text} → {numDE(alt.noteNach, 1)}</span>
                <button type="button" disabled={!altPlan} onClick={() => altPlan && onChange(altPlan)}
                        title={altPlan ? 'Ersetzt die Elemente der Planung durch diese Alternative; danach frei änderbar'
                          : 'Verfügbare Fahrbahnbreite fehlt: zuerst «aus AV ermitteln» oder eintragen'}
                        style={{ ...kleinKnopfStyle, fontSize: 12, padding: '3px 8px', color: altPlan ? 'var(--accent)' : 'var(--text-faint)',
                                 borderColor: 'var(--accent)', cursor: altPlan ? 'pointer' : 'default' }}>
                  Alternative übernehmen
                </button>
              </div>
            )
          })}
          {v.vermerk && <div style={{ fontSize: 12, color: '#92400e' }}>{v.vermerk}</div>}
          {plan && planNote !== v.noteNach && (
            <div style={{ fontSize: 12, color: '#92400e' }}>
              In der Planung ergibt sich Note {planNote != null ? numDE(planNote, 1) : '–'}: Die Einbahn mit Velogegenverkehr
              kennt die Planung nicht als eigenes Teil; sie liest dort Velostreifen.
            </div>
          )}
        </div>
        {v.erreicht && v.rang != null && v.rang > 0 && (
          <button type="button" disabled={!plan} onClick={() => plan && onChange(plan)}
                  title={plan ? 'Ersetzt die Elemente der Planung durch den Vorschlag; danach frei änderbar'
                    : 'Verfügbare Fahrbahnbreite fehlt: zuerst «aus AV ermitteln» oder eintragen'}
                  style={{ ...kleinKnopfStyle, borderColor: 'var(--accent)', color: plan ? 'var(--accent)' : 'var(--text-faint)',
                           cursor: plan ? 'pointer' : 'default' }}>
            Übernehmen
          </button>
        )}
      </div>
    )
  }
  return (
    <details className="vrc-klappe" open style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8,
                                                  padding: '8px 12px', marginBottom: 10, fontSize: 13 }}>
      <summary style={{ fontWeight: 700, color: 'var(--text-strong)' }}>Vorschlag</summary>
      {zeile('Ohne Randsteinanpassung', ohne, null)}
      {zeile('Mit Randsteinanpassung', mit, ta, !ta
        ? (fussnetzOptionen(city).length === 0 ? 'Für diese Stadt gibt es kein Fussverkehrsnetz mit Trottoir-Vorgabe; nur ohne Randsteinanpassung.'
          : !a.fussnetz ? 'Fussverkehrsnetz wählen (oben); die Trottoirs kommen dann auf dessen Vorgabe.'
          : 'Trottoirs aus der AV fehlen: zuerst «AV auf der Karte zeigen».')
        : 'Die Trottoirs entsprechen genau der Vorgabe des Fussverkehrsnetzes; wie ohne Randsteinanpassung.', trText)}
      {/* Erklärung als Fussnote (seit 22.10.2026 nach dem Ergebnis, vorher davor) */}
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
        Die erste Massnahme, die die Note auf mindestens 4,5 bringt; Rangfolge Markierung, Kernfahrbahn, Parkierung aufheben,
        Velostrasse, Radweg bauen, Tempo 30. «Übernehmen» setzt sie als Startpunkt, danach ist alles frei änderbar.
      </div>
    </details>
  )
}

function AufteilungPlanen({ section, heute, city, rA, rB, onChange, av, onFahrbahnbreite, fbLaden, onBericht, onQuerschnitt, onQuerschnittVerwerfen, ort, onTeileMessen, kartenAktionen }: {
  kartenAktionen?: React.ReactNode        // Abschnitt ohne Karte: gewählte Segmente übernehmen / teilen, direkt im Hinweis (Nutzerbefund 22.10.2026)
  ort?: Ort                               // Street View auch in der Planung (Nutzerwunsch 21.10.2026)
  onQuerschnitt?: () => void              // Querschnitt am Luftbild aufnehmen (seit 20.10.2026)
  onTeileMessen?: (teil?: { ziel: 'plan' | 'heute'; nr?: number }) => void   // Teil für Teil am Luftbild messen (seit 21.10.2026); mit Teil: dessen Breite
  onQuerschnittVerwerfen?: () => void     // den von Hand aufgenommenen Querschnitt von heute verwerfen
  section: Section
  heute: AbschnittErgebnis               // Bewertung des Abschnitts wie eingegeben
  city: CityId
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
  // Hinweis unter der Skizze, z. B. «Kernfahrbahn ersetzt die zweite Fahrspur»; mit «rueck» lässt sich der Stand
  // davor wiederherstellen (Rückgängig nach dem Entfernen eines Elements, seit 22.10.2026)
  const [planHinweis, setPlanHinweis] = useState<{ text: string; rueck?: Teil[] } | ''>('')
  // Skizze: automatisch nur «Heute», solange die Planung unverändert ist, sonst beide; von Hand umschaltbar (seit 22.10.2026)
  const [skizzeWahl, setSkizzeWahl] = useState<'auto' | 'heute' | 'plan' | 'beide'>('auto')
  // «Haltestelle einfügen» (seit 20.10.2026): Seite und Typ (Querschnitte HS 1, 2, 4, 5 des Masterplans), nur Typen der Stadt
  const hsVorlagen = HS_VORLAGEN.filter(t => haltestellenTypen(city).includes(t))
  const [hsSeite, setHsSeite] = useState<'A' | 'B'>('A')
  const [hsWahl, setHsWahl] = useState<Haltestellentyp>(hsVorlagen[0] ?? 'keine')
  // Ohne Planung nichts (seit 22.10.2026): der Einstieg ist der Reiter «Planen» bzw. «Aufteilung planen» in der
  // Kopfzeile des Abschnitts; der Werbekasten unter jedem Ergebnis ist weg.
  if (!a) return null

  const breiten = CITIES[city].breiten
  const rt: Routentyp = section.routentyp || 'Veloroute'
  // Mit Tempo aus dem Vorschlag («Tempo 30») gelten Lichtraum, Trottoir und Kernfahrbahn für das neue Tempo
  const sp = a.tempo != null ? { ...section, speed: a.tempo } : section
  const umfeld = umfeldVon(sp, a.teile, a.fussnetz, city)
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
  // Breite in 10-cm-Schritten (auf 5 cm gerundet, nicht unter 0); leer → ab der Vorgabe
  const schritt = (i: number, t: Teil, d: number) => {
    const basis = Number.isFinite(t.breite) ? t.breite : vorgabe(t.art, t.bild)
    if (Number.isFinite(basis)) aendere(i, { ...t, breite: Math.max(0, auf5cm(basis + d)), angenommen: undefined })
  }
  // Andere Art; eine Kernfahrbahn ersetzt die Fahrspuren beider Richtungen (Nutzerwunsch 20.10.2026):
  // die übrigen Fahrspuren, Fahrbahnen ohne Mittellinie und Tramspuren fallen weg, ihre Breite geht in den
  // Kern (4,50–5,50 m); ein Rest bleibt in der Bilanz sichtbar.
  const artWechsel = (i: number, art: TeilArt) => {
    // Artwechsel behält die eingetragene Breite (seit 21.10.2026); ohne Breite bleibt das Teil leer
    if (art !== 'Kernfahrbahn') { aendere(i, { art, breite: a.teile[i].breite }); setPlanHinweis(''); return }
    const spur = (x: Teil) => x.art === 'Fahrspur' || x.art === 'Gemeinsam' || x.art === 'Tram' || x.art === 'Kernfahrbahn'
    const weg = a.teile.filter((x, j) => j !== i && spur(x))
    const summe = [a.teile[i], ...weg].filter(spur).reduce((m, x) => m + (Number.isFinite(x.breite) ? x.breite : 0), 0)
    const kern: Teil = { art, breite: Math.min(5.5, Math.max(4.5, auf5cm(summe))) }
    setTeile(a.teile.flatMap((x, j) => (j === i ? [kern] : spur(x) ? [] : [x])))
    setPlanHinweis(weg.length ? { text: `Kernfahrbahn ersetzt ${weg.length === 1 ? 'die zweite Fahrspur' : `${weg.length} weitere Fahrspuren`}; `
      + `ihre Breite ist im Kern (${numDE(kern.breite, 2)} m).`, rueck: a.teile } : '')
  }
  const einfuegen = (an: number, art: TeilArt) => {
    if (!art) return
    // neues Teil ohne Breite (Nutzerwunsch 21.10.2026): die Vorgabe steht in der Prüfung, eingetragen wird von Hand oder gemessen
    const t = [...a.teile]; t.splice(an, 0, { art, breite: NaN })
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
  const entfernen = (i: number, t: Teil) => {
    setTeile(a.teile.filter((_, j) => j !== i))
    setPlanHinweis({ text: `Element ${i + 1} (${TEIL_LABEL[t.art]}${Number.isFinite(t.breite) ? `, ${numDE(t.breite, 2)} m` : ''}) entfernt.`, rueck: a.teile })
  }
  const ausgang = startAufteilung(section, city, CITIES[city].breiten)
  const massstab = Math.max(breiteCm(ausgang.teile), breiteCm(a.teile))
  const unveraendert = JSON.stringify(a.teile) === JSON.stringify(ausgang.teile)
  const skizze = skizzeWahl === 'auto' ? (unveraendert ? 'heute' : 'beide') : skizzeWahl
  const detailSelect: React.CSSProperties = { ...selectStyle, padding: '4px 6px', fontSize: 13, minWidth: 0 }
  const aq = mitSeitenraum(a, section), b = bilanz(aq), bt = bilanzText(aq, b)
  const plan = bewerteAufteilung(section, a, city, breiten)
  const planFehlt = [...new Set(plan.seiten.flatMap(se => se.fehlt))]
  const kern = pruefeKernfahrbahn(sp, a.teile, city)
  const NoteMarke = ({ note }: { note: number | null }) => note == null
    ? <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>—</span>
    : <span style={{ background: noteColor(note).bg, color: noteColor(note).fg, borderRadius: 8,
                     padding: '3px 10px', fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap' }}>
        <Beurteilung note={note} />
      </span>
  const seiteName = (s: 'A' | 'B') => (s === 'A' ? `Seite A${rA ? ` (Richtung ${rA})` : ''}` : `Seite B${rB ? ` (Richtung ${rB})` : ''}`)
  const formText = (f: Seite) => `${f.ist || '—'}${Number.isFinite(f.breite) ? ` ${numDE(f.breite, 2)} m` : ''}` +
    `${f.parkenRechts === 'ja' ? ', neben Parkierung' : ''}`

  return (
    <div id={`plan-${section.id}`} style={{ scrollMarginTop: 64 }}>
      <div style={{ ...seiteKastenStyle, marginTop: 0 }}>
        {/* Ohne Abschnitt von der Karte fehlen Fahrbahnbreite, Trottoirs, AV und Parkfelder (Nutzerbefund 16.10.2026) */}
        {!section.candIds?.length && (
          <div style={{ fontSize: 12.5, color: '#92400e', marginBottom: 8, padding: '8px 12px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a' }}>
            <strong>Zuerst einen Abschnitt auf der Karte wählen:</strong> auf eine Strasse tippen oder oben eine Strasse suchen,
            dann «Segmente in Strecke übernehmen». Ist das Segment zu lang oder zu kurz, lässt es sich vorher mit «✂ Segment teilen»
            an der gewünschten Stelle schneiden. Ohne Abschnitt von der Karte fehlen Fahrbahnbreite, Trottoirs, amtliche Vermessung
            und Parkfelder; dann bleibt nur die Planung von Hand.
            {kartenAktionen}
          </div>
        )}
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
              : city === 'basel' ? 'Fusswegnetz (Vorgabe Trottoir)' : 'Fussverkehrsnetz (Vorgabe Trottoir)'}
              chip={<Info text={
                a.fussnetzQuelle === 'geoportal' && city === 'bern'
                  ? `Aus dem Richtplan Fussverkehr (${a.fussnetz === 'basis' ? 'auf dem Basisnetz' : 'nicht auf dem Basisnetz'}). «Publikumsintensiv» steht nicht in den Daten und ist von Hand zu wählen.`
                : a.fussnetzQuelle === 'geoportal' && city === 'basel'
                  ? `Aus dem Teilrichtplan Fuss- und Wanderwege (${a.fussnetz === 'bs_kanton' ? 'kantonales Netz' : a.fussnetz === 'bs_stadt' ? 'kommunales Netz' : 'nicht im Fusswegnetz'}).`
                : city === 'zurich'
                  ? 'Lichte Breite nach dem Leitfaden Fussverkehr; dazu kommen Umfeldzuschläge (z. B. +0,50 m neben Tempo 50 ohne Radstreifen, +1,50 m bei ÖV-Haltestellen).'
                : city === 'bern' ? 'Vorgabe der Trottoirbreite nach dem Masterplan Fussverkehr der Stadt Bern, je nach Netz; aus dem Richtplan Fussverkehr vorbelegt, wo er den Abschnitt kennt.'
                : 'Vorgabe der Trottoirbreite nach dem Fusswegnetz der Stadt.'} />} />
            <select value={a.fussnetz && FUSSNETZ[a.fussnetz]?.stadt === city ? a.fussnetz : ''} style={selectStyle}
                    onChange={e => onChange({ ...a, fussnetz: (e.target.value || undefined) as FussNetz | undefined, fussnetzQuelle: undefined })}>
              <option value="">— nicht gewählt —</option>
              {fussnetzOptionen(city).map(k => (
                <option key={k} value={k}>{FUSSNETZ[k].label} (≥ {numDE(FUSSNETZ[k].min, 2)} m)</option>
              ))}
            </select>
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
        </div>
        {/* Werkzeugleiste in drei Gruppen (seit 22.10.2026; vorher sieben gleichwertige Knöpfe, die auf dem Handy aus dem
            Panel liefen): Messen (ein Menü), Ansicht (AV, Street View, Bericht), Zurücksetzen (Menü rechts) */}
        <div style={{ display: 'flex', gap: '8px 16px', alignItems: 'center', flexWrap: 'wrap', margin: '2px 0 10px' }}>
          {(onQuerschnitt || onTeileMessen) && (
            <Menu klasse="voll" label="📏 Messen" titel="Breiten am Luftbild messen: ganzer Querschnitt oder Element für Element">
              {onQuerschnitt && (
                <button type="button" onClick={e => { menuZu(e); onQuerschnitt() }}>
                  📐 Querschnitt am Luftbild
                  <small>Quer über die Strasse an jeder Grenze klicken; jedes Stück wird ein Element (als heute oder in die Planung)</small>
                </button>
              )}
              {onTeileMessen && (
                <button type="button" onClick={e => { menuZu(e); onTeileMessen() }}>
                  📏 Element für Element
                  <small>Jede Messung als neues Element anfügen oder auf ein bestehendes übertragen (Planung oder heute)</small>
                </button>
              )}
            </Menu>
          )}
          <span role="group" aria-label="Ansicht" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {av && (
              <button type="button" onClick={av.gezeigt ? av.ausblenden : av.zeigen} disabled={av.laden} aria-pressed={av.gezeigt}
                      title="Amtliche Vermessung (Strasse, Trottoir, Inseln, Gebäude) und Parkfelder über dem Luftbild"
                      style={{ ...kleinKnopfStyle, cursor: av.laden ? 'default' : 'pointer',
                               ...(av.gezeigt ? { background: 'var(--bg)', borderColor: 'var(--text-muted)' } : {}) }}>
                {av.laden ? 'Lade AV …' : av.gezeigt ? 'AV ausblenden' : 'AV zeigen'}
              </button>
            )}
            {ort && <StreetViewLink ort={ort} />}
            {onBericht && (
              <button type="button" onClick={onBericht} style={{ ...kleinKnopfStyle, borderColor: 'var(--accent)', color: 'var(--accent)' }}
                      title="Druckansicht mit Luftbild, Skizzen, Prüfung, Bewertung und Quellen; als PDF speichern über den Druckdialog">
                Bericht / PDF
              </button>
            )}
          </span>
          <span style={{ flex: 1 }} />
          <Menu klasse="rechts" label="Zurücksetzen">
            <button type="button" onClick={e => { menuZu(e); onChange(startAufteilung(section, city, CITIES[city].breiten)); setPlanHinweis('') }}>
              Auf heute zurücksetzen
              <small>Eigene Änderungen verwerfen und wieder vom Querschnitt von heute ausgehen</small>
            </button>
            <button type="button" onClick={e => { menuZu(e); onChange(undefined) }}>
              Planung verwerfen
              <small>Die Planung dieses Abschnitts löschen</small>
            </button>
          </Menu>
        </div>
        <VorschlagKasten section={section} a={a} onChange={onChange} city={city} />
        {a.tempo != null && (
          <div style={{ fontSize: 12.5, marginBottom: 8, padding: '6px 10px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a',
                        color: '#92400e', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1 }}>Mit der Planung gilt Tempo {a.tempo} statt {Number.isFinite(section.speed) ? section.speed : '–'} km/h
              (aus dem Vorschlag); Note und Prüfung rechnen damit.</span>
            <button type="button" onClick={() => onChange({ ...a, tempo: undefined })} style={kleinKnopfStyle}>Tempo wie heute</button>
          </div>
        )}
        {/* AV auf der Karte: Legende, solange sie zu sehen ist (der Knopf steht in der Werkzeugleiste) */}
        {av?.gezeigt && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8, fontSize: 12.5 }}>
            <span style={{ color: 'var(--text-muted)' }}>AV auf der Karte:</span>
            {[...AV_LEGENDE.map(([art, text]) => [AV_FARBEN[art], text]),
                            ...(av.park ? [[PARK_FARBE, 'Parkfeld'], [PARKVERBOT_FARBE, 'Parkverbotsfeld'], [ZWEIRAD_FARBE, 'Velo-/Motorradfeld']] : [])].map(([farbe, text]) => (
              <span key={text} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-muted-strong)' }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: farbe, border: '1px solid rgba(0,0,0,0.25)' }} />
                {text}
              </span>
            ))}
          </div>
        )}
        {/* Skizze: heute und Planung untereinander, im selben Massstab; Umschalter (seit 22.10.2026), solange die Planung
            unverändert ist nur «Heute» */}
        <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '6px 10px', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, color: 'var(--text-muted-strong)' }}>
            <span>Skizze:</span>
            <span role="group" aria-label="Skizze" style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {([['heute', 'Heute'], ['plan', 'Planung'], ['beide', 'Beide']] as const).map(([w, label]) => (
                <button key={w} type="button" aria-pressed={skizze === w} onClick={() => setSkizzeWahl(w)}
                        style={{ border: 'none', padding: '4px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                                 background: skizze === w ? 'var(--accent)' : '#fff', color: skizze === w ? '#fff' : 'var(--text)' }}>
                  {label}
                </button>
              ))}
            </span>
            {unveraendert && <span>Die Planung ist noch wie heute.</span>}
          </div>
          {skizze !== 'plan' && <QuerschnittSkizze titel="Heute" teile={ausgang.teile} einbahn={section.richtung === 'eine'} massstabCm={massstab} richtungen={{ a: rA, b: rB }} />}
          {skizze !== 'heute' && <QuerschnittSkizze titel="Planung" teile={a.teile} einbahn={section.richtung === 'eine'} massstabCm={massstab} richtungen={{ a: rA, b: rB }} />}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Von links nach rechts in Fahrtrichtung der Seite A gesehen (links der Rand der Seite B).{' '}
            {section.querschnittHeute || section.gesamtbreite != null ? (
              <>{section.querschnittHeute ? `«Heute» ist von Hand am Luftbild aufgenommen (${section.querschnittHeute.teile.length} Elemente). ` : ''}
                {section.gesamtbreite != null ? `Ganzer Querschnitt am Luftbild gemessen: ${numDE(section.gesamtbreite, 2)} m. ` : ''}
                {onQuerschnittVerwerfen && (
                  <button type="button" onClick={onQuerschnittVerwerfen}
                          style={{ border: 'none', background: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: 'inherit', textDecoration: 'underline' }}>
                    Verwerfen (wieder aus den Eingaben und der AV)
                  </button>
                )}{' '}</>
            ) : <>«Heute» ist die Ausgangslage aus den Eingaben des Abschnitts{section.trottoir ? ' und den Trottoirs aus der AV' : ''}. </>}
            Illustrationen (Personen, Velos, Fahrzeuge vom Auto bis zum Tram, auch schräg und seitlich parkierte Autos, Ausstattung,
            Pfeilmarkierungen): <a href="https://streetmix.net" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>Streetmix</a>,{' '}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.de" target="_blank" rel="noopener noreferrer"
               style={{ color: 'inherit' }}>CC BY-SA 4.0</a>. Boden, Masse und Markierungsstriche sind eigene Zeichnung.
          </div>
        </div>

        {planHinweis && (
          <div role="status" style={{ fontSize: 12.5, marginBottom: 6, padding: '6px 10px', borderRadius: 8, background: '#eff6ff',
                                      border: '1px solid #bfdbfe', color: '#1e3a8a', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1 }}>{planHinweis.text}</span>
            {planHinweis.rueck && (
              <button type="button" onClick={() => { setTeile(planHinweis.rueck!); setPlanHinweis('') }}
                      style={{ ...kleinKnopfStyle, borderColor: 'var(--accent)', color: 'var(--accent)' }}>↩ Rückgängig</button>
            )}
            <button type="button" onClick={() => setPlanHinweis('')} style={kleinKnopfStyle} aria-label="Hinweis schliessen">✕</button>
          </div>
        )}
        {/* Haltestelle einfügen: Querschnitt nach dem Masterplan auf einer Seite, danach frei änderbar */}
        {hsVorlagen.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, margin: '2px 0 8px',
                        color: 'var(--text-muted-strong)' }}
               title="Setzt auf der Seite die Elemente der Haltestelle nach dem Masterplan (Trottoir, Velofläche, Abstand, Wartebereich); Fahrspuren und Tram bleiben">
            Haltestelle einfügen:
            <select value={hsSeite} onChange={e => setHsSeite(e.target.value as 'A' | 'B')} aria-label="Seite der Haltestelle"
                    style={{ ...selectStyle, flex: '0 0 auto' }}>
              <option value="A">Seite A{rA ? ` (${rA})` : ''}</option>
              {!einbahn && <option value="B">Seite B{rB ? ` (${rB})` : ''}</option>}
            </select>
            <select value={hsWahl} onChange={e => setHsWahl(e.target.value as Haltestellentyp)} aria-label="Haltestellentyp"
                    style={{ ...selectStyle, flex: '0 1 260px', minWidth: 0 }}>
              {hsVorlagen.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button type="button" style={{ ...kleinKnopfStyle, borderColor: 'var(--accent)', color: 'var(--accent)' }}
                    onClick={() => { onChange(haltestelleEinfuegen(a, einbahn ? 'A' : hsSeite, hsWahl, rt, city)); setPlanHinweis('') }}>
              Einfügen
            </button>
            {a.haltestellentyp && (Object.entries(a.haltestellentyp) as ['A' | 'B', Haltestellentyp][]).map(([s, t]) => (
              <span key={s}>· Seite {s}: {t}</span>
            ))}
          </div>
        )}
        {/* Elemente (seit 22.10.2026 zweistufig, vorher bis zu zwölf Bedienelemente in einer Zeile): Hauptzeile mit Griff ⠿
            (Drag and Drop), Nummer, Art, Breite (−/+/📏) und ✕; darunter gedämpft die Einzelheiten (Bild, Pfeil, Parkierung,
            Richtung, Verschieben auf Touch-Geräten, Einfügen dahinter); dann die Prüfung */}
        {a.teile.map((t, i) => {
          const p = pruefeTeil(t, rt, breiten, { ...umfeld, halt: haltUmfeld(a.teile, i, section, a) })
          const bilder = BILDER[t.art]
          const marks = markierungenFuer(t.art)
          const richtungen = richtungenFuer(t.art, einbahn)
          return (
            <div key={i}
                 onDragOver={e => { if (zieh == null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (ueber !== i) setUeber(i) }}
                 onDrop={e => { e.preventDefault(); if (zieh != null) verschiebe(zieh, i); ziehEnde() }}
                 style={{ padding: '6px 0',
                          opacity: zieh === i ? 0.45 : 1,
                          borderTop: ueber === i && zieh != null && zieh > i ? '2px solid var(--accent)'
                            : i ? '1px solid var(--border-subtle)' : '2px solid transparent',
                          borderBottom: ueber === i && zieh != null && zieh < i ? '2px solid var(--accent)' : '2px solid transparent' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span draggable title="Ziehen zum Verschieben" aria-hidden
                      onDragStart={e => {
                        setZieh(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i))
                        const zeile = e.currentTarget.parentElement?.parentElement
                        if (zeile) e.dataTransfer.setDragImage(zeile, 12, 16)
                      }}
                      onDragEnd={ziehEnde}
                      style={{ cursor: 'grab', fontSize: 16, color: 'var(--text-muted)', padding: '0 2px', userSelect: 'none' }}>⠿</span>
                <span style={{ width: 18, fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{i + 1}</span>
                <select value={t.art} aria-label={`Element ${i + 1}`} style={{ ...selectStyle, flex: '1 1 180px', minWidth: 0 }}
                        onChange={e => artWechsel(i, e.target.value as TeilArt)}>
                  <TeilOptionen />
                </select>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  <button type="button" onClick={() => schritt(i, t, -0.1)} style={{ ...kleinKnopfStyle, padding: '5px 8px' }}
                          aria-label={`Element ${i + 1} 10 cm schmaler`} title="10 cm schmaler">−</button>
                  <NumberField kompakt label={`Breite Element ${i + 1}`} unit="m" value={t.breite} step={0.05}
                               onChange={v => aendere(i, { ...t, breite: v, angenommen: undefined })} />
                  <button type="button" onClick={() => schritt(i, t, 0.1)} style={{ ...kleinKnopfStyle, padding: '5px 8px' }}
                          aria-label={`Element ${i + 1} 10 cm breiter`} title="10 cm breiter">+</button>
                  {onTeileMessen && (
                    <button type="button" onClick={() => onTeileMessen({ ziel: 'plan', nr: i })}
                            style={{ ...kleinKnopfStyle, padding: '5px 7px', marginLeft: 4, borderColor: 'var(--accent)', color: 'var(--accent)' }}
                            aria-label={`Breite Element ${i + 1} am Luftbild messen`} title="Breite dieses Elements am Luftbild messen">📏</button>
                  )}
                </span>
                <button type="button" onClick={() => entfernen(i, t)} style={{ ...kleinKnopfStyle, marginLeft: 'auto' }}
                        aria-label={`Element ${i + 1} entfernen`} title="Element entfernen (Rückgängig im Hinweis)">✕</button>
              </div>
              {/* Einzelheiten: Bild (was darauf steht), Pfeil, Anordnung der Parkierung, Richtung, Verschieben, Einfügen */}
              <div style={{ display: 'flex', gap: '4px 8px', alignItems: 'center', flexWrap: 'wrap', paddingLeft: 26, marginTop: 4 }}>
                {bilder && (
                  <select value={bildVon(t)} aria-label={`Bild Element ${i + 1}`} title="Was auf dem Element steht (Skizze; bei der Fahrspur auch die Vorgabe)"
                          onChange={e => bildWechsel(i, t, e.target.value as Bild)} style={{ ...detailSelect, flex: '0 1 150px' }}>
                    {bilder.map(b => <option key={b} value={b}>{BILD_LABEL[b]}</option>)}
                  </select>
                )}
                {/* Pfeil auf dem Element als Knopfgruppe (Nutzerentscheid 20.10.2026: «keine Markierung» als Auswahl war missverständlich);
                    die Richtungen einzeln ein- und ausschalten, damit auch «geradeaus und rechts» geht (OSM turn:lanes) */}
                {marks.length > 0 && (() => {
                  const an = pfeileVon(t.markierung)
                  return (
                    <span role="group" aria-label={`Pfeil auf Element ${i + 1}`} title={`Pfeil auf dem Element (Skizze): ${MARKIERUNG_LABEL[markierungAus(an)]}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--text-muted-strong)' }}>
                      Pfeil
                      <span style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                        {PFEILE.map(pf => {
                          const ein = an.includes(pf)
                          return (
                            <button key={pf} type="button" aria-pressed={ein} title={`${PFEIL_NAME[pf]} ${ein ? 'aus' : 'ein'}`}
                                    onClick={() => aendere(i, { ...t, markierung: markierungAus(ein ? an.filter(x => x !== pf) : [...an, pf]) })}
                                    style={{ border: 'none', padding: '3px 8px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                             background: ein ? 'var(--accent)' : '#fff', color: ein ? '#fff' : 'var(--text)' }}>
                              {PFEIL_ZEICHEN[pf]}
                            </button>
                          )
                        })}
                      </span>
                    </span>
                  )
                })()}
                {/* Anordnung der Parkierung (Nutzerwunsch 20.10.2026): längs, schräg, senkrecht; gemessen «schräg oder senkrecht» */}
                {t.art === 'Parkierung' && (
                  <select value={t.parkart === 'schraeg' && t.winkel ? `s${t.winkel}` : t.parkart ?? 'laengs'} aria-label={`Anordnung Parkierung Element ${i + 1}`}
                          title="Anordnung der Parkfelder"
                          onChange={e => {
                            const wahl = e.target.value as 'laengs' | 's45' | 's60' | 'schraeg' | 'quer' | 'tief'
                            // Längs: Vorgabe. Schräg/senkrecht: eine gemessene Tiefe bleibt (Nutzerentscheid 20.10.2026), sonst
                            // nach den Normalien Stadt Bern vorbelegt (schräg 45° 4,90, 60° 5,25, senkrecht 5,00 m)
                            const { parkart: _a, tiefeGemessen: _b, winkel: _w, ...rest } = t
                            if (wahl === 'laengs') { aendere(i, { ...rest, breite: vorgabe('Parkierung'), angenommen: undefined }); return }
                            const pa = wahl === 's45' || wahl === 's60' ? 'schraeg' : wahl
                            const winkel = wahl === 's45' ? 45 : wahl === 's60' ? 60 : undefined
                            aendere(i, { ...rest, parkart: pa, ...(winkel ? { winkel } : {}), ...(t.tiefeGemessen ? { tiefeGemessen: true } : {}),
                              angenommen: undefined, breite: t.tiefeGemessen || pa === 'tief' ? t.breite : parkTiefeVorbelegt(pa, winkel) })
                          }}
                          style={{ ...detailSelect, flex: '0 1 170px' }}>
                    <option value="laengs">längs</option>
                    <option value="s60">schräg 60°</option>
                    <option value="s45">schräg 45°</option>
                    {t.parkart === 'schraeg' && !t.winkel && <option value="schraeg">schräg (Winkel offen)</option>}
                    <option value="quer">senkrecht</option>
                    {(t.parkart === 'tief' || t.tiefeGemessen) && <option value="tief">schräg oder senkrecht (offen)</option>}
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
                {/* Versetzte Parkierung (Nutzerbefund 20.10.2026): abwechselnd Seite A und B */}
                {(t.art === 'Parkierung' || (t.art === 'Sicherheitsstreifen' && t.versetzt)) && (
                  <label title="Parkierung an anderer Stelle als die Parkierung gegenüber (abwechselnd Seite A und B): zählt nicht zur Breite des Querschnitts und wird nicht gezeichnet; bewertet weiter als Parkierung"
                         style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--text)' }}>
                    <input type="checkbox" checked={!!t.versetzt}
                           onChange={e => aendere(i, { ...t, versetzt: e.target.checked || undefined })} />
                    versetzt
                  </label>
                )}
                {richtungen.length > 1 && (
                  <select value={richtungVon(t, links[i], einbahn)} aria-label={`Richtung Element ${i + 1}`}
                          title="Fahrtrichtung (Skizze: Fahrzeug von vorne oder hinten, Richtung der Pfeile)"
                          onChange={e => aendere(i, { ...t, richtung: e.target.value as Richtung })}
                          style={{ ...detailSelect, flex: '0 1 220px' }}>
                    {richtungen.map(r => <option key={r} value={r}>{richtungText(r)}</option>)}
                  </select>
                )}
                {/* Verschieben mit Pfeilen nur auf Touch-Geräten (index.css .nur-touch), wo Drag and Drop je nach Browser fehlt */}
                <span className="nur-touch" style={{ gap: 4 }}>
                  <button type="button" onClick={() => schiebe(i, -1)} disabled={i === 0} style={{ ...kleinKnopfStyle, padding: '4px 8px' }}
                          aria-label={`Element ${i + 1} nach links`} title="nach links">←</button>
                  <button type="button" onClick={() => schiebe(i, 1)} disabled={i === a.teile.length - 1} style={{ ...kleinKnopfStyle, padding: '4px 8px' }}
                          aria-label={`Element ${i + 1} nach rechts`} title="nach rechts">→</button>
                </span>
                {/* Einfügen direkt hinter diesem Element; die Art wird gleich hier gewählt (vorher kam
                    jedes neue Element an den rechten Rand und musste verschoben werden, Nutzerbefund 16.10.2026). */}
                <select value="" onChange={e => einfuegen(i + 1, e.target.value as TeilArt)}
                        aria-label={`Neues Element hinter Element ${i + 1} einfügen`} title="Neues Element hinter dieser Zeile einfügen (in der Skizze rechts davon)"
                        style={{ ...kleinKnopfStyle, padding: '4px 8px', marginLeft: 'auto' }}>
                  <option value="" disabled hidden>＋ dahinter</option>
                  <TeilOptionen />
                </select>
              </div>
              <span style={{ display: 'block', paddingLeft: 26, marginTop: 2, fontSize: 12.5, fontWeight: 600, color: TEIL_FARBE[p.status] }}>
                {pruefungText(t, p)}
                {t.angenommen && (
                  <span style={{ display: 'block', fontWeight: 500, color: '#92400e' }}>
                    Breite heute unbekannt (keine Angabe in OSM, nicht gemessen): Vorgabe eingesetzt. Am Luftbild messen
                    (📏 neben dem Feld oder «📏 Am Luftbild messen» bei der Seite) oder hier eintragen.
                  </span>
                )}
              </span>
            </div>
          )
        })}
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {a.teile.length ? (
            <>«＋ dahinter» fügt ein Element hinter der Zeile ein, in der Skizze rechts davon. Ganz links (Rand der Seite B):{' '}
              <select value="" onChange={e => einfuegen(0, e.target.value as TeilArt)} aria-label="Neues Element ganz links einfügen"
                      style={{ ...kleinKnopfStyle, padding: '4px 8px' }}>
                <option value="" disabled hidden>＋ ganz links</option>
                <TeilOptionen />
              </select></>
          ) : (
            <select value="" onChange={e => einfuegen(0, e.target.value as TeilArt)} aria-label="Element hinzufügen" style={selectStyle}>
              <option value="" disabled hidden>+ Element hinzufügen …</option>
              <TeilOptionen />
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
              {plan.seiten.length > 1 && se.bewertung && <> → <Beurteilung note={se.bewertung.note} /></>}
            </div>
          ))}
          {plan.note == null && planFehlt.length > 0 && <div>Für die Note fehlt: {aufzaehlen(planFehlt)}.</div>}
          {Number.isFinite(b.rest) && b.rest < -0.005 &&
            <div style={{ color: '#991b1b' }}>Die Elemente haben im verfügbaren Querschnitt keinen Platz; die Note setzt voraus, dass sie passen.</div>}
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
function SectionCard({ index, section, ergebnis, isWorst, zu, onKlappen, onChange, onTauschen, onLuftbild, onMessen, onFahrbahnbreite, fbLaden, av, onBericht, onRemove, canRemove, onHover, breitenQuelle, city, ort, laengeM, onQuerschnitt, tab = 'bewerten', onTab, kartenAktionen }: {
  kartenAktionen?: React.ReactNode       // Abschnitt ohne Karte: Knöpfe «übernehmen»/«teilen» im Hinweis der Planung
  tab?: 'bewerten' | 'planen'            // Reiter im Abschnitt (seit 22.10.2026): Eingaben und Noten, oder die Planung
  onTab?: (t: 'bewerten' | 'planen') => void
  onQuerschnitt?: () => void             // Querschnitt am Luftbild aufnehmen (Städte mit avKanton, Abschnitte von der Karte)
  laengeM?: number                       // Länge des Abschnitts aus den Segmenten [m] (Vorschlag Haltestellenbereich)
  onBericht?: () => void                 // Bericht der Planung öffnen
  ort?: Ort                              // Stelle des Karten-Markers und Fahrtrichtung der Seite A (Street View)
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
  onChange: (patch: Partial<Section>) => void
  onTauschen: () => void
  onLuftbild: (welche: { a: boolean; b: boolean }) => void   // Luftbild-Hinweis übernehmen
  onMessen?: (seite: 'A' | 'B', plan?: boolean, teil?: { ziel: 'plan' | 'heute'; nr?: number }) => void  // Breite am Luftbild messen (Städte mit avKanton); plan: Teil für Teil (Planung oder heute), teil: dieses Teil
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
  // Reiter «Planen»: die Planung anlegen, falls noch keine da ist, und die AV auf der Karte zeigen
  const mitReitern = !!CITIES[city].aufteilung
  const planenOeffnen = () => {
    if (!section.aufteilung) { onChange({ aufteilung: startAufteilung(section, city, CITIES[city].breiten) }); if (hatMarker) av?.zeigen() }
    onTab?.('planen')
  }
  const planNote = section.aufteilung ? bewerteAufteilung(section, section.aufteilung, city, CITIES[city].breiten).note : null
  const NoteChip = ({ note }: { note: number | null }) => note == null
    ? <span style={{ fontSize: 11, fontWeight: 700, color: '#9a3412', background: '#ffedd5', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>Eingabe nötig</span>
    : <span style={{ fontSize: 12, fontWeight: 800, borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap',
                     background: noteColor(note).bg, color: noteColor(note).fg }}>
        <Beurteilung note={note} />
      </span>
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
        {/* Note bzw. Status immer in der Kopfzeile (seit 22.10.2026, vorher nur eingeklappt); dazu die Note der Planung */}
        <NoteChip note={ergebnis.note} />
        {section.aufteilung && planNote != null && (
          <span title="Note mit der Planung" style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            Planung <NoteChip note={planNote} />
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
        {mitReitern && !(tab === 'planen' && !zu) && (
          <button type="button"
                  onClick={() => { if (zu) onKlappen?.(); planenOeffnen() }}
                  title={hatMarker ? 'Den Querschnitt neu aufteilen und prüfen (Reiter «Planen»)'
                    : 'Von Hand planen: ohne Abschnitt von der Karte fehlen Fahrbahnbreite, Trottoirs und amtliche Vermessung'}
                  style={{ border: '1px solid var(--accent)', background: '#fff', color: 'var(--accent)',
                           borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {section.aufteilung ? 'Zur Planung' : hatMarker ? 'Aufteilung planen' : 'Von Hand planen'}
          </button>
        )}
        {ort && <StreetViewLink ort={ort} />}
        {canRemove && (
          <button onClick={onRemove}
                  style={{ border: '1px solid var(--border)', background: '#fff', color: 'var(--text-muted)',
                           borderRadius: 8, padding: '4px 10px', fontSize: 13, cursor: 'pointer' }}>
            Entfernen
          </button>
        )}
      </div>

      {!zu && (<>
      {/* Reiter (seit 22.10.2026): «Bewerten» mit Eingaben und Noten, «Planen» mit der Aufteilung; vorher stand die
          Planung unter dem Ergebnis, mit einem Werbekasten in jedem Abschnitt und einem dritten Einstieg oben im Panel.
          Ohne Note am Reiter (seit 22.10.2026 abends): sie steht schon in der Kopfzeile, zusammen mit der der Planung. */}
      {mitReitern && (
        <div className="vrc-reiter" role="tablist" aria-label={`Abschnitt ${index + 1}`}>
          <button type="button" role="tab" aria-selected={tab === 'bewerten'} onClick={() => onTab?.('bewerten')}>
            Bewerten
          </button>
          <button type="button" role="tab" aria-selected={tab === 'planen'} onClick={planenOeffnen}>
            Planen
          </button>
        </div>
      )}
      {(!mitReitern || tab === 'bewerten') && (<>
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
        {/* Mittelinsel aus der AV: nur Hinweis, nicht in der Note (Nutzerentscheid 20.10.2026) */}
        {section.mittelstreifen && (
          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, fontSize: 12.5, background: '#f8fafc', border: '1px solid var(--border)', color: 'var(--text-muted-strong)' }}>
            Mittelstreifen (AV) auf Seite {section.mittelstreifen.seite.toUpperCase()}: {numDE(section.mittelstreifen.breite, 2)} m breit, {section.mittelstreifen.laenge} m lang.
            Die Fahrbahn reicht bis zum Streifen; {section.mittelstreifen.dahinter < 3
              ? <>dahinter liegt nur ein Streifen von {numDE(section.mittelstreifen.dahinter, 1)} m, vermutlich eine Haltestelleninsel mit Veloumfahrung: ÖV-Angebot und Haltestellentyp wählen und die AV neu laden.</>
              : <>dahinter liegt ein zweiter Fahrbahnteil von {numDE(section.mittelstreifen.dahinter, 1)} m (Gegenfahrbahn oder Tram-/Bustrassee), der nicht zu diesem Abschnitt gehört.</>}
            {' '}Den ganzen Strassenraum nimmt «Querschnitt am Luftbild» auf.
          </div>
        )}
        {section.mittelinsel && (
          <div style={{ flexBasis: '100%', fontSize: 12, color: 'var(--text-muted-strong)' }}>
            Mittelinsel (AV): {numDE(section.mittelinsel.breite, 2)} m breit, {section.mittelinsel.laenge} m lang
            {section.mittelinsel.anzahl > 1 ? ` (die längste von ${section.mittelinsel.anzahl})` : ''}; Fahrbahn an der Insel
            {' '}{numDE(section.mittelinsel.fahrbahn, 1)} m von Bord zu Bord samt Insel. Nur Hinweis, nicht in der Note.
          </div>
        )}
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

      {/* Haltestellenbereich (nur Bern, seit 20.10.2026): Die Haltestelle prägt den Abschnitt, die Note kommt allein
          aus ihr. Die App schlägt ihn vor, wenn eine Haltestelle erkannt ist und der Abschnitt höchstens 60 m lang ist. */}
      {city === 'bern' && (section.oevAngebot !== 'keine' || section.oev?.oevHalt) && (() => {
        const vorschlagen = !section.haltestellenbereich && !section.haltestellenbereichNein && !!section.oev?.oevHalt
          && laengeM != null && laengeM <= HALTESTELLENBEREICH_MAX_M
        return (
          <div style={{ marginTop: 10 }}>
            {vorschlagen && (
              <div style={{ marginBottom: 8, padding: '8px 12px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe',
                            color: '#1e3a8a', fontSize: 12.5, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 260px' }}>
                  <strong>Vorschlag Haltestellenbereich:</strong> Die Haltestelle{section.oev?.oevHaltName ? ` «${section.oev.oevHaltName}»` : ''} liegt
                  in diesem Abschnitt, und er ist nur {numDE(Math.round(laengeM!), 0)} m lang (höchstens {HALTESTELLENBEREICH_MAX_M} m). Die
                  Haltestelle prägt ihn; dann zählt für die Note allein die Haltestelle.
                </span>
                <button type="button" onClick={() => onChange({ haltestellenbereich: true })}
                        style={{ ...kleinKnopfStyle, borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                  Als Haltestellenbereich bewerten
                </button>
                <button type="button" onClick={() => onChange({ haltestellenbereichNein: true })} style={kleinKnopfStyle}>
                  Nein
                </button>
              </div>
            )}
            <label style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 13, color: 'var(--text)' }}>
              <input type="checkbox" checked={!!section.haltestellenbereich}
                     onChange={e => onChange({ haltestellenbereich: e.target.checked || undefined })} style={{ marginTop: 3 }} />
              <span>
                <strong>Haltestellenbereich</strong>: Die Haltestelle prägt den Abschnitt.
                {section.haltestellenbereich && (
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted-strong)' }}>
                    Bewertet wird je Seite mit Haltestelle nur der Haltestellentyp gegen die Lösung, die der Masterplan verlangt
                    (ÖV-Angebot × Routentyp, Anwendungshilfe Haltestellen): erfüllt Note 6 (minus Abzug für eine zu schmale
                    Velofläche), nicht erfüllt Note {HALTESTELLENBEREICH_NICHT_ERFUELLT}, Kaphaltestelle an einer Tramhaltestelle
                    Note 1. Führungsform, DTV, Tempo und Parkierung zählen auf dieser Seite nicht.
                  </span>
                )}
              </span>
            </label>
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
          Seite A in Fahrtrichtung der Strecke, Seite B die Gegenrichtung
          <Info text={`Seite A ist die Fahrtrichtung entlang der Strecke, Seite B die Gegenrichtung. Die Note des Abschnitts ist die schlechtere der bewerteten Seiten.${hatMarker && section.peilungA != null ? ' Der Pfeil am Karten-Marker zeigt die Fahrtrichtung der Seite A.' : ''}`} />
        </div>
        {/* OSM: Radweg als eigener Weg neben der Strasse (seit 21.10.2026): nur Hinweis, die Führungsform bleibt */}
        {section.parallelWeg && (section.parallelWeg.a != null || (beide && section.parallelWeg.b != null)) && (
          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, fontSize: 12.5, background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#4c1d95' }}>
            <strong>OSM:</strong> {section.parallelWeg.a != null && (!beide || section.parallelWeg.b == null || section.parallelWeg.a === section.parallelWeg.b)
              ? `Die Führungsform${beide && section.parallelWeg.b === section.parallelWeg.a ? ' beider Seiten' : ' der Seite A'} stammt aus dem parallelen Weg OSM way ${section.parallelWeg.a}`
              : section.parallelWeg.a != null
                ? `Die Führungsform der Seite A stammt aus dem parallelen Weg OSM way ${section.parallelWeg.a}, die der Seite B aus OSM way ${section.parallelWeg.b}`
                : `Die Führungsform der Seite B stammt aus dem parallelen Weg OSM way ${section.parallelWeg.b}`}
            {' '}(Radweg neben der Strasse, in OSM als eigener Weg erfasst). Der Weg ist auf der Karte abgewählt; ihn anwählen macht ihn wieder zu einem eigenen Abschnitt.
          </div>
        )}
        {section.radwegSeparat && !section.parallelWeg && (section.radwegSeparat.a || (beide && section.radwegSeparat.b)) && (
          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, fontSize: 12.5, background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#4c1d95' }}>
            <strong>OSM:</strong> Auf {section.radwegSeparat.a && beide && section.radwegSeparat.b ? 'beiden Seiten' : `Seite ${section.radwegSeparat.a ? 'A' : 'B'}`} ist
            der Radweg als eigener Weg neben der Strasse erfasst. Die Führungsform setzt der Rechner daraus nicht: Oft liegt der Radweg nur
            an einer Haltestelle neben der Strasse (Veloumfahrung). Bitte am Luftbild prüfen und die Führungsform von Hand wählen.
          </div>
        )}
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
            Gilt für beide Fahrtrichtungen, mit einer gemeinsamen Note.
          </div>
          <SeiteFelder felder={seiteA(section)} quelle={{ ist: q.ist, breite: q.breite, parkenRechts: q.parkenRechts, oevTakt: q.oevTakt }}
                       onChange={onChange} city={city} oevAngebot={section.oevAngebot}
                       onMessen={onMessen && (() => onMessen('A'))} typAngenommen={!!section.hsTypAngenommen?.a}
                       onTypBestaetigt={() => onChange({ hsTypAngenommen: { ...section.hsTypAngenommen, a: false } })} />
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
        <SeiteFelder felder={seiteA(section)} quelle={{ ist: q.ist, breite: q.breite, parkenRechts: q.parkenRechts, oevTakt: q.oevTakt }}
                     onChange={onChange} city={city} oevAngebot={section.oevAngebot}
                       onMessen={onMessen && (() => onMessen('A'))} typAngenommen={!!section.hsTypAngenommen?.a}
                       onTypBestaetigt={() => onChange({ hsTypAngenommen: { ...section.hsTypAngenommen, a: false } })} />
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
                       onMessen={onMessen && (() => onMessen('B'))} typAngenommen={!!section.hsTypAngenommen?.b}
                       onTypBestaetigt={() => onChange({ hsTypAngenommen: { ...section.hsTypAngenommen, b: false } })} />
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
                       routentyp={section.routentyp} city={city}
                       breitenQuelle={breitenQuelle(se.felder.ist)} />
        </div>
      ))}

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

      {/* Reiter «Planen»: Aufteilung planen — Städte mit aufteilung: true */}
      {mitReitern && tab === 'planen' && !section.aufteilung && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f0fdfa', border: '1px solid #99f6e4', fontSize: 13, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 220px' }}>{hatMarker
            ? 'Keine Planung für diesen Abschnitt. Ausgangslage ist der Querschnitt von heute.'
            : 'Zuerst einen Abschnitt auf der Karte wählen (Strasse antippen oder suchen, bei Bedarf «✂ Segment teilen», dann «Segmente in Strecke übernehmen»); sonst bleibt nur die Planung von Hand.'}
            {!hatMarker && kartenAktionen}</span>
          <button type="button" onClick={planenOeffnen}
                  style={{ border: 'none', background: 'var(--accent)', color: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            {hatMarker ? 'Aufteilung planen' : 'Von Hand planen'}
          </button>
        </div>
      )}
      {mitReitern && tab === 'planen' && (
        <AufteilungPlanen section={section} heute={ergebnis} city={city} rA={rA} rB={rB}
                          onChange={aufteilung => { onChange({ aufteilung }); if (!aufteilung) { av?.ausblenden(); onTab?.('bewerten') } }} av={av}
                          onFahrbahnbreite={onFahrbahnbreite && (() => onFahrbahnbreite('plan'))} fbLaden={fbLaden}
                          onBericht={onBericht} onQuerschnitt={onQuerschnitt} ort={ort}
                          onTeileMessen={onMessen && section.candIds?.length ? teil => onMessen('A', true, teil) : undefined}
                          kartenAktionen={hatMarker ? undefined : kartenAktionen}
                          onQuerschnittVerwerfen={() => onChange({ querschnittHeute: undefined, gesamtbreite: undefined,
                            ...(section.aufteilung && JSON.stringify(section.aufteilung) === JSON.stringify(startAufteilung(section, city, CITIES[city].breiten))
                              ? { aufteilung: startAufteilung({ ...section, querschnittHeute: undefined, gesamtbreite: undefined }, city, CITIES[city].breiten) } : {}) })} />
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

// ── Quellen und Grundlagen (seit 23.10.2026, quellen.ts) ─────────────────────
// Je gewählter Stadt: die allgemeinen Werke und die der Stadt, in zwei Gruppen (Vorgaben und Normen; Daten und Dienste).
// Je Eintrag: Name als Link (wo es eine öffentliche Adresse gibt), Titel, Herausgeber, Ausgabe, Ebene, Geltung (Stadt
// oder alle Städte) und wofür die App es braucht.
const STADT_NAME: Record<Stadt, string> = { bern: 'Bern', zurich: 'Zürich', basel: 'Basel', luzern: 'Luzern' }
function QuellenTeil({ city }: { city: CityId }) {
  const gruppe = (g: QuellenGruppe, titel: string) => {
    const liste = quellenFuer(city, g)
    return (
      <div style={{ marginTop: 10 }}>
        <h3 style={{ fontSize: 13.5, margin: '0 0 6px', color: 'var(--text-strong)' }}>{titel}</h3>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {liste.map(q => (
            <li key={q.id} style={{ fontSize: 12.5, lineHeight: 1.45, paddingLeft: 10, borderLeft: '3px solid var(--border)' }}>
              <div>
                {q.url
                  ? <a href={q.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontWeight: 700 }}>{q.name} ↗</a>
                  : <strong>{q.name}</strong>}
                {q.titel && <span style={{ color: 'var(--text-muted-strong)' }}> · {q.titel}</span>}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span>{q.herausgeber}{q.ausgabe ? ` · ${q.ausgabe}` : ''} · {q.ebene}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: '1px 7px',
                               background: q.staedte ? '#dbeafe' : 'var(--border-subtle)', color: q.staedte ? '#1e40af' : 'var(--text-muted-strong)' }}>
                  {q.staedte ? q.staedte.map(x => STADT_NAME[x]).join(', ') : 'alle Städte'}
                </span>
              </div>
              <div style={{ color: 'var(--text)' }}>{q.verwendung}</div>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  return (
    <details id="quellen" className="vrc-klappe" style={{ marginTop: 28 }}>
      <summary style={{ cursor: 'pointer', fontSize: 16, fontWeight: 700, color: 'var(--text)', userSelect: 'none' }}>
        Quellen und Grundlagen ({STADT_NAME[city]})
      </summary>
      <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-muted-strong)' }}>
        Worauf sich Bewertung und Planung für {STADT_NAME[city]} stützen; die Liste wechselt mit der Stadt oben auf der Karte.
        Standards einer Stadt gelten für deren eigene Projekte, Normen sind Fachregeln ohne Gesetzeskraft. Wo ein Werk eine
        öffentliche Adresse hat, führt der Name dorthin.
      </div>
      {gruppe('vorgabe', 'Vorgaben und Normen')}
      {gruppe('daten', 'Daten und Dienste')}
    </details>
  )
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
          Tippen erscheinen Vorschläge; Vorschlag wählen oder Enter lädt die Strasse) oder «Segmente im Kartenausschnitt laden». Der
          Knopf unter den Zoom-Knöpfen springt zum eigenen Standort (nur auf der Karte gezeigt, nicht gespeichert). Linien per Klick an- und abwählen (weiss gestrichelt = nicht in der Strecke);
          «Segment teilen» schneidet ein langes Segment an der angeklickten Stelle.</li>
        <li><b>Übernehmen:</b> benachbarte Segmente gleicher Führungsform und gleichen Tempos werden zu Abschnitten gruppiert.</li>
        <li><b>Abschnitte prüfen:</b> die Abschnitte sind eingeklappt; die Kopfzeile zeigt Name, Länge und Note, ein Klick darauf
          oder auf die Nummer auf der Karte öffnet einen (die anderen klappen zu). Je Abschnitt stehen Führungsform, Tempo und
          weitere Angaben aus OpenStreetMap und dem Geoportal der Stadt, mit Herkunft am Chip (Geoportal, OSM, Markierung, Luftbild,
          AV, gemessen, angenommen; der Tooltip am Chip erklärt ihn). «Fahrbahnbreiten aus AV» über der Liste misst sie für alle
          Abschnitte ohne Breite. Was nicht stimmt, lässt sich von Hand anpassen; die Bewertung rechnet sofort neu.
          «Street View ↗» in der Kopfzeile öffnet Google Street View an der Stelle des Abschnitts, Blick in Fahrtrichtung der Seite A.
          In Bern lässt sich ein kurzer Abschnitt mit Haltestelle als «Haltestellenbereich» bewerten (die App schlägt es vor): Dann zählt
          allein der Haltestellentyp gegen die Lösung, die der Masterplan verlangt.</li>
        <li><b>Luftbild-Hinweis (Bern, Zürich, Basel):</b> Zeigt das Luftbild auf einer Seite einen Radstreifen, erscheint ein Hinweis
          zum Übernehmen; eine Breite liefert er nicht.</li>
        <li><b>Breite messen:</b> «📏 Am Luftbild messen» je Seite schaltet aufs Orthofoto, weit
          hineinzoomen und im Modus «Ab Bordsteinkante (AV)» auf die Markierung klicken, bis zu der die Breite zählt;
          gemessen wird rechtwinklig bis zur Bordsteinkante der amtlichen Vermessung (orange). Wo die AV keine
          Strassenfläche kennt oder die Kante nicht auf dem Bordstein im Foto liegt, im Modus «Zwei Punkte» zuerst die
          Bordsteinkante und dann die Markierung anklicken. Bei Velostrasse und Wegen misst «Ganze Fläche»: in die Fläche
          klicken, gemessen wird von Kante zu Kante. «… m übernehmen» trägt den Wert ein, mit Herkunft «gemessen»
          am Chip.</li>
        <li><b>Aufteilung planen:</b> oben mit «Planen» (beginnt beim massgebenden Abschnitt), im Reiter «Planen» eines Abschnitts
          oder mit «Aufteilung planen» in seiner Kopfzeile. Die Planung
          beginnt mit dem Querschnitt von heute (Fahrbahn und Trottoirs aus der amtlichen Vermessung, in Luzern aus den
          Strassenflächen der Stadt; Parkierung, Velostreifen).
          Elemente wählen, mit «＋ dahinter» einfügen, am Griff ⠿ verschieben und in der Breite ändern (Feld, «−»/«+» in 10-cm-Schritten
          oder «📏» am Luftbild); «✕» entfernt ein Element, der Hinweis darunter nimmt es zurück;
          eine Mittelinsel und ein Grünstreifen vor dem Trottoir aus der AV, Schräg- oder Senkrechtparkierung mit ihrer Tiefe und die Fahrspuren mit
          Pfeilen aus OpenStreetMap stehen schon in der Ausgangslage. «Haltestelle einfügen» setzt auf einer Seite den Querschnitt einer
          Haltestelle nach dem Masterplan (Veloumfahrung, Kap mit Veloüberfahrt, rückwärtiger Radweg, Inselhaltestelle). Trifft die
          Messung aus der AV nicht, nimmt «📐 Querschnitt am Luftbild» ihn von Hand auf: quer über die Strasse an jeder Grenze klicken,
          jedes Stück wird ein Element. Die App prüft jedes Element gegen die
          Vorgaben der Stadt (wo eine Stadt kein Mass nennt, gilt das Berner, mit «Ersatz Bern» ausgewiesen), rechnet die Bilanz über den ganzen Querschnitt und zeigt die Note mit der Planung neben der von heute. Die Karte
          zeigt dazu die amtliche Vermessung und die Parkfelder (Basel: keine Parkfelder in den offenen Daten). Der Kasten «Vorschlag»
          schlägt die erste Massnahme vor, die die Note auf 4,5 bringt, ohne und mit Randsteinanpassung (dann kommen die Trottoirs auf
          die Vorgabe des Fussverkehrsnetzes); ausser in Bern mit den Massen der Stadt, wo sie keine nennt mit den Berner; «Übernehmen» bzw. «Alternative übernehmen» setzt sie als Startpunkt. «Bericht / PDF» (oben und in der Planung) druckt Karte, Skizzen, Prüfung und Bewertung. Im Breitbild lässt sich der
          Eingabebereich am Trenner zur Karte breiter ziehen; bei offener Planung ist er schon breiter.</li>
        <li><b>Ergebnis lesen:</b> vorne steht der Erfüllungsgrad (von «Gar nicht erfüllt» bis «Vollständig erfüllt»), dahinter
          die Note von 1 bis 6, aus der er entsteht. Die Bewertung gilt je Seite, je Abschnitt (die schlechtere Seite) und für die
          ganze Strecke (der schlechteste Abschnitt). «Wie die Beurteilung entsteht» im Ergebnis zeigt jeden Abzug; die Herleitung
          steht im Referenzteil unten; «Quellen und Grundlagen» darüber nennt je Stadt die Vorgaben, Normen und Daten mit Link.
          «Als CSV exportieren» sichert die Bewertung als Datei.</li>
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
        Velostreifen, Parkierung, Trottoirs und Haltestelle. Jedes Element wird gegen die Vorgaben der Stadt
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

      {/* Querverweis auf SichtweitenCheck */}
      <a href="https://sichtweitencheck.ch/" target="_blank" rel="noopener noreferrer"
         style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, textDecoration: 'none',
                  background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 10,
                  padding: '12px 16px', color: 'var(--text)' }}>
        <img src={import.meta.env.BASE_URL + 'sichtweitencheck.svg'} alt="" width={56} height={56}
             style={{ flexShrink: 0, borderRadius: 8, background: '#fff' }} />
        <span>
          <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>SichtweitenCheck</span><br />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Sichtprüfung an Knoten und Grundstückzufahrten.
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

// Formen, deren Breite die ganze Fläche von Kante zu Kante ist (Messart «Ganze Fläche», seit 20.10.2026)
const FLAECHEN_FORMEN: IstFuehrungsform[] = ['Velostrasse', 'Fussweg Velo gestattet', 'Kombinierter Fuss-/Radweg', 'Zweirichtungsradweg', 'Radweg abgesetzt']
// Breite am Luftbild messen: Zustand der laufenden Messung.
interface QsAufnahme {
  secId: number
  titel: string
  achsen: P[][]                                   // Achsen des Abschnitts in Richtung der Seite A (LV95)
  flaechen: AvFlaeche[]                           // AV-Flächen (Einrasten, Vorbelegung der Art)
  laden: boolean
  fehler?: string
  linie?: { c: P; r: P }                          // Querlinie: Fusspunkt am ersten Punkt, Richtung zur Seite A
  grenzen?: number[]                              // Schnitte der Querlinie mit AV-Kanten (Lagen)
  lagen: number[]                                 // gesetzte Punkte auf der Querlinie, aufsteigend (Rand B → Rand A)
  klicks: number[]                                // dieselben in Klickreihenfolge (für «Letzten Punkt entfernen»)
  arten: (QsArt | undefined)[]                    // gewählte Art je Stück (undefined = nach der AV; GANZ = Ganzer Querschnitt)
  haltestelle: boolean                            // Insel = Wartebereich der Haltestelle
  ziel: 'heute' | 'plan' | 'beides'               // wohin «Übernehmen» schreibt (Schalter in der Leiste, seit 22.10.2026)
}
interface Messung {
  secId: number
  seite: 'A' | 'B'
  titel: string                                   // «Abschnitt 2, Seite A»
  modus: 'kante' | 'flaeche' | 'hand'             // ab AV-Bordsteinkante | ganze Fläche Kante–Kante | zwei Punkte von Hand
  kanten: Kante[]                                 // Bordsteinkanten der amtlichen Vermessung (LV95)
  geladen?: { e: number; n: number; r: number }   // Mitte und Halbseite des geladenen AV-Ausschnitts
  laden: boolean
  fehler?: string
  punkte: P[]                                     // gesetzte Punkte (zwei Punkte von Hand)
  ergebnis?: { breite: number; von: P; bis: P }   // Messlinie Bordsteinkante → Markierung
  // Teil für Teil in die Planung messen (Nutzerwunsch 21.10.2026): jede Messung wird ein neues Teil (teilArt) oder die
  // Breite eines bestehenden (teilNr); das Werkzeug bleibt offen bis «Fertig»
  plan?: boolean
  ziel?: 'plan' | 'heute'                         // in die Planung oder in den Querschnitt von heute (Section.querschnittHeute)
  teilArt?: TeilArt
  teilNr?: number
}

export default function App() {
  const [sections, setSections] = useState<Section[]>([defaultSection()])
  const [street, setStreet] = useState('')
  const [osmBusy, setOsmBusy] = useState(false)
  const [osmMsg, setOsmMsg] = useState('')
  const [osmKind, setOsmKind] = useState<'info' | 'ok' | 'error'>('info')  // Meldungstyp für Styling
  // Statusmeldung mit Typ setzen (info = neutral/Laden, ok = Erfolg, error = Fehler).
  // Meldung auch als Toast unten im Panel (seit 22.10.2026): wer tief in der Planung arbeitet, sieht die Zeile oben nicht
  const [toast, setToast] = useState<{ text: string; kind: 'info' | 'ok' | 'error'; key: number } | null>(null)
  const setMsg = (text: string, kind: 'info' | 'ok' | 'error' = 'info') => {
    setOsmMsg(text); setOsmKind(kind)
    setToast(text ? { text, kind, key: Date.now() } : null)
  }
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 9000 : 5000)
    return () => clearTimeout(t)
  }, [toast])
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
  // Breite des Panels im Breitbild (Nutzerwunsch 20.10.2026): mit dem Trenner verschiebbar zwischen der
  // Standardbreite (Minimum) und der doppelten (höchstens 70 % des Fensters); im Planmodus (eine Planung offen)
  // automatisch breiter. Die gezogene Breite merkt sich der Browser je Modus (nur Bequemlichkeit, localStorage).
  const planModus = sections.some(s => s.aufteilung)
  const [panelBreite, setPanelBreite] = useState<{ normal?: number; plan?: number }>(() => {
    try { return JSON.parse(localStorage.getItem('vrc.panelBreite') ?? '{}') ?? {} } catch { return {} }
  })
  const [fensterB, setFensterB] = useState(() => (typeof window === 'undefined' ? 1400 : window.innerWidth))
  useEffect(() => {
    const on = () => setFensterB(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const panelMin = Math.min(Math.max(400, 0.34 * fensterB), 560)
  const panelMax = Math.max(panelMin, Math.min(2 * panelMin, 0.7 * fensterB))
  const panelW = Math.round(Math.min(panelMax, Math.max(panelMin,
    planModus ? panelBreite.plan ?? Math.min(panelMax, 1.6 * panelMin) : panelBreite.normal ?? panelMin)))
  useEffect(() => {
    const raf = requestAnimationFrame(() => mapRef.current?.invalidateSize())
    return () => cancelAnimationFrame(raf)
  }, [panelW])
  const panelSetzen = (w: number | undefined, merken: boolean) => {
    setPanelBreite(prev => {
      const neu = { ...prev, [planModus ? 'plan' : 'normal']: w == null ? undefined : Math.round(Math.min(panelMax, Math.max(panelMin, w))) }
      if (merken) try { localStorage.setItem('vrc.panelBreite', JSON.stringify(neu)) } catch { /* ohne Speicher: nur für diese Sitzung */ }
      return neu
    })
  }
  const trennerZiehen = (ev: React.PointerEvent<HTMLDivElement>) => {
    ev.preventDefault()
    const el = ev.currentTarget
    el.setPointerCapture(ev.pointerId)
    el.classList.add('zieht')                     // eingefärbt, solange gezogen wird (index.css)
    const rand = el.parentElement!.getBoundingClientRect().right
    const move = (e: PointerEvent) => panelSetzen(rand - e.clientX, false)
    const up = (e: PointerEvent) => {
      el.classList.remove('zieht')
      panelSetzen(rand - e.clientX, true)
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up)
  }
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
      setMsg(`${segmente(c.length)} geladen (© OpenStreetMap, ODbL) · reichere an …`, 'ok')
      const { cands: enriched, stops: st, obs, fehler } = await enrichAll(c)
      if (gen !== ladeGen.current) return
      // Angereicherte je Id einspielen; Auswahl (falls inzwischen getoggelt) erhalten. Ids, die nicht
      // mehr da sind (zwischenzeitlich neue Ladung), werden ignoriert.
      setCands(prev => einspielen(prev, enriched, obs, !!cityCfg.obsFile))
      setStops(st)
      const amtlichHit = enriched.some(hatAmtlich)
      setMsg(`${segmente(c.length)} geladen (© OpenStreetMap, ODbL)` +
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
      setMsg(roh.length ? `${segmente(roh.length)} im Ausschnitt · reichere an …` : 'Keine neuen Segmente im Ausschnitt.',
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
      setMsg(`${segmente(neu.length)} im Ausschnitt (angereichert).` + fehlerText(fehler), fehler.length ? 'info' : 'ok')
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
  // Haltestelleninsel bzw. Perron aus der AV, mit den Wartehallen und Perrons aus OSM: sie machen eine Trottoirfläche zwischen
  // zwei Strassen zum Perron (Helvetiaplatz, 23.10.2026) und sagen bei einer Insel, wo die Wartehalle steht (Monbijoustrasse,
  // 21.10.2026). Ohne Antwort von OSM nur die Insel, ohne Angabe zur Wartehalle.
  const haltestelleninselMitOsm = async (s: Section, achsen: P[][], flaechen: AvFlaeche[], kanten: Kante[]): Promise<Haltestelleninsel | null> => {
    const geom = (s.candIds ?? []).flatMap(id => candsRef.current.find(c => c.id === id)?.geom ?? [])
    const punkte = await ladeWartehallen(geom).catch(() => [])
    const lv = punkte.map(x => ({ p: zuLv95(x.lat, x.lon), wartehalle: x.wartehalle }))
    const hsi = haltestelleninsel(achsen, flaechen, kanten) ?? haltestellenperron(achsen, flaechen, kanten, lv.map(x => x.p))
    if (!hsi || hsi.perron) return hsi
    const lage = wartehalleLage(achsen, flaechen, hsi.seite, lv)
    return lage ? { ...hsi, wartehalle: lage } : hsi
  }
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
      const insel = mittelinsel(achsen, flaechen)
      // Haltestelleninsel: die Fahrbahn misst nur bis zur Insel (Achsen in Richtung der Seite A für die Seite)
      const hsi = hatHaltestelle(s) ? await haltestelleninselMitOsm(s, avAchsen(s, true), flaechen, bordkanten(flaechen)) : null
      if (hsi && ziel === 'abschnitt') {
        setSections(prev => prev.map(x => (x.id !== secId ? x : haltestelleninselUebernehmen(x, hsi, city, true))))
        setMsg(`Fahrbahnbreite ${numDE(hsi.innen, 1)} m bis zur Haltestelleninsel (Seite ${hsi.seite === 'rechts' ? 'A' : 'B'}: Wartebereich `
          + `${numDE(hsi.insel, 2)} m, dahinter ${hsi.aussen < 3 ? 'Veloumfahrung' : 'Fahrspur'} ${numDE(hsi.aussen, 2)} m). Haltestellentyp angenommen, bitte prüfen.`, 'ok')
        return
      }
      if (!r) { setMsg('Fahrbahnbreite: Die amtliche Vermessung liefert hier keine eindeutige Strassenfläche (zu kurz, Platz oder Kreuzung). Bitte von Hand eintragen.', 'info'); return }
      const wert = Math.round((hsi ? hsi.innen : r.median) * 10) / 10
      setSections(prev => prev.map(x => (x.id !== secId ? x
        : ziel === 'plan' ? (x.aufteilung ? { ...x, aufteilung: { ...x.aufteilung, fahrbahn: wert } } : x)
        : { ...x, fahrbahnbreite: wert, mittelinsel: insel, quelle: { ...x.quelle, fahrbahnbreite: 'av' } })))
      setMsg(`Fahrbahnbreite ${numDE(wert, 1)} m: Median aus ${r.n} Querschnitten, Spannweite ${numDE(r.min, 1)}–${numDE(r.max, 1)} m. ` +
        'Die Fläche umfasst auch Parkierung, Busbuchten und Tramgleise.'
        + (insel ? ` Mittelinsel ${numDE(insel.breite, 2)} m breit, ${insel.laenge} m lang; an ihr ${numDE(insel.fahrbahn, 1)} m von Bord zu Bord.` : ''), 'ok')
    } catch (err) {
      setMsg(`Fahrbahnbreite: amtliche Vermessung nicht erreichbar (${(err as Error).message}).`, 'error')
    } finally { setFbLaden(null) }
  }

  // Alle Abschnitte ohne Fahrbahnbreite nacheinander aus der AV (Strecken-Knopf, seit 22.10.2026)
  const fahrbahnbreitenAlle = async (ids: number[]) => {
    for (const id of ids) await fahrbahnbreiteErmitteln(id)
    setMsg(`Fahrbahnbreiten aus der AV für ${ids.length} ${ids.length === 1 ? 'Abschnitt' : 'Abschnitte'} ermittelt; Einzelheiten je Abschnitt am Chip «AV».`, 'ok')
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
  const [planTab, setPlanTab] = useState<Set<number>>(new Set())      // Abschnitte mit offenem Reiter «Planen»
  const [hauptAnsicht, setHauptAnsicht] = useState<'bewerten' | 'planen'>('bewerten')   // Kopf: Bewerten | Planen
  const [berichtWahl, setBerichtWahl] = useState(false)               // Kopf: Wahl unter «Bericht / PDF» offen
  const [streckeAuf, setStreckeAuf] = useState(false)                 // Strecken-Leiste: Abschnitte aufgeklappt
  const sectionsRef = useRef(sections); sectionsRef.current = sections
  // Akkordeon (seit 22.10.2026): einen Abschnitt öffnen schliesst die anderen; vorher waren alle offen (16 000 px Seite)
  const oeffnen = (id: number) => setZuSec(new Set(sectionsRef.current.filter(s => s.id !== id).map(s => s.id)))
  const klappen = (id: number) => { if (zuSec.has(id)) oeffnen(id); else setZuSec(z => new Set([...z, id])) }
  // Abschnitt im Panel zeigen: öffnen und hinscrollen (Klick auf die Nummer auf der Karte, Sprung aus der Strecken-Leiste)
  const zumAbschnitt = useCallback((idx: number) => {
    const s = sectionsRef.current[idx]
    if (!s) return
    setZuSec(new Set(sectionsRef.current.filter(x => x.id !== s.id).map(x => x.id)))
    setTimeout(() => document.getElementById('sec-' + idx)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }, [])
  const markerKlick = useCallback((num: number) => zumAbschnitt(num - 1), [zumAbschnitt])
  const tabSetzen = (id: number, t: 'bewerten' | 'planen') =>
    setPlanTab(p => { const n = new Set(p); if (t === 'planen') n.add(id); else n.delete(id); return n })
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
      // Autoparkierung (für Trottoirniveau, Tiefe, versetzt) getrennt von den Velo- und Motorradfeldern (Platzbedarf, seit 23.10.2026)
      const auto = (park ?? []).filter(f => !f.zweirad)
      const zweirad = zweiradJeSeite(achsen, flaechen, park ?? [])
      const pt = parkierungAufTrottoir(achsen, flaechen, auto)   // Parkierung auf der Trottoirfläche je Seite
      const tiefe = parkierungTiefe(achsen, auto)                 // Tiefe und Anordnung der Parkierung je Seite
      // Trottoir mit Parkierung darauf darf um die Parktiefe breiter sein als die Grenze für Plätze (Neubrückstrasse)
      const tr = trottoirbreiten(achsen, flaechen, kanten, { links: pt.links ? (tiefe.links?.tiefe ?? 2) + 0.5 : 0, rechts: pt.rechts ? (tiefe.rechts?.tiefe ?? 2) + 0.5 : 0 })
      const versetzt = parkierungVersetzt(achsen, auto, tiefe)          // Parkierung abwechselnd A und B
      const insel = mittelinsel(achsen, flaechen, kanten)              // Mittelinsel (kurze Insel, auch Schutzinsel)
      // Haltestelleninsel (Wartebereich mit Veloumfahrung bzw. Fahrspur dahinter), nur mit Haltestelle im Abschnitt
      const hsi = hatHaltestelle(s) ? await haltestelleninselMitOsm(s, achsen, flaechen, kanten) : null
      // lange Insel ohne Haltestelle: Mittelstreifen, trennt zwei Fahrbahnteile (nur Hinweis)
      const streifen = hsi ? null : mittelstreifen(achsen, flaechen, kanten)
      const fb = Number.isFinite(s.fahrbahnbreite) ? null : fahrbahnbreite(achsen, flaechen, kanten)
      const netz = await netzLaden
      setSections(prev => prev.map(x => {
        if (x.id !== secId) return x
        let neu: Section = { ...x, trottoir: { a: tr.rechts ?? NaN, b: tr.links ?? NaN,
          ...(pt.rechts && tr.rechts != null ? { parkA: true } : {}), ...(pt.links && tr.links != null ? { parkB: true } : {}),
          ...(tr.gruen?.rechts != null ? { gruenA: tr.gruen.rechts } : {}), ...(tr.gruen?.links != null ? { gruenB: tr.gruen.links } : {}) } }
        if (fb) { neu.fahrbahnbreite = Math.round(fb.median * 10) / 10; neu.quelle = { ...x.quelle, fahrbahnbreite: 'av' } }
        neu.mittelinsel = insel
        neu.mittelstreifen = streifen ? { ...streifen, seite: streifen.seite === 'rechts' ? 'a' : 'b' } : null
        // paralleler Radweg auf der Trottoirfläche: die Ausgangslage zieht ihn vom Trottoir ab (parallelwege.ts)
        for (const seite of ['a', 'b'] as const) {
          const wid = x.parallelWeg?.[seite]
          const geom = wid != null ? candsRef.current.find(c => c.wayId === wid)?.geom : undefined
          if (geom && neu.trottoir) neu.trottoir = { ...neu.trottoir, [seite === 'a' ? 'wegA' : 'wegB']: wegAufTrottoir(geom.map(g => zuLv95(g.lat, g.lon)), flaechen) }
        }
        if (tiefe.links || tiefe.rechts) neu.parkTiefe = { ...(tiefe.rechts ? { a: tiefe.rechts } : {}), ...(tiefe.links ? { b: tiefe.links } : {}) }
        if (versetzt) neu.parkVersetzt = versetzt === 'rechts' ? 'a' : 'b'
        else delete neu.parkVersetzt
        if (zweirad.links || zweirad.rechts) neu.zweirad = { ...(zweirad.rechts ? { a: zweirad.rechts } : {}), ...(zweirad.links ? { b: zweirad.links } : {}) }
        else delete neu.zweirad
        if (netz) neu.fussnetzGeoportal = netz.netz
        if (hsi) neu = haltestelleninselUebernehmen(neu, hsi, city, !!fb || x.quelle.fahrbahnbreite === 'av')
        if (x.aufteilung && JSON.stringify(x.aufteilung) === JSON.stringify(startAufteilung(x, city, cityCfg.breiten))) neu.aufteilung = startAufteilung(neu, city, cityCfg.breiten)
        else if (x.aufteilung) {
          neu.aufteilung = mitTrottoirs(x.aufteilung, neu.trottoir!)
          // ein schon gewähltes Netz bleibt; sonst das aus dem Geoportal
          if (netz && !neu.aufteilung.fussnetz) neu.aufteilung = { ...neu.aufteilung, fussnetz: netz.netz, fussnetzQuelle: 'geoportal' }
        }
        return neu
      }))
      const trText = (m: number | null, g?: number | null) => (m != null ? `${numDE(m, 2)} m${g != null ? ` hinter einem Grünstreifen von ${numDE(g, 2)} m` : ''}` : 'keines')
      const aufTr = (ja: boolean, m: number | null) => (ja && m != null ? ' (mit Parkierung auf Trottoirniveau)' : '')
      const pText = (x?: { tiefe: number; art: string; winkel?: number; angenommen?: boolean }, seite?: string) => (x && x.art !== 'laengs'
        ? ` · Parkierung Seite ${seite} ${x.art === 'schraeg' ? `schräg${x.winkel ? ` ${x.winkel}°` : ''}` : x.art === 'quer' ? 'senkrecht' : 'schräg oder senkrecht'} ${numDE(x.tiefe, 2)} m${x.angenommen ? ' (angenommen)' : ''}` : '')
      if (park != null) setMsg(`Amtliche Vermessung${park.length ? ' und Parkfelder' : ''} geladen. Trottoir Seite A ${trText(tr.rechts, tr.gruen?.rechts)}${aufTr(pt.rechts, tr.rechts)}, Seite B ${trText(tr.links, tr.gruen?.links)}${aufTr(pt.links, tr.links)}` +
        `${fb ? `, Fahrbahnbreite ${numDE(Math.round(fb.median * 10) / 10, 1)} m` : ''} (Median der Querschnitte alle 5 m)`
        + `${pText(tiefe.rechts, 'A')}${pText(tiefe.links, 'B')}`
        + `${versetzt ? ` · Parkierung versetzt (abwechselnd Seite A und B; Seite ${versetzt === 'rechts' ? 'A' : 'B'} zählt im Querschnitt nicht)` : ''}`
        + (['rechts', 'links'] as const).map(k => { const z = zweirad[k]; return z ? ` · ${z.art === 'beide' ? 'Velo- und Motorradfelder' : z.art === 'motorrad' ? 'Motorradfelder' : 'Velofelder'} Seite ${k === 'rechts' ? 'A' : 'B'} `
          + `(${numDE(z.tiefe, 2)} m tief, ${Math.round(z.anteil * 100)} % der Länge${z.trottoir ? ', auf dem Trottoir' : ''}; in der Planung als Zweiradabstellplatz)` : '' }).join('')
        + `${streifen ? ` · Mittelstreifen Seite ${streifen.seite === 'rechts' ? 'A' : 'B'} (${numDE(streifen.breite, 2)} m breit, ${streifen.laenge} m lang): die Fahrbahn reicht bis zum Streifen; `
          + (streifen.dahinter < 3 ? `dahinter nur ein Streifen von ${numDE(streifen.dahinter, 1)} m, vermutlich eine Haltestelleninsel mit Veloumfahrung: ÖV-Angebot und Haltestellentyp wählen und die AV neu laden`
            : `dahinter liegt ein zweiter Fahrbahnteil von ${numDE(streifen.dahinter, 1)} m (Gegenfahrbahn oder Tram-/Bustrassee), der nicht zu diesem Abschnitt gehört`) : ''}`
        + `${hsi?.perron ? ` · Perron Seite ${hsi.seite === 'rechts' ? 'A' : 'B'} (Trottoirfläche mit Wartehalle aus OSM): Wartebereich ${numDE(hsi.insel, 2)} m, `
          + `Fahrbahn bis zum Perron ${numDE(hsi.innen, 1)} m; die Strasse dahinter (${numDE(hsi.aussen, 1)} m) gehört nicht zum Abschnitt; Haltestellentyp angenommen, bitte prüfen` : ''}`
        + `${hsi && !hsi.perron ? ` · Haltestelleninsel Seite ${hsi.seite === 'rechts' ? 'A' : 'B'}: Wartebereich ${numDE(hsi.insel, 2)} m, dahinter `
          + `${hsi.aussen < 3 ? 'Veloumfahrung' : 'Fahrspur'} ${numDE(hsi.aussen, 2)} m, Fahrbahn bis zur Insel ${numDE(hsi.innen, 1)} m`
          + `${hsi.wartehalle === 'insel' ? ', Wartehalle auf der Insel (OSM)' : hsi.wartehalle === 'hinten' ? ', Wartehalle hinter der Veloumfahrung (OSM)'
            : hsi.wartehalle === 'keine' ? ', Insel ohne Wartehalle (OSM)' : ''}; Haltestellentyp angenommen, bitte prüfen` : ''}.`, 'ok')
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
    park: planAv.park.map(f => ({ verbot: f.verbot, ...(f.zweirad ? { zweirad: true } : {}), ringe: f.ringe.map(r => r.map(p => zuWgs(p[0], p[1]))) })),
    quelle: [avQuelle(cityCfg.avKanton ?? ''), ...(planAv.park.length && cityCfg.parkierung ? [PARK_QUELLE[cityCfg.parkierung] ?? ''] : [])]
      .filter(Boolean).join(' · '),
  } : null), [planAv, cityCfg.avKanton, cityCfg.parkierung])

  const messungStarten = (secId: number, seite: 'A' | 'B', plan = false, teil?: { ziel: 'plan' | 'heute'; nr?: number }) => {
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
    // Formen, deren Breite die ganze Fläche ist (Velostrasse, Wege): Messart «Ganze Fläche» vorgewählt
    const f = seite === 'A' ? seiteA(sections[idx]) : seiteB(sections[idx])
    const flaeche = FLAECHEN_FORMEN.includes(f.ist as IstFuehrungsform)
    setMessung({ secId, seite, titel: plan ? `Abschnitt ${idx + 1}, Element für Element` : `Abschnitt ${idx + 1}, Seite ${seite}`,
      modus: plan ? 'hand' : flaeche ? 'flaeche' : 'kante', kanten: [], laden: true, punkte: [],
      ...(plan ? { plan: true, teilArt: 'Trottoir' as TeilArt, ziel: teil?.ziel ?? 'plan', teilNr: teil?.nr } : {}) })
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
    if (m.modus === 'flaeche') {
      if (m.laden) return
      const r = messeFlaeche(p, m.kanten)
      setMessung({ ...m, punkte: [], ergebnis: r ? { breite: r.breite, von: r.von, bis: r.bis } : undefined,
        fehler: r ? undefined : `Keine zwei Kanten gefunden: in die Fläche klicken, höchstens ${FANG_M} m von einer Kante, oder mit «Zwei Punkte» messen.` })
    } else if (m.modus === 'kante') {
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
  // Teil für Teil: die Messung als neues Teil anfügen (rechts, Rand der Seite A) oder auf ein bestehendes Teil übertragen
  const messungAlsTeil = (ziel: 'neu' | 'teil') => {
    const m = messungRef.current
    if (!m?.ergebnis || !m.plan) return
    const wert = aufZentimeter(m.ergebnis.breite)
    const neuTeile = (teile: Teil[]) => (ziel === 'neu' ? [...teile, { art: m.teilArt ?? 'Trottoir', breite: wert }]
      : teile.map((t, i) => (i === m.teilNr ? { ...t, breite: wert, angenommen: undefined } : t)))
    setSections(prev => prev.map(s => {
      if (s.id !== m.secId) return s
      if (m.ziel === 'heute') {
        // Querschnitt von heute (wie «Querschnitt am Luftbild · als heute»): Fahrbahn = Summe der Fahrbahnteile, Rest ausserhalb
        const basis = s.querschnittHeute?.teile ?? startAufteilung(s, city, cityCfg.breiten).teile
        const teile = neuTeile(basis)
        const sum = (ts: Teil[]) => Math.round(ts.reduce((x, t) => x + (Number.isFinite(t.breite) ? t.breite : 0), 0) * 100) / 100
        const fahrbahn = sum(teile.filter(istFahrbahnTeil)), seitenraum = sum(teile.filter(t => !istFahrbahnTeil(t)))
        const unveraendert = !!s.aufteilung && JSON.stringify(s.aufteilung) === JSON.stringify(startAufteilung(s, city, cityCfg.breiten))
        const neu: Section = { ...s, querschnittHeute: { teile, fahrbahn, seitenraum } }
        delete neu.gesamtbreite
        if (fahrbahn > 0) { neu.fahrbahnbreite = fahrbahn; neu.quelle = { ...s.quelle, fahrbahnbreite: 'gemessen' } }
        if (!s.aufteilung || unveraendert) neu.aufteilung = startAufteilung(neu, city, cityCfg.breiten)
        return neu
      }
      const a = s.aufteilung ?? startAufteilung(s, city, cityCfg.breiten)
      return { ...s, aufteilung: { ...a, teile: neuTeile(a.teile) } }
    }))
    setMessung({ ...m, punkte: [], ergebnis: undefined })
    const wohin = m.ziel === 'heute' ? 'im Querschnitt von heute' : 'in der Planung'
    setMsg(ziel === 'neu' ? `${numDE(wert, 2)} m als «${TEIL_LABEL[m.teilArt ?? 'Trottoir']}» ${wohin} angefügt; weiter messen oder «Fertig».`
      : `${numDE(wert, 2)} m auf Element ${(m.teilNr ?? 0) + 1} ${wohin} übertragen; weiter messen oder «Fertig».`, 'ok')
  }
  const messungUebernehmen = () => {
    const m = messungRef.current
    if (!m?.ergebnis) return
    // Velostrasse: die Breite ist das Fahrband ohne Parkierung (Q 9) → je Seite mit Parkierung 1,90 m weg
    const s = sections.find(x => x.id === m.secId)
    const f = s && (m.seite === 'A' ? seiteA(s) : seiteB(s))
    const parkWeg = m.modus === 'flaeche' && s && f?.ist === 'Velostrasse'
      ? 1.9 * ([seiteA(s), ...(s.richtung === 'beide' ? [seiteB(s)] : [])].filter(x => x.parkenRechts === 'ja').length) : 0
    const wert = aufZentimeter(Math.max(0, m.ergebnis.breite - parkWeg))
    setSections(prev => prev.map(s => (s.id === m.secId ? setzeGemesseneBreite(s, m.seite, wert) : s)))
    setMessung(null)
    setMsg(`Breite ${numDE(wert, 2)} m gemessen (${m.titel})${parkWeg ? `, ohne Parkierung ${numDE(parkWeg, 2)} m` : ''}.`, 'ok')
  }
  // Für die Karte: Kanten nur bei neuem Ausschnitt umrechnen (viele tausend Strecken).
  // ── Querschnitt am Luftbild aufnehmen (querschnittAufnahme.ts, seit 20.10.2026) ──────────────────────────────
  // Quer über die Strasse von Rand B nach Rand A klicken; jedes Stück wird ein Teil (Art vorbelegt nach der AV).
  // «Als heute» ersetzt die gemessene Ausgangslage (Section.querschnittHeute), «In die Planung» die Teile der Planung.
  const [qsa, setQsa] = useState<QsAufnahme | null>(null)
  const qsaRef = useRef<QsAufnahme | null>(null)
  qsaRef.current = qsa
  const qsStarten = async (secId: number) => {
    const map = mapRef.current, s = sections.find(x => x.id === secId)
    if (!map || !s) return
    setTeilModus(false); setMessung(null)
    abschnittInsBild(map, s)
    const idx = sections.findIndex(x => x.id === secId)
    setQsa({ secId, titel: `Abschnitt ${idx + 1}`, achsen: avAchsen(s, true), flaechen: [], laden: true, lagen: [], klicks: [], arten: [],
      haltestelle: s.oevAngebot !== 'keine', ziel: 'heute' })
    if (planAv?.secId !== secId) void planAvZeigen(secId)
    try {
      const { flaechen } = await avFuerAbschnitt(s)
      setQsa(q => (q && q.secId === secId ? { ...q, flaechen, laden: false } : q))
    } catch (err) {
      setQsa(q => (q && q.secId === secId ? { ...q, laden: false, fehler: `Amtliche Vermessung: ${(err as Error).message}. Ohne sie rasten die Punkte nicht ein.` } : q))
    }
  }
  const qsKlick = (lat: number, lon: number) => {
    const q = qsaRef.current, map = mapRef.current
    if (!q || !map) return
    const p = zuLv95(lat, lon)
    const linie = q.linie ?? querLinie(q.achsen, p) ?? undefined
    if (!linie) return
    // Fangradius: FANG_PX Bildschirmpunkte beim aktuellen Zoom, höchstens QS_FANG_MAX_M (wie fgsCheck)
    const pt = map.latLngToContainerPoint([lat, lon]), q2 = map.containerPointToLatLng([pt.x + QS_FANG_PX, pt.y])
    const radius = Math.min(QS_FANG_MAX_M, map.distance([lat, lon], q2))
    const roh = (p[0] - linie.c[0]) * linie.r[0] + (p[1] - linie.c[1]) * linie.r[1]
    const grenzen = q.grenzen ?? grenzenAufLinie(linie.c, linie.r, q.flaechen)
    const t = fangeLage(roh, grenzen, radius)
    if (q.lagen.some(x => Math.abs(x - t) < 0.02)) return
    const lagen = [...q.lagen]
    let k = lagen.findIndex(x => x > t)
    if (k < 0) k = lagen.length
    lagen.splice(k, 0, t)
    // Arten je Stück: ein neuer Punkt teilt ein Stück (die Wahl bleibt links) oder hängt eines an
    const arten = [...q.arten]
    if (lagen.length >= 2) {
      if (k === 0) arten.unshift(undefined)
      else if (k === lagen.length - 1) arten.push(undefined)
      else arten.splice(k - 1, 1, arten[k - 1], undefined)
    }
    setQsa({ ...q, linie, grenzen, lagen, arten, klicks: [...q.klicks, t] })
  }
  const qsKlickRef = useRef(qsKlick)
  qsKlickRef.current = qsKlick
  const qsZurueck = () => {
    const q = qsaRef.current
    if (!q || !q.klicks.length) return
    const t = q.klicks[q.klicks.length - 1], k = q.lagen.indexOf(t)
    const lagen = q.lagen.filter((_, i) => i !== k), arten = [...q.arten]
    if (k === 0) arten.shift(); else if (k === q.lagen.length - 1) arten.pop(); else arten.splice(k - 1, 2, arten[k - 1])
    setQsa({ ...q, lagen, arten, klicks: q.klicks.slice(0, -1), ...(lagen.length ? {} : { linie: undefined, grenzen: undefined }) })
  }
  // Art eines Stücks: gewählt, sonst nach der AV-Fläche unter seiner Mitte
  const qsArt = (q: QsAufnahme, i: number): QsArt => {
    if (q.arten[i]) return q.arten[i]!
    if (!q.linie) return 'Fahrspur'
    const m = (q.lagen[i] + q.lagen[i + 1]) / 2
    return artVorschlag(avArtAn([q.linie.c[0] + q.linie.r[0] * m, q.linie.c[1] + q.linie.r[1] * m], q.flaechen), q.haltestelle)
  }
  const qsUebernehmen = (ziel: 'heute' | 'plan' | 'beides') => {
    const q = qsaRef.current
    if (!q || q.lagen.length < 2) return
    const r = aufnahmeTeile(q.lagen, q.lagen.slice(1).map((_, i) => qsArt(q, i)))
    const nurGesamt = !r.teile.length && r.gesamt != null
    setSections(prev => prev.map(s => {
      if (s.id !== q.secId) return s
      const neu: Section = { ...s }
      const unveraendert = !!s.aufteilung && JSON.stringify(s.aufteilung) === JSON.stringify(startAufteilung(s, city, cityCfg.breiten))
      if (ziel !== 'plan') {
        if (nurGesamt) neu.gesamtbreite = r.gesamt   // nur das Mass: die Teile von heute bleiben, der Rest gilt ausserhalb
        else {
          neu.querschnittHeute = { teile: r.teile, fahrbahn: r.fahrbahn, seitenraum: r.seitenraum }
          delete neu.gesamtbreite
          if (r.fahrbahn > 0) { neu.fahrbahnbreite = r.fahrbahn; neu.quelle = { ...s.quelle, fahrbahnbreite: 'gemessen' } }
        }
      }
      if (ziel !== 'heute') {
        const a0 = s.aufteilung ?? startAufteilung(neu, city, cityCfg.breiten)
        neu.aufteilung = nurGesamt
          ? { ...a0, seitenraum: Number.isFinite(a0.fahrbahn) ? Math.max(0, Math.round((r.gesamt! - a0.fahrbahn) * 100) / 100) : a0.seitenraum }
          : { ...a0, fahrbahn: r.fahrbahn, teile: r.teile.map(t => ({ ...t })), seitenraum: r.seitenraum }
      } else if (!s.aufteilung || unveraendert) neu.aufteilung = startAufteilung(neu, city, cityCfg.breiten)
      return neu
    }))
    setQsa(null)
    const wohin = ziel === 'heute' ? 'als heute' : ziel === 'plan' ? 'in die Planung' : 'als heute und in die Planung'
    setMsg(nurGesamt
      ? `Ganzer Querschnitt ${numDE(r.gesamt!, 2)} m übernommen (${q.titel}, ${wohin}): die Breite ausserhalb der Fahrbahn ist der Rest bis dahin.`
      : `Querschnitt am Luftbild übernommen (${q.titel}, ${wohin}): ${r.teile.length} Elemente, Fahrbahn ${numDE(r.fahrbahn, 2)} m, `
        + `ausserhalb ${numDE(r.seitenraum, 2)} m${r.gesamt != null ? ` (bis zum ganzen Querschnitt ${numDE(r.gesamt, 2)} m)` : ''}.`, 'ok')
  }
  useEffect(() => {
    if (!qsa) return
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setQsa(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [qsa != null])   // eslint-disable-line react-hooks/exhaustive-deps
  const qsAnzeige: MessAnzeige | null = useMemo(() => {
    if (!qsa || !qsa.linie) return qsa ? { kanten: [], punkte: [] } : null
    const { c, r } = qsa.linie
    const w = (t: number) => zuWgs(c[0] + r[0] * t, c[1] + r[1] * t)
    return { kanten: [], punkte: [], quer: { punkte: qsa.lagen.map(w),
      marken: qsa.lagen.slice(1).map((t, i) => ({ p: w((qsa.lagen[i] + t) / 2), text: `${i + 1} · ${numDE(t - qsa.lagen[i], 2)}` })) } }
  }, [qsa])

  const messKantenWgs = useMemo(() => (messung?.kanten ?? []).map(k => [zuWgs(k.a[0], k.a[1]), zuWgs(k.b[0], k.b[1])]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messung?.kanten])
  const messAnzeige: MessAnzeige | null = useMemo(() => {
    if (!messung) return null
    const w = (p: P) => zuWgs(p[0], p[1])
    const erg = messung.ergebnis
    return {
      kanten: messKantenWgs,   // auch bei «Zwei Punkte» sichtbar (Nutzerwunsch 20.10.2026)
      punkte: messung.modus === 'hand' && !erg ? messung.punkte.map(w) : [],
      ...(erg ? { linie: [w(erg.von), w(erg.bis)] as [{ lat: number; lon: number }, { lat: number; lon: number }],
                  label: `${numDE(erg.breite, 2)} m` } : {}),
    }
  }, [messung, messKantenWgs])

  const linieGeklickt = useCallback((id: number, lat: number, lon: number) => {
    if (qsaRef.current) qsKlickRef.current(lat, lon)         // Querschnitt am Luftbild: Klick gilt der Aufnahme
    else if (messungRef.current) messKlickRef.current(lat, lon)   // Breitenmessung: Klick gilt der Messung
    else if (teilModusRef.current) void teilenRef.current(id, lat, lon)
    else toggleCand(id)
  }, [toggleCand])

  // Weg 3: Klick auf die Karte → nächstes Segment laden, anreichern und hinzufügen.
  // Wie beim Strassen-/Ausschnitt-Laden mit den Stadt-Daten + OpenBikeSensor anreichern
  // (Klick ist der Hauptweg zum Strecken-Aufbau, daher müssen DTV/Tempo/Routentyp/OBS auch hier kommen).
  const klickHinzufuegen = async (lat: number, lon: number) => {
    if (qsaRef.current) { qsKlickRef.current(lat, lon); return }
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
    // parallele Wege (Radweg neben der Strasse) der Strasse zuordnen statt eigener Abschnitte (parallelwege.ts)
    const mit = mitParallelen(cands)
    const zu = mit.filter(c => !c.selected && cands.find(x => x.id === c.id)?.selected)
    setCands(mit)
    const neu = candsToSections(mit, city)
    setSections(neu)
    setZuSec(new Set(neu.slice(1).map(s => s.id)))   // nur der erste Abschnitt offen (Akkordeon)
    // Im Planmodus bleiben (Nutzerbefund 22.10.2026: nach dem Übernehmen aus dem Hinweis der Planung landete man in
    // «Bewerten»): alle neuen Abschnitte auf den Reiter «Planen», im ersten die Planung anlegen (nach dem Rendern,
    // damit planungStarten die neuen Abschnitte sieht)
    const planen = hauptAnsicht === 'planen' || planTab.size > 0
    setPlanTab(planen ? new Set(neu.map(s => s.id)) : new Set())
    if (planen) setTimeout(() => planungStarten(0), 0)
    setMsg(`${segmente(selCount - zu.length)} übernommen → geordnet und zusammengefasst. ` +
      (zu.length ? `${zu.length === 1 ? 'Ein paralleler Weg' : `${zu.length} parallele Wege`} (${zu.map(c => `OSM way ${c.wayId}`).join(', ')}) als Veloführung der Strasse daneben übernommen, nicht als eigener Abschnitt. ` : '') +
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
  // Strecke mit der Planung: je Abschnitt die Note der Planung, wo es eine gibt, sonst die von heute
  // (null, solange ein Abschnitt unvollständig ist oder es keine Planung gibt). In der Strecken-Leiste.
  const planNoten = sections.map((s, i) => s.aufteilung ? bewerteAufteilung(s, s.aufteilung, city, cityCfg.breiten).note : ergebnisse[i].note)
  const streckePlanNote = sections.some(s => s.aufteilung) && planNoten.every(n => n != null)
    ? Math.min(...planNoten.map(n => n!)) : null

  // ── Hauptfunktionen im Kopf (seit 22.10.2026, Nutzerwunsch): Bewerten | Planen und Bericht / PDF ──
  // Vorher stand dort «Anzeige: Schulnote | Erfüllungsgrad»; die Planung war nur im Reiter jedes Abschnitts
  // zu finden und «Bericht / PDF» nur in der Werkzeugleiste einer Planung.
  // «Planen» stellt alle Abschnitte auf den Reiter «Planen», öffnet den massgebenden (sonst den ersten) und legt
  // dort die Planung an, genau wie ein Klick auf seinen Reiter. «Bewerten» stellt alle zurück.
  const planungStarten = (idx: number) => {
    const s = sectionsRef.current[idx]
    if (!s || !cityCfg.aufteilung) return
    if (!s.aufteilung) {
      update(s.id, { aufteilung: startAufteilung(s, city, cityCfg.breiten) })
      if (cityCfg.avKanton && s.candIds?.length) void planAvZeigen(s.id)
    }
    setPlanTab(p => new Set([...p, s.id]))
    zumAbschnitt(idx)
  }
  const hauptAnsichtSetzen = (t: 'bewerten' | 'planen') => {
    setHauptAnsicht(t)
    setBerichtWahl(false)
    setPlanTab(t === 'planen' ? new Set(sections.map(s => s.id)) : new Set())
    if (t === 'planen' && sections.length > 0) planungStarten(worstIdx >= 0 ? worstIdx : 0)
  }
  // «Bericht / PDF»: der Bericht zeigt eine Planung. Mit genau einer öffnet er sie, sonst klappt darunter eine Wahl
  // auf (mehrere Planungen: welcher Abschnitt; keine: Hinweis und Knopf, der die Planung beginnt).
  const mitPlanung = sections.map((s, i) => ({ s, i })).filter(x => x.s.aufteilung)
  const berichtOeffnen = (secId: number) => {
    const s = sections.find(x => x.id === secId)
    setBerichtWahl(false)
    if (s && cityCfg.avKanton && s.candIds?.length && planAv?.secId !== s.id) void planAvZeigen(s.id)
    setBerichtSec(secId)
  }

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
         style={{ fontFamily: 'system-ui, -apple-system, sans-serif', color: 'var(--text-strong)',
                  ...(view === 'rechner' ? { '--vrc-panel-w': `${panelW}px` } as React.CSSProperties : {}) }}>
      {/* Keine Kopfleiste (Standard der Check-Apps seit 16.10.2026): Logo, Name und Marke stehen im Panel bzw. auf der Startseite */}

      {view === 'home' && <Landing onStart={() => go('rechner')} />}

      {/* Rechner: schmal einspaltig (max. 820 px, wie bisher); ab BREIT_MQ zweispaltig —
          Karte links in voller Höhe, rechts das Panel mit eigenem Scrollen. Beide Layouts
          haben dieselbe Elementstruktur, nur das CSS unterscheidet sich (index.css). */}
      {view === 'rechner' && (
      <div className="vrc-rechner">
      {/* Trenner zwischen Karte und Panel (nur Breitbild, index.css): ziehen, Pfeiltasten, Doppelklick = Standard */}
      <div className="vrc-trenner" role="separator" aria-orientation="vertical" aria-label="Breite des Eingabebereichs"
           aria-valuemin={Math.round(panelMin)} aria-valuemax={Math.round(panelMax)} aria-valuenow={panelW} tabIndex={0}
           title="Ziehen: Eingabebereich breiter oder schmaler · Doppelklick: Standardbreite"
           onPointerDown={trennerZiehen} onDoubleClick={() => panelSetzen(undefined, true)}
           onKeyDown={e => {
             if (e.key === 'ArrowLeft') { e.preventDefault(); panelSetzen(panelW + 40, true) }
             if (e.key === 'ArrowRight') { e.preventDefault(); panelSetzen(panelW - 40, true) }
           }} />
      <div className="vrc-panel" style={{ padding: '20px 16px 64px' }}>
        <h1 className="vrc-h1">
          <button className="logo-knopf" onClick={() => go('home')} title="Zur Startseite" aria-label="Zur Startseite">
            <img src={import.meta.env.BASE_URL + 'logo.svg'} alt="" width={36} height={36} />
          </button>
          VeloroutenCheck <span className="marke">Beta</span>
        </h1>
        <SoFunktionierts />

      {/* Hauptfunktionen (seit 22.10.2026, Nutzerwunsch): Bewerten | Planen und Bericht / PDF. Ersetzt den Schalter
          «Anzeige: Schulnote | Erfüllungsgrad»; der Erfüllungsgrad steht seither überall vorne, die Note dahinter. */}
      {cityCfg.aufteilung && (
        <div className="vrc-haupt">
          <div className="vrc-haupt-wahl" role="group" aria-label="Hauptfunktion">
            <button type="button" aria-pressed={hauptAnsicht === 'bewerten'} onClick={() => hauptAnsichtSetzen('bewerten')}
                    title="Alle Abschnitte mit Eingaben und Beurteilung zeigen">
              Bewerten
            </button>
            <button type="button" aria-pressed={hauptAnsicht === 'planen'} onClick={() => hauptAnsichtSetzen('planen')}
                    title="Den Querschnitt neu aufteilen und prüfen; beginnt beim massgebenden Abschnitt">
              Planen
            </button>
          </div>
          <button type="button" className="vrc-haupt-bericht" aria-expanded={mitPlanung.length === 1 ? undefined : berichtWahl}
                  onClick={() => (mitPlanung.length === 1 ? berichtOeffnen(mitPlanung[0].s.id) : setBerichtWahl(w => !w))}
                  title="Bericht einer Planung als Druckansicht; als PDF über den Druckdialog des Browsers">
            Bericht / PDF
          </button>
        </div>
      )}
      {berichtWahl && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: '#f0fdfa', border: '1px solid #99f6e4', fontSize: 13 }}>
          {mitPlanung.length === 0 ? (
            <>
              <div>
                Der Bericht zeigt eine Planung: den Querschnitt heute und geplant, die Prüfung der Masse und die Beurteilung
                vorher und nachher. Noch hat kein Abschnitt eine Planung.
              </div>
              {sections.length > 0 && (
                <button type="button" onClick={() => hauptAnsichtSetzen('planen')}
                        style={{ marginTop: 8, border: 'none', background: 'var(--accent)', color: '#fff', borderRadius: 8,
                                 padding: '7px 12px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                  Planung für Abschnitt {(worstIdx >= 0 ? worstIdx : 0) + 1} beginnen
                </button>
              )}
            </>
          ) : (
            <>
              <div>Bericht für:</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {mitPlanung.map(({ s, i }) => (
                  <button key={s.id} type="button" onClick={() => berichtOeffnen(s.id)}
                          style={{ ...kleinKnopfStyle, borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                    Abschnitt {i + 1}{s.label ? ` · ${s.label}` : ''}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {/* Sticky Ergebnis-Leiste: Strecken-Beurteilung jederzeit sichtbar (Punkt 1). Klick springt zum massgebenden
          bzw. ersten unvollständigen Abschnitt. Seit 22.10.2026 die einzige Strecken-Anzeige: «Abschnitte» klappt die
          Beurteilung jedes Abschnitts auf (vorher ein zweiter Strecken-Kasten über der Abschnittsliste), und mit einer
          Planung steht dahinter die Strecke mit der Planung. */}
      {/* zIndex bewusst klein: der Karten-Wrapper isoliert Leaflet (eigener Stacking-Context,
          s. unten) — so muss die Sticky-Leiste native Dropdowns/Popover nicht mehr überbieten. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, marginBottom: 18, background: sc.bg, color: sc.fg,
                    borderRadius: 10, boxShadow: '0 2px 10px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 16px' }}>
          <button
            onClick={() => {
              const ziel = streckeNote != null ? worstIdx : ergebnisse.findIndex(e => e.note == null)
              if (ziel >= 0) zumAbschnitt(ziel)
            }}
            title={streckeNote != null ? 'Zum massgebenden Abschnitt springen'
                                       : 'Zum ersten unvollständigen Abschnitt springen'}
            style={{ textAlign: 'left', border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', padding: 0,
                     font: 'inherit', display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                           textTransform: 'uppercase', opacity: 0.85 }}>Strecke</span>
            <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>
              {streckeNote == null ? '–' : <Beurteilung note={streckeNote} />}
            </span>
            <span style={{ fontSize: 13, opacity: 0.95 }}>
              {streckeNote != null
                ? `· massgebend: Abschnitt ${worstIdx + 1}`
                : `· unvollständig (${offen} von ${ergebnisse.length} offen)`}
            </span>
          </button>
          {streckePlanNote != null && (
            <span style={{ fontSize: 13 }}>→ mit der Planung: <strong><Beurteilung note={streckePlanNote} /></strong></span>
          )}
          <span style={{ flex: 1 }} />
          {sections.length > 1 && (
            <button type="button" aria-expanded={streckeAuf} onClick={() => setStreckeAuf(a => !a)}
                    style={{ border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', padding: 0,
                             font: 'inherit', fontSize: 12.5, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 2 }}>
              {streckeAuf ? 'Abschnitte ▴' : 'Abschnitte ▾'}
            </button>
          )}
        </div>
        {streckeAuf && sections.length > 1 && (
          <div style={{ padding: '0 16px 10px', fontSize: 12.5 }}>
            <div style={{ opacity: 0.95 }}>Die Strecke ist so gut wie ihr schlechtester Abschnitt. Ein Klick öffnet den Abschnitt.</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {ergebnisse.map((e, i) => (
                <button key={sections[i].id} type="button" onClick={() => { setStreckeAuf(false); zumAbschnitt(i) }}
                        style={{ border: '1px solid rgba(255,255,255,0.7)', borderRadius: 6, padding: '2px 8px', fontSize: 12,
                                 fontWeight: 700, cursor: 'pointer',
                                 background: e.note != null ? noteColor(e.note).bg : '#ffedd5',
                                 color: e.note != null ? noteColor(e.note).fg : '#9a3412' }}>
                  {i + 1} · {e.note != null ? <Beurteilung note={e.note} /> : 'Eingabe nötig'}
                </button>
              ))}
            </div>
          </div>
        )}
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
                     teilModus={teilModus} orthofoto={messAktiv || planAv != null || qsa != null} messung={messAnzeige ?? qsAnzeige} av={planAvWgs} formen={formen}
                     onMeldung={(t, art) => setMsg(t, art)} onMarkerClick={markerKlick} />
            {/* Kartenkopf: Stadt und Strassensuche (während einer Messung steht dort deren Werkzeugleiste) */}
            {!messung && !qsa && (
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
              <Kartenleiste titel={`📏 ${messung.plan ? 'Element für Element messen' : 'Breite messen'} · ${messung.titel}`}
                            onSchliessen={() => setMessung(null)} quelle={avQuelle(cityCfg.avKanton ?? '')}>
                <div role="group" aria-label="Messart"
                     style={{ display: 'inline-flex', flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 8,
                              overflow: 'hidden', marginBottom: 6 }}>
                  {([['kante', 'Ab Bordsteinkante (AV)'], ['flaeche', 'Ganze Fläche'], ['hand', 'Zwei Punkte']] as const).map(([m, label]) => (
                    <button key={m} type="button" aria-pressed={messung.modus === m}
                            onClick={() => setMessung({ ...messung, modus: m, punkte: [], ergebnis: undefined,
                              fehler: m !== 'hand' && !messung.laden && messung.kanten.length === 0 ? messung.fehler : undefined })}
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
                    : messung.modus === 'flaeche'
                    ? 'In die Fläche klicken (Velostrasse, Weg): gemessen wird rechtwinklig von der nächsten Kante bis zur gegenüberliegenden (orange). Bei der Velostrasse zählt die Parkierung nicht mit.'
                    : 'Weit hineinzoomen, zuerst die Bordsteinkante und dann die Markierung anklicken.'}
                </div>
                <div style={{ marginTop: 6, fontWeight: 600, color: messung.fehler ? '#b91c1c' : 'var(--text-strong)' }}>
                  {messung.modus !== 'hand' && messung.laden ? 'Lade Bordsteinkanten …'
                    : messung.fehler ?? (messung.ergebnis ? `Breite: ${numDE(messung.ergebnis.breite, 2)} m`
                      : messung.modus === 'hand' && messung.punkte.length === 1 ? 'Jetzt die Markierung anklicken.' : 'Noch nicht gemessen.')}
                </div>
                {messung.plan ? (() => {
                  const sec = sections.find(s => s.id === messung.secId)
                  const teile = (messung.ziel === 'heute' ? (sec?.querschnittHeute?.teile ?? (sec ? startAufteilung(sec, city, cityCfg.breiten).teile : [])) : sec?.aufteilung?.teile) ?? []
                  const kann = !!messung.ergebnis
                  return (
                    <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                      <div role="group" aria-label="Ziel" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span>Ziel:</span>
                        <span style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                          {([['plan', 'Planung'], ['heute', 'Heute (Ausgangslage)']] as const).map(([z, label]) => (
                            <button key={z} type="button" aria-pressed={(messung.ziel ?? 'plan') === z} onClick={() => setMessung({ ...messung, ziel: z, teilNr: 0 })}
                                    style={{ border: 'none', padding: '4px 9px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                                             background: (messung.ziel ?? 'plan') === z ? 'var(--accent)' : '#fff', color: (messung.ziel ?? 'plan') === z ? '#fff' : 'var(--text)' }}>
                              {label}
                            </button>
                          ))}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span>Als neues Element:</span>
                        <select value={messung.teilArt ?? 'Trottoir'} aria-label="Art des neuen Elements" style={{ ...selectStyle, flex: '1 1 160px', minWidth: 0 }}
                                onChange={e => setMessung({ ...messung, teilArt: e.target.value as TeilArt })}>
                          <TeilOptionen />
                        </select>
                        <button type="button" onClick={() => messungAlsTeil('neu')} disabled={!kann}
                                style={{ border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 12.5, fontWeight: 600,
                                         background: kann ? 'var(--accent)' : 'var(--text-faint)', color: '#fff', cursor: kann ? 'pointer' : 'default' }}>
                          Anfügen
                        </button>
                      </div>
                      {teile.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span>Breite auf Element:</span>
                          <select value={messung.teilNr ?? 0} aria-label="Bestehendes Element" style={{ ...selectStyle, flex: '1 1 160px', minWidth: 0 }}
                                  onChange={e => setMessung({ ...messung, teilNr: Number(e.target.value) })}>
                            {teile.map((t, i) => <option key={i} value={i}>{i + 1} · {TEIL_LABEL[t.art]}{Number.isFinite(t.breite) ? ` (${numDE(t.breite, 2)} m)` : ''}</option>)}
                          </select>
                          <button type="button" onClick={() => messungAlsTeil('teil')} disabled={!kann} style={{ ...kleinKnopfStyle, cursor: kann ? 'pointer' : 'default' }}>
                            Übertragen
                          </button>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => setMessung(null)} style={{ ...kleinKnopfStyle, borderColor: 'var(--accent)', color: 'var(--accent)' }}>Fertig</button>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Neue Elemente kommen rechts dazu (Rand der Seite A); in der Liste lassen sie sich verschieben.</span>
                      </div>
                    </div>
                  )
                })() : (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={messungUebernehmen} disabled={!messung.ergebnis}
                          style={{ border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600,
                                   background: messung.ergebnis ? 'var(--accent)' : 'var(--text-faint)', color: '#fff',
                                   cursor: messung.ergebnis ? 'pointer' : 'default' }}>
                    {messung.ergebnis ? `${numDE(aufZentimeter(messung.ergebnis.breite), 2)} m übernehmen` : 'Übernehmen'}
                  </button>
                </div>
                )}
              </Kartenleiste>
            )}
            {/* Querschnitt am Luftbild aufnehmen: Werkzeugleiste auf der Karte */}
            {qsa && (
              <Kartenleiste titel={`📐 Querschnitt am Luftbild · ${qsa.titel}`} breit onSchliessen={() => setQsa(null)}
                            quelle={avQuelle(cityCfg.avKanton ?? '')}>
                <div>
                  Weit hineinzoomen und quer über die Strasse von Rand B nach Rand A klicken (Seite B links, in Fahrtrichtung der Seite A gesehen):
                  an jeder Grenze ein Punkt, etwa Hauswand oder Trottoirrand, Bord, Markierung, Insel, Gleismitte. Die Punkte liegen auf
                  einer Linie quer zur Strasse; nahe einer Kante der amtlichen Vermessung rasten sie dort ein.
                </div>
                {(qsa.laden || qsa.fehler) && (
                  <div style={{ marginTop: 6, fontWeight: 600, color: qsa.fehler ? '#b91c1c' : 'var(--text-strong)' }}>
                    {qsa.fehler ?? 'Lade die amtliche Vermessung …'}
                  </div>
                )}
                {qsa.lagen.length >= 2 && (
                  <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                    {qsa.lagen.slice(1).map((t, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ minWidth: 76, fontVariantNumeric: 'tabular-nums' }}>{i + 1} · {numDE(t - qsa.lagen[i], 2)} m</span>
                        <select value={qsArt(qsa, i)} aria-label={`Art von Stück ${i + 1}`} style={{ ...selectStyle, flex: '1 1 auto', minWidth: 0 }}
                                onChange={e => setQsa({ ...qsa, arten: qsa.arten.map((a, j) => (j === i ? e.target.value as QsArt : a)) })}>
                          <TeilOptionen />
                          <optgroup label="Mass"><option value={GANZ}>Ganzer Querschnitt (nur die Gesamtbreite)</option></optgroup>
                        </select>
                      </div>
                    ))}
                    {(() => {
                      const r = aufnahmeTeile(qsa.lagen, qsa.lagen.slice(1).map((_, i) => qsArt(qsa, i)))
                      return (
                        <div style={{ fontSize: 12, color: 'var(--text-muted-strong)' }}>
                          {r.gesamt != null
                            ? `Ganzer Querschnitt ${numDE(r.gesamt, 2)} m (gemessen)${r.teile.length ? ` · Elemente ${numDE(r.teile.reduce((m, t) => m + t.breite, 0), 2)} m · Fahrbahn ${numDE(r.fahrbahn, 2)} m` : ' · die Elemente bleiben, der Rest gilt ausserhalb der Fahrbahn'}`
                            : `Ganzer Querschnitt ${numDE(qsa.lagen[qsa.lagen.length - 1] - qsa.lagen[0], 2)} m · Fahrbahn ${numDE(r.fahrbahn, 2)} m`}
                        </div>
                      )
                    })()}
                  </div>
                )}
                {qsa.lagen.length < 2 && !qsa.laden && (
                  <div style={{ marginTop: 6, fontWeight: 600 }}>{qsa.lagen.length ? 'Weiter: die nächste Grenze anklicken.' : 'Noch kein Punkt gesetzt.'}</div>
                )}
                <div role="group" aria-label="Ziel" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <span>Ziel:</span>
                  <span style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {([['heute', 'Heute (Ausgangslage)'], ['plan', 'Planung'], ['beides', 'Beides']] as const).map(([z, label]) => (
                      <button key={z} type="button" aria-pressed={qsa.ziel === z} onClick={() => setQsa({ ...qsa, ziel: z })}
                              style={{ border: 'none', padding: '4px 9px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                                       background: qsa.ziel === z ? 'var(--accent)' : '#fff', color: qsa.ziel === z ? '#fff' : 'var(--text)' }}>
                        {label}
                      </button>
                    ))}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button type="button" disabled={qsa.lagen.length < 2} onClick={() => qsUebernehmen(qsa.ziel)}
                          style={{ border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600,
                                   background: qsa.lagen.length >= 2 ? 'var(--accent)' : 'var(--text-faint)', color: '#fff',
                                   cursor: qsa.lagen.length >= 2 ? 'pointer' : 'default' }}>
                    Übernehmen
                  </button>
                  <button type="button" onClick={qsZurueck} disabled={!qsa.klicks.length} style={kleinKnopfStyle}>Letzten Punkt entfernen</button>
                </div>
              </Kartenleiste>
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
              {segmente(selCount)} in Strecke übernehmen
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
                        stadtName={cityCfg.label} rA={rA} rB={rB} achsen={avAchsen(s, true)}
                        routenLabel={Object.fromEntries((cityCfg.routenOptions ?? []).map(o => [o.value, o.label]))}
                        av={mitAv ? planAv!.flaechen : []} park={mitAv ? planAv!.park : []} quellen={quellen}
                        schliessen={berichtSchliessen} />
      })()}

      {/* Abschnitte: Überschrift mit dem Knopf für alle Fahrbahnbreiten (seit 22.10.2026; vorher je Abschnitt) */}
      {(() => {
        const ohne = cityCfg.avKanton ? sections.filter(s => s.candIds?.length && !Number.isFinite(s.fahrbahnbreite)) : []
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '26px 0 12px' }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Abschnitte</h2>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Klick auf die Kopfzeile oder die Nummer auf der Karte öffnet einen Abschnitt.</span>
            <span style={{ flex: 1 }} />
            {ohne.length > 0 && (
              <button type="button" disabled={fbLaden != null} onClick={() => void fahrbahnbreitenAlle(ohne.map(s => s.id))}
                      title="Fahrbahnbreite von Bordstein zu Bordstein aus der amtlichen Vermessung, für alle Abschnitte ohne Breite"
                      style={{ ...kleinKnopfStyle, borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                {fbLaden != null ? 'Ermittle …' : `Fahrbahnbreiten aus AV (${ohne.length} ${ohne.length === 1 ? 'Abschnitt' : 'Abschnitte'})`}
              </button>
            )}
          </div>
        )
      })()}
      {sections.map((s, i) => (
        <div key={s.id} id={'sec-' + i} style={{ scrollMarginTop: 64 }}>
          <SectionCard
            kartenAktionen={s.candIds?.length ? undefined : (
              // Abschnitt ohne Karte (Nutzerbefund 22.10.2026): nach dem Antippen eines Segments war nicht klar, dass es noch
              // übernommen werden muss — die Knöpfe stehen deshalb auch hier, nicht nur unter der Karte
              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, color: 'var(--text)' }}>
                <span>{selCount ? `${segmente(selCount)} auf der Karte gewählt${osmBusy ? ' (lädt noch)' : ''}.` : 'Noch kein Segment gewählt.'}</span>
                <button type="button" onClick={uebernehmen} disabled={selCount === 0 || osmBusy}
                        style={{ border: 'none', background: selCount && !osmBusy ? 'var(--accent)' : 'var(--text-faint)', color: '#fff',
                                 borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: selCount && !osmBusy ? 'pointer' : 'default' }}>
                  {selCount ? `${segmente(selCount)} in Strecke übernehmen` : 'In Strecke übernehmen'}
                </button>
                {cands.length > 0 && (
                  <button type="button" disabled={osmBusy || messAktiv} aria-pressed={teilModus}
                          onClick={() => {
                            if (teilModus) { setTeilModus(false); setMsg('Teilen abgebrochen.', 'info'); return }
                            setTeilModus(true); setMsg('Teilen: auf die Linie tippen, wo sie geteilt werden soll (Esc bricht ab).', 'info')
                          }}
                          style={{ ...kleinKnopfStyle, ...(teilModus ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}) }}>
                    {teilModus ? 'Teilen abbrechen' : '✂ Segment teilen'}
                  </button>
                )}
                {selCount > 0 && <span style={{ color: 'var(--text-muted)' }}>Weitere Segmente antippen, dann übernehmen.</span>}
              </span>
            )}
            index={i} section={s} ergebnis={ergebnisse[i]}
            isWorst={i === worstIdx && sections.length > 1}
            onChange={patch => update(s.id, patch)}
            onTauschen={() => tauschen(s.id)}
            onLuftbild={welche => luftbildAnnehmen(s.id, welche)}
            onMessen={cityCfg.avKanton ? ((seite, plan, teil) => messungStarten(s.id, seite, plan, teil)) : undefined}
            onFahrbahnbreite={cityCfg.avKanton && s.candIds?.length ? (ziel => void fahrbahnbreiteErmitteln(s.id, ziel)) : undefined}
            fbLaden={fbLaden === s.id}
            onBericht={() => setBerichtSec(s.id)}
            zu={zuSec.has(s.id)} onKlappen={() => klappen(s.id)}
            tab={planTab.has(s.id) ? 'planen' : 'bewerten'} onTab={t => tabSetzen(s.id, t)}
            av={cityCfg.avKanton && s.candIds?.length ? {
              gezeigt: planAv?.secId === s.id, laden: planAvLaden === s.id, park: planAv?.secId === s.id && planAv.park.length > 0,
              zeigen: () => void planAvZeigen(s.id), ausblenden: () => setPlanAv(p => (p?.secId === s.id ? null : p)),
            } : undefined}
            onRemove={() => remove(s.id)}
            canRemove={sections.length > 1}
            onHover={h => setHoverSec(h ? s.id : null)}
            breitenQuelle={ist => breitenQuelleFuer(ist, s.routentyp)}
            city={city}
            ort={markers.find(m => m.num === i + 1)}
            laengeM={(s.candIds ?? []).reduce((m, id) => m + (cands.find(c => c.id === id)?.len ?? 0), 0) || undefined}
            onQuerschnitt={cityCfg.avKanton && s.candIds?.length ? () => void qsStarten(s.id) : undefined}
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

      {/* Quellen und Grundlagen je Stadt (seit 23.10.2026, nach dem Muster von fgsCheck; quellen.ts): Vorgaben, Normen,
          Daten mit Link. Die Berner Entscheidungstabellen (Soll-Führungsform, Soll-Haltestellenlösung) standen bis dahin
          hier für alle Städte; sie sind weg, die Soll-Tabellen stehen in den verlinkten Werken (Nutzerentscheid 23.10.2026). */}
      <QuellenTeil city={city} />

      {/* Referenz: Herleitung der Note — eingeklappt, um Scroll zu sparen (Punkt 6).
          id «referenz»: die Herleitung im Ergebnis (zurHerleitung) klappt den Teil auf und springt zu «herleitung-note». */}
      <details id="referenz" className="vrc-klappe" style={{ marginTop: 20 }}>
        <summary style={{ cursor: 'pointer', fontSize: 16, fontWeight: 700, color: 'var(--text)', userSelect: 'none' }}>
          Referenz: Herleitung der Note
        </summary>
        <div style={{ marginTop: 12 }}>
      <HerleitungNote />
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
      {toast && view === 'rechner' && (
        <div className={`vrc-toast ${toast.kind}`} role="status" aria-live="polite" key={toast.key}>
          <span aria-hidden>{toast.kind === 'error' ? '⚠' : toast.kind === 'ok' ? '✓' : 'ℹ'}</span>
          <span className="text">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Meldung schliessen">✕</button>
        </div>
      )}
    </div>
    </AvContext.Provider>
    </AttribContext.Provider>
  )
}

