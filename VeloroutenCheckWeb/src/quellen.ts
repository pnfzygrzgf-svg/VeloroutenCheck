// ── Quellenverzeichnis (seit 23.10.2026, nach dem Muster von fgsCheck): Vorgaben, Normen und Daten, auf die sich
// Bewertung und Planung stützen, mit Herausgeber, Ausgabe, Ebene und, wo es eine öffentliche Adresse gibt, dem Link.
// Angezeigt im Panel («Quellen und Grundlagen», gefiltert auf die gewählte Stadt) und im Bericht der Planung.
// Eigene Formulierungen; die Verbindlichkeit folgt nur aus der Ebene (Standard einer Stadt, Norm, Normalie, Befragung,
// Geodaten, Festlegung), nicht aus eigener Auslegung. Nur Adressen, die am 23.10.2026 erreichbar waren (HTTP 200).

import type { Stadt } from './fuehrungsform'

export type QuellenEbene =
  | 'Standard der Stadt'        // Masterplan, Velostandards: verbindlich für die eigenen Projekte der Stadt, sonst Orientierung
  | 'Norm'                      // VSS-Norm: anerkannte Fachregel, kein Gesetz
  | 'Normalie Stadt Bern'       // Normalien des Tiefbauamts: Masse für die eigenen Projekte der Stadt
  | 'Befragung'                 // empirische Grundlage (feel-safe, Bildumfrage)
  | 'Geodaten'                  // Datendienst einer Stadt, eines Kantons oder des Bundes
  | 'Modell'                    // Luftbild-Erkennung
  | 'Messdaten'                 // OpenBikeSensor
  | 'Illustration'              // Streetmix
  | 'Festlegung'                // eigene Festlegung von VeloroutenCheck

export type QuellenGruppe = 'vorgabe' | 'daten'

export interface Quelle {
  id: string
  name: string                  // Kurzname, wie ihn die App in Prüfung und Chips nennt
  titel?: string                // ausgeschriebener Titel oder Untertitel
  herausgeber: string
  ausgabe?: string              // Stand oder Datum, wie auf dem Werk
  ebene: QuellenEbene
  gruppe: QuellenGruppe
  url?: string                  // öffentliche Adresse (Dokument, Seite oder Dienst); fehlt bei kostenpflichtigen Normen
  verwendung: string            // wofür VeloroutenCheck es braucht
  staedte?: Stadt[]             // nur für diese Städte; fehlt = alle
}

const NORM_HINWEIS = 'VSS-Norm, kostenpflichtig beim VSS (vss.ch).'

export const QUELLEN: readonly Quelle[] = [
  // ── Vorgaben und Normen ───────────────────────────────────────────────────
  { id: 'mp_velo_bern', name: 'Masterplan Veloinfrastruktur Stadt Bern', titel: 'Standards (Oktober 2025)', herausgeber: 'Stadt Bern, Verkehrsplanung',
    ausgabe: '2025-10', ebene: 'Standard der Stadt', gruppe: 'vorgabe',
    url: 'https://www.bern.ch/velohauptstadt/infrastruktur/masterplan-veloinfrastruktur',
    verwendung: 'Soll-Führungsform nach Verkehrsmenge und Tempo, Richtwerte der Querschnitte (Q 1–12), Haltestellen HS 1–5, Kernfahrbahn, ' +
      'Haltestellenbereich. In Zürich, Basel und Luzern Ersatz für Masse, die der eigene Standard nicht nennt («Ersatz Bern»).' },
  { id: 'velostandards_zh', name: 'Velostandards Stadt Zürich', herausgeber: 'Stadt Zürich, Tiefbauamt', ausgabe: '2024-03-22',
    ebene: 'Standard der Stadt', gruppe: 'vorgabe', staedte: ['zurich'],
    url: 'https://www.stadt-zuerich.ch/content/dam/web/de/aktuell/publikationen/2024/velostandards-stadt-zuerich/velostandards-stadt-zuerich.pdf',
    verwendung: 'Soll-Führungsform je Netzstufe, Breiten der Velostreifen, Sicherheitsabstand zur Parkierung, Kernfahrbahn.' },
  { id: 'standards_bs', name: 'Standards Fuss- und Veloverkehrsinfrastruktur Basel-Stadt', herausgeber: 'Kanton Basel-Stadt, Bau- und Verkehrsdepartement',
    ausgabe: '2024-09-27', ebene: 'Standard der Stadt', gruppe: 'vorgabe', staedte: ['basel'],
    url: 'https://media.bs.ch/original_file/72373a2c610e23b19ae61cd148ad22f35b3d1fe2/2024-09-27-standards-fvv-is-bs.pdf',
    verwendung: 'Soll-Führungsform nach Strassentyp und Route, Breiten (Tab. 1 und 5), Längsparkierung, Trennstreifen, Kernfahrbahn, Trottoirs nach Fusswegnetz.' },
  { id: 'standards_lu', name: 'Standards Veloverkehr Stadt Luzern', herausgeber: 'Stadt Luzern, Tiefbauamt (Metron)', ausgabe: '2021-01-12',
    ebene: 'Standard der Stadt', gruppe: 'vorgabe', staedte: ['luzern'],
    url: 'https://www.stadtluzern.ch/_docn/2965064/Standards_Veloverkehr.pdf',
    verwendung: 'Soll-Führungsform, Breiten der Velostreifen, Fahrstreifen, Parkfeld und Abstand, Kernfahrbahn, Haltestellen (Perron).' },
  { id: 'mp_fuss_bern', name: 'Masterplan Fussverkehr Stadt Bern', titel: 'Standards', herausgeber: 'Stadt Bern, Verkehrsplanung',
    ebene: 'Standard der Stadt', gruppe: 'vorgabe', staedte: ['bern'],
    url: 'https://www.bern.ch/themen/mobilitat-und-verkehr/fussverkehr',
    verwendung: 'Vorgabe der Trottoirbreite je Fussverkehrsnetz (Basisnetz 2,50 m, übrige 2,00 m, publikumsintensiv 3,00 m) in der Planung.' },
  { id: 'leitfaden_fuss_zh', name: 'Leitfaden Standards Fussverkehr Stadt Zürich', herausgeber: 'Stadt Zürich, Tiefbauamt', ausgabe: '2020',
    ebene: 'Standard der Stadt', gruppe: 'vorgabe', staedte: ['zurich'],
    url: 'https://www.stadt-zuerich.ch/de/mobilitaet/zu-fuss/leitfaden.html',
    verwendung: 'Lichte Trottoirbreite nach Bedeutung des Stadtraums, ohne Umfeldzuschläge.' },
  { id: 'standards_fuss_lu', name: 'Standards Fussverkehr Stadt Luzern', herausgeber: 'Stadt Luzern, Tiefbauamt (Metron)', ausgabe: '2021-01-12',
    ebene: 'Standard der Stadt', gruppe: 'vorgabe', staedte: ['luzern'],
    url: 'https://www.stadtluzern.ch/_doc/2965040',
    verwendung: 'Trottoirbreite: 2,50 m mit Velostreifen oder unter Tempo 50, sonst 3,00 m (Kanton), mindestens 2,00 m (Stadt).' },
  { id: 'sn640201', name: 'SN 640 201', titel: 'Geometrisches Normalprofil; Grundabmessungen und Lichtraumprofil der Verkehrsteilnehmer',
    herausgeber: 'VSS', ebene: 'Norm', gruppe: 'vorgabe',
    verwendung: `Lichtraum von Lastwagen und Bus für die Breite der Fahrspuren in der Planung. ${NORM_HINWEIS}` },
  { id: 'sn640060', name: 'SN 640 060', titel: 'Leichter Zweiradverkehr; Grundlagen', herausgeber: 'VSS', ebene: 'Norm', gruppe: 'vorgabe',
    verwendung: `Sicherheitsstreifen zwischen Velostreifen und Parkierung (Feld «Sicherheitsstreifen gegenüber Parkplätzen»). ${NORM_HINWEIS}` },
  { id: 'normalie_park', name: 'Normalien Stadt Bern 2.10.22', titel: 'Parkfelder 1/2, Auto', herausgeber: 'Stadt Bern, Tiefbauamt',
    ebene: 'Normalie Stadt Bern', gruppe: 'vorgabe',
    url: 'https://www.bern.ch/themen/planen-und-bauen/bern-baut/planen-und-projektieren/c-normalien/2-strassenbau/2-10-strassenmarkierungen-1/2-10-22-parkfelder-1-2-auto.pdf/download',
    verwendung: 'Tiefe der Parkfelder: längs 1,90 m, schräg 60° 5,25 m, schräg 45° 4,90 m, senkrecht 5,00 m (Vorbelegung, Winkel aus der Feldlänge).' },
  { id: 'feelsafe', name: 'radwege-check / FixMyCity', titel: 'Befragung zur subjektiven Sicherheit (feel-safe)', herausgeber: 'FixMyCity, Berlin',
    ebene: 'Befragung', gruppe: 'vorgabe', url: 'https://radwege-check.de/',
    verwendung: 'Feel-safe-Werte je Führungsform: Grundlage der Note, wenn die vorhandene Führungsform nicht der Soll-Führungsform entspricht.' },
  { id: 'umfrage_bern', name: 'Bildumfrage Bern 2026', titel: 'Subjektive Sicherheit auf Berner Velorouten, Ergebnisbericht', herausgeber: 'VeloroutenCheck',
    ausgabe: '2026', ebene: 'Befragung', gruppe: 'vorgabe',
    url: 'https://github.com/pnfzygrzgf-svg/VeloroutenCheck/blob/main/docs/09_Umfrage_Subjektive_Sicherheit_Bern_2026/Ergebnisbericht.md',
    verwendung: '5 900 Bewertungen von 51 Berner Szenen: bestätigt die Rangfolge der Führungsformen und den Abzug für zu schmale Velostreifen.' },
  { id: 'festlegung', name: 'Festlegungen VeloroutenCheck', herausgeber: 'VeloroutenCheck', ausgabe: '2026-10', ebene: 'Festlegung', gruppe: 'vorgabe',
    url: 'https://github.com/pnfzygrzgf-svg/VeloroutenCheck#bewertung-methodik',
    verwendung: 'Eigene Festlegungen, wo die Werke schweigen: Trennung mit Pfosten 0,70 m, Note 2 bei nicht erfülltem Haltestellenbereich, ' +
      'Rangfolge der Massnahmen im Vorschlag, Haltestelleninsel unter 2,50 m als Ein- und Ausstieg. Begründet im README.' },
  // ── Daten und Dienste ─────────────────────────────────────────────────────
  { id: 'osm', name: 'OpenStreetMap', herausgeber: 'OpenStreetMap-Mitwirkende, ODbL', ebene: 'Geodaten', gruppe: 'daten',
    url: 'https://www.openstreetmap.org/',
    verwendung: 'Strassennetz, Name, Tempo, Breite, Führungsform, Fahrspuren und Pfeile, Einbahn, parallele Radwege, Wartehallen (Overpass API, live).' },
  { id: 'geo_bern', name: 'Geoportal Stadt Bern', herausgeber: 'Stadt Bern, Geoinformation', ebene: 'Geodaten', gruppe: 'daten', staedte: ['bern'],
    url: 'https://map.bern.ch/',
    verwendung: 'Verkehrsmenge (DTV), Tempo, Veloroutennetz des Masterplans, Velostrassen, Haltestellen und ÖV-Linien, Parkfelder (Auto für die Parkierung, Velo und Motorrad für den Platzbedarf in der Planung), Richtplan Fussverkehr, Orthofoto 2026 (Kartenhintergrund «Bern 2026» und Markierungserkennung live, Luftbild-Hinweis als Snapshot). ' +
      'Der DTV ist aus Tages- und Nachtwerten geschätzt (DTV ≈ 16·Nt + 8·Nn), nur eine Grössenordnung, und nur für Strassen über 2 000 Fahrzeuge je Tag ' +
      'sowie die Altstadt geführt; ohne Eintrag gilt «≤ 2 000 angenommen».' },
  { id: 'ogd_zh', name: 'Open Data Stadt Zürich', herausgeber: 'Stadt Zürich', ebene: 'Geodaten', gruppe: 'daten', staedte: ['zurich'],
    url: 'https://data.stadt-zuerich.ch/',
    verwendung: 'Velonetzplanung (Routentyp), Tempo, öffentliche Parkplätze (live).' },
  { id: 'ogd_bs', name: 'Open Data Kanton Basel-Stadt', herausgeber: 'Kanton Basel-Stadt', ebene: 'Geodaten', gruppe: 'daten', staedte: ['basel'],
    url: 'https://data.bs.ch/',
    verwendung: 'Teilrichtplan Velo und Velostadtplan (Routentyp, Velostrassen), Strassentyp und Tempo, Verkehrszählung (DTV), Teilrichtplan Fuss- und Wanderwege (live bzw. Snapshot).' },
  { id: 'ogd_lu', name: 'Open Data Stadt Luzern', herausgeber: 'Stadt Luzern', ebene: 'Geodaten', gruppe: 'daten', staedte: ['luzern'],
    url: 'https://map.stadtluzern.ch/',
    verwendung: 'Velonetz (Routentyp), öffentliche Parkplätze, Strassenflächen als Ersatz für die amtliche Vermessung (live).' },
  { id: 'av', name: 'Amtliche Vermessung', titel: 'Bodenbedeckung, Kantone Bern, Zürich und Basel-Stadt', herausgeber: 'geodienste.ch (Kantone)',
    ebene: 'Geodaten', gruppe: 'daten', staedte: ['bern', 'zurich', 'basel'], url: 'https://www.geodienste.ch/',
    verwendung: 'Bordsteinkanten für die Breitenmessung, Fahrbahn- und Trottoirbreiten, Mittelinseln und Haltestelleninseln, Flächen auf der Karte in der Planung (live).' },
  { id: 'swisstopo', name: 'swisstopo', titel: 'SWISSIMAGE, Landeskarte grau, amtliches Strassenverzeichnis, Adresssuche', herausgeber: 'Bundesamt für Landestopografie',
    ebene: 'Geodaten', gruppe: 'daten', url: 'https://www.swisstopo.admin.ch/',
    verwendung: 'Luftbild (Standard-Hintergrund, Messen, Bericht), Kartenhintergrund «Karte», Strassennamen über dem Luftbild, Vorschläge der Strassensuche (live).' },
  { id: 'gtfs', name: 'opentransportdata.swiss', titel: 'GTFS-Fahrplan', herausgeber: 'Open Data Plattform Mobilität Schweiz', ebene: 'Geodaten', gruppe: 'daten',
    url: 'https://opentransportdata.swiss/',
    verwendung: 'Bus-Takt der Abendspitze je Haltestelle (ÖV-Angebot) und Takt der Linien auf der Umweltspur (Snapshot je Stadt).' },
  { id: 'remote_velo', name: 'remote_velo', titel: 'Predicting Bike Infrastructure with Aerial Imagery (ETH Zürich)', herausgeber: 'ETH Zürich',
    ausgabe: '2026', ebene: 'Modell', gruppe: 'daten', staedte: ['bern', 'zurich', 'basel'], url: 'https://doi.org/10.1007/s11116-026-10728-8',
    verwendung: 'Luftbild-Hinweis «Radstreifen erkannt» je Seite (nicht in der Note); Snapshot der Erkennung je Stadt.' },
  { id: 'obs', name: 'OpenBikeSensor', herausgeber: 'OpenBikeSensor-Mitwirkende', ebene: 'Messdaten', gruppe: 'daten', staedte: ['bern', 'zurich'],
    url: 'https://portal.openbikesensor.org/',
    verwendung: 'Gemessene Überholabstände je Abschnitt (Hinweis, nicht in der Note; Snapshot).' },
  { id: 'streetmix', name: 'Streetmix', titel: 'Illustrationen (@streetmix/illustrations), CC BY-SA 4.0', herausgeber: 'Streetmix', ebene: 'Illustration', gruppe: 'daten',
    url: 'https://github.com/streetmix/illustrations',
    verwendung: 'Personen, Velos, Fahrzeuge vom Auto bis zum Tram, Ausstattung und Pfeile in der Querschnitt-Skizze; Boden, Masse und Striche sind eigene Zeichnung.' },
]

/** Quellen einer Stadt (allgemeine und stadtspezifische), in der Reihenfolge des Verzeichnisses */
export const quellenFuer = (stadt: Stadt, gruppe?: QuellenGruppe): Quelle[] =>
  QUELLEN.filter(q => (!q.staedte || q.staedte.includes(stadt)) && (!gruppe || q.gruppe === gruppe))

/** Kurzzeile einer Quelle für den Bericht: Name, Titel, Herausgeber, Ausgabe, Adresse */
export const quellenZeile = (q: Quelle): string =>
  [q.name + (q.titel ? `: ${q.titel}` : ''), q.herausgeber + (q.ausgabe ? ` (${q.ausgabe})` : ''), q.url].filter(Boolean).join(' · ')
