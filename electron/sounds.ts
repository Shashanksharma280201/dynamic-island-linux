import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { customSoundFiles, MAX_SOUND_BYTES, soundMime, SOUND_KINDS, type SoundKind } from '@shared/sounds'

/**
 * Your own sounds: files in a folder named after the event they replace
 * ("done.mp3", "ask.wav"). Watched, so a new file is used right away.
 */
export class CustomSounds {
  private files: Partial<Record<SoundKind, string>> = {}
  private version = 0
  private watcher: FSWatcher | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    readonly dir: string,
    private onChange: () => void,
  ) {
    this.scan()
    this.watch()
  }

  private scan(): void {
    let names: string[] = []
    try {
      names = readdirSync(this.dir)
    } catch {
      // no folder yet
    }
    this.files = customSoundFiles(names)
    this.version = Date.now()
  }

  private watch(): void {
    if (this.watcher || !existsSync(this.dir)) return
    try {
      this.watcher = watch(this.dir, () => {
        if (this.timer) clearTimeout(this.timer)
        this.timer = setTimeout(() => {
          this.scan()
          this.onChange()
        }, 300)
      })
    } catch {
      // can't watch: the list refreshes when the island restarts
    }
  }

  /** The folder, made if needed (to open it for you). */
  ensureDir(): string {
    mkdirSync(this.dir, { recursive: true })
    this.watch()
    return this.dir
  }

  /** Sound → URL the island plays it from. */
  urls(): Partial<Record<SoundKind, string>> {
    const out: Partial<Record<SoundKind, string>> = {}
    for (const k of SOUND_KINDS) if (this.files[k]) out[k] = `island-media://sound/${k}?v=${this.version}`
    return out
  }

  kinds(): SoundKind[] {
    return SOUND_KINDS.filter((k) => this.files[k])
  }

  /** The file for a sound: bytes and type, or null. */
  read(kind: string): { data: Buffer; mime: string } | null {
    const name = this.files[kind as SoundKind]
    if (!name) return null
    const p = join(this.dir, name)
    try {
      if (statSync(p).size > MAX_SOUND_BYTES) return null
      return { data: readFileSync(p), mime: soundMime(name) ?? 'application/octet-stream' }
    } catch {
      return null
    }
  }

  close(): void {
    this.watcher?.close()
    if (this.timer) clearTimeout(this.timer)
  }
}
