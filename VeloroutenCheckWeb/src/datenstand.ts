import { avPublikationsstaende, bernProduktStand, bernProduktUrl, AV_STAENDE_URL } from './e5/daten/anbieter/gemeinsam/metadaten'
import { zhDatenstand } from './e5/daten/anbieter/gemeinsam/zuerich'
import { npvmMetadaten } from './e5/daten/anbieter/npvm'

export interface DatenStand { id: string; name: string; url: string; ebene?: string; datenstand: string; vollstaendigkeit: string; abgerufen: string; status: 'geladen'|'teilweise'|'fehler'; fehler?: string; geladeneZellen?: number; teilfehler?: { zelle: string; url: string; fehler: string }[] }
let liste: DatenStand[] = []
const listener = new Set<()=>void>()
const metadata = new Map<string,Promise<Partial<DatenStand>>>()
let lauf = 0
export const datenGeneration = () => lauf
export const datenStaende = () => liste
export const standAbonnieren = (f:()=>void) => {listener.add(f);return ()=>{listener.delete(f)}}
interface TeilQuelle { zelle: string; url: string; datenstand: string; abgerufen: string; fehler?: string }
let teilQuellen = new Map<string, Map<string, TeilQuelle>>()
let uebernommeneListe = liste
let uebernommeneTeile = teilQuellen
let uebernahmeOffen = false
const kopieTeile = () => new Map([...teilQuellen].map(([id, teile]) => [id, new Map(teile)]))
function merkenUebernommen() { uebernommeneListe = liste; uebernommeneTeile = kopieTeile() }
function eintragen(v: DatenStand) {
 liste = [...liste.filter(x => x.id !== v.id), v].sort((a, b) => a.name.localeCompare(b.name, 'de-CH'))
 if (!uebernahmeOffen) merkenUebernommen()
 for (const f of listener) f()
}
/** Ein gemeinsamer Zähler für App, Netzabrufe und Ebenen. Eine ersetzte, offene Ladung wird verworfen. */
export function datenlaufNeu(optionen: { behalten?: boolean; uebernahmeAbwarten?: boolean } = {}): number {
 lauf++; metadata.clear()
 liste = optionen.behalten ? uebernommeneListe : []
 teilQuellen = optionen.behalten ? new Map([...uebernommeneTeile].map(([id, teile]) => [id, new Map(teile)])) : new Map()
 uebernahmeOffen = optionen.uebernahmeAbwarten ?? false
 merkenUebernommen()
 for (const f of listener) f()
 return lauf
}
/** Quellenstände werden nur zusammen mit den zugehörigen Ebenen als übernommen gemerkt. */
export function datenlaufUebernehmen(generation: number, anwenden: () => void): boolean {
 if (generation !== lauf) return false
 anwenden()
 uebernahmeOffen = false
 merkenUebernommen()
 return true
}
/** Ein Dienst, mehrere örtliche Abfragen: Erfolge zählen, Teilfehler einzeln erhalten. */
export function meldeTeilQuelle(id: string, name: string, url: string, ebene: string, teil: TeilQuelle, generation: number) {
 if (generation !== lauf) return
 const teile = new Map(teilQuellen.get(id) ?? [])
 teile.set(teil.zelle, teil); teilQuellen.set(id, teile)
 const alle = [...teile.values()].sort((a, b) => a.zelle.localeCompare(b.zelle, 'de-CH', { numeric: true }))
 const gut = alle.filter(t => !t.fehler), schlecht = alle.filter(t => t.fehler)
 eintragen({ id, name, url, ebene, datenstand: gut.length ? [...new Set(gut.map(t => t.datenstand))].join(' / ') : 'unbekannt',
  vollstaendigkeit: 'unbekannt', abgerufen: alle.map(t => t.abgerufen).sort()[alle.length - 1],
  status: gut.length ? schlecht.length ? 'teilweise' : 'geladen' : 'fehler', geladeneZellen: gut.length,
  teilfehler: schlecht.map(t => ({ zelle: t.zelle, url: t.url, fehler: t.fehler! })) })
}
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
const datum=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}(T|$)/.test(x)&&Number.isFinite(Date.parse(x))?x.slice(0,10).split('-').reverse().join('.'):null
const TAG_FORM={day:'2-digit',month:'2-digit',year:'numeric'} as const
/** Datum und Zeit einheitlich mit zweistelligem Tag und Monat, wie das Datum des Berichts */
export const zeitText=(x:string|number)=>new Date(x).toLocaleString('de-CH',{...TAG_FORM,hour:'2-digit',minute:'2-digit',second:'2-digit'})
const tag=(x:unknown)=>typeof x==='number'&&x>0&&Number.isFinite(x)?new Date(x).toLocaleDateString('de-CH',TAG_FORM):null
/** Dienstnamen stehen ohne Umlaute im Pfad; im Bericht in normaler Schreibweise */
const dienstName=(x:string)=>x.replace(/Hoechst/g,'Höchst').replace(/Flaechen/g,'Flächen').replace(/Parkplaetze/g,'Parkplätze').replace(/oeffentlich/g,'öffentlich').replace(/\bOeV\b/g,'ÖV')
const STADT_NAME:Record<string,string>={bern:'Bern',zurich:'Zürich',basel:'Basel',luzern:'Luzern'}
const stadtName=(x:string)=>STADT_NAME[x]??x
function quelle(url:string):Pick<DatenStand,'id'|'name'|'url'|'ebene'> {
 const u=new URL(url,typeof location==='object'?location.href:'https://veloroutencheck.ch/'),p=u.pathname,q=u.searchParams
 const typ=q.get('TYPENAMES')??q.get('typeNames')??q.get('typeName')??q.get('TYPENAME')??''
 if(/\/1\.0\.0\//.test(p)){const layer=p.split('/1.0.0/')[1].split('/')[0];return{id:layer,name:layer.includes('swissimage')?'Luftbild SWISSIMAGE · swisstopo':layer,url,ebene:layer.includes('swissimage')?'orthofoto':layer.includes('relief')?'relief':layer.includes('astra')?'unfaelle':undefined}}
 if(p.endsWith('/WMSServer'))return{id:u.origin+p,name:u.hostname.includes('bern')?'Geoportal Stadt Bern: '+p.split('/Geoportal/')[1]?.split('/')[0]:u.hostname+' · Kartenbild',url,ebene:'kartenbild'}
 if(/interpreter/.test(p))return{id:'osm',name:'OpenStreetMap (Overpass)',url,ebene:'osm'}
 const arc=p.match(/\/(?:MapServer|FeatureServer)(?:\/(\d+))?(?:\/query)?$/)
 if(arc){const base=u.origin+p.replace(/\/query$/,'');const dienst=p.match(/(?:Geoportal|OGD)\/([^/]+)/)?.[1]?.replace(/_/g,' ')??p.split('/').filter(x=>!['query','MapServer','FeatureServer'].includes(x)&&!/^\d+$/.test(x)).pop()??'Dienst'
  return{id:base,name:`${u.hostname.includes('bern.ch')?'Geoportal Stadt Bern':u.hostname.includes('stadtluzern')?'Stadt Luzern':'Kanton Luzern'}: ${dienstName(dienst)}`,url,ebene:/Signalisierte|geschwindigkeit/i.test(p)?'tempo':/Verkehrsdaten_Tram/i.test(p)?'tram':/Richtplan_Fussverkehr/i.test(p)?'fussnetz':/Velostrassen/i.test(p)?'velostrasse':/verkehrszaehl|Verkehrsdaten/i.test(p)?'dtv':/strassenachse|hierarchie/i.test(p)?'hierarchie':/lichtsignal/i.test(p)?'lsa':/zone/i.test(p)?'zonen':/Haltestellen/i.test(p)?'haltestellen':/OeV_Linien/i.test(p)?'oev':/park/i.test(p)?'parkfelder':/Velorout|velonetz/i.test(p)?'routennetz':undefined}}
 if(p.endsWith('/WFSServer')&&u.hostname.includes('bern.ch')){const dienst=p.match(/Geoportal\/([^/]+)/)?.[1]?.replace(/_/g,' ')??'WFS';return{id:u.origin+p,name:`Geoportal Stadt Bern: ${dienstName(dienst)}`,url,ebene:/park/i.test(p)?'parkfelder':undefined}}
 const ds=p.match(/\/datasets\/([^/]+)/)?.[1]
 if(ds)return{id:`${u.origin}/datasets/${ds}`,name:`Basel-Stadt: Datensatz ${ds}`,url,ebene:ds==='100250'?'tempo':ds==='100430'?'lsa':ds==='100426'?'velostrasse':undefined}
 if(/geodienste\.ch/.test(u.hostname))return{id:'av',name:'Amtliche Vermessung (geodienste.ch)',url,ebene:'av'}
 if(p.includes('/wfs/')||p.includes('/wms/')){const dienst=p.split('/').pop()??typ;return{id:u.origin+p+'|'+typ,name:`${u.hostname.includes('stadt-zuerich')?'Stadt Zürich':'Kanton Zürich'}: ${dienst}${typ?' · '+typ:''}`,url,ebene:/Geschwindigkeiten|0450/.test(url)?'tempo':/Verkehrszonen/.test(url)?'zonen':/Strassenklassierung/.test(url)?'hierarchie':/0223/.test(url)?'dtv':/Parkplatz|Parkplaetze/.test(url)?'parkfelder':/Velonetz/.test(url)?'routennetz':undefined}}
 const layer=(q.get('layers')??q.get('LAYERS'))?.replace(/^all:/,'')??p.match(/MapServer\/([^/]+)\/legend/)?.[1]
 if(layer)return{id:layer,name:layer==='ch.are.belastung-personenverkehr-strasse'?'ARE: NPVM (modelliert)':layer,url,ebene:layer.includes('belastung')?'npvm':layer.includes('astra')?'unfaelle':undefined}
 const file=p.split('/').pop()??p
 return{id:u.origin+p,name:p.includes('profile')?'Höhenprofile · swisstopo':/oev_takt/.test(file)?'ÖV-Takt · Fahrplandaten '+stadtName(file.replace('oev_takt_','').replace('.json','')):/obs_/.test(file)?'Überholabstände · OpenBikeSensor '+stadtName(file.replace('obs_','').replace('.json','')):/luftbild_/.test(file)?'Velostreifen · Luftbild-Erkennung '+stadtName(file.replace('luftbild_','').replace('.json','')):/velostreifen_/.test(file)?'Velostreifen · lokale Markierungsauswertung':/\.json$/.test(file)?file:p.includes('SearchServer')?'swisstopo: Strassen-/Adresssuche':u.hostname+' '+file,url,ebene:/velostreifen_/.test(file)?'markierung':/oev_takt/.test(file)?'haltestellen':/dtv_/.test(file)?'dtv':/luftbild/.test(file)?'luftbild':/obs_/.test(file)?'obs':/profile/.test(file)?'steigung':undefined}
}
async function roh(url:string):Promise<unknown> {const c=new AbortController(),t=setTimeout(()=>c.abort(),9000);try{const r=await fetch(url,{signal:c.signal,cache:'no-store'});if(!r.ok)throw Error(String(r.status));return /services\.csv|\/legend/.test(url)?await r.text():await r.json()}finally{clearTimeout(t)}}
export async function quelleMetadaten(url:string,daten:unknown):Promise<Partial<DatenStand>> {
 const u=new URL(url,typeof location==='object'?location.href:'https://veloroutencheck.ch/'),p=u.pathname
 if(u.hostname==='map.bern.ch'){
  const name=p.match(/Geoportal\/([^/]+)/)?.[1]??u.searchParams.get('TYPENAMES')?.split(':')[0]?.replace(/^Geoportal_/,'')
  if(name){const d=await roh(bernProduktUrl(name));return{datenstand:bernProduktStand(d,name)??'unbekannt (Produktmetadaten ohne Standdatum)'}}
 }
 if(/geodienste\.ch/.test(u.hostname)){
  const kantone=obj(daten)&&Array.isArray(daten.features)?[...new Set(daten.features.flatMap(f=>obj(f)&&obj(f.properties)&&typeof f.properties.Kanton==='string'?[f.properties.Kanton]:[]))]:[]
  if(kantone.length)return avPublikationsstaende(String(await roh(AV_STAENDE_URL)),kantone)
 }
 if(u.hostname.includes('stadt-zuerich.ch')&&(p.includes('/wfs/')||p.includes('/wms/'))){
  const dienst=p.split('/').pop()!.toLowerCase(),d=await roh(`https://data.stadt-zuerich.ch/api/3/action/package_show?id=geo_${dienst}`),stand=zhDatenstand(d)
  return{datenstand:stand?`${stand.split('-').reverse().join('.')} (Katalogaktualisierung)`:'unbekannt (Katalog ohne verwendbares Standdatum)'}
 }
 if(/\/(?:MapServer|FeatureServer)(?:\/\d+)?(?:\/query)?$/.test(p)){
  const d=await roh(u.origin+p.replace(/\/query$/,'')+'?f=json')
  const stand=obj(d)&&obj(d.editingInfo)?tag(d.editingInfo.lastEditDate):null
  return{datenstand:stand?stand+' (Objektaktualisierung)':'unbekannt (Dienst ohne verwendbares Standdatum)'}
 }
 const ds=p.match(/\/datasets\/([^/]+)/)?.[1]
 if(ds){const d=await roh(`${u.origin}/api/explore/v2.1/catalog/datasets/${ds}`),m=obj(d)&&obj(d.metas)&&obj(d.metas.default)?d.metas.default:null
  const stand=m?datum(m.data_processed??m.modified):null;return{datenstand:stand?stand+' (Katalog-/Datenaktualisierung)':'unbekannt'}}
 const layer=(u.searchParams.get('layers')??u.searchParams.get('LAYERS'))?.replace(/^all:/,'')??p.match(/\/1\.0\.0\/([^/]+)/)?.[1]??p.match(/MapServer\/([^/]+)\/legend/)?.[1]
 if(layer){const d=await roh(`https://api3.geo.admin.ch/rest/services/api/MapServer/${layer}/legend?lang=de`),m=npvmMetadaten(String(d))
  return{datenstand:m.datenstand?m.datenstand.split('-').reverse().join('.')+' (Ebene)'+(m.bezugsjahr?`; Bezugsjahr ${m.bezugsjahr}`:''):'unbekannt'}}
 return{}
}
/** Tatsächlichen Abrufzeitpunkt melden. Metadaten machen aus Fehlern oder leeren Antworten keinen positiven Befund. */
export function meldeAbruf(url:string,res:Response|null,daten?:unknown,fehler?:unknown,generation=lauf) {
 if(generation!==lauf)return
 const q=quelle(url),abgerufen=new Date().toISOString()
 if(q.id==='av'&&obj(daten)&&Array.isArray(daten.features)){const kantone=[...new Set(daten.features.flatMap(f=>obj(f)&&obj(f.properties)&&typeof f.properties.Kanton==='string'?[f.properties.Kanton]:[]))].sort();if(kantone.length)q.id+=':'+kantone.join(',')}
 let stand='unbekannt'
 if(obj(daten)&&obj(daten.osm3s)&&typeof daten.osm3s.timestamp_osm_base==='string')stand=/^\d+$/.test(daten.osm3s.timestamp_osm_base)?'unbekannt':`${daten.osm3s.timestamp_osm_base} (OSM-Datenbankstand)`
 if(obj(daten)){const s=datum(daten.datenstand??daten.stand);if(s)stand=s+' (Dateiangabe)'}
 if(stand==='unbekannt'&&res?.headers?.get('Last-Modified')&&/\.json$/.test(new URL(url, 'https://veloroutencheck.ch').pathname)){
  const t=Date.parse(res.headers.get('Last-Modified')!);if(Number.isFinite(t))stand=new Date(t).toLocaleDateString('de-CH',TAG_FORM)+' (Bereitstellung der Datei; fachlicher Stand unbekannt)'
 }
 const v:DatenStand={...q,abgerufen,datenstand:stand,vollstaendigkeit:'unbekannt',status:fehler?'fehler':'geladen',...(fehler?{fehler:String(fehler)}:{})}
 eintragen(v)
 if(fehler || typeof window==='undefined')return
 if(!metadata.has(q.id))metadata.set(q.id,quelleMetadaten(url,daten).catch(()=>({datenstand:'unbekannt (Metadaten nicht verfügbar)'})))
 void metadata.get(q.id)!.then(m=>{if(generation!==lauf)return;const jetzt=liste.find(x=>x.id===q.id);if(jetzt?.abgerufen===abgerufen)eintragen({...jetzt,...m})})
}
export function standText(s: DatenStand, teilfehlerZeigen = true): string {
 const basis = `Datenstand ${s.datenstand}; Vollständigkeit ${s.vollstaendigkeit}; Abruf ${zeitText(s.abgerufen)}`
 const ausfall = s.fehler ? `; nicht geladen: ${s.fehler}` : ''
 if (s.geladeneZellen === undefined) return basis + ausfall
 const teile = s.teilfehler ?? []
 const details = teilfehlerZeigen ? teile.map(t => `Zelle ${t.zelle}: ${t.fehler}`).join(' · ') : 'Details unten'
 return basis + ausfall + `; nur Kartenkontext; ${s.geladeneZellen} Zellen geladen` +
  (teile.length ? `; ${teile.length} Zellen nicht geladen: ${details}` : '')
}
export function ebenenStandText(ebene:string):string {const ss=liste.filter(s=>s.ebene===ebene);return ss.length?ss.map(s=>`${s.name}: ${standText(s)}`).join(' · '):'Datenstand unbekannt; Vollständigkeit unbekannt; noch nicht abgerufen'}

export function meldeQuelleStand(id:string,name:string,url:string,ebene:string,datenstand:string,abgerufen=new Date().toISOString(),generation=lauf) {if(generation!==lauf)return;eintragen({id,name,url,ebene,datenstand,abgerufen,vollstaendigkeit:'unbekannt',status:'geladen'})}

/** Dargestellten Bilddienst melden; dessen Metadaten werden unabhängig von den Bildpixeln geladen. */
export function meldeKartenbild(url:string) { meldeAbruf(url,null) }
export function meldeQuellenFehler(id:string,name:string,url:string,ebene:string,fehler:unknown,generation=lauf) {if(generation!==lauf)return;eintragen({id,name,url,ebene,datenstand:'unbekannt',vollstaendigkeit:'unbekannt',abgerufen:new Date().toISOString(),status:'fehler',fehler:String(fehler)})}

export function quellenFehlerEntfernen(id:string) { if(liste.some(s=>s.id===id&&s.status==='fehler')){liste=liste.filter(s=>s.id!==id);if(!uebernahmeOffen)merkenUebernommen();for(const f of listener)f()} }
