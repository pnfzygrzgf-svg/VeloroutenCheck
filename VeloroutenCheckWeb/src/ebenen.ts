import { datenStaende, standText } from './datenstand'
import { E6_DIENSTE, e6Legende } from './e5/daten/anbieter/gemeinsam/e6'
// ── Kartenebenen der Vorbelegung (seit 01.11.2026) ───────────────
//
// Was der Rechner aus abrufbaren Quellen vorbelegt, ist auf der Karte als eigene Ebene einblendbar, je Quelle einzeln (Menü
// «Ebenen» neben der Hintergrundwahl; der Browser merkt sich die Wahl). Gezeigt werden die Objekte, die beim Laden gelesen
// wurden (keine neue Abfrage): Linien, Punkte oder Flächen, nach Wert gefärbt, ab NAH_ZOOM mit dem Wert beschriftet. Die
// Ebenen liegen unter den Segmentlinien und sind selbst nicht anklickbar: Ein Klick abseits der Segmente findet sie über den
// Treffertest (VeloMap); die Segmentlinie nennt im Tooltip die übernommenen Werte.
// Plan und Liste aller Ebenen: _lokal/kartenebenen-quellen-plan.md (V1–V17). Gleiche Farbstufen wie fgsCheck/SichtweitenCheck.

import type { LL } from './geo'
import { zuLv95, type P } from './lv95'
import { AUSSCHNITT_ZOOM, BAUZONEN, STRASSENKLASSEN_TLM } from './kartenbaustein/ebenenAusschnitt'
import { AV_LEGENDE } from './e5/daten/anbieter/gemeinsam/avKarte'
import type { KartenObjekt } from './kartenbaustein/modell'
import type { Stadt } from './fuehrungsform'

export type EbeneId = `e6.${string}` | 'velozaehlungen' | 'bav' | 'tramTlm' | 'strasseTlm' | 'bauzonen' | 'npvm' | 'zonen' | 'lsa' | 'routennetz' | 'tempo' | 'dtv' | 'velostrasse' | 'strassentyp' | 'hierarchie' | 'haltestellen' | 'oev' | 'luftbild' | 'obs'
  | 'parkfelder' | 'fussnetz' | 'av' | 'blockmodelle' | 'wartehallen' | 'markierung' | 'steigung' | 'gelaende'
/** Ebenen mit eigener Abfrage (App.tsx): nach dem Übernehmen automatisch, je Abschnitt um seine Segmente (Wartehallen gemeinsam) */
export interface NachladeStand { moeglich: boolean; laufend: Partial<Record<EbeneId, number>> }   // moeglich: es gibt übernommene Abschnitte
export const NACHLADEN: readonly EbeneId[] = ['parkfelder', 'fussnetz', 'wartehallen', 'steigung', 'av', 'blockmodelle']

/** Ein gelesenes Objekt: Linie(n), Punkt oder Fläche, mit Klasse (Farbe), Beschriftung und Tooltip-Text */
export interface EbenenObjekt {
  id: string
  linien?: LL[][]
  punkt?: LL
  ringe?: LL[][]
  klasse: string
  wert?: string            // kurze Beschriftung (z. B. «30», «8 400»)
  text: string             // Tooltip bzw. Beschreibung (Punkte)
  gestrichelt?: boolean    // Ersatzquelle (z. B. OSM statt amtlich) bzw. Zuordnungslinie
  deckkraft?: number       // Füllung einer Fläche (Standard 0,3)
  symbol?: string          // Zeichen eines Punkts, wenn es nicht aus der Legende kommt (z. B. Zählstelle «Z»)
  hoehenprofil?: import('./hoehenprofil/modell').HoehenProfil
}
export type EbenenDaten = Partial<Record<EbeneId, EbenenObjekt[]>>
/** Gemeinsame Form der Kartenebenen (LV95). Die Quellen des VeloroutenCheck lesen in Grad, die Karte zeichnet diese Form */
export type KartenEbenenObjekt = KartenObjekt<import('./hoehenprofil/modell').HoehenProfil>
export type KartenDaten = Partial<Record<EbeneId, KartenEbenenObjekt[]>>
type MitObjekten = Partial<Record<EbeneId, readonly unknown[]>>
const inLv95 = (l: LL): P => zuLv95(l.lat, l.lon)
export function alsKartenObjekt({ linien, punkt, ringe, ...rest }: EbenenObjekt): KartenEbenenObjekt {
  return { ...rest, ...(linien ? { linien: linien.map(l => l.map(inLv95)) } : {}), ...(punkt ? { punkt: inLv95(punkt) } : {}), ...(ringe ? { ringe: ringe.map(r => r.map(inLv95)) } : {}) }
}
export const alsKartenDaten = (d: EbenenDaten): KartenDaten =>
  Object.fromEntries(Object.entries(d).map(([k, liste]) => [k, (liste ?? []).map(alsKartenObjekt)])) as KartenDaten

/** Vom Kartenkontext der anderen Rechner nur das Wegnetz: Beleuchtung und taktile Rillen haben mit Velorouten nichts zu tun */
export const E6_KONTEXT = E6_DIENSTE.filter(d => d.art === 'netz')

export interface EbeneDef {
  id: EbeneId
  titel: string
  kurz: string             // Beschriftung auf schmalen Bildschirmen
  quelle: Partial<Record<Stadt, string>> & { alle?: string }   // Herkunft je Stadt (Tooltip im Menü)
  // symbol: Zeichen im Quadrat der Punkte (Form statt Farbe allein); Punkte der Quellen sind Quadrate,
  // die Abschnitts-Marker Kreise
  legende: [klasse: string, farbe: string, text: string, symbol?: string][]
  legendeNur?: Partial<Record<string, Stadt[]>>   // Legendeneintrag nur in diesen Städten (z. B. Bus-Linien nur Bern)
  staedte?: Stadt[]        // nur dort; fehlt = alle
  standardAn?: boolean
  hinweis?: string         // wann die Ebene Daten hat (z. B. erst nach dem Öffnen der Planung)
}

// Gleiche Stufen in allen drei Rechnern (Plan, Grundsatz 5)
export const TEMPO_FARBEN: [string, string, string][] = [
  ['t20', '#16a34a', '20 km/h und weniger'], ['t30', '#65a30d', '30 km/h'], ['t40', '#ca8a04', '40 km/h'],
  ['t50', '#ea580c', '50 km/h'], ['t60', '#dc2626', '60 km/h und mehr'],
]
export const tempoKlasse = (v: number): string => (v <= 20 ? 't20' : v <= 30 ? 't30' : v <= 40 ? 't40' : v <= 50 ? 't50' : 't60')
export const DTV_FARBEN: [string, string, string][] = [
  ['d2', '#16a34a', 'bis 2 000'], ['d5', '#ca8a04', '2 000–5 000'], ['d10', '#ea580c', '5 000–10 000'],
  ['d20', '#dc2626', '10 000–20 000'], ['d99', '#7f1d1d', 'über 20 000'], ['zuordnung', '#334155', 'Zählstelle → Segment'],
]
export const dtvKlasse = (v: number): string => (v <= 2000 ? 'd2' : v <= 5000 ? 'd5' : v <= 10000 ? 'd10' : v <= 20000 ? 'd20' : 'd99')
const OBS_FARBEN: [string, string, string][] = [
  ['o1', '#dc2626', 'Median unter 1,50 m'], ['o2', '#ea580c', '1,50–2,00 m'], ['o3', '#16a34a', '2,00 m und mehr'],
  ['o0', '#64748b', 'befahren, keine Überholung'],
]
export const obsKlasse = (median: number): string => (!Number.isFinite(median) ? 'o0' : median < 1.5 ? 'o1' : median < 2 ? 'o2' : 'o3')

export const EBENEN: readonly EbeneDef[] = [
  ...E6_KONTEXT.map((d): EbeneDef => ({ id: d.id, titel: d.name, kurz: d.name, quelle: { alle: `${d.anbieter}; ${d.lizenz}; ${d.hinweis}` }, legende: e6Legende(d.art), standardAn: false })),
  {id:'velozaehlungen',titel:'Velozählstellen',kurz:'Velozählung',quelle:{alle:'Amtliche Zählstellen; Messzeitraum und Erfassungsumfang am Objekt; keine Übertragung auf die ganze Strasse'},legende:[['velo','var(--accent)','Velozählstelle','V']]},
  {id:'bav',titel:'Haltestellen BAV',kurz:'BAV',quelle:{alle:'© BAV; Haltestellen und Haltekanten'},legende:[['tram','#b91c1c','Tram','T'],['bus','#1d4ed8','Bus','B'],['bus_tram','#7c3aed','Bus und Tram','H'],['kante','#475569','Haltekante, auch Bahn','K']]},
  {id:'tramTlm',titel:'Tramgleise (swissTLM3D)',kurz:'Tram TLM',quelle:{alle:'© swisstopo; swissTLM3D, keine Ableitung von Haltekanten oder Tram in der Fahrbahn'},legende:[['tram','#dc2626','Tramgleis']]},
  { id: 'gelaende', titel: 'Gelände (Höhenmodell, Profile)', kurz: 'Gelände',
    quelle: { bern: 'DTM 2023 Stadt Bern, bei Ausfall © swisstopo; Höhenprofile zur Längsneigung', alle: '© swisstopo; Höhenprofile zur Längsneigung' },
    legende: [['profil', '#79512e', 'Geländeprofil der Strassenachse']], hinweis: 'keine Sichtprüfung; Höhenschnitt unter Höhenprofile ansehen' },
  {id:'npvm',titel:'Verkehrsmenge (NPVM, modelliert)',kurz:'NPVM',legende:[['modell','#7c3aed','Modellierter DTV; Übernahme bestätigen']],quelle:{alle:'© ARE, NPVM 2023; Modellwerte beider Richtungen, bei getrennten Fahrbahnen je Fahrbahn; keine Verkehrszählung'}},
  {id:'zonen',titel:'Verkehrszonen',kurz:'Zonen',staedte:['zurich','luzern'],legende:[['t30_zone','#eab308','Tempo-30-Zone'],['begegnungszone','#16a34a','Begegnungszone'],['fussgaengerzone','#7c3aed','Fussgängerzone'],['Tempo-30-Zone','#eab308','Tempo-30-Zone'],['Begegnungszone','#16a34a','Begegnungszone'],['Fussgängerzone','#7c3aed','Fussgängerzone'],['offen','#64748b','ungeklärt']],quelle:{zurich:'Stadt Zürich, bestehende Verkehrszonen',luzern:'Stadt Luzern, verkehrsberuhigte Zonen'}},
  {id:'lsa',titel:'Lichtsignale',kurz:'LSA',legende:[['lsa','#b91c1c','Anlagenstandort','L']],quelle:{basel:'Basel-Stadt, Datensatz 100430; Anlagenpunkte, keine Signalgruppen',luzern:'Stadt Luzern, Lichtsignalanlagen; Anlagenpunkte, keine Signalgruppen',zurich:'Stadt Zürich, Verkehrsknoten mit Lichtsignalanlage; Anlagenpunkte, keine Signalgruppen',alle:'Amtliche Inventare (Kanton Zürich, Genf); ohne Dienst am Ort bleibt die Ebene leer; Anlagenpunkte, keine Signalgruppen'},hinweis:`ab Zoomstufe ${AUSSCHNITT_ZOOM} für den Kartenausschnitt`},
  {id:'strasseTlm',titel:STRASSENKLASSEN_TLM.titel,kurz:'Strassen TLM',legende:STRASSENKLASSEN_TLM.legende.map(l=>[...l]) as EbeneDef['legende'],quelle:{alle:'© swisstopo; swissTLM3D, Verkehrsbedeutung; nur Kartenkontext, keine Wirkung auf die Bewertung'},hinweis:`ab Zoomstufe ${AUSSCHNITT_ZOOM} für den Kartenausschnitt`},
  {id:'bauzonen',titel:BAUZONEN.titel,kurz:'Bauzonen',legende:BAUZONEN.legende.map(l=>[...l]) as EbeneDef['legende'],quelle:{alle:'© ARE und Kantone; harmonisierte Bauzonen; nur Kartenkontext, keine Wirkung auf die Bewertung'},hinweis:`ab Zoomstufe ${AUSSCHNITT_ZOOM} für den Kartenausschnitt`},
  { id: 'routennetz', titel: 'Routennetz (gelesen für den Routentyp)', kurz: 'Routen',
    legende: [['Velohauptroute', '#1d4ed8', 'Velohauptroute'], ['Veloroute', '#16a34a', 'Veloroute'], ['ohne', '#94a3b8', 'gelesen, ohne Routentyp']],
    quelle: { bern: 'Geoportal Stadt Bern, Veloroutennetz Masterplan (Feld Veloroutentyp)', zurich: 'Stadt Zürich, Velonetzplanung (Vorzugsroute → Velohauptroute, Hauptnetz → Veloroute)',
      basel: 'Kanton Basel-Stadt, Teilrichtplan Velo 2019 (geltend; Pendler- und Basisrouten → Veloroute)', luzern: 'Stadt Luzern, Velonetz (Velohauptroute → Velohauptroute, Hauptroute → Veloroute)' } },
  { id: 'tempo', titel: 'Tempo', kurz: 'Tempo', legende: TEMPO_FARBEN,
    quelle: { bern: 'Geoportal Stadt Bern, Signalisierte Höchstgeschwindigkeit; gestrichelt OSM maxspeed, wo amtlich nichts liegt',
      basel: 'data.bs.ch 100250 «Strassen und Wege»; gestrichelt OSM maxspeed', zurich:'Stadt Zürich, signalisierte Geschwindigkeiten; gestrichelt OpenStreetMap maxspeed', alle: 'OpenStreetMap maxspeed (gestrichelt)' } },
  { id: 'dtv', titel: 'Verkehrsmenge (DTV)', kurz: 'DTV', legende: DTV_FARBEN,
    quelle: { bern: 'Geoportal Stadt Bern, Flächendeckende Verkehrsdaten (DTV ≈ 16·Nt + 8·Nn)',
      zurich: 'Kanton Zürich, Verkehrsmessstellen; Linie zum Segment, das den Wert übernimmt',
      luzern: 'Stadt Luzern, Verkehrszähldaten; Linie zum Segment, das den Wert übernimmt',
      basel: 'Zählstellen Basel-Stadt (Snapshot dtv_basel.json); Linie zum Segment, das den Wert übernimmt' } },
  { id: 'velostrasse', titel: 'Velostrassen', kurz: 'Velostr.', staedte: ['bern', 'basel'],
    legende: [['velostrasse', '#2563eb', 'Velostrasse']],
    quelle: { bern: 'Geoportal Stadt Bern, Velostrassen', basel: 'data.bs.ch 100426 «Velostadtplan: Eignung», Klasse Velostrasse' } },
  { id: 'strassentyp', titel: 'Strassentyp', kurz: 'Typ', staedte: ['basel'],
    legende: [['verkehrsorientiert', '#b91c1c', 'verkehrsorientiert'], ['siedlungsorientiert', '#0f766e', 'siedlungsorientiert']],
    quelle: { basel: 'data.bs.ch 100250 «Strassen und Wege», Feld strassenkategorie' } },
  // Farben der amtlichen Legende (wie der lokale Rechner, soll_ist_analyse.py HIERARCHIE_FARBEN)
  { id: 'hierarchie', titel: 'Strassenhierarchie', kurz: 'Hierarchie', staedte: ['bern','zurich','luzern'],
    legende: [['Basisnetz', '#ff7f7f', 'Basisnetz'], ['Quartierverbindungsstrasse', '#ffd37f', 'Quartierverbindungsstrasse'],
      ['Quartierstrasse', '#a3ff73', 'Quartierstrasse (Bedingung der Velostrasse, Q 9)'], ['Quartierstrasse ergänzend', '#cccccc', 'Quartierstrasse ergänzend (Anliefer-/Privatstrassen)'],
      ['nicht befahrbar', '#cd8966', 'nicht befahrbar (Fuss-/Aare-/Waldwege)'],['hinweis','#334155','Amtliche Klassierung (Originalattribut)']],
    quelle: { bern: 'Geoportal Stadt Bern, Strassenhierarchie', zurich:'Stadt Zürich, Strassenklassierung',luzern:'Stadt Luzern, Strassenachsen (TYP)' } },
  { id: 'haltestellen', titel: 'ÖV-Haltestellen', kurz: 'Halte',
    legende: [['tram', '#b91c1c', 'Tram (auch mit Bus)', 'T'], ['takt', '#1d4ed8', 'Bus mit Takt (Fahrplan)', 'B'], ['halt', '#60a5fa', 'Bus ohne Fahrt 17–18 Uhr', 'B'],
      ['unbekannt', '#475569', 'Verkehrsmittel unbekannt', 'H']],
    quelle: { bern: 'Geoportal Stadt Bern, Haltestellen; Bus-Takt aus dem GTFS-Fahrplan (Abendspitze 17–18 Uhr, nur Busse, Tram nicht gezählt)',
      alle: 'OpenStreetMap; Bus-Takt aus dem GTFS-Fahrplan (Abendspitze 17–18 Uhr, nur Busse, Tram nicht gezählt)' } },
  { id: 'oev', titel: 'ÖV-Linien und Tramgleise', kurz: 'ÖV', legende: [['tram', '#dc2626', 'Tram'], ['bus', '#7c3aed', 'Bus, Trolleybus']], legendeNur: { bus: ['bern'] },
    quelle: { bern: 'Tram: Geoportal Stadt Bern, Verkehrsdaten Tram (in der Fahrbahn, wenn parallele Abschnitte die halbe Länge bis 15 m neben der Achse abdecken); Bus: ÖV-Linien',
      alle: 'OpenStreetMap railway=tram (Tramgleise; Tram in der Fahrbahn, wenn das Gleis bis 8 m neben der Achse liegt)' } },
  { id: 'parkfelder', titel: 'Parkfelder', kurz: 'Parken', staedte: ['bern', 'zurich', 'luzern'],
    legende: [['auto', '#1d4ed8', 'Parkfeld'], ['verbot', '#f97316', 'Parkverbotsfeld (zählt als Parkierung)'], ['zweirad', '#0e7490', 'Velo-/Motorradfeld']],
    quelle: { bern: 'Geoportal Stadt Bern, Parkplätze (öffentlich)', zurich: 'Stadt Zürich, öffentlich zugängliche Parkplätze',
      luzern: 'Stadt Luzern, öffentliche Parkplätze' }, hinweis: 'für die übernommenen Abschnitte' },
  { id: 'fussnetz', titel: 'Fussverkehrsnetz', kurz: 'Fussnetz', staedte: ['bern', 'basel'],
    legende: [['basis', '#be185d', 'Basisnetz (Bern) bzw. kantonales Netz (Basel)'], ['stadt', '#f472b6', 'Stadtnetz (Basel)']],
    quelle: { bern: 'Geoportal Stadt Bern, Richtplan Fussverkehr (Basisnetz Fussweg bestehend)',
      basel: 'Kanton Basel-Stadt, Teilrichtplan Fuss- und Wanderwege' }, hinweis: 'für die übernommenen Abschnitte' },
  { id: 'av', titel: 'Amtliche Vermessung', kurz: 'AV',
    legende: AV_LEGENDE,
    quelle: { luzern: 'Stadt Luzern, Strassenflächen (Ersatz der AV)', alle: 'geodienste.ch, amtliche Vermessung (Bodenbedeckung)' },
    hinweis: `ab Zoomstufe ${AUSSCHNITT_ZOOM} für den Kartenausschnitt, sonst für die übernommenen Abschnitte` },
  { id: 'blockmodelle', titel: 'Gebäude (Blockmodelle)', kurz: 'Gebäude', staedte: ['luzern'], legende: [['gebaeude', '#db2777', 'Gebäude']],
    quelle: { alle: '© Kanton Luzern, Blockmodelle Gebäude; Umrisse mit relativer Höhe; nur Kartenkontext, keine Wirkung auf die Bewertung' }, hinweis: 'um die übernommenen Abschnitte' },
  { id: 'wartehallen', titel: 'Wartehallen und Perrons', kurz: 'Halle',
    legende: [['halle', '#1e3a8a', 'Wartehalle', 'W'], ['perron', '#64748b', 'Perron ohne Wartehalle', 'P']],
    quelle: { alle: 'OpenStreetMap (amenity=shelter, public_transport=platform mit shelter)' }, hinweis: 'für die übernommenen Abschnitte' },
  { id: 'markierung', titel: 'Erkannte Markierungen', kurz: 'Markierung',
    legende: [['linie', '#facc15', 'erkannte Linie im Luftbild'], ['bord', '#f97316', 'Bordkante (AV)']],
    quelle: { bern: 'Orthofoto Stadt Bern 2026 und SWISSIMAGE, Bordkanten aus der AV', alle: 'SWISSIMAGE, Bordkanten aus der AV' },
    hinweis: 'zeigt die Querschnitte der Abschnitte, für die die Planung geöffnet wurde' },
  { id: 'steigung', titel: 'Längsneigung (Profile)', kurz: 'Neigung',
    legende: [['s0', '#16a34a', 'bis 2 %'], ['s2', '#ca8a04', 'über 2 % (Umweltspur ab 4,50 m)'], ['s5', '#dc2626', 'über 5 %'], ['s?', '#64748b', 'nicht bestimmbar']],
    quelle: { bern: 'DTM 2023 Stadt Bern, bei Ausfall swissALTI3D (swisstopo), mittlere Längsneigung je Abschnitt; der Pfeil zeigt bergauf',
      alle: 'swissALTI3D (swisstopo), mittlere Längsneigung je Abschnitt; der Pfeil zeigt bergauf' },
    hinweis: 'je übernommenen Abschnitt' },
  { id: 'luftbild', titel: 'Luftbild-Erkennung', kurz: 'Luftbild', staedte: ['bern', 'zurich', 'basel'],
    legende: [['luftbild', '#e11d48', 'Velostreifen erkannt (remote_velo, ETH Zürich)']],
    quelle: { alle: 'remote_velo (ETH Zürich) auf SWISSIMAGE und Orthofoto, Snapshot' } },
  { id: 'obs', titel: 'Überholabstände (OBS)', kurz: 'OBS', staedte: ['bern', 'zurich'], legende: OBS_FARBEN,
    quelle: { alle: 'OpenBikeSensor, Snapshot; Farbe nach dem Median je Segment' } },
]

export const ebenenFuer = (stadt: Stadt | 'schweiz', daten?: MitObjekten): EbeneDef[] => {
  const quellen = new Set(datenStaende().map(s => s.ebene))
  return EBENEN.filter(e =>
    (!e.id.startsWith('e6.') || Object.prototype.hasOwnProperty.call(daten ?? {}, e.id) || quellen.has(e.id)) &&
    (!!daten?.[e.id]?.length || !e.staedte || stadt !== 'schweiz' && e.staedte.includes(stadt)))
    .sort((a, b) => new Intl.Collator('de-CH', { sensitivity: 'base', numeric: true }).compare(a.titel, b.titel))
}
export const ebenenQuelle = (e: EbeneDef, stadt: Stadt|'schweiz'): string => {
  const verwendet = datenStaende().filter(s => s.ebene === e.id)
  const quelle = verwendet.length ? verwendet.map(s => `${s.name}: ${standText(s)}`).join(' · ') : `${stadt === 'schweiz' ? e.quelle.alle ?? 'örtliche / nationale Quelle' : e.quelle[stadt] ?? e.quelle.alle ?? 'Quelle unbekannt'}; Datenstand unbekannt; Vollständigkeit unbekannt`
  return quelle
}
export const ebenenFarbe = (e: EbeneDef, klasse: string): string => e.legende.find(l => l[0] === klasse)?.[1] ?? '#334155'
export const ebenenSymbol = (e: EbeneDef, o: Pick<EbenenObjekt, 'symbol' | 'klasse'>): string => o.symbol ?? e.legende.find(l => l[0] === o.klasse)?.[3] ?? '•'
export const legendeFuer = (e: EbeneDef, stadt: Stadt|'schweiz', daten?: Partial<Record<EbeneId, readonly { klasse: string }[]>>) => e.legende.filter(([k]) => e.id==='hierarchie'&&daten ? (daten.hierarchie??[]).some(o=>o.klasse===k) : !e.legendeNur?.[k] || stadt !== 'schweiz' && e.legendeNur[k]!.includes(stadt))
  .filter((l, i, xs) => xs.findIndex(x => x[2] === l[2]) === i)   // verschiedene Klassen derselben Bezeichnung nur einmal zeigen

/** Neue Objekte zu den vorhandenen (je Ebene nach id eindeutig; neuere ersetzen ältere) */
export function ebenenMischen(alt: EbenenDaten, neu: EbenenDaten | undefined): EbenenDaten {
  if (!neu) return alt
  const out: EbenenDaten = { ...alt }
  for (const [k, liste] of Object.entries(neu) as [EbeneId, EbenenObjekt[]][]) {
    const m = new Map((out[k] ?? []).map(o => [o.id, o]))
    for (const o of liste) m.set(o.id, o)
    out[k] = [...m.values()]
  }
  return out
}

const tausender = (n: number) => Math.round(n).toLocaleString('de-CH').replace(/[’']/g, ' ')
export const dtvText = (n: number) => tausender(n)

/** Linien-Objekt einer Quelle mit Tempo-Wert */
export const tempoObjekt = (id: string, linien: LL[][], v: number, quelle: string, ersatz = false): EbenenObjekt =>
  ({ id, linien, klasse: tempoKlasse(v), wert: String(v), text: `Tempo ${v} km/h (${quelle})`, ...(ersatz ? { gestrichelt: true } : {}) })
export const dtvLinie = (id: string, linien: LL[][], v: number, quelle: string): EbenenObjekt =>
  ({ id, linien, klasse: dtvKlasse(v), wert: dtvText(v), text: `DTV ≈ ${dtvText(v)} Fahrzeuge je Tag (${quelle})` })

/** Zählstellen als Punkte; Zuordnungslinie von der Station zum Segment, das ihren Wert übernommen hat */
export function dtvStationen(stationen: { lat: number; lon: number; dtv: number }[], quelle: string,
  zuordnung: { station: { lat: number; lon: number }; ziel: LL; candId: number }[]): EbenenObjekt[] {
  const out: EbenenObjekt[] = stationen.filter(s => s.dtv > 0).map(s => ({ id: `st:${s.lat.toFixed(6)},${s.lon.toFixed(6)}`,
    punkt: { lat: s.lat, lon: s.lon }, klasse: dtvKlasse(s.dtv), wert: dtvText(s.dtv), symbol: 'Z', text: `Zählstelle: DTV ${dtvText(s.dtv)} (${quelle})` }))
  for (const z of zuordnung) out.push({ id: `zu:${z.candId}`, linien: [[z.station, z.ziel]], klasse: 'zuordnung', gestrichelt: true,
    text: 'DTV dieser Zählstelle übernommen' })
  return out
}

// ── Ebenen aus den Segmenten selbst (keine eigene Quelle mit Geometrie) ─────────────────────────────────────────────────────
type CandLike = { id: number; geom: LL[]; speed?: number; bern?: { speed?: number }; obs?: { median: number; count: number; usage: number } }

/** OSM maxspeed der Segmente ohne amtlichen Wert (gestrichelt: Ersatzquelle) */
export const osmTempoObjekte = (cands: CandLike[]): EbenenObjekt[] => cands
  .filter(c => c.speed != null && c.bern?.speed == null && c.geom.length >= 2)
  .map(c => tempoObjekt(`osm:${c.id}`, [c.geom], c.speed!, 'OpenStreetMap maxspeed', true))

/** OpenBikeSensor: Segmente nach dem Median des Überholabstands */
export const obsObjekte = (cands: CandLike[]): EbenenObjekt[] => cands
  .filter(c => c.obs && (c.obs.count > 0 || c.obs.usage > 0) && c.geom.length >= 2)
  .map(c => {
    const o = c.obs!, m = o.count > 0 ? o.median : NaN
    return { id: `obs:${c.id}`, linien: [c.geom], klasse: obsKlasse(m), ...(Number.isFinite(m) ? { wert: m.toFixed(2).replace('.', ',') } : {}),
      text: Number.isFinite(m) ? `OpenBikeSensor: Median ${m.toFixed(2).replace('.', ',')} m aus ${o.count} Überholungen`
        : `OpenBikeSensor: ${o.usage}-mal befahren, keine Überholung gemessen` }
  })

/** ÖV-Haltestellen mit dem Bus-Takt des Fahrplans (Abendspitze, stärkste Richtung) */
export const haltestellenObjekte = (stops: { lat: number; lon: number; name: string; perH?: number; modi?: ('tram' | 'bus')[]; linien?: string[] }[]): EbenenObjekt[] => stops.map(s => {
  const takt = s.perH ? Math.round(60 / s.perH * 2) / 2 : undefined
  const tram = !!s.modi?.includes('tram'), bus = !!s.modi?.includes('bus')
  const art = tram && bus ? 'Tram- und Bushaltestelle' : tram ? 'Tramhaltestelle' : bus ? 'Bushaltestelle' : 'ÖV-Haltestelle'
  return { id: `h:${s.lat.toFixed(6)},${s.lon.toFixed(6)}`, punkt: { lat: s.lat, lon: s.lon },
    klasse: tram ? 'tram' : takt ? 'takt' : bus ? 'halt' : 'unbekannt',
    ...(takt ? { wert: `${String(takt).replace('.', ',')}′` } : tram ? { wert: 'Tram' } : {}),
    text: `${art} ${s.name}${s.linien?.length ? ` · Linien ${s.linien.join(', ')}` : ''}${takt ? ` · Bus-Takt ${String(takt).replace('.', ',')} Min (${Math.round(s.perH! * 10) / 10} Busfahrten/h, Abendspitze; Tram nicht gezählt)` : (bus || !tram ? ' · keine Busfahrt 17–18 Uhr im Fahrplan (Tram wird nicht gezählt)' : '')}` }
})

/** Nur Objekte nahe den geladenen Segmenten zeigen (nach «Karte leeren» verschwinden sie mit) */
export function imUmkreis(objekte: EbenenObjekt[], box: { s: number; n: number; w: number; e: number } | null): EbenenObjekt[] {
  if (!box) return []
  const innen = (p: LL) => p.lat >= box.s && p.lat <= box.n && p.lon >= box.w && p.lon <= box.e
  return objekte.filter(o => (o.punkt && innen(o.punkt)) || o.linien?.some(l => l.some(innen)) || o.ringe?.some(r => r.some(innen)))
}

// ── Ebenen aus den Abschnitten (Batch 2) ─────────────────────────────────────────────────────────────────────────────
export const steigungKlasse = (pct: number | null): string => (pct == null ? 's?' : Math.abs(pct) > 5 ? 's5' : Math.abs(pct) > 2 ? 's2' : 's0')
/** Steigung je Abschnitt auf seiner Achse (Stücke in Richtung Seite A), mit Wert und Richtung bergauf */
export function steigungObjekte(abschnitte: { id: number; nr: number; linien: LL[][]; steigung?: { pct: number | null; laenge: number; hinweis?: string; modell?: string } }[]): EbenenObjekt[] {
  return abschnitte.filter(a => a.steigung && a.linien.length).map(a => {
    const st = a.steigung!, b = st.pct == null ? '' : Math.abs(st.pct).toFixed(1).replace('.', ',')
    const richtung = st.pct == null || Math.abs(st.pct) < 0.5 ? '' : st.pct > 0 ? ' ↑ A' : ' ↑ B'
    return { id: `st:${a.id}`, linien: a.linien, klasse: steigungKlasse(st.pct), ...(st.pct != null ? { wert: `${b} %${richtung}` } : {}),
      text: st.pct == null ? `Abschnitt ${a.nr}: ${st.hinweis ?? 'Längsneigung nicht bestimmbar'}`
        : `Abschnitt ${a.nr}: Längsneigung ${b} %${richtung ? `, bergauf Richtung Seite ${richtung.slice(-1)}` : ''} (${st.modell ?? 'swissALTI3D'}, Mittel über ${Math.round(st.laenge)} m)${st.hinweis ? ` · ${st.hinweis}` : ''}` }
  })
}
const PFEIL_KURZ: Record<string, string> = { keine: '·', geradeaus: '↑', links: '←', rechts: '→', 'links-geradeaus': '←↑', 'geradeaus-rechts': '↑→', 'links-rechts': '←→', alle: '←↑→' }
/** Fahrspuren aus OSM für den Tooltip der Segmentlinie (V11): je Richtung die Spuren mit Pfeilen, dazu Busspuren */
export function spurenText(sp: { vor: string[]; rueck: string[]; busVor?: number; busRueck?: number } | undefined): string | null {
  if (!sp || (!sp.vor.length && !sp.rueck.length)) return null
  const teil = (xs: string[], bus?: number) => `${xs.length} ${xs.length === 1 ? 'Spur' : 'Spuren'}${xs.some(x => x !== 'keine') ? ` (${xs.map(x => PFEIL_KURZ[x] ?? x).join(' ')})` : ''}${bus ? `, davon ${bus} Bus` : ''}`
  return `Spuren (OSM): in Wegrichtung ${teil(sp.vor, sp.busVor)}${sp.rueck.length ? ` · Gegenrichtung ${teil(sp.rueck, sp.busRueck)}` : ' · Einbahn'}`
}

/** Ebenen, die auch ohne Abschnitt für den Kartenausschnitt laden; sie stehen immer in der Liste */
export const IM_AUSSCHNITT: readonly EbeneId[] = ['av']
/** Ebenen, die die Karte selbst im Ausschnitt lädt (ausschnittEbenen.ts), sobald sie an sind */
const KARTE_LAEDT: readonly EbeneId[] = ['strasseTlm', 'bauzonen', 'lsa']

/** Objekte aus dem Kartenausschnitt zu den übrigen. Basel und Luzern lesen ihre Lichtsignale auch um die Segmente: Dieselbe Anlage zählt einmal */
export function mitAusschnitt(d: KartenDaten, ausschnitt: Readonly<Record<string, readonly KartenEbenenObjekt[]>>): KartenDaten {
  const aus: KartenDaten = { ...d }
  for (const [id, liste] of Object.entries(ausschnitt) as [EbeneId, readonly KartenEbenenObjekt[]][]) {
    const orte = liste.flatMap(o => (o.punkt ? [o.punkt] : []))
    aus[id] = [...(d[id] ?? []).filter(o => !o.punkt || !orte.some(p => Math.hypot(p[0] - o.punkt![0], p[1] - o.punkt![1]) < 5)), ...liste]
  }
  return aus
}
/** Ebenen, die erst mit übernommenen Abschnitten Daten bekommen. Das Gelände kommt mit den Profilen der Längsneigung. */
const NACH_UEBERNAHME: readonly EbeneId[] = [...NACHLADEN.filter(id => !IM_AUSSCHNITT.includes(id)), 'gelaende']

/** Welche Ebenen das Menü zeigt (nur solche mit Daten): mit Objekten im Ausschnitt; nachladbare nur,
 *  solange sie laden (nach dem Übernehmen automatisch) oder wenn sie etwas gefunden haben.
 *  -> zeigen / ohne Daten / spaeter: noch nicht abgefragt, weil kein Abschnitt übernommen ist */
export function ebenenSichtbar(defs: EbeneDef[], daten: MitObjekten, stand: NachladeStand): { zeigen: EbeneDef[]; ohne: EbeneDef[]; spaeter: EbeneDef[] } {
  const zeigen: EbeneDef[] = [], ohne: EbeneDef[] = [], spaeter: EbeneDef[] = []
  for (const e of defs) {
    const n = (daten[e.id] ?? []).length
    const nach = NACHLADEN.includes(e.id)
    const ok = n > 0 || IM_AUSSCHNITT.includes(e.id) || KARTE_LAEDT.includes(e.id) || (e.id.startsWith('e6.') && datenStaende().some(s => s.ebene === e.id)) || (nach && stand.moeglich && (stand.laufend[e.id] ?? 0) > 0)
    ;(ok ? zeigen : !stand.moeglich && NACH_UEBERNAHME.includes(e.id) ? spaeter : ohne).push(e)
  }
  return { zeigen, ohne, spaeter }
}
