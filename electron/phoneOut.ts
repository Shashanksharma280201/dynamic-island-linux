import { nativeImage, screen } from 'electron'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { KIND_COLOR, dropKind, sizeText, splitName, type DropSide } from '@shared/drop'
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

type Sending = { name: string; size: number; device: string; thumb?: string }

const IMAGE = /\.(png|jpe?g|webp|gif|bmp)$/i

/**
 * Files from this computer to your phone: they're pulled into the light at
 * the screen's edge where the phone is, and the phone (listening on its
 * link) fetches them. The island shows how it's going.
 */
export class PhoneOut {
  private sending = new Map<string, Sending>()

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

  /** Send files; `from` is where on the screen they start (the pointer, when they were dragged). */
  async send(paths: string[], from?: { x: number; y: number }): Promise<void> {
    const phones = this.d.link.connected()
    const device = phones[0]?.device ?? 'your phone'
    const { side, at } = this.d.side()
    for (const path of paths.slice(0, 20)) {
      const st = await stat(path).catch(() => null)
      const name = basename(path)
      if (!st?.isFile()) continue
      const thumb = this.thumb(path)
      const id = this.d.link.offer(path, st.size, side, thumb)
      if (!id) {
        this.d.present(`out-none-${Date.now()}`, { title: 'No phone is listening', sub: name, phase: 'error', note: 'Open Island Drop on your phone (paired with this computer), then send it again.' })
        return
      }
      this.sending.set(id, { name, size: st.size, device, thumb })
      const start = this.d.overlay.toPage(from ?? screen.getCursorScreenPoint())
      this.d.overlay.send({ t: 'send', id, side, at, from: start, thumb, name, ext: splitName(name).ext, color: KIND_COLOR[dropKind(name)] })
      this.d.present(`out-${id}`, { title: `To ${device}`, sub: name, phase: 'working', progress: 0 })
    }
  }

  progress(id: string, got: number, size: number): void {
    const s = this.sending.get(id)
    if (s) this.d.present(`out-${id}`, { title: `To ${s.device}`, sub: s.name, phase: 'working', progress: size ? got / size : 1 })
  }

  delivered(id: string, ok: boolean, device: string): void {
    const s = this.sending.get(id)
    if (!s) return
    this.sending.delete(id)
    if (!ok) return this.d.present(`out-${id}`, { title: 'Didn’t reach your phone', sub: s.name, phase: 'error', note: `${device} couldn’t save it.` })
    this.d.present(`out-${id}`, {
      title: `Sent to ${device}`,
      sub: s.name,
      phase: 'done',
      note: `${sizeText(s.size)}, in Island Drop on your phone`,
    })
  }
}
