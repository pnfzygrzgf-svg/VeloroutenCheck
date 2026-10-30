// ── Velonetz der Städte als Kartenebene «Routennetz» (seit 30.10.2026, Nutzerwunsch) ─────────────────────────────────────
//
// Je Stadt ein WMS (transparent, über dem Hintergrund) und die Erklärung beim Überfahren einer Linie (seit 30.10.2026,
// Nutzerwunsch «beim Überfahren der Netzlinien sollte Text angezeigt werden, der es erklärt»): VeloMap fragt an der Stelle
// GetFeatureInfo ab (JSON, alle vier Dienste erlauben CORS) und zeigt `beschreiben(Merkmale)` als Tooltip. Abklärung der Felder
// 30.10.2026 an je einer Probe; die Werte «Null» der ArcGIS-Dienste (Bern, Luzern) sind Text, nicht null.
// Basel: Teilrichtplan Velo 2026, ENTWURF in Vernehmlassung (Nutzerentscheid 30.10.2026, Variante A); die Buchstaben an den
// gestrichelten Linien sind die Massnahmennummern geplanter Netzlücken (Feld «Massnahmennummer Veloinfrastruktur»).

import type { Stadt } from './fuehrungsform'

export type Merkmale = Record<string, unknown>
export interface RoutennetzWms {
  url: string
  layers: string
  attribution: string
  titel: string                                   // Tooltip am Kästchen «Routennetz» (Quelle und Farben)
  infoFormat: string                              // GetFeatureInfo-Format, das der Dienst als JSON liefert
  // Zusätzliche Parameter der Abfrage. QGIS Server (Zürich, Basel) trifft eine Linie ohne Angabe nur bis rund 3 Pixel daneben,
  // ArcGIS (Bern, Luzern) bis 6–8 Pixel (Probe 30.10.2026, Nutzerbefund «funktioniert in Basel und Zürich nicht»)
  infoExtra?: Record<string, string>
  beschreiben: (m: Merkmale) => string | null     // Text einer Linie; null = nichts zu zeigen
}

const QGIS_FANG = { FI_LINE_TOLERANCE: '8', FI_POINT_TOLERANCE: '8', FI_POLYGON_TOLERANCE: '4' }

// Mehrere Linien an einer Stelle (überlagerte Netzstufen, Zürich: Vorzugsroute über Basisnetz): höchste Stufe zuerst
export const NETZ_RANG = (t: string): number => (/vorzug/i.test(t) ? 0 : /haupt/i.test(t) ? 1 : /veloroute|neben|basis/i.test(t) ? 2 : 3)
export const netzTexte = (texte: string[]): string[] => [...new Set(texte)].sort((a, b) => NETZ_RANG(a) - NETZ_RANG(b))

// Text eines Feldes; «Null», leer und null gelten als fehlend
const txt = (v: unknown): string | null => {
  if (v == null) return null
  const s = String(v).trim()
  return s && s !== 'Null' ? s : null
}
const ja = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1'

// Bern: Veloroutentyp 1–6 wie im Renderer des Geoportals (Layer 0)
const BERN_TYP: Record<string, string> = {
  '1': 'Velohauptroute entlang Hauptverkehrsachsen', '2': 'Velohauptroute abseits Hauptverkehrsachsen',
  '3': 'Velohauptroute entlang neuer Stadtstrasse A6', '4': 'Veloroute entlang Hauptverkehrsstrassen',
  '5': 'Veloroute abseits Hauptverkehrsstrassen', '6': 'Veloroute abseits Hauptverkehrsstrassen mit Fokus Freizeit',
}
export function beschreibeBern(m: Merkmale): string | null {
  const typ = BERN_TYP[txt(m.VELOROUTENTYP) ?? ''] ?? null
  if (!typ) return null
  const nr = txt(m.NUMMER_VELOHAUPTROUTEN), name = txt(m.NAME_VELOHAUPTROUTEN), strasse = txt(m.STRASSENNAME)
  return [typ, nr || name ? `Velohauptroute${nr ? ` ${nr}` : ''}${name ? ` «${name}»` : ''}` : null, strasse].filter(Boolean).join(' · ')
}

// Zürich: Kategorie der Velonetzplanung
const ZH_KAT: Record<string, string> = {
  Vorzugsroute: 'Velovorzugsroute', Hauptnetz: 'Hauptnetz', Basisnetz: 'Basisnetz', 'Ergänzungsidee BeKo': 'Ergänzungsidee (BeKo)',
}
export function beschreibeZuerich(m: Merkmale): string | null {
  const k = txt(m.kategorie)
  return k ? `${ZH_KAT[k] ?? k} (Velonetzplanung)` : null
}

// Basel: Netzstufe aus drei Ja-Feldern, dazu Stand und Massnahmennummer
export function beschreibeBasel(m: Merkmale): string | null {
  const stufe = ja(m.Velovorzugsroute) ? 'Velovorzugsroute' : ja(m.Velohauptverbindung) ? 'Velohauptverbindung'
    : ja(m.Velonebenverbindung) ? 'Velonebenverbindung' : null
  if (!stufe) return null
  const stand = txt(m.Status), mn = txt(m['Massnahmennummer Veloinfrastruktur'])
  return [stufe, stand, mn ? `Massnahme ${mn}` : null].filter(Boolean).join(' · ') + ' (Entwurf Teilrichtplan Velo 2026)'
}

// Luzern: Routentyp, Strasse und, wo vorhanden, die Massnahme mit Umsetzung
export function beschreibeLuzern(m: Merkmale): string | null {
  const typ = txt(m.VELO_ROUTENTYP)
  if (!typ) return null
  const mn = txt(m.VELO_MN_BEZEICHNUNG), um = txt(m.VELO_MN_UMSETZUNG), jahr = txt(m.VELO_MN_JAHR_ABSCHLUSS)
  return [typ, txt(m.STRASSE), mn ? `Massnahme: ${mn}${um || jahr ? ` (${[um, jahr].filter(Boolean).join(', ')})` : ''}` : null]
    .filter(Boolean).join(' · ')
}

export const ROUTENNETZ: Partial<Record<Stadt, RoutennetzWms>> = {
  // Veloroutennetz des Masterplans (Geoportal; dieselbe Quelle wie das Feld Routentyp, Layer 0)
  bern: { url: 'https://map.bern.ch/arcgis/services/Geoportal/Veloroutennetz_Masterplan/MapServer/WMSServer', layers: '0',
    attribution: 'Geodaten Stadt Bern (Veloroutennetz Masterplan)', infoFormat: 'application/geo+json', beschreiben: beschreibeBern,
    titel: 'Veloroutennetz des Masterplans Veloinfrastruktur: Velohauptrouten blau, Velorouten grün; Linie überfahren für Einzelheiten' },
  // Velonetzplanung (dieselbe Quelle wie das Feld Routentyp, view_velonetz)
  zurich: { url: 'https://www.ogd.stadt-zuerich.ch/wms/geoportal/Velonetzplanung', layers: 'view_velonetz',
    attribution: 'Geodaten Stadt Zürich (Velonetzplanung)', infoFormat: 'application/json', infoExtra: QGIS_FANG, beschreiben: beschreibeZuerich,
    titel: 'Velonetzplanung der Stadt Zürich: Vorzugsrouten rot, Hauptnetz grün, Basisnetz dünn grün; Linie überfahren für Einzelheiten' },
  // Teilrichtplan Velo 2026, Routennetz Alltag: ENTWURF; der Routentyp liest den geltenden Plan 2019 (WFS TV_Pendlerrouten_Bestand)
  basel: { url: 'https://wms.geo.bs.ch/', layers: 'ch.bs.teilrichtplan_velo_trve.trp_velo_routennetz_alltag',
    attribution: 'Geodaten Kanton Basel-Stadt (Teilrichtplan Velo 2026, Entwurf)', infoFormat: 'application/json', infoExtra: QGIS_FANG,
    beschreiben: beschreibeBasel,
    titel: 'Teilrichtplan Velo 2026 (Entwurf, in Vernehmlassung), Routennetz Alltag: Velovorzugsrouten rosa, Velohauptverbindungen blau, '
      + 'Velonebenverbindungen hellblau; gestrichelt Netzlücken, die Buchstaben sind ihre Massnahmennummern; Linie überfahren für Einzelheiten' },
  // Velonetz (WMS-Layer 2 = REST-Layer 7, dieselbe Quelle wie das Feld Routentyp)
  luzern: { url: 'https://map.stadtluzern.ch/server/services/OGD/velonetz/MapServer/WMSServer', layers: '2',
    attribution: '© Geoinformationszentrum Stadt Luzern (Velonetz)', infoFormat: 'application/geo+json', beschreiben: beschreibeLuzern,
    titel: 'Velonetz der Stadt Luzern: Velohauptrouten blau, Haupt- und Nebenrouten braun; Linie überfahren für Einzelheiten' },
}
