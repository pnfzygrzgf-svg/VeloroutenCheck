// ── Strassensuche über der Karte, mit Vorschlägen (seit 17.10.2026, nach fgsCheck Ortssuche.tsx) ──
//
// Tippen → nach SUCHE_PAUSE_MS und ab SUCHE_MIN_ZEICHEN Zeichen Vorschläge der gewählten Stadt
// (strassenvorschlaege.ts). Vorschlag wählen oder Enter lädt die Strasse aus OpenStreetMap (onLaden).
// Jede neue Eingabe bricht die laufende Anfrage ab; eine Antwort gilt nur, solange sie zum
// aktuellen Text gehört. Tastatur: Pfeile wählen, Enter übernimmt, Escape schliesst bzw. leert.

import { useEffect, useId, useRef, useState } from 'react'
import { sucheStrasse } from './strassenvorschlaege'

const SUCHE_PAUSE_MS = 300
const SUCHE_MIN_ZEICHEN = 3

export default function Strassensuche({ text, setText, stadt, busy, onLaden }: {
  text: string; setText: (t: string) => void
  stadt: string                              // Stadtname wie in den Postadressen (Bern, Zürich, Basel, Luzern)
  busy: boolean
  onLaden: (name: string) => void
}) {
  const [treffer, setTreffer] = useState<string[]>([])
  const [aktiv, setAktiv] = useState(-1)
  const [offen, setOffen] = useState(false)
  const [laedt, setLaedt] = useState(false)
  const ctrlRef = useRef<AbortController | null>(null)
  const eingabeRef = useRef<HTMLInputElement>(null)
  const gewaehltRef = useRef('')             // eben übernommener Text: keine neue Suche dafür
  const textRef = useRef(text)
  useEffect(() => { textRef.current = text }, [text])
  const listeId = useId()

  useEffect(() => {
    const q = text.trim()
    ctrlRef.current?.abort(); setTreffer([]); setAktiv(-1); setOffen(false); setLaedt(false)
    if (q.length < SUCHE_MIN_ZEICHEN || q === gewaehltRef.current) return
    const t = window.setTimeout(() => {
      const ctrl = new AbortController()
      ctrlRef.current = ctrl
      setLaedt(true)
      sucheStrasse(q, stadt, ctrl.signal).then(liste => {
        if (ctrl.signal.aborted || q !== textRef.current.trim()) return
        setTreffer(liste); setAktiv(liste.length ? 0 : -1); setOffen(document.activeElement === eingabeRef.current); setLaedt(false)
      }, () => { if (!ctrl.signal.aborted) { setTreffer([]); setLaedt(false) } })   // ohne Vorschläge bleibt Enter
    }, SUCHE_PAUSE_MS)
    return () => clearTimeout(t)
  }, [text, stadt])
  useEffect(() => () => ctrlRef.current?.abort(), [])

  const laden = (name: string) => {
    const n = name.trim()
    if (!n || busy) return
    gewaehltRef.current = n
    ctrlRef.current?.abort(); setLaedt(false); setOffen(false); setTreffer([]); setAktiv(-1)
    setText(n)
    eingabeRef.current?.blur()               // Tastatur auf dem Telefon schliessen
    onLaden(n)
  }

  const taste = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!treffer.length) return
      e.preventDefault(); setOffen(true)
      const d = e.key === 'ArrowDown' ? 1 : -1
      setAktiv(a => (a + d + treffer.length) % treffer.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      laden(offen && treffer[aktiv] ? treffer[aktiv] : text)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (offen) setOffen(false)
      else setText('')
    }
  }

  return (
    <div className="vrc-suche">
      <input ref={eingabeRef} type="search" value={text} placeholder={`Strasse in ${stadt} suchen`}
        aria-label={`Strasse in ${stadt} suchen`} role="combobox" aria-autocomplete="list" aria-expanded={offen}
        aria-controls={listeId} aria-activedescendant={offen && aktiv >= 0 ? `${listeId}-${aktiv}` : undefined}
        autoComplete="off" spellCheck={false}
        onChange={e => { gewaehltRef.current = ''; setText(e.target.value) }} onKeyDown={taste}
        onFocus={() => { if (treffer.length) setOffen(true) }} onBlur={() => setOffen(false)} />
      {(laedt || busy) && <span className="vrc-suche-laedt" aria-hidden="true">…</span>}
      {offen && (
        <ul className="vrc-suche-liste" id={listeId} role="listbox">
          {treffer.length === 0 && <li className="vrc-suche-leer" role="option" aria-disabled="true" aria-selected={false}>
            Kein Vorschlag · Enter lädt den Namen</li>}
          {treffer.map((name, i) => (
            <li key={name} id={`${listeId}-${i}`} role="option" aria-selected={i === aktiv} className={i === aktiv ? 'aktiv' : undefined}
              // mousedown statt click: das Feld verliert den Fokus sonst vor dem Klick und schliesst die Liste
              onMouseDown={e => { e.preventDefault(); laden(name) }} onMouseEnter={() => setAktiv(i)}>
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
