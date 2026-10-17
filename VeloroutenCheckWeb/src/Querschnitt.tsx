// ── Querschnitt als Skizze (Aufteilung planen, Etappe 2) ──────────────────────
//
// Massstäbliche Zeichnung quer zur Strasse, in Fahrtrichtung der Seite A gesehen: links der Rand
// der Seite B, rechts der Rand der Seite A (wie die Liste der Teile). Gezeichnet wird in
// Zentimetern, weil die Streetmix-Illustrationen 1 px = 1 cm messen (public/streetmix/, CC BY-SA
// 4.0); jede Figur steht mittig auf ihrem Teil, mit dem unteren Bildrand auf dem Boden. Seite A
// fährt vom Betrachter weg (Ansicht von hinten, «outbound»), Seite B kommt entgegen («inbound»);
// auf der Einbahn fährt alles weg.
//
// Mehrere Skizzen untereinander (heute / Planung) teilen sich den Massstab (breiteCm), damit
// gleiche Breiten gleich lang aussehen. Die Schrift wird in Bildschirm-Pixeln bemessen
// (ResizeObserver), sonst würde sie bei breiten Strassen unlesbar klein.

import { useEffect, useRef, useState } from 'react'
import { bildVon, istFahrbahnTeil, richtungVon, type Teil, type TeilArt } from './aufteilung'
import { numDE } from './csv'

const RAND_CM = 40           // seitlicher Rand der Zeichnung
const LUFT_CM = 20           // Platz über der höchsten Figur
const BODEN_CM = 40          // Dicke des Bodenstreifens
const BORD_CM = 15           // Trottoir und Grünstreifen über der Fahrbahn
const MARK_CM = 100          // Streifen mit den Markierungen in Draufsicht (nur wenn es welche gibt)
const SCHRIFT_PX = 11

const BODEN: Record<TeilArt, string> = {
  Trottoir: '#d6d3d1', Haltestelle: '#e7e5e4', Gruen: '#65a30d', Parkierung: '#6b7280', Veloabstellplatz: '#6b7280', Parklet: '#6b7280',
  Sicherheitsstreifen: '#6b7280', Velostreifen: '#a16207', Pfosten: '#4b5563', Radweg: '#b45309', Trennstreifen: '#a8a29e',
  Fahrspur: '#4b5563', Gemeinsam: '#4b5563', Kernfahrbahn: '#4b5563', Velostrasse: '#4b5563', Tram: '#4b5563',
}
const KURZ: Record<TeilArt, string> = {
  Trottoir: 'Trottoir', Haltestelle: 'Haltestelle', Gruen: 'Grün', Parkierung: 'Parkierung', Veloabstellplatz: 'Veloparkierung', Parklet: 'Parklet',
  Sicherheitsstreifen: 'Sicherheitsstr.', Velostreifen: 'Velostreifen', Pfosten: 'Pfosten', Radweg: 'Radweg', Trennstreifen: 'Trennstr.',
  Fahrspur: 'Fahrspur', Gemeinsam: 'Fahrbahn', Kernfahrbahn: 'Kernfahrbahn', Velostrasse: 'Velostrasse', Tram: 'Tram',
}
// Kurzwort, wenn der Name nicht unter das Teil passt
const KUERZEST: Record<TeilArt, string> = {
  Trottoir: 'Tr.', Haltestelle: 'H', Gruen: 'G', Parkierung: 'P', Veloabstellplatz: 'VP', Parklet: 'Pl.', Sicherheitsstreifen: 'S', Velostreifen: 'Velo',
  Pfosten: 'Pf.', Radweg: 'Rw.', Trennstreifen: 'T', Fahrspur: 'MIV', Gemeinsam: 'MIV', Kernfahrbahn: 'Kern', Velostrasse: 'VS', Tram: 'Tram',
}
// Parkierung auf Trottoirniveau (seit 17.10.2026) liegt wie das Trottoir erhöht, ausserhalb der Fahrbahn
const erhoeht = (t: Teil) => (t.art === 'Trottoir' || t.art === 'Haltestelle' || t.art === 'Gruen' || t.trottoirniveau ? BORD_CM
  : t.art === 'Trennstreifen' ? 10 : 0)

// Figuren je Teil (Datei ohne Endung, Grösse der Bilddatei in cm, Versatz dx zur Mitte des Teils)
// und ab welcher Teilbreite sie passen. links: Teil liegt links der Fahrbahnmitte (Dateien
// «-left»). Fahrzeuge nach der Richtung des Teils (richtungVon): A von hinten («outbound»), B von
// vorne («inbound»), beide = je eines in der linken (von vorne) und rechten Hälfte (von hinten),
// sofern zwei Platz haben (Fahrzeugbreite laut Bild: Auto 1,80, Lastwagen/Bus 2,50, Velo 0,60).
interface Figur { datei: string; w: number; h: number; dx: number }
function figuren(t: Teil, b: number, links: boolean, einbahn: boolean, i: number): Figur[] {
  const lr = links ? 'left' : 'right'
  const dir = richtungVon(t, links, einbahn)
  const r = dir === 'B' ? 'inbound' : 'outbound'
  const eine = (datei: string, w: number, h: number, ab: number): Figur[] => (b >= ab ? [{ datei, w, h, dx: 0 }] : [])
  // Fahrzeug je nach Richtung; name(r) = Datei für «inbound»/«outbound»
  const fahrzeug = (name: (r: string) => string, w: number, h: number, ab: number, koerper: number): Figur[] => {
    if (dir === 'beide' && b >= 2 * koerper + 30)
      return [{ datei: name('inbound'), w, h, dx: -b / 4 }, { datei: name('outbound'), w, h, dx: b / 4 }]
    return eine(name(dir === 'B' ? 'inbound' : 'outbound'), w, h, ab)
  }
  switch (t.art) {
    case 'Trottoir': {
      if (bildVon(t) === 'sitzbank') return eine(`bench-${lr}`, 90, 90, 100)
      // Zwei Personen, weiblich und männlich gelesen, ab 1,50 m nebeneinander; weiblich gelesen nur mit
      // Hose oder langem Rock bzw. Kleid (Nutzerwunsch 16.10.2026, keine kurzen Röcke).
      const f = WEIBLICH[i % WEIBLICH.length], m = MAENNLICH[i % MAENNLICH.length]
      if (b >= 150) return [{ datei: f, w: 140, h: 220, dx: -b / 5 }, { datei: m, w: 140, h: 220, dx: b / 5 }]
      return eine(i % 2 ? m : f, 140, 220, 80)
    }
    case 'Haltestelle': {
      // Wartehäuschen zum Trottoir hin, davor (zum Bordstein hin) eine wartende Person
      if (b < 200) return eine(MAENNLICH[i % MAENNLICH.length], 140, 220, 80)
      const aussen = links ? -1 : 1, dh = b >= 300 ? aussen * (b / 2 - 145) : 0
      const fig: Figur[] = [{ datei: `transit-shelter-01-${lr}`, w: 270, h: 360, dx: dh }]
      if (b >= 300) fig.push({ datei: WEIBLICH[i % WEIBLICH.length], w: 140, h: 220, dx: -aussen * (b / 2 - 60) })
      return fig
    }
    case 'Gruen': {
      const bild = bildVon(t)
      return bild === 'strauch' ? eine('bush', 100, 80, 60) : bild === 'blumen' ? eine('flowers-red', 100, 80, 60) : eine('tree', 270, 630, 80)
    }
    case 'Velostreifen': case 'Radweg': case 'Velostrasse': return fahrzeug(x => `biker-01-${x}`, 80, 180, 90, 60)
    case 'Pfosten': return eine('bollard', 20, 160, 10)
    case 'Parkierung': return eine(`car-${!einbahn && links ? 'inbound' : 'outbound'}`, 360, 180, 170)
    case 'Veloabstellplatz': return eine(`bike-rack-perpendicular-${lr}`, 180, 120, 150)
    case 'Parklet': return eine(`yerba-buena-parklet-${lr}`, 240, 240, 150)
    case 'Fahrspur': case 'Gemeinsam': case 'Kernfahrbahn': {
      const bild = bildVon(t)
      if (bild === 'lastwagen') return fahrzeug(x => `truck-${x}`, 300, 360, 250, 250)
      if (bild === 'bus') return fahrzeug(x => `bus-${x}`, 360, 320, 250, 260)
      return fahrzeug(x => `car-${x}`, 360, 180, 170, 180)
    }
    case 'Tram': return eine(`streetcar-${r}`, 320, 420, 240)
    default: return []
  }
}
const MARK_DATEI = { geradeaus: 'straight', links: 'left', rechts: 'right' } as const
const WEIBLICH = ['people-07', 'people-09', 'people-13', 'people-03', 'people-27']
const MAENNLICH = ['people-02', 'people-04', 'people-06', 'people-11', 'people-15', 'people-31']

function useBreitePx<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(e => setW(e[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

// Gesamtbreite einer Aufteilung in cm (leere Breiten zählen nicht).
export const breiteCm = (teile: Teil[]) => teile.reduce((s, t) => s + (Number.isFinite(t.breite) ? t.breite * 100 : 0), 0)

interface SkizzeProps {
  titel: string
  teile: Teil[]
  einbahn: boolean
  massstabCm: number          // gemeinsame Breite aller Skizzen [cm]
}

export function QuerschnittSkizze(p: SkizzeProps) {
  const [ref, px] = useBreitePx<HTMLDivElement>()
  return (
    <div ref={ref} style={{ marginTop: 6 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-strong)' }}>{p.titel}</div>
      {px > 0 && <SkizzeSvg {...p} px={px} basis={import.meta.env.BASE_URL} />}
    </div>
  )
}

// Die Zeichnung selbst, für eine bekannte Breite in Pixeln (px) und den Pfad der Figuren (basis).
export function SkizzeSvg({ titel, teile, einbahn, massstabCm, px, basis }: SkizzeProps & { px: number; basis: string }) {
  const W = Math.max(massstabCm, breiteCm(teile), 100) + 2 * RAND_CM
  const s = px > 0 ? px / W : 0.1                // px je cm
  const f = SCHRIFT_PX / s                       // Schrifthöhe in cm
  const gesamt = breiteCm(teile)
  const x0 = RAND_CM + (W - 2 * RAND_CM - gesamt) / 2
  // Lage der Teile
  let x = x0
  const lage = teile.map((t, i) => {
    const b = Number.isFinite(t.breite) ? t.breite * 100 : 0
    const l = { t, i, x, b }
    x += b
    return l
  })
  const fb = lage.filter(l => istFahrbahnTeil(l.t) && l.b > 0)
  const fbVon = fb.length ? fb[0].x : NaN, fbBis = fb.length ? fb[fb.length - 1].x + fb[fb.length - 1].b : NaN
  const mitte = (fbVon + fbBis) / 2
  // Höhe über dem Boden nach der höchsten gezeigten Figur (Baum 630 cm, Tram 420 cm, Personen 220 cm)
  const figs = lage.flatMap(l => {
    const links = l.x + l.b / 2 < mitte
    return figuren(l.t, l.b, links, einbahn, l.i).map(fg => ({ l, fg }))
  })
  const yBoden = Math.max(230, ...figs.map(({ l, fg }) => fg.h + erhoeht(l.t))) + LUFT_CM
  // Markierungen in Draufsicht: eigener Streifen unter dem Boden, nur wenn es welche gibt
  const marks = lage.filter(l => l.b > 0 && (l.t.markierung ?? 'keine') in MARK_DATEI)
  const yMark = yBoden + BODEN_CM, hMark = marks.length ? MARK_CM : 0
  const yMass = yBoden + BODEN_CM + hMark + 0.8 * f
  // Beschriftung: Zahl und Name, wenn sie passen; sonst nur die Zahl, versetzt in eine zweite Zeile.
  const zeichen = 0.58 * f
  const H = yMass + 6.2 * f
  let versatz = false

  return (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H * s} role="img"
             aria-label={`${titel}: ${teile.map(t => `${KURZ[t.art]} ${Number.isFinite(t.breite) ? numDE(t.breite, 2) : '?'} m`).join(', ')}`}>
          <defs>
            <pattern id="vrc-schraffur" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="20" height="20" fill="#6b7280" />
              <rect width="7" height="20" fill="#e5e7eb" />
            </pattern>
          </defs>
          {/* Boden */}
          {lage.map(({ t, i, x, b }) => {
            if (b <= 0) return null
            const hoch = erhoeht(t)
            return (
              <rect key={`b${i}`} x={x} y={yBoden - hoch} width={b} height={BODEN_CM + hoch}
                    fill={t.art === 'Sicherheitsstreifen' ? 'url(#vrc-schraffur)' : BODEN[t.art]}>
                <title>{`${KURZ[t.art]} ${numDE(t.breite, 2)} m`}</title>
              </rect>
            )
          })}
          {/* Markierungen: Mittellinie zwischen zwei Fahrspuren, gelbe Linie am Velostreifen */}
          {lage.slice(1).map(({ t, i, x }) => {
            const vt = lage[i - 1].t, vor = vt.art
            const weiss = (vor === 'Fahrspur' || vor === 'Tram') && (t.art === 'Fahrspur' || t.art === 'Tram')
            const gelb = (vor === 'Velostreifen') !== (t.art === 'Velostreifen') && istFahrbahnTeil(vt) && istFahrbahnTeil(t)
            if (!weiss && !gelb) return null
            return <rect key={`m${i}`} x={x - 7.5} y={yBoden - 2} width={15} height={4} fill={gelb ? '#facc15' : '#ffffff'} />
          })}
          {/* Tramgleise (Meterspur, Schienen ±0,50 m um die Mitte des Teils) */}
          {lage.filter(l => l.t.art === 'Tram' && l.b > 0).map(({ i, x, b }) =>
            [-50, 50].map(d => <rect key={`g${i}${d}`} x={x + b / 2 + d - 4} y={yBoden - 3} width={8} height={6} fill="#d1d5db" />))}
          {/* Figuren */}
          {figs.map(({ l: { t, i, x, b }, fg }, k) => (
            <image key={`f${i}-${k}`} href={`${basis}streetmix/${fg.datei}.svg`} x={x + b / 2 + fg.dx - fg.w / 2}
                   y={yBoden - erhoeht(t) - fg.h} width={fg.w} height={fg.h} />
          ))}
          {/* Markierungen in Draufsicht (Pfeile) nach der Richtung des Teils: Seite B entgegen, Seite A weg */}
          {hMark > 0 && lage.filter(l => l.b > 0).map(({ t, i, x, b }) => (
            <rect key={`d${i}`} x={x} y={yMark} width={b} height={hMark} fill={BODEN[t.art]} opacity={0.75} />
          ))}
          {marks.flatMap(({ t, i, x, b }) => {
            // Gegenverkehr im Teil: je ein Pfeil, links (Seite B) entgegen, rechts (Seite A) weg
            const dir = richtungVon(t, x + b / 2 < mitte, einbahn), name = MARK_DATEI[t.markierung as keyof typeof MARK_DATEI]
            const pfeile = dir === 'beide'
              ? [{ datei: `${name}-inbound`, mx: x + b / 4, w: b / 2 }, { datei: `${name}-outbound`, mx: x + 3 * b / 4, w: b / 2 }]
              : [{ datei: `${name}-${dir === 'B' ? 'inbound' : 'outbound'}`, mx: x + b / 2, w: b }]
            return pfeile.map(({ datei, mx, w }, k) => {
              const g = Math.min(MARK_CM, w)
              return <image key={`k${i}-${k}`} href={`${basis}streetmix/${datei}.svg`} x={mx - g / 2} y={yMark + (MARK_CM - g) / 2} width={g} height={g} />
            })
          })}
          {/* Masse je Teil */}
          {lage.map(({ t, i, x, b }) => {
            if (b <= 0) return null
            const zahl = numDE(t.breite, 2), passt = (x: string) => x.length * zeichen < b - 4
            const name = passt(KURZ[t.art]) ? KURZ[t.art] : KUERZEST[t.art]
            const passtZahl = passt(zahl), passtName = passt(name)
            const zeile = passtZahl ? 0 : (versatz = !versatz) ? 1.25 : 2.5
            const y = yMass + f + zeile * f
            return (
              <g key={`t${i}`} fontSize={f} textAnchor="middle" fill="var(--text)">
                <line x1={x} x2={x} y1={yBoden + BODEN_CM + hMark} y2={yMass + 0.3 * f} stroke="#9ca3af" strokeWidth={1 / s} />
                <text x={x + b / 2} y={y} fontWeight={600}>{zahl}</text>
                {passtZahl && passtName && <text x={x + b / 2} y={y + 1.15 * f} fill="var(--text-muted)">{name}</text>}
              </g>
            )
          })}
          {lage.length > 0 && (
            <line x1={x0 + gesamt} x2={x0 + gesamt} y1={yBoden + BODEN_CM + hMark} y2={yMass + 0.3 * f} stroke="#9ca3af" strokeWidth={1 / s} />
          )}
          {/* Fahrbahn Bordstein–Bordstein */}
          {fb.length > 0 && (
            <g fontSize={f} textAnchor="middle" fill="var(--text-strong)">
              <line x1={fbVon} x2={fbBis} y1={yMass + 5.2 * f} y2={yMass + 5.2 * f} stroke="var(--text-muted)" strokeWidth={1.2 / s} />
              <line x1={fbVon} x2={fbVon} y1={yMass + 4.7 * f} y2={yMass + 5.7 * f} stroke="var(--text-muted)" strokeWidth={1.2 / s} />
              <line x1={fbBis} x2={fbBis} y1={yMass + 4.7 * f} y2={yMass + 5.7 * f} stroke="var(--text-muted)" strokeWidth={1.2 / s} />
              <text x={(fbVon + fbBis) / 2} y={yMass + 4.9 * f} fontWeight={700}>
                {`Fahrbahn ${numDE((fbBis - fbVon) / 100, 2)} m`}
              </text>
            </g>
          )}
        </svg>
  )
}
