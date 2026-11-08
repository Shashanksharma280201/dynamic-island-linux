import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { EgressEntry, PrivacyView } from '../shared/privacy'

/** What a feature says when you've paused everything. */
export const PAUSED = 'Paused in Settings › Privacy.'

const KEEP = 400
const DAY = 24 * 60 * 60_000
const MAX_AGE = 30 * DAY

/** Is this address on this computer (Ollama, a local server)? Pure. */
export function isLocal(host: string): boolean {
  const v6 = host.match(/^\[([^\]]+)\](?::\d+)?$/)
  const h = (v6 ? v6[1] : host.replace(/:\d+$/, '')).toLowerCase()
  return h === 'localhost' || h === '::1' || h.startsWith('127.') || h === '0.0.0.0' || h.endsWith('.localhost')
}

/** The host of a URL, or the text itself when it isn't one. Pure. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

/**
 * Adds one send to the log: the same feature, place and what on the same day
 * count up instead of adding a row. Newest first, at most KEEP rows, none
 * older than 30 days. Pure.
 */
export function addEntry(list: EgressEntry[], e: Omit<EgressEntry, 'count' | 'first'>): EgressEntry[] {
  const same = list.findIndex((x) => x.feature === e.feature && x.to === e.to && x.what === e.what && new Date(x.at).toDateString() === new Date(e.at).toDateString())
  const fresh = list.filter((x) => e.at - x.at < MAX_AGE)
  if (same >= 0) {
    const old = list[same]
    const rest = fresh.filter((x) => x !== old)
    return [{ ...old, at: e.at, count: old.count + 1 }, ...rest].slice(0, KEEP)
  }
  return [{ ...e, first: e.at, count: 1 }, ...fresh].slice(0, KEEP)
}

/** Each place things went, with how many sends and when the last was, busiest first. Pure. */
export function places(list: EgressEntry[]): PrivacyView['places'] {
  const by = new Map<string, { to: string; count: number; last: number; features: Set<string> }>()
  for (const e of list) {
    const p = by.get(e.to) ?? { to: e.to, count: 0, last: 0, features: new Set<string>() }
    p.count += e.count
    p.last = Math.max(p.last, e.at)
    p.features.add(e.feature)
    by.set(e.to, p)
  }
  return [...by.values()].map((p) => ({ to: p.to, count: p.count, last: p.last, features: [...p.features] })).sort((a, b) => b.last - a.last)
}

/**
 * What the island sends off this computer, and the switch that stops it.
 * One for the whole app: features note each send (to an AI, a photo site, a
 * service) and ask first whether they may. Sends to this computer (Ollama)
 * aren't sending anything away, so they're neither logged nor paused.
 */
export class Egress {
  private file = ''
  private list: EgressEntry[] = []
  private paused: () => boolean = () => false
  private changed: () => void = () => {}
  private saveTimer: NodeJS.Timeout | null = null
  private now: () => number = Date.now
  // The tests' stand-in sites run on this computer; count them as away.
  private countLocal = process.env.DI_EGRESS_COUNT_LOCAL === '1'

  init(o: { file: string; paused: () => boolean; onChange: () => void; now?: () => number }): void {
    this.file = o.file
    this.paused = o.paused
    this.changed = o.onChange
    if (o.now) this.now = o.now
    try {
      const raw = JSON.parse(readFileSync(o.file, 'utf8'))
      if (Array.isArray(raw)) this.list = raw.filter((e) => e && typeof e.to === 'string' && typeof e.at === 'number')
    } catch {
      this.list = []
    }
  }

  /** Why a send can't go now (everything's paused), or null. */
  blocked(host?: string): string | null {
    if (host && isLocal(host) && !this.countLocal) return null
    return this.paused() ? PAUSED : null
  }

  /** Notes one send: which feature, where to (a host or a name), and what went. */
  note(feature: string, to: string, what: string): void {
    if (isLocal(to.split(' ')[0]) && !this.countLocal) return
    this.list = addEntry(this.list, { feature, to, what, at: this.now() })
    this.changed()
    this.saveSoon()
  }

  view(): PrivacyView {
    return { paused: this.paused(), recent: this.list.slice(0, 60), places: places(this.list), total: this.list.reduce((n, e) => n + e.count, 0) }
  }

  clear(): void {
    this.list = []
    this.changed()
    this.saveSoon()
  }

  private saveSoon(): void {
    if (!this.file || this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      try {
        mkdirSync(dirname(this.file), { recursive: true })
        writeFileSync(this.file, JSON.stringify(this.list))
      } catch (e) {
        console.error('[privacy] couldn’t save the log:', (e as Error).message)
      }
    }, 1000)
    this.saveTimer.unref?.()
  }
}

/** The app's one log. */
export const egress = new Egress()
