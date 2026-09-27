import { app, screen, type Display } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { ActivityStore } from './store'
import { ClaudeServer } from './providers/claude'
import { MediaProvider } from './providers/media'
import { NotificationMonitor, displayMs } from './providers/notifications'
import { SystemControls, CommandQueue } from './providers/system'
import { createIslandWindow, placeIslandWindow } from './window'
import { Interactivity } from './interactivity'
import { closeCursor } from './cursor'
import { send, wireIpc } from './ipc'
import { IslandTray } from './tray'
import { loadConfig, saveConfig } from './config'
import { isAutostartEnabled, setAutostart } from './autostart'
import { isHookInstalled, setHookInstalled } from './hookSetup'
import { IPC } from '@shared/types'
import type { NotificationData } from '@shared/types'
import { defaultSocketPath } from '@shared/protocol'
import { toPhysicalRect, type Rect } from '@shared/hitbox'

const WAYLAND = process.env.XDG_SESSION_TYPE === 'wayland'
app.commandLine.appendSwitch('enable-transparent-visuals')
// The island relies on X11 (always-on-top dock window + global cursor), so run
// through XWayland on Wayland sessions unless the user chose a platform.
if (WAYLAND && !process.env.ELECTRON_OZONE_PLATFORM_HINT) {
  app.commandLine.appendSwitch('ozone-platform', 'x11')
}

const here = dirname(fileURLToPath(import.meta.url))
const SOCK = defaultSocketPath(process.env, process.getuid?.() ?? 'user')
const DEMO = process.env.DI_DEMO // '1' media+approval, '2' two activities, '3' notifications
const MAX_NOTIFICATIONS = 5

let cleanup: (() => Promise<void>) | null = null

async function main() {
  const config = loadConfig()
  const store = new ActivityStore()
  const win = createIslandWindow()
  let display: Display = placeIslandWindow(win)

  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await win.loadFile(resolve(here, '../renderer/index.html'))
  }
  win.showInactive()

  const pushState = () => send(win, IPC.STATE, store.list())
  store.onChange(pushState)

  // ---- interactivity: renderer rect (CSS px) → physical hit area ----
  const interactivity = new Interactivity(win)
  let cssRect: Rect | null = null
  const updateHitArea = () => {
    interactivity.setRect(
      cssRect && toPhysicalRect(cssRect, win.getBounds(), display.scaleFactor, 4),
    )
  }
  interactivity.onHover((inside) => send(win, IPC.HOVER, inside))
  interactivity.start()
  const replace = () => {
    display = placeIslandWindow(win)
    updateHitArea()
  }
  screen.on('display-metrics-changed', replace)
  screen.on('display-added', replace)
  screen.on('display-removed', replace)

  // ---- Claude approvals ----
  const claude = new ClaudeServer(SOCK)
  claude.onRequest((req) => {
    store.upsert({ kind: 'approval', id: req.id, priority: 10, request: req })
  })
  // Hook gave up (timeout, Claude cancelled): drop the stale card.
  claude.onCancel((id) => store.remove(id))
  await claude.start().catch((e) => console.error('claude server:', e.message ?? e))

  // ---- media ----
  const media = new MediaProvider()
  media.onChange((s) => {
    if (!s) store.remove('media')
    else store.upsert({ kind: 'media', id: 'media', priority: 1, media: s })
  })
  await media.start().catch((e) => console.error('media provider:', e))

  // ---- notifications ----
  const notifTimers = new Map<string, ReturnType<typeof setTimeout>>()
  let notifSeq = 0
  const dismiss = (id: string) => {
    clearTimeout(notifTimers.get(id))
    notifTimers.delete(id)
    store.remove(id)
  }
  const showNotification = (n: NotificationData) => {
    const id = `notif-${notifSeq++}`
    const priority = n.urgency === 'critical' ? 6 : 5
    store.upsert({ kind: 'notification', id, priority, notification: n })
    notifTimers.set(id, setTimeout(() => dismiss(id), displayMs(n)))
    // Keep the queue short: drop the oldest beyond the limit.
    const ids = [...notifTimers.keys()]
    for (const old of ids.slice(0, Math.max(0, ids.length - MAX_NOTIFICATIONS))) dismiss(old)
  }
  const notifications = new NotificationMonitor()
  notifications.onNotify((n) => {
    if (config.notifications) showNotification(n)
  })
  await notifications.start().catch((e) => console.error('notifications:', e))

  // ---- system controls: polled only while the Control Center is open ----
  const system = new SystemControls()
  let sysTimer: ReturnType<typeof setInterval> | null = null
  const pushSys = async () => {
    try {
      send(win, IPC.SYS_STATE, await system.read())
    } catch (e) {
      console.error('system read:', e)
    }
  }
  const commands = new CommandQueue(
    (c) => system.apply(c),
    () => void pushSys(),
  )

  wireIpc({
    onDecision: (m) => {
      claude.resolve(m)
      store.remove(m.id)
    },
    onMediaCmd: (c) => media.command(c),
    onSysCmd: (c) => commands.push(c),
    onRect: (r) => {
      cssRect = r
      updateHitArea()
    },
    onPanel: (open) => {
      if (sysTimer) clearInterval(sysTimer)
      sysTimer = null
      if (!open) return
      void pushSys()
      sysTimer = setInterval(pushSys, 2000)
    },
    onDismiss: dismiss,
  })

  // A renderer reload (dev HMR, crash recovery) must get the current state.
  win.webContents.on('did-finish-load', pushState)
  win.webContents.on('render-process-gone', () => {
    if (!win.isDestroyed()) win.webContents.reload()
  })

  // ---- tray ----
  const tray = new IslandTray(
    () => ({
      notifications: config.notifications,
      hookInstalled: isHookInstalled(),
      autostart: isAutostartEnabled(),
    }),
    {
      setNotifications: (on) => {
        config.notifications = on
        saveConfig(config)
      },
      setHook: async (on) => {
        console.log((await setHookInstalled(on)).trim())
      },
      setAutostart,
      quit: () => app.quit(),
    },
  )
  tray.create()

  cleanup = async () => {
    interactivity.stop()
    if (sysTimer) clearInterval(sysTimer)
    for (const t of notifTimers.values()) clearTimeout(t)
    tray.destroy()
    await Promise.allSettled([claude.stop(), media.stop(), notifications.stop(), closeCursor()])
  }

  if (WAYLAND) {
    console.warn(
      '[island] Wayland session: running via XWayland. Hover/click on the island only ' +
        'works while the cursor is over X11 windows; log in with "Ubuntu on Xorg" for full support.',
    )
    showNotification({
      app: 'Dynamic Island',
      summary: 'Wayland session detected',
      body: 'Interaction is limited on Wayland. Use an Xorg session for full support.',
      urgency: 'critical',
    })
  }

  if (DEMO) runDemo(store, showNotification)
}

function runDemo(store: ActivityStore, notify: (n: NotificationData) => void) {
  const demoMedia = (id: string, title: string, artist: string, priority: number) =>
    store.upsert({
      kind: 'media',
      id,
      priority,
      media: {
        title,
        artist,
        playing: true,
        canControl: true,
        length: 215,
        position: 42,
        positionAt: Date.now(),
      },
    })
  demoMedia('media', 'Demo Song', 'Demo Artist', 1)
  if (DEMO === '2') {
    // Two ambient activities → minimal (attached pill + detached circle).
    setTimeout(() => demoMedia('media2', 'Podcast', 'Show', 2), 2500)
  } else if (DEMO === '3') {
    setTimeout(
      () => notify({ app: 'Mail', summary: 'Alice', body: 'Lunch at 1?', urgency: 'normal' }),
      1500,
    )
    setTimeout(
      () => notify({ app: 'Calendar', summary: 'Standup in 5 min', body: '', urgency: 'critical' }),
      2500,
    )
  } else {
    // Media, then an auto-expanding approval.
    setTimeout(
      () =>
        store.upsert({
          kind: 'approval',
          id: 'demo-approval',
          priority: 10,
          request: {
            id: 'demo-approval',
            toolName: 'Bash',
            inputSummary: 'rm -rf /tmp/x',
            toolInput: { command: 'rm -rf /tmp/x && echo done && ls -la /tmp' },
            cwd: '~/projects/demo',
            suggestions: [
              {
                type: 'addRules',
                rules: [{ toolName: 'Bash', ruleContent: 'rm -rf /tmp/x' }],
                behavior: 'allow',
                destination: 'localSettings',
              },
            ],
          },
        }),
      2000,
    )
  }
}

// ---- lifecycle ----
const wantsQuit = process.argv.includes('--quit')
if (!app.requestSingleInstanceLock()) {
  // Another island is running; it handles `--quit` via second-instance.
  app.exit(0)
} else if (wantsQuit) {
  app.exit(0) // nothing running to quit
} else {
  app.on('second-instance', (_e, argv) => {
    if (argv.includes('--quit')) app.quit()
  })
  app.whenReady().then(main)
  app.on('window-all-closed', () => {
    // keep running as a persistent widget
  })
  let cleaned = false
  app.on('before-quit', (e) => {
    if (cleaned || !cleanup) return
    e.preventDefault()
    cleanup().finally(() => {
      cleaned = true
      app.quit()
    })
  })
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => app.quit())
}
