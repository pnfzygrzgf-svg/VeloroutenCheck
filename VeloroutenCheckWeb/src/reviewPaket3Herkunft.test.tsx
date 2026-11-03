import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { holeJson, arcgisGeojson } from './netz'
import { enrichCands as enrichZh, quellenCacheLeeren as zhLeeren } from './zurich'
import { enrichCands as enrichLu, quellenCacheLeeren as luLeeren } from './luzern'
import { candToSection, defaultSection, type Quelle, type Section } from './strecke'
import { fallText, fallLesen } from './fallDatei'
import { QuellenHerkunft } from './QuellenHerkunft'
import { buildCsv } from './csv'
import { bewerteAbschnitt } from './bewertung'
import { enrichE5 } from './e5'
import { DatenFeldVorschlaege, E5Abschnitt } from './E5Abschnitt'
import type { Cand } from './VeloMap'
vi.mock('./netz', async original => ({...await original<typeof import('./netz')>(),holeJson:vi.fn(),arcgisGeojson:vi.fn()}))
vi.mock('./e5/daten/anbieter/npvm', async original => ({...await original<typeof import('./e5/daten/anbieter/npvm')>(),ladeNpvm:vi.fn().mockRejectedValue(new Error('Test: keine Modelldaten'))}))
vi.mock('./Datenstaende',()=>({useDatenstaende:()=>[]}))
const cand=():Cand=>({id:1,wayId:1,ist:'Radstreifen',speed:30,breite:2,len:100,name:'Teststrasse',selected:true,geom:[{lat:47.39,lon:8.53},{lat:47.39,lon:8.5315}]})
const linie={type:'Feature',geometry:{type:'LineString',coordinates:[[8.53,47.39],[8.5315,47.39]]},properties:{kategorie:'Hauptnetz',VELO_ROUTENTYP:'Hauptroute'}}
beforeEach(()=>{
 zhLeeren();luLeeren()
 vi.mocked(holeJson).mockImplementation(async url => url.includes('0223')?{features:[{geometry:{coordinates:[8.5305,47.39]},properties:{dtv:9000}}]} as never:{features:[linie]} as never)
 vi.mocked(arcgisGeojson).mockImplementation(async url => url.includes('verkehrszaehldaten')?[{geometry:{coordinates:[8.5305,47.39]},properties:{DTV_ANZAHL:9000}}] as never:[linie] as never)
})
afterEach(()=>vi.clearAllMocks())
it.each([['Zürich',enrichZh],['Luzern',enrichLu]] as const)('%s: DTV-Zuordnung und Netzklassenübersetzung bleiben als Ableitung erkennbar',async(_stadt,enrich)=>{
 const r=await enrich([cand()]);expect(r.fehler).toEqual([])
 const s=candToSection(r.cands[0])
 expect(s.dtv).toBe(9000);expect(s.routentyp).toBe('Veloroute')
 expect(s.quelle.dtv).toBe('abgeleitet');expect(s.quelle.routentyp).toBe('abgeleitet')
 const e=await enrichE5(r.cands,'schweiz')
 expect(e.cands[0].e5?.belege.dtv).toMatchObject({wert:9000,herkunft:'abgeleitet'})
})
it('neue Herkunft übersteht die Falldatei und erscheint im CSV, Berner Direktwerte bleiben amtlich',()=>{
 const c=cand(),s=candToSection(c);s.quelle.dtv='abgeleitet' as Quelle;s.dtv=9000
 const f=fallLesen(fallText({standard:'zurich',gebiet:'zurich',strasse:'Test',sections:[s],cands:[c],quellen:[]}))
 expect(f.sections[0].quelle.dtv).toBe('abgeleitet')
 expect(buildCsv([s],[bewerteAbschnitt(s,'zurich')],null,'zurich','Zürich')).toContain('abgeleitet')
 expect(candToSection({...c,bern:{dtv:9000,routentyp:'Veloroute'}}).quelle).toMatchObject({dtv:'amtlich',routentyp:'amtlich'})
})
it('Linse benennt die Ableitung ohne Knopf; die Berner Inventarannahme behält ihren bisherigen Text',()=>{
 const html=renderToStaticMarkup(<QuellenHerkunft q={'abgeleitet' as Quelle}/>)
 expect(html).toContain('abgeleitet');expect(html).toContain('title=');expect(html).not.toContain('<button');expect(html).not.toContain('bestätigt')
 expect(renderToStaticMarkup(<QuellenHerkunft q="angenommen"/>)).toContain('≤ 2000 angenommen')
})
it('ausdrückliche Quellenwahl einer abgeleiteten DTV-Zuordnung macht daraus keinen amtlichen Direktwert',()=>{
 const s={...defaultSection(),e5:{belege:{dtv:{feld:'dtv' as const,wert:9000,herkunft:'abgeleitet' as const,quelle:'Kanton Zürich · Verkehrsmessstellen',quelleId:'zh.zaehlung',datenstand:'03.11.2026',abgerufen:'2026-11-03T12:00:00Z',url:'https://example.test',objekte:['1'],hinweis:'räumlich zugeordnet'}},vorschlaege:[],hinweise:[]}}
 expect(renderToStaticMarkup(<DatenFeldVorschlaege s={s} feld="dtv" aendern={()=>{}}/>).toLowerCase()).toContain('abgeleitet')
 let aktuell:Section=s
 let quelle:Quelle|undefined
 const view=DatenFeldVorschlaege({s,feld:'dtv',aendern:p=>{quelle=p.quelle?.dtv;aktuell={...s,...p}}})
 const knopf=(view as React.ReactElement<{children:React.ReactElement<{onClick:()=>void}>[]}>).props.children[0]
 knopf.props.onClick();expect(quelle).toBe('abgeleitet')
 expect(renderToStaticMarkup(<E5Abschnitt s={aktuell} druck/>)).toContain('abgeleitet')
})


it('eine Quellenwahl erzeugt auch aus einem fehlerhaften Herkunftsattribut keine menschliche Bestätigung',()=>{
 const c=cand(),s=candToSection(c)
 s.e5={belege:{dtv:{feld:'dtv',wert:9000,herkunft:'bestaetigt' as never,quelle:'Zählstelle',quelleId:'test',datenstand:'unbekannt',abgerufen:'2026-11-03T12:00:00Z',url:'https://example.test',objekte:['1'],hinweis:''}},vorschlaege:[],hinweise:[]}
 let quelle:Quelle|undefined
 const view=DatenFeldVorschlaege({s,feld:'dtv',aendern:p=>{quelle=p.quelle?.dtv}})
 const knopf=(view as React.ReactElement<{children:React.ReactElement<{onClick:()=>void}>[]}>).props.children[0]
 knopf.props.onClick();expect(quelle).not.toBe('bestaetigt')
})
