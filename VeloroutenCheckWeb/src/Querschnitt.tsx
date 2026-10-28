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
import { bildVon, istFahrbahnTeil, istWeg, richtungVon, teilName, type Teil, type TeilArt } from './aufteilung'
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
  Fahrspur: '#4b5563', Gemeinsam: '#4b5563', Kernfahrbahn: '#4b5563', Velostrasse: '#4b5563', Tram: '#4b5563', Mittelinsel: '#d6d3d1',
  FussRadweg: '#c4b08a', Zweirichtungsradweg: '#b45309', RadwegAbgesetzt: '#b45309', FusswegVelo: '#d6d3d1', HaltAbstand: '#e7e5e4', HaltEinstieg: '#e7e5e4', Umweltspur: '#4b5563',
}
const KURZ: Record<TeilArt, string> = {
  Trottoir: 'Trottoir', Haltestelle: 'Haltestelle', Gruen: 'Grün', Parkierung: 'Parkierung', Veloabstellplatz: 'Veloparkierung', Parklet: 'Parklet',
  Sicherheitsstreifen: 'Sicherheitsstr.', Velostreifen: 'Velostreifen', Pfosten: 'Pfosten', Radweg: 'Radweg', Trennstreifen: 'Trennstr.',
  Fahrspur: 'Fahrspur', Gemeinsam: 'Fahrbahn', Kernfahrbahn: 'Kernfahrbahn', Velostrasse: 'Velostrasse', Tram: 'Tram', Mittelinsel: 'Insel',
  FussRadweg: 'Fuss-/Radweg', Zweirichtungsradweg: 'Zweirichtungsradweg', RadwegAbgesetzt: 'Radweg', FusswegVelo: 'Fussweg', HaltAbstand: 'Abstand', HaltEinstieg: 'Ein-/Ausstieg', Umweltspur: 'Umweltspur',
}
// Kurzwort, wenn der Name nicht unter das Teil passt
const KUERZEST: Record<TeilArt, string> = {
  Trottoir: 'Tr.', Haltestelle: 'H', Gruen: 'G', Parkierung: 'P', Veloabstellplatz: 'VP', Parklet: 'Pl.', Sicherheitsstreifen: 'S', Velostreifen: 'Velo',
  Pfosten: 'Pf.', Radweg: 'Rw.', Trennstreifen: 'T', Fahrspur: 'MIV', Gemeinsam: 'MIV', Kernfahrbahn: 'Kern', Velostrasse: 'VS', Tram: 'Tram', Mittelinsel: 'I',
  FussRadweg: 'F/R', Zweirichtungsradweg: 'ZRw', RadwegAbgesetzt: 'Rw.', FusswegVelo: 'Fw.', HaltAbstand: 'A', HaltEinstieg: 'E', Umweltspur: 'Bus+Velo',
}
// Parkierung auf Trottoirniveau (seit 17.10.2026) liegt wie das Trottoir erhöht, ausserhalb der Fahrbahn;
// die Mittelinsel (seit 20.10.2026) ist erhöht, gehört aber zur Fahrbahn (Bordstein–Bordstein)
// Radweg mit Trennstreifen (seit 24.10.2026, Nutzerbefund: der Trennstreifen allein ragte wie eine Schwelle heraus): beide auf
// RADWEG_CM, also ein kleiner Absatz von der Fahrbahn hinauf und vom Trottoir hinunter; der Trennstreifen nur in anderer Farbe
const RADWEG_CM = 5
const erhoeht = (t: Teil) => (t.art === 'Trottoir' || t.art === 'Haltestelle' || t.art === 'HaltAbstand' || t.art === 'HaltEinstieg' || t.art === 'Gruen' || t.art === 'Mittelinsel' || t.trottoirniveau || istWeg(t) ? BORD_CM
  : t.art === 'Trennstreifen' || t.art === 'Radweg' ? RADWEG_CM : 0)

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
    // Ein- und Ausstieg: eine wartende Person, kein Wartehäuschen
    case 'HaltEinstieg': return eine(WEIBLICH[i % WEIBLICH.length], 140, 220, 80)
    case 'Haltestelle': {
      // Wartehäuschen zum Trottoir hin, davor (zum Bordstein hin) eine wartende Person
      // ohne Wartehalle (seit 20.10.2026): nur eine wartende Person
      if (b < 200 || bildVon(t) === 'ohneWartehalle') return eine(MAENNLICH[i % MAENNLICH.length], 140, 220, 80)
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
    case 'Parkierung': {
      // Schräg (seit 20.10.2026, Streetmix «car-angled»): vorwärts eingeparkt, die Nase zum Rand; Seite A und die
      // Einbahn fahren weg (Heck sichtbar), Seite B kommt entgegen (Front sichtbar). Senkrecht und offen: von der Seite.
      const nase = links ? 'left' : 'right'
      if (t.parkart === 'schraeg') return eine(`car-angled-${!einbahn && links ? 'front' : 'rear'}-${nase}`, 420, 180, 400)
      if (t.parkart) return eine(`car-sideways-${nase}`, 420, 180, 400)
      return eine(`car-${!einbahn && links ? 'inbound' : 'outbound'}`, 360, 180, 170)
    }
    case 'Veloabstellplatz': return eine(`bike-rack-perpendicular-${lr}`, 180, 120, 150)
    case 'Parklet': return eine(`yerba-buena-parklet-${lr}`, 240, 240, 150)
    case 'Fahrspur': case 'Gemeinsam': case 'Kernfahrbahn': {
      const bild = bildVon(t)
      if (bild === 'lastwagen') return fahrzeug(x => `truck-${x}`, 300, 360, 250, 250)
      if (bild === 'bus') return fahrzeug(x => `bus-${x}`, 360, 320, 250, 260)
      return fahrzeug(x => `car-${x}`, 360, 180, 170, 180)
    }
    case 'Tram': return eine(`streetcar-${r}`, 320, 420, 240)
    // Umweltspur: Bus, daneben ein Velo, wenn beide Platz haben (Bus 2,50 + Velo 0,60)
    case 'Umweltspur': return b >= 340
      ? [{ datei: `bus-${r}`, w: 360, h: 320, dx: -b / 2 + 150 }, { datei: `biker-01-${r}`, w: 80, h: 180, dx: b / 2 - 60 }]
      : eine(`bus-${r}`, 360, 320, 250)
    // Wege: Velo in beide Richtungen, auf gemeinsamen Wegen dazu eine Person
    case 'Zweirichtungsradweg': return b >= 200 ? [{ datei: 'biker-01-inbound', w: 80, h: 180, dx: -b / 4 }, { datei: 'biker-01-outbound', w: 80, h: 180, dx: b / 4 }]
      : eine('biker-01-outbound', 80, 180, 90)
    case 'RadwegAbgesetzt': return fahrzeug(x => `biker-01-${x}`, 80, 180, 90, 60)
    case 'FussRadweg': case 'FusswegVelo': return b >= 220
      ? [{ datei: 'biker-01-outbound', w: 80, h: 180, dx: -b / 5 }, { datei: WEIBLICH[i % WEIBLICH.length], w: 140, h: 220, dx: b / 5 }]
      : eine('biker-01-outbound', 80, 180, 90)
    default: return []
  }
}
// Pfeile (Streetmix «…-outbound»): auch kombiniert (seit 20.10.2026). Entgegen (Seite B) wird derselbe Pfeil um 180°
// gedreht: Die Streetmix-Dateien «…-inbound» sind gespiegelt, ihr Linkspfeil zeigt für Entgegenkommende nach rechts.
const MARK_DATEI = { geradeaus: 'straight', links: 'left', rechts: 'right', 'links-geradeaus': 'left-straight',
  'geradeaus-rechts': 'right-straight', 'links-rechts': 'both', alle: 'left-right-straight' } as const
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
export const breiteCm = (teile: Teil[]) => teile.reduce((s, t) => s + (Number.isFinite(t.breite) && !t.versetzt ? t.breite * 100 : 0), 0)

interface SkizzeProps {
  titel: string
  teile: Teil[]
  einbahn: boolean
  massstabCm: number          // gemeinsame Breite aller Skizzen [cm]
  // Blickrichtung in der Skizze (Nutzerwunsch 21.10.2026): Himmelsrichtungen der Seiten A und B; die Skizze zeigt oben
  // links «Seite B · kommt entgegen», oben rechts «Seite A · Blickrichtung»
  richtungen?: { a?: string | null; b?: string | null }
  // Kennwerte (seit 24.10.2026, Nutzerwunsch: «damit die Skizzen alleine funktionieren»): Titel, Tempo, DTV und Routentyp
  // in der ersten Zeile der Zeichnung, lang und kurz (schmale Bildschirme)
  kennwerte?: { lang: string; kurz: string }
}

// Zeile der Kennwerte: Tempo, Verkehrsmenge (DTV) und Routentyp; fehlende Werte als «–», ein angenommener DTV gekennzeichnet
export function kennwerteText(k: { tempo?: number; dtv?: number; dtvAngenommen?: boolean; route?: string }): { lang: string; kurz: string } {
  const tausend = (x: number) => Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2019')
  const tempo = Number.isFinite(k.tempo) ? `${k.tempo} km/h` : '–'
  const dtv = k.dtvAngenommen ? '≤ 2\u2019000' : Number.isFinite(k.dtv) ? tausend(k.dtv!) : '–'
  const route = k.route || 'Routentyp –'
  return {
    lang: `Tempo ${tempo} · DTV ${dtv} Fz/Tag${k.dtvAngenommen ? ' (angenommen)' : ''} · ${route}`,
    kurz: `${Number.isFinite(k.tempo) ? `T${k.tempo}` : 'T –'} · DTV ${dtv} · ${route}`,
  }
}

export function QuerschnittSkizze(p: SkizzeProps) {
  const [ref, px] = useBreitePx<HTMLDivElement>()
  // Mobile (index.css .vrc-skizze-innen, seit 28.10.2026): mindestens 70 px je Element, bei vielen Elementen seitlich scrollbar
  return (
    <div className="vrc-skizze" style={{ marginTop: 6 }}>
      <div ref={ref} className="vrc-skizze-innen" style={{ '--vrc-skizze-min': `${p.teile.length * 70}px` } as React.CSSProperties}>
        {/* Titel nur noch ausserhalb, wenn die Zeichnung keine Kennwerte trägt (sonst steht er in ihrer ersten Zeile) */}
        {!p.kennwerte && <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-strong)' }}>{p.titel}</div>}
        {px > 0 && <SkizzeSvg {...p} px={px} basis={import.meta.env.BASE_URL} />}
      </div>
    </div>
  )
}

// Die Zeichnung selbst, für eine bekannte Breite in Pixeln (px) und den Pfad der Figuren (basis).
export function SkizzeSvg({ titel, teile: alle, einbahn, massstabCm, px, basis, richtungen, kennwerte }: SkizzeProps & { px: number; basis: string }) {
  // Versetzte Parkierung (abwechselnd Seite A und B) liegt an anderer Stelle: nicht im Querschnitt, nur als Hinweis darunter
  const teile = alle.filter(t => !t.versetzt)
  const versetzt = alle.flatMap((t, k) => {
    if (!t.versetzt || t.art !== 'Parkierung') return []
    const vor = breiteCm(alle.slice(0, k)) + (Number.isFinite(t.breite) ? t.breite * 50 : 0)
    return [`${teilName(t).replace(', versetzt', '')} Seite ${vor < breiteCm(alle) / 2 ? 'B' : 'A'}`]
  })
  const W = Math.max(massstabCm, breiteCm(teile), 100) + 2 * RAND_CM
  const s = px > 0 ? px / W : 0.1                // px je cm
  const f = SCHRIFT_PX / s                       // Schrifthöhe in cm
  const gesamt = breiteCm(teile)
  const x0 = RAND_CM + (W - 2 * RAND_CM - gesamt) / 2
  // Lage der Teile
  let x = x0
  // i: Nummer in der Liste der Planung (über alle Teile, auch versetzte), damit die Kreise in der Skizze zur Liste passen
  const lage = alle.map((t, i) => ({ t, i })).filter(l => !l.t.versetzt).map(({ t, i }) => {
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
  // Kopfzeile mit der Blickrichtung über den Figuren; darüber, mit Kennwerten, eine Zeile mit Titel, Tempo, DTV, Routentyp
  const ZEILE_K = kennwerte ? 1.5 * f : 0
  const KOPF = 1.6 * f + ZEILE_K
  const yBoden = Math.max(230, ...figs.map(({ l, fg }) => fg.h + erhoeht(l.t))) + LUFT_CM + KOPF
  // Markierungen in Draufsicht: eigener Streifen unter dem Boden, nur wenn es welche gibt
  const marks = lage.filter(l => l.b > 0 && (l.t.markierung ?? 'keine') in MARK_DATEI)
  const yMark = yBoden + BODEN_CM, hMark = marks.length ? MARK_CM : 0
  const yMass = yBoden + BODEN_CM + hMark + 0.8 * f
  // Beschriftung: Zahl und Name, wenn sie passen; sonst nur die Zahl, versetzt in eine zweite Zeile.
  const zeichen = 0.58 * f
  const H = yMass + 8.4 * f + (versetzt.length ? 1.6 * f : 0)
  let versatz = false

  return (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H * s} role="img"
             aria-label={`${titel}${kennwerte ? ` (${kennwerte.lang})` : ''}: ${teile.map(t => `${KURZ[t.art]} ${Number.isFinite(t.breite) ? numDE(t.breite, 2) : '?'} m`).join(', ')}`}>
          <defs>
            <pattern id="vrc-schraffur" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="20" height="20" fill="#6b7280" />
              <rect width="7" height="20" fill="#e5e7eb" />
            </pattern>
          </defs>
          {/* Blickrichtung: links Seite B (kommt entgegen), rechts Seite A (Blickrichtung). Auf schmalen Bildschirmen
              (grosse Schrift je cm) überlagerten sich die Texte (Befund 22.10.2026): drei Stufen, bis sie passen. */}
          {(() => {
            const ra = richtungen?.a ?? '', rb = richtungen?.b ?? ''
            const links = einbahn ? ['links: Rand der Seite B', 'links: Seite B', 'B']
              : [`← Seite B${rb ? ` · Richtung ${rb}` : ''} · kommt entgegen`, `← Seite B${rb ? ` (${rb})` : ''}`, '← B']
            const rechts = [`Seite A${ra ? ` · Richtung ${ra}` : ''} · Blickrichtung →`, `Seite A${ra ? ` (${ra})` : ''} →`, 'A →']
            const passt = (l: string, r: string) => (l.length + r.length) * 0.55 * 0.95 * f + 2 * f <= gesamt
            let k = 0
            while (k < 2 && !passt(links[k], rechts[k])) k++
            return (
              <g fontSize={0.95 * f} fill="var(--text-muted)">
                <title>{`links Seite B${rb ? ` (Richtung ${rb})` : ''}, kommt entgegen; rechts Seite A${ra ? ` (Richtung ${ra})` : ''}, Blickrichtung`}</title>
                <text x={x0} y={1.05 * f + ZEILE_K}>{links[k]}</text>
                <text x={x0 + gesamt} y={1.05 * f + ZEILE_K} textAnchor="end" fontWeight={600}>{rechts[k]}</text>
              </g>
            )
          })()}
          {/* Titel und Kennwerte (Tempo, DTV, Routentyp): die Zeichnung trägt sie selbst, auch kopiert oder im Bericht */}
          {kennwerte && (() => {
            const breit = W - 2 * RAND_CM
            const passt = (t: string) => (titel.length + 3 + t.length) * 0.55 * f <= breit
            const text = passt(kennwerte.lang) ? kennwerte.lang : kennwerte.kurz
            return (
              <text x={RAND_CM} y={1.1 * f} fontSize={f} fill="var(--text-strong)">
                <tspan fontWeight={700}>{titel}</tspan><tspan fill="var(--text-muted-strong)">{` · ${text}`}</tspan>
              </text>
            )
          })()}
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
            const park = (a: Teil, b: Teil) => a.art === 'Parkierung' && !a.trottoirniveau && istFahrbahnTeil(b) && b.art !== 'Parkierung'
            const spur = (x: Teil) => x.art === 'Fahrspur' || x.art === 'Tram' || x.art === 'Umweltspur'
            const weiss = (spur(vt) && spur(t)) || park(vt, t) || park(t, vt)
            const gelb = (vor === 'Velostreifen') !== (t.art === 'Velostreifen') && istFahrbahnTeil(vt) && istFahrbahnTeil(t)
            if (!weiss && !gelb) return null
            // deutlich sichtbar (Nutzerwunsch 20.10.2026): 20 cm breit, etwas über dem Boden
            return <rect key={`m${i}`} x={x - 10} y={yBoden - 5} width={20} height={10} fill={gelb ? '#facc15' : '#ffffff'} />
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
              ? [{ entgegen: true, mx: x + b / 4, w: b / 2 }, { entgegen: false, mx: x + 3 * b / 4, w: b / 2 }]
              : [{ entgegen: dir === 'B', mx: x + b / 2, w: b }]
            return pfeile.map(({ entgegen, mx, w }, k) => {
              const g = Math.min(MARK_CM, w), my = yMark + MARK_CM / 2
              return <image key={`k${i}-${k}`} href={`${basis}streetmix/${name}-outbound.svg`} x={mx - g / 2} y={my - g / 2} width={g} height={g}
                            {...(entgegen ? { transform: `rotate(180 ${mx} ${my})` } : {})} />
            })
          })}
          {/* Nummer des Teils wie in der Liste (Nutzerwunsch 21.10.2026): Kreis auf dem Bodenstreifen, bei schmalen Teilen darüber */}
          {lage.map(({ t, i, x, b }) => {
            if (b <= 0) return null
            const r = 0.8 * f, cx = x + b / 2
            const cy = b >= 2.4 * r ? yBoden - erhoeht(t) + BODEN_CM / 2 + erhoeht(t) / 2 : yBoden - erhoeht(t) - r - 4
            return (
              <g key={`n${i}`}>
                <circle cx={cx} cy={cy} r={r} fill="#ffffff" stroke="#111827" strokeWidth={1.2 / s} />
                <text x={cx} y={cy + 0.36 * f} fontSize={0.95 * f} fontWeight={700} textAnchor="middle" fill="#111827">{i + 1}</text>
              </g>
            )
          })}
          {/* Masse je Teil */}
          {lage.map(({ t, i, x, b }) => {
            if (b <= 0) return null
            const zahl = numDE(t.breite, 2), passt = (x: string) => x.length * zeichen < b - 4
            // Parkierung mit der Anordnung (seit 20.10.2026)
            const lang = t.art !== 'Parkierung' || !t.parkart ? KURZ[t.art] : t.parkart === 'quer' ? 'Senkrechtparkierung'
              : t.parkart === 'tief' ? 'Schräg/senkrecht' : `Schrägparkierung${t.winkel ? ` ${t.winkel}°` : ''}`
            const name = passt(lang) ? lang : passt(KURZ[t.art]) ? KURZ[t.art] : KUERZEST[t.art]
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
          {/* Ganzer Querschnitt (Nutzerwunsch 20.10.2026), heute wie Planung */}
          {lage.length > 0 && gesamt > 0 && (
            <g fontSize={f} textAnchor="middle" fill="var(--text-strong)">
              <line x1={x0} x2={x0 + gesamt} y1={yMass + 7.4 * f} y2={yMass + 7.4 * f} stroke="var(--text-muted)" strokeWidth={1.2 / s} />
              <line x1={x0} x2={x0} y1={yMass + 6.9 * f} y2={yMass + 7.9 * f} stroke="var(--text-muted)" strokeWidth={1.2 / s} />
              <line x1={x0 + gesamt} x2={x0 + gesamt} y1={yMass + 6.9 * f} y2={yMass + 7.9 * f} stroke="var(--text-muted)" strokeWidth={1.2 / s} />
              <text x={x0 + gesamt / 2} y={yMass + 7.1 * f} fontWeight={700}>{`Ganzer Querschnitt ${numDE(gesamt / 100, 2)} m`}</text>
            </g>
          )}
          {versetzt.length > 0 && (
            <text x={x0} y={yMass + 9.3 * f} fontSize={f} fill="var(--text-muted)">
              {`Versetzt, an anderer Stelle als gegenüber (nicht gezeichnet): ${versetzt.join(', ')}`}
            </text>
          )}
        </svg>
  )
}
