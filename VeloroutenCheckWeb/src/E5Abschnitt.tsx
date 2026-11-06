import { Velozaehlungen } from './Velozaehlungen'
import type { Section } from './strecke'
import { e5BelegQuelle, e5QuellenAusfall, type E5Beleg } from './e5'
import { numDE } from './csv'
import { useDatenstaende } from './Datenstaende'
import { zeitText } from './datenstand'

export function E5Abschnitt({s,druck=false}:{s:Section;aendern?:(p:Partial<Section>)=>void;druck?:boolean}) {
 const staende=useDatenstaende()
 const wertText=(b:E5Beleg)=>b.feld==='dtv'&&Number.isFinite(Number(b.wert))?Math.round(Number(b.wert)).toLocaleString('de-CH'):String(b.wert)
 const vorschlagText=(b:E5Beleg)=>`${b.feld==='dtv'?'Motorfahrzeug-DTV':b.feld==='speed'?'Tempo':b.feld==='hierarchie'?'Strassenklassierung':'Verkehrszone'}: ${wertText(b)}${b.feld==='dtv'?' Fz/Tag':b.feld==='speed'?' km/h':''}`
 const mitStand=(b:E5Beleg):E5Beleg=>{const q=staende.find(q=>q.url.split('?')[0]===b.url.split('?')[0]);return !b.bestaetigt&&b.datenstand==='unbekannt'&&q&&q.abgerufen===b.abgerufen?{...b,datenstand:q.datenstand}:b}
 const belege=[...Object.values(s.e5?.belege??{}).filter(b=>b && !(s.e5Auswahl??s.e5Bestaetigt)?.[b.feld as 'dtv'|'speed'] && !['manuell','bestaetigt'].includes(s.quelle[b.feld as 'dtv'|'speed']??'') && (b.feld!=='dtv'&&b.feld!=='speed'||s[b.feld]===b.wert)),...Object.values(s.e5Auswahl??s.e5Bestaetigt??{})].filter((x):x is E5Beleg=>!!x)
 return <div className="e5-abschnitt">
  <Velozaehlungen daten={s.velozaehlungen} druck={druck}/>
  {!!(belege.length||s.e5?.hinweise.length)&&(()=>{const inhalt=<>
    {belege.map((roh,i)=>{const b=mitStand(roh);return <p key={i}><b>{s.offeneQuellen?.includes(b.feld) ? `${b.feld==='dtv'?'Motorfahrzeug-DTV':'Tempo'}: Quelle nicht verfügbar; zuletzt ${wertText(b)}${b.feld==='dtv'?' Fz/Tag':' km/h'}` : vorschlagText(b)}</b> · {b.quelle}{b.herkunft==='abgeleitet'?' · abgeleitet':''}{(s.e5Auswahl??s.e5Bestaetigt)?.[b.feld as 'dtv'|'speed']?' · ausgewählte Quelle':''}<br/>Datenstand {b.datenstand}; Abruf {zeitText(b.abgerufen)}{b.hinweis?`; ${b.hinweis}`:''}</p>})}
    {s.e5?.hinweise.map((t,i)=><p key={'h'+i}>{t}</p>)}
  </>
  // im Bericht ein Abschnitt wie die übrigen, ohne Aufklapp-Pfeil
  return druck?<section className="bericht-block"><h2>Quellenzuordnung und Hinweise</h2><div className="klein">{inhalt}</div></section>
   :<details><summary>Quellenzuordnung und Hinweise</summary>{inhalt}</details>})()}

 </div>
}

/** Nur ein unsicherer Wertvorschlag braucht eine ausdrückliche Wahl, direkt an seiner Eingabe. */
export function DatenFeldVorschlaege({s,feld,aendern,fallback}:{s:Section;feld:'dtv'|'speed';aendern:(p:Partial<Section>)=>void;fallback?:import('react').ReactNode}) {
 const staende=useDatenstaende()
 const auswahl=(s.e5Auswahl??s.e5Bestaetigt)?.[feld]
 const ausgefallen=!!auswahl&&!!s.offeneQuellen?.includes(feld)
 const basis=s.e5?.belege[feld]
 const moeglich=[...(ausgefallen&&auswahl?[auswahl]:[]),...(basis?[basis]:[]),...(s.e5?.vorschlaege??[]).filter(b=>b.feld===feld)]
 const eindeutig=moeglich.filter((b,i)=>moeglich.findIndex(x=>x.quelleId===b.quelleId&&x.wert===b.wert)===i)
 if(eindeutig.length<2 && !eindeutig.some(b=>b.modell || s[feld]!==b.wert))return <>{fallback}</>
 return <span className="vrc-feldquellen">{eindeutig.map((roh,i)=>{
   const q=staende.find(q=>q.url.split('?')[0]===roh.url.split('?')[0])
   const b={...roh,datenstand:roh.datenstand==='unbekannt'&&q&&q.abgerufen===roh.abgerufen?q.datenstand:roh.datenstand}
   const fehlt=ausgefallen&&b.quelleId===auswahl?.quelleId
   const aktiv=fehlt||s[feld]===b.wert&&((s.e5Auswahl??s.e5Bestaetigt)?.[feld]?(s.e5Auswahl??s.e5Bestaetigt)?.[feld]?.quelleId===b.quelleId:s.quelle[feld]!=='manuell'&&(basis?basis.quelleId===b.quelleId:b.quelleId==='osm'))
   return <button key={i} type="button" className="vrc-quellenwahl" aria-pressed={aktiv} disabled={fehlt}
     title={`${fehlt?'Ausgewählte Quelle nicht verfügbar; frühere Zuordnung bleibt gespeichert. ':''}${b.quelle}. ${b.herkunft==='abgeleitet'?'Abgeleitet aus amtlichen Ausgangsdaten. ':''}${b.hinweis} Datenstand ${b.datenstand}. ${fehlt?'Gespeicherte Auswahl ohne aktuellen verwendbaren Wert.':aktiv?'Verwendeter Wert.':'Zuordnung prüfen; Klick übernimmt genau diesen Wert.'}`}
     onClick={()=>aendern({[feld]:Number(b.wert),e5Auswahl:{...s.e5Auswahl,[feld]:{...b,bestaetigt:undefined}},e5Bestaetigt:{...s.e5Bestaetigt,[feld]:undefined},offeneQuellen:(s.offeneQuellen??[]).filter(k=>k!==feld),e5:s.e5?{...s.e5,hinweise:s.e5.hinweise.filter(h=>!auswahl||h!==e5QuellenAusfall(auswahl))}:undefined,quelle:{...s.quelle,[feld]:e5BelegQuelle(b)}})}>
       {b.quelleId==='are.npvm'?'ARE · NPVM':b.quelleId==='osm'?'OSM':b.quelleId==='zh.tempo'?'Stadt Zürich':b.quelle.replace(/ · (signalisierte Geschwindigkeiten|Verkehrsmessstellen|Verkehrszählung|zeitabhängiges Tempo|Verkehrszone)$/,'')} · {fehlt?'nicht verfügbar':`${numDE(Number(b.wert))} ${feld==='dtv'?'Fz/Tag':'km/h'}`}
   </button>
 })}</span>
}
