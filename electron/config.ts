import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export type Config = {
  /** Mirror desktop notifications on the island. */
  notifications: boolean
}

const DEFAULTS: Config = { notifications: true }

/** Merge a parsed file over defaults, ignoring unknown/mistyped keys. Pure. */
export function mergeConfig(raw: unknown): Config {
  const c = { ...DEFAULTS }
  if (raw && typeof raw === 'object' && typeof (raw as any).notifications === 'boolean') {
    c.notifications = (raw as any).notifications
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
    return { ...DEFAULTS }
  }
}

export function saveConfig(c: Config): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(file(), JSON.stringify(c, null, 2) + '\n')
  } catch (e) {
    console.error('config save failed:', e)
  }
}
