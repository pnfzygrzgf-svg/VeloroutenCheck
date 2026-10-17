// ── Bericht «Aufteilung planen» (Etappe 3): Druckansicht, als PDF über den Druckdialog ──
//
// Muster aus fgsCheck (Bericht.tsx): eigene Ansicht über der App, als Portal im body, A4 hoch per
// @media print (index.css). Das Kartenbild ist KEIN Leaflet-Ausschnitt (Kacheln laden beim Drucken
// oft nicht fertig, Leaflet verschiebt Ebenen mit CSS-Transforms), sondern ein einziges Luftbild per
// WMS (wms.geo.admin.ch, EPSG:2056) mit einer SVG-Zeichnung darüber: Achse des Abschnitts (rote Linie, ohne Pfeil), AV-Flächen
// und Parkfelder, sofern geladen. Bild und Geometrie sind beide in LV95, die Zuordnung ist eine reine
// Verschiebung und Skalierung. «Drucken» wird frei, wenn das Bild geladen ist, nicht geladen werden
// konnte oder nach BILD_ZEITGRENZE_MS nicht da ist (dann ohne Hintergrund, mit Hinweis).

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { P } from './lv95'
import type { AvFlaeche } from './av'
import type { ParkFlaeche } from './parkierung'
import type { AbschnittErgebnis, SeitenErgebnis } from './bewertung'
import { erfuellungsgrad } from './fuehrungsform'
import { dtvAssumed, type Quelle, type Section, type Seite } from './strecke'
import type { Routentyp, Stadt } from './fuehrungsform'
import { numDE } from './csv'
import {
  bilanz, bilanzText, bewerteAufteilung, mitSeitenraum, bildVon, pruefeKernfahrbahn, pruefeTeil, pruefungText, startAufteilung, umfeldVon,
  BILD_LABEL, FUSSNETZ, FUSS_QUELLE, STANDARD_QUELLE, MARKIERUNG_LABEL, RICHTWERT_QUELLE, LICHTRAUM_QUELLE, teilName, type Aufteilung,
} from './aufteilung'
import { SkizzeSvg, breiteCm } from './Querschnitt'
import { AV_FARBEN, PARK_FARBE, PARKVERBOT_FARBE } from './farben'
import { ausschnitt, wmsBildUrl } from './kartenbild'

const APP_URL = 'https://veloroutencheck.ch/'

// Quelle von Routentyp, DTV und Tempo im Bericht: «amtlich» je Stadt mit dem Dienst (wie im README, Datenherkunft)
const DTV_AMTLICH: Record<Stadt, string> = {
  bern: 'Flächendeckende Verkehrsdaten, Geodaten Stadt Bern',
  zurich: 'Verkehrsmessstellen, Kanton Zürich',
  basel: 'Verkehrszähldaten, Kanton Basel-Stadt',
  luzern: 'Verkehrszähldaten, Stadt Luzern',
}
const TEMPO_AMTLICH: Partial<Record<Stadt, string>> = {
  bern: 'Signalisierte Höchstgeschwindigkeit, Geodaten Stadt Bern',
  basel: 'Strassen und Wege, Kanton Basel-Stadt',
}
const ROUTENTYP_AMTLICH: Record<Stadt, string> = {
  bern: 'Veloroutennetz Masterplan Veloinfrastruktur, Geodaten Stadt Bern',
  zurich: 'Velonetzplanung, Stadt Zürich',
  basel: 'Teilrichtplan Velo, Kanton Basel-Stadt',
  luzern: 'Velonetz, Stadt Luzern',
}
function quelleText(q: Quelle | undefined, amtlich: string | undefined): string {
  switch (q) {
    case 'amtlich': return amtlich ?? 'Geoportal der Stadt'
    case 'osm': return 'OpenStreetMap'
    case 'manuell': return 'von Hand eingegeben'
    default: return 'Quelle unbekannt'
  }
}
const BILD_PX_MAX = 1400, BILD_PX_MIN = 1000
const BILD_ZEITGRENZE_MS = 20000
const VB = 1000                        // Breite der SVG-Zeichnung in Einheiten
const DRUCK_PX = 700                   // Breite der Skizzen im Druck [px] (Schriftgrösse der Masse)

function BerichtKarte({ achsen, av, park, nr, onBereit }: {
  achsen: P[][]; av: AvFlaeche[]; park: ParkFlaeche[]; nr: number; onBereit: (s: 'laedt' | 'ok' | 'fehler') => void
}) {
  const box = useMemo(() => ausschnitt(achsen), [achsen])
  const [geladen, setGeladen] = useState<{ url: string; ok: boolean } | null>(null)
  const [e0, n0, e1, n1] = box ?? [0, 0, 1, 1]
  const wM = e1 - e0, hM = n1 - n0
  const bw = Math.min(BILD_PX_MAX, Math.max(BILD_PX_MIN, Math.round(wM / 0.1)))
  const bh = Math.round(hM / (wM / bw))
  const url = box ? wmsBildUrl(box, bw, bh) : ''
  const status: 'laedt' | 'ok' | 'fehler' = !box ? 'fehler' : geladen?.url !== url ? 'laedt' : geladen.ok ? 'ok' : 'fehler'
  useEffect(() => { onBereit(status) }, [status, onBereit])
  useEffect(() => {
    if (!url) return
    const t = setTimeout(() => setGeladen(g => (g?.url === url ? g : { url, ok: false })), BILD_ZEITGRENZE_MS)
    return () => clearTimeout(t)
  }, [url])
  if (!box) return null
  const s = VB / wM, vh = hM * s
  const xy = (p: P) => `${((p[0] - e0) * s).toFixed(1)},${((n1 - p[1]) * s).toFixed(1)}`
  const pfad = (ringe: P[][]) => ringe.filter(r => r.length).map(r => 'M' + r.map(xy).join('L') + 'Z').join(' ')
  const imBild = (ringe: P[][]) => ringe[0]?.some(p => p[0] >= e0 && p[0] <= e1 && p[1] >= n0 && p[1] <= n1)
  // Marker wie auf der Karte (VeloMap): Nummer des Abschnitts in der Mitte der längsten Linie, das Dreieck
  // am Rand zeigt die Fahrtrichtung der Seite A (achsen laufen in dieser Richtung), die Blickrichtung der Skizzen
  const laengste = achsen.reduce<P[]>((a, l) => (l.length >= 2 && strecke(l) > strecke(a) ? l : a), [])
  const marker = (() => {
    if (laengste.length < 2) return null
    const k = Math.min(Math.floor(laengste.length / 2), laengste.length - 2)
    const [p, q] = [laengste[k], laengste[k + 1]]
    const winkel = Math.atan2(q[0] - p[0], q[1] - p[1]) * 180 / Math.PI   // Peilung: 0 = Norden, im Uhrzeigersinn
    return { x: (p[0] - e0) * s, y: (n1 - p[1]) * s, winkel }
  })()
  const mass = [10, 20, 25, 50, 100, 200].reduce((b, x) => (Math.abs(x - wM / 5) < Math.abs(b - wM / 5) ? x : b), 20)

  return (
    <figure className="bericht-karte">
      <div className="bericht-bild" style={{ aspectRatio: `${bw} / ${bh}` }}>
        {status === 'fehler'
          ? <div className="bericht-ohne-bild klein">ohne Luftbild</div>
          : <img src={url} alt="Luftbild SWISSIMAGE des Abschnitts" onLoad={() => setGeladen({ url, ok: true })}
              onError={() => setGeladen({ url, ok: false })} />}
        <svg viewBox={`0 0 ${VB} ${vh.toFixed(1)}`} preserveAspectRatio="none" aria-label="Achse, AV-Flächen und Parkfelder">

          {av.filter(f => f.art in AV_FARBEN && imBild(f.ringe)).map((f, i) => (
            <path key={'a' + i} d={pfad(f.ringe)} fillRule="evenodd" fill={AV_FARBEN[f.art]} fillOpacity={0.25}
                  stroke={AV_FARBEN[f.art]} strokeWidth={0.8} />
          ))}
          {park.filter(f => imBild(f.ringe)).map((f, i) => (
            <path key={'p' + i} d={pfad(f.ringe)} fill={f.verbot ? PARKVERBOT_FARBE : PARK_FARBE} fillOpacity={0.4}
                  stroke={f.verbot ? PARKVERBOT_FARBE : PARK_FARBE} strokeWidth={1.2} />
          ))}
          {achsen.map((l, i) => (
            <g key={'l' + i}>
              <polyline points={l.map(xy).join(' ')} fill="none" stroke="#ffffff" strokeWidth={7} strokeLinecap="round" />
              <polyline points={l.map(xy).join(' ')} fill="none" stroke="#dc2626" strokeWidth={3.5} strokeLinecap="round" />
            </g>
          ))}

          {marker && (
            <g transform={`translate(${marker.x.toFixed(1)}, ${marker.y.toFixed(1)})`} aria-label={`Abschnitt ${nr}, Pfeil: Fahrtrichtung Seite A`}>
              <g transform={`rotate(${marker.winkel.toFixed(0)})`}>
                <path d="M0,-30 L10,-14 L-10,-14 Z" fill="#1e293b" stroke="#ffffff" strokeWidth={2.5} strokeLinejoin="round" paintOrder="stroke" />
              </g>
              <circle r={15} fill="#1e293b" stroke="#ffffff" strokeWidth={3} />
              <text y={6} fontSize={17} fontWeight={700} textAnchor="middle" fill="#ffffff">{nr}</text>
            </g>
          )}

          {/* Nordpfeil: Bild in LV95, Norden oben (Gitternord, in der Schweiz unter 2° von geografisch Nord) */}
          <g transform={`translate(${VB - 38}, 18)`} aria-label="Norden">
            <path d="M0,0 L13,40 L0,31 L-13,40 Z" fill="#000000" stroke="#ffffff" strokeWidth={2.5} strokeLinejoin="round" />
            <path d="M0,0 L0,31 L-13,40 Z" fill="#ffffff" />
            <text x={0} y={62} fontSize={18} fontWeight={700} textAnchor="middle" fill="#000000" stroke="#ffffff" strokeWidth={4}
                  paintOrder="stroke">N</text>
          </g>
          <g>
            <rect x={14} y={vh - 30} width={mass * s} height={6} fill="#000000" stroke="#ffffff" strokeWidth={1.5} />
            <text x={14} y={vh - 36} fontSize={15} fill="#000000" stroke="#ffffff" strokeWidth={4} paintOrder="stroke">{mass} m</text>
          </g>
        </svg>
      </div>
      <figcaption className="klein">Abschnitt rot; das Dreieck an der Nummer zeigt die Fahrtrichtung der Seite A und damit die Blickrichtung der Querschnitte. Luftbild © swisstopo (SWISSIMAGE)
        {av.length > 0 ? '; Bodenbedeckung der amtlichen Vermessung' : ''}{park.length > 0 ? '; Parkfelder blau, Parkverbotsfelder orange' : ''}.</figcaption>
    </figure>
  )
}

const strecke = (l: P[]) => l.reduce((m, p, i) => (i ? m + Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) : 0), 0)

const noteText = (n: number | null, modus: 'note' | 'erfuellung') =>
  n == null ? '–' : modus === 'erfuellung' ? erfuellungsgrad(n) : `${numDE(n, 1)} (${erfuellungsgrad(n)})`
const formText = (f: Seite) => `${f.ist || '–'}${Number.isFinite(f.breite) ? ` ${numDE(f.breite, 2)} m` : ''}` +
  `${f.parkenRechts === 'ja' ? `, neben Parkierung${f.parkenSicherheitsstreifen ? ' mit Sicherheitsstreifen' : ''}` : ''}`

// Inhalt der Seite (ohne Leiste und Portal), auch ohne Browser darstellbar (Test der Seitenzahl).
// Die Skizzen mit fester Druckbreite DRUCK_PX: A4 hoch mit 12 mm Rand, rund 186 mm.
export function BerichtSeite({ section, nr, heute, city, breiten, stadtName, routenLabel, modus, rA, rB, achsen, av, park, quellen, bez, setBez, onBild, basis }: {
  section: Section & { aufteilung: Aufteilung }
  nr: number                              // Abschnitt-Nummer (1-basiert)
  heute: AbschnittErgebnis
  city: Parameters<typeof bewerteAufteilung>[2]
  breiten?: Parameters<typeof bewerteAufteilung>[3]   // stadtspezifische Breiten-Sollwerte
  stadtName: string
  routenLabel?: Partial<Record<Routentyp, string>>   // Namen der Routentypen in der Stadt (z. B. Zürich «Velovorzugsroute»)
  modus: 'note' | 'erfuellung'
  rA: string | null; rB: string | null
  achsen: P[][]                           // LV95, in Fahrtrichtung der Seite A
  av: AvFlaeche[]; park: ParkFlaeche[]    // geladen in der Planung, sonst leer
  quellen: string[]                       // Quellenangaben der Daten (Stadt, AV, Parkfelder)
  bez: string; setBez?: (s: string) => void   // Bezeichnung (nur Bericht)
  onBild: (s: 'laedt' | 'ok' | 'fehler') => void
  basis: string                           // Pfad zu logo.svg und den Streetmix-Bildern
}) {
  const a = section.aufteilung
  const rt = section.routentyp || 'Veloroute'
  const umfeld = umfeldVon(section, a.teile, a.fussnetz, city)
  const plan = bewerteAufteilung(section, a, city, breiten)
  const aq = mitSeitenraum(a, section), b = bilanz(aq), bt = bilanzText(aq, b)
  const kern = pruefeKernfahrbahn(section, a.teile, city)
  const ausgang = startAufteilung(section, city, breiten)
  const massstab = Math.max(breiteCm(ausgang.teile), breiteCm(a.teile))
  const einbahn = section.richtung === 'eine'
  const seiteName = (s: 'A' | 'B') => (s === 'A' ? `Seite A${rA ? ` (Richtung ${rA})` : ''}` : `Seite B${rB ? ` (Richtung ${rB})` : ''}`)
  const datum = new Date().toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const seiten = (e: AbschnittErgebnis): Map<'A' | 'B', SeitenErgebnis> => new Map(e.seiten.map(x => [x.seite, x]))
  const sh = seiten(heute), sp = seiten(plan)
  const seitenListe: ('A' | 'B')[] = [...new Set([...sh.keys(), ...sp.keys()])].sort() as ('A' | 'B')[]


  return (
    <article className="bericht-seite">
      {/* Druckrand als Rahmen: Kopf und Fuss der Tabelle wiederholen sich auf jeder gedruckten Seite. So kommt der
          Bericht ohne Seitenrand aus (@page margin 0), und der Browser setzt keine eigene Kopf- und Fusszeile
          (Titel, Adresse, Seitenzahl, Datum) dazu (Nutzerwunsch 16.10.2026). */}
      <table className="bericht-rahmen">
        <thead><tr><td><div className="bericht-rand-oben" /></td></tr></thead>
        <tfoot><tr><td><div className="bericht-rand-unten" /></td></tr></tfoot>
        <tbody><tr><td>
            <header>
              <h1><img className="bericht-logo" src={basis + 'logo.svg'} alt="" width={34} height={34} />Aufteilung planen</h1>
              <p className="klein">VeloroutenCheck · Bericht vom {datum}</p>
            </header>

            <section className="bericht-block">
              <h2>Abschnitt {nr}</h2>
              <table className="bericht-zahlen"><tbody>
                <tr><td>Bezeichnung</td><td>
                  <input className="nicht-drucken bericht-eingabe" type="text" placeholder="z. B. Strasse, Abschnitt (erscheint im Bericht)"
                    value={bez} onChange={ev => setBez?.(ev.target.value)} />
                  <span className="nur-drucken">{bez.trim() || '–'}</span>
                </td></tr>
                <tr><td>Stadt</td><td>{stadtName}</td></tr>
                <tr><td>Routentyp</td><td>{section.routentyp
                  ? `${routenLabel?.[section.routentyp] ?? section.routentyp} (${quelleText(section.quelle.routentyp, ROUTENTYP_AMTLICH[city])})`
                  : `– (geprüft wie ${routenLabel?.Veloroute ?? 'Veloroute'})`}</td></tr>
                <tr><td>DTV, Tempo</td><td>{Number.isFinite(section.dtv)
                    ? `${Math.round(section.dtv).toLocaleString('de-CH')} Fz/Tag (${quelleText(section.quelle.dtv, DTV_AMTLICH[city])})`
                    : dtvAssumed(section, city) ? `≤ 2'000 Fz/Tag (angenommen: kein Eintrag in den ${DTV_AMTLICH.bern})` : 'DTV –'}
                  {' · '}{Number.isFinite(section.speed)
                    ? `${section.speed} km/h (${quelleText(section.quelle.speed, TEMPO_AMTLICH[city])})` : 'Tempo –'}</td></tr>
                <tr><td>Fahrbahnbreite</td><td>heute {Number.isFinite(section.fahrbahnbreite) ? `${numDE(section.fahrbahnbreite, 1)} m` : '–'}
                  {section.quelle.fahrbahnbreite === 'av' ? ' (amtliche Vermessung)' : ''} · verfügbar in der Planung ohne Randsteinanpassung
                  {' '}{Number.isFinite(a.fahrbahn) ? `${numDE(a.fahrbahn, 2)} m` : '–'}</td></tr>
                {section.trottoir && <tr><td>Trottoirs (AV)</td><td>Seite A {Number.isFinite(section.trottoir.a) ? `${numDE(section.trottoir.a, 2)} m` : 'keines'}
                  {' · '}Seite B {Number.isFinite(section.trottoir.b) ? `${numDE(section.trottoir.b, 2)} m` : 'keines'}</td></tr>}
                {Number.isFinite(b.verfuegbar) && b.ganz && <tr><td>Gesamtbreite</td><td>{numDE(b.verfuegbar, 2)} m (Fahrbahn und Breite
                  ausserhalb der Fahrbahn heute; verfügbar mit Randsteinanpassung)</td></tr>}
                {city === 'luzern' ? (
                  <tr><td>Trottoir</td><td>2,50 m mit Velostreifen oder unter Tempo 50, sonst 3,00 m; mindestens 2,00 m ({FUSS_QUELLE.luzern})</td></tr>
                ) : (
                <tr><td>{city === 'zurich' ? 'Bedeutung des Stadtraums' : city === 'basel' ? 'Fusswegnetz' : 'Fussverkehrsnetz'}</td><td>
                  {a.fussnetz && FUSSNETZ[a.fussnetz]?.stadt === city
                    ? `${FUSSNETZ[a.fussnetz].label} (${a.fussnetzQuelle === 'geoportal' ? (city === 'basel' ? 'Teilrichtplan Fuss- und Wanderwege' : 'Richtplan Fussverkehr') : 'gewählt'}), `
                      + `Trottoir ${FUSSNETZ[a.fussnetz].min < FUSSNETZ[a.fussnetz].wert ? `${numDE(FUSSNETZ[a.fussnetz].wert, 2)} m, mindestens ${numDE(FUSSNETZ[a.fussnetz].min, 2)} m`
                        : `mindestens ${numDE(FUSSNETZ[a.fussnetz].min, 2)} m`} (${FUSS_QUELLE[city]})`
                    : 'nicht gewählt (Trottoirs ohne Vorgabe geprüft)'}</td></tr>
                )}
                <tr><td>Fahrtrichtungen</td><td>{einbahn ? 'nur Seite A bewertet (Einbahn)' : 'beide Seiten'}{rA ? ` · Seite A Richtung ${rA}` : ''}</td></tr>
              </tbody></table>
            </section>

            {achsen.length > 0 && <BerichtKarte achsen={achsen} av={av} park={park} nr={nr} onBereit={onBild} />}

            {/* Seite 1: Angaben und Kartenbild; ab hier Seite 2 (index.css, .bericht-neue-seite) */}
            <section className="bericht-block bericht-neue-seite">
              <h2>Querschnitt</h2>
              <p className="klein">In Fahrtrichtung der Seite A gesehen: links der Rand der Seite B, rechts der Rand der Seite A.
                «Heute» ist die Ausgangslage aus den Eingaben des Abschnitts{section.trottoir ? ' und den Trottoirs aus der AV' : ''}.</p>
              <div className="bericht-skizze">
                <div className="bericht-skizze-titel">Heute</div>
                <SkizzeSvg titel="Heute" teile={ausgang.teile} einbahn={einbahn} massstabCm={massstab} px={DRUCK_PX} basis={basis} />
                <div className="bericht-skizze-titel">Planung</div>
                <SkizzeSvg titel="Planung" teile={a.teile} einbahn={einbahn} massstabCm={massstab} px={DRUCK_PX} basis={basis} />
              </div>
              <p className="klein">Illustrationen: Streetmix (streetmix.net), CC BY-SA 4.0.</p>
            </section>

            <section className="bericht-block">
              <h2>Teile der Planung</h2>
              <table className="bericht-tabelle">
                <thead><tr><th>Nr.</th><th>Teil</th><th>Breite</th><th>Prüfung</th></tr></thead>
                <tbody>
                  {a.teile.map((t, i) => {
                    const zusatz = [t.bild || bildVon(t) ? BILD_LABEL[bildVon(t)!] : '', t.markierung && t.markierung !== 'keine' && t.markierung in MARKIERUNG_LABEL
                      ? MARKIERUNG_LABEL[t.markierung] : ''].filter(Boolean).join(', ')
                    return (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{teilName(t)}{zusatz && <div className="klein">{zusatz}</div>}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{Number.isFinite(t.breite) ? `${numDE(t.breite, 2)} m` : '–'}
                          {t.angenommen && <div className="klein">angenommen*</div>}</td>
                        <td className="klein">{pruefungText(t, pruefeTeil(t, rt, breiten, umfeld))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {a.teile.some(t => t.angenommen) && <p className="klein">* Breite heute unbekannt (keine Angabe in OSM, nicht gemessen): Vorgabe eingesetzt.</p>}
              <p><b>Bilanz:</b> {bt.kopf} · {bt.fehlmass ? <b>{bt.ergebnis}</b> : bt.ergebnis}
                {bt.zusatz.length > 0 && <span className="klein"> · {bt.zusatz.join(' · ')}</span>}</p>
              {kern.length > 0 && <><p><b>Kernfahrbahn:</b></p><ul className="klein">{kern.map(k => <li key={k.text}>{k.streng ? <b>{k.text}</b> : k.text}</li>)}</ul></>}
            </section>

            <section className="bericht-block">
              <h2>Bewertung heute und mit der Planung</h2>
              <table className="bericht-tabelle">
                <thead><tr><th>Seite</th><th>Heute</th><th>Mit der Planung</th></tr></thead>
                <tbody>
                  {seitenListe.map(s => (
                    <tr key={s}>
                      <td>{seitenListe.length > 1 || einbahn ? seiteName(s) : 'Beide Seiten'}</td>
                      <td>{sh.get(s) ? <>{formText(sh.get(s)!.felder)}<div className="klein">{noteText(sh.get(s)!.bewertung?.note ?? null, modus)}</div></> : '–'}</td>
                      <td>{sp.get(s) ? <>{formText(sp.get(s)!.felder)}<div className="klein">{noteText(sp.get(s)!.bewertung?.note ?? null, modus)}</div></> : '–'}</td>
                    </tr>
                  ))}
                  <tr><td><b>Abschnitt</b></td><td><b>{noteText(heute.note, modus)}</b></td><td><b>{noteText(plan.note, modus)}</b></td></tr>
                </tbody>
              </table>
              <p className="klein">Dieselbe Bewertung wie im Rechner. Führungsform, Breite, Parkierung und Sicherheitsstreifen je Seite sowie das Tram
                kommen aus den Teilen, vom Rand nach innen gelesen; DTV, Tempo, Routentyp und Haltestelle bleiben wie eingegeben. Die Note des
                Abschnitts ist die schlechtere Seite.{Number.isFinite(b.rest) && b.rest < -0.005 ? ' Die Teile haben im verfügbaren Querschnitt keinen Platz; die Note setzt voraus, dass sie passen.' : ''}</p>
            </section>

            <section className="bericht-block">
              <h2>Annahmen und Grenzen</h2>
              <ul className="klein">
                <li>Die Masse sind nicht ganz genau. Fahrbahn- und Trottoirbreiten aus der amtlichen Vermessung sind Mediane aus Querschnitten
                  alle 5 m, gerundet auf 0,1 m bzw. 5 cm; sie folgen dem Datenstand der AV und mitteln Einengungen und Verbreiterungen weg. Am
                  Luftbild gemessene Breiten hängen zudem von der Klickgenauigkeit ab (10 cm pro Bildpunkt), angenommene Breiten sind Vorgaben,
                  keine Messung.</li>
                <li>Nicht geprüft: Mittelinseln, Abbiegespuren, Längsgefälle, Sichtweiten. Von der Haltestelle prüft die Planung nur die Breite von Wartehäuschen und Warteraum; ihre Bewertung bleibt wie im Rechner eingegeben.</li>
                <li>Die Bilanz zählt den ganzen Querschnitt: verfügbar sind die Fahrbahn und die Breite ausserhalb der Fahrbahn von heute
                  (Trottoirs aus der AV). Trottoirbreiten können angepasst werden. Ist diese Breite unbekannt, gilt die Bilanz nur für die Fahrbahn.</li>
                <li>Trottoirs werden geprüft nach: {FUSS_QUELLE[city]}; Grünstreifen haben keine Vorgabe.</li>
                {city !== 'bern' && <li>Was die {STANDARD_QUELLE[city]} nicht regeln, wird nach dem Masterplan Veloinfrastruktur Stadt Bern
                  geprüft und in der Prüfung als «Ersatz Bern» gekennzeichnet. Die Fahrbahn ohne Mittellinie wird nach den Mindestbreiten
                  der Stadt geprüft.</li>}
                <li>Jede Fahrspur ist ab 3,00 m gültig; mit Lastwagen oder Bus gilt der Lichtraum als Richtwert.</li>
                <li>Ein Velostreifen direkt neben einer Trennung mit Pfosten gilt als geschützter Radstreifen; Veloabstellplatz und Parklet
                  zählen nicht als Parkierung.</li>
              </ul>
            </section>

            <section className="bericht-block">
              <h2>Quellen</h2>
              <ul className="klein">
                <li>Richtwerte und Vorgaben: {STANDARD_QUELLE[city]}{city !== 'bern' ? `; Ersatz: ${RICHTWERT_QUELLE}` : ''}; Trottoirs: {FUSS_QUELLE[city]}; Lichtraum von Lastwagen und Bus: {LICHTRAUM_QUELLE}; Tram 2,80 m
                  (1,40 m ab Gleisachse, Masterplan); Haltestelle 3,10 m und Trennung mit Pfosten 0,70 m: Festlegung VeloroutenCheck.</li>
                <li>Luftbild: © swisstopo, SWISSIMAGE (wms.geo.admin.ch)</li>
                {quellen.map(q => <li key={q}>{q}</li>)}
                <li>Strassennetz: © OpenStreetMap-Mitwirkende, ODbL</li>
                <li>Illustrationen der Skizze: Streetmix (streetmix.net), CC BY-SA 4.0</li>
              </ul>
            </section>

            <footer className="bericht-fuss">
              <p><b>Die App ersetzt keine Planung und keine Beurteilung vor Ort.</b> Daten aus offenen Quellen können veraltet oder
                unvollständig sein.</p>
              <p>VeloroutenCheck · {APP_URL} · Code und eigene Inhalte unter CC BY-NC 4.0 · Illustrationen der Skizze unter CC BY-SA 4.0 · eingebundene
                Daten unter ihren eigenen Lizenzen (siehe Quellen).</p>
            </footer>
        </td></tr></tbody>
      </table>
    </article>
  )
}

export default function Bericht({ section, nr, heute, city, breiten, stadtName, routenLabel, modus, rA, rB, achsen, av, park, quellen, schliessen }: {
  section: Section & { aufteilung: Aufteilung }
  nr: number                              // Abschnitt-Nummer (1-basiert)
  heute: AbschnittErgebnis
  city: Parameters<typeof bewerteAufteilung>[2]
  breiten?: Parameters<typeof bewerteAufteilung>[3]   // stadtspezifische Breiten-Sollwerte
  stadtName: string
  routenLabel?: Partial<Record<Routentyp, string>>   // Namen der Routentypen in der Stadt (z. B. Zürich «Velovorzugsroute»)
  modus: 'note' | 'erfuellung'
  rA: string | null; rB: string | null
  achsen: P[][]                           // LV95, in Fahrtrichtung der Seite A
  av: AvFlaeche[]; park: ParkFlaeche[]    // geladen in der Planung, sonst leer
  quellen: string[]                       // Quellenangaben der Daten (Stadt, AV, Parkfelder)
  schliessen: () => void
}) {
  const [bild, setBild] = useState<'laedt' | 'ok' | 'fehler'>(achsen.length ? 'laedt' : 'fehler')
  const wartet = bild === 'laedt'
  const [bez, setBez] = useState(section.label ?? '')
  // Titel = Vorschlag für den Dateinamen beim Speichern als PDF
  useEffect(() => {
    const alt = document.title
    const d = new Date(), zz = (x: number) => String(x).padStart(2, '0')
    document.title = `VeloroutenCheck_Aufteilung_Abschnitt-${nr}_${d.getFullYear()}-${zz(d.getMonth() + 1)}-${zz(d.getDate())}`
    return () => { document.title = alt }
  }, [nr])
  useEffect(() => {
    document.body.classList.add('bericht-offen')
    return () => document.body.classList.remove('bericht-offen')
  }, [])
  useEffect(() => {
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') schliessen() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [schliessen])

  return createPortal(
    <div className="bericht" role="dialog" aria-label="Bericht Aufteilung planen">
      <div className="bericht-leiste nicht-drucken">
        <button className="bericht-knopf" onClick={() => window.print()} disabled={wartet} title={wartet ? 'Luftbild wird noch geladen' : ''}>
          {wartet ? 'Luftbild lädt …' : 'Drucken / als PDF speichern'}</button>
        <button className="bericht-knopf zweit" onClick={schliessen}>Zurück zur Planung</button>
        <span className="klein">Im Druckdialog «Als PDF sichern» bzw. «Microsoft Print to PDF» wählen; A4 hoch, Hintergrundgrafiken einschalten.</span>
      </div>
      <BerichtSeite section={section} nr={nr} heute={heute} city={city} breiten={breiten} stadtName={stadtName} routenLabel={routenLabel} modus={modus}
        rA={rA} rB={rB} achsen={achsen} av={av} park={park} quellen={quellen} bez={bez} setBez={setBez} onBild={setBild}
        basis={import.meta.env.BASE_URL} />
    </div>,
    document.body,
  )
}
