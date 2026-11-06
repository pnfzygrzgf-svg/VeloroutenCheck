import { zeitText } from './datenstand'
import type { VeloZaehldaten } from './velozaehlung'
import { numDE } from './csv'
export function Velozaehlungen({daten=[],druck=false}:{daten?:VeloZaehldaten[];druck?:boolean}) {
 if(!daten.length)return null
 return <details className="vrc-klappe" open={druck||undefined}><summary>Velozählungen ({daten.length})</summary>{daten.map(d=><div key={d.id}>
  <p><b>{d.name}</b> · {d.quelle}<br/>Messzeitraum: {d.datum}</p>
  <ul>{d.werte.map((v,i)=><li key={i}>{v.richtung}: <b>{v.anzahl===null?'keine verwendbare Zahl':numDE(v.anzahl)}</b>{v.anzahl!==null?' Velos':''}{v.intervalle>0?` aus ${v.intervalle} ${v.einheit}`:` · ${v.einheit}`} · {v.validierung}</li>)}</ul>
  <p className="klein">{d.hinweis} Keine Wirkung auf die Bewertung. Datenstand {d.datenstand}; Abruf {zeitText(d.abgerufen)}. <a href={d.url} target="_blank" rel="noreferrer">Quelle</a></p>
 </div>)}</details>
}
