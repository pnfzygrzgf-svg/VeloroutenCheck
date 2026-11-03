/** ASTRA-Überlagerungen sind reiner Kartenkontext; die Rechnung liest weder ihre Pixel noch ihre Zahlen. */
export const ASTRA_EBENEN = [
  ['alle', 'Unfälle mit Personenschaden (ASTRA)'],
  ['fussgaenger', 'Unfälle mit Fussgängerbeteiligung (ASTRA)'],
  ['fahrraeder', 'Unfälle mit Velobeteiligung (ASTRA)'],
].map(([art,titel])=>({id:`astra.${art}`,titel,layer:`ch.astra.unfaelle-personenschaeden_${art}`,attribution:'© ASTRA',
  url:`https://wmts.geo.admin.ch/1.0.0/ch.astra.unfaelle-personenschaeden_${art}/default/99990101/3857/{z}/{x}/{y}.png`}))
export function astraStand(html:string):string {
  const m=html.match(/<td[^>]*>\s*Datenstand\s*<\/td>\s*<td[^>]*>\s*(\d{2})\.(\d{2})\.(\d{4})\s*<\/td>/i)
  if(!m)return 'unbekannt (Dienst liefert keinen verwendbaren Datenstand)'
  const iso=`${m[3]}-${m[2]}-${m[1]}`,t=Date.parse(iso)
  return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===iso?`${m[1]}.${m[2]}.${m[3]} (Ebene laut geo.admin.ch)`:'unbekannt (Datum ungültig)'
}
export async function ladeAstraStand(layer:string,signal?:AbortSignal):Promise<string> {
  const res=await fetch(`https://api3.geo.admin.ch/rest/services/api/MapServer/${layer}/legend?lang=de`,{signal,cache:'no-store'})
  if(!res.ok)throw new Error(`ASTRA Metadaten: HTTP ${res.status}`)
  return astraStand(await res.text())
}
