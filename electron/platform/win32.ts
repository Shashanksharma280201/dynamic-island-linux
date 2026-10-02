import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { LoopStatus, MediaCmd, MediaState, SysCmd, SystemState } from '@shared/types'
import type { MediaSource, Platform, SystemSource } from './index'
import { electronCursor } from './electronCursor'
import { WIN_HELPER } from './winHelper'

/** What the helper says about the current media session. */
export type HelperMedia = {
  app?: string
  title?: string
  artist?: string
  art?: string
  status?: string
  length?: number
  position?: number
  canSeek?: boolean
  shuffle?: boolean | null
  repeat?: string | null
}

export type HelperSys = { volume: number | null; muted: boolean | null; brightness: number | null; wifi: boolean | null; bluetooth: boolean | null }

/** "Spotify.exe" or "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify" → "spotify". Pure. */
export function playerName(app: string | undefined): string | undefined {
  if (!app) return undefined
  const name = (app.includes('!') ? app.slice(app.lastIndexOf('!') + 1) : app).replace(/\.exe$/i, '').toLowerCase()
  return name.startsWith('spotify') ? 'spotify' : name || undefined
}

/** The island's media state from the helper's report. Pure. */
export function parseHelperMedia(m: HelperMedia | null | undefined, now = Date.now()): MediaState | null {
  if (!m || !m.status || m.status === 'Closed' || m.status === 'Stopped') return null
  if (!m.title && !m.artist) return null
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  const loop: LoopStatus | undefined = m.repeat === 'Track' ? 'Track' : m.repeat === 'List' ? 'Playlist' : m.repeat === 'None' ? 'None' : undefined
  const length = num(m.length)
  return {
    title: m.title ?? '',
    artist: m.artist ?? '',
    artUrl: m.art || undefined,
    playing: m.status === 'Playing',
    canControl: true,
    length: length && length > 0 ? length : undefined,
    position: num(m.position),
    positionAt: now,
    canSeek: !!m.canSeek,
    shuffle: typeof m.shuffle === 'boolean' ? m.shuffle : undefined,
    loop,
    player: playerName(m.app),
  }
}

/** The helper line for a media button. Pure. */
export function mediaLine(c: MediaCmd): string | null {
  if (c === 'playpause' || c === 'next' || c === 'previous' || c === 'shuffle' || c === 'loop') return `media ${c}`
  if (typeof c === 'object' && c.type === 'seek') return `media seek ${Math.max(0, c.position)}`
  return null
}

/** The helper line for a system control. Pure. */
export function sysLine(c: SysCmd): string {
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
  switch (c.type) {
    case 'volume':
      return `vol ${clamp(c.value)}`
    case 'brightness':
      return `bright ${clamp(c.value)}`
    case 'mute':
      return 'mute'
    case 'wifi':
      return `wifi ${c.value ? 'on' : 'off'}`
    case 'bluetooth':
      return `bt ${c.value ? 'on' : 'off'}`
  }
}

/**
 * One PowerShell process for the island's life, shared by media and the
 * system controls. Restarted (after a pause) if it exits.
 */
class Helper {
  private proc: ChildProcessWithoutNullStreams | null = null
  private sysWaiters: ((s: HelperSys | null) => void)[] = []
  private stopped = false
  onMedia: ((m: HelperMedia | null) => void) | null = null

  private script(): string {
    const file = join(tmpdir(), `dynamic-island-${createHash('sha1').update(WIN_HELPER).digest('hex').slice(0, 10)}.ps1`)
    writeFileSync(file, '﻿' + WIN_HELPER) // BOM: Windows PowerShell reads it as UTF-8
    return file
  }

  ensure(): void {
    if (this.proc || this.stopped) return
    let file: string
    try {
      file = this.script()
    } catch {
      return
    }
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true })
    this.proc = p
    p.on('error', () => {})
    p.stdin.on('error', () => {})
    createInterface({ input: p.stdout }).on('line', (line) => {
      let msg: any
      try {
        msg = JSON.parse(line)
      } catch {
        return
      }
      if ('media' in msg) this.onMedia?.(msg.media)
      if ('sys' in msg) this.sysWaiters.shift()?.(msg.sys)
    })
    p.on('exit', () => {
      this.proc = null
      for (const w of this.sysWaiters.splice(0)) w(null)
      if (!this.stopped) setTimeout(() => this.ensure(), 5000)
    })
  }

  send(line: string): void {
    this.ensure()
    this.proc?.stdin.write(line + '\n')
  }

  sys(): Promise<HelperSys | null> {
    this.ensure()
    if (!this.proc) return Promise.resolve(null)
    return new Promise((resolve) => {
      const done = (s: HelperSys | null) => {
        clearTimeout(t)
        resolve(s)
      }
      const t = setTimeout(() => {
        this.sysWaiters = this.sysWaiters.filter((w) => w !== done)
        resolve(null)
      }, 8000)
      this.sysWaiters.push(done)
      this.proc!.stdin.write('sys\n')
    })
  }

  stop(): void {
    this.stopped = true
    this.proc?.kill()
    this.proc = null
  }
}

class WinMedia implements MediaSource {
  private cb: ((s: MediaState | null) => void) | null = null
  constructor(private readonly helper: Helper) {}

  onChange(cb: (s: MediaState | null) => void): void {
    this.cb = cb
  }

  async start(): Promise<void> {
    this.helper.onMedia = (m) => this.cb?.(parseHelperMedia(m))
    this.helper.ensure()
  }

  async command(c: MediaCmd): Promise<void> {
    const line = mediaLine(c)
    if (line) this.helper.send(line)
  }

  // Spotify on Windows has no way to be told what to play; the island falls back to opening it.
  async openUri(): Promise<boolean> {
    return false
  }

  async stop(): Promise<void> {
    this.helper.stop()
  }
}

class WinSystem implements SystemSource {
  constructor(private readonly helper: Helper) {}

  async read(): Promise<SystemState> {
    const s = await this.helper.sys()
    return { volume: s?.volume ?? 0, muted: s?.muted ?? false, wifi: s?.wifi ?? null, bluetooth: s?.bluetooth ?? null, brightness: s?.brightness ?? null }
  }

  async apply(c: SysCmd): Promise<void> {
    this.helper.send(sysLine(c))
  }
}

/**
 * Windows: what's playing in any app that shows in Windows' media overlay
 * (Spotify, browsers, Media Player…), volume, laptop brightness, Wi-Fi and
 * Bluetooth, all through one PowerShell helper. Other apps' notifications
 * can't be read on Windows without a packaged app identity.
 */
export function win32(): Platform {
  const helper = new Helper()
  return {
    id: 'win32',
    media: () => new WinMedia(helper),
    system: () => new WinSystem(helper),
    notifications: false,
    readCursor: electronCursor,
    cursorPhysical: false,
  }
}
