import type { Cand, Stop } from './VeloMap'
import type { EbenenDaten } from './ebenen'
import { lv95,wgs,type P } from './e5/geo'
import { ladeBav,bavDatenstandText } from './e5/daten/anbieter/gemeinsam/bav'
import { geoAdminUrl,ladeGeoAdmin,eigenschaften } from './e5/daten/anbieter/gemeinsam/geoAdmin'
import { meldeQuelleStand, meldeQuellenFehler, datenGeneration } from './datenstand'
import { distPointToLineM, type LL } from './geo'
export const TLM_TRAM='ch.swisstopo.swisstlm3d-eisenbahnnetz'
const ll=([e,n]:P):LL=>{const [lat,lon]=wgs(e,n);return{lat,lon}}
/** Nur nationaler Kontext: Ein Haltestellenpunkt ist keine Haltekante, ein Tramgleis kein Beleg für gemeinsamen Strassenraum. */
export async function bundesquellen(cs:readonly Cand[]):Promise<{ebenen:EbenenDaten;stops:Stop[];hinweise:Map<number,string[]>;fehler:string[]}> {
 const generation=datenGeneration()
 const ebenen:EbenenDaten={},stops:Stop[]=[],hinweise=new Map<number,string[]>(),fehler:string[]=[]
 const ps=cs.flatMap(c=>c.geom.map(p=>lv95(p.lat,p.lon)));if(!ps.length)return{ebenen,stops,hinweise,fehler}
 const box=[Math.min(...ps.map(p=>p[0]))-100,Math.min(...ps.map(p=>p[1]))-100,Math.max(...ps.map(p=>p[0]))+100,Math.max(...ps.map(p=>p[1]))+100]
 const mitte:P=[(box[0]+box[2])/2,(box[1]+box[3])/2],r=Math.max(box[2]-box[0],box[3]-box[1])/2,[lat,lon]=wgs(...mitte)
 const tramUrl=geoAdminUrl(TLM_TRAM,box.join(','),'esriGeometryEnvelope')
 await Promise.all([
  ladeBav(lat,lon,r,undefined,true).then(d=>{
   ebenen.bav=d.daten.halte.map(h=>({id:h.id,punkt:ll(h.p),klasse:h.art,text:`${h.name}: BAV ${h.nummer}; Haltestellenpunkt, keine Haltekante; Datenstand ${bavDatenstandText(d.daten)} (Ebene); Vollständigkeit unbekannt`}))
   for(const h of d.daten.halte){const p=ll(h.p);stops.push({...p,name:h.name,modi:h.art==='bus_tram'?['bus','tram']:[h.art]})}
   meldeQuelleStand('bav.halt','BAV · Haltestellenpunkte',d.daten.url,'bav',bavDatenstandText(d.daten)+' (Ebene)',d.daten.abgerufen,generation)
  }).catch(e=>{fehler.push('BAV-Haltestellen');meldeQuellenFehler('bav.halt','BAV · Haltestellenpunkte','https://api3.geo.admin.ch/rest/services/api/MapServer/ch.bav.haltestellen-oev','bav',e,generation)}),
  ladeGeoAdmin(tramUrl).then(async d=>{
   ebenen.tramTlm=d.daten.results!.flatMap(f=>{const a=eigenschaften(f),g=f.geometry;if(f.layerBodId!==TLM_TRAM||a.verkehrsmittel!==200||a.ausser_betrieb!==1||!g)return[]
    const linien=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[]
    return [{id:'tlm.tram:'+String(f.featureId??f.id),linien:(linien as P[][]).map(l=>l.map(ll)),klasse:'tram',text:'Tramgleis · swissTLM3D © swisstopo. Höhenlage und Lage zur Fahrbahn prüfen; keine automatische Bewertung «Tram in der Fahrbahn».'}]
   })
   const url=`https://api3.geo.admin.ch/rest/services/api/MapServer/${TLM_TRAM}/legend?lang=de`
   let stand='unbekannt';try {const c=new AbortController(),t=setTimeout(()=>c.abort(),10000);try{const r=await fetch(url,{signal:c.signal,cache:'no-store'});const html=await r.text(),m=html.match(/Datenstand\s*<\/td>\s*<td[^>]*>\s*(\d{2}\.\d{2}\.\d{4})/i);if(r.ok&&m)stand=m[1]+' (Ebene)'}finally{clearTimeout(t)}}catch{/* Quelle ohne Stand bleibt sichtbar */}
   meldeQuelleStand('swisstopo.tram','Tramgleise · swissTLM3D',tramUrl,'tramTlm',stand,new Date().toISOString(),generation)
  }).catch(e=>{fehler.push('Tramgleise swissTLM3D');meldeQuellenFehler('swisstopo.tram','Tramgleise · swissTLM3D',tramUrl,'tramTlm',e,generation)}),
 ])
 for(const c of cs){const b=(ebenen.bav??[]).filter(h=>h.punkt&&distPointToLineM(h.punkt,c.geom)<60),t=(ebenen.tramTlm??[]).some(t=>t.linien?.some(l=>l.some(p=>distPointToLineM(p,c.geom)<15)))
  hinweise.set(c.id,[...(b.length?[`${b.length} BAV-Haltestellenpunkte bis 60 m neben dem Abschnitt: Strassenzuordnung, Haltekante und Verkehrsmittel vor Verwendung prüfen.`]:[]),...(t?['Tramgleis aus swissTLM3D in der Nähe: getrennt prüfen, ob es in der Fahrbahn liegt.']:[])])}
 return{ebenen,stops,hinweise,fehler}
}
