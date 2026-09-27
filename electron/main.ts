import { app, screen, type Display } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { ActivityStore } from './store'
import { ClaudeServer } from './providers/claude'
import { MediaProvider } from './providers/media'
import {
  NotificationMonitor,
  GtkActionInvoker,
  displayMs,
  type GtkInvoke,
} from './providers/notifications'
import { SystemControls, CommandQueue } from './providers/system'
import { WhatsAppService, WwebjsEngine } from './providers/whatsapp'
import { FakeWhatsAppEngine } from './providers/whatsappFake'
import { createIslandWindow, placeIslandWindow } from './window'
import { Interactivity } from './interactivity'
import { closeCursor } from './cursor'
import { send, wireIpc } from './ipc'
import { IslandTray } from './tray'
import { loadConfig, saveConfig } from './config'
import { decryptSecret } from './secrets'
import { isAutostartEnabled, setAutostart } from './autostart'
import { isHookInstalled, setHookInstalled } from './hookSetup'
import { TransientCards } from './transient'
import { MessageHub, MESSAGE_MS } from './messages'
import { MailManager } from './mailManager'
import { SettingsController } from './settings'
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
// Separate profile for tests / portable use.
if (process.env.DI_USER_DATA) app.setPath('userData', process.env.DI_USER_DATA)

const here = dirname(fileURLToPath(import.meta.url))
const SOCK = defaultSocketPath(process.env, process.getuid?.() ?? 'user')
// '1' media+approval, '2' two activities, '3' notifications, '4' messages
const DEMO = process.env.DI_DEMO
// 'fake' swaps the real WhatsApp Web engine for a scripted one (demo/tests).
const FAKE_WA = process.env.DI_WHATSAPP_ENGINE === 'fake' || DEMO === '4'

const bootConfig = loadConfig()
// whatsapp-web.js drives a hidden window of this app over the Chrome DevTools
// Protocol, which Chromium only offers when started with a debugging port.
// Only opened when WhatsApp is enabled, bound to localhost, on a random port.
const WA_CDP = bootConfig.whatsapp && !FAKE_WA
if (WA_CDP) {
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
  app.commandLine.appendSwitch('remote-debugging-port', '0')
}

let cleanup: (() => Promise<void>) | null = null

function cdpUrl(): string {
  const file = readFileSync(join(app.getPath('userData'), 'DevToolsActivePort'), 'utf8')
  return `http://127.0.0.1:${file.split('\n')[0].trim()}`
}

async function main() {
  const config = bootConfig
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
  const transient = new TransientCards(store)

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

  // ---- notifications (with GNotification buttons) ----
  const invokes = new Map<string, GtkInvoke>()
  const invoker = new GtkActionInvoker()
  transient.onDismiss((id) => invokes.delete(id))
  let notifSeq = 0
  const showNotification = (n: NotificationData, invoke?: GtkInvoke) => {
    const id = `notif-${notifSeq++}`
    if (invoke) invokes.set(id, invoke)
    const priority = n.urgency === 'critical' ? 6 : 5
    transient.show({ kind: 'notification', id, priority, notification: n }, displayMs(n))
  }
  const notifications = new NotificationMonitor()
  notifications.onNotify((n, invoke) => {
    if (config.notifications) showNotification(n, invoke)
  })
  await notifications.start().catch((e) => console.error('notifications:', e))

  // ---- messages: WhatsApp + mail ----
  const hub = new MessageHub(transient)
  let settings: SettingsController | null = null
  let tray: IslandTray | null = null
  const mail = new MailManager(
    (m, account) => hub.addMail(m, config.mail.length > 1 ? account.label : undefined),
    () => settings?.changed(),
  )
  hub.setBackend('mail', mail)

  const whatsapp = new WhatsAppService(() =>
    FAKE_WA
      ? new FakeWhatsAppEngine(process.env.DI_DEMO_LOG, Number(process.env.DI_FAKE_WA_READY_MS) || 2500)
      : new WwebjsEngine(cdpUrl()),
  )
  whatsapp.onMessage((m) => hub.addWhatsApp(m))
  whatsapp.onState((s) => {
    hub.setBackend(
      'whatsapp',
      s.state === 'ready'
        ? { reply: (c, t) => whatsapp.send(c, t), markRead: (c) => whatsapp.markRead(c) }
        : null,
    )
    settings?.changed()
  })

  // ---- settings window (created before the services report status to it) ----
  settings = new SettingsController({
    config,
    mail,
    whatsapp,
    whatsappCapable: WA_CDP || FAKE_WA,
    onConfigChanged: () => tray?.refresh(),
  })
  settings.wire()

  for (const { secret, ...account } of config.mail) {
    try {
      await mail.set(account, decryptSecret(secret))
    } catch (e) {
      console.error(`mail ${account.label}:`, e)
    }
  }
  if ((config.whatsapp && WA_CDP) || FAKE_WA) void whatsapp.start()

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

  // Typing a reply needs keyboard focus; the island is unfocusable otherwise
  // so it never steals focus from the app you're using.
  const setFocus = (focus: boolean) => {
    if (win.isDestroyed()) return
    win.setFocusable(focus)
    if (focus) win.focus()
    else win.blur()
  }

  wireIpc({
    onDecision: (m) => {
      claude.resolve(m)
      store.remove(m.id)
    },
    onMediaCmd: (c) => void media.command(c),
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
    onDismiss: (id) => transient.dismiss(id),
    onHold: (id, hold) => {
      if (process.env.DI_DEBUG) console.error('[hold]', id, hold)
      transient.hold(id, hold)
    },
    onFocus: setFocus,
    onReply: (m) => void hub.reply(m.id, m.text),
    onMessageAction: (m) => void hub.markRead(m.id),
    onNotifAction: ({ id, key }) => {
      const inv = invokes.get(id)
      const button = inv?.buttons[Number(key)]
      if (!inv || !button) return
      transient.dismiss(id)
      invoker.invoke(inv.appId, button).catch((e) => console.error('notification action:', e))
    },
    onOpenSettings: (section) => settings?.open(section),
  })

  // A renderer reload (dev HMR, crash recovery) must get the current state.
  win.webContents.on('did-finish-load', pushState)
  win.webContents.on('render-process-gone', () => {
    if (!win.isDestroyed()) win.webContents.reload()
  })

  // ---- tray ----
  tray = new IslandTray(
    () => ({
      notifications: config.notifications,
      hookInstalled: isHookInstalled(),
      autostart: isAutostartEnabled(),
    }),
    {
      setNotifications: (on) => {
        config.notifications = on
        saveConfig(config)
        settings?.changed()
      },
      setHook: async (on) => {
        console.log((await setHookInstalled(on)).trim())
        settings?.changed()
      },
      setAutostart: (on) => {
        setAutostart(on)
        settings?.changed()
      },
      openSettings: () => settings?.open(),
      quit: () => app.quit(),
    },
  )
  tray.create()

  cleanup = async () => {
    interactivity.stop()
    if (sysTimer) clearInterval(sysTimer)
    transient.clear()
    tray?.destroy()
    invoker.stop()
    await Promise.allSettled([
      claude.stop(),
      media.stop(),
      notifications.stop(),
      mail.stop(),
      whatsapp.stop(),
      closeCursor(),
    ])
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

  if (DEMO) runDemo(store, showNotification, hub)
}

function runDemo(
  store: ActivityStore,
  notify: (n: NotificationData) => void,
  hub: MessageHub,
) {
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
        canSeek: true,
        shuffle: false,
        loop: 'None',
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
  } else if (DEMO === '4') {
    // WhatsApp messages come from the fake engine; add a mail too.
    setTimeout(
      () =>
        hub.addMail({
          accountId: 'demo',
          uid: 1,
          from: { name: 'Bob Builder', address: 'bob@example.com' },
          subject: 'Quarterly report',
          snippet: 'Hi! Attached is the draft of the quarterly report, let me know what you think.',
          date: Date.now(),
        }),
      MESSAGE_MS / 2,
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
