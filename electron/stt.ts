import { app, net, protocol } from 'electron'
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { once } from 'node:events'
import { dirname, join, normalize, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { SttModel } from './config'
import type { SttStatus } from '@shared/claude'

/**
 * Local speech recognition: Whisper models (ONNX, run in the island with
 * transformers.js + onnxruntime-web). The model is downloaded once from
 * Hugging Face on first use and served to the renderer over the private
 * island-model:// scheme, together with the onnxruntime WebAssembly files.
 */

export const SCHEME = 'island-model'

export const MODELS: Record<SttModel, { id: string; sizeMb: number; label: string }> = {
  tiny: { id: 'Xenova/whisper-tiny.en', sizeMb: 41, label: 'Fast (tiny, ~40 MB)' },
  base: { id: 'Xenova/whisper-base.en', sizeMb: 77, label: 'Accurate (base, ~80 MB)' },
}

/** Files transformers.js reads for a Whisper pipeline (quantized weights). */
export const MODEL_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
]


/** Call before app 'ready'. Electron allows one registration, so other
 * private schemes are passed in and registered together. */
export function registerSttScheme(extra: Electron.CustomScheme[] = []): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
    ...extra,
  ])
}

/** Resolve `rel` inside `root`, refusing anything that escapes it. Pure. */
export function safeJoin(root: string, rel: string): string | null {
  const base = resolve(root)
  const p = resolve(base, normalize(decodeURIComponent(rel)).replace(/^([/\\])+/, ''))
  return p === base || p.startsWith(base.endsWith(sep) ? base : base + sep) ? p : null
}

function ortDir(): string {
  // onnxruntime-web's WebAssembly runtime: from node_modules in dev, from
  // resources/ort when packaged (see "extraResources" in package.json).
  return app.isPackaged ? join(process.resourcesPath, 'ort') : join(app.getAppPath(), 'node_modules/onnxruntime-web/dist')
}

export class SpeechModels {
  private downloads = new Map<string, Promise<void>>()
  private progress = new Map<string, number>()
  private errors = new Map<string, string>()

  constructor(
    private root: string,
    private onStatus: (s: SttStatus) => void,
    /** Where to download from (tests point this at a local server). */
    private baseUrl = 'https://huggingface.co',
    /** A folder of ready models used instead (tests / offline installs). */
    private preinstalled?: string,
  ) {}

  modelId(size: SttModel): string {
    return process.env.DI_STT_MODEL || MODELS[size].id
  }

  private dirOf(id: string): string {
    if (this.preinstalled && existsSync(join(this.preinstalled, id))) return join(this.preinstalled, id)
    return join(this.root, id)
  }

  isReady(id: string): boolean {
    return MODEL_FILES.every((f) => {
      try {
        return statSync(join(this.dirOf(id), f)).size > 0
      } catch {
        return false
      }
    })
  }

  status(size: SttModel): SttStatus {
    const model = this.modelId(size)
    return {
      model,
      ready: this.isReady(model),
      downloading: this.downloads.has(model),
      progress: this.progress.get(model) ?? 0,
      error: this.errors.get(model),
      sizeMb: MODELS[size].sizeMb,
    }
  }

  /** Download the model if it isn't here yet. Resolves when it's ready. */
  ensure(size: SttModel): Promise<void> {
    const id = this.modelId(size)
    if (this.isReady(id)) return Promise.resolve()
    const running = this.downloads.get(id)
    if (running) return running
    this.errors.delete(id)
    const job = this.download(id, size)
      .catch((e) => {
        this.errors.set(id, `Couldn't download the speech model: ${e?.message ?? e}`)
        throw e
      })
      .finally(() => {
        this.downloads.delete(id)
        this.onStatus(this.status(size))
      })
    this.downloads.set(id, job)
    this.onStatus(this.status(size))
    return job
  }

  private async download(id: string, size: SttModel): Promise<void> {
    const dest = join(this.root, id)
    const tmp = dest + '.part'
    rmSync(tmp, { recursive: true, force: true })
    const total = MODELS[size].sizeMb * 1024 * 1024
    let done = 0
    let last = 0
    for (const f of MODEL_FILES) {
      const res = await net.fetch(`${this.baseUrl}/${id}/resolve/main/${f}`)
      if (!res.ok || !res.body) throw new Error(`${f}: HTTP ${res.status}`)
      const file = join(tmp, f)
      mkdirSync(dirname(file), { recursive: true })
      const out = createWriteStream(file)
      // Copy each chunk: the stream may reuse its buffer before the write lands.
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        const buf = Buffer.from(chunk)
        if (!out.write(buf)) await once(out, 'drain')
        done += buf.length
        const p = Math.min(0.99, done / total)
        this.progress.set(id, p)
        if (p - last > 0.02) {
          last = p
          this.onStatus(this.status(size))
        }
      }
      await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())))
    }
    // A broken download must not be mistaken for a model.
    JSON.parse(readFileSync(join(tmp, 'config.json'), 'utf8'))
    JSON.parse(readFileSync(join(tmp, 'tokenizer.json'), 'utf8'))
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(dirname(dest), { recursive: true })
    renameSync(tmp, dest)
    this.progress.set(id, 1)
  }

  /** Serve models and the WebAssembly runtime to the renderer. Call after 'ready'. */
  serve(): void {
    protocol.handle(SCHEME, async (req) => {
      const url = new URL(req.url)
      const rel = url.pathname
      let file: string | null = null
      if (url.host === 'models') {
        const parts = rel.split('/').filter(Boolean)
        const id = parts.slice(0, 2).join('/')
        // "<org>/<name>" only: never a path that climbs out of the models folder.
        if (/^[\w.-]+\/[\w.-]+$/.test(id) && !id.split('/').some((p) => p === '..' || p === '.')) {
          file = safeJoin(this.dirOf(id), parts.slice(2).join('/'))
        }
      } else if (url.host === 'ort') {
        file = safeJoin(ortDir(), rel)
      }
      if (process.env.DI_DEBUG) console.error('[stt] serve', url.host + rel, file && existsSync(file) ? 'ok' : 'missing')
      if (!file || !existsSync(file) || !statSync(file).isFile()) return new Response('Not found', { status: 404 })
      const res = await net.fetch(pathToFileURL(file).toString())
      const headers = new Headers(res.headers)
      headers.set('Access-Control-Allow-Origin', '*')
      if (file.endsWith('.mjs')) headers.set('Content-Type', 'text/javascript')
      if (file.endsWith('.wasm')) headers.set('Content-Type', 'application/wasm')
      return new Response(res.body, { status: 200, headers })
    })
  }
}
