import { e5BelegQuelle, e5QuellenAusfall } from './e5'
import { defaultSection, candsToSections, type Section, type QuelleFeld } from './strecke'
import type { Cand } from './VeloMap'
import type { Stadt } from './fuehrungsform'
import type { Suchgebiet } from './gebiet'
import { FUSSNETZ, TEIL_ARTEN } from './aufteilung'
import { alleHaltestellentypen } from './fuehrungsform'
import type { DatenStand } from './datenstand'
export interface Fall { format:'VeloroutenCheck'; version:1; standard:Stadt; gebiet:Suchgebiet; strasse:string; sections:Section[]; cands:Cand[]; quellen:DatenStand[] }
const stadt=(v:unknown):v is Stadt=>['bern','zurich','basel','luzern'].includes(String(v))
const objekt=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const zahl=(v:unknown)=>typeof v==='number'&&(Number.isFinite(v)||Number.isNaN(v))
const FEHLER='Keine gültige VeloroutenCheck-Falldatei (Version 1).'
/** Masse dürfen leer sein (NaN = offen), aber nicht negativ */
const mass=(v:unknown)=>zahl(v)&&!(Number(v)<0)
/** Felder mit wählbarer Quelle: Quellenangebot und Quellenwahl */
const QUELLEN_FELDER=['a.ist','a.breite','b.ist','b.breite','tram','oevAngebot']
const istForm=(v:unknown)=>['','Mischverkehr','Radstreifen','Radspur','Radweg strassenbegleitend / Geschützter Radstreifen','Radweg abgesetzt','Umweltspur','Velostrasse','Kombinierter Fuss-/Radweg','Fussweg Velo gestattet','Zweirichtungsradweg','Einbahn Velogegenverkehr ohne Markierung','Einbahn Velogegenverkehr mit Markierung','Einbahn Velogegenverkehr mit baulicher Trennung'].includes(String(v))
const quellArten=['abgeleitet','modell','bestaetigt','amtlich','osm','manuell','fahrplan','markierung','angenommen','luftbild','gemessen','av']
const quellMap=(v:unknown)=>objekt(v)&&Object.values(v).every(x=>quellArten.includes(String(x)))
const beleg=(v:unknown)=>objekt(v)&&['dtv','speed','hierarchie','verkehrszone'].includes(String(v.feld))&&['string','number'].includes(typeof v.wert)&&typeof v.quelle==='string'&&typeof v.quelleId==='string'&&typeof v.url==='string'&&typeof v.datenstand==='string'&&typeof v.abgerufen==='string'&&typeof v.hinweis==='string'&&(v.herkunft===undefined||v.herkunft==='abgeleitet')&&Array.isArray(v.objekte)&&v.objekte.every(x=>typeof x==='string')
function sichereLinks(v:unknown,tiefe=0):void {
 if(tiefe>40)throw Error(FEHLER)
 if(Array.isArray(v)){for(const x of v)sichereLinks(x,tiefe+1);return}
 if(!objekt(v))return
 for(const [k,x] of Object.entries(v)){if(k==='url'&&(typeof x!=='string'||x!==''&&!/^https?:\/\//.test(x)&&!/^\/(?!\/)/.test(x)))throw Error(FEHLER);sichereLinks(x,tiefe+1)}
}
// ── Feldweise Prüfung (Prüfung VRC-04, 10.11.2026) ──
// Jedes Feld, das die Bewertung bzw. die Planung liest, wird vor dem Typ-Cast auf seine Werteklasse geprüft: Masse endlich und
// nicht negativ (NaN = bewusst leer), Tempo und Takt über 0, Enums vollständig (auch der Haltestellentyp), Schalter als Boolean.
// Eine fehlerhafte Datei scheitert mit einer Meldung, die Abschnitt, Seite und Feld nennt. Ob eine Breite von 0 m für eine Form
// mit Breitenvorgabe genügt, entscheidet die Bewertung (VRC-03: keine Note).
class FeldFehler extends Error {}
const feldFehler=(wo:string,feld:string,grund:string)=>{throw new FeldFehler(`${FEHLER} ${wo}: Feld «${feld}» ${grund}.`)}
const leerOderMass=(v:unknown)=>typeof v==='number'&&(Number.isNaN(v)||Number.isFinite(v)&&v>=0)
const leerOderPositiv=(v:unknown)=>typeof v==='number'&&(Number.isNaN(v)||Number.isFinite(v)&&v>0)
const HS_TYPEN=()=>['keine',...alleHaltestellentypen()]
const PARKEN=['egal','ja','nein'], OEV=['keine','bus_ab15','bus_5_15','bus_unter5','tram']
function seiteFelderPruefen(x:Record<string,unknown>,wo:string){
 if(!istForm(x.ist))feldFehler(wo,'ist',`hat einen unbekannten Wert («${String(x.ist)}»)`)
 if(!leerOderMass(x.breite))feldFehler(wo,'breite','muss eine Zahl ab 0 m oder leer sein')
 if(!PARKEN.includes(String(x.parkenRechts)))feldFehler(wo,'parkenRechts','hat einen unbekannten Wert')
 if(typeof x.parkenSicherheitsstreifen!=='boolean')feldFehler(wo,'parkenSicherheitsstreifen','muss ja/nein sein')
 if(!leerOderPositiv(x.oevTakt))feldFehler(wo,'oevTakt','muss über 0 Minuten oder leer sein')
 if(!HS_TYPEN().includes(String(x.haltestellentyp)))feldFehler(wo,'haltestellentyp',`ist kein bekannter Haltestellentyp («${String(x.haltestellentyp)}»)`)
 if(!leerOderMass(x.haltestelleBreite))feldFehler(wo,'haltestelleBreite','muss eine Zahl ab 0 m oder leer sein')
 if(typeof x.ohneHaltestelle!=='boolean')feldFehler(wo,'ohneHaltestelle','muss ja/nein sein')
}
const SCHALTER=['osmVeloGegenverkehr','ohneFahrbahn','haltestellenbereich','haltestellenbereichNein','oevGegen','heuteBestaetigt']
function abschnittPruefen(s:Record<string,unknown>,nr:number){
 const wo=`Abschnitt ${nr}`
 seiteFelderPruefen(s,`${wo}, Seite A`)
 if(s.gegen!==undefined){if(!objekt(s.gegen))feldFehler(wo,'gegen','ist kein Objekt');seiteFelderPruefen(s.gegen as Record<string,unknown>,`${wo}, Seite B`)}
 if(!leerOderMass(s.dtv))feldFehler(wo,'dtv','muss eine Zahl ab 0 oder leer sein')
 if(!(typeof s.speed==='number'&&(Number.isNaN(s.speed)||Number.isFinite(s.speed)&&s.speed>0&&s.speed<=130)))feldFehler(wo,'speed','muss zwischen 0 und 130 km/h liegen oder leer sein')
 if(!leerOderMass(s.fahrbahnbreite))feldFehler(wo,'fahrbahnbreite','muss eine Zahl ab 0 m oder leer sein')
 if(!['','Veloroute','Velohauptroute'].includes(String(s.routentyp)))feldFehler(wo,'routentyp','hat einen unbekannten Wert')
 if(!['','verkehrsorientiert','siedlungsorientiert'].includes(String(s.strassentyp)))feldFehler(wo,'strassentyp','hat einen unbekannten Wert')
 if(!OEV.includes(String(s.oevAngebot)))feldFehler(wo,'oevAngebot','hat einen unbekannten Wert')
 if(!['beide','eine'].includes(String(s.richtung)))feldFehler(wo,'richtung','hat einen unbekannten Wert')
 for(const k of ['tram','dtvGeprueft'])if(typeof s[k]!=='boolean')feldFehler(wo,k,'muss ja/nein sein')
 for(const k of SCHALTER)if(s[k]!==undefined&&typeof s[k]!=='boolean')feldFehler(wo,k,'muss ja/nein sein')
 if(s.trottoirQuelle!==undefined&&!['av','manuell'].includes(String(s.trottoirQuelle)))feldFehler(wo,'trottoirQuelle','hat einen unbekannten Wert')
 if(s.parkVersetzt!==undefined&&!['a','b'].includes(String(s.parkVersetzt)))feldFehler(wo,'parkVersetzt','hat einen unbekannten Wert')
 if(s.fussnetzGeoportal!==undefined&&!(String(s.fussnetzGeoportal) in FUSSNETZ))feldFehler(wo,'fussnetzGeoportal','hat einen unbekannten Wert')
 if(s.gesamtbreite!==undefined&&!leerOderMass(s.gesamtbreite))feldFehler(wo,'gesamtbreite','muss eine Zahl ab 0 m oder leer sein')
 for(const k of ['hsTypAngenommen','radwegSeparat'])if(s[k]!==undefined&&(!objekt(s[k])||!Object.entries(s[k] as object).every(([a,v])=>['a','b'].includes(a)&&typeof v==='boolean')))feldFehler(wo,k,'muss je Seite ja/nein sein')
 if(s.trottoir!==undefined){const t=s.trottoir;if(!objekt(t)||!Object.entries(t).every(([k,v])=>['a','b','gruenA','gruenB'].includes(k)?leerOderMass(v):['parkA','parkB','wegA','wegB'].includes(k)&&typeof v==='boolean'))feldFehler(wo,'trottoir','enthält ungültige Masse oder Schalter')}
 if(s.steigung!==undefined&&(!objekt(s.steigung)||s.steigung.pct!=null&&!(typeof s.steigung.pct==='number'&&Number.isFinite(s.steigung.pct))))feldFehler(wo,'steigung','enthält keine gültige Zahl')
 for(const plan of [s.aufteilung,s.querschnittHeute] as unknown[])if(objekt(plan)&&plan.fussnetz!==undefined&&!(String(plan.fussnetz) in FUSSNETZ))feldFehler(wo,'aufteilung.fussnetz','hat einen unbekannten Wert')
}

export function fallText(f:Omit<Fall,'format'|'version'>):string {return JSON.stringify({format:'VeloroutenCheck',version:1,...f},(_k,v)=>typeof v==='number'&&Number.isNaN(v)?{$zahl:'leer'}:v,2)}
export function fallLesen(text:string):Fall {
 if(text.length>12_000_000)throw Error('Die Falldatei ist zu gross.')
 const f:unknown=JSON.parse(text,(k,v)=>{if(['__proto__','constructor','prototype'].includes(k))throw Error(FEHLER);return objekt(v)&&Object.keys(v).length===1&&v.$zahl==='leer'?NaN:v})
 if(!objekt(f)||f.format!=='VeloroutenCheck'||f.version!==1||!stadt(f.standard)||!(stadt(f.gebiet)||f.gebiet==='schweiz')||typeof f.strasse!=='string'||!Array.isArray(f.sections)||!f.sections.length||f.sections.length>200||!Array.isArray(f.cands)||f.cands.length>2000||!Array.isArray(f.quellen))throw Error(FEHLER)
 sichereLinks(f)
 const vorlage=defaultSection()
 for(const s of f.sections){
  if(!objekt(s))throw Error(FEHLER)
  for(const [k,v] of Object.entries(vorlage))if(k!=='id'&&(typeof v==='number'?!zahl(s[k]):typeof s[k]!==typeof v))throw Error(`${FEHLER} Abschnitt ${f.sections.indexOf(s)+1}: Feld «${k}» fehlt oder hat den falschen Typ.`)
  abschnittPruefen(s,f.sections.indexOf(s)+1)
  if(!quellMap(s.quelle)||!istForm(s.ist)||!['keine','bus_ab15','bus_5_15','bus_unter5','tram'].includes(String(s.oevAngebot))||!['beide','eine'].includes(String(s.richtung))||!['','Veloroute','Velohauptroute'].includes(String(s.routentyp))||!['egal','ja','nein'].includes(String(s.parkenRechts)))throw Error(FEHLER)
  // Basel (VRC-01, 10.11.2026): Regime, Auslöser des Zweirichtungsradwegs und Abweichung je Seite sind optional; alte Dateien ohne sie
  // bleiben gültig (Regime und Auslöser «unbekannt», keine Abweichung)
  if(s.tempoRegime!==undefined&&!['dauerhaft','zeitweise'].includes(String(s.tempoRegime)))throw Error(FEHLER)
  if(s.regimeText!==undefined&&(typeof s.regimeText!=='string'||s.regimeText.length>200))throw Error(FEHLER)
  if(s.zrw!==undefined&&(!objekt(s.zrw)||!Object.entries(s.zrw).every(([k,v])=>['landsicherung','neubau'].includes(k)&&(v===undefined||typeof v==='boolean'))))throw Error(FEHLER)
  for(const seite of [s,s.gegen])if(objekt(seite)&&seite.abweichung!==undefined&&(typeof seite.abweichung!=='string'||seite.abweichung.length>2000))throw Error(FEHLER)
  if(s.candIds!==undefined&&(!Array.isArray(s.candIds)||!s.candIds.every(Number.isSafeInteger)))throw Error(FEHLER)
  if(s.gegen!==undefined&&(!objekt(s.gegen)||!quellMap(s.gegen.quelle)||!istForm(s.gegen.ist)||!mass(s.gegen.breite)||!['egal','ja','nein'].includes(String(s.gegen.parkenRechts))))throw Error(FEHLER)
  for(const plan of [s.aufteilung,s.querschnittHeute])if(plan!==undefined&&(!objekt(plan)||!mass(plan.fahrbahn)||!Array.isArray(plan.teile)||plan.teile.length>100||!plan.teile.every(t=>objekt(t)&&TEIL_ARTEN.includes(t.art as never)&&mass(t.breite))))throw Error(FEHLER)
  if(s.e5!==undefined&&(!objekt(s.e5)||!objekt(s.e5.belege)||!Array.isArray(s.e5.vorschlaege)||!Array.isArray(s.e5.hinweise)))throw Error(FEHLER)
  if(s.e5!==undefined){const e=s.e5 as Record<string,unknown>;if(!Object.values(e.belege as object).every(beleg)||!(e.vorschlaege as unknown[]).every(beleg)||!(e.hinweise as unknown[]).every(x=>typeof x==='string'))throw Error(FEHLER)}
  for(const k of ['e5Auswahl','e5Bestaetigt'])if(s[k]!==undefined&&(!objekt(s[k])||!Object.values(s[k] as object).every(beleg)))throw Error(FEHLER)
  if(s.offeneQuellen!==undefined&&(!Array.isArray(s.offeneQuellen)||!s.offeneQuellen.every(x=>typeof x==='string')))throw Error(FEHLER)
  if(s.feldQuellen!==undefined&&(!objekt(s.feldQuellen)||!Object.entries(s.feldQuellen).every(([k,vs])=>QUELLEN_FELDER.includes(k)&&Array.isArray(vs)&&vs.every(v=>objekt(v)&&typeof v.id==='string'&&typeof v.name==='string'&&['number','string','boolean'].includes(typeof v.wert)&&quellArten.includes(String(v.quelle))))))throw Error(FEHLER)
  if(s.feldAuswahl!==undefined&&(!objekt(s.feldAuswahl)||!Object.entries(s.feldAuswahl).every(([k,v])=>QUELLEN_FELDER.includes(k)&&typeof v==='string')))throw Error(`${FEHLER} Die Quellenwahl eines Abschnitts ist ungültig.`)
  if(s.velozaehlungen!==undefined&&(!Array.isArray(s.velozaehlungen)||!s.velozaehlungen.every(d=>objekt(d)&&typeof d.id==='string'&&typeof d.name==='string'&&typeof d.datum==='string'&&Array.isArray(d.werte)&&d.werte.every(v=>objekt(v)&&(v.anzahl===null||zahl(v.anzahl))&&typeof v.richtung==='string'&&typeof v.validierung==='string'))))throw Error(FEHLER)
  // Frühe E5-Dateien bezeichneten eine Quellenwahl als bestätigt. Ohne separat gespeicherte menschliche
  // Kontrolle bleibt sie eine Quellenwahl.
  if(objekt(s.e5Bestaetigt)&&!s.e5Auswahl&&!('bestaetigteAngaben' in s)){s.e5Auswahl={...s.e5Bestaetigt};for(const [feld,b] of Object.entries(s.e5Bestaetigt)){if(objekt(b))(s.quelle as Record<string,string>)[feld]=e5BelegQuelle(b as unknown as import('./e5').E5Beleg)}}
  s.id=defaultSection().id // verhindert Kennungskollisionen mit neu hinzugefügten Abschnitten
 }
 const ids=new Set<number>()
 for(const c of f.cands){if(!objekt(c)||!Number.isSafeInteger(c.id)||!Number.isSafeInteger(c.wayId)||Number(c.wayId)<=0||ids.has(Number(c.id))||typeof c.name!=='string'||typeof c.selected!=='boolean'||typeof c.len!=='number'||!Number.isFinite(c.len)||c.len<0||!Array.isArray(c.geom)||c.geom.length<2||c.geom.length>10000||!c.geom.every(p=>objekt(p)&&typeof p.lat==='number'&&p.lat>=45&&p.lat<=48.5&&typeof p.lon==='number'&&p.lon>=5.5&&p.lon<=11))throw Error(FEHLER);ids.add(Number(c.id))}
 return f as unknown as Fall
}
const AUTO:QuelleFeld[]=['dtv','speed','ist','breite','routentyp','oevAngebot','tram','strassentyp','richtung','parkenRechts','oevTakt','tempoRegime']
/** Geometrie, Planung und geprüfte Eingaben bleiben; ersetzt werden nur unbestätigte automatische Werte. */
export function abschnitteAktualisieren(alt:Section[],cands:Cand[],standard:Stadt):Section[] {
 return alt.map(s=>{
  if(!s.candIds?.length)return s
  const cs=cands.filter(c=>s.candIds!.includes(c.id)).map(c=>({...c,selected:true}))
  const teile=candsToSections(cs,standard),eindeutig=teile.length===1&&cs.length===s.candIds.length
  const frisch=eindeutig?teile[0]:{...defaultSection(),e5:{belege:{},vorschlaege:[],hinweise:['Aktuelle Quelldaten sind innerhalb des gespeicherten Abschnitts nicht mehr einheitlich oder fehlen. Automatische Werte bleiben offen; Abschnitt prüfen und bei Bedarf neu übernehmen.']}}
  const neu={...s,...(s.quelle.tempoRegime==='manuell'?{}:{regimeText:frisch.regimeText}),datenOrt:eindeutig?frisch.datenOrt:s.datenOrt,e5:frisch.e5,dtvGeprueft:eindeutig&&frisch.dtvGeprueft,obs:frisch.obs,oev:frisch.oev,velozaehlungen:frisch.velozaehlungen,feldQuellen:frisch.feldQuellen,steigung:undefined,offeneQuellen:[] as string[],quelle:{...s.quelle}}
  for(const k of AUTO){const q=s.quelle[k];if(!q||!['manuell','gemessen','bestaetigt'].includes(q)){Object.assign(neu,{[k]:frisch[k]});if(frisch.quelle[k])neu.quelle[k]=frisch.quelle[k];else delete neu.quelle[k]}}
  if(s.gegen){neu.gegen={...s.gegen,quelle:{...s.gegen.quelle}};for(const k of ['ist','breite','parkenRechts','oevTakt'] as const){const q=s.gegen.quelle[k];if(!q||!['manuell','gemessen','bestaetigt'].includes(q)){const b=frisch.gegen??frisch;Object.assign(neu.gegen,{[k]:b[k]});if(b.quelle[k])neu.gegen.quelle[k]=b.quelle[k];else delete neu.gegen.quelle[k]}}}
  for(const feld of ['dtv','speed'] as const){
   const auswahl=s.e5Auswahl?.[feld];if(!auswahl||['manuell','gemessen','bestaetigt'].includes(s.quelle[feld]??''))continue
   const b=[...Object.values(frisch.e5?.belege??{}),...(frisch.e5?.vorschlaege??[])].find(b=>b?.feld===feld&&b.quelleId===auswahl.quelleId&&Number.isFinite(Number(b.wert)))
   neu[feld]=b?Number(b.wert):NaN;neu.e5Auswahl={...neu.e5Auswahl,[feld]:b??auswahl};neu.quelle[feld]=e5BelegQuelle(b??auswahl)
   if(!b){
    neu.offeneQuellen.push(feld)
    neu.e5={belege:{},vorschlaege:[],...neu.e5,hinweise:[...(neu.e5?.hinweise??[]),e5QuellenAusfall(auswahl)]}
   }
  }
  for(const [feld,id] of Object.entries(s.feldAuswahl??{})){
    const [seite,k]=feld.includes('.')?feld.split('.'):['',feld],b=seite==='b',q=b?s.gegen?.quelle??s.quelle:s.quelle
    if(['manuell','gemessen','bestaetigt'].includes(q[k as keyof typeof q]??''))continue
    const option=frisch.feldQuellen?.[feld]?.find(o=>o.id===id)
    if(!option){
      const key=seite?seite+'.'+k:k
      neu.offeneQuellen.push(key)
      if(k==='ist') {if(b)neu.gegen={...(neu.gegen??s.gegen??s),ist:'',quelle:{...(neu.gegen?.quelle??s.quelle)}};else neu.ist=''}
      if(k==='breite') {if(b)neu.gegen={...(neu.gegen??s.gegen??s),breite:NaN,quelle:{...(neu.gegen?.quelle??s.quelle)}};else neu.breite=NaN}
      neu.e5={belege:{},vorschlaege:[],...neu.e5,hinweise:[...(neu.e5?.hinweise??[]),`Die gewählte Quelle für ${k} ist aktuell nicht verfügbar. Die davon abhängige Bewertung bleibt offen.`]}
      continue
    }
    if(b)neu.gegen={...(neu.gegen??neu),[k]:option.wert,quelle:{...(neu.gegen?.quelle??neu.quelle),[k]:option.quelle}}
    else{Object.assign(neu,{[k]:option.wert});Object.assign(neu.quelle,{[k]:option.quelle})}
  }
  return neu
 })
}
