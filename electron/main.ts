import { egress } from './privacy'
import { app, clipboard, dialog, ipcMain, nativeImage, powerMonitor, screen, globalShortcut, shell, type Display } from 'electron'
import { fileURLToPath } from 'node:url'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
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
import { parseSysCmd, send, wireIpc } from './ipc'
import { IslandTray } from './tray'
import { dayOf, greeting, loadConfig, saveConfig } from './config'
import { decryptSecret, encryptSecret } from './secrets'
import { DropServer } from './dropServer'
import { DropOverlay } from './dropOverlay'
import { PhoneDrop } from './phoneDrop'
import { PhoneLink } from './phoneLink'
import { PhoneEdge } from './phoneEdge'
import { INVOKED, PUSHED, invokeKept, keepHandlers, phoneCall, type PhoneRoutes } from './phoneCalls'
import { PhoneOut } from './phoneOut'
import { phoneView, type PhoneTopic } from '@shared/phone'
import { dropAddresses, dropPairingLink, type DropStatus } from '@shared/drop'
import { isAutostartEnabled, setAutostart } from './autostart'
import {
  agentHooks,
  brainHookCommand,
  findExecutable,
  hookDir,
  hookNeedsUpgrade,
  isHookInstalled,
  isUsageBridgeInstalled,
  nodeRunner,
  setAgentHook,
  setHookInstalled,
  setUsageBridgeInstalled,
} from './hookSetup'
import { ClaudeCode, claudeSearchDirs } from './claudeCode'
import type { DecisionMsg, MediaState, ToolRequest } from '@shared/types'
import { canAlways, frontApproval, type ApprovalKey } from '@shared/approvalKeys'
import { parseQuestions } from '@shared/questions'
import { describeTool } from '@shared/toolDetail'
import { clash, DEFAULT_SHORTCUTS, sameAccel, SHORTCUT_INFO, shortcutLabel, validAccel } from '@shared/shortcuts'
import { ApiAgent } from './agent/agent'
import { IslandMcp } from './agent/mcpServer'
import { packageTools } from './packages/tools'
import { enabledPackages, enabledTabs } from '@shared/packages'
import { parseCharacter } from '@shared/character'
import { friendlyError, listModels } from './agent/providers'
import { agentSystemPrompt } from './agent/prompt'
import { baseUrlFor, modelFor, providerInfo, setupProblem } from '@shared/ai'
import { ClaudeController, earlyClaudeState } from './claudeIpc'
import { MODELS, SpeechModels, registerSttScheme } from './stt'
import { Spotify, REDIRECT_URI } from './spotify'
import { wireSpotify } from './spotifyIpc'
import { SPOTIFY } from './spotifyChannels'
import { execFile, spawn } from 'node:child_process'
import { usageAlerts, type ClaudeRun } from '@shared/claude'
import { homedir, hostname, networkInterfaces } from 'node:os'
import { randomBytes } from 'node:crypto'
import { TransientCards } from './transient'
import { uninstall } from './uninstall'
import { MessageHub, MESSAGE_MS } from './messages'
import { NotificationCenter, NOTIFS, wireNotificationCenter } from './notifCenter'
import { appsText, countByApp, sumUpPrompt } from '../shared/notifCenter'
import { SessionTracker } from './sessions'
import { RecapStore } from './recap'
import { recapCard, recapDue, weekBefore, weekOf } from '@shared/recap'
import { agentName } from '@shared/sessions'
import { CustomSounds } from './sounds'
import { Companion } from './companion'
import { dictatedText, pasteIntoFocusedApp } from './paste'
import { companionMood } from '@shared/companion'
import { SESSIONS } from './sessionChannels'
import { focusTerminal, frontWindow, terminalFocused } from './terminal'
import { captureWindow, type FrontWindow } from './attach'
import { ServiceHub } from './services'
import { ConnectedHub, syncActivities } from './connected'
import { CONNECTED } from './connectedChannels'
import { askIdOf, viewText } from '@shared/connected'
import { SERVICES } from './servicesChannels'
import { safeServiceUrl, serviceInfo, SERVICE_IDS, type ServiceId } from '@shared/services'
import { CLAUDE } from './claudeChannels'
import { DragRing } from './dragRing'
import { scriptedDragSource } from './dragSourceScripted'
import { DragJobs } from './dragJobs'
import { closeImagePage } from './imageOps'
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
import { DOCS } from './docsChannels'
import type { DocsView } from '@shared/docs'
import { Backdrop } from './backdrop'
import { FakeMailWatcher } from './providers/mailFake'
import { IPC } from '@shared/types'
import { watchCalm } from './calm'
import type { NotificationData, SystemState } from '@shared/types'
import type { Dock, Side } from '@shared/dock'
import { defaultSocketPath } from '@shared/protocol'
import { toPhysicalRect, type Rect } from '@shared/hitbox'
import { Brain } from './brain'
import { Wiring, openTerminal } from './brain/wire'
import { claudeOnce } from './brain/writer'
import { wireBrain } from './brainIpc'
import { Wallpapers } from './wallpaper'
import { LiveWallpaper } from './wallpaper/live'
import { DesktopBackground } from './wallpaper/desktop'
import { endpointsAt } from './wallpaper/search'
import { wireWallpaper } from './wallpaperIpc'
import { accentOf, islandLook } from '../shared/theme'
import { parseBuddyConfig } from '../shared/buddy'
import { CommandBar, homeDir } from './commandBar'
import { COMMAND } from './commandChannels'
import { DesktopLook, lookSettings } from './desktopLook'
import { ExtensionInstaller, extensionSchemaDirs, findExtension } from './gnomeExtensions'
import { SystemLook, yaruTheme } from './systemLook'
import { EXTENSIONS, extensionKey, type ExtensionId } from '../shared/desktop'
import type { SystemContext } from './packages/systemTools'
import { Announcer } from './announcer'
import { Routines } from './routines'
import { clickAt } from './buddy/click'
import { ALERT_DEFAULTS, statusLine } from '../shared/jarvis'
import { Buddy } from './buddy'
import { Pointer } from './buddy/pointer'
import { captureScreen } from './buddy/screen'
import { KOKORO_MB, KokoroFiles, SystemVoice, readingMs, testVoice } from './buddy/speech'
import { espeakProgram, phonemize } from './buddy/phonemes'
import { EMBED_FILES, EMBED_MB, EMBED_MODEL, hashEmbed } from '../shared/meaning'
import { ModelFiles } from './modelFiles'
import { EMBED } from './embedChannels'
import { EVENING, MORNING } from './morningChannels'
import { Digest } from './digest'
import { Engine, type Cloud } from './engine'
import { OS, wireOs, type OsRoutes } from './osCalls'
import { Agents } from './os/agents'
import { Agency } from './os/agency'
import { Skills } from './os/skills'
import { audioInputs, Calls, fixWavSizes } from './os/calls'
import { findTool } from './os/tools'
import { macFrontApp, WinFrontApp } from './os/frontApp'
import { callLine } from '../shared/calls'
import { inQuietHours } from '../shared/jarvis'
import { monitorLine, researchLine } from '../shared/agents'
import type { JobId } from '../shared/loop'
import { Intake } from './os/intake'
import { SOURCE_IDS, eventLine, parseSourcesConfig, type SourceId, type SourcesView } from '../shared/intake'
import { dateOf, SOURCES as SOURCES_DIR } from '../shared/brain'
import { ENGINE_FEATURES, parseEngineConfig } from '../shared/engine'
import type { AgentsView, CallsView, EngineView, OsAnswer, RestingView, TodayView } from '../shared/os'
import { briefLines, byHour, citedPrompt, fromActivity, messageEntries, pickSources, plainAnswer, readCites, timeRange, type Candidate, type TimelineEntry } from '../shared/memory'
import { BUDDY } from './buddyChannels'
import { SystemTheme } from './theme'
import { runTurn } from './agent/providers'

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
  // The phone calls the same functions the island's window does.
  keepHandlers()
  const config = bootConfig
  const store = new ActivityStore()
  const win = createIslandWindow(config.dock.side, config.display)
  // What the island's window is told about Claude, trading, the inbox… the phone hears too.
  let phonePush: ((topic: PhoneTopic, data: unknown) => void) | null = null
  let phoneRoutes: PhoneRoutes | null = null
  const toWindow = win.webContents.send.bind(win.webContents)
  win.webContents.send = (channel: string, ...args: unknown[]) => {
    toWindow(channel, ...args)
    const topic = PUSHED[channel]
    if (topic) phonePush?.(topic, args[0])
  }
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
  // Your own sounds (Settings → General → Sounds → Open Folder).
  let onSounds = () => {}
  const customSounds = new CustomSounds(join(app.getPath('userData'), 'sounds'), () => onSounds())
  // ---- what leaves this computer (Settings › Privacy) ----
  egress.init({ file: join(app.getPath('userData'), 'privacy-log.json'), paused: () => config.privacy.paused, onChange: () => settings?.changed() })
  // ---- light or dark (Settings and the island follow the desktop, or your choice) ----
  let onLook = () => {}
  const theme = new SystemTheme(
    () => config.theme,
    () => {
      settings?.changed()
      onLook()
    },
  )

  // ---- the desktop background (Settings → Wallpaper, or ask the assistant) ----
  const liveWall = new LiveWallpaper({
    pauseCovered: () => config.wallpaper.pauseCovered,
    pauseBattery: () => config.wallpaper.pauseBattery,
    onState: () => settings?.changed(),
  })
  const wallpapers = new Wallpapers({
    config: () => config.wallpaper,
    setConfig: (patch) => {
      config.wallpaper = { ...config.wallpaper, ...patch }
      saveConfig(config)
    },
    keys: () => {
      const k = config.wallpaper.keys
      const open = (v: string) => (v ? decryptSecret(v) : '')
      return { pexels: open(k.pexels), unsplash: open(k.unsplash), pixabay: open(k.pixabay) }
    },
    dir: process.env.DI_WALL_DIR || join(app.getPath('pictures'), 'Dynamic Island Wallpapers'),
    historyFile: join(app.getPath('userData'), 'wallpapers.json'),
    screen: () => {
      const p = screen.getPrimaryDisplay()
      return { width: Math.round(p.size.width * p.scaleFactor), height: Math.round(p.size.height * p.scaleFactor) }
    },
    desktop: new DesktopBackground(),
    live: liveWall,
    endpoints: process.env.DI_WALL_API ? endpointsAt(process.env.DI_WALL_API) : undefined,
    onChange: () => settings?.changed(),
  })
  serveMedia(
    () => waForMedia,
    (kind) => customSounds.read(kind),
    (name) => wallpapers.mediaFile(name),
  )
  let claudeUi: ClaudeController | null = null
  // Set once the buddy is up (events before then aren't spoken).
  let announcerRef: Announcer | null = null
  // Set once the buddy is up: speech from the phone.
  let hearFromPhone: (audio: Buffer, mime: string) => Promise<{ text: string } | { error: string }> = async () => ({ error: 'The island is still starting.' })
  let display: Display = placeIslandWindow(win, config.dock.side, config.display)
  // The side actually shown: config.dock.side, or a preview while dragging.
  let shownSide: Side = config.dock.side
  const pushDock = () =>
    send(win, IPC.DOCK, { side: shownSide, y: config.dock.y, workArea: display.workArea })

  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await win.loadFile(resolve(here, '../renderer/index.html'))
  }
  // Where it's docked, before anything else starts (media, notifications… can
  // take seconds): until then the page lays the island out for the default.
  pushDock()
  win.showInactive()

  const pushState = () => send(win, IPC.STATE, store.list())
  // Away from the computer, or its screen locked: the orbs stop drawing.
  const calm = watchCalm((c) => send(win, IPC.CALM, c))
  app.on('before-quit', () => calm.stop())
  // A moved pointer wakes the orbs at once when you're back (four times a
  // second is plenty for that, and costs next to nothing).
  let lastCursor = ''
  setInterval(() => {
    if (win.isDestroyed() || !win.isVisible()) return
    const c = screen.getCursorScreenPoint()
    const k = `${c.x},${c.y}`
    if (k === lastCursor) return
    lastCursor = k
    calm.poke()
  }, 250)
  store.onChange(pushState)
  const transient = new TransientCards(store)
  // Everything shown (or kept quiet in Do Not Disturb) stays here until cleared.
  const center = new NotificationCenter(join(app.getPath('userData'), 'notification-center.json'), () => config.dnd)
  let settings: SettingsController | null = null
  let tray: IslandTray | null = null
  // Wired before anything can arrive, so the island can ask for the list as soon as it loads.
  center.onChange(() => {
    send(win, NOTIFS.CHANGED, center.view())
    tray?.refresh()
  })
  // Since when Do Not Disturb has held notifications (for the summary when it ends).
  let dndSince = config.dnd ? Date.now() : 0
  const setDnd = (on: boolean) => {
    if (config.dnd === on) return
    config.dnd = on
    saveConfig(config)
    center.changed()
    settings?.changed()
    if (on) return void (dndSince = Date.now())
    // What came in quietly, in one line.
    const held = countByApp(center.view().entries, dndSince - 1)
    if (held.total)
      transient.show(
        { kind: 'notification', id: `dnd-held-${Date.now()}`, priority: 5, notification: { app: 'Do Not Disturb', summary: `While it was on: ${held.total} ${held.total === 1 ? 'notification' : 'notifications'}`, body: `${appsText(held.apps)}. They’re in Notifications.` } },
        10_000,
      )
  }
  const clearCards = () => {
    for (const a of store.list()) if (a.kind === 'notification' || a.kind === 'message') transient.dismiss(a.id)
  }
  wireNotificationCenter(center, {
    clearCards,
    setDnd,
    sumUp: async (o) => {
      const list = center.view().entries
      if (!list.length) return { ok: false, error: 'There’s nothing to sum up.' }
      return engine.ask({
        feature: 'notifications',
        system: 'You sum up the user’s notifications briefly and plainly.',
        prompt: sumUpPrompt(list),
        purpose: 'your notifications, to sum them up',
        interactive: true,
        prefer: o.prefer,
        consent: o.consent,
      })
    },
  })
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
    display = placeIslandWindow(win, shownSide, config.display)
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
  // "The display with the pointer": move over when the pointer does (not while the panel is open).
  let panelOpen = false
  const followTimer = setInterval(() => {
    if (config.display !== 'cursor' || panelOpen || win.isDestroyed()) return
    const here = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    if (here.id !== display.id) replace()
  }, 500)
  const setDisplay = (pref: string) => {
    config.display = pref
    saveConfig(config)
    replace()
  }

  // ---- Claude approvals ----
  const claude = new ClaudeServer(SOCK)
  claude.onRequest((req) => {
    store.upsert({ kind: 'approval', id: req.id, priority: 10, request: req })
    announcerRef?.event({ key: `approval:${req.id}`, kind: 'approval', priority: 'high', line: `${req.ask ? req.ask.title : `Claude Code wants to use ${req.toolName}`}. Say yes or no.` })
  })
  // Hook gave up (timeout, Claude cancelled): drop the stale card.
  // The hook went away: Claude stopped asking (quietly drop the card), or it
  // waited too long here and Claude now asks in the terminal (say so).
  claude.onCancel((id, why) => {
    const a = store.list().find((x) => x.id === id)
    store.remove(id)
    if (why !== 'timeout' || a?.kind !== 'approval' || a.request.fromIsland) return
    transient.show(
      {
        kind: 'notification',
        id: `handled-${id}`,
        priority: 3,
        notification: {
          app: 'Claude Code',
          summary: 'Claude is asking in the terminal now',
          body: `${describeTool(a.request.toolName, a.request.toolInput ?? {}).label}: it waited here a while.`,
          urgency: 'low',
        },
      },
      6000,
    )
  })
  claude.onUsage((u) => claudeCode.setUsage(u))

  // ---- The weekly recap: counts of what your agents did, 12 weeks ----
  const recap = new RecapStore(join(app.getPath('userData'), 'recap.json'), () => config.recap)

  // ---- Claude Code sessions in your terminals, live ----
  // The phone hears about changes once its link exists (Phone Drop, below).
  let phoneChanged = () => {}
  const sessions = new SessionTracker({
    onChange: (list) => {
      send(win, SESSIONS.CHANGED, list)
      phoneChanged()
      // While any work: one small orb for all of them, the busiest first.
      const working = list.filter((x) => x.phase === 'working')
      if (working.length) store.upsert({ kind: 'session', id: 'agent-sessions', priority: 2, session: working[0], others: working.length - 1 })
      else store.remove('agent-sessions')
      for (const a of store.list()) {
        if (a.kind !== 'session' || a.id === 'agent-sessions') continue
        const now = sessions.get(a.session.id)
        // Its card goes once it's back at work (or gone); a waiting card follows it.
        if (a.id.startsWith('session-wait-')) {
          if (now?.phase !== 'waiting') store.remove(a.id)
          else store.upsert({ ...a, session: now })
        } else if (!now || now.phase === 'working' || now.phase === 'waiting') transient.dismiss(a.id)
      }
    },
    onFinished: async (x) => {
      recap.turn({ at: x.finishedAt ?? Date.now(), session: x.id, agent: x.agent, project: x.project, ms: (x.finishedAt ?? Date.now()) - (x.turnStartedAt ?? x.startedAt), files: x.files.length, added: x.added, removed: x.removed, commands: x.commands ?? 0 })
      // You're looking at its terminal already: no need to tell you.
      if (x.pid && (await terminalFocused(x.pid))) return
      const now = sessions.get(x.id)
      if (now?.phase !== 'done') return
      transient.show({ kind: 'session', id: `session-done-${x.id}`, priority: 4, session: now }, 15_000)
    },
    onWaiting: (x) => {
      store.upsert({ kind: 'session', id: `session-wait-${x.id}`, priority: 7, session: x })
      announcerRef?.event({ key: `wait:${x.id}:${x.turnStartedAt ?? x.startedAt}`, kind: 'session-waiting', priority: 'high', line: `Claude Code in ${x.project} is waiting for you.` })
    },
  })
  claude.onEvent((e) => sessions.event(e))
  sessions.start()
  ipcMain.handle(SESSIONS.LIST, () => sessions.list())
  ipcMain.handle(SESSIONS.FOCUS, async (_e, id: unknown) => {
    const x = typeof id === 'string' ? sessions.get(id) : undefined
    return !!x?.pid && focusTerminal(x.pid)
  })
  ipcMain.handle(SESSIONS.FORGET, (_e, id: unknown) => {
    if (typeof id !== 'string') return
    for (const a of store.list()) if (a.kind === 'session' && a.id !== 'agent-sessions' && a.session.id === id) transient.has(a.id) ? transient.dismiss(a.id) : store.remove(a.id)
    sessions.forget(id)
  })
  // Approvals set up before the island followed sessions: add the session hook.
  if (hookNeedsUpgrade()) setHookInstalled(true).then(() => console.log('[island] Claude Code hook updated to follow sessions live'), (e) => console.error('[island] hook update failed:', e.message ?? e))

  // ---- Claude Code commands from the island (voice / typed) ----
  const findClaude = (): string | null => {
    const set = process.env.DI_CLAUDE_BIN || config.claude.binary
    if (set) return set
    return findExecutable('claude', claudeSearchDirs(homedir()))
  }

  // ---- the second brain (Settings → Brain) ----
  // Session notes are written by your island AI, or by Claude Code (Haiku)
  // when that is the island's AI; without either they are plain.
  const writerDir = join(app.getPath('userData'), 'brain-writer')
  // ---- search by meaning: a small model in the island's page reads the notes ----
  const embedModel = new ModelFiles(join(app.getPath('userData'), 'models'), EMBED_MODEL, EMBED_FILES, EMBED_MB, () => settings?.changed(), process.env.DI_STT_BASE_URL || undefined)
  const embedWaiting = new Map<number, { resolve: (v: Float32Array[]) => void; reject: (e: Error) => void }>()
  let embedSeq = 0
  ipcMain.on(EMBED.DONE, (e, r) => {
    if (e.sender !== win.webContents || typeof r?.id !== 'number') return
    const w = embedWaiting.get(r.id)
    embedWaiting.delete(r.id)
    if (!w) return
    if (Array.isArray(r.vectors)) w.resolve(r.vectors.map((v: ArrayLike<number>) => Float32Array.from(v)))
    else w.reject(new Error(typeof r.error === 'string' ? r.error : 'The meaning model failed.'))
  })
  const islandEmbed = (texts: string[]) =>
    new Promise<Float32Array[]>((resolve, reject) => {
      const id = ++embedSeq
      const timer = setTimeout(() => {
        embedWaiting.delete(id)
        reject(new Error('The meaning model took too long.'))
      }, 60_000)
      embedWaiting.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        },
      })
      send(win, EMBED.ASK, { id, texts })
    })
  // Tests: words hashed into vectors stand in for the model (DI_EMBED_FAKE).
  const embedder = () => (process.env.DI_EMBED_FAKE ? async (texts: string[]) => texts.map(hashEmbed) : embedModel.ready() ? islandEmbed : null)
  const SESSION_SUMMARY = 'a Claude Code session’s summary, to write its five-line note'
  /** One plain answer from the AI in Settings › AI (or Claude Code's Haiku), for a feature; null when there's none or it's paused. */
  /** The AI in Settings › AI, as the engine's cloud (null when there's none, or everything is paused). */
  const cloudAi = (): Cloud | null => {
    // Paused (Settings › Privacy): nothing goes out.
    if (egress.blocked()) return null
    const ai = config.ai
    const provider = providerInfo(ai.provider)
    if (provider.kind !== 'claude-code' && !setupProblem(ai)) {
      const stored = ai.keys[ai.provider]
      const model = modelFor(ai)
      return {
        label: `${provider.label.replace(/ \(.*\)$/, '')} (${model})`,
        model,
        ask: (o) =>
          runTurn({
            kind: provider.kind as 'anthropic' | 'openai-compatible',
            model,
            apiKey: stored ? decryptSecret(stored) : '',
            baseUrl: process.env.DI_AI_BASE_URL || (provider.kind === 'anthropic' ? undefined : baseUrlFor(ai)),
            system: o.system,
            history: [],
            prompt: o.prompt,
            tools: [],
            feature: o.feature,
            purpose: o.purpose,
            // Token counts, where the service gives them (for the cost).
            wantUsage: ['openai', 'deepseek', 'openrouter'].includes(ai.provider),
            signal: AbortSignal.timeout(120_000),
            events: { onMessageStart() {}, onText() {}, onTool() {}, onToolDone() {} },
          }).then((r) => ({ text: r.text, usage: r.usage ?? null })),
      }
    }
    const bin = findClaude()
    return bin
      ? {
          label: 'Claude Code (Haiku)',
          model: 'claude-code',
          ask: async (o) => {
            egress.note(o.feature, 'Anthropic, through Claude Code', o.purpose)
            // The brain's prompts say everything already; the others start with what they're for.
            return { text: await claudeOnce(bin, o.feature === 'brain' ? o.prompt : `${o.system}\n\n${o.prompt}`, writerDir), usage: null }
          },
        }
      : null
  }
  // Island OS's engine: a model on this computer first (Ollama), the cloud with your yes.
  const engine = new Engine({
    config: () => (process.env.DI_OLLAMA_URL ? { ...config.engine, localUrl: process.env.DI_OLLAMA_URL } : config.engine),
    cloud: cloudAi,
    file: join(app.getPath('userData'), 'engine-traces.json'),
    onChange: () => settings?.changed(),
  })
  void engine.detect()
  const engineView = (): EngineView => {
    const st = engine.status()
    const cloud = config.engine.cloud === 'never' ? null : cloudAi()
    return {
      cfg: config.engine,
      local: { found: st.found, url: st.url, models: st.models, daily: st.daily, research: st.research, error: st.error },
      cloud: cloud?.label ?? null,
      label: engine.label(),
      week: engine.week(),
      learned: ENGINE_FEATURES.filter((f) => engine.learnedFor(f.id) === 'cloud').map((f) => ({ feature: f.id, label: f.label })),
    }
  }
  // Island OS's calls, from the island and Settings (each checked in shared/os.ts).
  const osRoutes: OsRoutes = {
    'engine.view': () => engineView(),
    'engine.set': async (patch: Record<string, unknown>) => {
      const jobs = patch.jobs && typeof patch.jobs === 'object' ? { ...config.engine.jobs, ...(patch.jobs as object) } : config.engine.jobs
      const before = config.engine.localUrl
      config.engine = parseEngineConfig({ ...config.engine, ...patch, jobs })
      saveConfig(config)
      if (config.engine.localUrl !== before) await engine.detect(true)
      settings?.changed()
      return engineView()
    },
    'engine.detect': async () => {
      await engine.detect(true)
      settings?.changed()
      return engineView()
    },
  }
  wireOs(() => osRoutes, (wc) => wc === win.webContents || !!settings?.owns(wc))
  /** One plain answer for a background job or feature, from the engine; null when nothing can answer. */
  const answerer = (feature: string, system: string, fallbackPurpose: string) => {
    if (!engine.available()) return null
    return {
      label: engine.label(),
      ask: async (prompt: string, purpose = fallbackPurpose, job?: string) => {
        const r = await engine.ask({ feature: job ?? feature, system, prompt, purpose })
        if (!r.ok) throw new Error('error' in r ? r.error : `${r.needsConsent} wasn’t allowed`)
        return r.text
      },
    }
  }
  // Island OS's intake: what you do, read by each source you turn on (Settings › Sources).
  // The window in front, for screen time: X11 on Linux, Launch Services on a Mac, a small PowerShell on Windows.
  const winFront = process.platform === 'win32' ? new WinFrontApp() : null
  if (winFront) app.on('before-quit', () => winFront.stop())
  const frontApp = process.platform === 'darwin' ? macFrontApp : winFront ? () => winFront.read() : process.platform === 'linux' && !!process.env.DISPLAY ? () => frontWindow() : undefined
  const intake = new Intake({
    config: () => config.sources,
    file: join(app.getPath('userData'), 'os-intake.json'),
    home: homedir(),
    frontWindow: frontApp,
    idleSeconds: () => (process.env.DI_IDLE_NEVER ? 0 : powerMonitor.getSystemIdleTime()),
    privateWords: () => config.buddy.private,
    onChange: () => settings?.changed(),
  })
  intake.start()
  const todayEvents = () => {
    const d0 = new Date()
    d0.setHours(0, 0, 0, 0)
    return intake.calendar(d0.getTime(), d0.getTime() + 86_400_000)
  }
  const sourcesView = (): SourcesView => ({
    list: intake.status(),
    calendar: config.sources.calendar,
    skip: config.sources.skip,
    filing: config.brain.on,
    kept: { whatsapp: config.brain.whatsapp, mail: config.brain.mail, phone: config.brain.phone },
    screenable: !!frontApp,
  })
  Object.assign(osRoutes, {
    'sources.view': () => sourcesView(),
    'sources.set': async (patch: Record<string, unknown>) => {
      const before = config.sources
      const on = patch.on && typeof patch.on === 'object' ? { ...before.on, ...(patch.on as object) } : before.on
      config.sources = parseSourcesConfig({ ...before, ...patch, on })
      saveConfig(config)
      for (const id of SOURCE_IDS) {
        // Off: what it kept goes. On (or a new calendar): a first look now.
        if (before.on[id] && !config.sources.on[id]) intake.clear(id)
        else if (config.sources.on[id] && (!before.on[id] || (id === 'calendar' && before.calendar !== config.sources.calendar))) void intake.check(id)
      }
      settings?.changed()
      return sourcesView()
    },
    'sources.check': async (id: string) => {
      if (!(SOURCE_IDS as string[]).includes(id)) throw new Error('There’s no such source.')
      if (id === 'screen') await intake.sampleScreen()
      else await intake.check(id as SourceId)
      return sourcesView()
    },
  } satisfies Partial<OsRoutes>)
  // Notes are written without an AI when there's none (or it's paused).
  const brainWriter = () => answerer('brain', 'You write short, plain notes for the user’s second brain.', SESSION_SUMMARY)
  const brain = new Brain({
    config: () => config.brain,
    setConfig: (patch) => {
      config.brain = { ...config.brain, ...patch }
      saveConfig(config)
    },
    ...brainPaths(),
    userData: app.getPath('userData'),
    claudeBinary: findClaude,
    hookCommand: brainHookCommand,
    writer: brainWriter,
    findExecutable: (name) => findExecutable(name, ['/snap/bin', '/var/lib/flatpak/exports/bin', join(homedir(), '.local/share/flatpak/exports/bin')]),
    openPath: (p) => void shell.openPath(p),
    openUrl: (u) => void shell.openExternal(u),
    onChange: () => settings?.changed(),
    ownFolders: [writerDir],
    onCard: (c) => send(win, MORNING.CARD, c),
    activity: () => ({ on: intake.anyOn(), all: () => intake.all(), dropDays: (d) => intake.dropDays(d), today: () => todayEvents().map(eventLine) }),
    // Each job's result waits for the evening digest.
    onJob: (label, ok, note) => announcerRef?.event({ key: `job:${label}`, kind: 'job', priority: 'low', line: ok ? `${label}: ${note}` : `${label} didn’t run. ${note.replace(/^Failed:\s*/, '')}` }),
    embed: embedder,
    meaningModel: () => ({ ready: !!process.env.DI_EMBED_FAKE || embedModel.ready(), downloading: embedModel.downloading(), progress: embedModel.progress, error: embedModel.error, sizeMb: EMBED_MB }),
    onMeaning: () => {
      if (process.env.DI_EMBED_FAKE || embedModel.ready()) return void brain.readForMeaning()
      void embedModel.ensure().then(() => brain.readForMeaning()).catch(() => {})
    },
  })
  // ---- Island OS memory: the day by hour, and answers that say where each fact came from ----
  const DAY_MS = 86_400_000
  const dayStart = (t = Date.now()) => {
    const d = new Date(t)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  const timelineBetween = (from: number, to: number): TimelineEntry[] => [
    ...intake.between(from, to).map(fromActivity),
    ...messageEntries(brain.keptMessages().filter((m) => m.at >= from && m.at < to)),
    ...brain.notesBetween(from, to).map((n) => ({ at: n.at, source: 'note', title: n.title, path: n.path })),
  ]
  const todayView = (): TodayView => {
    const now = Date.now()
    const from = dayStart(now)
    return {
      date: dateOf(now),
      timeline: byHour(timelineBetween(from, now + 1)),
      upcoming: intake
        .calendar(now, from + 2 * DAY_MS)
        .slice(0, 6)
        .map((e) => ({ start: e.start, title: e.title, where: e.where, allDay: e.allDay })),
      local: engine.status().found,
      any: intake.anyOn() || config.brain.on,
    }
  }
  const sourceKind = (path: string) => (path.startsWith(`${SOURCES_DIR}/`) ? path.split('/')[1] : 'note')
  Object.assign(osRoutes, {
    'today.view': () => todayView(),
    'today.ask': async (q: string, o?: { prefer?: unknown; consent?: unknown }): Promise<OsAnswer> => {
      const question = q.trim().slice(0, 500)
      if (!question) return { ok: false, error: 'Ask something about your days.' }
      const now = Date.now()
      const range = timeRange(question, now) ?? { from: now - 14 * DAY_MS, to: now + 1 }
      const cands: Candidate[] = [
        ...brain.recall(question, 12).map((h) => ({ title: h.title, kind: sourceKind(h.path), text: h.snippet, path: h.path, at: h.date ? Date.parse(h.date) || undefined : undefined, score: 1 })),
        ...timelineBetween(range.from, range.to).map((e) => ({ title: e.title, kind: e.source, text: [e.detail, e.project].filter(Boolean).join(' · '), at: e.at, url: e.url, path: e.path })),
        ...intake.calendar(range.from, range.to).map((e) => ({ title: e.start > now ? `Upcoming: ${e.title}` : e.title, kind: 'calendar', text: eventLine(e), at: e.start })),
      ]
      const sources = pickSources(cands, question, now)
      if (!sources.length) return { ok: false, error: 'Nothing in your sources matches that yet. Turn on more in Settings › Sources.' }
      const cited = (text: string) => readCites(text, sources)
      // No model at all: the sources themselves, listed.
      if (!engine.available()) {
        const r = cited(plainAnswer(question, sources, now))
        return { ok: true, text: r.text, cites: r.cites, meta: { where: 'local', label: 'No model: your sources, listed', model: '', ms: 0, usage: null, cost: 0 } }
      }
      const p = citedPrompt(question, sources, now)
      const prefer = o?.prefer === 'local' || o?.prefer === 'cloud' ? o.prefer : undefined
      const r = await engine.ask({ feature: 'ask', system: p.system, prompt: p.prompt, purpose: 'your question and the notes and activity it found', interactive: true, prefer, consent: o?.consent === true })
      if (!r.ok) return r
      const c = cited(r.text)
      return { ok: true, text: c.text, meta: r.meta, cites: c.cites }
    },
  } satisfies Partial<OsRoutes>)
  // ---- Island OS agents: monitors, research over the brain, the roster, and The Agency ----
  let osTell = (_title: string, _line: string): void => {}
  const osChanged = (topic: string) => send(win, OS.CHANGED, topic)
  const agents = new Agents({
    file: join(app.getPath('userData'), 'os-agents.json'),
    home: homedir(),
    ask: (o) => engine.ask(o),
    candidates: (q) => {
      const now = Date.now()
      const range = timeRange(q, now) ?? { from: now - 90 * DAY_MS, to: now + 1 }
      return [
        ...brain.recall(q, 12).map((h) => ({ title: h.title, kind: sourceKind(h.path), text: h.snippet, path: h.path, at: h.date ? Date.parse(h.date) || undefined : undefined, score: 1 })),
        ...timelineBetween(range.from, range.to).map((e) => ({ title: e.title, kind: e.source, text: [e.detail, e.project].filter(Boolean).join(' · '), at: e.at, url: e.url, path: e.path })),
      ]
    },
    writeNote: (path, text, why) => {
      const v = brain.vault()
      if (!v) return false
      v.write(path, text, why)
      return true
    },
    texts: () => [
      ...brain.keptMessages().map((m) => ({ at: m.at, text: `${m.chat} ${m.text}`, from: m.from || m.chat })),
      ...intake.all().map((a) => ({ at: a.at, text: `${a.title} ${a.detail ?? ''}`, from: a.source })),
      ...center.view().entries.map((e) => ({ at: e.at, text: `${e.title} ${e.body ?? ''}`, from: e.app })),
    ],
    defaultRepo: () => [...intake.all()].reverse().find((a) => a.source === 'github' && a.project)?.project ?? '',
    tell: (title, line) => osTell(title, line),
    onChange: () => osChanged('agents'),
  })
  agents.start()
  const claudeAgentsDir = () => join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'agents')
  const agency = new Agency({
    dir: join(app.getPath('userData'), 'agency'),
    claudeAgents: claudeAgentsDir,
    openTerminal: (cwd, argv) => openTerminal(cwd, argv, (name) => findExecutable(name, ['/usr/bin', '/usr/local/bin'])),
    claudeBinary: findClaude,
    home: homedir(),
    onChange: () => osChanged('agents'),
  })
  // Agent Skills (Anthropic's), into Claude Code's skills folder.
  const skills = new Skills({
    dir: join(app.getPath('userData'), 'skills'),
    claudeSkills: () => join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'skills'),
    onChange: () => osChanged('agents'),
  })
  // The resting island: notes to file, and what's next today.
  const restingView = (): RestingView => {
    const now = Date.now()
    const next = todayEvents()
      .filter((e) => !e.allDay && e.start > now)
      .sort((a, b) => a.start - b.start)[0]
    return { toFile: brain.toFile(), next: next ? { title: next.title.slice(0, 80), at: next.start } : null }
  }
  const ROSTER = ['people', 'triage', 'projects'] as const
  const agentsView = (): AgentsView => {
    const now = Date.now()
    const jobs = brain.jobs()?.view().jobs ?? []
    return {
      monitors: agents.monitors().map((m) => ({ ...m, line: monitorLine(m, now) })),
      research: agents.research().map((j) => ({ ...j, line: researchLine(j) })),
      roster: ROSTER.flatMap((id) => {
        const j = jobs.find((x) => x.id === id)
        return j ? [{ id, label: id === 'triage' ? 'Inbox' : j.label, what: j.what, note: j.note, ok: j.ok, lastRun: j.lastRun }] : []
      }),
      brain: config.brain.on && !!brain.vault(),
      week: engine.week(),
      agency: agency.view(),
      skills: skills.view(),
    }
  }
  Object.assign(osRoutes, {
    'agents.view': () => agentsView(),
    'agents.monitor': (text: string) => {
      agents.addMonitor(text)
      return agentsView()
    },
    'agents.check': async () => {
      await agents.checkAll()
      return agentsView()
    },
    'agents.unmonitor': (id: string) => {
      agents.removeMonitor(id)
      return agentsView()
    },
    'agents.research': (q: string, consent?: boolean) => {
      agents.startResearch(q, consent === true)
      return agentsView()
    },
    'agents.forget': (id: string) => {
      agents.removeResearch(id)
      return agentsView()
    },
    'agents.run': async (id: string) => {
      if (!(ROSTER as readonly string[]).includes(id)) throw new Error('There’s no such job.')
      const loop = brain.jobs()
      if (!loop) throw new Error('Turn on the second brain first (Settings › Second brain).')
      await loop.run(id as JobId)
      return agentsView()
    },
    'agency.view': () => agency.view(),
    'agency.get': () => agency.download(),
    'agency.search': (q: string, division?: string) => agency.search(q, division ?? ''),
    'agency.agent': (id: string) => agency.agent(id),
    'agency.start': (id: string, where: string) => {
      if (where !== 'claude' && where !== 'terminal') throw new Error('Start it in Claude or a terminal.')
      const r = agency.start(id, where)
      if (r.draft) send(win, CLAUDE.OPEN, { draft: r.draft })
      return r
    },
    'agency.install': (id: string) => {
      agency.install(id)
      return agency.view()
    },
    'agency.uninstall': (slug: string) => {
      agency.uninstall(slug)
      return agency.view()
    },
    'skills.view': () => skills.view(),
    'skills.get': () => skills.download(),
    'skills.search': (q: string) => skills.search(q),
    'skills.skill': (name: string) => skills.skill(name),
    'skills.install': (name: string) => {
      skills.install(name)
      return skills.view()
    },
    'skills.uninstall': (name: string) => {
      skills.uninstall(name)
      return skills.view()
    },
    'skills.start': (name: string) => {
      const r = skills.start(name)
      send(win, CLAUDE.OPEN, { draft: r.draft })
      return r
    },
    'status.view': () => restingView(),
  } satisfies Partial<OsRoutes>)
  // ---- Island OS voice: call notes (made out here, audio deleted) ----
  const transcribing = new Map<string, (r: { text: string } | { error: string }) => void>()
  let transcribeSeq = 0
  const transcribeOnIsland = (wav: string) =>
    new Promise<string>((resolve, reject) => {
      const id = `call-${++transcribeSeq}`
      const timer = setTimeout(() => {
        transcribing.delete(id)
        reject(new Error('Making it out took too long.'))
      }, 60 * 60_000)
      transcribing.set(id, (r) => {
        clearTimeout(timer)
        transcribing.delete(id)
        if ('text' in r) resolve(r.text)
        else reject(new Error(r.error))
      })
      // Tests: a stand-in for Whisper (the island still decodes the real audio first).
      send(win, 'os:transcribe', { id, data: fixWavSizes(readFileSync(wav)), fake: process.env.DI_STT_FAKE || undefined })
    })
  ipcMain.handle('os:transcribed', (e, id, r) => {
    if (e.sender !== win.webContents || typeof id !== 'string') return
    const done = transcribing.get(id)
    if (!done) return
    if (r && typeof r.text === 'string') done({ text: r.text.slice(0, 500_000) })
    else done({ error: typeof r?.error === 'string' ? r.error.slice(0, 300) : 'It couldn’t be made out.' })
  })
  const calls = new Calls({
    file: join(app.getPath('userData'), 'os-calls.json'),
    dir: join(app.getPath('userData'), 'calls'),
    transcribe: transcribeOnIsland,
    ask: (o) => engine.ask(o),
    writeNote: (p, text, why) => {
      const v = brain.vault()
      if (!v) return false
      v.write(p, text, why)
      return true
    },
    ffmpeg: () => process.env.DI_CALL_RECORDER || findTool('ffmpeg'),
    // The stand-in recorder (tests) records what it's given.
    inputs: async (ffmpeg) => (process.env.DI_CALL_RECORDER ? { mic: null, monitor: null } : audioInputs(process.platform, ffmpeg, findTool('pactl'))),
    onRecording: (c) => (c ? store.upsert({ kind: 'call', id: 'call', priority: 4, call: { started: c.started } }) : store.remove('call')),
    onChange: () => osChanged('calls'),
  })
  app.on('before-quit', () => calls.abort())
  const callsView = (): CallsView => ({ list: calls.view().map((c) => ({ ...c, line: callLine(c, Date.now()) })), recording: !!calls.recording() })
  // The morning brief, out loud (the buddy's voice).
  const sayBrief = async (): Promise<boolean> => {
    const now = Date.now()
    return buddy.speakLines(briefLines(brain.jobs()?.card() ?? null, todayEvents(), now))
  }
  Object.assign(osRoutes, {
    'calls.view': () => callsView(),
    'calls.start': async () => {
      await calls.start()
      return callsView()
    },
    'calls.stop': async () => {
      await calls.stop()
      return callsView()
    },
    'calls.sum': async (id: string, consent?: boolean) => {
      await calls.sum(id, consent === true)
      return callsView()
    },
    'calls.plain': (id: string) => {
      calls.plain(id)
      return callsView()
    },
    'calls.keep': (id: string) => {
      calls.keep(id)
      return callsView()
    },
    'calls.forget': (id: string) => {
      calls.forget(id)
      return callsView()
    },
    'today.speak': async () => {
      if (!config.buddy.on) throw new Error(`Turn on ${config.character.name || 'the buddy'} in Settings › Buddy to hear it.`)
      if (!(await sayBrief())) throw new Error('It’s talking already; try again in a moment.')
      return true
    },
  } satisfies Partial<OsRoutes>)
  // Said out loud once a morning, when you're first at the computer (and not in quiet hours).
  let briefSaid = ''
  const briefWhenHere = () => {
    const day = new Date().toDateString()
    if (!config.buddy.on || !config.buddy.speakMorning || briefSaid === day) return
    const card = brain.jobs()?.card()
    if (!card || card.state === 'done') return
    if (inQuietHours(new Date().getHours(), { speak: true, quietFrom: config.buddy.quietFrom, quietTo: config.buddy.quietTo, perHour: 4 })) return
    if (powerMonitor.getSystemIdleTime() > 60 || powerMonitor.getSystemIdleState(60) === 'locked') return
    briefSaid = day
    void sayBrief()
  }
  setInterval(briefWhenHere, 60_000).unref?.()
  powerMonitor.on('unlock-screen', () => setTimeout(briefWhenHere, 3000))
  // The loop's jobs catch up when the computer wakes or you unlock it.
  powerMonitor.on('resume', () => void brain.jobs()?.tick())
  powerMonitor.on('unlock-screen', () => void brain.jobs()?.tick())
  // The morning card on the island: send, edit, hold, done.
  ipcMain.handle(MORNING.GET, () => brain.jobs()?.card() ?? null)
  ipcMain.handle(MORNING.ACT, (e, a) => {
    if (e.sender !== win.webContents) return
    const loop = brain.jobs()
    const card = loop?.card()
    if (!loop || !card) return
    if (a === 'hold') return void loop.act('hold')
    if (a === 'done') return void loop.act('done')
    const ask = card.to ? `Send this to ${card.to}:\n\n${card.draft}` : card.draft
    if (a === 'edit') return send(win, CLAUDE.OPEN, { draft: ask })
    if (a === 'send') {
      loop.act('done')
      // The assistant sends it, and still asks first (on the island and your phone).
      try {
        claudeUi!.engine().ask(ask)
        send(win, CLAUDE.OPEN, {})
      } catch {
        send(win, CLAUDE.OPEN, { draft: ask })
      }
    }
  })

  // ---- the buddy: ask about your screen, it answers out loud and points (Settings › Buddy) ----
  const buddyDir = join(app.getPath('userData'), 'buddy')
  const pointer = new Pointer(() => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()))
  const systemVoice = new SystemVoice((name) => (process.env.DI_TTS_NONE ? null : findExecutable(name, ['/usr/bin', '/usr/local/bin'])))
  const espeakBin = () => (process.env.DI_TTS_NONE ? null : findExecutable('espeak-ng', ['/usr/bin', '/usr/local/bin']) ?? findExecutable('espeak', ['/usr/bin']))
  const kokoro = new KokoroFiles(join(app.getPath('userData'), 'models'), () => settings?.changed(), process.env.DI_STT_BASE_URL || undefined)
  const ttsLog = process.env.DI_TTS_LOG ? testVoice(process.env.DI_TTS_LOG) : null
  // Kokoro speaks in the island's page; it says when each sentence is done.
  const spoken = new Map<number, (r: { ok: boolean; error?: string }) => void>()
  let speakSeq = 0
  ipcMain.on(BUDDY.SPOKEN, (e, r) => {
    if (e.sender !== win.webContents || typeof r?.id !== 'number') return
    spoken.get(r.id)?.({ ok: r.ok === true, error: typeof r.error === 'string' ? r.error : undefined })
    spoken.delete(r.id)
  })
  const islandSays = (phonemes: string, voice: string, speed: number, words: string) =>
    new Promise<void>((resolve, reject) => {
      const id = ++speakSeq
      const timer = setTimeout(() => {
        spoken.delete(id)
        reject(new Error('The natural voice took too long.'))
      }, 20_000 + words.length * 120)
      spoken.set(id, (r) => {
        clearTimeout(timer)
        if (r.ok) resolve()
        else reject(new Error(r.error ?? 'The natural voice failed.'))
      })
      send(win, BUDDY.SPEAK, { id, phonemes, voice, speed })
    })
  let naturalTrouble = ''
  const speakSentence = async (text: string): Promise<void> => {
    const b = config.buddy
    if (ttsLog) return ttsLog(b.voice, text)
    if (b.voice === 'off') return new Promise((r) => setTimeout(r, readingMs(text)))
    if (b.voice === 'natural') {
      const bin = espeakBin()
      if (bin && kokoro.ready(b.voiceId)) {
        try {
          const phonemes = await phonemize(text, b.voiceId.startsWith('b') ? 'b' : 'a', espeakProgram(bin))
          await islandSays(phonemes, b.voiceId, b.speed, text)
          naturalTrouble = ''
          return
        } catch (e) {
          naturalTrouble = (e as Error).message
          console.error('[buddy] natural voice:', naturalTrouble)
        }
      } else if (bin && !kokoro.downloading() && !kokoro.error) {
        // Fetch it for next time; the system voice speaks meanwhile.
        void kokoro.ensure(b.voiceId).catch(() => {})
      }
    }
    try {
      await systemVoice.say(text, b.speed)
    } catch {
      await new Promise((r) => setTimeout(r, readingMs(text)))
    }
  }
  const stopSpeaking = () => {
    systemVoice.stop()
    send(win, BUDDY.SPEAK, { id: 0, stop: true })
    for (const [id, done] of spoken) {
      done({ ok: true })
      spoken.delete(id)
    }
  }
  // One answer from the AI in Settings › AI, with the screenshot.
  const buddyModel = async (o: { system: string; prompt: string; image?: string }): Promise<string> => {
    const ai = config.ai
    const provider = providerInfo(ai.provider)
    if (provider.kind !== 'claude-code') {
      const problem = setupProblem(ai)
      if (problem) throw new Error(problem)
      const stored = ai.keys[ai.provider]
      const r = await runTurn({
        kind: provider.kind as 'anthropic' | 'openai-compatible',
        model: modelFor(ai),
        apiKey: stored ? decryptSecret(stored) : '',
        baseUrl: process.env.DI_AI_BASE_URL || (provider.kind === 'anthropic' ? undefined : baseUrlFor(ai)),
        system: o.system,
        history: [],
        prompt: o.prompt,
        tools: [],
        images: o.image ? [{ mediaType: 'image/jpeg', data: o.image }] : undefined,
        feature: 'buddy',
        signal: AbortSignal.timeout(90_000),
        events: { onMessageStart() {}, onText() {}, onTool() {}, onToolDone() {} },
      })
      return r.text
    }
    const bin = findClaude()
    if (!bin) throw new Error('Claude Code isn’t installed (the "claude" command wasn’t found). Pick another AI in Settings › AI.')
    const paused = egress.blocked()
    if (paused) throw new Error(paused)
    let prompt = o.prompt
    if (o.image) {
      mkdirSync(buddyDir, { recursive: true })
      writeFileSync(join(buddyDir, 'screen.jpg'), Buffer.from(o.image, 'base64'))
      prompt += '\n\n(The screenshot is screen.jpg in this folder. Read it first.)'
    }
    egress.note('buddy', 'Anthropic, through Claude Code', o.image ? 'your question, with a screenshot' : 'your question')
    try {
      return await claudeOnce(bin, prompt, buddyDir, 90_000, { model: 'sonnet', args: ['--append-system-prompt', o.system, '--allowedTools', 'Read'] })
    } finally {
      rmSync(join(buddyDir, 'screen.jpg'), { force: true })
    }
  }
  const buddy = new Buddy({
    config: () => config.buddy,
    name: () => config.character.name || 'Buddy',
    model: buddyModel,
    brief: () => brain.briefForAgent(),
    notes: async (q) => {
      const search = brain.tools('buddy').find((t) => t.name === 'brain_search')
      if (!search) return ''
      const out = await search.run({ query: q, limit: 4 })
      return /^(No |Nothing|The brain has nothing)/.test(out) ? '' : out.slice(0, 1600)
    },
    save: (heard, reply) => {
      const capture = brain.tools('buddy').find((t) => t.name === 'brain_capture')
      if (!capture) return
      void capture.run({ title: `Asked ${config.character.name || 'the buddy'}: ${heard.slice(0, 70)}`, text: `**Asked:** ${heard}\n\n**Answer:** ${reply}`, type: 'note' })
    },
    display: () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()),
    capture: (d, words) => captureScreen(d, words),
    from: () => {
      const b = win.getBounds()
      return { x: b.x + b.width / 2, y: b.y + Math.min(60, b.height / 2) }
    },
    pointer,
    speak: speakSentence,
    stopSpeaking,
    onChange: (v) => send(win, BUDDY.STATE, v),
    // The Jarvis layer: real work goes to the assistant, yes and no answer
    // its permission prompts, and clicking, typing or keeping a fact about
    // you only ever happen after your yes.
    assistant: {
      busy: () => {
        const r = claudeUi?.engine().state().run
        return !!r && !['done', 'error', 'stopped'].includes(r.phase)
      },
      status: () => {
        const r = claudeUi?.engine().state().run
        return statusLine(r ? { phase: r.phase, tool: r.tool ? `${r.tool.name} ${r.tool.detail}`.trim() : undefined, steps: r.steps } : null, r?.startedAt ?? Date.now(), Date.now())
      },
      ask: (task) => claudeUi!.engine().ask(task),
      stop: () => claudeUi?.engine().stop(),
      work: () => {
        const r = claudeUi?.engine().state().run
        const lines = r && !['done', 'error', 'stopped'].includes(r.phase) ? [`The island’s assistant: working on “${r.prompt.slice(0, 80)}”`] : []
        for (const x of sessions.list().filter((s) => s.phase === 'working' || s.phase === 'waiting').slice(0, 6))
          lines.push(`Claude Code in ${x.project}: ${x.phase === 'waiting' ? 'waiting for the user' : 'working'}${x.prompt ? ` on “${x.prompt.slice(0, 60)}”` : ''}`)
        return lines.join('\n')
      },
    },
    approvals: {
      pending: () => {
        const r = frontApproval(store.list())
        if (!r || isQuestion(r)) return null
        return (r.ask ? r.ask.title : `${r.toolName} ${r.inputSummary}`).slice(0, 80)
      },
      answer: (a) => {
        const r = frontApproval(store.list())
        if (!r || isQuestion(r)) return false
        const always = a === 'always' && canAlways(r)
        decide({ id: r.id, decision: a === 'deny' ? 'deny' : 'allow', ...(always ? { always: true } : {}) })
        return true
      },
    },
    remember: (fact) => {
      const e = brain.rememberFact(fact, config.character.name || 'the buddy')
      if (e) throw new Error(e)
    },
    act: {
      // Screen points to the X server's pixels.
      click: (x, y) => {
        const k = screen.getDisplayNearestPoint({ x, y }).scaleFactor || 1
        return clickAt(x * k, y * k)
      },
      type: async (text) => {
        if (!(await pasteIntoFocusedApp(text))) throw new Error('It couldn’t type there: the text is on your clipboard.')
      },
    },
  })
  ipcMain.handle(BUDDY.ANSWER, (e, yes) => {
    if (e.sender !== win.webContents) return
    void buddy.answer(yes === true)
  })
  // Speaking up, sparingly: a session waiting on you, work it handed off that finished.
  // The evening digest: what wasn't said out loud, and the notifications you didn't get to.
  const digest = new Digest({
    file: join(app.getPath('userData'), 'digest.json'),
    config: () => ({ on: config.buddy.digest, at: config.buddy.digestAt }),
    entries: () => center.view().entries,
    onCard: (c) => send(win, EVENING.CARD, c),
  })
  ipcMain.handle(EVENING.GET, () => digest.card())
  ipcMain.handle(EVENING.DONE, (e) => {
    if (e.sender === win.webContents) digest.done()
  })
  const announcer = new Announcer({
    config: () => ({ ...ALERT_DEFAULTS, speak: config.buddy.on && config.buddy.alerts, quietFrom: config.buddy.quietFrom, quietTo: config.buddy.quietTo }),
    say: (l) => buddy.announce(l),
    kept: (item) => digest.add(item),
  })
  // Tests check every second instead of every minute.
  digest.start(Number(process.env.DI_DIGEST_TICK_MS) || 60_000)
  powerMonitor.on('resume', () => digest.tick())
  powerMonitor.on('unlock-screen', () => digest.tick())
  // Routines: standing orders, run by the assistant at their time.
  const routines = new Routines({
    routines: () => config.routines,
    save: (r) => {
      config.routines = r
      saveConfig(config)
      settings?.changed()
    },
    ask: (p) => claudeUi!.engine().ask(p),
    started: (r) => {
      console.error(`[island] routine: ${r.name}`)
      announcer.event({ key: `routine:${r.id}`, kind: 'routine', priority: 'low', line: `Your routine “${r.name}” ran.` })
    },
  })
  routines.start()
  announcerRef = announcer
  powerMonitor.on('resume', () => routines.tick())
  ipcMain.handle(BUDDY.ASK, (e, text) => {
    if (e.sender !== win.webContents || typeof text !== 'string') return
    void buddy.ask(text)
  })
  ipcMain.handle(BUDDY.CMD, (e, c) => {
    if (e.sender !== win.webContents || !['next', 'back', 'stop', 'repeat'].includes(c)) return
    void buddy.command(c)
  })
  ipcMain.handle(BUDDY.GET, () => buddy.view())
  // The phone as the buddy's microphone: its recording is made out here (Whisper, in the island's page), then asked as if you'd said it.
  const hearing = new Map<string, (r: { text: string } | { error: string }) => void>()
  let hearSeq = 0
  hearFromPhone = async (audio, mime) => {
    if (!config.buddy.on) return { error: `Turn on ${config.character.name || 'the buddy'} in Settings › Buddy on your computer.` }
    const id = `hear-${++hearSeq}`
    const r = await new Promise<{ text: string } | { error: string }>((resolve) => {
      const timer = setTimeout(() => hearing.delete(id) && resolve({ error: 'It took too long to make that out.' }), 90_000)
      hearing.set(id, (x) => {
        clearTimeout(timer)
        hearing.delete(id)
        resolve(x)
      })
      // Tests: a stand-in for Whisper (the real model can't be downloaded there).
      send(win, BUDDY.HEAR, { id, mime, data: audio.toString('base64'), fake: process.env.DI_STT_FAKE || undefined })
    })
    if ('text' in r) void buddy.ask(r.text)
    return r
  }
  ipcMain.handle(BUDDY.HEARD, (e, id, r) => {
    if (e.sender !== win.webContents || typeof id !== 'string') return
    const done = hearing.get(id)
    if (!done) return
    if (r && typeof r.text === 'string' && r.text.trim()) done({ text: r.text.trim().slice(0, 2000) })
    else done({ error: typeof r?.error === 'string' ? r.error.slice(0, 300) : 'I couldn’t make that out.' })
  })
  let buddyKeyOn = ''
  const applyBuddyKey = () => {
    if (buddyKeyOn) globalShortcut.unregister(buddyKeyOn)
    buddyKeyOn = ''
    if (!config.buddy.on) return
    const accel = config.keys.buddy
    if (globalShortcut.register(accel, () => send(win, BUDDY.KEY, null))) buddyKeyOn = accel
    else console.error(`[island] couldn't register ${accel} for the buddy; another app may own it`)
  }
  applyBuddyKey()
  const buddySettings = () => ({
    config: config.buddy,
    natural: { ready: kokoro.ready(config.buddy.voiceId), downloading: kokoro.downloading(), progress: kokoro.progress, error: kokoro.error ?? (naturalTrouble || null), sizeMb: KOKORO_MB },
    espeak: !!espeakBin(),
    systemVoice: systemVoice.available()?.split('/').pop() ?? null,
    name: config.character.name || 'Buddy',
    key: config.keys.buddy,
    routines: config.routines,
  })

  const alertsSeen = new Set<string>()
  // What the agent is doing, on the island: a live card, then the answer.
  const agentChanged = (run?: ClaudeRun) => {
    claudeUi?.push()
    if (run) buddy.taskUpdate(statusLine({ phase: run.phase, tool: run.tool ? `${run.tool.name} ${run.tool.detail}`.trim() : undefined, steps: run.steps }, run.startedAt, Date.now()), false)
    if (run && (run.phase === 'starting' || run.phase === 'thinking' || run.phase === 'tool' || run.phase === 'writing')) {
      if (transient.has('claude-done')) transient.dismiss('claude-done')
      store.upsert({ kind: 'claude', id: 'claude-run', priority: 2, run })
    }
  }
  const agentFinished = (run: ClaudeRun) => {
    store.remove('claude-run')
    // Work the buddy handed off: done (or not), said out loud if it's a good time.
    if (buddy.view().task && !buddy.view().task!.done) {
      const first = (run.reply || '').split(/(?<=[.!?])\s/)[0].slice(0, 160)
      const line = run.phase === 'done' ? `Done. ${first}` : run.phase === 'error' ? `It stopped: ${run.error ?? 'something went wrong'}.` : 'Stopped.'
      buddy.taskUpdate(run.phase === 'done' ? 'Done' : run.phase === 'error' ? 'Failed' : 'Stopped', true)
      announcer.event({ key: `task:${run.id}`, kind: 'task-done', priority: 'high', line })
    }
    if (run.phase === 'done')
      recap.turn({ at: Date.now(), session: run.sessionId ?? run.id, agent: config.ai.provider, project: run.cwd.split(/[\\/]/).filter(Boolean).pop() ?? '', ms: Date.now() - run.startedAt, files: 0, added: 0, removed: 0, commands: 0 })
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
  // ---- Ubuntu the island's way: apps, the system, the look (Settings › Desktop) ----
  const lockScreen = () =>
    execFile('loginctl', ['lock-session'], (e) => {
      if (e) execFile('xdg-screensaver', ['lock'], () => {})
    })
  const setThemePref = (t: 'light' | 'dark') => {
    config.theme = t
    saveConfig(config)
    theme.apply()
  }
  const commandBar = new CommandBar({
    home: homeDir(),
    notes: (q) => brain.quickSearch(q),
    agents: (q) => agency.search(q),
    startAgent: (id) => {
      try {
        const r = agency.start(id, 'claude')
        if (r.draft) send(win, CLAUDE.OPEN, { draft: r.draft })
      } catch (e) {
        osTell('The Agency', (e as Error).message)
      }
    },
    openNote: (p) => brain.open(p),
    openFile: (p) => void shell.openPath(p),
    openSettings: (s) => settings?.open(s),
    copy: (t) => clipboard.writeText(t),
    system: (a) => {
      if (a.t === 'theme') setThemePref(a.value)
      else if (a.t === 'dnd') setDnd(a.on)
      else if (a.t === 'volume') commands.push({ type: 'volume', value: a.value })
      else if (a.t === 'mute') commands.push({ type: 'mute' })
      else if (a.t === 'lock') lockScreen()
      else if (a.t === 'wallpaper') void wallpapers.setFromQuery(a.query)
      else if (a.t === 'call') void (a.on ? calls.start() : calls.stop()).catch((e) => osTell('Call notes', (e as Error).message))
    },
    askBuddy: (q) => void buddy.ask(q),
    askClaude: (q) => {
      try {
        claudeUi!.engine().ask(q)
        send(win, CLAUDE.OPEN, {})
      } catch {
        send(win, CLAUDE.OPEN, { draft: q })
      }
    },
    buddyName: () => config.character.name || 'the buddy',
  })
  ipcMain.handle(COMMAND.OPEN, (e) => e.sender === win.webContents && commandBar.show())
  let commandKeyOn = ''
  const applyCommandKey = () => {
    if (commandKeyOn) globalShortcut.unregister(commandKeyOn)
    commandKeyOn = ''
    if (!config.desktop.commandBar) return
    if (globalShortcut.register(config.keys.command, () => commandBar.toggle())) commandKeyOn = config.keys.command
    else console.error(`[island] couldn't register ${config.keys.command} for the command bar; another app may own it`)
  }
  applyCommandKey()
  const systemContext: SystemContext = {
    apps: () => commandBar.listApps(),
    launch: (app) => commandBar.launchApp(app),
    volume: (v) => commands.push({ type: 'volume', value: v }),
    mute: () => commands.push({ type: 'mute' }),
    theme: setThemePref,
    dnd: setDnd,
    lock: lockScreen,
  }
  // Ubuntu in the island's look: applied, it follows the island's light or dark and accent.
  const desktopLook = new DesktopLook()
  let lastLook: { changed: string[]; skipped: string[] } | null = null
  // One change to the look at a time: each reads what the last one kept for
  // Undo (a switch flipped while an apply was still setting keys lost them).
  let lookChain: Promise<unknown> = Promise.resolve()
  const oneAtATime = <T>(f: () => Promise<T>): Promise<T> => {
    const next = lookChain.then(f, f)
    lookChain = next.catch(() => {})
    return next
  }
  const applyLook = () => oneAtATime(applyLookNow)
  // Again with what changed (an accent, an extension), unless Undo came first.
  const reapplyLook = () => oneAtATime(async () => (config.desktop.applied ? applyLookNow() : undefined))
  const applyLookNow = async () => {
    const ext = (id: ExtensionId) => findExtension(EXTENSIONS.find((e) => e.id === id)!.uuid, homeDir())
    const extensions = { bar: config.desktop.hideBar ? ext('hidebar') : null, blur: config.desktop.blur ? ext('blur') : null, clock: config.desktop.hideClock ? ext('perfection') : null }
    const res = await desktopLook.apply(lookSettings({ accent: config.accent, dark: theme.isDark(), dock: config.desktop.dock, buttonsLeft: config.desktop.buttonsLeft, extensions }), config.desktop.original)
    config.desktop = { ...config.desktop, applied: true, original: res.original }
    saveConfig(config)
    lastLook = { changed: res.changed, skipped: res.skipped }
  }
  // Extensions that finish the look, from extensions.gnome.org (tests: a stand-in site and gnome-extensions).
  const extInstaller = new ExtensionInstaller({ egress, base: process.env.DI_EXT_BASE_URL, gnomeExtensions: process.env.DI_GNOME_EXTENSIONS, gnomeShell: process.env.DI_GNOME_SHELL })
  const extState = new Map<ExtensionId, { busy: boolean; error: string | null; justInstalled: boolean }>()
  // The login screen and boot splash: through pkexec (tests: a stand-in).
  const systemLook = new SystemLook()
  let systemState: { busy: 'apply' | 'undo' | null; note: string | null; error: string | null } = { busy: null, note: null, error: null }
  let looking: Promise<void> | null = null
  const followLook = () => {
    if (!config.desktop.applied || looking) return
    looking = reapplyLook()
      .catch((e) => console.error('[island] desktop look:', (e as Error).message))
      .finally(() => {
        looking = null
        settings?.changed()
      })
  }

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
        connected: { text: () => {
          const v = connectedHub.view()
          return viewText(v.manifest, v.view, v.phase)
        } },
        wallpaper: wallpapers,
        system: systemContext,
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
    tools: () => [...islandTools(), ...brain.tools('island')],
    askUser: (o) => agentApprovals.ask(o),
    system: () => agentSystemPrompt(config.character, brain.briefForAgent()),
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
  // Island OS's agents tell you through the island, like any notification.
  osTell = (title, line) => showNotification({ app: 'Island OS', summary: title, body: line, urgency: 'normal' })
  const showNotification = (n: NotificationData, invoke?: GtkInvoke) => {
    // Unique across restarts: the notification center keeps them.
    const id = `notif-${Date.now().toString(36)}-${notifSeq++}`
    center.add({ id, at: Date.now(), source: 'notification', app: n.app || 'Notification', icon: n.icon, title: n.summary, body: n.body, urgency: n.urgency })
    if (config.dnd) return
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
  const hub = new MessageHub(
    transient,
    (m) => center.add({ id: m.id, at: m.at, source: m.source, app: m.app, icon: m.icon, title: m.title, body: m.body, thread: m.thread }),
    () => config.dnd,
    (m) => brain.captureMessage(m),
  )
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
  // ---- drag actions: hold a dragged file still, and a ring of actions opens (X11) ----
  const languageName = (): string => {
    try {
      return new Intl.DisplayNames(['en'], { type: 'language' }).of(app.getLocale()) ?? 'English'
    } catch {
      return 'English'
    }
  }
  // Who can answer Ask and take Edit: Claude Code, the island's agent, or no one yet.
  const assistantKind = (): 'claude-code' | 'api' | null => {
    if (providerInfo(config.ai.provider).kind === 'claude-code') {
      const bin = findClaude()
      return bin && existsSync(bin) ? 'claude-code' : null
    }
    return setupProblem(config.ai) ? null : 'api'
  }
  const tesseract = () => (process.env.DI_TESSERACT === '' ? null : findExecutable('tesseract', ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin', 'C:\\Program Files\\Tesseract-OCR']))
  const dragJobs = new DragJobs({
    printPdf: printHtmlToPdf,
    soffice,
    cards: transient,
    saveTo: () => config.drag.saveTo,
    ghostscript: () => findExecutable('gs', ['/usr/bin', '/usr/local/bin']),
    tesseract,
    pdftoppm: () => findExecutable('pdftoppm', ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin']),
    ask: (prompt) => {
      try {
        claudeUi!.engine().ask(prompt)
        send(win, CLAUDE.OPEN, {})
      } catch {
        // Still busy with something else: the question waits in the box.
        send(win, CLAUDE.OPEN, { draft: prompt })
      }
    },
    edit: (draft) => send(win, CLAUDE.OPEN, { draft }),
    language: languageName,
    trash: (p) => shell.trashItem(p),
    ownDrag: () => dragRing.ownDrag(),
    island: () => win,
  })
  // Dragging a file to the screen's edge where your phone is sends it there (set up with Phone Drop below).
  let phoneEdge: PhoneEdge | null = null
  const dragRing = new DragRing({
    on: () => config.drag.on,
    opens: () => ({ when: config.drag.when, dwellMs: config.drag.dwellMs }),
    env: () => ({ libreOffice: !!soffice(), ocr: !!tesseract(), assistant: assistantKind(), language: languageName(), saveTo: config.drag.saveTo }),
    onDrop: (d) => dragJobs.run(d),
    // Tests can play a drag the way a system reports one.
    source: process.env.DI_FAKE_DRAG ? scriptedDragSource(process.env.DI_FAKE_DRAG) : undefined,
    also: {
      on: () => config.drop.on,
      events: {
        onStart: (files) => phoneEdge?.onStart(files),
        onSample: (s) => phoneEdge?.onSample(s),
        onEnd: () => phoneEdge?.onEnd(),
      },
    },
    // Holding a file over the island drops it there (Documents), not the ring; at the phone's edge it goes to the phone.
    avoid: (p) => overIsland(p) || !!phoneEdge?.near(p),
  })
  function overIsland(p: { x: number; y: number }): boolean {
    if (!cssRect) return false
    const b = win.getBounds()
    const m = 24
    return p.x >= b.x + cssRect.x - m && p.x <= b.x + cssRect.x + cssRect.width + m && p.y >= b.y + cssRect.y - m && p.y <= b.y + cssRect.y + cssRect.height + m
  }
  const applyDrag = () =>
    void dragRing.apply().then((ok) => {
      if (!ok && config.drag.on && dragRing.problem) console.log(`[island] drag actions are off here (${dragRing.problem})`)
    })
  applyDrag()

  // ---- Phone Drop: files flicked from your phone land here ----
  const dropFolder = () =>
    process.env.DI_DROP_FOLDER || (config.drop.folder === 'downloads' ? app.getPath('downloads') : config.drop.folder === 'desktop' ? app.getPath('desktop') : config.drop.folder)
  const dropFolderLabel = () =>
    process.env.DI_DROP_FOLDER ? basename(process.env.DI_DROP_FOLDER) : config.drop.folder === 'downloads' ? 'Downloads' : config.drop.folder === 'desktop' ? 'Desktop' : basename(config.drop.folder)
  const dropToken = () => process.env.DI_DROP_TOKEN || (config.drop.on && config.drop.secret ? decryptSecret(config.drop.secret) : '')
  const dropPort = () => Number(process.env.DI_DROP_PORT) || config.drop.port
  const dropOverlay = new DropOverlay({
    display: () => screen.getDisplayMatching(win.getBounds()),
    onLanded: (id) => phoneDrop.landed(id),
  })
  const phoneDrop = new PhoneDrop({
    overlay: dropOverlay,
    present: (id, job, made) => dragJobs.present(id, job, made),
    // Files land in the island's capsule.
    target: () => {
      const b = win.getBounds()
      return cssRect ? { x: b.x + cssRect.x + cssRect.width / 2, y: b.y + cssRect.y + cssRect.height / 2 } : { x: b.x + b.width / 2, y: b.y + 20 }
    },
    folderLabel: dropFolderLabel,
  })
  // The island on your phone: what it shows, and its answers (through the same decide() as a click here).
  const phoneLink = new PhoneLink({
    view: () => phoneView({ name: hostname(), activities: store.list(), sessions: sessions.list(), center: center.view(), now: Date.now() }),
    decide: (m) => decide(m),
    media: (c) => void media.command(c),
    art: async () => {
      const u = nowPlaying?.artUrl
      if (!u || !/^(file:\/\/|\/)/.test(u)) return null
      const p = u.startsWith('file://') ? fileURLToPath(u) : u
      const bytes = await readFile(p)
      if (bytes.length > 4 * 1024 * 1024) return null
      return { bytes, type: /\.png$/i.test(p) ? 'image/png' : /\.webp$/i.test(p) ? 'image/webp' : 'image/jpeg' }
    },
    delivered: (id, ok, device) => phoneOut.delivered(id, ok, device),
    progress: (id, got, size) => phoneOut.progress(id, got, size),
    onPhones: () => {
      tray?.refresh()
      settings?.changed()
    },
    call: (fn, args) => phoneCall(phoneRoutes, fn, args),
    voice: (audio, mime) => hearFromPhone(audio, mime),
  })
  phonePush = (topic, data) => phoneLink.push(topic, data)
  const phoneOut = new PhoneOut({ link: phoneLink, overlay: dropOverlay, present: (id, job, made) => dragJobs.present(id, job, made), side: () => ({ side: phoneDrop.side, at: phoneDrop.at }) })
  phoneEdge = new PhoneEdge({
    phone: () => phoneLink.connected()[0]?.device ?? null,
    side: () => phoneDrop.side,
    display: () => screen.getDisplayMatching(win.getBounds()),
    overlay: dropOverlay,
    dragged: () => dragRing.dragged(),
    send: (paths, from, at) => void phoneOut.send(paths, from, at),
    avoid: overIsland,
  })
  // Tests send files to the phone without the file picker.
  if (process.env.DI_TEST_HOOKS) (globalThis as any).__islandSendToPhone = (paths: string[]) => phoneOut.send(paths)
  phoneChanged = () => phoneLink.changed()
  store.onChange(phoneChanged)
  center.onChange(phoneChanged)
  const dropServer = new DropServer({
    token: dropToken,
    folder: dropFolder,
    name: () => hostname(),
    addresses: () => dropAddresses(networkInterfaces(), dropPort()),
    events: phoneDrop,
    extra: (req, res, url) => phoneLink.handle(req, res, url),
  })
  let dropProblem: string | null = null
  const applyDrop = async () => {
    dropServer.stop()
    dropProblem = null
    if (!config.drop.on) return
    if (!dropToken()) {
      config.drop.secret = encryptSecret(randomBytes(32).toString('base64url'))
      saveConfig(config)
    }
    dropProblem = await dropServer.start(dropPort())
    if (dropProblem) console.log(`[island] phone drop: ${dropProblem}`)
    else console.log(`[island] phone drop listening on port ${dropPort()}`)
  }
  void applyDrop()
  const dropStatus = (): DropStatus => {
    const urls = dropAddresses(networkInterfaces(), dropPort())
    const listening = dropServer.listening
    return {
      on: config.drop.on,
      folder: config.drop.folder,
      folderLabel: dropFolderLabel(),
      port: dropPort(),
      listening,
      problem: dropProblem ?? (config.drop.on && listening && !urls.length ? 'This computer has no Wi-Fi, Ethernet or Tailscale address for your phone to reach' : null),
      name: hostname(),
      phones: phoneLink.connected().map((p) => p.device),
      link: config.drop.on && dropToken() && urls.length ? dropPairingLink(hostname(), dropToken(), urls) : undefined,
    }
  }

  settings = new SettingsController({
    os: () => ({ engine: engineView(), sources: sourcesView() }),
    brain: () => brain.view(),
    wallpaper: () => wallpapers.view(),
    theme: () => ({ pref: config.theme, dark: theme.isDark(), island: config.islandTheme, accent: config.accent }),
    setTheme: (pref) => {
      config.theme = pref
      saveConfig(config)
      theme.apply()
    },
    buddy: () => buddySettings(),
    setBuddy: (patch) => {
      config.buddy = parseBuddyConfig({ ...config.buddy, ...patch })
      saveConfig(config)
      applyBuddyKey()
      if (!config.buddy.on) buddy.stop()
      buddy.refresh()
      // A new natural voice is a small download of its own.
      if (patch.voiceId && config.buddy.voice === 'natural' && !kokoro.ready(config.buddy.voiceId) && kokoro.ready('af_heart')) void kokoro.ensure(config.buddy.voiceId).catch(() => {})
    },
    buddyVoice: () => kokoro.ensure(config.buddy.voiceId),
    desktop: () => ({
      applied: config.desktop.applied,
      dock: config.desktop.dock,
      buttonsLeft: config.desktop.buttonsLeft,
      last: lastLook,
      commandBar: config.desktop.commandBar,
      commandKey: config.keys.command,
      supported: process.platform === 'linux',
      blur: config.desktop.blur,
      hideClock: config.desktop.hideClock,
      hideBar: config.desktop.hideBar,
      extensions: EXTENSIONS.map((e) => ({ id: e.id, name: e.name, what: e.what, installed: !!findExtension(e.uuid, homeDir()), busy: false, error: null, justInstalled: false, ...extState.get(e.id) })),
      system: { applied: config.desktop.system.applied, ...systemState },
    }),
    desktopSystem: async (what) => {
      if (systemState.busy) return
      systemState = { busy: what, note: null, error: null }
      settings?.changed()
      const sys = config.desktop.system
      const save = (s: typeof sys) => {
        config.desktop = { ...config.desktop, system: s }
        saveConfig(config)
      }
      if (what === 'apply') {
        const dark = theme.isDark()
        const login = await systemLook.loginScreen(config.accent, dark)
        if (!login.ok) return void (systemState = { busy: null, note: null, error: login.error })
        // Applied again (another accent): what to put back stays the very first.
        const gdmPrevious = sys.applied ? sys.gdmPrevious : login.previous
        save({ ...sys, applied: true, gdmPrevious })
        const splash = await systemLook.bootSplash(accentOf(config.accent).dark)
        if (!splash.ok) return void (systemState = { busy: null, note: 'The login screen is done.', error: splash.error })
        save({ applied: true, gdmPrevious, splashPrevious: sys.applied && sys.splashPrevious ? sys.splashPrevious : splash.previous })
        const name = yaruTheme(config.accent, dark)
        systemState = {
          busy: null,
          error: null,
          note: `Done: the login screen in ${name}${login.shellTheme ? '' : ' (this Ubuntu has no login screen theme in that accent, so only the light or dark and the apps’ colours change there)'}, and the island’s orb while Ubuntu starts. You’ll see them when you next start the computer.`,
        }
        return
      }
      const a = await systemLook.loginScreenUndo(sys.gdmPrevious)
      if (!a.ok) return void (systemState = { busy: null, note: null, error: a.error })
      const b = await systemLook.bootSplashUndo(sys.splashPrevious)
      if (!b.ok) return void (systemState = { busy: null, note: 'The login screen is back as it was.', error: b.error })
      save({ applied: false, gdmPrevious: '', splashPrevious: '' })
      systemState = { busy: null, error: null, note: 'Put back: the login screen and the boot splash are as they were.' }
    },
    desktopGetExtension: async (id) => {
      const e = EXTENSIONS.find((x) => x.id === id)
      if (!e) return
      extState.set(e.id, { busy: true, error: null, justInstalled: false })
      settings?.changed()
      const problem = await extInstaller.install(e.uuid)
      extState.set(e.id, { busy: false, error: problem, justInstalled: !problem })
      // Getting Hide Top Bar is asking for the bar hidden: it's on, and the island takes the top centre.
      if (!problem && e.id === 'hidebar') {
        config.desktop = { ...config.desktop, hideBar: true }
        saveConfig(config)
        if (config.dock.side !== 'top') setDock({ ...config.dock, side: 'top' })
      }
      // Applied already: it's turned on too (GNOME starts it when you log in again).
      if (!problem && config.desktop.applied) await reapplyLook().catch(() => {})
    },
    desktopSet: async (p) => {
      config.desktop = { ...config.desktop, ...p }
      saveConfig(config)
      if (p.commandBar !== undefined) applyCommandKey()
      // The bar hidden, the island takes its place: the top centre.
      if (p.hideBar === true && config.dock.side !== 'top') setDock({ ...config.dock, side: 'top' })
      const extChanged = p.blur !== undefined || p.hideClock !== undefined || p.hideBar !== undefined
      if ((p.dock !== undefined || p.buttonsLeft !== undefined || extChanged) && config.desktop.applied) await oneAtATime(async () => {
        if (!config.desktop.applied) return
        // Turned off after applying: put that part back as it was. (The extensions' keys go back together, then what's still wanted is set again.)
        const off: Record<string, string> = {}
        for (const [id, v] of Object.entries(config.desktop.original)) {
          const dockKey = id.startsWith('org.gnome.shell.extensions.dash-to-dock ')
          const buttons = id === 'org.gnome.desktop.wm.preferences button-layout'
          if ((dockKey && p.dock === false) || (buttons && p.buttonsLeft === false) || (extChanged && extensionKey(id))) off[id] = v
        }
        if (Object.keys(off).length) {
          await desktopLook.undo(off, extensionSchemaDirs(homeDir()))
          const keep = { ...config.desktop.original }
          for (const id of Object.keys(off)) delete keep[id]
          config.desktop = { ...config.desktop, original: keep }
          saveConfig(config)
        }
        await applyLookNow()
      })
    },
    desktopApply: () => applyLook(),
    desktopUndo: () =>
      oneAtATime(async () => {
        await desktopLook.undo(config.desktop.original, extensionSchemaDirs(homeDir()))
        config.desktop = { ...config.desktop, applied: false, original: {} }
        saveConfig(config)
        lastLook = null
      }),
    routineSet: (raw) => routines.upsert(raw),
    routineDel: (id) => routines.remove(id),
    buddyTry: () => speakSentence(`Hi, I’m ${config.character.name || 'your buddy'}. Ask me about anything on your screen.`),
    setPaused: (on) => {
      // While paused, services check every minute whether they may look again.
      config.privacy = { paused: on }
      saveConfig(config)
    },
    setLook: (l) => {
      if (l.island) config.islandTheme = l.island
      if (l.accent) config.accent = l.accent
      saveConfig(config)
      onLook()
    },
    drag: () => ({ available: process.platform === 'linux', problem: dragRing.problem }),
    drop: dropStatus,
    setDrop: async (p) => {
      if (p.folder !== undefined) {
        if (!['downloads', 'desktop'].includes(p.folder) && !isAbsolute(p.folder)) return 'Pick a folder'
        config.drop.folder = p.folder
      }
      if (p.on !== undefined) config.drop.on = p.on
      // A new token: phones paired before have to scan the QR again.
      if (p.forget) config.drop.secret = encryptSecret(randomBytes(32).toString('base64url'))
      saveConfig(config)
      if (p.on !== undefined || p.forget) await applyDrop()
      // Following drags (to send to the phone) depends on Phone Drop too.
      if (p.on !== undefined) applyDrag()
      return config.drop.on ? dropProblem : null
    },
    pickDropFolder: async (parent) => {
      const r = await dialog.showOpenDialog(parent, { title: 'Where files from your phone go', defaultPath: dropFolder(), properties: ['openDirectory', 'createDirectory'] })
      return r.canceled || !r.filePaths[0] ? null : r.filePaths[0]
    },
    onDrag: () => {
      applyDrag()
      tray?.refresh()
    },
    config,
    mail,
    whatsapp,
    whatsappCapable: WA_CDP || FAKE_WA,
    onConfigChanged: () => tray?.refresh(),
    onDockSide: (side) => setDock({ ...config.dock, side }),
    applyShortcut: () => applyShortcut(),
    setKey: (id, accel) => {
      const mac = process.platform === 'darwin'
      const next = accel ?? DEFAULT_SHORTCUTS[id]
      if (!validAccel(next)) return 'That can’t be a shortcut'
      const other = clash(config.keys, id, next, mac)
      if (other) return `${SHORTCUT_INFO[other].label} already uses ${shortcutLabel(next, mac)}`
      if (sameAccel(config.keys[id], next, mac)) return null
      // Free? (Another app may hold it; then registering fails.)
      if (!globalShortcut.register(next, () => {})) return `Another app is using ${shortcutLabel(next, mac)}`
      globalShortcut.unregister(next)
      config.keys = { ...config.keys, [id]: next }
      saveConfig(config)
      if (id === 'panel') applyShortcut()
      else if (id === 'dictate') applyDictate()
      else if (id === 'buddy') applyBuddyKey()
      else if (id === 'command') applyCommandKey()
      else if (id === 'voice') {
        claudeUi?.applyVoiceShortcut()
        claudeUi?.push()
      } else syncApprovalKeys(true)
      pushKeys()
      return null
    },
    onOpenOnHover: () => pushAppearance(),
    setCompanion: (on) => setCompanion(on),
    setDisplay: (pref) => setDisplay(pref),
    services: () => serviceHub,
    connected: () => connectedHub,
    clearRecap: () => recap.clear(),
    showRecap: () => showRecap(true),
    setDictation: (on) => {
      config.dictation = on
      saveConfig(config)
      applyDictate()
    },
    dictationActive: () => !!dictateKey,
    customSounds: () => customSounds.kinds(),
    openSounds: () => void shell.openPath(customSounds.ensureDir()),
    startTour: () => send(win, IPC.TOUR, null),
    pauseShortcuts: (on) => {
      if (on) {
        globalShortcut.unregisterAll()
        shortcutActive = false
        approvalKeys = null
        dictateKey = ''
        return
      }
      applyShortcut()
      applyDictate()
      claudeUi?.applyVoiceShortcut()
      syncApprovalKeys(true)
    },
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
    onPackages: () => {
      pushPackages()
      // Turning Connected off takes its capsule and cards away (and back on brings them back).
      const v = connectedHub.view()
      syncActivities(enabledPackages(config.packages).includes('connected') ? (v.view ?? null) : null, v.manifest ?? null, store, askDeadlines, Date.now())
    },
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
  wireBrain(brain)
  // After Settings exists: following the desktop's style tells it.
  theme.start()
  wireWallpaper(wallpapers, {
    setOptions: (patch) => {
      config.wallpaper = { ...config.wallpaper, ...patch }
      saveConfig(config)
      settings?.changed()
    },
    setKey: (site, key) => {
      config.wallpaper = { ...config.wallpaper, keys: { ...config.wallpaper.keys, [site]: key ? encryptSecret(key) : '' } }
      saveConfig(config)
      settings?.changed()
    },
    openFolder: () => void shell.openPath(process.env.DI_WALL_DIR || join(app.getPath('pictures'), 'Dynamic Island Wallpapers')),
    openUrl: (u) => {
      if (/^https:\/\//.test(u)) void shell.openExternal(u)
    },
  })
  // A live wallpaper that was on plays again (a moment after start, so the island comes first).
  setTimeout(() => void wallpapers.resume(), 2500)
  void brain.start().catch((e) => console.error('[brain] start:', e instanceof Error ? e.message : e))

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

  // The phone's calls: the island window's own (INVOKED), and a few of main's.
  phoneRoutes = {
    ...INVOKED,
    'system.read': () => (DEMO ? { ...demoSys } : system.read()),
    'system.cmd': (c: unknown) => {
      const cmd = parseSysCmd(c)
      if (!cmd) throw new Error('Unknown control')
      commands.push(cmd)
      return true
    },
    // A note from the phone, into the second brain's inbox.
    'brain.capture': (text: string) => {
      const problem = brain.capturePhone(text)
      if (problem) throw new Error(problem)
      return true
    },
    // Island OS on the phone: the same calls the island's Today and Agents panels make.
    ...Object.fromEntries(
      (['today.view', 'today.ask', 'agents.view', 'agents.monitor', 'agents.unmonitor', 'agents.research', 'agents.run'] as const).map((fn) => [
        fn,
        (...a: unknown[]) => {
          const f = osRoutes[fn] as ((...x: unknown[]) => unknown) | undefined
          if (!f) throw new Error('The island is still starting.')
          return f(...a)
        },
      ]),
    ),
    // A file in Documents, sent to the phone that asked (the glow and all).
    'docs.toPhone': async (id: string) => {
      const view = (await invokeKept(DOCS.VIEW)) as DocsView
      const f = view.files.find((x) => x.id === id && !x.missing)
      if (!f) throw new Error('That file isn’t in Documents any more')
      await phoneOut.send([f.path])
      return true
    },
  } as PhoneRoutes

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

  const decide = (m: DecisionMsg) => {
    if (agentApprovals.decide(m.id, m.decision === 'allow')) return
    // A connected package's card (a trade to approve…): your answer goes to it.
    const askId = askIdOf(m.id)
    if (askId !== null) {
      if (m.decision === 'ask') return // no terminal to answer in
      store.remove(m.id)
      const pkg = connectedHub.view().manifest?.name ?? 'Connected'
      void connectedHub.answer(askId, m.decision === 'allow').then((res) => {
        if (!res.ok && res.message)
          transient.show({ kind: 'notification', id: `connected-answer-${askId}`, priority: 5, notification: { app: pkg, summary: m.decision === 'allow' ? 'Not placed' : 'Couldn’t send your answer', body: res.message, urgency: 'normal' } }, 8000)
      })
      return
    }
    if (m.answers) recap.answer('question')
    else if (m.decision === 'allow' || m.decision === 'deny') recap.answer(m.decision)
    claude.resolve(m)
    store.remove(m.id)
  }
  // Answer the approval on screen from anywhere: Ctrl+Alt+Y / N / A. Grabbed
  // only while one waits, and never by taking focus (a stray "y" typed in
  // another app must not approve anything).
  // For Claude's questions: Ctrl+Alt+1…9 pick an option, Allow sends, Deny leaves it to the terminal.
  let approvalKeys: Record<ApprovalKey, string> | null = null
  let questionKeys: string[] = []
  let keyMode = ''
  const isQuestion = (r: ToolRequest | null) => !!r && r.toolName === 'AskUserQuestion' && !r.fromIsland && !!parseQuestions(r.toolInput)
  const syncApprovalKeys = (force = false) => {
    const front = frontApproval(store.list())
    const mode = !front ? '' : isQuestion(front) ? 'question' : 'approval'
    if (mode === keyMode && !force) return
    keyMode = mode
    if (approvalKeys) for (const accel of Object.values(approvalKeys)) globalShortcut.unregister(accel)
    for (const accel of questionKeys) globalShortcut.unregister(accel)
    questionKeys = []
    approvalKeys = front ? { allow: config.keys.allow, deny: config.keys.deny, always: config.keys.always } : null
    if (!approvalKeys) return
    for (const [key, accel] of Object.entries(approvalKeys)) {
      const ok = globalShortcut.register(accel, () => {
        const r = frontApproval(store.list())
        if (!r || (key === 'always' && !canAlways(r))) return
        if (isQuestion(r)) {
          // Allow sends the answers picked on the card; Deny leaves it to the terminal.
          if (key === 'allow') send(win, IPC.QUESTION_KEY, { send: true })
          else if (key === 'deny') decide({ id: r.id, decision: 'ask' })
          return
        }
        decide({ id: r.id, decision: key === 'deny' ? 'deny' : 'allow', ...(key === 'always' ? { always: true } : {}) })
      })
      if (!ok) console.error(`[island] couldn't register ${accel} for approvals; another app may own it`)
    }
    if (mode === 'question') {
      for (let n = 1; n <= 9; n++) {
        const accel = `Control+Alt+${n}`
        if (globalShortcut.register(accel, () => send(win, IPC.QUESTION_KEY, { n }))) questionKeys.push(accel)
      }
    }
  }
  store.onChange(() => syncApprovalKeys())

  wireIpc({
    onDecision: decide,
    onMediaCmd: (c) => void media.command(c),
    onSysCmd: (c) => commands.push(c),
    onRect: (r) => {
      cssRect = r
      updateHitArea()
      // A collapsed capsule is narrow; anything wider is a card or the panel.
      backdrop.setExpanded(!!r && r.width > 80)
    },
    onPanel: (open) => {
      panelOpen = open
      // The app you were in when you opened the panel (to attach for Claude).
      if (open) void frontWindow().then((w) => (lastFront = w && w.pid !== process.pid ? w : lastFront))
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
    onPin: (id) => transient.pin(id),
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
  let panelKey = ''
  const applyShortcut = (): boolean => {
    if (shortcutActive) globalShortcut.unregister(panelKey)
    shortcutActive = false
    panelKey = config.keys.panel
    if (config.shortcut) {
      shortcutActive = globalShortcut.register(panelKey, () => send(win, IPC.TOGGLE_PANEL, null))
      if (!shortcutActive) console.error(`[island] couldn't register ${panelKey}; another app may own it`)
    }
    return shortcutActive
  }
  applyShortcut()
  backdrop.start()
  const pushAppearance = () =>
    send(win, IPC.APPEARANCE, {
      appearance: config.appearance,
      blur: blurBehind,
      sounds: config.sounds,
      openOnHover: config.openOnHover,
      customSounds: customSounds.urls(),
      look: islandLook(config.islandTheme, theme.isDark(), config.accent),
    })
  onLook = () => {
    pushAppearance()
    followLook()
  }
  const pushCharacter = () => {
    send(win, IPC.CHARACTER, config.character)
    updateCompanion()
  }
  const pushPackages = () => send(win, IPC.PACKAGES, enabledTabs(config.packages))
  const pushKeys = () => send(win, IPC.KEYS, config.keys)
  // ---- Services you follow (GitHub, Vercel, Stripe, …) ----
  const serviceHub = new ServiceHub({
    config: () => config.services,
    token: (id) => {
      try {
        return config.services[id].secret ? decryptSecret(config.services[id].secret) : ''
      } catch {
        return ''
      }
    },
    onChange: () => send(win, SERVICES.CHANGED, serviceHub.view()),
    onEvent: (e) => showNotificationLater({ app: serviceInfo(e.service).name, summary: e.title, body: e.body, urgency: e.urgency }),
  })
  serviceHub.start()
  // ---- The connected package (your trading engine…) ----
  const askDeadlines = new Map<string, number>()
  const connectedHub = new ConnectedHub({
    config: () => config.connected,
    token: () => {
      try {
        return config.connected.secret ? decryptSecret(config.connected.secret) : ''
      } catch {
        return ''
      }
    },
    onChange: () => {
      send(win, CONNECTED.CHANGED, connectedHub.view())
      settings?.changed()
    },
    // Its capsule and its approval cards follow every view it sends.
    onView: (view, manifest) => syncActivities(enabledPackages(config.packages).includes('connected') ? view : null, manifest, store, askDeadlines, Date.now()),
    onNotify: (n, m) => {
      if (enabledPackages(config.packages).includes('connected')) showNotificationLater({ app: m.name, summary: n.title, body: n.body, urgency: n.urgency })
    },
  })
  connectedHub.start()
  ipcMain.handle(CONNECTED.VIEW, () => connectedHub.view())
  ipcMain.handle(CONNECTED.ACTION, (_e, id: unknown) => (typeof id === 'string' && /^[a-z0-9_-]{1,40}$/.test(id) ? connectedHub.action(id) : { ok: false, message: 'Unknown button' }))
  ipcMain.handle(SERVICES.VIEW, () => serviceHub.view())
  ipcMain.handle(SERVICES.REFRESH, (_e, id: unknown) => ((SERVICE_IDS as readonly unknown[]).includes(id) ? serviceHub.refresh(id as ServiceId) : undefined))
  ipcMain.handle(SERVICES.OPEN, (_e, url: unknown) => {
    if (typeof url === 'string' && safeServiceUrl(url, config.services.n8n.url)) void shell.openExternal(url)
  })
  // Attach the window you were in, for Claude (the Claude tab's paperclip).
  let lastFront: FrontWindow | null = null
  ipcMain.handle(CLAUDE.ATTACH, async () => (lastFront ? captureWindow(lastFront, join(app.getPath('userData'), 'attachments')) : null))
  // Dictate anywhere: the shortcut starts / finishes; what you said is typed into the focused app.
  let dictateKey = ''
  const applyDictate = () => {
    if (dictateKey) globalShortcut.unregister(dictateKey)
    dictateKey = ''
    if (!config.dictation) return
    const accel = config.keys.dictate
    if (globalShortcut.register(accel, () => send(win, IPC.DICTATE, null))) dictateKey = accel
    else console.error(`[island] couldn't register ${accel} for dictation; another app may own it`)
  }
  applyDictate()
  ipcMain.handle(IPC.DICTATE_TYPE, async (_e, text: unknown) => {
    if (typeof text !== 'string' || !text.trim() || text.length > 5000) return false
    return pasteIntoFocusedApp(dictatedText(text))
  })
  // The weekly recap: by itself once a week (Monday from 8 am, when nothing
  // needs you), or from the tray any time. Shows last week.
  const showRecap = (manual: boolean) => {
    const now = Date.now()
    const week = weekBefore(weekOf(now))
    const w = recap.weeks.find((x) => x.week === week)
    const card = recapCard(w, week, agentName)
    if (!manual) {
      recap.markShown(weekOf(now))
      if (card.empty) return
    }
    send(win, IPC.RECAP, { card, shareCard: recapCard(w, week, agentName, true), name: config.character.name })
  }
  const checkRecap = () => {
    if (!config.recap || !recapDue(Date.now(), recap.lastShown) || frontApproval(store.list())) return
    showRecap(false)
  }
  const recapTimer = setInterval(checkRecap, 10 * 60_000)
  setTimeout(checkRecap, 20_000)
  const recapImage = (dataUrl: unknown): Buffer | null =>
    typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,') && dataUrl.length < 20_000_000 ? Buffer.from(dataUrl.slice(22), 'base64') : null
  ipcMain.handle(IPC.RECAP_SAVE, (_e, dataUrl: unknown) => {
    const png = recapImage(dataUrl)
    if (!png) return null
    let dir = app.getPath('pictures')
    if (!existsSync(dir)) dir = app.getPath('downloads')
    mkdirSync(dir, { recursive: true })
    const base = `Weekly recap ${weekOf(Date.now())}`
    let file = join(dir, `${base}.png`)
    for (let i = 2; existsSync(file); i++) file = join(dir, `${base} (${i}).png`)
    writeFileSync(file, png)
    return file
  })
  ipcMain.handle(IPC.RECAP_COPY, (_e, dataUrl: unknown) => {
    const png = recapImage(dataUrl)
    if (!png) return false
    clipboard.writeImage(nativeImage.createFromBuffer(png))
    return true
  })
  ipcMain.handle(IPC.RECAP_SHOW, (_e, file: unknown) => {
    if (typeof file === 'string' && /Weekly recap .*\.png$/.test(file) && existsSync(file)) shell.showItemInFolder(file)
  })
  // The desktop companion: the character on your desktop too (Settings → Character).
  let lastBusy = Date.now()
  const companion = new Companion({
    spot: () => config.companion.at,
    saveSpot: (at) => {
      config.companion = { ...config.companion, at }
      saveConfig(config)
    },
    onClick: () => send(win, IPC.TOGGLE_PANEL, null),
  })
  const updateCompanion = () => {
    if (!config.companion.on) return
    const list = store.list()
    if (list.length) lastBusy = Date.now()
    companion.set(companionMood(list, lastBusy, new Date()), config.character)
  }
  const setCompanion = (on: boolean) => {
    config.companion = { ...config.companion, on }
    saveConfig(config)
    if (on) {
      companion.show()
      updateCompanion()
    } else companion.hide()
  }
  store.onChange(updateCompanion)
  const companionTimer = setInterval(updateCompanion, 15_000)
  if (config.companion.on) {
    companion.show()
    updateCompanion()
  }
  onSounds = () => {
    pushAppearance()
    settings?.changed()
  }
  // The orb's colour, picked on the island (right-click the character).
  ipcMain.on(IPC.SET_LOOK, (_e, patch) => {
    if (!patch || typeof patch !== 'object') return
    config.character = parseCharacter({
      ...config.character,
      ...('color' in patch ? { color: patch.color } : {}),
    })
    saveConfig(config)
    pushCharacter()
    settings?.changed()
  })
  win.webContents.on('did-finish-load', () => {
    claudeUi?.push()
    pushState()
    pushDock()
    pushAppearance()
    pushCharacter()
    pushPackages()
    pushKeys()
    send(win, NOTIFS.CHANGED, center.view())
    send(win, SESSIONS.CHANGED, sessions.list())
    send(win, SERVICES.CHANGED, serviceHub.view())
    send(win, CONNECTED.CHANGED, connectedHub.view())
    send(win, IPC.RECT_REQUEST, null)
    // Hello, once a day (not when a test drives the app).
    const automated = process.env.DI_NO_GREETING === '1' || process.argv.some((a) => a.startsWith('--remote-debugging-port'))
    const hello = greeting(config.greeted, dayOf(new Date()), automated)
    if (hello) {
      config.greeted = dayOf(new Date())
      saveConfig(config)
      setTimeout(() => send(win, IPC.GREET, hello), 600)
    }
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
      dnd: config.dnd,
      dragActions: process.platform === 'linux' ? config.drag.on : null,
      centerCount: center.view().entries.length,
      phone: phoneLink.connected()[0]?.device ?? null,
    }),
    {
      setDnd,
      setDragActions: (on) => {
        config.drag = { ...config.drag, on }
        saveConfig(config)
        applyDrag()
        settings?.changed()
      },
      clearAll: () => {
        clearCards()
        center.clearAll()
      },
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
      tour: () => send(win, IPC.TOUR, null),
      recap: () => showRecap(true),
      sendToPhone: async () => {
        const r = await dialog.showOpenDialog({ title: 'Send to your phone', properties: ['openFile', 'multiSelections'] })
        if (!r.canceled && r.filePaths.length) void phoneOut.send(r.filePaths)
      },
      sendFolderToPhone: async () => {
        const r = await dialog.showOpenDialog({ title: 'Send a folder to your phone', properties: ['openDirectory', 'multiSelections'] })
        if (!r.canceled && r.filePaths.length) void phoneOut.send(r.filePaths)
      },
      uninstall: () => void runUninstall(),
      quit: () => app.quit(),
    },
  )
  tray.create()

  cleanup = async () => {
    globalShortcut.unregisterAll()
    brain.stop()
    liveWall.stop()
    theme.stop()
    buddy.stop()
    pointer.destroy()
    routines.stop()
    commandBar.destroy()
    backdrop.stop()
    interactivity?.stop()
    shape?.close()
    if (sysTimer) clearInterval(sysTimer)
    transient.clear()
    sessions.stop()
    customSounds.close()
    clearInterval(followTimer)
    clearInterval(recapTimer)
    recap.flush()
    serviceHub.stop()
    connectedHub.stop()
    clearInterval(companionTimer)
    companion.hide()
    center.flush()
    clearInterval(crmTimer)
    crm.flush()
    dragRing.stop()
    phoneLink.stop()
    dropServer.stop()
    phoneDrop.stop()
    phoneEdge?.stop()
    dropOverlay.destroy()
    closeImagePage()
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
/** Where Claude Code, Codex and Gemini CLI keep what the brain connects to. */
function brainPaths() {
  const home = process.env.DI_HOME || homedir()
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || join(home, '.claude')
  return {
    home,
    claudeDir,
    claudeJson: join(process.env.CLAUDE_CONFIG_DIR || home, '.claude.json'),
    codexDir: process.env.CODEX_HOME || join(home, '.codex'),
    geminiDir: join(home, '.gemini'),
    projectsDir: join(claudeDir, 'projects'),
  }
}

/** Undo the brain's connections without starting it (uninstalling). */
async function disconnectBrain(): Promise<void> {
  const paths = brainPaths()
  const w = new Wiring({
    ...paths,
    vault: () => '',
    claudeBinary: () => process.env.DI_CLAUDE_BIN || findExecutable('claude', claudeSearchDirs(homedir())),
    hookCommand: () => '',
    mcp: () => null,
    brief: () => '',
  })
  for (const t of w.status()) if (t.parts.some((p) => p.done)) await w.disconnect(t.id)
}

async function runUninstall(argv: string[] = []): Promise<void> {
  let removeData = argv.includes('--delete-data')
  if (!argv.includes('--yes')) {
    const r = await dialog.showMessageBox({
      type: 'warning',
      message: 'Uninstall Dynamic Island?',
      detail:
        'This removes the app, starting it at login, and the hooks and status line it set up for Claude Code (and Codex, Gemini CLI or Cursor). Files it saved in your Documents folder are kept.',
      checkboxLabel: 'Also delete my settings, notes, CRM and sign-ins',
      checkboxChecked: false,
      buttons: ['Uninstall', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    })
    if (r.response !== 0) return
    removeData = r.checkboxChecked
  }
  let text: string
  try {
    text = await uninstall(
      {
        packaged: app.isPackaged,
        userData: app.getPath('userData'),
        appId: 'io.github.shashanksharma280201.dynamicisland',
        productName: 'Dynamic Island',
        debPackage: 'dynamic-island-linux',
        // Claude Code's hooks, and those added for Codex, Gemini CLI or Cursor.
        removeHook: async () => {
          if (isHookInstalled()) await setHookInstalled(false)
          // The brain's hooks, brief and tools in Claude Code, Codex and Gemini CLI (the brain itself stays).
          await disconnectBrain().catch((e) => console.error('uninstall: brain', e))
          for (const a of agentHooks()) if (a.installed) await setAgentHook(a.id, false).catch((e) => console.error(`uninstall: ${a.id} hook`, e))
        },
        removeStatusLine: async () => isUsageBridgeInstalled() && setUsageBridgeInstalled(false),
        removeLoginItem: () => setAutostart(false),
        trash: (p) => shell.trashItem(p),
      },
      { removeData },
    )
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    console.error(`[island] couldn't uninstall: ${why}`)
    if (!argv.includes('--yes')) await dialog.showMessageBox({ type: 'error', message: "Couldn't uninstall Dynamic Island", detail: why, buttons: ['OK'] })
    // Started only to uninstall: tell whoever ran it that it didn't work.
    if (process.argv.includes('--uninstall')) app.exit(1)
    return
  }
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
    // Quitting never waits on a stuck service for more than a few seconds.
    Promise.race([cleanup(), new Promise((r) => setTimeout(r, 5000))]).finally(() => {
      cleaned = true
      app.quit()
    })
  })
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => app.quit())
  // A mistake somewhere is logged, not shown as Electron's error box: that box
  // is modal, so the island (and anything waiting for it to quit) would hang on it.
  process.on('uncaughtException', (e) => console.error('[island] uncaught:', e))
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
