import {describe,it,expect} from 'vitest'
import {e5Proben,regionalTempoFuer} from './e5'
import {wgs} from './e5/geo'
import type {RegionalObjekt} from './e5/daten/anbieter/gemeinsam/regional'
import {feldQuellenPatch,type FeldQuelle} from './FeldQuellen'
import {zhTageswerte,bsTageswerte} from './velozaehlung'
import {defaultSection,candToSection,tauscheSeiten,luftbildUebernehmen,seiteA} from './strecke'
import {abschnitteAktualisieren} from './fallDatei'
import {bewerteAbschnitt} from './bewertung'
import {startAufteilung,umfeldVon} from './aufteilung'
import {linieImGebiet} from './gebiet'
import type {Cand} from './VeloMap'
import type {Stadt} from './fuehrungsform'
const cand=(extra:Partial<Cand>={}):Cand=>({id:1,wayId:1,ist:'Radstreifen',speed:30,breite:2,len:100,name:'Teststrasse',selected:true,geom:[{lat:46.95,lon:7.45},{lat:46.95,lon:7.451}],bern:{speed:30,dtv:4000},...extra})
const osm:FeldQuelle={id:'osm',name:'OSM',wert:'Radweg abgesetzt',quelle:'osm'}
describe('E5 · Quellenwahl ist keine Bestätigung',()=>{
 it('Quellenwechsel hat Herkunft, nicht den Status bestätigt; Eingabestand bleibt unverändert',()=>{const s={...defaultSection(),ist:'Mischverkehr' as const,breite:2,quelle:{ist:'amtlich' as const,breite:'osm' as const}};const p=feldQuellenPatch(s,'a.ist',osm);expect(p.ist).toBe('Radweg abgesetzt');expect(p.quelle?.ist).toBe('osm');expect(p.quelle?.ist).not.toBe('bestaetigt');expect(s.ist).toBe('Mischverkehr')})
 it('Formwechsel nimmt passende Quellenbreite oder bleibt leer; eigene Messung wird erhalten',()=>{const s={...defaultSection(),ist:'Mischverkehr' as const,breite:1.5,quelle:{breite:'osm' as const}};expect(feldQuellenPatch(s,'a.ist',osm).breite).toBeNaN();expect(feldQuellenPatch({...s,feldQuellen:{'a.breite':[{id:'osm',name:'OSM',wert:3,quelle:'osm'}]}},'a.ist',osm).breite).toBe(3);expect(feldQuellenPatch({...s,quelle:{breite:'gemessen'}},'a.ist',osm).breite).toBeUndefined()})
 it('Quelle von Seite B ersetzt Seite A nicht',()=>{const s={...defaultSection(),ist:'Radstreifen' as const,breite:1.8};const p=feldQuellenPatch(s,'b.ist',osm);expect(p.ist).toBeUndefined();expect(p.gegen?.ist).toBe('Radweg abgesetzt');expect(s.ist).toBe('Radstreifen')})
 it('Seiten tauschen nimmt Quellenwerte und Wahl mit; zwei Tausche stellen sie wieder her',()=>{const s={...candToSection(cand()),gegen:{...seiteA(defaultSection()),ist:'Mischverkehr' as const,quelle:{}},feldQuellen:{'a.ist':[osm],'b.ist':[{...osm,wert:'Mischverkehr'}]},feldAuswahl:{'a.ist':'osm','b.ist':'markierung'}};const t=tauscheSeiten(s);expect(t.feldAuswahl).toEqual({'a.ist':'markierung','b.ist':'osm'});expect(tauscheSeiten(t).feldQuellen).toEqual(s.feldQuellen);expect(s.feldAuswahl['a.ist']).toBe('osm')})
 it('Luftbild-Hinweis übernehmen vertauscht die vorhandenen Seitenquellen nicht',()=>{const s={...candToSection(cand()),feldQuellen:{'a.ist':[osm],'b.ist':[{...osm,wert:'Mischverkehr'}]},feldAuswahl:{'b.ist':'markierung'}};const n=luftbildUebernehmen(s,{a:true,b:false});expect(n.feldQuellen).toEqual(s.feldQuellen);expect(n.feldAuswahl?.['b.ist']).toBe('markierung');expect(n.feldAuswahl?.['a.ist']).toBe('luftbild')})
 it('gewählte NPVM-Quelle erhält beim Aktualisieren ihren neuen Wert und Stand, nicht den neuen Ortswert',()=>{const beleg={feld:'dtv' as const,wert:6000,quelle:'ARE NPVM',quelleId:'are.npvm',datenstand:'01.11.2026',abgerufen:'2026-11-02T12:00:00Z',url:'https://api3.geo.admin.ch/npvm',objekte:['1'],hinweis:'modelliert',modell:true};const s={...candToSection(cand()),dtv:6000,quelle:{dtv:'modell' as const},e5Auswahl:{dtv:beleg}};const neu=cand({bern:{dtv:4500,speed:30},e5:{belege:{},vorschlaege:[{...beleg,wert:7000,datenstand:'02.11.2026'}],hinweise:[]}});const r=abschnitteAktualisieren([s],[neu],'bern')[0];expect([r.dtv,r.quelle.dtv,r.e5Auswahl?.dtv?.datenstand]).toEqual([7000,'modell','02.11.2026']);expect(s.dtv).toBe(6000)})
 it('manueller Takt und Gegenseite werden beim Wiederöffnen erhalten',()=>{const s=candToSection(cand());s.oevTakt=7;s.quelle.oevTakt='manuell';s.gegen={...seiteA(s),breite:3,oevTakt:12,quelle:{breite:'gemessen',oevTakt:'manuell'}};const r=abschnitteAktualisieren([s],[cand()],'bern')[0];expect([r.oevTakt,r.gegen?.breite,r.gegen?.oevTakt]).toEqual([7,3,12])})
 it('fehlende gewählte Schienenquelle bleibt prüfbedürftig statt eine günstige Note zu erzeugen',()=>{const s={...candToSection(cand()),tram:true,feldAuswahl:{tram:'amtlich'}};const r=abschnitteAktualisieren([s],[cand()],'bern')[0];expect(r.offeneQuellen).toContain('tram');expect(bewerteAbschnitt(r,'bern').note).toBeNull();expect(bewerteAbschnitt(r,'bern').seiten[0].fehlt[0]).toContain('gewählte Quelle');const p=feldQuellenPatch(r,'tram',{id:'osm',name:'OSM',wert:true,quelle:'osm'});expect(p.offeneQuellen).not.toContain('tram')})
})
describe('E5 · Routingstandard in allen vier Städten',()=>{
 for(const stadt of ['bern','zurich','basel','luzern'] as Stadt[])it(`${stadt}: leerer Ersatz konsistent; eigene Veloroute bleibt Veloroute`,()=>{const s={...defaultSection(),speed:30,dtv:4000,ist:'Radstreifen' as const,fahrbahnbreite:10};expect(startAufteilung(s,stadt)).toEqual(startAufteilung({...s,routentyp:'Velohauptroute'},stadt));expect(umfeldVon({...s,routentyp:'Veloroute'},[],undefined,stadt).routentyp).toBe('Veloroute')})
})
describe('E5 · Gemeindegrenzen',()=>{
 it('eine Strasse durch eine ausgeschlossene Enklave wird nicht allein über die Endpunkte zugeordnet',()=>{const a:[number,number][][]=[[[0,0],[100,0],[100,100],[0,100],[0,0]],[[40,40],[60,40],[60,60],[40,60],[40,40]]];expect(linieImGebiet([[10,50],[90,50]],[a])).toBe(false);expect(linieImGebiet([[10,20],[90,20]],[a])).toBe(true)})
})
describe('E5 · abgerufene Velozählung',()=>{
 it('Zürich: null und fehlende Richtung sind nicht Nullverkehr und keine Jahreshochrechnung',()=>{const r=zhTageswerte([{DATUM:'2026-10-31T00:00',VELO_IN:null,VELO_OUT:'2'},{DATUM:'2026-10-31T00:15',VELO_IN:'3',VELO_OUT:''}],'Nord','Süd');expect(r.datum).toBe('2026-10-31');expect(r.werte.map(w=>[w.richtung,w.anzahl,w.intervalle])).toEqual([['Nord',3,1],['Süd',2,1]])})
 it('Zürich: nur tatsächlich neuester Messtag und keine doppelte Viertelstunde',()=>{const rows=[{DATUM:'2026-10-31T00:00',VELO_IN:'4',VELO_OUT:null},{DATUM:'2026-10-30T00:00',VELO_IN:'999',VELO_OUT:null}];expect(zhTageswerte(rows,'','').werte[0].anzahl).toBe(4);expect(zhTageswerte(rows,'','').werte[1].anzahl).toBeNull();expect(()=>zhTageswerte([rows[0],rows[0]],'','')).toThrow('doppelte')})
 it('Basel: keine Summierung über verschiedene Tage; Validierung und Ersatzwerte bleiben getrennt',()=>{const r={date:'31.10.2026',datetimefrom:'2026-10-31T12:00:00Z',datetimeto:'2026-10-31T13:00:00Z',directionname:'Nord',lanecode:1,total:9,valuesapproved:0,valuesedited:1};const v=bsTageswerte([r,{...r,date:'30.10.2026',datetimefrom:'2026-10-30T12:00:00Z',total:999}]);expect(v.werte[0].anzahl).toBe(9);expect(v.werte[0].validierung).toContain('nicht durchgehend');expect(v.werte[0].validierung).toContain('1 Ersatzwerte')})
 it('Basel: identische Stunden-/Spurdatensätze werden nicht doppelt gezählt',()=>{const r={date:'31.10.2026',datetimefrom:'2026-10-31T12:00:00Z',datetimeto:'2026-10-31T13:00:00Z',directionname:'Nord',lanecode:1,total:9,valuesapproved:1,valuesedited:0};expect(()=>bsTageswerte([r,r])).toThrow('doppelte')})
})

describe('Tempo der Kantone',()=>{
 const linie:[number,number][]=[[2600000,1200000],[2600200,1200000]],strasse=[{name:'Teststrasse',tags:{highway:'tertiary'},teile:[linie]}]
 const c=cand({geom:linie.map(([e,n])=>{const[lat,lon]=wgs(e,n);return{lat,lon}})}),ps=e5Proben(c)
 const objekt=(x:Partial<RegionalObjekt>):RegionalObjekt=>({id:'1',name:'Teststrasse',tempo:60,zone:null,bestaetigen:false,stand:null,hinweis:'',teile:[linie],...x} as RegionalObjekt)
 const tiles=(...objekte:RegionalObjekt[])=>new Map(ps.map(p=>{const m:[number,number]=[Math.floor(p.p[0]/400)*400+200,Math.floor(p.p[1]/400)*400+200];return[m.join(','),{version:1 as const,mitte:m,radiusM:350,teile:[{id:'so.tempo',url:'https://geo.so.ch/x',abgerufen:'2026-11-07',datenstand:'unbekannt',objekte,roh:null}]}]}))
 it('nimmt eine passende amtliche Linie als sicheren Wert',()=>{const r=regionalTempoFuer(ps,tiles(objekt({})),strasse);expect(r.sicher?.tempo).toBe(60);expect(r.vorschlag).toBeNull()})
 it('bietet eine namenlose Linie nur als Vorschlag an',()=>{const r=regionalTempoFuer(ps,tiles(objekt({name:''})),strasse);expect(r.sicher).toBeNull();expect(r.vorschlag?.tempo).toBe(60)})
 it('nimmt bei Widerspruch weder Wert noch Vorschlag',()=>{const halb:[number,number][]=[[2600000,1200000],[2600100,1200000]],rest:[number,number][]=[[2600100,1200000],[2600200,1200000]]
  const r=regionalTempoFuer(ps,tiles(objekt({id:'1',teile:[halb],tempo:50}),objekt({id:'2',teile:[rest],tempo:80})),strasse);expect(r.sicher).toBeNull();expect(r.vorschlag).toBeNull()})
 it('lässt OSM stehen, wo keine amtliche Linie liegt',()=>{const r=regionalTempoFuer(ps,tiles(objekt({teile:[[[2600000,1200100],[2600200,1200100]]]})),strasse);expect(r).toEqual({sicher:null,vorschlag:null})})
})
