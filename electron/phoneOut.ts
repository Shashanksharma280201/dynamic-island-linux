import { nativeImage, screen } from 'electron'
import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'
import { randomBytes } from 'node:crypto'
import { DROP_MAX_FILES, KIND_COLOR, dropKind, sizeText, splitName, type DropSide } from '@shared/drop'
import type { JobState } from '@shared/types'
import type { DropOverlay } from './dropOverlay'
import type { PhoneLink } from './phoneLink'

type Deps = {
  link: PhoneLink
  overlay: DropOverlay
  present: (id: string, job: JobState, made?: string[]) => void
  /** The edge of this screen the phone is at (where its files last came in), and where along it. */
  side: () => { side: DropSide; at: number }
}

/** A file to send; `dir` is the folder it's in ("Holiday/Day 1") when a folder is sent. */
export type OutFile = { path: string; size: number; dir?: string }

/** Files sent together: one card on the island for all of them. */
type Batch = { id: string; title: string; device: string; files: Map<string, { size: number; got: number }>; done: number; failed: number; bytes: number }

const IMAGE = /\.(png|jpe?g|webp|gif|bmp)$/i
/** Only the first few of many files fly into the light; the rest just go. */
const FLY = 3

/**
 * What to send for what was picked or dragged: files as they are, folders as
 * every file in them (hidden ones too) with the folder each is in, at most
 * DROP_MAX_FILES in all. Links to folders aren't followed (no loops).
 */
export async function filesToSend(paths: string[], max = DROP_MAX_FILES): Promise<{ files: OutFile[]; more: boolean }> {
  const files: OutFile[] = []
  let more = false
  const walk = async (dir: string, root: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      if (files.length >= max) return void (more = true)
      const p = join(dir, e.name)
      if (e.isDirectory()) await walk(p, root)
      else if (e.isFile()) {
        const st = await stat(p).catch(() => null)
        if (st?.isFile()) files.push({ path: p, size: st.size, dir: relative(root, dir).split(sep).join('/') })
      }
    }
  }
  for (const path of paths) {
    if (files.length >= max) {
      more = true
      break
    }
    const st = await stat(path).catch(() => null)
    if (st?.isFile()) files.push({ path, size: st.size })
    else if (st?.isDirectory()) await walk(path, dirname(path))
  }
  return { files, more }
}

/**
 * Files (and folders) from this computer to your phone: they're pulled into
 * the light at the screen's edge where the phone is, and the phone (listening
 * on its link) fetches them. The island shows how it's going, one card for
 * everything sent together.
 */
export class PhoneOut {
  /** Each offered file's batch. */
  private sending = new Map<string, Batch>()

  constructor(private d: Deps) {}

  /** A little picture of an image, for the glow on both screens. */
  private thumb(path: string): string | undefined {
    if (!IMAGE.test(path)) return undefined
    try {
      const img = nativeImage.createFromPath(path)
      if (img.isEmpty()) return undefined
      const small = img.resize({ width: Math.min(360, img.getSize().width), quality: 'good' })
      const url = `data:image/jpeg;base64,${small.toJPEG(70).toString('base64')}`
      return url.length < 280_000 ? url : undefined
    } catch {
      return undefined
    }
  }

  /** Send files and folders; `from` is where on the screen they start (the pointer, when they were dragged), `along` where on the phone's edge they leave. */
  async send(paths: string[], from?: { x: number; y: number }, along?: number): Promise<void> {
    const phones = this.d.link.connected()
    const device = phones[0]?.device ?? 'your phone'
    const { side, at: usual } = this.d.side()
    const at = along ?? usual
    const { files, more } = await filesToSend(paths)
    if (!files.length) return
    const folders = new Set(files.filter((f) => f.dir).map((f) => f.dir!.split('/')[0]))
    const title =
      files.length === 1 ? basename(files[0].path) : folders.size === 1 && files.every((f) => f.dir) ? `${[...folders][0]} · ${files.length} files` : `${files.length} files`
    const batch: Batch = { id: `b${Date.now().toString(36)}${randomBytes(3).toString('hex')}`, title, device, files: new Map(), done: 0, failed: 0, bytes: 0 }
    const start = this.d.overlay.toPage(from ?? screen.getCursorScreenPoint())
    for (const [i, f] of files.entries()) {
      const name = basename(f.path)
      const thumb = i < FLY ? this.thumb(f.path) : undefined
      const id = this.d.link.offer(f.path, f.size, side, thumb, { dir: f.dir, batch: files.length > 1 ? { id: batch.id, i, n: files.length, title } : undefined })
      if (!id) {
        this.d.present(`out-none-${Date.now()}`, { title: 'No phone is listening', sub: title, phase: 'error', note: 'Open Island Drop on your phone (paired with this computer), then send it again.' })
        return
      }
      batch.files.set(id, { size: f.size, got: 0 })
      batch.bytes += f.size
      this.sending.set(id, batch)
      // The first few fly into the light, one after another.
      if (i < FLY) setTimeout(() => this.d.overlay.send({ t: 'send', id, side, at, from: start, thumb, name, ext: splitName(name).ext, color: KIND_COLOR[dropKind(name)] }), i * 220)
    }
    this.show(batch, more ? `The first ${files.length} files` : undefined)
  }

  progress(id: string, got: number, size: number): void {
    const b = this.sending.get(id)
    const f = b?.files.get(id)
    if (!b || !f) return
    f.got = Math.min(got, size)
    this.show(b)
  }

  delivered(id: string, ok: boolean, device: string): void {
    const b = this.sending.get(id)
    const f = b?.files.get(id)
    if (!b || !f) return
    this.sending.delete(id)
    f.got = f.size
    if (ok) b.done++
    else b.failed++
    b.device = device
    if (b.done + b.failed < b.files.size) return this.show(b)
    if (b.failed) {
      const n = b.files.size
      return this.d.present(`out-${b.id}`, { title: 'Didn’t all reach your phone', sub: b.title, phase: 'error', note: n === 1 ? `${device} couldn’t save it.` : `${b.failed} of ${n} didn’t arrive on ${device}.` })
    }
    this.d.present(`out-${b.id}`, {
      title: `Sent to ${device}`,
      sub: b.title,
      phase: 'done',
      note: `${sizeText(b.bytes)}, in Island Drop on your phone`,
    })
  }

  private show(b: Batch, note?: string): void {
    const got = [...b.files.values()].reduce((n, f) => n + f.got, 0)
    const left = b.files.size - b.done - b.failed
    this.d.present(`out-${b.id}`, {
      title: `To ${b.device}`,
      sub: b.files.size > 1 && left ? `${b.title} · ${b.done + b.failed + 1} of ${b.files.size}` : b.title,
      phase: 'working',
      progress: b.bytes ? got / b.bytes : 0,
      note,
    })
  }
}
