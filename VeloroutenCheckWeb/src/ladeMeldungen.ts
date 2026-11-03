/** Meldungen nach ihrer Rechenwirkung trennen; die App verwendet beide Ausgänge unmittelbar. */
export function ladeMeldungen(fehler: readonly string[], kontext: readonly string[]) {
  return { fehler: [...new Set(fehler)], kartenHinweise: [...new Set(kontext)] }
}
export const feldFehlerText = (fehler: readonly string[]) => fehler.length
  ? ` ⚠ Nicht erreichbar: ${[...new Set(fehler)].join(', ')} — betroffene Felder bitte von Hand prüfen.` : ''
