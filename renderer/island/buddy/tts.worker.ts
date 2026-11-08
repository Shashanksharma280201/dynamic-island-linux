/// <reference lib="webworker" />
// The buddy's natural voice: Kokoro-82M (Apache-2.0) on transformers.js, off
// the UI thread. Phonemes come from the main process (espeak-ng); the model
// and voices from island-model://, downloaded once. The steps follow
// kokoro-js (Apache-2.0): tokenize the phonemes, pick the voice's style for
// that length, run the model, 24 kHz audio out.
import { AutoTokenizer, StyleTextToSpeech2Model, Tensor, env } from '@huggingface/transformers'

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const STYLE = 256

env.allowRemoteModels = false
env.allowLocalModels = true
env.useBrowserCache = false
env.localModelPath = 'island-model://models/'
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = 'island-model://ort/'
  env.backends.onnx.wasm.proxy = false
  if (typeof SharedArrayBuffer !== 'undefined') {
    env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))
  }
}

type Loaded = { model: (inputs: Record<string, unknown>) => Promise<{ waveform: { data: Float32Array } }>; tokenizer: (text: string, o: { truncation: boolean }) => { input_ids: Tensor } }
let loaded: Promise<Loaded> | null = null
const voices = new Map<string, Float32Array>()

function load(): Promise<Loaded> {
  if (!loaded) {
    loaded = Promise.all([StyleTextToSpeech2Model.from_pretrained(MODEL, { dtype: 'q8', device: 'wasm' }), AutoTokenizer.from_pretrained(MODEL)]).then(
      ([model, tokenizer]) => ({ model: model as unknown as Loaded['model'], tokenizer: tokenizer as unknown as Loaded['tokenizer'] }),
    )
    loaded.catch(() => (loaded = null))
  }
  return loaded
}

async function voice(id: string): Promise<Float32Array> {
  const have = voices.get(id)
  if (have) return have
  const r = await fetch(`island-model://models/${MODEL}/voices/${id}.bin`)
  if (!r.ok) throw new Error(`The voice “${id}” isn’t downloaded yet.`)
  const v = new Float32Array(await r.arrayBuffer())
  voices.set(id, v)
  return v
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data
  try {
    if (m.type === 'load') {
      await load()
      return
    }
    if (m.type !== 'speak') return
    const { model, tokenizer } = await load()
    const { input_ids } = tokenizer(m.phonemes, { truncation: true })
    const tokens = input_ids.dims[input_ids.dims.length - 1]
    const at = STYLE * Math.min(Math.max(tokens - 2, 0), 509)
    const style = (await voice(m.voice)).slice(at, at + STYLE)
    const { waveform } = await model({ input_ids, style: new Tensor('float32', style, [1, STYLE]), speed: new Tensor('float32', [m.speed], [1]) })
    const audio = new Float32Array(waveform.data)
    ;(self as unknown as Worker).postMessage({ type: 'audio', id: m.id, audio }, [audio.buffer])
  } catch (err: any) {
    ;(self as unknown as Worker).postMessage({ type: 'error', id: m.id, error: String(err?.message ?? err) })
  }
}
