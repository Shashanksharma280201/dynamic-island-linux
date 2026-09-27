import { desktopCapturer, type BrowserWindow, type Display } from 'electron'

/** Region of a screen capture behind the window, in capture pixels. Pure. */
export function cropRect(
  win: { x: number; y: number; width: number; height: number },
  display: { x: number; y: number },
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.max(0, Math.round(win.x - display.x)),
    y: Math.max(0, Math.round(win.y - display.y)),
    width: Math.round(win.width),
    height: Math.round(win.height),
  }
}

/**
 * Frosted glass on desktops that can't blur behind windows (GNOME): while the
 * island is collapsed, take a small snapshot of the screen area behind its
 * column every few seconds and hand it to the renderer, which shows it
 * heavily blurred inside the island. Snapshots only live in memory. Never
 * taken while the island is expanded, so it doesn't capture itself.
 */
export class Backdrop {
  private timer: ReturnType<typeof setInterval> | null = null
  private settleTimer: ReturnType<typeof setTimeout> | null = null
  private busy = false
  private expanded = false

  constructor(
    private win: BrowserWindow,
    private display: () => Display,
    private enabled: () => boolean,
    private onImage: (dataUrl: string | null) => void,
    private everyMs = 4000,
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.capture(), this.everyMs)
    void this.capture()
  }

  /** The island grew or shrank; refresh shortly after it settles back. */
  setExpanded(expanded: boolean): void {
    if (expanded === this.expanded) return
    this.expanded = expanded
    if (this.settleTimer) clearTimeout(this.settleTimer)
    if (!expanded) this.settleTimer = setTimeout(() => void this.capture(), 600)
  }

  /** Setting changed: capture now, or clear the image. */
  refresh(): void {
    if (this.enabled()) void this.capture()
    else this.onImage(null)
  }

  private async capture(): Promise<void> {
    if (this.busy || this.expanded || !this.enabled() || this.win.isDestroyed()) return
    this.busy = true
    try {
      const d = this.display()
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: d.size.width, height: d.size.height },
      })
      const src = sources.find((s) => s.display_id === String(d.id)) ?? sources[0]
      if (!src || src.thumbnail.isEmpty() || this.expanded) return
      const b = this.win.getBounds()
      const img = src.thumbnail
        .crop(cropRect(b, d.bounds))
        .resize({ width: Math.max(1, Math.round(b.width / 2)), quality: 'good' })
      this.onImage(`data:image/jpeg;base64,${img.toJPEG(72).toString('base64')}`)
    } catch (e) {
      console.error('[island] backdrop capture failed:', (e as Error)?.message ?? e)
    } finally {
      this.busy = false
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.settleTimer) clearTimeout(this.settleTimer)
    this.timer = null
  }
}
