/** Zusatzkontext hat keine offenen Eingabefelder und wird getrennt von deren Ladefehlern gemeldet. */
export function KartenHinweise({ hinweise }: { hinweise: readonly string[] }) {
  if (!hinweise.length) return null
  const grenze = hinweise.find(h => h.startsWith('E6-Kartenkontext:'))
  return <aside className="klein" aria-label="Kartenhinweise">
    <p><b>Kartenhinweis:</b> {grenze ?? 'Zusätzlicher Kartenkontext ist teilweise nicht verfügbar.'}</p>
    <details className="vrc-klappe"><summary>Details zum Kartenkontext ({hinweise.length})</summary>
      <ul>{hinweise.map(h => <li key={h}>{h}</li>)}</ul>
    </details>
  </aside>
}
