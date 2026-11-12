import { useEffect } from 'react'
import { IdleWorker } from '../idleWorker'

// The asks the worker hasn't answered yet (each fails at once if it crashes).
const asked = new Set<number>()

// The model in a worker, made when first asked and let go after a few minutes unused.
const embed = new IdleWorker(
  () => new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' }),
  (e) => {
    if (!asked.delete(e.data.id)) return
    embed.done()
    window.island.embed.done(e.data.vectors ? { id: e.data.id, vectors: e.data.vectors } : { id: e.data.id, error: e.data.error })
  },
  (message) => {
    for (const id of asked) window.island.embed.done({ id, error: `The meaning model ${message}` })
    asked.clear()
  },
)

/** Search by meaning: the main process asks for vectors; the model answers in a worker. */
export function useEmbedder(): void {
  useEffect(() => {
    if (!window.island.embed) return
    return window.island.embed.onAsk(({ id, texts }) => {
      asked.add(id)
      embed.ask({ id, texts })
    })
  }, [])
}
