import { net } from 'electron'
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { once } from 'node:events'
import { dirname, join } from 'node:path'

/**
 * A model's files, downloaded once from Hugging Face into the island's models
 * folder (served to the renderer over island-model://), with progress.
 */
export class ModelFiles {
  private job: Promise<void> | null = null
  progress = 0
  error: string | null = null

  constructor(
    private root: string,
    private id: string,
    private files: string[],
    private sizeMb: number,
    private onChange: () => void,
    private baseUrl = 'https://huggingface.co',
  ) {}

  private has(rel: string): boolean {
    try {
      return statSync(join(this.root, this.id, rel)).size > 0
    } catch {
      return false
    }
  }

  ready(): boolean {
    return this.files.every((f) => this.has(f))
  }

  downloading(): boolean {
    return !!this.job
  }

  ensure(): Promise<void> {
    if (this.ready()) return Promise.resolve()
    if (this.job) return this.job
    this.error = null
    this.progress = 0
    this.job = this.fetchAll()
      .catch((e) => {
        this.error = `Couldn’t download it: ${e?.message ?? e}`
        throw e
      })
      .finally(() => {
        this.job = null
        this.onChange()
      })
    this.onChange()
    return this.job
  }

  private async fetchAll(): Promise<void> {
    const total = this.sizeMb * 1024 * 1024
    let done = 0
    let last = 0
    for (const rel of this.files.filter((f) => !this.has(f))) {
      const res = await net.fetch(`${this.baseUrl}/${this.id}/resolve/main/${rel}`)
      if (!res.ok || !res.body) throw new Error(`${rel}: HTTP ${res.status}`)
      const file = join(this.root, this.id, rel)
      const part = `${file}.part`
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
