// ── Kachel «In anderen Rechnern prüfen» (Verknüpfung): öffnet die Stelle eines Abschnitts in einem anderen Rechner in einem neuen Tab ──
//
// Die Logos zeigen, dass es um ein anderes Thema in einem anderen Rechner geht. Es geht nur die Lage mit, nichts kommt zurück. Knoten
// und Streifen wählt man im Zielrechner, weil ein Abschnitt keine Knotengeometrie kennt.

import { RECHNER_NAME, zielAdresse, type Ort, type Rechner } from './verknuepfung'

const BILD: Record<'fgs' | 'swc', string> = { fgs: 'fgscheck.svg', swc: 'sichtweitencheck.svg' }
const RechnerLogo = ({ r, px = 20 }: { r: 'fgs' | 'swc'; px?: number }) =>
  <img className="rechner-logo" src={import.meta.env.BASE_URL + BILD[r]} alt="" width={px} height={px} />
const ZIELE: { r: 'fgs' | 'swc'; text: string }[] = [{ r: 'swc', text: 'Knotensicht prüfen' }, { r: 'fgs', text: 'Fussgängerstreifen prüfen' }]

export function AndereRechner({ abschnitte }: { abschnitte: { nr: number; ort: Ort }[] }) {
  if (!abschnitte.length) return null
  const von: Rechner = 'vrc'
  return (
    <details className="vrc-klappe vrc-kachel">
      <summary>In anderen Rechnern prüfen <RechnerLogo r="swc" /> <RechnerLogo r="fgs" /></summary>
      {abschnitte.map(a => <div key={a.nr}>
        {abschnitte.length > 1 && <h3 className="ziele-kopf">Abschnitt {a.nr}</h3>}
        <ul className="ziele">{ZIELE.map(z => <li key={z.r}>
          <RechnerLogo r={z.r} px={28} />
          <span><a href={zielAdresse(z.r, von, { ort: a.ort })} target="_blank" rel="noopener noreferrer"><b>{RECHNER_NAME[z.r]}</b>&nbsp;↗</a><br />{z.text}</span>
        </li>)}</ul>
      </div>)}
      <p className="klein">Öffnet die Stelle im anderen Rechner; Knoten oder Streifen wählst du dort. Das Ergebnis eines Rechners ersetzt das des
        anderen nicht und zählt nicht zur Note.</p>
    </details>
  )
}
