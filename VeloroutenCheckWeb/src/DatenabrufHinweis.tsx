/** Empfänger der im Rechner tatsächlich verwendeten Daten- und Metadatenabrufe. */
export function DatenabrufHinweis(){
 return <>
  Alle Berechnungen laufen vollständig im Browser. Eingaben und Ergebnisse bleiben im Browser.
  Datendienste erhalten den Kartenausschnitt bzw. die Lage des Abschnitts; die Strassensuche sendet den Suchtext an swisstopo.
  Die Anbieter sehen dabei technisch die IP-Adresse und Browserangaben.
  <br />
  OpenStreetMap: overpass.osm.ch; bei Störung overpass-api.de, overpass.kumi.systems oder overpass.private.coffee.
  Amtliche Vermessung: geodienste.ch; kantonale Publikationsstände: www.geodienste.ch.
  Bundesdaten, Suche, Höhenprofile und Ebenenmetadaten: api3.geo.admin.ch; Karten: wmts.geo.admin.ch und wms.geo.admin.ch.
  Eingeschaltete Höhenkurven senden ab Zoom 18 den Ausschnitt zur Kachelsuche und beziehen begrenzte Raster-Teilabrufe über data.geo.admin.ch.
  <br />
  Örtliche Daten und öffentliche Metadaten: map.bern.ch; Zürich: www.ogd.stadt-zuerich.ch, data.stadt-zuerich.ch und maps.zh.ch;
  Basel-Stadt: data.bs.ch und wfs.geo.bs.ch; Luzern: map.stadtluzern.ch und public.geo.lu.ch; St. Gallen: daten.stadt.sg.ch.
  Diese Metadatenabrufe enthalten Produkt- und Dienstkennungen, keine Eingaben oder Ergebnisse.
  Unfall-Kartenebenen (ASTRA) und örtliche Beleuchtungsstandorte, VBZ-Rillen sowie das Zürcher Fuss-/Velowegnetz sind nur Kartenkontext;
  sie verändern keine Eingaben oder Bewertung. Fahrplan-, Luftbild-Erkennungs- und Überholabstand-Snapshots liegen als Dateien auf dieser Seite;
  dafür erfolgen keine Anfragen an die ursprünglichen Anbieter.
 </>
}
