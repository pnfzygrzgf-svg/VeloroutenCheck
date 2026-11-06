import { Children, isValidElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { abschnitteAktualisieren } from './fallDatei'
import { abschnittAendern } from './abschnittAendern'
import { candToSection, candsToSections, defaultSection, dtvAssumed, dtvEff, seiteA, tauscheSeiten, type Section } from './strecke'
import { bewerteAbschnitt } from './bewertung'
import { feldQuellenPatch, type FeldQuelle } from './FeldQuellen'
import { DatenFeldVorschlaege, E5Abschnitt } from './E5Abschnitt'
import type { E5Beleg } from './e5'
import type { Cand } from './VeloMap'
import { avBreiteErmitteln, avNachladenUebernehmen } from './avNachladen'
import { haltestelleninsel } from './breitenmessung'
import { haltestelleninselUebernehmen } from './aufteilung'
import type { AvFlaeche } from './av'
import type { P } from './lv95'
vi.mock('./Datenstaende', () => ({ useDatenstaende: () => [] }))

const beleg = (quelleId: string, wert: number): E5Beleg => ({ feld:'dtv',wert,quelle:quelleId==='are.npvm'?'ARE · NPVM':'Geoportal Stadt Bern',quelleId,url:'https://example.test/'+quelleId,datenstand:'01.11.2026',abgerufen:'2026-11-03T12:00:00Z',objekte:['1'],hinweis:'Testbeleg',...(quelleId==='are.npvm'?{modell:true}:{}) })
const c = (): Cand => ({id:1,wayId:1,ist:'Radstreifen',speed:50,breite:1.5,len:100,name:'Teststrasse',selected:true,geom:[{lat:46.95,lon:7.45},{lat:46.95,lon:7.451}],datenOrt:{name:'Bern',stadt:'bern',bfs:351},bern:{speed:50,dtv:1461,dtvGeprueft:true},e5:{belege:{dtv:beleg('bern.dtv',1461)},vorschlaege:[],hinweise:[]}})
const gewaehlt = (): Section => ({...candToSection(c()),dtv:9000,e5Auswahl:{dtv:beleg('are.npvm',9000)},quelle:{dtv:'modell',speed:'osm',ist:'osm',breite:'osm'}})

describe('Paket 3a: gewählte DTV-Quelle fällt aus',()=>{
 it('wird trotz Geoportal-Alternative nicht durch die günstigere Berner Inventarannahme ersetzt',()=>{
  const alt=gewaehlt(),vorher=structuredClone(alt),neu=abschnitteAktualisieren([alt],[c()],'bern')[0]
  expect(bewerteAbschnitt(alt,'bern').note).not.toBeNull()
  expect(neu.dtv).toBeNaN();expect(neu.offeneQuellen).toContain('dtv')
  expect(dtvAssumed(neu,'bern')).toBe(false);expect(dtvEff(neu,'bern')).toBeNaN()
  expect(neu.e5Auswahl?.dtv).toEqual(alt.e5Auswahl?.dtv)
  expect(neu.e5?.belege.dtv).toEqual(beleg('bern.dtv',1461))
  expect(bewerteAbschnitt(neu,'bern').note).toBeNull()
  expect(neu.e5?.hinweise.join(' ')).toContain('nicht verfügbar');expect(alt).toEqual(vorher)
 })
 it('lässt auch einen älteren Fall mit Auswahl und NaN ohne Fehlerliste nicht in die Inventarannahme fallen',()=>{
  const s={...gewaehlt(),dtv:NaN}
  expect(dtvAssumed(s,'bern')).toBe(false);expect(dtvEff(s,'bern')).toBeNaN()
 })
 it.each(['manuell','gemessen','bestaetigt'] as const)('erhält einen %s gesetzten Wert beim Aktualisieren',quelle=>{
  const alt=gewaehlt();alt.quelle.dtv=quelle
  const neu=abschnitteAktualisieren([alt],[c()],'bern')[0]
  expect(neu.dtv).toBe(9000);expect(neu.quelle.dtv).toBe(quelle);expect(neu.offeneQuellen).not.toContain('dtv')
 })
 it('zeigt die ausgefallene Auswahl am Feld, Geoportal als Alternative und einen lesbaren Ausfallbeleg im Bericht',()=>{
  const s=abschnitteAktualisieren([gewaehlt()],[c()],'bern')[0]
  const html=renderToStaticMarkup(<DatenFeldVorschlaege s={s} feld="dtv" aendern={()=>{}}/>)
  expect(html).toContain('ARE · NPVM');expect(html).toContain('nicht verfügbar');expect(html).toContain('disabled=""');expect(html).toContain('aria-pressed="true"');expect(html).toContain('Geoportal Stadt Bern')
  const bericht=renderToStaticMarkup(<E5Abschnitt s={s} druck/>)
  expect(bericht).toContain('nicht verfügbar');expect(bericht).toContain('zuletzt');expect(bericht).toContain(`${(9000).toLocaleString('de-CH')}`)
 })
 it('schliesst den Ausfall erst nach ausdrücklicher Wahl der verfügbaren Alternative',()=>{
  const s=abschnitteAktualisieren([gewaehlt()],[c()],'bern')[0];s.offeneQuellen=['dtv']
  let patch:Partial<Section>|undefined
  const view=DatenFeldVorschlaege({s,feld:'dtv',aendern:p=>{patch=p}})
  const kinder=isValidElement<{children:React.ReactNode}>(view)?Children.toArray(view.props.children):[]
  const alternative=kinder.find(x=>isValidElement<{disabled?:boolean}>(x)&&x.props.disabled!==true)
  expect(isValidElement(alternative)).toBe(true)
  if(isValidElement<{onClick:()=>void}>(alternative))alternative.props.onClick()
  expect(patch?.offeneQuellen).not.toContain('dtv')
  const neu=abschnittAendern(s,patch!)
  expect(neu.dtv).toBe(1461);expect(neu.e5Auswahl?.dtv?.quelleId).toBe('bern.dtv');expect(neu.offeneQuellen).not.toContain('dtv')
  expect(neu.e5?.hinweise.join(' ')).not.toContain('Die gewählte Quelle ARE · NPVM')
  expect(bewerteAbschnitt(neu,'bern').note).not.toBeNull()
 })
})

describe('Paket 3b: echte AV-Geometrie und Übernahme nach einem Abruf',()=>{
 const r=(a:number,b:number,c:number,d:number):P[]=>[[a,b],[c,b],[c,d],[a,d],[a,b]]
 const inselAv:AvFlaeche[]=[{art:'Strasse_Weg',ringe:[r(0,-3.9,100,7.8),r(20,3.9,80,6.1)]},{art:'Verkehrsinsel',ringe:[r(20,3.9,80,6.1)]},{art:'Trottoir',ringe:[r(0,7.8,100,10.8)]}]
 const achsen:P[][]=[[[0,0],[100,0]]]
 const s=():Section=>({...defaultSection(),fahrbahnbreite:6,oevAngebot:'tram',tram:true,quelle:{fahrbahnbreite:'av'}})
 it('übernimmt die Haltestelleninsel wie der Messknopf statt nur den Fahrbahnmedian',()=>{
  const alt=s(),hsi=haltestelleninsel(achsen,inselAv)!
  expect(hsi.innen).toBe(7.8)
  const neu=avNachladenUebernehmen(alt,avBreiteErmitteln(achsen,inselAv,hsi),'bern')
  const soll=haltestelleninselUebernehmen(alt,hsi,'bern',true)
  expect(neu.fahrbahnbreite).toBe(soll.fahrbahnbreite);expect(neu.haltestelleninsel).toEqual(soll.haltestelleninsel)
  expect(neu.haltestellentyp).toBe(soll.haltestellentyp);expect(neu.gegen).toEqual(soll.gegen)
 })
 it('übernimmt die erkannte Mittelinsel und deren Fahrbahnangabe',()=>{
  const av:AvFlaeche[]=[{art:'Strasse_Weg',ringe:[r(0,0,100,10),r(46,4,54,6)]},{art:'Verkehrsinsel',ringe:[r(46,4,54,6)]}]
  const neu=avNachladenUebernehmen(s(),avBreiteErmitteln([[[0,2],[100,2]]],av),'bern')
  expect(neu.fahrbahnbreite).toBe(10);expect(neu.mittelinsel).toEqual({breite:2,laenge:8,fahrbahn:10,anzahl:1})
 })
 it('überschreibt bei fehlender Strassenfläche keinen vorhandenen Wert mit NaN',()=>{
  const alt=s(),neu=avNachladenUebernehmen(alt,avBreiteErmitteln(achsen,[]),'bern')
  expect(neu).toBe(alt);expect(neu.fahrbahnbreite).toBe(6)
 })
 it('erhält eine während des Abrufs von Hand gesetzte Breite, auch bei gleichem Zahlenwert und Haltestelleninsel',()=>{
  const aktuell=s();aktuell.quelle.fahrbahnbreite='manuell'
  const ergebnis=avBreiteErmitteln(achsen,inselAv,haltestelleninsel(achsen,inselAv))
  expect(avNachladenUebernehmen(aktuell,ergebnis,'bern')).toBe(aktuell)
 })
})

describe('Paket 3c: Herkunft nicht belegter Werte',()=>{
 const weg:FeldQuelle={id:'osm',name:'OSM',wert:'Radweg abgesetzt',quelle:'osm'}
 it.each(['a','b'])('Formwechsel ohne passende Breite erzeugt auf Seite %s kein manuelles NaN',seite=>{
  const s={...defaultSection(),ist:'Radstreifen' as const,breite:1.8,quelle:{breite:'osm' as const}}
  const patch=feldQuellenPatch(s,seite+'.ist',weg),neu=abschnittAendern(s,patch)
  const felder=seite==='a'?neu:neu.gegen!
  expect(felder.breite).toBeNaN();expect(felder.quelle.breite).toBeUndefined()
 })
 it('ein bewusst gelöschter Zahlenwert hat keine Herkunft «manuell»',()=>{
  const s={...defaultSection(),breite:2,quelle:{breite:'osm' as const}}
  const neu=abschnittAendern(s,{breite:NaN})
  expect(neu.breite).toBeNaN();expect(neu.quelle.breite).toBeUndefined()
 })
 it('fehlender Parknachweis trägt auf keiner Seite die Herkunft «amtlich»',()=>{
  const a=c();a.bern={...a.bern,parken:{rechts:0,links:.9}}
  const s=candToSection(a)
  expect(s.parkenRechts).toBe('egal');expect(s.quelle.parkenRechts).toBeUndefined()
  expect(s.gegen?.parkenRechts).toBe('ja');expect(s.gegen?.quelle.parkenRechts).toBe('amtlich')
 })
})

describe('Paket 3d: vollständiger Seitenwechsel',()=>{
 const q:FeldQuelle={id:'osm',name:'OSM',wert:'Radstreifen',quelle:'osm'}
 it.each(['a','b'])('verschiebt einseitige Quellenwerte, Auswahl und offene Quellen von %s auf die andere Seite',seite=>{
  const anders=seite==='a'?'b':'a'
  const s:Section={...gewaehlt(),gegen:{...seiteA(defaultSection()),ist:'Mischverkehr',quelle:{}},feldQuellen:{[seite+'.ist']:[q],tram:[]},feldAuswahl:{[seite+'.ist']:'osm',tram:'tlm'},offeneQuellen:[seite+'.ist',seite+'.breite','dtv']}
  const vorher=structuredClone(s),t=tauscheSeiten(s)
  expect(t.feldQuellen).toEqual({[anders+'.ist']:[q],tram:[]});expect(t.feldAuswahl).toEqual({[anders+'.ist']:'osm',tram:'tlm'})
  expect(t.offeneQuellen).toEqual([anders+'.ist',anders+'.breite','dtv'])
  const wieder=tauscheSeiten(t)
  expect(wieder.feldQuellen).toEqual(s.feldQuellen);expect(wieder.feldAuswahl).toEqual(s.feldAuswahl);expect(wieder.offeneQuellen).toEqual(s.offeneQuellen)
  expect(wieder.ist).toBe(s.ist);expect(wieder.gegen?.ist).toBe(s.gegen?.ist);expect(s).toEqual(vorher)
 })
 it('tauscht auch andere seitenspezifische Schlüssel, gemeinsame Quellen bleiben gemeinsam',()=>{
  const s={...defaultSection(),feldQuellen:{'a.oevTakt':[{...q,wert:5}],'b.parkenRechts':[{...q,wert:'ja'}]},feldAuswahl:{'a.oevTakt':'fahrplan','b.parkenRechts':'geoportal',tram:'osm'},offeneQuellen:['a.oevTakt','b.parkenRechts','speed']}
  const t=tauscheSeiten(s)
  expect(t.feldAuswahl).toEqual({'b.oevTakt':'fahrplan','a.parkenRechts':'geoportal',tram:'osm'})
  expect(t.offeneQuellen).toEqual(['b.oevTakt','a.parkenRechts','speed'])
 })
})


it('Paket 3c: auch beim Zusammenfassen bleibt unbelegte Parkierung offen und ohne amtliche Herkunft',()=>{
 const a=c();a.bern={...a.bern,parken:{rechts:0,links:.9}}
 const s=candsToSections([a],'bern')[0]
 expect(s.parkenRechts).toBe('egal');expect(s.quelle.parkenRechts).toBeUndefined()
 expect(s.gegen?.parkenRechts).toBe('ja');expect(s.gegen?.quelle.parkenRechts).toBe('amtlich')
})


it('Paket 3: bewusst geleerter DTV wird nach dem Verwerfen der Quellenwahl nicht wieder günstig angenommen',()=>{
 const s=gewaehlt(),neu=abschnittAendern(s,{dtv:NaN})
 expect(neu.dtv).toBeNaN();expect(neu.quelle.dtv).toBeUndefined();expect(neu.e5Auswahl?.dtv).toBeUndefined()
 expect(dtvAssumed(neu,'bern')).toBe(false);expect(dtvEff(neu,'bern')).toBeNaN();expect(bewerteAbschnitt(neu,'bern').note).toBeNull()
})

it.each(['a','b'])('Paket 3: eine bestätigte Breite auf Seite %s bleibt beim Aktualisieren trotz früherer Quellenwahl erhalten',seite=>{
 const s=gewaehlt();s.feldAuswahl={[seite+'.breite']:'osm'}
 if(seite==='a'){s.breite=1.9;s.quelle.breite='bestaetigt'}
 else s.gegen={...seiteA(s),breite:1.9,quelle:{breite:'bestaetigt'}}
 const neu=abschnitteAktualisieren([s],[c()],'bern')[0],werte=seite==='a'?neu:neu.gegen!
 expect(werte.breite).toBe(1.9);expect(werte.quelle.breite).toBe('bestaetigt')
 expect(neu.offeneQuellen).not.toContain(seite+'.breite')
})
