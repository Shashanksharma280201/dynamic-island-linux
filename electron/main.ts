import { app, dialog, screen, globalShortcut, shell, type Display } from 'electron'
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
import {
  findExecutable,
  hookDir,
  isHookInstalled,
  isUsageBridgeInstalled,
  nodeRunner,
  setHookInstalled,
  setUsageBridgeInstalled,
} from './hookSetup'
import { ClaudeCode, claudeSearchDirs } from './claudeCode'
import type { MediaState } from '@shared/types'
import { ApiAgent } from './agent/agent'
import { IslandMcp } from './agent/mcpServer'
import { packageTools } from './packages/tools'
import { enabledPackages, enabledTabs } from '@shared/packages'
import { friendlyError, listModels } from './agent/providers'
import { agentSystemPrompt } from './agent/prompt'
import { baseUrlFor, modelFor, providerInfo, setupProblem } from '@shared/ai'
import { ClaudeController, earlyClaudeState } from './claudeIpc'
import { MODELS, SpeechModels, registerSttScheme } from './stt'
import { Spotify, REDIRECT_URI } from './spotify'
import { wireSpotify } from './spotifyIpc'
import { SPOTIFY } from './spotifyChannels'
import { spawn } from 'node:child_process'
import { usageAlerts, type ClaudeRun } from '@shared/claude'
import { homedir } from 'node:os'
import { TransientCards } from './transient'
import { uninstall } from './uninstall'
import { MessageHub, MESSAGE_MS } from './messages'
import { MailManager } from './mailManager'
import { SettingsController } from './settings'
import { MEDIA_SCHEME_PRIVILEGES, serveMedia, wireInbox } from './inbox'
import { NotesStore } from './notes'
import { DocsService, homeFile } from './docs/service'
import { CrmStore } from './crm/store'
import { wireCrm } from './crmIpc'
import { dueLabel } from '@shared/crm'
import { printHtmlToPdf } from './docs/print'
import { wireDocs } from './docsIpc'
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

// Private scheme that serves the speech model to the island (must be set up before 'ready').
registerSttScheme([MEDIA_SCHEME_PRIVILEGES])
// Lets speech recognition use several CPU cores (WebAssembly threads).
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')
// Tests feed a WAV file as the microphone.
if (process.env.DI_FAKE_MIC) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', process.env.DI_FAKE_MIC)
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
  const claudeStateReady = earlyClaudeState()
  // The island may use the microphone (talking to Claude); nothing else.
  win.webContents.session.setPermissionRequestHandler((wc, permission, cb, details) => {
    const audioOnly = permission === 'media' && (details as any).mediaTypes?.every((t: string) => t === 'audio')
    cb(wc === win.webContents && audioOnly)
  })
  win.webContents.session.setPermissionCheckHandler((wc, permission) => wc === win.webContents && permission === 'media')
  const speech = new SpeechModels(
    join(app.getPath('userData'), 'models'),
    () => claudeUi?.push(),
    process.env.DI_STT_BASE_URL || undefined,
    process.env.DI_STT_MODELS_DIR || undefined,
  )
  speech.serve()
  let waForMedia: WhatsAppService | null = null
  serveMedia(() => waForMedia)
  let claudeUi: ClaudeController | null = null
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
  // ---- documents: files you add, and what's made from them ----
  // LibreOffice (deb, snap or flatpak), for exact Office → PDF conversions.
  const soffice = (): string | null => {
    if (process.env.DI_SOFFICE !== undefined) return process.env.DI_SOFFICE || null
    const flatpak = ['/var/lib/flatpak/exports/bin', join(homedir(), '.local/share/flatpak/exports/bin')]
    return findExecutable('soffice', ['/usr/bin', '/usr/local/bin']) ?? findExecutable('libreoffice', ['/snap/bin']) ?? findExecutable('org.libreoffice.LibreOffice', flatpak)
  }
  const docs = new DocsService({
    dataDir: app.getPath('userData'),
    outDir: () => process.env.DI_DOCS_OUT || join(app.getPath('documents'), 'Dynamic Island'),
    home: () => homedir(),
    searchRoots: (): Record<string, string> =>
      process.env.DI_DOCS_SEARCH
        ? { documents: process.env.DI_DOCS_SEARCH }
        : { documents: app.getPath('documents'), downloads: app.getPath('downloads'), desktop: app.getPath('desktop') },
    printPdf: printHtmlToPdf,
    soffice,
    trash: (p) => shell.trashItem(p),
    // Tracked changes in Word show who made them: the character.
    author: () => config.character.name,
    onChange: () => docsIpc.changed(),
  })
  const docsIpc = wireDocs(win, docs, { libreOffice: () => !!soffice() })
  // ---- CRM: people, deals and follow-ups, on this computer ----
  const crm = new CrmStore({ dir: join(app.getPath('userData'), 'crm'), onChange: (c) => crmIpc.changed(c) })
  const crmIpc = wireCrm(win, crm, { saveFile: (bytes, name, ext) => docs.save(bytes, name, ext) })
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
  shape?.onFocusLost(() => send(win, IPC.FOCUS_LOST, null))
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
  claude.onUsage((u) => claudeCode.setUsage(u))

  // ---- Claude Code commands from the island (voice / typed) ----
  const findClaude = (): string | null => {
    const set = process.env.DI_CLAUDE_BIN || config.claude.binary
    if (set) return set
    return findExecutable('claude', claudeSearchDirs(homedir()))
  }
  const alertsSeen = new Set<string>()
  // What the agent is doing, on the island: a live card, then the answer.
  const agentChanged = (run?: ClaudeRun) => {
    claudeUi?.push()
    if (run && (run.phase === 'starting' || run.phase === 'thinking' || run.phase === 'tool' || run.phase === 'writing')) {
      if (transient.has('claude-done')) transient.dismiss('claude-done')
      store.upsert({ kind: 'claude', id: 'claude-run', priority: 2, run })
    }
  }
  const agentFinished = (run: ClaudeRun) => {
    store.remove('claude-run')
    // A card with the answer, which closes by itself (hover keeps it).
    if (run.phase !== 'stopped') {
      transient.show({ kind: 'claude', id: 'claude-done', priority: 4, run }, run.phase === 'error' ? 12_000 : 15_000)
    }
  }
  // The agent asks before acting for you (sending a message, a reply…),
  // with the same card Claude Code's permission requests use.
  const agentApprovals = (() => {
    const pending = new Map<string, (ok: boolean) => void>()
    let seq = 0
    return {
      ask(o: { tool: string; title: string; body: string; signal: AbortSignal }): Promise<boolean> {
        const id = `agent-ask-${++seq}`
        return new Promise<boolean>((resolve) => {
          const done = (ok: boolean) => {
            if (!pending.delete(id)) return
            clearTimeout(timer)
            store.remove(id)
            resolve(ok)
          }
          const timer = setTimeout(() => done(false), 3 * 60_000)
          pending.set(id, done)
          o.signal.addEventListener('abort', () => done(false), { once: true })
          store.upsert({
            kind: 'approval',
            id,
            priority: 10,
            request: { id, toolName: o.tool, inputSummary: o.title, fromIsland: true, ask: { app: config.character.name, title: o.title, body: o.body } },
          })
        })
      },
      /** True if this decision was for the agent. */
      decide(id: string, ok: boolean): boolean {
        const done = pending.get(id)
        done?.(ok)
        return !!done
      },
    }
  })()
  const claudeCode = new ClaudeCode({
    // A fresh set of tools for each run (its CRM changes undo together).
    mcpConfig: () => {
      if (process.env.DI_MCP === 'off') return undefined
      mcpRun?.abort()
      const run = (mcpRun = new AbortController())
      islandMcp.use(islandTools(), async (tool, input) => {
        const ask = await tool.asks!(input)
        return agentApprovals.ask({ tool: tool.name, ...ask, signal: run.signal })
      })
      return islandMcp.config() ?? undefined
    },
    config: () => config.claude,
    findBinary: findClaude,
    // Runs from the island ask on the island even without the global hook.
    hookCommand: () =>
      isHookInstalled() ? undefined : `${nodeRunner()} ${JSON.stringify(join(hookDir(), 'claude-island-hook.cjs'))}`,
    approvalsInstalled: isHookInstalled,
    usageBridgeInstalled: isUsageBridgeInstalled,
    socketPath: SOCK,
    dataDir: app.getPath('userData'),
    onChange: (s) => agentChanged(s.run),
    onUsage: (u) => {
      for (const a of usageAlerts(u, alertsSeen, Date.now())) {
        alertsSeen.add(a.key)
        const w = u[a.window]
        const when = w?.resetsAt ? new Date(w.resetsAt).toLocaleString([], { weekday: a.window === 'sevenDay' ? 'short' : undefined, hour: 'numeric', minute: '2-digit' }) : ''
        showNotificationLater({
          app: 'Claude',
          summary: `${a.window === 'fiveHour' ? 'Session' : 'Weekly'} limit ${Math.round(a.pct)}% used`,
          body: when ? `Resets ${when}.` : '',
          urgency: a.threshold >= 95 ? 'critical' : 'normal',
        })
      }
    },
    onFinished: (run: ClaudeRun) => {
      mcpRun?.abort() // an island tool still waiting for your OK is moot now
      agentFinished(run)
    },
  })
  // The tools of the packages that are on (Settings → Packages), for one
  // answer: the island's own agent and Claude Code both use them.
  const islandTools = () =>
      packageTools(config.packages, {
        notes,
        whatsapp: {
          ready: () => whatsapp.current.state === 'ready',
          listChats: (n) => whatsapp.listChats(n),
          getMessages: (id, n) => whatsapp.getMessages(id, n),
          send: (id, text) => whatsapp.send(id, text),
        },
        mail,
        media: { now: () => nowPlaying, command: (c) => media.command(c) },
        spotify,
        docs,
        crm: {
          store: crm,
          // One batch per answer: its changes undo in one go.
          batch: crm.begin('agent'),
          files: {
            resolve: (ref) => docs.resolve(ref),
            homeFile: (ref) => homeFile(homedir(), ref),
            save: (bytes, name, ext) => docs.save(bytes, name, ext),
            outLabel: () => docs.outLabel(),
          },
        },
      })
  // ...and for Claude Code, as an MCP server it's handed with each run.
  const islandMcp = new IslandMcp()
  let mcpRun: AbortController | null = null
  // The island's own agent, for every provider other than Claude Code.
  const apiAgent = new ApiAgent({
    dataDir: app.getPath('userData'),
    target: () => {
      const ai = config.ai
      const problem = setupProblem(ai)
      if (problem) return problem
      const provider = providerInfo(ai.provider)
      const stored = ai.keys[ai.provider]
      return {
        provider,
        model: modelFor(ai),
        apiKey: stored ? decryptSecret(stored) : '',
        // Tests point every provider at a local stand-in.
        baseUrl: process.env.DI_AI_BASE_URL || (provider.kind === 'anthropic' ? undefined : baseUrlFor(ai)),
      }
    },
    // Called per question, after every service below exists.
    tools: () => islandTools(),
    askUser: (o) => agentApprovals.ask(o),
    system: () => agentSystemPrompt(config.character),
    onChange: (s) => {
      // Only the active engine's runs reach the island.
      if (claudeUi?.engine() === apiAgent) agentChanged(s.run)
      else claudeUi?.push()
    },
    onFinished: (run) => agentFinished(run),
  })
  let showNotificationLater: (n: NotificationData) => void = () => {}
  await claude.start().catch((e) => console.error('claude server:', e.message ?? e))
  await islandMcp.start().catch((e) => console.error('island tools for Claude Code:', e.message ?? e))

  // ---- media ----
  const media = new MediaProvider()
  let nowPlaying: MediaState | null = null
  media.onChange((s) => {
    nowPlaying = s
    if (!s) store.remove('media')
    else store.upsert({ kind: 'media', id: 'media', priority: 1, media: s })
  })
  await media.start().catch((e) => console.error('media provider:', e))

  // ---- Spotify (Web API with your own app's Client ID) ----
  // The Spotify desktop app, if installed (deb/snap/flatpak).
  const spotifyApp = (): string | null => {
    if (process.env.DI_SPOTIFY_APP !== undefined) return process.env.DI_SPOTIFY_APP || null
    const home = homedir()
    const flatpak = ['/var/lib/flatpak/exports/bin', join(home, '.local/share/flatpak/exports/bin')]
    return findExecutable('spotify', ['/snap/bin', ...flatpak]) ?? findExecutable('com.spotify.Client', flatpak)
  }
  const spotify = new Spotify({
    clientId: () => config.spotify.clientId,
    dataDir: app.getPath('userData'),
    onChange: (v) => {
      if (!win.isDestroyed()) win.webContents.send(SPOTIFY.CHANGED, v)
      settings?.changed()
    },
    // No active Spotify device: play in the Spotify app here, starting it if needed.
    openLocally: async (uri) => {
      if (!uri) return false
      if (await media.openUri(uri)) return 'played'
      const bin = spotifyApp()
      if (!bin) return false
      spawn(bin, [`--uri=${uri}`], { detached: true, stdio: 'ignore' }).unref()
      return 'launched'
    },
    appInstalled: () => !!spotifyApp(),
    accountsBase: process.env.DI_SPOTIFY_ACCOUNTS || undefined,
    apiBase: process.env.DI_SPOTIFY_API || undefined,
    webBase: process.env.DI_SPOTIFY_WEB || undefined,
  })
  wireSpotify(spotify)

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
  showNotificationLater = (n) => showNotification(n)
  const notifications = new NotificationMonitor()
  notifications.onNotify((n, invoke) => {
    if (config.notifications) showNotification(n, invoke)
  })
  await notifications.start().catch((e) => console.error('notifications:', e))

  // ---- CRM follow-ups: a card on the island when one is due ----
  const CRM_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ad8e6"/><stop offset="1" stop-color="#0a95a8"/></linearGradient></defs><rect width="28" height="28" rx="7.5" fill="url(#g)"/><rect x="5" y="7" width="18" height="14" rx="2.5" fill="#fff"/><circle cx="10.5" cy="12.3" r="2.3" fill="#12a3b5"/><path d="M7.1 18.3c.5-2 1.8-3.1 3.4-3.1s2.9 1.1 3.4 3.1z" fill="#12a3b5"/><path d="M15.6 11.6h4.8M15.6 14.3h4.8M15.6 17h3.2" stroke="#8fdde6" stroke-width="1.3" stroke-linecap="round"/></svg>',
  )}`
  const remindFollowUps = () => {
    if (!enabledPackages(config.packages).includes('crm')) return
    const due = crm.dueForReminder()
    for (const t of due.slice(0, 3))
      showNotification({ app: 'CRM · Follow-up', icon: CRM_ICON, summary: t.title, body: [t.contactName, dueLabel(t.due, new Date())].filter(Boolean).join(' · '), urgency: 'normal' })
    if (due.length > 3) showNotification({ app: 'CRM · Follow-ups', icon: CRM_ICON, summary: `${due.length - 3} more follow-ups are due`, body: 'See them in the CRM tab.', urgency: 'normal' })
  }
  setTimeout(remindFollowUps, 5000)
  // Tests check every second instead of every minute.
  const crmTimer = setInterval(remindFollowUps, Number(process.env.DI_CRM_REMIND_MS) || 60_000)

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
    uninstall: () => void runUninstall(),
    frostedAvailable: !WAYLAND,
    notesFolder: notes.folder,
    claude: () => ({
      binary: findClaude(),
      binaryOverride: config.claude.binary,
      cwd: claudeCode.cwd(),
      permissionMode: config.claude.permissionMode,
      voiceShortcut: config.claude.voiceShortcut,
      voiceShortcutActive: claudeUi?.voiceShortcut ?? null,
      sttModel: config.claude.sttModel,
      sttModels: (['tiny', 'base'] as const).map((value) => ({ value, label: MODELS[value].label })),
      usageBridge: isUsageBridgeInstalled(),
    }),
    onClaude: () => {
      claudeUi?.applyVoiceShortcut()
      claudeUi?.push()
    },
    pickClaudeFolder: (parent) => claudeUi!.pickFolder(parent),
    spotify: () => {
      const v = spotify.view()
      return { clientId: config.spotify.clientId, redirectUri: REDIRECT_URI, status: v.status, user: v.user?.name, premium: v.user?.premium, error: v.error }
    },
    spotifySignIn: () => spotify.signIn(),
    spotifySignOut: () => spotify.signOut(),
    onSpotifyClient: () => spotify.signOut(),
    setUsageBridge: (on) => setUsageBridgeInstalled(on),
    onCharacter: () => pushCharacter(),
    onPackages: () => pushPackages(),
    onAi: (previous) => {
      // Switching away from a provider mid-answer stops that answer.
      if (previous !== config.ai.provider) {
        if (providerInfo(previous).kind === 'claude-code') claudeCode.stop()
        else apiAgent.stop()
      }
      claudeUi?.push()
    },
    listModels: async (id) => {
      const p = providerInfo(id)
      if (p.kind === 'claude-code') return []
      const stored = config.ai.keys[id]
      if (p.needsKey && !stored) throw new Error('Add your API key first.')
      const base = process.env.DI_AI_BASE_URL || (p.kind === 'anthropic' ? undefined : baseUrlFor(config.ai, id))
      try {
        return await listModels(p.kind, stored ? decryptSecret(stored) : '', base)
      } catch (e) {
        throw new Error(friendlyError(e, p.label, base))
      }
    },
    onAppearance: () => {
      pushAppearance()
      updateHitArea()
      backdrop.refresh()
    },
  })
  settings.wire()
  void spotify.start() // after Settings exists: it reports status there

  claudeUi = new ClaudeController({
    win,
    config,
    claude: claudeCode,
    agent: apiAgent,
    speech,
    saveConfig: () => saveConfig(config),
    setUsageBridge: setUsageBridgeInstalled,
    setApprovals: async (on) => {
      await setHookInstalled(on)
      tray?.refresh()
    },
    onSettingsChanged: () => settings?.changed(),
  })
  claudeUi.wire()
  claudeUi.applyVoiceShortcut()
  claudeStateReady(claudeUi)
  claudeUi.push()

  waForMedia = whatsapp
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
    // Not win.blur(): on X11 Chromium "deactivates" by lowering the window to
    // the bottom of the stack, putting the app behind on top of the island.
    if (focus) win.focus()
    else win.moveTop() // stay above the app that gets focus back
    // Electron alone can't focus a dock window on X11; do it at the X level.
    shape?.keyboard(focus)
    // Changing focusability makes Chromium reset the window's input region,
    // which would let clicks on the island fall through to the app behind.
    updateHitArea()
    for (const ms of [30, 150, 400]) setTimeout(() => !win.isDestroyed() && updateHitArea(), ms)
  }

  wireIpc({
    onDecision: (m) => {
      if (agentApprovals.decide(m.id, m.decision === 'allow')) return
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
    onReply: (m) => void hub.reply(m.id, m.text).finally(() => inbox?.changed('unread')),
    onMessageAction: (m) => void hub.markRead(m.id).finally(() => inbox?.changed('unread')),
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
  // The island may have reported its rect before this was listening.
  send(win, IPC.RECT_REQUEST, null)

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
  const pushCharacter = () => send(win, IPC.CHARACTER, config.character)
  const pushPackages = () => send(win, IPC.PACKAGES, enabledTabs(config.packages))
  win.webContents.on('did-finish-load', () => {
    claudeUi?.push()
    pushState()
    pushDock()
    pushAppearance()
    pushCharacter()
    pushPackages()
    send(win, IPC.RECT_REQUEST, null)
  })
  pushAppearance()
  pushCharacter()
  pushPackages()
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
      uninstall: () => void runUninstall(),
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
    clearInterval(crmTimer)
    crm.flush()
    claudeCode.dispose()
    apiAgent.dispose()
    mcpRun?.abort()
    islandMcp.stop()
    spotify.stop()
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
/**
 * Removes the island from this computer (tray menu, Settings, or
 * `--uninstall`). Asks first unless `--yes`; `--delete-data` also removes its
 * settings and data without asking. Quits when done.
 */
async function runUninstall(argv: string[] = []): Promise<void> {
  let removeData = argv.includes('--delete-data')
  if (!argv.includes('--yes')) {
    const r = await dialog.showMessageBox({
      type: 'warning',
      message: 'Uninstall Dynamic Island?',
      detail:
        'This removes the app, starting it at login, and the Claude Code approvals and status line it set up. Files it saved in your Documents folder are kept.',
      checkboxLabel: 'Also delete my settings, notes, CRM and sign-ins',
      checkboxChecked: false,
      buttons: ['Uninstall', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    })
    if (r.response !== 0) return
    removeData = r.checkboxChecked
  }
  const text = await uninstall(
    {
      packaged: app.isPackaged,
      userData: app.getPath('userData'),
      appId: 'io.github.shashanksharma280201.dynamicisland',
      productName: 'Dynamic Island',
      debPackage: 'dynamic-island-linux',
      removeHook: async () => isHookInstalled() && setHookInstalled(false),
      removeStatusLine: async () => isUsageBridgeInstalled() && setUsageBridgeInstalled(false),
      removeLoginItem: () => setAutostart(false),
      trash: (p) => shell.trashItem(p),
    },
    { removeData },
  )
  console.log(`[island] ${text}`)
  if (!argv.includes('--yes')) await dialog.showMessageBox({ type: 'info', message: 'Dynamic Island is uninstalled', detail: text, buttons: ['OK'] })
  app.quit()
}

const wantsQuit = process.argv.includes('--quit')
// `--replace` (what `npm start` passes): close the running island and take
// its place, so a rebuilt island shows up without logging out.
const wantsReplace = process.argv.includes('--replace') && !wantsQuit

function run(): void {
  app.on('second-instance', (_e, argv) => {
    // Ignore the `--quit` we sent to the island we replaced (it may arrive late).
    if (argv.includes(`--replaced-by=${process.pid}`)) return
    if (argv.includes('--uninstall')) void runUninstall(argv)
    else if (argv.includes('--quit') || argv.includes('--replace')) app.quit()
  })
  // `--uninstall` with nothing running: just remove, no island.
  app.whenReady().then(() => (process.argv.includes('--uninstall') ? runUninstall(process.argv) : main()))
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

if (app.requestSingleInstanceLock()) {
  if (wantsQuit) app.exit(0) // nothing running to quit
  else run()
} else if (wantsReplace) {
  // The running island got our `--replace` and is closing. Islands from
  // before `--replace` existed only know `--quit`, so send that too.
  const passOn = process.argv.filter((a) => a === '--no-sandbox')
  spawn(process.execPath, [...(app.isPackaged ? [] : [app.getAppPath()]), ...passOn, '--quit', `--replaced-by=${process.pid}`], {
    detached: true,
    stdio: 'ignore',
  }).unref()
  // Then wait for its lock.
  const until = Date.now() + 15000
  const retry = setInterval(() => {
    if (app.requestSingleInstanceLock()) {
      clearInterval(retry)
      run()
    } else if (Date.now() > until) {
      console.error('[island] the running island did not close; try `--quit` first')
      app.exit(1)
    }
  }, 300)
} else {
  // Another island is running; it handles `--quit` via second-instance.
  app.exit(0)
}
