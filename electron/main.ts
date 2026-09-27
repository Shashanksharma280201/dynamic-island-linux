import { app, screen, globalShortcut, type Display } from 'electron'
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
import { InputShape, shapeRect } from './inputShape'
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
import { wireInbox } from './inbox'
import { NotesStore } from './notes'
import { Backdrop } from './backdrop'
import { FakeMailWatcher } from './providers/mailFake'
import { IPC } from '@shared/types'
import type { NotificationData, SystemState } from '@shared/types'
import type { Dock, Side } from '@shared/dock'
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
const SHORTCUT = 'CommandOrControl+I'
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
  const win = createIslandWindow(config.dock.side)
  let display: Display = placeIslandWindow(win, config.dock.side)
  // The side actually shown: config.dock.side, or a preview while dragging.
  let shownSide: Side = config.dock.side
  const pushDock = () =>
    send(win, IPC.DOCK, { side: shownSide, y: config.dock.y, workArea: display.workArea })

  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await win.loadFile(resolve(here, '../renderer/index.html'))
  }
  win.showInactive()

  const pushState = () => send(win, IPC.STATE, store.list())
  store.onChange(pushState)
  const transient = new TransientCards(store)
  const notes = new NotesStore(join(app.getPath('userData'), 'notes'))
  // Frosted glass: blurred snapshot of what's behind the island (X11 only).
  const backdrop = new Backdrop(
    win,
    () => display,
    () => config.frosted && config.appearance === 'glass' && !WAYLAND && process.env.DI_BACKDROP !== 'off',
    (img) => send(win, IPC.BACKDROP, img),
  )
  let shortcutActive = false

  // ---- interactivity: clicks reach the island, everything else passes through ----
  // Preferred: an X11 input shape (the X server routes clicks; no polling).
  // Fallback: poll the global cursor and toggle ignore-mouse-events.
  let cssRect: Rect | null = null
  let dragging = false
  let shape: InputShape | null = null
  if (process.env.DI_INPUT !== 'poll') {
    try {
      win.setIgnoreMouseEvents(false) // resets Electron's own input region first
      shape = await InputShape.create(win)
    } catch (e: any) {
      console.error('[island] X11 input shape unavailable, falling back to cursor polling:', e?.message ?? e)
      shape = null
    }
  }
  const interactivity = shape ? null : new Interactivity(win)
  const updateHitArea = () => {
    if (shape) {
      if (dragging) shape.full()
      else shape.set(cssRect ? [shapeRect(cssRect, display.scaleFactor, 4)] : [])
      // Real frosted glass where the compositor supports blur-behind (KDE).
      shape.setBlur(
        config.appearance === 'glass' && cssRect ? [shapeRect(cssRect, display.scaleFactor)] : null,
      )
    } else {
      interactivity!.setRect(
        cssRect && toPhysicalRect(cssRect, win.getBounds(), display.scaleFactor, 4),
      )
    }
  }
  updateHitArea()
  if (interactivity) {
    interactivity.onHover((inside) => send(win, IPC.HOVER, inside))
    interactivity.start()
  }
  // Chromium may reset the input region when the window changes; re-apply.
  win.on('resize', updateHitArea)
  win.on('move', updateHitArea)
  console.log(
    `[island] input: ${shape ? 'x11-shape' : 'cursor-polling'}, session: ${process.env.XDG_SESSION_TYPE || 'unknown'}, ` +
      `scale: ${display.scaleFactor}, bounds: ${JSON.stringify(win.getBounds())}`,
  )
  const replace = () => {
    display = placeIslandWindow(win, shownSide)
    updateHitArea()
    pushDock()
  }
  const setDock = (d: Dock) => {
    config.dock = d
    shownSide = d.side
    saveConfig(config)
    replace()
    settings?.changed()
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
  let inbox: ReturnType<typeof wireInbox> | null = null
  const mail = new MailManager(
    (m, account) => {
      hub.addMail(m, config.mail.length > 1 ? account.label : undefined)
      inbox?.changed('mail')
    },
    () => {
      settings?.changed()
      inbox?.changed('sources')
    },
    DEMO === '4'
      ? (a, _p, onMail, onStatus) => new FakeMailWatcher(a.id, onStatus, onMail)
      : undefined,
  )
  hub.setBackend('mail', mail)

  const whatsapp = new WhatsAppService(() =>
    FAKE_WA
      ? new FakeWhatsAppEngine(process.env.DI_DEMO_LOG, Number(process.env.DI_FAKE_WA_READY_MS) || 2500)
      : new WwebjsEngine(cdpUrl()),
  )
  whatsapp.onMessage((m) => {
    hub.addWhatsApp(m)
    inbox?.changed('whatsapp')
  })
  whatsapp.onState((s) => {
    inbox?.changed('sources')
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
    onDockSide: (side) => setDock({ ...config.dock, side }),
    applyShortcut: () => applyShortcut(),
    shortcutActive: () => shortcutActive,
    onFrosted: () => backdrop.refresh(),
    frostedAvailable: !WAYLAND,
    notesFolder: notes.folder,
    onAppearance: () => {
      pushAppearance()
      updateHitArea()
      backdrop.refresh()
    },
  })
  settings.wire()

  inbox = wireInbox(win, {
    whatsapp,
    mail,
    closeCard: (source, threadId) => hub.closeThread(source, threadId),
    notes,
  })
  if (DEMO === '4') {
    const demoServer = { host: 'demo.invalid', port: 993, secure: true }
    await mail.set(
      { id: 'demo', label: 'Demo', user: 'me@example.com', imap: demoServer, smtp: demoServer },
      '',
    )
  }
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
  // Demo mode simulates the system so every control can be shown.
  const demoSys: SystemState = { volume: 62, muted: false, wifi: true, bluetooth: false, brightness: 78 }
  const pushSys = async () => {
    try {
      send(win, IPC.SYS_STATE, DEMO ? { ...demoSys } : await system.read())
    } catch (e) {
      console.error('system read:', e)
    }
  }
  const commands = new CommandQueue(
    async (c) => {
      if (!DEMO) return system.apply(c)
      if (c.type === 'volume') demoSys.volume = c.value
      else if (c.type === 'brightness') demoSys.brightness = c.value
      else if (c.type === 'mute') demoSys.muted = !demoSys.muted
      else if (c.type === 'wifi') demoSys.wifi = c.value
      else if (c.type === 'bluetooth') demoSys.bluetooth = c.value
    },
    () => void pushSys(),
  )

  // Typing a reply needs keyboard focus; the island is unfocusable otherwise
  // so it never steals focus from the app you're using.
  const setFocus = (focus: boolean) => {
    if (win.isDestroyed()) return
    if (focus && win.isFocusable() && win.isFocused()) return // already ours
    win.setFocusable(focus)
    if (focus) win.focus()
    else win.blur()
    // Electron alone can't focus a dock window on X11; do it at the X level.
    shape?.keyboard(focus)
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
      // A collapsed capsule is narrow; anything wider is a card or the panel.
      backdrop.setExpanded(!!r && r.width > 80)
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
    onDockSet: setDock,
    onDockPreview: (side) => {
      if (side === shownSide) return
      shownSide = side
      replace()
    },
    onDrag: (on) => {
      dragging = on
      if (interactivity) interactivity.lock(on)
      else updateHitArea()
    },
  })

  // A renderer reload (dev HMR, crash recovery) must get the current state.
  // KWin blurs behind windows that set _KDE_NET_WM_BLUR_BEHIND_REGION.
  const blurBehind = !!shape && /kde/i.test(process.env.XDG_CURRENT_DESKTOP ?? '')
  // Ctrl+I opens / closes the island panel from anywhere (X11 key grab).
  const applyShortcut = (): boolean => {
    if (shortcutActive) globalShortcut.unregister(SHORTCUT)
    shortcutActive = false
    if (config.shortcut) {
      shortcutActive = globalShortcut.register(SHORTCUT, () => send(win, IPC.TOGGLE_PANEL, null))
      if (!shortcutActive) console.error(`[island] couldn't register ${SHORTCUT}; another app may own it`)
    }
    return shortcutActive
  }
  applyShortcut()
  backdrop.start()
  const pushAppearance = () =>
    send(win, IPC.APPEARANCE, { appearance: config.appearance, blur: blurBehind })
  win.webContents.on('did-finish-load', () => {
    pushState()
    pushDock()
    pushAppearance()
  })
  pushAppearance()
  pushDock()
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
    globalShortcut.unregisterAll()
    backdrop.stop()
    interactivity?.stop()
    shape?.close()
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
