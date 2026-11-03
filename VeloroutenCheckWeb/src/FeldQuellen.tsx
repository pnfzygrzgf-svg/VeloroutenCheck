import type { ReactNode } from 'react'
import { gegenVon, type Section, type Quelle } from './strecke'
import { useDatenstaende } from './Datenstaende'
export interface FeldQuelle { id:string; name:string; wert:string|number|boolean; quelle:Quelle; hinweis?:string; datumQuelle?:string }
export function feldQuellenPatch(s:Section,feld:string,o:FeldQuelle):Partial<Section> {
 const [seite,k]=feld.includes('.')?feld.split('.'):['',feld],b=seite==='b',alt=b?gegenVon(s):s
 const feldAuswahl={...s.feldAuswahl,[feld]:o.id},offeneQuellen=(s.offeneQuellen??[]).filter(f=>f!==feld)
 const patch:Partial<Section>={feldAuswahl,offeneQuellen}
 const werte:Record<string,unknown>={[k]:o.wert},quelle={...alt.quelle,[k]:o.quelle}
 if(k==='ist' && alt.ist!==o.wert && !['manuell','gemessen'].includes(alt.quelle.breite??'')){
   const breite=s.feldQuellen?.[(b?'b':'a')+'.breite']?.find(x=>x.id===o.id)
   werte.breite=breite?.wert??NaN
   if(breite){quelle.breite=breite.quelle;feldAuswahl[(b?'b':'a')+'.breite']=breite.id}else delete quelle.breite
 }
 if(b)patch.gegen={...gegenVon(s),...werte,quelle}
 else Object.assign(patch,werte,{quelle})
 return patch
}
export function FeldQuellen({s,feld,aendern,fallback}:{s:Section;feld:string;aendern:(p:Partial<Section>)=>void;fallback?:ReactNode}) {
 const staende=useDatenstaende(),optionen=s.feldQuellen?.[feld]??[]
 if(optionen.length<2)return <>{fallback}</>
 const [seite,k]=feld.includes('.')?feld.split('.'):['',feld],seiteB=seite==='b',werte=seiteB?s.gegen??s:s
 const wert=werte[k as keyof typeof werte],quelle=seiteB?s.gegen?.quelle??s.quelle:s.quelle
 return <span className="vrc-feldquellen">{optionen.map(o=>{
   const stand=staende.find(q=>o.datumQuelle?q.url.includes(o.datumQuelle):q.id===o.id)
   const aktiv=wert===o.wert&&(s.feldAuswahl?.[feld]?s.feldAuswahl[feld]===o.id:quelle[k as keyof typeof quelle]===o.quelle)
   const waehlen=()=>aendern(feldQuellenPatch(s,feld,o))
   return <button type="button" className="vrc-quellenwahl" key={o.id} aria-pressed={aktiv} onClick={waehlen}
     title={`${o.name}: ${o.wert}. ${o.hinweis??''} Datenstand ${stand?.datenstand??'unbekannt'}; ${aktiv?'verwendete Quelle':'Klick wählt diesen Quellenwert; keine Bestätigung der Richtigkeit'}.`}>
     {o.name} · {typeof o.wert==='boolean'?o.wert?'Ja':'Nein':o.wert}
   </button>
 })}</span>
}
