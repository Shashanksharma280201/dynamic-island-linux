import { defineConfig, externalizeDepsPlugin, type Plugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Production-only CSP (the dev server needs an inline React-refresh preamble).
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https: http:"
const csp: Plugin = {
  name: 'island-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('shared') } },
    build: { rollupOptions: { input: resolve('electron/main.ts') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('shared') } },
    build: { rollupOptions: { input: resolve('electron/preload.ts') } },
  },
  renderer: {
    root: 'renderer',
    plugins: [react(), csp],
    resolve: { alias: { '@shared': resolve('shared') } },
    build: {
      rollupOptions: {
        input: { index: resolve('renderer/index.html'), settings: resolve('renderer/settings.html') },
      },
    },
  },
})
