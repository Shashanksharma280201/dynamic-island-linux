import { defineConfig, externalizeDepsPlugin, type Plugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Production-only CSP (the dev server needs an inline React-refresh preamble).
// Voice: Whisper runs as WebAssembly in a worker; the model and the
// onnxruntime files come from the app itself over island-model://.
// WhatsApp photos, videos and voice notes are served over island-media://.
const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' island-model:; " +
  "worker-src 'self' blob:; connect-src 'self' island-model: island-media:; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https: http: island-media:; media-src 'self' island-media: blob:"
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
