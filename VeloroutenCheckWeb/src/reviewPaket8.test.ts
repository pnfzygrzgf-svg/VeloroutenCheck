import { expect, it } from 'vitest'
import { datenquellenFuer, QUELLEN } from './quellen'
import { buildCsv } from './csv'
import { defaultSection } from './strecke'
const daten=(orte:unknown[])=>datenquellenFuer(orte as Parameters<typeof datenquellenFuer>[0]).map(q=>q.id)
it('zeigt schweizweite Quellen ausserhalb der vier Stadtprofile, aber keine Beleuchtung St. Gallen',()=>{
 const ids=daten([{name:'St. Gallen',bfs:3203,kanton:'SG'}])
 for(const id of ['av','bav','npvm','tlm_tram','gemeinden'])expect(ids).toContain(id)
 expect(ids).not.toContain('geo_bern');expect(ids).not.toContain('e6.zh.netz');expect(ids).not.toContain('e6.sg.licht')
 expect(QUELLEN.some(q=>q.id==='e6.sg.licht')).toBe(false)
 const zh=QUELLEN.find(q=>q.id==='e6.zh.netz')!
 expect(zh.herausgeber).toContain('Stadt Zürich');expect(zh.verwendung).toContain('CC0');expect(zh.verwendung).toContain('nur Kartenkontext')
})
it('filtert Kontext nach örtlichem Gebiet einschliesslich Grenzgemeinden',()=>{
 expect(daten([{name:'Uster',bfs:198,kanton:'ZH'}])).not.toContain('e6.zh.netz')
 expect(daten([{name:'Uster',bfs:198,kanton:'ZH'}]).filter(id=>id.startsWith('e6.'))).toEqual([])
 expect(daten([{name:'Winterthur',bfs:230,kanton:'ZH'}])).not.toContain('e6.zh.netz')
 const ids=daten([{name:'Grenzabschnitt',gemeinden:[{name:'Zürich',bfs:261,kanton:'ZH',stadt:'zurich'},{name:'Uster',bfs:198,kanton:'ZH'}]}])
 expect(ids.filter(id=>id.startsWith('e6.'))).toEqual(['e6.zh.netz'])
})
it('schreibt tatsächliche amtliche Herkunft statt des gewählten Bewertungsstandards in CSV',()=>{
 const s=defaultSection();s.datenOrt={name:'Zürich',bfs:261,kanton:'ZH',stadt:'zurich'};s.quelle={dtv:'amtlich',speed:'amtlich',routentyp:'amtlich'}
 const row=buildCsv([s],[],null,'bern','Bern').split('\r\n')[1].split(';')
 expect(row[3]).toContain('Kanton Zürich');expect(row[5]).toContain('Stadt Zürich');expect(row[11]).toContain('Stadt Zürich')
})
it('benennt ausdrücklich gewählte Feldquelle, erfindet bei unbekanntem Datenort aber keine Stadt',()=>{
 const s=defaultSection();s.dtv=1234;s.quelle.dtv='amtlich';s.datenOrt={name:'Ort ohne Stadtprofil',kanton:'SG'}
 expect(buildCsv([s],[],null,'bern','Bern').split('\r\n')[1].split(';')[3]).toContain('Herkunft unbekannt')
 s.feldAuswahl={dtv:'eigene-quelle'};s.feldQuellen={dtv:[{id:'eigene-quelle',name:'Zählung der Gemeinde',wert:1234,quelle:'amtlich'}]}
 expect(buildCsv([s],[],null,'bern','Bern').split('\r\n')[1].split(';')[3]).toBe('Zählung der Gemeinde')
})

it.each([['bern','Bern','Stadt Bern'],['basel','Basel','Kanton Basel-Stadt'],['luzern','Luzern','Stadt Luzern']] as const)(
 'amtliche CSV-Herkunft in %s bleibt unabhängig vom Ersatzstandard', (stadt,name,anbieter)=>{
  const s=defaultSection();s.datenOrt={name,stadt};s.quelle={dtv:'amtlich',speed:'amtlich',routentyp:'amtlich'}
  const row=buildCsv([s],[],null,'zurich','Zürich').split('\r\n')[1].split(';')
  for(const i of [3,5,11])expect(row[i]).toContain(anbieter)
 })
it('belässt die Kennzeichnung abgeleiteter und OSM-Werte im Export',()=>{
 const s=defaultSection();s.quelle={dtv:'abgeleitet',speed:'osm'}
 const row=buildCsv([s],[],null,'bern','Bern').split('\r\n')[1].split(';')
 expect(row[3]).toBe('abgeleitet');expect(row[5]).toBe('OSM')
})
it('leitet ohne Datenort und Quellenbeleg keinen Anbieter aus dem Bewertungsstandard ab',()=>{
 const s=defaultSection();s.quelle={speed:'amtlich'}
 const bern=buildCsv([s],[],null,'bern','Bern').split('\r\n')[1].split(';')[5]
 const zh=buildCsv([s],[],null,'zurich','Zürich').split('\r\n')[1].split(';')[5]
 expect(bern).toBe(zh);expect(bern).toContain('Herkunft unbekannt')
})
