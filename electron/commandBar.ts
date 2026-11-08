import { BrowserWindow, ipcMain, screen } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { iconUrl } from './icons'
import { COMMAND } from './commandChannels'
import { calc, cleanExec, matchScore, parseDesktopEntry, parseRecent, systemCommand, type CommandItem, type DesktopApp, type SystemAction } from '@shared/command'

const here = dirname(fileURLToPath(import.meta.url))


/** Where .desktop files live on Ubuntu (apt, snap, flatpak, your own). */
export function appDirs(home: string): string[] {
  return [
    '/usr/share/applications',
    '/usr/local/share/applications',
    '/var/lib/snapd/desktop/applications',
    '/var/lib/flatpak/exports/share/applications',
    join(home, '.local/share/flatpak/exports/share/applications'),
    join(home, '.local/share/applications'),
  ]
}

export type CommandDeps = {
  home: string
  /** Notes from the brain matching the words (keyword search; none when it's off). */
  notes: (q: string) => { path: string; title: string; sub: string }[]
  openNote: (path: string) => void
  openFile: (path: string) => void
  openSettings: (section: string) => void
  copy: (text: string) => void
  system: (a: SystemAction) => void
  /** Ask the buddy (it answers out loud), or the assistant. */
  askBuddy: (q: string) => void
  askClaude: (q: string) => void
  buddyName: () => string
  /** The Agency's agents matching the words (none until it's downloaded); choosing one starts it in Claude. */
  agents?: (q: string) => { id: string; name: string; emoji: string; vibe: string }[]
  startAgent?: (id: string) => void
  /** Tests: where apps are, and how to start one. */
  dirs?: string[]
  launch?: (app: DesktopApp) => void
}

const SECTIONS = [
  ['you', 'You'],
  ['brain', 'Second brain'],
  ['sources', 'Sources'],
  ['model', 'Model'],
  ['buddy', 'Buddy'],
  ['wallpaper', 'Wallpaper'],
  ['character', 'Character'],
  ['ai', 'AI'],
  ['packages', 'Packages'],
  ['general', 'General'],
  ['privacy', 'Privacy'],
  ['shortcuts', 'Keyboard shortcuts'],
  ['drag', 'Drag actions'],
  ['drop', 'Phone Drop'],
  ['claude', 'Claude Code'],
  ['services', 'Services'],
  ['whatsapp', 'WhatsApp'],
  ['mail', 'Mail'],
] as const

/**
 * The command bar: a small window over the screen you're on, like
 * Spotlight. Apps, files you opened lately, notes, settings, sums, system
 * changes ("dark mode", "volume 40"), and asking the buddy or the assistant.
 */
export class CommandBar {
  private win: BrowserWindow | null = null
  private apps: DesktopApp[] = []
  private appsAt = 0
  private items = new Map<string, () => void>()

  constructor(private d: CommandDeps) {
    ipcMain.handle(COMMAND.QUERY, (e, q) => (this.mine(e) && typeof q === 'string' ? this.search(q) : []))
    ipcMain.handle(COMMAND.RUN, (e, id) => {
      if (!this.mine(e) || typeof id !== 'string') return
      const run = this.items.get(id)
      this.hide()
      run?.()
    })
    ipcMain.handle(COMMAND.CLOSE, (e) => this.mine(e) && this.hide())
  }

  private mine(e: Electron.IpcMainInvokeEvent): boolean {
    return !!this.win && e.sender === this.win.webContents
  }

  /** Every app with a .desktop entry (read again every ten minutes). */
  listApps(): DesktopApp[] {
    if (this.apps.length && Date.now() - this.appsAt < 10 * 60_000) return this.apps
    const byId = new Map<string, DesktopApp>()
    const lang = (process.env.LANG ?? 'en').split('.')[0]
    for (const dir of this.d.dirs ?? appDirs(this.d.home)) {
      let names: string[] = []
      try {
        names = readdirSync(dir).filter((n) => n.endsWith('.desktop'))
      } catch {
        continue
      }
      for (const n of names) {
        try {
          const app = parseDesktopEntry(n, readFileSync(join(dir, n), 'utf8'), lang)
          // Later folders (your own) win over the system's.
          if (app) byId.set(n, app)
          else byId.delete(n)
        } catch {
          // unreadable
        }
      }
    }
    this.apps = [...byId.values()]
    this.appsAt = Date.now()
    return this.apps
  }

  /** Start an app as the desktop would. */
  launchApp(app: DesktopApp): void {
    this.launch(app)
  }

  private launch(app: DesktopApp): void {
    if (this.d.launch) return this.d.launch(app)
    const id = app.id.replace(/\.desktop$/, '')
    // gtk-launch starts it as the desktop would (its own environment, startup notification).
    execFile('gtk-launch', [id], (err) => {
      if (!err) return
      const [cmd, ...args] = cleanExec(app.exec)
      if (cmd) spawn(cmd, args, { detached: true, stdio: 'ignore', cwd: this.d.home }).on('error', () => {}).unref()
    })
  }

  private recent(): { path: string; at: number }[] {
    try {
      return parseRecent(readFileSync(join(this.d.home, '.local/share/recently-used.xbel'), 'utf8')).filter((r) => existsSync(r.path))
    } catch {
      return []
    }
  }

  /** What matches the words, best first. */
  search(text: string): CommandItem[] {
    this.items.clear()
    const q = text.trim()
    const out: { item: CommandItem; score: number; run: () => void }[] = []
    const add = (item: Omit<CommandItem, 'id'>, score: number, run: () => void) => out.push({ item: { ...item, id: `${item.kind}:${out.length}` }, score, run })
    if (!q) return []
    const sum = calc(q)
    if (sum !== null) add({ kind: 'calc', title: `= ${sum.toLocaleString()}`, sub: 'Copy the answer' }, 1000, () => this.d.copy(String(sum)))
    const sys = systemCommand(q)
    if (sys) add({ kind: 'system', title: sys.title, sub: 'System' }, 900, () => this.d.system(sys.action))
    for (const app of this.listApps()) {
      const s = matchScore(q, app.name, [...app.keywords, app.id.replace(/\.desktop$/, '')])
      if (s) add({ kind: 'app', title: app.name, sub: app.comment || 'Application', icon: app.icon }, 300 + s, () => this.launch(app))
    }
    for (const [id, label] of SECTIONS) {
      const s = matchScore(q, label)
      if (s) add({ kind: 'setting', title: label, sub: 'Settings' }, 200 + s, () => this.d.openSettings(id))
    }
    for (const r of this.recent().slice(0, 300)) {
      const s = matchScore(q, basename(r.path))
      if (s) add({ kind: 'file', title: basename(r.path), sub: r.path.replace(this.d.home, '~'), icon: 'file' }, 150 + s, () => this.d.openFile(r.path))
    }
    for (const a of this.d.agents?.(q).slice(0, 4) ?? []) {
      const s = matchScore(q, a.name)
      if (s) add({ kind: 'agent', title: `${a.emoji} ${a.name}`, sub: `The Agency · ${a.vibe || 'start it in Claude'}` }, 110 + s, () => this.d.startAgent?.(a.id))
    }
    for (const [i, n] of this.d.notes(q).slice(0, 5).entries()) add({ kind: 'note', title: n.title, sub: n.sub || n.path }, 120 - i, () => this.d.openNote(n.path))
    const name = this.d.buddyName()
    add({ kind: 'ask', title: `Ask ${name}: “${q}”`, sub: 'It answers out loud, looking at your screen' }, 50, () => this.d.askBuddy(q))
    add({ kind: 'ask', title: `Ask Claude: “${q}”`, sub: 'In the island’s Claude tab' }, 40, () => this.d.askClaude(q))
    const top = out.sort((a, b) => b.score - a.score).slice(0, 9)
    for (const o of top) {
      this.items.set(o.item.id, o.run)
      if (o.item.kind === 'app') o.item.icon = (o.item.icon && iconUrl(o.item.icon, this.d.home)) || undefined
    }
    return top.map((o) => o.item)
  }

  toggle(): void {
    if (this.win?.isVisible()) this.hide()
    else this.show()
  }

  show(): void {
    const win = this.ensure()
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const w = 640
    win.setBounds({ x: Math.round(d.workArea.x + (d.workArea.width - w) / 2), y: Math.round(d.workArea.y + d.workArea.height * 0.22), width: w, height: 440 })
    win.show()
    win.focus()
    win.webContents.send(COMMAND.SHOWN)
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) this.win.hide()
  }

  visible(): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.isVisible()
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }

  private ensure(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    const win = new BrowserWindow({
      width: 640,
      height: 440,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      title: 'Command bar',
      webPreferences: { preload: resolve(here, '../preload/preload.mjs'), sandbox: false, contextIsolation: true, nodeIntegration: false },
    })
    win.setAlwaysOnTop(true, 'pop-up-menu')
    win.setVisibleOnAllWorkspaces(true)
    win.on('blur', () => this.hide())
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.on('closed', () => (this.win = null))
    if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/command.html`)
    else void win.loadFile(resolve(here, '../renderer/command.html'))
    this.win = win
    return win
  }
}

export const homeDir = () => process.env.DI_HOME || homedir()
