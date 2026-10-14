import { ipcMain } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  addEntry,
  dismissEntry,
  markSeen,
  parseEntries,
  restoreEntries,
  unseenCount,
  type CenterEntry,
  type CenterView,
} from '@shared/notifCenter'
import { NOTIFS } from './notifChannels'

export { NOTIFS }

/**
 * Keeps the notification center's list (saved in a file so it survives a
 * restart) and the last batch cleared, for Undo.
 */
export class NotificationCenter {
  private entries: CenterEntry[] = []
  private cleared: CenterEntry[] = []
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private cbs: Array<() => void> = []

  constructor(
    private file: string,
    private dnd: () => boolean,
  ) {
    try {
      this.entries = parseEntries(JSON.parse(readFileSync(file, 'utf8')))
    } catch {
      // first run, or an unreadable file: start empty
    }
  }

  onChange(cb: () => void): void {
    this.cbs.push(cb)
  }

  view(): CenterView {
    return { entries: this.entries, unseen: unseenCount(this.entries), dnd: this.dnd() }
  }

  get(id: string): CenterEntry | undefined {
    return this.entries.find((e) => e.id === id)
  }

  add(e: Parameters<typeof addEntry>[1]): void {
    this.entries = addEntry(this.entries, e)
    this.changed()
  }

  dismiss(id: string): void {
    const next = dismissEntry(this.entries, id)
    if (next.length === this.entries.length) return
    this.entries = next
    this.changed()
  }

  /** Clears the list; returns how many were cleared (Undo brings them back). */
  clearAll(): number {
    if (this.entries.length === 0) return 0
    this.cleared = this.entries
    this.entries = []
    this.changed()
    return this.cleared.length
  }

  undo(): void {
    if (this.cleared.length === 0) return
    this.entries = restoreEntries(this.entries, this.cleared)
    this.cleared = []
    this.changed()
  }

  markSeen(): void {
    const next = markSeen(this.entries)
    if (next === this.entries) return
    this.entries = next
    this.changed()
  }

  /** Something outside the list changed (Do Not Disturb). */
  changed(): void {
    this.scheduleSave()
    for (const cb of this.cbs) cb()
  }

  /** Write now (on quit). */
  flush(): void {
    if (!this.saveTimer) return
    clearTimeout(this.saveTimer)
    this.saveTimer = null
    this.write()
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.write()
    }, 400)
  }

  private write(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.entries), { mode: 0o600 })
      renameSync(tmp, this.file)
    } catch (e) {
      console.error('notification center:', e)
    }
  }
}

export type CenterActions = {
  /** Dismiss the island's notification and message cards too. */
  clearCards: () => void
  setDnd: (on: boolean) => void
}

export function wireNotificationCenter(center: NotificationCenter, a: CenterActions): void {
  const id = (v: unknown): string => {
    if (typeof v !== 'string' || !v || v.length > 300) throw new Error('Invalid notification')
    return v
  }
  ipcMain.handle(NOTIFS.VIEW, () => center.view())
  ipcMain.handle(NOTIFS.DISMISS, (_e, v) => center.dismiss(id(v)))
  ipcMain.handle(NOTIFS.CLEAR_ALL, () => {
    a.clearCards()
    return center.clearAll()
  })
  ipcMain.handle(NOTIFS.UNDO, () => center.undo())
  ipcMain.handle(NOTIFS.SEEN, () => center.markSeen())
  ipcMain.handle(NOTIFS.SET_DND, (_e, on) => a.setDnd(on === true))
}
