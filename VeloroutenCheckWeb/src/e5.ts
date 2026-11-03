import type { Quelle } from './strecke'
import type { Cand } from './VeloMap'
import type { Stadt } from './fuehrungsform'
import type { EbenenDaten } from './ebenen'
import { arcgisGeojson, holeJson } from './netz'
import { densify, distPointToLineM, type LL } from './geo'
import { lv95, wgs, add, sub, einheit, imPolygon, type P } from './e5/geo'
import { ladeZuerich, zhStandText, type ZuerichSnapshot } from './e5/daten/anbieter/gemeinsam/zuerich'
import { zuerichEntlang, type ZhStrasse } from './e5/daten/anbieter/gemeinsam/zuerichZuordnung'
import { ladeNpvm, npvmStandText, type NpvmSnapshot } from './e5/daten/anbieter/npvm'
import { npvmZuordnen } from './e5/daten/anbieter/npvmZuordnung'
import { bestOverlapValue, type GeoJsonFeature } from './cityShared'
import { meldeQuelleStand, datenStaende, datenGeneration, meldeQuellenFehler, quellenFehlerEntfernen } from './datenstand'

export type E5Feld = 'speed'|'dtv'|'hierarchie'|'verkehrszone'
export interface E5Beleg { feld:E5Feld; wert:number|string; quelle:string; quelleId:string; datenstand:string; abgerufen:string; url:string; objekte:string[]; hinweis:string; modell?:boolean; bestaetigt?:boolean; herkunft?:'abgeleitet' }
/** Quellenwahl behält die Herkunft des Belegs und ist keine menschliche Bestätigung. */
export const e5BelegQuelle = (b: E5Beleg): Quelle => b.herkunft === 'abgeleitet' ? 'abgeleitet' : (b.modell ? 'modell' : b.quelleId === 'osm' ? 'osm' : 'amtlich')
/** Derselbe Ausfalltext wird bei bewusster Wahl einer anderen Quelle gezielt entfernt. */
export const e5QuellenAusfall = (b: E5Beleg): string => `Die gewählte Quelle ${b.quelle} für ${b.feld==='dtv'?'Motorfahrzeug-DTV':'Tempo'} ist aktuell nicht verfügbar. Die davon abhängige Bewertung bleibt offen; andere Quellen stehen nur als Alternative zur Wahl.`
export interface E5Daten { belege:Partial<Record<E5Feld,E5Beleg>>; vorschlaege:E5Beleg[]; hinweise:string[]; tempoOffen?:boolean }
export const e5Leer=():E5Daten=>({belege:{},vorschlaege:[],hinweise:[]})
const ll=(p:P):LL=>{const[lat,lon]=wgs(...p);return{lat,lon}}
const tile=(p:P)=>{const mitte:P=[Math.floor(p[0]/400)*400+200,Math.floor(p[1]/400)*400+200];return{key:mitte.join(','),mitte}}
export const e5Proben=(c:Cand)=>{
 const ps=densify(c.geom,15).map(p=>lv95(p.lat,p.lon))
 return ps.map((p,i)=>({p,richtung:einheit(sub(ps[Math.min(i+1,ps.length-1)],ps[Math.max(0,i-1)]))}))
}
const xmlZahl=(s:string)=>s.match(/numberOfFeatures=["'](\d+)["']/)?.[1]
async function zhKlassierung(mitte:P):Promise<GeoJsonFeature[]> {
 const q=new URLSearchParams({SERVICE:'WFS',VERSION:'1.1.0',REQUEST:'GetFeature',TYPENAME:'view_strassenklassierung',SRSNAME:'EPSG:2056',OUTPUTFORMAT:'GeoJSON',MAXFEATURES:'2001',BBOX:`${mitte[0]-350},${mitte[1]-350},${mitte[0]+350},${mitte[1]+350},EPSG:2056`})
 const url='https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Strassenklassierung?'+q
 const r=await holeJson<{features?:GeoJsonFeature[];crs?:{properties?:{name?:string}}}>(url,20000)
 const hits=new URL(url);hits.searchParams.set('RESULTTYPE','hits');hits.searchParams.delete('OUTPUTFORMAT')
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000)
 let n:string|undefined
 try{const h=await fetch(hits,{signal:ctrl.signal,cache:'no-store'});if(!h.ok)throw Error('Zürich: Zählantwort fehlt');n=xmlZahl(await h.text())}finally{clearTimeout(timer)}
 if(!/2056$/.test(r.crs?.properties?.name??'')||!r.features||r.features.length>2000||n===undefined||Number(n)!==r.features.length)throw Error('Zürich: Klassierung unvollständig')
 const konv=(z:number[][])=>z.map(p=>{const[lat,lon]=wgs(p[0],p[1]);return[lon,lat]})
 return r.features.map(f=>({...f,geometry:f.geometry?.type==='LineString'?{type:'LineString',coordinates:konv(f.geometry.coordinates as number[][])}:
  f.geometry?.type==='MultiLineString'?{type:'MultiLineString',coordinates:(f.geometry.coordinates as number[][][]).map(konv)}:null}))
}
const LU='https://map.stadtluzern.ch/server/rest/services/OGD/'
export const E5_LU={zonen:LU+'verkehrsberuhigte_zone/FeatureServer/16/query',hierarchie:LU+'strassenachse/FeatureServer/0/query',lsa:LU+'lichtsignalanlage/FeatureServer/2/query'}
function bbox(cs:Cand[]){const ps=cs.flatMap(c=>c.geom);return{w:Math.min(...ps.map(p=>p.lon))-.001,s:Math.min(...ps.map(p=>p.lat))-.001,e:Math.max(...ps.map(p=>p.lon))+.001,n:Math.max(...ps.map(p=>p.lat))+.001}}
async function luDaten(url:string,b:ReturnType<typeof bbox>):Promise<GeoJsonFeature[]> {return arcgisGeojson<GeoJsonFeature>(url,{where:'1=1',geometry:`${b.w},${b.s},${b.e},${b.n}`,geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'*',returnGeometry:'true',outSR:'4326'},20000)}
export function e5Zone(p:Record<string,unknown>):'Tempo-30-Zone'|'Begegnungszone'|'Fussgängerzone'|null {
 const t=String(p.PP_ZONE_TEXT??p.zonentyp??'')
 if(/projekt|geplant|aufgehoben/i.test(t)||!/^Bestehende|^Tempo|^Begegnung|^Fussg/i.test(t))return null
 return /begegnung/i.test(t)?'Begegnungszone':/fussg/i.test(t)?'Fussgängerzone':/tempo\s*30/i.test(t)?'Tempo-30-Zone':null
}
function zoneInnen(f:GeoJsonFeature,p:P){const g=f.geometry;if(!g)return false;const ps=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[]
 return (ps as unknown as number[][][][]).some(poly=>imPolygon(p,poly.map(r=>r.map(([lon,lat])=>lv95(lat,lon))))) }
// Manche WFS-Datensätze führen ihren Schlüssel am Objekt statt in dessen Eigenschaften.
// Ein stabiler Rückfall auf die Geometrie verhindert, dass fremde Objekte auf der Karte zusammenfallen.
const id=(f:GeoJsonFeature)=>String(f.id??f.properties.OBJECTID??f.properties.objectid??f.properties.geodb_oid??f.properties.id??JSON.stringify(f.geometry))
function beleg(feld:E5Feld,wert:number|string,quelle:string,quelleId:string,url:string,hinweis='',objekte:string[]=[]):E5Beleg{return{feld,wert,quelle,quelleId,url,hinweis,objekte,datenstand:'unbekannt',abgerufen:new Date().toISOString()}}
export function npvmFuerCand(c:Cand,snapshots:readonly NpvmSnapshot[]):E5Beleg|null {
 if(c.ohneFahrbahn||c.osmTags?.bridge==='yes'||c.osmTags?.tunnel==='yes'||c.osmTags?.layer&&c.osmTags.layer!=='0')return null
 const ps=e5Proben(c);if(ps.length<2)return null
 const distanzen=[0];for(let i=1;i<ps.length;i++)distanzen.push(distanzen[i-1]+Math.hypot(ps[i].p[0]-ps[i-1].p[0],ps[i].p[1]-ps[i-1].p[1]))
 // Die gemeinsame Zuordnung prüft 12 m je Seite. An Strassenenden fehlt dieser
 // Bezug; geprüft wird darum das Innere, einschliesslich beider Enden des nutzbaren Bereichs.
 const innen=ps.filter((_,i)=>distanzen[i]>=15&&distanzen[distanzen.length-1]-distanzen[i]>=15)
 if(innen.length<2)return null
 const basis=innen.filter((_,i)=>i===0||i===innen.length-1||i%2===0)
 const treffer=basis.map(({p,richtung})=>{const s=snapshots.find(s=>Math.max(Math.abs(s.mitte[0]-p[0]),Math.abs(s.mitte[1]-p[1]))+40<=s.radiusM);if(!s)return null
  const n:P=[-richtung[1],richtung[0]],v=npvmZuordnen(s,[add(p,n,-12),add(p,n,12)],[c.geom.map(x=>lv95(x.lat,x.lon))])
  return v.beleg?{s,b:v.beleg}:null})
 if(treffer.some(t=>!t)||!treffer.length)return null
 const ts=treffer as {s:NpvmSnapshot;b:NonNullable<ReturnType<typeof npvmZuordnen>['beleg']>}[]
 if(new Set(ts.map(t=>`${t.b.nr}:${t.b.wert}`)).size!==1)return null
 const t=ts[0];return{...beleg('dtv',t.b.wert,'ARE · NPVM 2023 (modelliert)','are.npvm',t.s.url,'Modellierter DTV beider Richtungen; Zuordnung und Übernahme bestätigen.',ts.map(t=>t.b.linie)),datenstand:`${npvmStandText(t.s)} (Ebene); Bezugsjahr ${t.s.bezugsjahr}`,abgerufen:t.s.abgerufen,modell:true}
}
/** Nur die E5-Dienste der gewählten Stadt und der tatsächlichen Strassensegmente; kein allgemeines Anbieterverzeichnis. */
export async function enrichE5(cs:Cand[],stadt:Stadt|'schweiz'):Promise<{cands:Cand[];ebenen:EbenenDaten;fehler:string[]}> {
 const generation=datenGeneration()
 if(!cs.length)return{cands:cs,ebenen:{},fehler:[]}
 const fehler:string[]=[],ebenen:EbenenDaten={},roads=cs.filter(c=>!c.ohneFahrbahn),b=bbox(cs)
 const vorbereitungen=new Map<string,P>();for(const c of roads)for(const p of e5Proben(c)){const t=tile(p.p);vorbereitungen.set(t.key,t.mitte)}
 const mitte=[...vorbereitungen.values()].slice(0,16)
 if(vorbereitungen.size>16)fehler.push('E5: grosser Ausschnitt, Zusatzquellen auf 16 Teilgebiete begrenzt; übrige Abschnitte offen')
 const zh=new Map<string,ZuerichSnapshot>(),klassen:GeoJsonFeature[]=[],npvm:NpvmSnapshot[]=[]
 let zonen:GeoJsonFeature[]=[],lsa:GeoJsonFeature[]=[]
 const versuchen=async<T>(name:string,f:()=>Promise<T>,leer:T)=>{const id='e5.fehler.'+name;try{const r=await f();if(generation===datenGeneration())quellenFehlerEntfernen(id);return r}catch(e){fehler.push(name);const thema=/NPVM/.test(name)?'npvm':/Tempo/.test(name)?'tempo':/zonen/i.test(name)?'zonen':/hierarchie|klassierung/i.test(name)?'hierarchie':'lsa';const url=/ARE/.test(name)?'https://api3.geo.admin.ch/rest/services/api/MapServer/ch.are.belastung-personenverkehr-strasse':/Zürch/.test(name)?'https://data.stadt-zuerich.ch/':/Luzern/.test(name)?'https://map.stadtluzern.ch/':'https://data.bs.ch/explore/dataset/100430/';meldeQuellenFehler(id,name,url,thema,e,generation);return leer}}
 if(stadt==='zurich'){
  // Höchstens drei Kacheln gleichzeitig, damit der Browser Kapazität für die Grunddaten behält.
  for(let i=0;i<mitte.length;i+=3)await Promise.all(mitte.slice(i,i+3).map(async m=>{
   const [t,z,k]=await Promise.all([versuchen('Zürcher Tempo',()=>ladeZuerich('tempo',m,350),null),versuchen('Zürcher Verkehrszonen',()=>ladeZuerich('zonen',m,350),null),versuchen('Zürcher Strassenklassierung',()=>zhKlassierung(m),[])])
   const s:ZuerichSnapshot={version:1,mitte:m,radiusM:350,...(t?{tempo:t.daten}:{}),...(z?{zonen:z.daten}:{})};zh.set(tile(m).key,s);klassen.push(...k)
   for(const [art,v] of [['tempo',s.tempo],['zonen',s.zonen]] as const)if(v){meldeQuelleStand('zh.'+art,`Stadt Zürich: ${art==='tempo'?'Signalisierte Geschwindigkeiten':'Verkehrszonen'}`,v.url,art,zhStandText(v),v.abgerufen,generation)
    if(art==='tempo')ebenen.tempo=[...(ebenen.tempo??[]),...(s.tempo?.objekte??[]).map(o=>({id:o.id,linien:o.teile.map(l=>l.map(ll)),klasse:o.tempo==null?'offen':o.tempo<=20?'t20':o.tempo<=30?'t30':o.tempo<=40?'t40':o.tempo<=50?'t50':'t60',wert:o.tempo==null?o.regime:String(o.tempo),text:`Stadt Zürich: ${o.regime}; ${zhStandText(v)}`}))]
    else ebenen.zonen=[...(ebenen.zonen??[]),...(s.zonen?.objekte??[]).flatMap(o=>o.polygone.map((poly,i)=>({id:o.id+':'+i,ringe:poly.map(r=>r.map(ll)),klasse:o.art??'offen',text:`Stadt Zürich: ${o.regime}; ${zhStandText(v)}`})))]
   }
  }))
 }else if(stadt==='luzern'){
  [zonen,lsa]=await Promise.all([versuchen('Luzerner Verkehrszonen',()=>luDaten(E5_LU.zonen,b),[]),versuchen('Luzerner Lichtsignalanlagen',()=>luDaten(E5_LU.lsa,b),[])])
  klassen.push(...await versuchen('Luzerner Strassenhierarchie',()=>luDaten(E5_LU.hierarchie,b),[]))
  ebenen.zonen=zonen.flatMap(f=>{
   const g=f.geometry,polys=(g?.type==='Polygon'?[g.coordinates]:g?.type==='MultiPolygon'?g.coordinates:[]) as unknown as number[][][][]
   return polys.map((poly,i)=>({id:`lu.zone:${id(f)}:${i}`,ringe:poly.map(r=>r.map(([lon,lat])=>({lon,lat}))),klasse:e5Zone(f.properties)??'offen',text:`Stadt Luzern: ${String(f.properties.PP_ZONE_TEXT??'ungeklärt')}`}))
  })
 }else if(stadt==='basel'){
  const where=`in_bbox(geo_shape,${b.s},${b.w},${b.n},${b.e})`,url='https://data.bs.ch/api/explore/v2.1/catalog/datasets/100430/records?'+new URLSearchParams({where,limit:'100'})
  const d=await versuchen('Basler Lichtsignalanlagen',()=>holeJson<{total_count:number;results:Record<string,unknown>[]}>(url,20000),null)
  if(d&&d.total_count<=100&&d.total_count===d.results.length)lsa=d.results.flatMap(x=>{const p=x.geo_point_2d as {lat:number;lon:number}|undefined;return p?[{geometry:{type:'Point',coordinates:[p.lon,p.lat]},properties:{BEZEICHNUNG:String(x.lg_lsaname??''),id:String(x.gml_id)}}]:[]})
  else if(d)fehler.push('Basler Lichtsignalanlagen: Ausschnitt zu gross, unvollständige Antwort verworfen')
 }
 ebenen.hierarchie=klassen.flatMap(f=>{
  const g=f.geometry,wert=String(f.properties.klassierung??f.properties.TYP??'unbekannt')
  const teile=g?.type==='LineString'?[g.coordinates]:g?.type==='MultiLineString'?g.coordinates:[]
  return (teile as number[][][]).map((l,i)=>({id:`${stadt}.hierarchie:${id(f)}:${i}`,linien:[l.map(([lon,lat])=>({lon,lat}))],klasse:'hinweis',wert,text:`${stadt==='zurich'?'Stadt Zürich':'Stadt Luzern'}: amtliche Klassierung ${wert}; Originalattribut, keine Umdeutung in eine andere Normklasse.`}))
 })
 ebenen.lsa=lsa.flatMap(f=>f.geometry?.type==='Point'?[{id:`${stadt}.lsa:${id(f)}`,punkt:{lon:(f.geometry.coordinates as number[])[0],lat:(f.geometry.coordinates as number[])[1]},klasse:'lsa',symbol:'L',text:`${stadt==='basel'?'Basel-Stadt':'Stadt Luzern'}: ${String(f.properties.BEZEICHNUNG??'Lichtsignalanlage')}; Anlagenpunkt, keine Signalgruppe.`}]:[])
 const missing=roads,npTiles=new Map<string,P>();for(const c of missing)for(const p of e5Proben(c)){const t=tile(p.p);npTiles.set(t.key,t.mitte)}
 const nps=[...npTiles.values()].slice(0,16)
 for(let i=0;i<nps.length;i+=3)await Promise.all(nps.slice(i,i+3).map(async p=>{const [lat,lon]=wgs(...p),d=await versuchen('ARE NPVM',()=>ladeNpvm(lat,lon,350),null);if(d){npvm.push(d.daten);meldeQuelleStand('are.npvm','ARE: NPVM (modelliert)',d.daten.url,'npvm',`${npvmStandText(d.daten)} (Ebene); Bezugsjahr ${d.daten.bezugsjahr??'unbekannt'}`,d.daten.abgerufen,generation)}}))
 ebenen.npvm=npvm.flatMap(s=>s.linien.map(l=>({id:l.id,linien:l.teile.map(z=>z.map(ll)),klasse:'modell',wert:l.dtv==null?'offen':String(l.dtv),text:`ARE NPVM 2023: ${l.dtv??'offen'} Fz/Tag; modelliert, erst nach Bestätigung; Datenstand ${npvmStandText(s)}`})))
 const strassen:ZhStrasse[]=cs.map(c=>({name:c.name,tags:c.osmTags??{highway:'road'},teile:[c.geom.map(p=>lv95(p.lat,p.lon))]}))
 return{fehler:[...new Set(fehler)],ebenen,cands:cs.map(c=>{
  const e=e5Leer(),bern={...c.bern},ps=e5Proben(c)
  if(stadt==='zurich'&&!c.ohneFahrbahn&&ps.length>=2){
   const xs=ps.map(pr=>{const t=tile(pr.p),s=zh.get(t.key);return s?{s,t:zuerichEntlang(s,[pr],strassen)}:null})
   const ok=xs.length&&xs.every(x=>x?.t.status==='zugeordnet')&&new Set(xs.map(x=>x?.t.tempo)).size===1
   const x=xs[0]
   if(ok&&x&&x.t.tempo!=null){bern.speed=x.t.tempo;e.belege.speed={...beleg('speed',x.t.tempo,'Stadt Zürich · signalisierte Geschwindigkeiten','zh.tempo',x.s.tempo!.url,x.t.grund,x.t.linien),datenstand:zhStandText(x.s.tempo!),abgerufen:x.s.tempo!.abgerufen}}
   else if(xs.some(x=>x&&x.t.grund)){e.hinweise.push(...[...new Set(xs.flatMap(x=>x?[x.t.grund]:[]))]);const v=xs.find(x=>x?.t.vorschlag!=null);if(v&&v.t.vorschlag!=null)e.vorschlaege.push({...beleg('speed',v.t.vorschlag,'Stadt Zürich · zeitabhängiges Tempo','zh.tempo',v.s.tempo?.url??'',v.t.grund,v.t.linien),datenstand:zhStandText(v.s.tempo??{datenstand:null})})}
   const zs=xs.filter(x=>x?.t.zone).map(x=>x!.t.zone!)
   if(zs.length===xs.length&&new Set(zs).size===1)e.belege.verkehrszone=beleg('verkehrszone',zs[0],'Stadt Zürich · Verkehrszonen','zh.zonen',x?.s.zonen?.url??'')
  }
  const klasse=bestOverlapValue(c.geom,klassen,f=>{const name=String(f.properties.lokalisationsname??f.properties.STRASSE??'').trim();return name&&name.toLocaleLowerCase('de-CH')!==c.name.toLocaleLowerCase('de-CH')?null:String(f.properties.klassierung??f.properties.TYP??'')||null},4,.8)
  if(klasse){bern.hierarchie=klasse;e.belege.hierarchie=beleg('hierarchie',klasse,stadt==='zurich'?'Stadt Zürich · Strassenklassierung':'Stadt Luzern · Strassenhierarchie',stadt+'.hierarchie',stadt==='zurich'?'https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Strassenklassierung':E5_LU.hierarchie,'Amtliche Klassierung als Hinweis; keine automatische Umdeutung in eine andere Normklasse.')}
  if(stadt==='luzern'&&ps.length){const zs=zonen.filter(f=>ps.every(p=>zoneInnen(f,p.p))).map(f=>e5Zone(f.properties)).filter(Boolean)
   if(new Set(zs).size===1&&zs[0]){const z=zs[0];e.belege.verkehrszone=beleg('verkehrszone',z,'Stadt Luzern · Verkehrszone','lu.zone',E5_LU.zonen)
    if(z!=='Fussgängerzone')e.vorschlaege.push(beleg('speed',z==='Begegnungszone'?20:30,'Stadt Luzern · Verkehrszone','lu.zone',E5_LU.zonen,'Zonenfläche; Zuordnung und Signalisation vor Übernahme bestätigen.'))
    else e.hinweise.push('Fussgängerzone: Zulassung und Signalisation vor Ort prüfen; kein Tempo 0 annehmen.')
   }}
  const nah=(ebenen.lsa??[]).filter(l=>l.punkt&&distPointToLineM(l.punkt,c.geom)<=30);if(nah.length)e.hinweise.push(`${nah.length} amtliche Lichtsignalanlage(n) bis 30 m neben dem Abschnitt; Anlagenpunkte, keine Signalphasen.`)
  const ortName={bern:'Geoportal Stadt Bern',zurich:'Kanton Zürich · Verkehrsmessstellen',basel:'Basel-Stadt · Verkehrszählung',luzern:'Stadt Luzern · Verkehrszählung',schweiz:'örtliche Verkehrsdaten'}[stadt]
  for(const feld of ['dtv','speed'] as const) {
   const wert=bern[feld];if(!Number.isFinite(wert)||e.belege[feld])continue
   const q=datenStaende().filter(q=>q.ebene===(feld==='dtv'?'dtv':'tempo')).find(q=>stadt==='bern'?q.url.includes('bern.ch')&&(feld==='speed'||q.url.includes('Flaechendeckende')):stadt==='zurich'?q.url.includes('maps.zh.ch'):stadt==='basel'?q.url.includes(feld==='dtv'?'dtv_basel':'100250'):stadt==='luzern'?q.url.includes('stadtluzern.ch'):false)
   e.belege[feld]={...beleg(feld,wert!,feld==='dtv'?ortName:{bern:'Geoportal Stadt Bern',zurich:'Stadt Zürich',basel:'Basel-Stadt',luzern:'Stadt Luzern',schweiz:'örtliche Tempodaten'}[stadt],q?.id??stadt+'.'+feld,q?.url??'',feld==='dtv'&&stadt==='bern'?'Schätzung aus Tages- und Nachtstundenwerten (16·Nt + 8·Nn).':''),datenstand:q?.datenstand??'unbekannt',abgerufen:q?.abgerufen??new Date().toISOString(),...(feld==='dtv'&&bern.dtvQuelle==='abgeleitet'?{herkunft:'abgeleitet' as const,hinweis:'Zählstellenwert räumlich der Strasse zugeordnet; kein unmittelbar auf diesem Abschnitt erhobener Wert.'}:{})}
  }
  if(Number.isFinite(c.speed))e.vorschlaege.push(beleg('speed',c.speed!,'OpenStreetMap (OSM)','osm','https://overpass.osm.ch/api/interpreter','OSM maxspeed; Signalisation prüfen.'))
  const n=npvmFuerCand(c,npvm);if(n)e.vorschlaege.push(n)
  return{...c,bern,e5:e}
 })}
}
