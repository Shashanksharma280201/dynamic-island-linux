import { useEffect } from 'react'

// One worker, made when first asked: it holds the model while it's used.
let worker: Worker | null = null

/** Search by meaning: the main process asks for vectors; the model answers in a worker. */
export function useEmbedder(): void {
  useEffect(() => {
    if (!window.island.embed) return
    return window.island.embed.onAsk(({ id, texts }) => {
      if (!worker) {
        worker = new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (e) => window.island.embed.done(e.data.vectors ? { id: e.data.id, vectors: e.data.vectors } : { id: e.data.id, error: e.data.error })
        worker.onerror = () => (worker = null)
      }
      worker.postMessage({ id, texts })
    })
  }, [])
}
