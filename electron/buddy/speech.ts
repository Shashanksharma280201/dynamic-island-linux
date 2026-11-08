import { net } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { once } from 'node:events'
import { dirname, join } from 'node:path'

/** Kokoro-82M, as ONNX for transformers.js (Apache-2.0). */
export const KOKORO = 'onnx-community/Kokoro-82M-v1.0-ONNX'
export const KOKORO_FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx']
export const KOKORO_MB = 92

/** How long captions stay up when nothing is spoken: about a reading pace. Pure. */
export function readingMs(text: string): number {
  return Math.min(9000, Math.max(1400, text.length * 55))
}

/** spd-say's rate (-100..100) for a speed (0.7..1.4). Pure. */
export function spdRate(speed: number): number {
  return Math.round(Math.min(100, Math.max(-100, (speed - 1) * 120)))
}

/**
 * The system's voice: speech-dispatcher (spd-say, on Ubuntu's desktop by
 * default) or espeak-ng. One sentence at a time; stop() cuts it off.
 */
export class SystemVoice {
  private child: ChildProcess | null = null

  constructor(private find: (name: string) => string | null) {}

  available(): string | null {
    return this.find('spd-say') ?? this.find('espeak-ng') ?? this.find('espeak')
  }

  say(text: string, speed: number): Promise<void> {
    const bin = this.available()
    if (!bin) return Promise.reject(new Error('No system voice (install speech-dispatcher or espeak-ng).'))
    const isSpd = bin.endsWith('spd-say')
    const args = isSpd ? ['-w', '-r', String(spdRate(speed)), '--', text] : ['-s', String(Math.round(170 * speed)), '-v', 'en-us', '--', text]
    return new Promise((resolve, reject) => {
      const p = spawn(bin, args, { stdio: 'ignore' })
      this.child = p
      p.on('error', reject)
      p.on('close', () => {
        if (this.child === p) this.child = null
        resolve()
      })
    })
  }

  stop(): void {
    this.child?.kill('SIGTERM')
    this.child = null
    // spd-say hands speech to a daemon: tell it to stop too.
    const spd = this.find('spd-say')
    if (spd) spawn(spd, ['-S'], { stdio: 'ignore' }).on('error', () => {})
  }
}

/** Tests: what would be said, written to a file instead (DI_TTS_LOG). */
export function testVoice(file: string): (engine: string, text: string) => Promise<void> {
  return async (engine, text) => {
    appendFileSync(file, `${engine}: ${text}\n`)
    await new Promise((r) => setTimeout(r, Number(process.env.DI_TTS_MS) || 250))
  }
}

/**
 * Kokoro's model and voices, downloaded once from Hugging Face into the
 * island's models folder (served to the renderer over island-model://).
 */
export class KokoroFiles {
  private job: Promise<void> | null = null
  progress = 0
  error: string | null = null

  constructor(
    private root: string,
    private onChange: () => void,
    private baseUrl = 'https://huggingface.co',
  ) {}

  private dir(): string {
    return join(this.root, KOKORO)
  }

  private has(rel: string): boolean {
    try {
      return statSync(join(this.dir(), rel)).size > 0
    } catch {
      return false
    }
  }

  ready(voice: string): boolean {
    return KOKORO_FILES.every((f) => this.has(f)) && this.has(`voices/${voice}.bin`)
  }

  downloading(): boolean {
    return !!this.job
  }

  /** Download what's missing (the model once, each voice when first used). */
  ensure(voice: string): Promise<void> {
    if (this.ready(voice)) return Promise.resolve()
    if (this.job) return this.job.then(() => this.ensure(voice))
    this.error = null
    this.progress = 0
    this.job = this.fetchAll(voice)
      .catch((e) => {
        this.error = `Couldn’t download the natural voice: ${e?.message ?? e}`
        throw e
      })
      .finally(() => {
        this.job = null
        this.onChange()
      })
    this.onChange()
    return this.job
  }

  private async fetchAll(voice: string): Promise<void> {
    const want = [...KOKORO_FILES.filter((f) => !this.has(f)), `voices/${voice}.bin`].filter((f) => !this.has(f))
    const total = (want.some((f) => f.startsWith('onnx/')) ? KOKORO_MB : 1) * 1024 * 1024
    let done = 0
    let last = 0
    for (const rel of want) {
      const res = await net.fetch(`${this.baseUrl}/${KOKORO}/resolve/main/${rel}`)
      if (!res.ok || !res.body) throw new Error(`${rel}: HTTP ${res.status}`)
      const file = join(this.dir(), rel)
      const part = file + '.part'
      mkdirSync(dirname(file), { recursive: true })
      const out = createWriteStream(part)
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        const buf = Buffer.from(chunk)
        if (!out.write(buf)) await once(out, 'drain')
        done += buf.length
        this.progress = Math.min(0.99, done / total)
        if (this.progress - last > 0.03) {
          last = this.progress
          this.onChange()
        }
      }
      await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())))
      if (rel.endsWith('.json')) JSON.parse(readFileSync(part, 'utf8'))
      if (existsSync(file)) rmSync(file)
      renameSync(part, file)
    }
    this.progress = 1
  }
}
