import type { Cand } from './VeloMap'
import type { Suchgebiet } from './gebiet'
import { holeJson,arcgisGeojson } from './netz'
import { distPointToLineM,type LL } from './geo'
import { meldeQuelleStand,meldeQuellenFehler,datenGeneration } from './datenstand'
export interface VeloZaehldaten {
 id:string; name:string; punkt:LL; quelle:string; url:string; datum:string; abgerufen:string
 werte:{richtung:string; anzahl:number|null; intervalle:number; einheit:string; validierung:string}[]
 hinweis:string; datenstand:string
}
const ZH='https://data.stadt-zuerich.ch/api/3/action/'
const ZH_STATION='https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Standorte_der_automatischen_Fuss__und_Velozaehlungen'
const BS='https://data.bs.ch/api/explore/v2.1/catalog/datasets/'
export const LU_VELO='https://public.geo.lu.ch/ogd/rest/services/managed/VERKZLNG_COL_V2_MP/MapServer/9/query'
const zahl=(v:unknown):number|null=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null
const nah=(p:LL,cs:readonly Cand[])=>cs.some(c=>distPointToLineM(p,c.geom)<=40)
const box=(cs:readonly Cand[])=>{const ps=cs.flatMap(c=>c.geom);return{w:Math.min(...ps.map(p=>p.lon))-.0007,s:Math.min(...ps.map(p=>p.lat))-.0005,e:Math.max(...ps.map(p=>p.lon))+.0007,n:Math.max(...ps.map(p=>p.lat))+.0005}}
interface ZhZeile {DATUM:string;VELO_IN:unknown;VELO_OUT:unknown}
/** Rohwerte je Richtung; fehlende Intervalle sind nie null, und keine Hochrechnung erzeugt einen DTV. */
export function zhTageswerte(rows:readonly ZhZeile[],rin:string,rout:string):Pick<VeloZaehldaten,'datum'|'werte'> {
 const datum=rows.map(r=>r.DATUM?.slice(0,10)).filter(Boolean).sort().reverse()[0]??''
 const tag=rows.filter(r=>r.DATUM?.slice(0,10)===datum),gesehen=new Set<string>()
 if(tag.some(r=>{if(gesehen.has(r.DATUM))return true;gesehen.add(r.DATUM);return false}))throw Error('Velozählung: doppelte Zeitintervalle')
 return{datum,werte:([['VELO_IN',rin||'IN'],['VELO_OUT',rout||'OUT']] as const).map(([feld,richtung])=>{const xs=tag.map(r=>zahl(r[feld])).filter((x):x is number=>x!==null);return{richtung,anzahl:xs.length?xs.reduce((a,b)=>a+b,0):null,intervalle:xs.length,einheit:'Viertelstunden',validierung:'Gerätewerte, nicht korrigiert; fehlende Intervalle nicht ergänzt'}})}
}
interface BsZeile {date:string;datetimefrom:string;datetimeto:string;directionname:string;lanecode:number;total:unknown;valuesapproved:number;valuesedited:number}
export function bsTageswerte(rows:readonly BsZeile[]):Pick<VeloZaehldaten,'datum'|'werte'> {
 const datum=rows[0]?.date??'',gruppen=new Map<string,BsZeile[]>(),gesehen=new Set<string>()
 for(const r of rows){if(r.date!==datum||zahl(r.total)===null)continue;const k=r.datetimefrom+'|'+r.lanecode;if(gesehen.has(k))throw Error('Velozählung: doppelte Zeitintervalle');gesehen.add(k);const g=`${r.directionname} · Spur ${r.lanecode}`;gruppen.set(g,[...(gruppen.get(g)??[]),r])}
 return{datum,werte:[...gruppen].map(([richtung,rs])=>({richtung,anzahl:rs.reduce((s,r)=>s+Number(r.total),0),intervalle:rs.length,einheit:'Stundenintervalle',validierung:`${rs.every(r=>r.valuesapproved===1)?'vom Anbieter validiert':'noch nicht durchgehend validiert'}; ${rs.filter(r=>r.valuesedited===1).length} Ersatzwerte`}))}
}
export async function ladeVelozaehlungen(cs:readonly Cand[],stadt:Suchgebiet):Promise<VeloZaehldaten[]> {
 if(!cs.length||!['zurich','basel','luzern'].includes(stadt))return[]
 const generation=datenGeneration()
 const b=box(cs),abgerufen=new Date().toISOString(),aus:VeloZaehldaten[]=[]
 try{
 if(stadt==='zurich'){
  const [stationen,paket]=await Promise.all([
   holeJson<{features:{geometry:{coordinates:number[]};properties:Record<string,unknown>}[]}>(ZH_STATION+'?'+new URLSearchParams({SERVICE:'WFS',REQUEST:'GetFeature',VERSION:'1.1.0',TYPENAME:'view_eco_standorte',SRSNAME:'EPSG:4326',OUTPUTFORMAT:'GeoJSON',MAXFEATURES:'501',BBOX:`${b.w},${b.s},${b.e},${b.n},EPSG:4326`}),15000),
   holeJson<{success:boolean;result:{metadata_modified:string;resources:{id:string;name:string;datastore_active:boolean}[]}}>(ZH+'package_show?id=ted_taz_verkehrszaehlungen_werte_fussgaenger_velo',15000)])
  if(!paket.success||!Array.isArray(stationen.features)||stationen.features.length>500)throw Error('Velozählung Zürich: unvollständige Antwort')
  const res=paket.result.resources.filter(r=>/^20\d{2}_.*\.csv$/.test(r.name)&&r.datastore_active).sort((a,b)=>b.name.localeCompare(a.name))[0]
  if(!res)throw Error('Velozählung Zürich: keine aktuelle abrufbare Datenressource')
  const ss=stationen.features.filter(f=>f.properties.velo===1&&f.properties.bis==null&&f.geometry?.coordinates?.length>=2&&nah({lon:f.geometry.coordinates[0],lat:f.geometry.coordinates[1]},cs))
  for(const st of ss.slice(0,6)){
   const p=st.properties,id=String(p.id1);if(!/^\d+$/.test(id))continue
   const url=ZH+'datastore_search?'+new URLSearchParams({resource_id:res.id,filters:JSON.stringify({FK_STANDORT:id}),sort:'DATUM desc',limit:'192'})
   const d=await holeJson<{success:boolean;result:{records:ZhZeile[]}}>(url,15000);if(!d.success||!d.result.records.length)continue
   const t=zhTageswerte(d.result.records,String(p.richtung_in??''),String(p.richtung_out??''));if(!t.werte.some(v=>v.anzahl!==null))continue
   aus.push({id:'zh.velo:'+id,name:String(p.bezeichnung??id),punkt:{lon:st.geometry.coordinates[0],lat:st.geometry.coordinates[1]},quelle:'Stadt Zürich · Velozählung',url,...t,abgerufen,datenstand:`${t.datum} (letzte Messwerte); Katalog ${paket.result.metadata_modified}`,hinweis:`Zählstelle in der Nähe; keine Übertragung auf den ganzen Abschnitt. Gerätewerte ohne Hochrechnung; kein Jahres-DTV. Korrekturfaktor laut Standort: ${p.korrekturfaktor??'unbekannt'} (hier nicht angewandt).`})
  }
 }else if(stadt==='basel'){
  const u=BS+'100038/records?'+new URLSearchParams({where:`zweck LIKE '%Velo%' AND in_bbox(geo_point_2d,${b.s},${b.w},${b.n},${b.e})`,limit:'100'})
  const ss=await holeJson<{total_count:number;results:{id_zst:string;name:string;betriebzus:string;geo_point_2d:LL}[]}>(u,15000)
  if(ss.total_count>100||ss.total_count!==ss.results.length)throw Error('Velozählstellen Basel: Antwort unvollständig')
  for(const st of ss.results.filter(st=>st.betriebzus==='in Betrieb'&&st.geo_point_2d&&nah(st.geo_point_2d,cs)).slice(0,6)){
   if(!/^\d+$/.test(st.id_zst))continue
   const basis=`zst_nr='${st.id_zst}' AND traffictype='Velo'`,url=BS+'100013/records?'+new URLSearchParams({where:basis,order_by:'datetimefrom DESC',limit:'1'})
   const neu=await holeJson<{results:BsZeile[]}>(url,15000),datum=neu.results[0]?.date;if(!/^\d{2}\.\d{2}\.\d{4}$/.test(datum??''))continue
   const werte:BsZeile[]=[];let total=Infinity,abfrage=''
   while(werte.length<total){abfrage=BS+'100013/records?'+new URLSearchParams({where:`${basis} AND date='${datum}'`,order_by:'datetimefrom DESC',limit:'100',offset:String(werte.length)});const d=await holeJson<{total_count:number;results:BsZeile[]}>(abfrage,15000);total=d.total_count;if(total>1000||!d.results.length)throw Error('Velozählung Basel: Antwort unvollständig');werte.push(...d.results)}
   aus.push({id:'bs.velo:'+st.id_zst,name:st.name,punkt:st.geo_point_2d,quelle:'Basel-Stadt · Velozählung',url:abfrage,...bsTageswerte(werte),abgerufen,datenstand:datum+' (Messwerte)',hinweis:'Zählstelle in der Nähe; keine Übertragung auf den ganzen Abschnitt. Summe der vorhandenen Stundenwerte je Spur; fehlende Werte nicht ergänzt. Kein Jahres-DTV.'})
  }
 }else{
  const fs=await arcgisGeojson<{geometry?:{coordinates:number[]};properties:Record<string,unknown>}>(LU_VELO,{where:'1=1',geometry:`${b.w},${b.s},${b.e},${b.n}`,geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'*',returnGeometry:'true',outSR:'4326'})
  for(const f of fs){const p=f.properties,g=f.geometry?.coordinates;if(!g||!nah({lon:g[0],lat:g[1]},cs))continue;const dtv=zahl(p.DTV),ohne=/keine Messdaten|Baustellenbetrieb/i.test(String(p.BEMERKUNG??''))
   aus.push({id:'lu.velo:'+String(p.NUMMER_VERKZAEHLER),name:String(p.ORTSBEZ??p.NUMMER_VERKZAEHLER),punkt:{lon:g[0],lat:g[1]},quelle:'Kanton Luzern · Velozählung',url:LU_VELO,datum:'Bezugsjahr im Objekt nicht ausgewiesen',abgerufen,datenstand:'unbekannt',werte:[{richtung:'Querschnitt (Richtungsbezug im Objekt nicht ausgewiesen)',anzahl:ohne||dtv===0?null:dtv,intervalle:0,einheit:'Velos/Tag laut Anbieter',validierung:String(p.BEMERKUNG??'nicht ausgewiesen')}],hinweis:'Zählstelle in der Nähe; räumliche Zuordnung und Bezugsjahr anhand des amtlichen Objektblatts prüfen. Null bei fehlenden Messdaten wird nicht als verkehrsfreie Situation interpretiert.'})
  }
 }
 for(const d of aus)meldeQuelleStand(d.id,d.quelle+' · '+d.name,d.url,'velozaehlungen',d.datenstand,d.abgerufen,generation)
 return aus
 }catch(e){meldeQuellenFehler('velo.'+stadt,'Velozählungen · '+stadt,stadt==='zurich'?ZH:stadt==='basel'?BS+'100013':LU_VELO,'velozaehlungen',e,generation);return aus}
}
