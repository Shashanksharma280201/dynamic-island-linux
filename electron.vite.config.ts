import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('shared') } },
    build: { rollupOptions: { input: resolve('electron/main.ts') } },
  },
  preload: {
    resolve: { alias: { '@shared': resolve('shared') } },
    build: { rollupOptions: { input: resolve('electron/preload.ts') } },
  },
  renderer: {
    root: 'renderer',
    plugins: [react()],
    resolve: { alias: { '@shared': resolve('shared') } },
    build: { rollupOptions: { input: resolve('renderer/index.html') } },
  },
})
