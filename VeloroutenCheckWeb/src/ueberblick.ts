// ── Kartenbilder zum Überblick im Menü «Geladene Quellen» (seit 01.11.2026, Nutzerwunsch «die Höhenlinien anzeigen») ─────────
//
// Anders als die Ebenen der Vorbelegung (ebenen.ts) zeigen sie nicht, was die App gelesen hat, sondern das Kartenbild eines
// Dienstes, unabhängig von den geladenen Segmenten (wie «Routennetz ganze Stadt»). Zur Prüfung der Steigung:
//   Höhenlinien der Stadt, wo es sie als WMS gibt (Bern Geoportal «Hoehenlinien_2023», Äquidistanz 25 cm; Basel wms.geo.bs.ch
//   Haupt- und Nebenhöhenlinien, geprüft 01.11.2026), sonst und zusätzlich das Relief aus swissALTI3D (swisstopo WMTS; das
//   Höhenmodell selbst ist ein Raster ohne Höhenlinien, die App liest daraus das Profil für die Steigung, steigung.ts).
// Zürich und Luzern: keine frei zugänglichen Höhenlinien gefunden (der kantonale Zürcher WMS verlangt eine Anmeldung).

import type { Stadt } from './fuehrungsform'

export interface UeberblickEbene {
  id: string
  titel: string
  erklaerung: string        // Zeile unter dem Titel im Menü
  attribution: string
  art: 'wms' | 'xyz'
  url: string
  layers?: string           // WMS
  deckkraft: number
}

const RELIEF: UeberblickEbene = {
  id: 'relief', titel: 'Relief (swissALTI3D)', art: 'xyz', deckkraft: 0.55,
  url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissalti3d-reliefschattierung/default/current/3857/{z}/{x}/{y}.png',
  attribution: '© swisstopo (swissALTI3D)',
  erklaerung: 'Schattierung des Höhenmodells, aus dem die App die Steigung rechnet; Kartenbild, unabhängig von den Segmenten',
}

export const UEBERBLICK: Record<Stadt, UeberblickEbene[]> = {
  // Layer-Name des ArcGIS-WMS nicht geprüft (Geoportal am 01.11.2026 aus dem VPN nicht erreichbar): '0' wie beim Routennetz
  bern: [{ id: 'hoehenlinien', titel: 'Höhenlinien (Stadt Bern 2023)', art: 'wms', deckkraft: 0.9, layers: '0',
    url: 'https://map.bern.ch/arcgis/services/Geoportal/Hoehenlinien_2023/MapServer/WMSServer', attribution: 'Geodaten Stadt Bern (Höhenlinien 2023)',
    erklaerung: 'Äquidistanz 25 cm, aus der Laserbefliegung 2023; Kartenbild, unabhängig von den Segmenten' }, RELIEF],
  basel: [{ id: 'hoehenlinien', titel: 'Höhenlinien (Basel-Stadt)', art: 'wms', deckkraft: 0.9, layers: 'HK_Haupthoehenlinien,HK_Nebenhoehenlinien',
    url: 'https://wms.geo.bs.ch/', attribution: 'Geodaten Kanton Basel-Stadt (Höhenkurven)',
    erklaerung: 'Haupt- und Nebenhöhenlinien mit Höhenangabe; Kartenbild, unabhängig von den Segmenten' }, RELIEF],
  zurich: [RELIEF],
  luzern: [RELIEF],
}
