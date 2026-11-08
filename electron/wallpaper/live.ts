import { BrowserWindow, powerMonitor, screen, type Display } from 'electron'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// @ts-expect-error - x11 ships no types
import x11 from 'x11'
import type { WallItem } from '@shared/wallpaper'
import { frontWindow } from '../terminal'

const here = dirname(fileURLToPath(import.meta.url))

/** Does a window cover most of a display? Pure. */
export function covers(win: { x: number; y: number; width: number; height: number }, d: { x: number; y: number; width: number; height: number }): boolean {
  const w = Math.max(0, Math.min(win.x + win.width, d.x + d.width) - Math.max(win.x, d.x))
  const h = Math.max(0, Math.min(win.y + win.height, d.y + d.height) - Math.max(win.y, d.y))
  return w * h >= d.width * d.height * 0.9
}

/** The live page's address for an item: its video, picture or animation. Pure. */
export function liveQuery(item: WallItem, mediaUrl: string): Record<string, string> {
  if (item.kind === 'animation') return { anim: item.url }
  return { kind: item.kind, src: mediaUrl }
}

/** Put an X11 window at the bottom of its layer (under desktop icons). Best effort. */
function lower(xid: number): void {
  if (!xid || process.platform !== 'linux' || !process.env.DISPLAY) return
  try {
    x11.createClient((err: unknown, d: any) => {
      if (err || !d) return
      const X = d.client
      X.on('error', () => {})
      try {
        X.LowerWindow(xid)
      } catch {
        // not ours to move
      }
      setTimeout(() => X.terminate(), 200)
    })
  } catch {
    // no X server
  }
}

export type LiveDeps = {
  /** Should it rest now (settings)? */
  pauseCovered: () => boolean
  pauseBattery: () => boolean
  onState?: () => void
}

/**
 * A video or animation playing as the desktop background: a borderless
 * desktop-type window under everything on each screen, letting clicks through.
 * It rests (no decoding, no drawing) while a window covers the screen or the
 * computer runs on battery.
 */
export class LiveWallpaper {
  private wins: BrowserWindow[] = []
  /** Each window's screen, and whether it rests. */
  private screens: { bounds: Display['bounds']; resting: boolean }[] = []
  private timer: NodeJS.Timeout | null = null
  private item: WallItem | null = null

  constructor(private readonly d: LiveDeps) {}

  state(): 'playing' | 'resting' | 'off' {
    return !this.wins.length ? 'off' : this.screens.every((x) => x.resting) ? 'resting' : 'playing'
  }

  playing(): WallItem | null {
    return this.wins.length ? this.item : null
  }

  /** Play an item on every screen (replacing what plays). */
  async show(item: WallItem, mediaUrl: string): Promise<void> {
    this.stop()
    this.item = item
    const query = liveQuery(item, mediaUrl)
    const displays = screen.getAllDisplays()
    this.wins = displays.map((d) => this.open(d, query))
    this.screens = displays.map((d) => ({ bounds: d.bounds, resting: false }))
    await Promise.all(this.wins.map((w) => new Promise<void>((r) => (w.isVisible() ? r() : w.once('show', () => r())))))
    this.timer = setInterval(() => void this.check(), 3000)
    this.timer.unref?.()
    void this.check()
    this.d.onState?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const w of this.wins) if (!w.isDestroyed()) w.destroy()
    this.wins = []
    this.screens = []
    this.item = null
    this.d.onState?.()
  }

  /** A still of the first screen (to leave as the background when it stops). */
  async still(): Promise<Buffer | null> {
    const w = this.wins[0]
    if (!w || w.isDestroyed()) return null
    try {
      const img = await w.webContents.capturePage()
      return img.isEmpty() ? null : img.toPNG()
    } catch {
      return null
    }
  }

  private open(d: Display, query: Record<string, string>): BrowserWindow {
    const win = new BrowserWindow({
      ...d.bounds,
      type: 'desktop',
      frame: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      enableLargerThanScreen: true,
      backgroundColor: '#000000',
      title: 'Wallpaper',
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false },
    })
    win.setIgnoreMouseEvents(true)
    win.setVisibleOnAllWorkspaces(true)
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.once('ready-to-show', () => {
      win.showInactive()
      win.setBounds(d.bounds)
      const h = win.getNativeWindowHandle()
      lower(h.length >= 4 ? h.readUInt32LE(0) : 0)
    })
    if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/wallpaper.html?${new URLSearchParams(query)}`)
    else void win.loadFile(resolve(here, '../renderer/wallpaper.html'), { query })
    return win
  }

  /** Each screen rests while a window covers it (or on battery), and plays otherwise. */
  private async check(): Promise<void> {
    if (!this.wins.length) return
    const battery = this.d.pauseBattery() && powerMonitor.isOnBatteryPower()
    let front: Awaited<ReturnType<typeof frontWindow>> = null
    if (!battery && this.d.pauseCovered()) {
      front = await frontWindow().catch(() => null)
      const own = new Set(this.wins.map((w) => (w.isDestroyed() ? 0 : w.getNativeWindowHandle().readUInt32LE(0))))
      if (front && own.has(front.xid)) front = null
    }
    let changed = false
    for (const [i, w] of this.wins.entries()) {
      const s = this.screens[i]
      if (!s || w.isDestroyed()) continue
      const rest = battery || (!!front && covers(front.rect, s.bounds))
      if (rest === s.resting) continue
      s.resting = rest
      changed = true
      void w.webContents.executeJavaScript(`window.rest && window.rest(${rest})`).catch(() => {})
    }
    if (changed) this.d.onState?.()
  }
}
