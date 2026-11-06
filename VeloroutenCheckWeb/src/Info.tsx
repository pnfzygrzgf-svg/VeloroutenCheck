// ── Info-Zeichen «i» mit Sprechblase (Panel): Erklärungen hinter einer Zeile statt kleiner Texte darunter ──
//
// Klick bzw. Fingertipp öffnet und hält offen, auf dem Desktop öffnet schon das Überfahren (Verlassen schliesst, solange nicht
// geklickt). Tastatur: Fokus, Enter bzw. Leertaste; Escape schliesst. Höchstens eine Sprechblase offen. Die Sprechblase liegt fest
// (position: fixed) über dem Panel, seitlich innerhalb des Panels, unter bzw. über dem Knopf; beim Scrollen folgt sie dem Knopf.

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

// höchstens eine offene Sprechblase: Id der offenen, für alle Info-Zeichen gemeinsam
let offenId: string | null = null
const hoerer = new Set<() => void>()
const setzeOffen = (id: string | null) => { if (offenId !== id) { offenId = id; for (const h of hoerer) h() } }
const abonnieren = (h: () => void) => { hoerer.add(h); return () => { hoerer.delete(h) } }
const lesen = () => offenId

const RAND_PX = 8           // Abstand der Sprechblase vom Rand des Panels bzw. Fensters
const BREITE_PX = 320       // grösste Breite
const VERLASSEN_MS = 150    // Maus vom Knopf in die Sprechblase: kurz offen lassen

export default function Info({ children, titel }: { children: React.ReactNode; titel?: string }) {
  const id = useId()
  const offen = useSyncExternalStore(abonnieren, lesen) === id
  const [gehalten, setGehalten] = useState(false)    // geklickt: bleibt offen beim Verlassen
  const knopf = useRef<HTMLButtonElement>(null)
  const blase = useRef<HTMLDivElement>(null)
  const timer = useRef(0)
  const [lage, setLage] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null)

  const schliessen = () => { clearTimeout(timer.current); setGehalten(false); if (offenId === id) setzeOffen(null) }
  useEffect(() => { if (!offen) setGehalten(false) }, [offen])
  useEffect(() => () => { clearTimeout(timer.current); if (offenId === id) setzeOffen(null) }, [id])

  // Lage: seitlich im Panel (bzw. im Fenster), unter dem Knopf, sonst darüber
  const messen = () => {
    const k = knopf.current, b = blase.current
    if (!k) return
    const kr = k.getBoundingClientRect()
    const pr = (k.closest('.vrc-panel') ?? document.body).getBoundingClientRect()
    const links = Math.max(pr.left, 0) + RAND_PX, rechts = Math.min(pr.right, window.innerWidth) - RAND_PX
    const oben = Math.max(pr.top, 0) + RAND_PX, unterkante = Math.min(pr.bottom, window.innerHeight) - RAND_PX
    const width = Math.min(BREITE_PX, rechts - links)
    const left = Math.min(Math.max(kr.left + kr.width / 2 - 24, links), rechts - width)
    // Höhe des Inhalts (ohne Begrenzung); passt sie weder darunter noch darüber: auf der Seite mit mehr Platz, mit Scrollbalken
    const h = b?.scrollHeight ?? 0
    // im sichtbaren Teil des Panels (auf dem Telefon liegt die Karte darüber)
    const unten = kr.bottom + 6, platzUnten = unterkante - unten, platzOben = kr.top - 6 - oben
    const darunter = h <= platzUnten || (h > platzOben && platzUnten >= platzOben)
    const maxHeight = Math.max(80, darunter ? platzUnten : platzOben)
    setLage({ left, top: darunter ? unten : kr.top - 6 - Math.min(h, maxHeight), width, maxHeight })
  }
  useLayoutEffect(() => { if (offen) messen(); else setLage(null) }, [offen])
  useLayoutEffect(() => { if (offen && lage && blase.current) messen() }, [offen, lage?.width])   // Höhe erst nach dem ersten Zeichnen
  useEffect(() => {
    if (!offen) return
    const neu = () => {
      const k = knopf.current
      // Knopf weggescrollt bzw. ausgeblendet: schliessen
      if (!k || !k.offsetParent) { schliessen(); return }
      const kr = k.getBoundingClientRect(), pr = k.closest('.vrc-panel')?.getBoundingClientRect()
      if (pr && (kr.bottom < pr.top || kr.top > pr.bottom)) { schliessen(); return }
      messen()
    }
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') { schliessen(); knopf.current?.focus() } }
    const aussen = (e: PointerEvent) => {
      const t = e.target as Node
      if (!knopf.current?.contains(t) && !blase.current?.contains(t)) schliessen()
    }
    window.addEventListener('scroll', neu, true)
    window.addEventListener('resize', neu)
    document.addEventListener('keydown', taste)
    document.addEventListener('pointerdown', aussen)
    return () => {
      window.removeEventListener('scroll', neu, true)
      window.removeEventListener('resize', neu)
      document.removeEventListener('keydown', taste)
      document.removeEventListener('pointerdown', aussen)
    }
  }, [offen])

  const ueber = (e: React.PointerEvent) => { if (e.pointerType === 'mouse') { clearTimeout(timer.current); setzeOffen(id) } }
  const weg = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || gehalten) return
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { if (offenId === id) setzeOffen(null) }, VERLASSEN_MS)
  }
  const klick = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    clearTimeout(timer.current)
    // offen und gehalten: zu; sonst (zu bzw. nur überfahren): offen halten
    if (offen && gehalten) schliessen()
    else { setzeOffen(id); setGehalten(true) }
  }
  const blasenId = `info-${id.replace(/:/g, '')}`

  return <>
    <button ref={knopf} type="button" className="info-knopf" aria-label={titel ? `Erklärung: ${titel}` : 'Erklärung'} aria-expanded={offen}
      aria-controls={offen ? blasenId : undefined} onClick={klick} onPointerEnter={ueber} onPointerLeave={weg}>i</button>
    {offen && createPortal(
      <div ref={blase} id={blasenId} role="dialog" aria-label={titel ?? 'Erklärung'} className="info-blase"
        style={lage ? { left: lage.left, top: lage.top, width: lage.width, maxHeight: lage.maxHeight } :
          { visibility: 'hidden', left: 0, top: 0, width: BREITE_PX }}
        onPointerEnter={ueber} onPointerLeave={weg} onClick={e => e.stopPropagation()}>
        <button type="button" className="info-zu" aria-label="Erklärung schliessen" onClick={() => { schliessen(); knopf.current?.focus() }}>×</button>
        <div className="info-text">{children}</div>
      </div>, document.body)}
  </>
}
