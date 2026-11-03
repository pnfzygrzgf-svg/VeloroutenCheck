import { describe,it,expect,vi,afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { wayToCand } from './osm'
import { candToSection,defaultSection,dtvAssumed,candsToSections } from './strecke'
import { abschnitteAktualisieren,fallText,fallLesen } from './fallDatei'
import { standardText,orteFuer,GEBIET_LAYER } from './gebiet'
import { enrichE5,npvmFuerCand,e5Zone } from './e5'
import { datenlaufNeu,datenStaende,quelleMetadaten,meldeAbruf,datenGeneration } from './datenstand'
import { bewerteAbschnitt } from './bewertung'
import { startAufteilung } from './aufteilung'
import { E5Abschnitt } from './E5Abschnitt'
import { buildCsv } from './csv'
import { wgs,type P } from './e5/geo'
import type { NpvmSnapshot } from './e5/daten/anbieter/npvm'
import type { VeloZaehldaten } from './velozaehlung'
const p:P=[2600000,1200000]
const ll=(p:P)=>{const[lat,lon]=wgs(...p);return{lat,lon}}
const cand=(id=1)=>wayToCand({id,tags:{highway:'residential',name:'Teststrasse',maxspeed:'30',cycleway:'lane'},geometry:[ll(p),ll([p[0]+100,p[1]])]})!
const snap=(wert=6000):NpvmSnapshot=>({version:1,quelleId:'are.npvm',abgerufen:'2026-11-02T14:00:00Z',datenstand:'2026-11-01',bezugsjahr:2023,datenstandQuelle:'https://api3.geo.admin.ch/meta',mitte:[2600050,1200000],radiusM:350,url:'https://api3.geo.admin.ch/npvm',vollstaendigkeit:'unbekannt',linien:[{id:'npvm:12',nr:12,dtv:wert,teile:[[[2599950,1200000],[2600200,1200000]]]}]})
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();datenlaufNeu()})
describe('E5 · Ort, Standard und nationale Grundbewertung',()=>{
 it('Berner Ersatzstandard behauptet keinen Berner Datenanbieter',()=>{const s={...candToSection(cand()),datenOrt:{name:'Thun',bfs:942},dtvGeprueft:true};expect(dtvAssumed(s,'bern')).toBe(false);expect(standardText('bern',s.datenOrt)).toContain('Ersatzstandard für Thun')})
 it('Berner Inventarannahme folgt dem tatsächlichen Ort auch bei anderem Bewertungsstandard',()=>{expect(dtvAssumed({...candToSection(cand()),datenOrt:{name:'Bern',stadt:'bern'},dtvGeprueft:true},'zurich')).toBe(true)})
 it('eigene Anlage ohne Netzeintrag und ohne Abrufe bewertbar und planbar',()=>{const s={...defaultSection(),datenOrt:{name:'Thun'},speed:30,dtv:3000,ist:'Radstreifen' as const,breite:2,routentyp:'Veloroute' as const,parkenRechts:'nein' as const};expect(bewerteAbschnitt(s,'bern').note).not.toBeNull();expect(startAufteilung(s,'bern').teile.some(t=>t.art==='Velostreifen')).toBe(true);expect(s.quelle.routentyp).toBeUndefined()})
 it('Routentyp-Ersatz für Planung und Bewertung einheitlich Haupt',()=>{const s={...defaultSection(),speed:30,dtv:3000,ist:'Radstreifen' as const,breite:2};expect(startAufteilung(s,'bern')).toEqual(startAufteilung({...s,routentyp:'Velohauptroute'},'bern'))})
 it('unbekannte Parkierung wird nicht zu «keine Parkierung»',()=>{const c={...cand(),bern:{parken:{rechts:0,links:0}}};expect(candToSection(c).parkenRechts).toBe('egal')})
 it('Velozahl verändert weder Motorfahrzeug-DTV noch Note',()=>{const s={...defaultSection(),speed:30,dtv:6000,ist:'Radstreifen' as const,breite:2};const v={...s,velozaehlungen:[{id:'a',name:'Zählstelle A',punkt:{lat:46.95,lon:7.44},quelle:'Test',url:'',datum:'2025',abgerufen:'2025-01-01',werte:[{richtung:'beide',anzahl:900,intervalle:1,einheit:'Velos',validierung:'validiert'}],hinweis:'',datenstand:'2025'}]};expect(bewerteAbschnitt(v,'bern')).toEqual(bewerteAbschnitt(s,'bern'));expect(v.dtv).toBe(6000)})
 it('Gebietsprüfung verwendet amtliche Geometrie, nicht die Suchgebiets-Auswahl',async()=>{const poly=[[2599990,1199990],[2600200,1199990],[2600200,1200010],[2599990,1200010],[2599990,1199990]];vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({results:[{layerBodId:GEBIET_LAYER,properties:{is_current_jahr:true,jahr:new Date().getUTCFullYear(),gde_nr:351,gemname:'Bern',kanton:'BE'},geometry:{type:'Polygon',coordinates:[poly]}}]}))));expect((await orteFuer([cand()])).get(1)?.stadt).toBe('bern')})
 it('Gemeindeüberschreitung bleibt ohne geratenen Stadtanbieter',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({results:[]}))));expect((await orteFuer([cand()])).get(1)?.stadt).toBeUndefined()})
})
describe('E5 · NPVM und Zonen',()=>{
 it('eindeutiges NPVM ist nur Vorschlag, amtlicher DTV bleibt vor Modell',async()=>{const c=cand();const b=npvmFuerCand(c,[snap()]);expect(b?.wert).toBe(6000);expect(b?.modell).toBe(true);expect(b?.bestaetigt).toBeUndefined();expect(candToSection({...c,e5:{belege:{},vorschlaege:[b!],hinweise:[]}}).dtv).toBeNaN();vi.stubGlobal('fetch',vi.fn(()=>Promise.reject(Error('nicht nötig'))));const r=await enrichE5([{...c,bern:{dtv:4000}}],'schweiz');expect(r.cands[0].bern?.dtv).toBe(4000);expect(r.cands[0].e5?.belege.dtv?.wert).toBe(4000)})
 it('parallele Modellstrecken oder Brücke werden nicht geraten',()=>{const s=snap();s.linien.push({...s.linien[0],id:'npvm:13',nr:13});expect(npvmFuerCand(cand(),[s])).toBeNull();expect(npvmFuerCand({...cand(),osmTags:{bridge:'yes'}},[snap()])).toBeNull()})
 it('projektierte Zonen sind keine heutige Tempoquelle',()=>{expect(e5Zone({PP_ZONE_TEXT:'Projekt Tempo 30'})).toBeNull();expect(e5Zone({PP_ZONE_TEXT:'Bestehende Tempo 30-Zone'})).toBe('Tempo-30-Zone')})
})
describe('E5 · Quelle aktualisieren und Fall roundtrip',()=>{
 it('frische automatische Werte ersetzen alte, eigene und bestätigte bleiben',()=>{const c={...cand(),bern:{speed:50,dtv:9000}},s=candToSection(c);s.speed=30;s.quelle.speed='manuell';s.dtv=5000;s.quelle.dtv='bestaetigt';s.aufteilung=startAufteilung(s);const r=abschnitteAktualisieren([s],[{...c,bern:{speed:60,dtv:12000}}],'bern')[0];expect([r.speed,r.dtv,r.aufteilung]).toEqual([30,5000,s.aufteilung]);const a=candToSection(c);expect(abschnitteAktualisieren([a],[{...c,bern:{speed:60,dtv:12000}}],'bern')[0].speed).toBe(60)})
 it('nicht mehr verfügbare automatische Werte werden offen, nicht als alter Befund weitergeführt',()=>{const s=candToSection({...cand(),bern:{speed:50,dtv:9000}});const r=abschnitteAktualisieren([s],[],'bern')[0];expect(r.speed).toBeNaN();expect(r.dtv).toBeNaN();expect(r.e5?.hinweise[0]).toContain('nicht mehr einheitlich')})
 it('Fall erhält leere Zahlen, Planung, bestätigten NPVM-Beleg, Quellenstand und Velozahl',()=>{const s=candToSection(cand()),b={...npvmFuerCand(cand(),[snap()])!,bestaetigt:true};s.dtv=6000;s.quelle.dtv='bestaetigt';s.e5Bestaetigt={dtv:b};s.aufteilung=startAufteilung(s);const f=fallLesen(fallText({standard:'bern',gebiet:'schweiz',strasse:'Test',sections:[s],cands:[cand()],quellen:[]}));expect(f.sections[0].fahrbahnbreite).toBeNaN();expect(f.sections[0].aufteilung).toEqual(s.aufteilung);expect(f.sections[0].e5Bestaetigt?.dtv).toEqual(b);expect(f.sections[0].id).not.toBe(s.id)})
 it('ungültige Version und Geometrie werden vor Übernahme abgelehnt',()=>{expect(()=>fallLesen('{"format":"VeloroutenCheck","version":2}')).toThrow();const f={standard:'bern' as const,gebiet:'bern' as const,strasse:'',sections:[defaultSection()],cands:[{...cand(),geom:[{lat:100,lon:7},{lat:100,lon:7}]}],quellen:[]};expect(()=>fallLesen(fallText(f))).toThrow()})
 it('unterschiedliche Quellenwerte werden nicht über eine ganze Strasse ausgedehnt',()=>{const c=cand(),b=npvmFuerCand(c,[snap()])!,e={belege:{},hinweise:[],vorschlaege:[b]};const abschnitte=candsToSections([{...c,e5:e},{...c,id:2,wayId:2,geom:[ll([2600100,1200000]),ll([2600200,1200000])],e5:{...e,vorschlaege:[{...b,wert:9000}]}}]);expect(abschnitte).toHaveLength(1);expect(abschnitte[0].e5?.vorschlaege).toEqual([])})
 it('bestätigter Stand wird durch neuere Metadaten nicht umetikettiert',()=>{const s=defaultSection();s.dtv=6000;s.quelle.dtv='bestaetigt';s.e5Bestaetigt={dtv:{...npvmFuerCand(cand(),[snap()])!,bestaetigt:true,datenstand:'01.11.2026'}};const html=renderToStaticMarkup(createElement(E5Abschnitt,{s,druck:true}));expect(html).toContain('01.11.2026');expect(html).toContain('ausgewählte Quelle');expect(html).not.toContain(' · bestätigt')})
 it('CSV nennt Ersatzstandard und separate Velozahl samt Zeitraum',()=>{const s={...defaultSection(),datenOrt:{name:'Thun'},velozaehlungen:[{id:'a',name:'Zählstelle A',punkt:{lat:46.95,lon:7.44},quelle:'Test',url:'',datum:'2025',abgerufen:'2025-01-01',werte:[{richtung:'beide',anzahl:900,intervalle:1,einheit:'Velos',validierung:'validiert'}],hinweis:'',datenstand:'2025'}]};const csv=buildCsv([s],[bewerteAbschnitt(s,'bern')],null,'bern','Bern');expect(csv).toContain('Ersatzstandard für Thun');expect(csv).toContain('2025');expect(csv).toContain('Zählstelle A')})
})
describe('E5 · Datenstand',()=>{
 it('abgerufene Velozählung behält Zeitraum, fehlende Werte und Herkunft in Fall, Druck und CSV ohne Eingabe oder Notenwirkung',()=>{
  const zaehlung:VeloZaehldaten={id:'zh:1',name:'Testzählstelle',punkt:ll(p),quelle:'Stadt Zürich',url:'https://data.stadt-zuerich.ch/',datum:'2026-10-31',abgerufen:'2026-11-02T12:00:00Z',datenstand:'02.11.2026',hinweis:'Gerätewerte; kein Jahres-DTV',werte:[{richtung:'Nord',anzahl:734,intervalle:96,einheit:'Viertelstunden',validierung:'nicht korrigiert'},{richtung:'Süd',anzahl:null,intervalle:0,einheit:'Viertelstunden',validierung:'fehlend'}]}
  const basis=candToSection(cand()),s={...basis,velozaehlungen:[zaehlung]},f=fallLesen(fallText({standard:'bern',gebiet:'schweiz',strasse:'Test',sections:[s],cands:[cand()],quellen:[]}))
  expect(f.sections[0].velozaehlungen).toEqual([zaehlung]);expect(bewerteAbschnitt(s,'bern')).toEqual(bewerteAbschnitt(basis,'bern'))
  const html=renderToStaticMarkup(createElement(E5Abschnitt,{s,druck:true}))
  expect(html).toContain('<details class="vrc-klappe" open=""');expect(html).toContain('734');expect(html).toContain('keine verwendbare Zahl');expect(html).toContain('2026-10-31');expect(html).not.toContain('<input');expect(html).not.toContain('<button')
  const csv=buildCsv([s],[bewerteAbschnitt(s,'bern')],null,'bern','Bern');expect(csv).toContain('Testzählstelle');expect(csv).toContain('2026-10-31');expect(csv).toContain('nicht korrigiert')
 })
 it('neue Ladung kann neue offizielle Produktaktualisierung anzeigen',async()=>{let zeit=Date.parse('2026-11-01T00:00:00Z');vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({editingInfo:{lastEditDate:zeit}}))));const u='https://map.stadtluzern.ch/server/rest/services/OGD/strassenachse/FeatureServer/0/query';expect((await quelleMetadaten(u,{})).datenstand).toContain('1.11.2026');zeit=Date.parse('2026-11-02T00:00:00Z');expect((await quelleMetadaten(u,{})).datenstand).toContain('2.11.2026')})
 it('Abrufdatum ersetzt keinen fehlenden Datenstand; verspätete alte Antworten ignorieren',()=>{const generation=datenGeneration();datenlaufNeu();meldeAbruf('https://example.ch/alt.json',null,{},undefined,generation);expect(datenStaende()).toEqual([]);meldeAbruf('https://example.ch/neu.json',null,{});expect(datenStaende()[0].datenstand).toBe('unbekannt');expect(datenStaende()[0].abgerufen).toMatch(/^2026-/)})
})
