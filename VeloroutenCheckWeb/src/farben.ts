// ── Farben der Karte und des Berichts (ohne Leaflet, damit der Bericht ohne Browser testbar ist) ──

// AV-Bodenbedeckung in der Planung (Aufteilung planen): Farben und Deckkraft wie in fgsCheck
// (Karte.tsx, nach der Berner Karte; Gebäude neutral dunkelgrau). Andere Arten werden nicht gezeigt.
export const AV_FARBEN: Record<string, string> = {
  Strasse_Weg: '#6e6e6e', Trottoir: '#e6e6c8', Verkehrsinsel: '#96c878', Gebaeude: '#3f3f46',
}
export const AV_DECKKRAFT: Record<string, number> = { Strasse_Weg: 0.25, Trottoir: 0.45, Verkehrsinsel: 0.6, Gebaeude: 0.5 }
// Parkfelder der Stadt darüber: blau, Parkverbotsfelder orange (beide zählen als Parkierung).
export const PARK_FARBE = '#2563eb', PARKVERBOT_FARBE = '#f97316'
