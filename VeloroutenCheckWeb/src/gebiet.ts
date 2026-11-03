import type { Cand } from './VeloMap'
import type { Stadt } from './fuehrungsform'
import { lv95, imPolygon, segSchnitt, abstandStrecke, type P } from './e5/geo'
import { geoAdminUrl, eigenschaften } from './e5/daten/anbieter/gemeinsam/geoAdmin'
import { ladeGebietStand } from './e5/daten/anbieter/gemeinsam/gebiet'
import { meldeQuelleStand, datenGeneration, meldeQuellenFehler } from './datenstand'
export type DatenOrt = { name:string; bfs?:number; kanton?:string; stadt?:Stadt; jahr?:number; gemeinden?:DatenOrt[]; hinweis?:string }
export type Suchgebiet = Stadt|'schweiz'
const BFS:Record<number,Stadt>={351:'bern',261:'zurich',2701:'basel',1061:'luzern'}
export function linieImGebiet(linie:P[],polys:P[][][]):boolean {
 return polys.some(poly=>linie.every(p=>imPolygon(p,poly))&&linie.slice(1).every((b,i)=>poly.every(r=>r.every((c,j)=>!segSchnitt(linie[i],b,c,r[(j+1)%r.length])))))
}
export const GEBIET_LAYER='ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill'
/** Berührung einschliesslich Grenzverlauf und Querung, nicht nur vollständig eingeschlossene Linien. */
export function linieBeruehrtGebiet(linie: P[], polys: P[][][]): boolean {
 return polys.some(poly => linie.some(p => imPolygon(p, poly)) || linie.slice(1).some((b, i) =>
  poly.some(ring => ring.some((a, j) => {
   const ende = ring[(j + 1) % ring.length]
   return segSchnitt(linie[i], b, a, ende) !== null || abstandStrecke(linie[i], a, ende) < 1e-5 || abstandStrecke(b, a, ende) < 1e-5
  }))))
}
export const kontextGemeinden = (ort?: DatenOrt) => ort?.gemeinden ?? (ort ? [ort] : [])
/** Anbieterwahl nach tatsächlicher Strassengeometrie, unabhängig vom Bewertungsstandard. */
export async function orteFuer(cs:readonly Cand[]):Promise<Map<number,DatenOrt>> {
 const generation=datenGeneration()
 const out=new Map<number,DatenOrt>();if(!cs.length)return out
 const ps=cs.flatMap(c=>c.geom.map(p=>lv95(p.lat,p.lon)))
 const box=[Math.min(...ps.map(p=>p[0]))-1,Math.min(...ps.map(p=>p[1]))-1,Math.max(...ps.map(p=>p[0]))+1,Math.max(...ps.map(p=>p[1]))+1]
 const urlFuerJahr=(jahr:number)=>geoAdminUrl(GEBIET_LAYER,box.join(','),'esriGeometryEnvelope',0,jahr,true)
 let url=urlFuerJahr(new Date().getUTCFullYear())
 try {
  const { jahr, abrufe: [r] }=await ladeGebietStand(j=>[urlFuerJahr(j)])
  url=urlFuerJahr(jahr)
  const fl=r.daten.results!.flatMap(f=>{const p=eigenschaften(f),g=f.geometry
   if(f.layerBodId!==GEBIET_LAYER||p.is_current_jahr!==true||p.jahr!==jahr||typeof p.gde_nr!=='number'||typeof p.gemname!=='string'||!g)return[]
   const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[]
   if (!/^[A-Z]{2}$/.test(String(p.kanton ?? '')) || !Number.isInteger(p.gde_nr) || p.gde_nr <= 0 || !Array.isArray(polys) || !polys.length) throw new Error('Unvollständige Gemeindegeometrie; örtliche Quellen eingeschränkt')
   return [{ort:{name:p.gemname,bfs:p.gde_nr,kanton:String(p.kanton),stadt:BFS[p.gde_nr]},polys:polys as P[][][]}]
  })
  if (!fl.length) throw new Error('Keine verlässlichen Gemeindegeometrien; örtliche Quellen eingeschränkt')
  for(const c of cs){
   const p=c.geom.map(p=>lv95(p.lat,p.lon)),treffer=fl.filter(f=>linieImGebiet(p,f.polys))
   const gemeinden=[...new Map(fl.filter(f=>linieBeruehrtGebiet(p,f.polys)).map(f=>[f.ort.bfs,f.ort])).values()].sort((a,b)=>a.bfs-b.bfs)
   out.set(c.id,treffer.length===1&&gemeinden.length===1?{...treffer[0].ort,jahr,gemeinden}:gemeinden.length?{
    name:gemeinden.map(g=>g.name).join(' / '),jahr,gemeinden,
    hinweis:'Abschnitt berührt mehrere Gemeinden; Kartenkontext aller berührten Gemeinden. Keine pauschale Übernahme eines einzelnen Stadtanbieters.'
   }:{name:'Ort nicht amtlich bestimmt',jahr,hinweis:'Keine Gemeinde an der Strassengeometrie belegt; örtliche Datenquellen eingeschränkt.'})
  }
  meldeQuelleStand('swisstopo.gebiet','Gemeindegrenzen · swisstopo',url,'gebiet',`${jahr} (Jahresstand)`,new Date().toISOString(),generation)
 }catch(e){meldeQuellenFehler('swisstopo.gebiet','Gemeindegrenzen · swisstopo',url,'gebiet',e,generation);for(const c of cs)out.set(c.id,{name:'Ort nicht amtlich bestimmt',hinweis:'Gebietsbestimmung ausgefallen; örtliche Datenquellen eingeschränkt. Eigene Angaben und schweizweite Daten bleiben nutzbar.'})}
 return out
}
export function standardText(standard:Stadt,ort?:DatenOrt):string {
 const name={bern:'Bern',zurich:'Zürich',basel:'Basel-Stadt',luzern:'Luzern'}[standard]
 return `Bewertung und Planung nach ${name==='Bern'?'Berner Standards':`Standards ${name}`}${ort&&ort.stadt!==standard?` – Ersatzstandard für ${ort.name}`:''}`
}
