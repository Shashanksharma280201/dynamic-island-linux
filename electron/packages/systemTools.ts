import { matchScore, type DesktopApp } from '@shared/command'
import { schema, str, type AgentTool } from '../agent/tools'

/** What the System package reaches: your apps, the sound, light or dark, Do Not Disturb, the lock. */
export type SystemContext = {
  apps: () => DesktopApp[]
  launch: (app: DesktopApp) => void
  volume: (v: number) => void
  mute: () => void
  theme: (t: 'light' | 'dark') => void
  dnd: (on: boolean) => void
  lock: () => void
}

/** The best app for a name ("firefox", "files", "vs code"), or null. Pure. */
export function findApp(apps: DesktopApp[], name: string): DesktopApp | null {
  let best: { app: DesktopApp; s: number } | null = null
  for (const app of apps) {
    const s = matchScore(name, app.name, [...app.keywords, app.id.replace(/\.desktop$/, '')])
    if (s && (!best || s > best.s)) best = { app, s }
  }
  return best?.app ?? null
}

/**
 * The System package: the assistant (and the buddy, through it) can open an
 * app, change the volume, go light or dark, turn on Do Not Disturb or lock
 * the screen. Each one asks you first, on the island.
 */
export function systemTools(ctx: SystemContext): AgentTool[] {
  const ask = (title: string, body = '') => async () => ({ title, body })
  return [
    {
      name: 'system_open_app',
      description: 'Open an app on the user’s computer by its name (Firefox, Files, Terminal, Settings, VS Code…).',
      input_schema: schema({ name: { type: 'string', description: 'The app’s name, e.g. "Firefox"' } }, ['name']),
      label: (i) => `Opening ${str(i.name)}`,
      asks: async (i) => {
        const app = findApp(ctx.apps(), str(i.name))
        return { title: `Open ${app?.name ?? str(i.name)}?`, body: app?.comment ?? '' }
      },
      run: async (i) => {
        const app = findApp(ctx.apps(), str(i.name))
        if (!app) return `No app called “${str(i.name)}” is installed.`
        ctx.launch(app)
        return `Opened ${app.name}.`
      },
    },
    {
      name: 'system_volume',
      description: 'Set the sound volume (0 to 100), or mute and unmute.',
      input_schema: schema({ level: { type: 'number', description: '0 to 100' }, mute: { type: 'boolean', description: 'true to mute or unmute instead' } }),
      label: (i) => (i.mute ? 'Muting' : `Volume ${Number(i.level)}%`),
      asks: async (i) => ({ title: i.mute ? 'Mute or unmute the sound?' : `Set the volume to ${Math.round(Number(i.level))}%?`, body: '' }),
      run: async (i) => {
        if (i.mute) {
          ctx.mute()
          return 'Toggled mute.'
        }
        const v = Math.round(Number(i.level))
        if (!Number.isFinite(v)) return 'Give a level from 0 to 100.'
        ctx.volume(Math.min(100, Math.max(0, v)))
        return `Volume ${Math.min(100, Math.max(0, v))}%.`
      },
    },
    {
      name: 'system_theme',
      description: 'Switch the computer (and the island) to light or dark.',
      input_schema: schema({ theme: { type: 'string', description: '"light" or "dark"' } }, ['theme']),
      label: (i) => `Going ${str(i.theme)}`,
      asks: async (i) => ({ title: `Switch to ${str(i.theme) === 'dark' ? 'dark' : 'light'}?`, body: '' }),
      run: async (i) => {
        const t = str(i.theme) === 'dark' ? 'dark' : 'light'
        ctx.theme(t)
        return `Switched to ${t}.`
      },
    },
    {
      name: 'system_dnd',
      description: 'Turn Do Not Disturb on or off (notifications wait quietly).',
      input_schema: schema({ on: { type: 'boolean' } }, ['on']),
      label: (i) => (i.on ? 'Turning on Do Not Disturb' : 'Turning off Do Not Disturb'),
      asks: async (i) => ({ title: i.on ? 'Turn on Do Not Disturb?' : 'Turn off Do Not Disturb?', body: '' }),
      run: async (i) => {
        ctx.dnd(i.on === true)
        return i.on ? 'Do Not Disturb is on.' : 'Do Not Disturb is off.'
      },
    },
    {
      name: 'system_lock',
      description: 'Lock the screen.',
      input_schema: schema({}),
      label: () => 'Locking the screen',
      asks: ask('Lock the screen?'),
      run: async () => {
        ctx.lock()
        return 'Locked.'
      },
    },
  ]
}
