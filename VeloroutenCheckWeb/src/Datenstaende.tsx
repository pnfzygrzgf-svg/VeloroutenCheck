import { avQuelle, avQuelleUrl } from './av'
import { useSyncExternalStore, type ReactNode } from 'react'
import { E6_DIENSTE } from './e5/daten/anbieter/gemeinsam/e6'
import { datenStaende, standAbonnieren, standText, type DatenStand } from './datenstand'
import type { Section } from './strecke'
export const useDatenstaende=()=>useSyncExternalStore(standAbonnieren,datenStaende,datenStaende)
const THEMEN:Record<string,string>={hoehenkurven:'Höhenkurven',av:'Amtliche Vermessung',gebiet:'Gebietszuordnung',kartenbild:'Kartenbilder',orthofoto:'Luftbild',luftbild:'Markierungserkennung im Luftbild',markierung:'Velostreifen (Markierungsplan)',haltestellen:'ÖV-Haltestellen',bav:'ÖV-Haltestellen BAV',oev:'ÖV-Linien',routennetz:'Routentyp',velostrasse:'Velostrassen',tempo:'Tempo',dtv:'Verkehrsmenge (örtlich)',npvm:'Verkehrsmenge (NPVM, modelliert)',tram:'Tram',tramTlm:'Tramgleise (swissTLM3D)',velozaehlungen:'Velozählungen',lsa:'Lichtsignalanlagen',zonen:'Verkehrszonen',parkfelder:'Parkierung',fussnetz:'Fussverkehrsnetz',steigung:'Höhenprofile',obs:'Überholabstände',relief:'Relief',hierarchie:'Strassenhierarchie',osm:'Strassennetz und OSM-Angaben',unfaelle:'Unfälle'}

/** Ebenen (datenstand.ts), deren Daten in Bewertung und Planung dieses Abschnitts eingeflossen sind, nach der Herkunft der Felder
 *  beider Seiten. Ein von Hand geänderter Wert zählt nicht zur Quelle; alles andere ist nur Karte und Hinweis. */
export function beruecksichtigteEbenen(s: Section): Set<string> {
 const aus = new Set<string>(['osm', 'gebiet', 'orthofoto'])         // Strassennetz und Abschnitt; Zuständigkeit (Stadt, Standard); Kartenbild
 if (s.e5?.hinweise.some(h => h.includes('BAV-Haltestellenpunkt'))) aus.add('bav')   // der Bericht nennt den Punkt
 const belegt = (q?: string) => !!q && ['amtlich', 'abgeleitet', 'bestaetigt', 'modell', 'fahrplan'].includes(q)
 const seiten = [s.quelle, ...(s.gegen ? [s.gegen.quelle] : [])]
 if (s.quelle.fahrbahnbreite === 'av' || s.trottoirQuelle === 'av' || s.trottoir) aus.add('av')
 if (belegt(s.quelle.routentyp)) aus.add('routennetz')
 if (belegt(s.quelle.speed)) aus.add('tempo')
 const dtvBeleg = s.e5Auswahl?.dtv ?? s.e5Bestaetigt?.dtv ?? s.e5?.belege.dtv
 if (belegt(s.quelle.dtv)) aus.add(s.quelle.dtv === 'modell' || dtvBeleg?.modell || dtvBeleg?.quelleId === 'are.npvm' ? 'npvm' : 'dtv')
 else if (s.dtvGeprueft && !Number.isFinite(s.dtv)) aus.add('dtv')  // nachgesehen, kein Eintrag: die Annahme stützt sich auf die Quelle
 // Tram und Velostrassen: auch ohne Treffer stützt die Abfrage das Ergebnis; nur ein von Hand gesetzter Wert löst sie ab
 if (s.quelle.tram !== 'manuell') aus.add('tram')
 if (belegt(s.quelle.oevAngebot)) { aus.add('haltestellen'); aus.add('oev') }
 if (seiten.some(q => q.oevTakt === 'fahrplan')) aus.add('haltestellen')
 if (seiten.some(q => belegt(q.parkenRechts)) || s.parkAnteil) aus.add('parkfelder')
 if (s.aufteilung?.fussnetzQuelle === 'geoportal' || s.fussnetzGeoportal) aus.add('fussnetz')
 if (seiten.some(q => q.ist === 'markierung' || q.breite === 'markierung')) aus.add('markierung')
 if (seiten.some(q => q.ist === 'luftbild' || q.breite === 'luftbild')) aus.add('luftbild')
 if (s.quelle.ist !== 'manuell') aus.add('velostrasse')
 if (s.hierarchie || belegt(s.quelle.strassentyp)) aus.add('hierarchie')
 return aus
}

type Zeile = DatenStand & { thema: string; standHinweis?: string }
// Anbieter und Lizenz nach dem Namen der Quelle (Spalten wie in fgsCheck und SichtweitenCheck); unbekannt bleibt leer statt geraten
const ANBIETER: [RegExp, string, string][] = [
 [/^Geoportal Stadt Bern/, 'Geodaten Stadt Bern', 'Open Data Stadt Bern: freie Nutzung, Quellenangabe Pflicht'],
 [/^Amtliche Vermessung/, 'Kantone über geodienste.ch', 'frei mit Quellenangabe (Bedingungen je Kanton)'],
 [/^OpenStreetMap/, 'OpenStreetMap', 'ODbL, © OpenStreetMap-Mitwirkende'],
 [/swisstopo/, 'swisstopo', 'frei, Quellenangabe «© swisstopo»'],
 [/^Stadt Zürich/, 'Stadt Zürich', 'Open Government Data, Quellenangabe Pflicht'],
 [/^Basel-Stadt/, 'Kanton Basel-Stadt', 'Open Government Data, Quellenangabe Pflicht'],
 [/^Stadt Luzern/, 'Stadt Luzern', 'Open Government Data, Quellenangabe Pflicht'],
 [/^BAV/, 'Bundesamt für Verkehr', '–'],
 [/^ARE/, 'Bundesamt für Raumentwicklung', '–'],
]
const anbieterLizenz = (name: string): [string, string] => { const a = ANBIETER.find(x => x[0].test(name)); return a ? [a[1], a[2]] : ['–', '–'] }
const Tabelle = ({ zeilen }: { zeilen: Zeile[] }) => <table className="bericht-quellen">
 <thead><tr><th>Quelle</th><th>Für</th><th>Anbieter</th><th>Stand</th><th>Lizenz</th></tr></thead>
 <tbody>{zeilen.map(s => { const [anbieter, lizenz] = anbieterLizenz(s.name); return <tr key={s.id}><td><a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a></td><td>{s.thema}</td><td>{anbieter}</td>
  <td>{s.standHinweis ?? standText(s, false)}{!!s.teilfehler?.length && <ul>{s.teilfehler.map(t =>
   <li key={t.zelle}><a href={t.url} target="_blank" rel="noopener noreferrer">Zelle {t.zelle}</a>: {t.fehler}</li>)}</ul>}</td><td>{lizenz}</td></tr> })}</tbody>
</table>

export function Datenstaende({druck=false,section,flugjahr,avKanton,avImBild=false,children}:{druck?:boolean;section?:Section;flugjahr?:string;avKanton?:string;avImBild?:boolean;children?:ReactNode}) {
 const ss=useDatenstaende()
 if(!ss.length)return null
 const themen={...THEMEN,...Object.fromEntries(E6_DIENSTE.map(d=>[d.id,d.art==='beleuchtung'?'Beleuchtung':d.art==='taktil'?'Taktile Markierungen':'Fuss- und Velowegnetz']))}
 const sortiert:Zeile[]=ss.map(s=>({...s,...(druck&&flugjahr&&s.ebene==='orthofoto'?{datenstand:`${flugjahr} (Flugjahr)`}:{}),thema:themen[s.ebene??'']??'Weitere Quellen'})).sort((a,b)=>a.thema.localeCompare(b.thema,'de-CH')||a.name.localeCompare(b.name,'de-CH'))
 if(druck){
  if(!section)return <Tabelle zeilen={sortiert} />
  // Bericht: nur, was in Bewertung, Planung oder Kartenbild eingeht, wie in den anderen Rechnern; alle Geladenen zeigt die App
  const ebenen=beruecksichtigteEbenen(section)
  if(avImBild)ebenen.add('av')
  const drin=sortiert.filter(s=>!!s.ebene&&ebenen.has(s.ebene))
  // Das Kartenbild des Berichts kommt per WMS und erscheint nicht unter den Kacheln, wenn die Karte ein anderes Hintergrundbild zeigte
  if(flugjahr&&!drin.some(s=>s.ebene==='orthofoto'))drin.push({id:'bericht.swissimage',name:'Luftbild SWISSIMAGE · swisstopo',url:'https://www.swisstopo.admin.ch/de/orthobilder-swissimage-10-cm',ebene:'orthofoto',datenstand:`${flugjahr} (Flugjahr)`,vollstaendigkeit:'unbekannt',abgerufen:new Date().toISOString(),status:'geladen',thema:themen.orthofoto??'Luftbild'})
  // Die AV kommt aus dem Speicher des Abschnitts oder einem früheren Lauf: dann gibt es keinen Abruf zu melden, die Quelle bleibt zu nennen
  if(avKanton&&ebenen.has('av')&&!drin.some(s=>s.ebene==='av'))drin.push({id:'bericht.av',name:avQuelle(avKanton),url:avQuelleUrl(avKanton),ebene:'av',datenstand:'unbekannt',vollstaendigkeit:'unbekannt',abgerufen:'',status:'geladen',thema:themen.av,standHinweis:'Datenstand unbekannt: Werte aus dem gespeicherten Abschnitt oder einem früheren Abruf'})
  drin.sort((a,b)=>a.thema.localeCompare(b.thema,'de-CH')||a.name.localeCompare(b.name,'de-CH'))
  return drin.length?<Tabelle zeilen={drin} />:<p className="klein">keine (alle Angaben von Hand)</p>
 }
 const fehler=ss.filter(s=>s.status==='fehler').length
 return <details className="vrc-klappe vrc-kachel"><summary>Datenquellen und Ladezustand{fehler>0&&<span className="fehler"> ({fehler} Fehler)</span>}</summary>{children}<ul className="datenstaende">{sortiert.map(s=><li key={s.id}><b>{s.thema}</b> · <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a><div>{standText(s, false)}</div>{!!s.teilfehler?.length && <ul>{s.teilfehler.map(t =>
  <li key={t.zelle}><a href={t.url} target="_blank" rel="noopener noreferrer">Zelle {t.zelle}</a>: {t.fehler}</li>)}</ul>}</li>)}</ul></details>
}
