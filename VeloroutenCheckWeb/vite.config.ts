import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

// Nicht öffentliche Snapshots aus dem Build-Ergebnis entfernen. `velostreifen_bern.json` (aus den
// Berner Markierungsdaten) liegt nur lokal in public/ und ist gitignored — der Entwicklungsserver
// soll sie ausliefern, ein Build nie: Vite kopiert public/ sonst unbesehen nach dist/, und ein von
// Hand hochgeladenes dist/ hätte sie veröffentlicht. Der Build auf GitHub ist ohnehin nicht betroffen
// (dort fehlt die Datei), mit dem Plugin gleicht jeder lokale Build dem öffentlichen.
const NICHT_OEFFENTLICH = /^velostreifen_bern.*\.json$/
function nichtOeffentlichEntfernen(): Plugin {
  let outDir = 'dist'
  return {
    name: 'nicht-oeffentlich-entfernen',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir) },
    closeBundle() {
      for (const f of readdirSync(outDir)) {
        if (NICHT_OEFFENTLICH.test(f)) rmSync(resolve(outDir, f), { force: true })
      }
    },
  }
}

// Version aus package.json für die Anzeige in Fusszeile und Bericht (__APP_VERSION__)
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

export default defineConfig(() => ({
  plugins: [react(), nichtOeffentlichEntfernen()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Eigene Domain (veloroutencheck.ch) → die Site liegt an der Wurzel, nicht unter /<repo>/.
  // import.meta.env.BASE_URL spiegelt das (z. B. fetch der gebündelten public/-Snapshots).
  base: '/',
  // Dev-Server: zugewiesenen Port aus der Umgebung respektieren (z. B. Preview-Tooling).
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : undefined,
  // Verhindert, dass Vite/esbuild Media-Queries in die Level-4-Range-Syntax umschreibt
  // (erst ab iOS 16.4 / Safari 16.4 unterstützt).
  build: {
    cssTarget: ['chrome80', 'safari13', 'firefox78', 'edge80'],
  },
}))
