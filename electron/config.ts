import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { MailAccount, ServerConfig } from './providers/mail'
import { DEFAULT_DOCK, parseDock, type Dock } from '@shared/dock'

/** A mail account as saved: the password is encrypted (see secrets.ts). */
export type StoredMailAccount = MailAccount & { secret: string }

export type Config = {
  /** Mirror desktop notifications on the island. */
  notifications: boolean
  /** Run the built-in WhatsApp (linked device). */
  whatsapp: boolean
  mail: StoredMailAccount[]
  /** Which screen edge the island sits on, and where. */
  dock: Dock
}

const DEFAULTS: Config = { notifications: true, whatsapp: false, mail: [], dock: DEFAULT_DOCK }

function server(raw: any): ServerConfig | null {
  if (!raw || typeof raw.host !== 'string' || !raw.host) return null
  const port = Number(raw.port)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null
  return { host: raw.host, port, secure: raw.secure === true }
}

/** Validate one saved mail account. Pure. */
export function parseMailAccount(raw: any): StoredMailAccount | null {
  if (!raw || typeof raw !== 'object') return null
  const imap = server(raw.imap)
  const smtp = server(raw.smtp)
  if (typeof raw.id !== 'string' || typeof raw.user !== 'string' || !raw.user) return null
  if (!imap || !smtp || typeof raw.secret !== 'string') return null
  return {
    id: raw.id,
    label: typeof raw.label === 'string' && raw.label ? raw.label : raw.user,
    user: raw.user,
    name: typeof raw.name === 'string' && raw.name ? raw.name : undefined,
    imap,
    smtp,
    secret: raw.secret,
  }
}

/** Merge a parsed file over defaults, ignoring unknown/mistyped keys. Pure. */
export function mergeConfig(raw: unknown): Config {
  const c: Config = { ...DEFAULTS, mail: [], dock: { ...DEFAULT_DOCK } }
  if (!raw || typeof raw !== 'object') return c
  const r = raw as any
  if (r.dock) c.dock = parseDock(r.dock)
  if (typeof r.notifications === 'boolean') c.notifications = r.notifications
  if (typeof r.whatsapp === 'boolean') c.whatsapp = r.whatsapp
  if (Array.isArray(r.mail)) {
    c.mail = r.mail.map(parseMailAccount).filter((a: StoredMailAccount | null) => !!a)
  }
  return c
}

function file(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function loadConfig(): Config {
  try {
    return mergeConfig(JSON.parse(readFileSync(file(), 'utf8')))
  } catch {
    return mergeConfig(null)
  }
}

export function saveConfig(c: Config): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    // Write-then-rename so a crash never leaves a half-written file.
    const tmp = file() + '.tmp'
    writeFileSync(tmp, JSON.stringify(c, null, 2) + '\n', { mode: 0o600 })
    renameSync(tmp, file())
  } catch (e) {
    console.error('config save failed:', e)
  }
}
