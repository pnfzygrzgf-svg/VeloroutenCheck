import type { UnfallArt } from './kartenbaustein/unfaelle'
/** ASTRA-Überlagerungen sind reiner Kartenkontext; die Rechnung liest weder ihre Pixel noch ihre Zahlen. */
export const ASTRA_EBENEN = [
  ['alle', 'Unfälle mit Personenschaden (ASTRA)'],
  ['fussgaenger', 'Unfälle mit Fussgängerbeteiligung (ASTRA)'],
  ['fahrraeder', 'Unfälle mit Velobeteiligung (ASTRA)'],
].map(([art,titel])=>({id:`astra.${art}`,art:art as UnfallArt,titel,layer:`ch.astra.unfaelle-personenschaeden_${art}`,attribution:'© ASTRA',
  url:`https://wmts.geo.admin.ch/1.0.0/ch.astra.unfaelle-personenschaeden_${art}/default/99990101/3857/{z}/{x}/{y}.png`}))
export { astraStand, ladeAstraStand } from './kartenbaustein/unfaelle'
