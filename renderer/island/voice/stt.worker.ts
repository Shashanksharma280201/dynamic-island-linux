/// <reference lib="webworker" />
// Whisper speech recognition, off the UI thread. Models and the onnxruntime
// WebAssembly files come from the main process over island-model://.
import { env, pipeline } from '@huggingface/transformers'
import { prepareAudio } from './prep'

env.allowRemoteModels = false
env.allowLocalModels = true
env.useBrowserCache = false
env.localModelPath = 'island-model://models/'
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = 'island-model://ort/'
  env.backends.onnx.wasm.proxy = false
  // Use a few cores when shared memory is available (the island enables it).
  if (typeof SharedArrayBuffer !== 'undefined') {
    env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))
  }
}

type Asr = (audio: Float32Array, opts?: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>

let loaded: { id: string; asr: Promise<Asr> } | null = null

function load(id: string): Promise<Asr> {
  if (loaded?.id === id) return loaded.asr
  const asr = pipeline('automatic-speech-recognition', id, { dtype: 'q8', device: 'wasm' }) as unknown as Promise<Asr>
  loaded = { id, asr }
  asr.catch(() => (loaded = null))
  return asr
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data
  try {
    if (m.type === 'load') {
      await load(m.model)
      self.postMessage({ type: 'loaded', model: m.model })
    } else if (m.type === 'transcribe') {
      const asr = await load(m.model)
      const audio = prepareAudio(m.audio as Float32Array)
      if (audio.length < 16000 * 0.2) return self.postMessage({ type: 'text', id: m.id, text: '' })
      // English-only models (.en) take no language options. Commands are
      // short: cap the length and stop Whisper looping on a phrase.
      const opts = {
        ...(m.model.endsWith('.en') ? {} : { language: 'english', task: 'transcribe' }),
        max_new_tokens: 160,
        no_repeat_ngram_size: 4,
      }
      const out = await asr(audio, opts)
      const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim()
      self.postMessage({ type: 'text', id: m.id, text })
    }
  } catch (err: any) {
    self.postMessage({ type: 'error', id: m.id, error: String(err?.message ?? err) })
  }
}
