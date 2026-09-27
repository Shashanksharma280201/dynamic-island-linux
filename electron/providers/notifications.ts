import dbus from 'dbus-next'
import { access, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { extname, join } from 'node:path'
import { homedir } from 'node:os'
import type { NotificationData, Urgency } from '@shared/types'

const { Message } = dbus as any

const URGENCY: Urgency[] = ['low', 'normal', 'critical']

/** Parse the args of a `org.freedesktop.Notifications.Notify` call. Pure. */
export function parseNotify(body: any[]): NotificationData {
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const app = str(body?.[0])
  const hints = body?.[6] && typeof body[6] === 'object' ? body[6] : {}
  const hint = (k: string) => hints[k]?.value ?? hints[k]
  const icon = str(body?.[2]) || str(hint('image-path')) || str(hint('image_path'))
  const u = Number(hint('urgency'))
  const n: NotificationData = { app, summary: str(body?.[3]), body: str(body?.[4]) }
  if (icon) n.icon = icon
  if (Number.isInteger(u) && URGENCY[u]) n.urgency = URGENCY[u]
  return n
}

/** How to trigger a GNotification button: `ActivateAction` on the app. */
export type GtkButton = { label: string; action: string; target?: unknown }
export type GtkInvoke = { appId: string; buttons: GtkButton[]; defaultAction?: GtkButton }

const unwrap = (v: any) => (v && typeof v === 'object' && 'value' in v ? v.value : v)

/**
 * Parse `org.gtk.Notifications.AddNotification(app_id, id, a{sv})`, the API
 * GNOME apps (GApplication) use. Only `app.` actions can be triggered. Pure.
 */
export function parseGtkNotification(
  body: any[],
): { n: NotificationData; invoke: GtkInvoke } | null {
  const appId = typeof body?.[0] === 'string' ? body[0] : ''
  const d = body?.[2]
  if (!appId || !d || typeof d !== 'object') return null
  const str = (k: string) => {
    const v = unwrap(d[k])
    return typeof v === 'string' ? v : ''
  }
  const button = (raw: any): GtkButton | null => {
    const label = unwrap(raw?.label)
    const action = unwrap(raw?.action)
    if (typeof action !== 'string' || !action.startsWith('app.')) return null
    return { label: typeof label === 'string' ? label : action, action, target: raw?.target }
  }
  const rawButtons = unwrap(d.buttons)
  const buttons = (Array.isArray(rawButtons) ? rawButtons : [])
    .map(button)
    .filter((b): b is GtkButton => !!b)
  const def = str('default-action')
  const n: NotificationData = {
    app: appId.split('.').pop() || appId,
    summary: str('title'),
    body: str('body'),
  }
  const priority = str('priority')
  if (priority === 'urgent' || priority === 'high') n.urgency = 'critical'
  else if (priority === 'low') n.urgency = 'low'
  if (buttons.length) n.actions = buttons.map((b, i) => ({ key: String(i), label: b.label }))
  const invoke: GtkInvoke = { appId, buttons }
  if (def.startsWith('app.')) invoke.defaultAction = { label: 'Open', action: def, target: d['default-action-target'] }
  return { n, invoke }
}

/** Object path GApplication exports for an app id. Pure. */
export function appObjectPath(appId: string): string {
  return '/' + appId.replace(/\./g, '/').replace(/-/g, '_')
}

/** Triggers GNotification buttons, as GNOME Shell does. */
export class GtkActionInvoker {
  private bus = dbus.sessionBus()

  constructor() {
    this.bus.on('error', (e) => console.error('action bus:', e?.message ?? e))
  }

  async invoke(appId: string, b: GtkButton): Promise<void> {
    const obj = await this.bus.getProxyObject(appId, appObjectPath(appId))
    const app = obj.getInterface('org.freedesktop.Application')
    const params = b.target === undefined ? [] : [b.target]
    await app.ActivateAction(b.action.slice('app.'.length), params, {})
  }

  stop(): void {
    this.bus.disconnect()
  }
}

/** Dedup key (same notification is seen once per notification daemon). */
export function notifKey(n: NotificationData): string {
  return `${n.app}|${n.summary}|${n.body}`
}

/** How long a notification stays on the island. Pure. */
export function displayMs(n: NotificationData): number {
  if (n.urgency === 'critical') return 10000
  if (n.urgency === 'low') return 3000
  return 5000
}

/**
 * Drops repeats of the same notification seen within `windowMs` (the same
 * Notify call can be observed more than once). Bounded: old keys are pruned.
 */
export class Deduper {
  private seen = new Map<string, number>()
  constructor(
    private windowMs = 1500,
    private now: () => number = Date.now,
  ) {}

  accept(key: string): boolean {
    const t = this.now()
    for (const [k, at] of this.seen) if (t - at >= this.windowMs) this.seen.delete(k)
    if (this.seen.has(key)) return false
    this.seen.set(key, t)
    return true
  }

  get size(): number {
    return this.seen.size
  }
}

const ICON_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.xpm': '',
}

/** Candidate files for a freedesktop icon name or path. Pure. */
export function iconCandidates(icon: string, home = homedir()): string[] {
  if (icon.startsWith('file://')) return [fileURLToPath(icon)]
  if (icon.startsWith('/')) return [icon]
  if (/[/\\]/.test(icon)) return []
  const bases = [
    join(home, '.local/share/icons/hicolor'),
    '/usr/share/icons/hicolor',
    '/var/lib/flatpak/exports/share/icons/hicolor',
    '/var/lib/snapd/desktop/icons',
  ]
  const out: string[] = []
  for (const b of bases) {
    for (const size of ['48x48', '64x64', '128x128', '256x256', 'scalable']) {
      const ext = size === 'scalable' ? '.svg' : '.png'
      out.push(join(b, size, 'apps', icon + ext))
    }
  }
  out.push(join('/usr/share/pixmaps', icon + '.png'), join('/usr/share/pixmaps', icon + '.svg'))
  return out
}

const iconCache = new Map<string, string | null>()

/** Resolve an icon name/path to a data URL the renderer can show, or undefined. */
export async function resolveIcon(icon: string | undefined): Promise<string | undefined> {
  if (!icon) return undefined
  if (icon.startsWith('data:') || icon.startsWith('http')) return icon
  if (iconCache.has(icon)) return iconCache.get(icon) ?? undefined
  let found: string | null = null
  for (const path of iconCandidates(icon)) {
    const mime = ICON_MIME[extname(path).toLowerCase()]
    if (!mime) continue
    try {
      await access(path)
      const buf = await readFile(path)
      if (buf.length > 1024 * 1024) continue
      found = `data:${mime};base64,${buf.toString('base64')}`
      break
    } catch {
      // try next candidate
    }
  }
  if (iconCache.size > 200) iconCache.clear()
  iconCache.set(icon, found)
  return found ?? undefined
}

/**
 * Becomes a D-Bus monitor and emits every desktop notification
 * (org.freedesktop.Notifications Notify call), deduped.
 */
export class NotificationMonitor {
  private bus = dbus.sessionBus()
  private cb: ((n: NotificationData, invoke?: GtkInvoke) => void) | null = null
  private dedupe = new Deduper()

  constructor() {
    this.bus.on('error', (e) => console.error('notifications bus:', e?.message ?? e))
  }

  onNotify(cb: (n: NotificationData, invoke?: GtkInvoke) => void): void {
    this.cb = cb
  }

  async start(): Promise<void> {
    await this.bus.call(
      new Message({
        destination: 'org.freedesktop.DBus',
        path: '/org/freedesktop/DBus',
        interface: 'org.freedesktop.DBus.Monitoring',
        member: 'BecomeMonitor',
        signature: 'asu',
        body: [
          [
            "type='method_call',interface='org.freedesktop.Notifications',member='Notify'",
            "type='method_call',interface='org.gtk.Notifications',member='AddNotification'",
          ],
          0,
        ],
      }),
    )
    // A monitor must never send anything, or the bus daemon disconnects it.
    // dbus-next would otherwise answer each observed Notify call with an
    // UnknownMethod error, so claim every method call as handled.
    this.bus.addMethodHandler(() => true)
    ;(this.bus as any).on('message', (msg: any) => {
      if (!Array.isArray(msg?.body)) return
      let n: NotificationData
      let invoke: GtkInvoke | undefined
      if (msg.member === 'Notify') {
        n = parseNotify(msg.body)
      } else if (msg.member === 'AddNotification') {
        const g = parseGtkNotification(msg.body)
        if (!g) return
        n = g.n
        invoke = g.invoke
      } else return
      if (!n.summary && !n.body) return
      if (!this.dedupe.accept(notifKey(n))) return
      resolveIcon(n.icon)
        .then((icon) => this.cb?.({ ...n, icon }, invoke))
        .catch(() => this.cb?.({ ...n, icon: undefined }, invoke))
    })
  }

  async stop(): Promise<void> {
    this.bus.disconnect()
  }
}
