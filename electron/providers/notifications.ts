import dbus from 'dbus-next'
import type { NotificationData } from '@shared/types'

const { Message } = dbus as any

/** Parse the args of a `org.freedesktop.Notifications.Notify` call. Pure. */
export function parseNotify(body: any[]): NotificationData {
  const app = (body?.[0] as string) || ''
  const icon = (body?.[2] as string) || ''
  const summary = (body?.[3] as string) || ''
  const text = (body?.[4] as string) || ''
  return { app, summary, body: text, icon: icon || undefined }
}

/** Dedup key (same notification is seen once per notification daemon). */
export function notifKey(n: NotificationData): string {
  return `${n.app}|${n.summary}|${n.body}`
}

/**
 * Becomes a D-Bus monitor and emits every desktop notification
 * (org.freedesktop.Notifications Notify call), deduped across daemons.
 */
export class NotificationMonitor {
  private bus = dbus.sessionBus()
  private cb: ((n: NotificationData) => void) | null = null
  private recent = new Map<string, number>()
  private seq = 0

  onNotify(cb: (n: NotificationData) => void): void {
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
        body: [["interface='org.freedesktop.Notifications',member='Notify'"], 0],
      }),
    )
    ;(this.bus as any).on('message', (msg: any) => {
      if (msg?.member !== 'Notify' || !Array.isArray(msg.body)) return
      const n = parseNotify(msg.body)
      if (!n.summary && !n.body) return
      const key = notifKey(n)
      const now = this.seq++
      const last = this.recent.get(key)
      // dedupe identical notifications seen within a short window (~5 ticks)
      if (last !== undefined && now - last < 5) return
      this.recent.set(key, now)
      this.cb?.(n)
    })
  }

  async stop(): Promise<void> {
    this.bus.disconnect()
  }
}
