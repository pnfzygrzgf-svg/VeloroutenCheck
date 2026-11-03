import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DatenabrufHinweis } from './DatenabrufHinweis'
import { E6_DIENSTE } from './e5/daten/anbieter/gemeinsam/e6'
it('nennt tatsächliche Daten- und Metadatenempfänger, auch diejenigen des Kontextes',()=>{
 const html=renderToStaticMarkup(<DatenabrufHinweis />)
 const hosts=['overpass.osm.ch','overpass-api.de','overpass.kumi.systems','overpass.private.coffee',
  'map.bern.ch','data.bs.ch','wfs.geo.bs.ch','map.stadtluzern.ch','public.geo.lu.ch','geodienste.ch','www.geodienste.ch',
  'api3.geo.admin.ch','wmts.geo.admin.ch','wms.geo.admin.ch','data.geo.admin.ch',
  ...E6_DIENSTE.flatMap(d=>[new URL(d.url).host,new URL(d.meta).host])]
 for(const host of hosts)expect(html).toContain(host)
 expect(html).toContain('Metadaten');expect(html).not.toContain('E6-')
})
