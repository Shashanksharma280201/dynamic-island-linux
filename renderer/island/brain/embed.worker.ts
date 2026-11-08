/// <reference lib="webworker" />
// Search by meaning: notes and questions as vectors (all-MiniLM-L6-v2, on
// this computer), off the UI thread. The model comes from island-model://.
import { env, pipeline } from '@huggingface/transformers'
import { EMBED_MODEL } from '@shared/meaning'

env.allowRemoteModels = false
env.allowLocalModels = true
env.useBrowserCache = false
env.localModelPath = 'island-model://models/'
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = 'island-model://ort/'
  env.backends.onnx.wasm.proxy = false
}

type Extract = (texts: string[], o: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array; dims: number[] }>
let fx: Promise<Extract> | null = null

self.onmessage = async (e: MessageEvent) => {
  const m = e.data
  try {
    if (!fx) {
      fx = pipeline('feature-extraction', EMBED_MODEL, { dtype: 'q8', device: 'wasm' }) as unknown as Promise<Extract>
      fx.catch(() => (fx = null))
    }
    const f = await fx
    const out = await f(m.texts, { pooling: 'mean', normalize: true })
    const dims = out.dims[out.dims.length - 1]
    const vectors: Float32Array[] = []
    for (let i = 0; i < m.texts.length; i++) vectors.push(out.data.slice(i * dims, (i + 1) * dims))
    ;(self as unknown as Worker).postMessage({ id: m.id, vectors }, vectors.map((v) => v.buffer))
  } catch (err: any) {
    ;(self as unknown as Worker).postMessage({ id: m.id, error: String(err?.message ?? err) })
  }
}
