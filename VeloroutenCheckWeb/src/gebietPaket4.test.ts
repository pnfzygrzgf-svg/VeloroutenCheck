import { afterEach, expect, it, vi } from 'vitest'
import { orteFuer, linieBeruehrtGebiet, GEBIET_LAYER } from './gebiet'
import { ladeE6Kontext } from './e6'
import { ladeE6 } from './e5/daten/anbieter/gemeinsam/e6'
import { datenlaufNeu, datenStaende } from './datenstand'
import type { Cand } from './VeloMap'
import { wgs } from './e5/geo'
vi.mock('./e5/daten/anbieter/gemeinsam/e6', async original=>({...await original<typeof import('./e5/daten/anbieter/gemeinsam/e6')>(),ladeE6:vi.fn()}))
const c:Cand={id:1,wayId:1,geom:[0,100].map(x=>{const[lat,lon]=wgs(2683000+x,1252000);return{lat,lon}}),name:'Grenzstrasse',len:100,selected:true,ist:'Mischverkehr'}
const fl=(bfs:number,name:string,x0:number,x1:number,jahr=new Date().getUTCFullYear())=>({layerBodId:GEBIET_LAYER,properties:{is_current_jahr:true,jahr,gde_nr:bfs,gemname:name,kanton:'ZH'},geometry:{type:'Polygon',coordinates:[[[2683000+x0,1251990],[2683000+x1,1251990],[2683000+x1,1252010],[2683000+x0,1252010],[2683000+x0,1251990]]]}})
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();datenlaufNeu()})
it('neuester verfügbarer Stand statt Kalenderjahr; Grenzsegment erhält Kontext beider Gemeinden',async()=>{
 const fetch=vi.fn(async (_url: unknown)=>new Response(JSON.stringify({results:[fl(261,'Zürich',-1,50),fl(52,'Bassersdorf',50,101)]})))
 vi.stubGlobal('fetch',fetch)
 const ort=(await orteFuer([c])).get(1)!
 expect(ort).toMatchObject({jahr:new Date().getUTCFullYear(),gemeinden:[{bfs:52},{bfs:261}]})
 expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get('timeInstant')).toBe(String(new Date().getUTCFullYear()))
 vi.mocked(ladeE6).mockRejectedValue(new Error('Testausfall'))
 await ladeE6Kontext([{...c,datenOrt:ort}])
 const ids=vi.mocked(ladeE6).mock.calls.map(([d])=>d.id)
 expect(ids).toEqual(['e6.zh.netz'])
})
it('leere Gebietsantwort ist ein sichtbarer Ausfall statt erfolgreicher Schweiz-Rückfall',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"results":[]}')))
 const ort=(await orteFuer([c])).get(1)!
 expect(ort).toHaveProperty('hinweis')
 expect(datenStaende().find(d=>d.id==='swisstopo.gebiet')?.status).toBe('fehler')
})

it('Linie exakt auf gemeinsamer Grenze berührt beide Gemeinden, auch bei parallelen Kanten',()=>{
 const links=[[[0,0],[10,0],[10,10],[0,10],[0,0]]] as [number,number][][]
 const rechts=[[[10,0],[20,0],[20,10],[10,10],[10,0]]] as [number,number][][]
 expect(linieBeruehrtGebiet([[10,2],[10,8]],[links])).toBe(true)
 expect(linieBeruehrtGebiet([[10,2],[10,8]],[rechts])).toBe(true)
})

it('VRC wiederholt leeres laufendes Jahr genau einmal mit Vorjahr und zeigt das verwendete Jahr',async()=>{
 const jahr=new Date().getUTCFullYear()
 const fetch=vi.fn(async(url:string)=>new Response(JSON.stringify({results:new URL(url).searchParams.get('timeInstant')===String(jahr)?[]:[fl(261,'Zürich',-1,101,jahr-1)]})))
 vi.stubGlobal('fetch',fetch)
 expect((await orteFuer([c])).get(1)).toMatchObject({jahr:jahr-1,stadt:'zurich'})
 expect(fetch.mock.calls.map(([u])=>new URL(u).searchParams.get('timeInstant'))).toEqual([String(jahr),String(jahr-1)])
 expect(datenStaende().find(d=>d.id==='swisstopo.gebiet')?.datenstand).toBe(`${jahr-1} (Jahresstand)`)
})
it('VRC begrenzt den Abruf bei vielen möglichen Jahrgängen; bei zwei leeren Jahren sichtbarer Ausfall',async()=>{
 const jahr=new Date().getUTCFullYear()
 const fetch=vi.fn(async(url:string)=>new Response(JSON.stringify({results:new URL(url).searchParams.has('timeInstant')?[]:Array.from({length:200},()=>fl(261,'Zürich',-1,101,1850))})))
 vi.stubGlobal('fetch',fetch)
 expect((await orteFuer([c])).get(1)?.hinweis).toContain('ausgefallen')
 expect(fetch.mock.calls.map(([u])=>new URL(u).searchParams.get('timeInstant'))).toEqual([String(jahr),String(jahr-1)])
 expect(datenStaende().find(d=>d.id==='swisstopo.gebiet')?.status).toBe('fehler')
})
