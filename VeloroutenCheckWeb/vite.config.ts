import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages bedient Projekt-Sites unter /<repo>/ → Build-Basis auf den Repo-Namen setzen.
  // import.meta.env.BASE_URL spiegelt das (z. B. fetch der gebündelten public/-Snapshots).
  base: command === 'build' ? '/VeloroutenCheck/' : '/',
  // Dev-Server: zugewiesenen Port aus der Umgebung respektieren (z. B. Preview-Tooling).
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : undefined,
  // Verhindert, dass Vite/esbuild Media-Queries in die Level-4-Range-Syntax umschreibt
  // (erst ab iOS 16.4 / Safari 16.4 unterstützt).
  build: {
    cssTarget: ['chrome80', 'safari13', 'firefox78', 'edge80'],
  },
}))
