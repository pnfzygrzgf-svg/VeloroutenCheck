import { useSyncExternalStore } from 'react'
import { E6_DIENSTE } from './e5/daten/anbieter/gemeinsam/e6'
import { datenStaende, standAbonnieren, standText } from './datenstand'
export const useDatenstaende=()=>useSyncExternalStore(standAbonnieren,datenStaende,datenStaende)
const THEMEN:Record<string,string>={hoehenkurven:'Höhenkurven',av:'Amtliche Vermessung',gebiet:'Gebietszuordnung',kartenbild:'Kartenbilder',orthofoto:'Luftbild',luftbild:'Markierungserkennung im Luftbild',haltestellen:'ÖV-Haltestellen',bav:'ÖV-Haltestellen BAV',oev:'ÖV-Linien',routennetz:'Routentyp',velostrasse:'Velostrassen',tempo:'Tempo',dtv:'Verkehrsmenge (örtlich)',npvm:'Verkehrsmenge (NPVM, modelliert)',velozaehlungen:'Velozählungen',lsa:'Lichtsignalanlagen',zonen:'Verkehrszonen',parkfelder:'Parkierung',fussnetz:'Fussverkehrsnetz',steigung:'Höhenprofile',obs:'Überholabstände',relief:'Relief',hierarchie:'Strassenhierarchie',osm:'Strassennetz und OSM-Angaben',unfaelle:'Unfälle'}
export function Datenstaende({druck=false}:{druck?:boolean}) {
 const ss=useDatenstaende()
 if(!ss.length)return null
 const themen={...THEMEN,...Object.fromEntries(E6_DIENSTE.map(d=>[d.id,d.art==='beleuchtung'?'Beleuchtung':d.art==='taktil'?'Taktile Markierungen':'Fuss- und Velowegnetz']))}
 const sortiert=ss.map(s=>({...s,thema:themen[s.ebene??'']??'Weitere Quellen'})).sort((a,b)=>a.thema.localeCompare(b.thema,'de-CH')||a.name.localeCompare(b.name,'de-CH'))
 const inhalt=<ul className="datenstaende">{sortiert.map(s=><li key={s.id}><b>{s.thema}</b> · <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a><div>{standText(s, false)}</div>{!!s.teilfehler?.length && <ul>{s.teilfehler.map(t =>
  <li key={t.zelle}><a href={t.url} target="_blank" rel="noopener noreferrer">Zelle {t.zelle}</a>: {t.fehler}</li>)}</ul>}</li>)}</ul>
 return druck?<section><h3>Verwendete Datenquellen und Ladezustand</h3>{inhalt}</section>:<details className="vrc-klappe"><summary>Datenquellen und Ladezustand ({ss.length})</summary>{inhalt}</details>
}
