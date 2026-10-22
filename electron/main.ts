import { app, clipboard, dialog, ipcMain, nativeImage, screen, globalShortcut, shell, type Display } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { ActivityStore } from './store'
import { ClaudeServer } from './providers/claude'
import {
  NotificationMonitor,
  GtkActionInvoker,
  displayMs,
  type GtkInvoke,
} from './providers/notifications'
import { CommandQueue } from './providers/system'
import { currentPlatform } from './platform'
import { WhatsAppService, WwebjsEngine } from './providers/whatsapp'
import { FakeWhatsAppEngine } from './providers/whatsappFake'
import { createIslandWindow, placeIslandWindow } from './window'
import { Interactivity } from './interactivity'
import { InputShape, shapeRect } from './inputShape'
import { closeCursor } from './cursor'
import { send, wireIpc } from './ipc'
import { IslandTray } from './tray'
import { dayOf, greeting, loadConfig, saveConfig } from './config'
import { decryptSecret } from './secrets'
import { isAutostartEnabled, setAutostart } from './autostart'
import {
  agentHooks,
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
import { spawn } from 'node:child_process'
import { usageAlerts, type ClaudeRun } from '@shared/claude'
import { homedir } from 'node:os'
import { TransientCards } from './transient'
import { uninstall } from './uninstall'
import { MessageHub, MESSAGE_MS } from './messages'
import { NotificationCenter, NOTIFS, wireNotificationCenter } from './notifCenter'
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
  // What differs per OS: media, system controls, notifications, the cursor.
  const platform = await currentPlatform()
  const LINUX = platform.id === 'linux'
  // A menu-bar app on macOS: no Dock icon.
  if (process.platform === 'darwin') app.dock?.hide()
  const store = new ActivityStore()
  const win = createIslandWindow(config.dock.side, config.display)
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
  serveMedia(() => waForMedia, (kind) => customSounds.read(kind))
  let claudeUi: ClaudeController | null = null
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
  win.showInactive()

  const pushState = () => send(win, IPC.STATE, store.list())
  // The character's eyes follow the pointer anywhere on screen: 15 times a
  // second, and only when it moved.
  let lastCursor = ''
  setInterval(() => {
    if (win.isDestroyed() || !win.isVisible()) return
    const c = screen.getCursorScreenPoint()
    const b = win.getBounds()
    const at = { x: c.x - b.x, y: c.y - b.y }
    const k = `${at.x},${at.y}`
    if (k === lastCursor) return
    lastCursor = k
    send(win, IPC.CURSOR, at)
  }, 66)
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
  const setDnd = (on: boolean) => {
    if (config.dnd === on) return
    config.dnd = on
    saveConfig(config)
    center.changed()
    settings?.changed()
  }
  const clearCards = () => {
    for (const a of store.list()) if (a.kind === 'notification' || a.kind === 'message') transient.dismiss(a.id)
  }
  wireNotificationCenter(center, { clearCards, setDnd })
  const notes = new NotesStore(join(app.getPath('userData'), 'notes'))
  // ---- documents: files you add, and what's made from them ----
  // LibreOffice (deb, snap or flatpak), for exact Office → PDF conversions.
  const soffice = (): string | null => {
    if (process.env.DI_SOFFICE !== undefined) return process.env.DI_SOFFICE || null
    if (process.platform === 'darwin') return findExecutable('soffice', ['/Applications/LibreOffice.app/Contents/MacOS'])
    if (process.platform === 'win32')
      return findExecutable('soffice', [join(process.env.ProgramFiles || 'C:\\Program Files', 'LibreOffice', 'program'), join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'LibreOffice', 'program')])
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
    () => LINUX && config.frosted && config.appearance === 'glass' && !WAYLAND && process.env.DI_BACKDROP !== 'off',
    (img) => send(win, IPC.BACKDROP, img),
  )
  let shortcutActive = false

  // ---- interactivity: clicks reach the island, everything else passes through ----
  // Preferred: an X11 input shape (the X server routes clicks; no polling).
  // Fallback: poll the global cursor and toggle ignore-mouse-events.
  let cssRect: Rect | null = null
  let dragging = false
  let shape: InputShape | null = null
  if (LINUX && process.env.DI_INPUT !== 'poll') {
    try {
      win.setIgnoreMouseEvents(false) // resets Electron's own input region first
      shape = await InputShape.create(win)
    } catch (e: any) {
      console.error('[island] X11 input shape unavailable, falling back to cursor polling:', e?.message ?? e)
      shape = null
    }
  }
  const interactivity = shape ? null : new Interactivity(win, platform.readCursor)
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
        // X11 reports the pointer in physical pixels; macOS and Windows in points.
        cssRect && toPhysicalRect(cssRect, win.getBounds(), platform.cursorPhysical ? display.scaleFactor : 1, 4),
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
  const sessions = new SessionTracker({
    onChange: (list) => {
      send(win, SESSIONS.CHANGED, list)
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
    onWaiting: (x) => store.upsert({ kind: 'session', id: `session-wait-${x.id}`, priority: 7, session: x }),
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
  const media = platform.media()
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
  // GNotification buttons go over D-Bus (Linux only).
  const invoker = LINUX ? new GtkActionInvoker() : null
  transient.onDismiss((id) => invokes.delete(id))
  let notifSeq = 0
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
  // Other apps' notifications can only be watched on Linux (D-Bus).
  const notifications = LINUX ? new NotificationMonitor() : null
  notifications?.onNotify((n, invoke) => {
    if (config.notifications) showNotification(n, invoke)
  })
  await notifications?.start().catch((e) => console.error('notifications:', e))

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
  const dragJobs = new DragJobs({
    printPdf: printHtmlToPdf,
    soffice,
    cards: transient,
    saveTo: () => config.drag.saveTo,
    ghostscript: () => findExecutable('gs', ['/usr/bin', '/usr/local/bin']),
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
  const dragRing = new DragRing({
    on: () => config.drag.on,
    opens: () => ({ when: config.drag.when, dwellMs: config.drag.dwellMs }),
    env: () => ({ libreOffice: !!soffice(), assistant: assistantKind(), language: languageName(), saveTo: config.drag.saveTo }),
    onDrop: (d) => dragJobs.run(d),
    // Tests can play a drag the way a system reports one.
    source: process.env.DI_FAKE_DRAG ? scriptedDragSource(process.env.DI_FAKE_DRAG) : undefined,
    // Holding a file over the island drops it there (Documents), not the ring.
    avoid: (p) => {
      if (!cssRect) return false
      const b = win.getBounds()
      const m = 24
      return p.x >= b.x + cssRect.x - m && p.x <= b.x + cssRect.x + cssRect.width + m && p.y >= b.y + cssRect.y - m && p.y <= b.y + cssRect.y + cssRect.height + m
    },
  })
  const applyDrag = () =>
    void dragRing.apply().then((ok) => {
      if (!ok && config.drag.on && dragRing.problem) console.log(`[island] drag actions are off here (${dragRing.problem})`)
    })
  applyDrag()

  settings = new SettingsController({
    drag: () => ({ available: process.platform === 'linux', problem: dragRing.problem }),
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
    frostedAvailable: LINUX && !WAYLAND,
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
  const system = platform.system()
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

  const decide = (m: DecisionMsg) => {
    if (agentApprovals.decide(m.id, m.decision === 'allow')) return
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
      invoker?.invoke(inv.appId, button).catch((e) => console.error('notification action:', e))
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
    send(win, IPC.APPEARANCE, { appearance: config.appearance, blur: blurBehind, sounds: config.sounds, openOnHover: config.openOnHover, customSounds: customSounds.urls() })
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
  // The wardrobe on the island (right-click the character).
  ipcMain.on(IPC.SET_LOOK, (_e, patch) => {
    if (!patch || typeof patch !== 'object') return
    config.character = parseCharacter({
      ...config.character,
      ...('outfit' in patch ? { outfit: patch.outfit } : {}),
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
    sessions.stop()
    customSounds.close()
    clearInterval(followTimer)
    clearInterval(recapTimer)
    recap.flush()
    serviceHub.stop()
    clearInterval(companionTimer)
    companion.hide()
    center.flush()
    clearInterval(crmTimer)
    crm.flush()
    dragRing.stop()
    closeImagePage()
    claudeCode.dispose()
    apiAgent.dispose()
    mcpRun?.abort()
    islandMcp.stop()
    spotify.stop()
    tray?.destroy()
    invoker?.stop()
    await Promise.allSettled([
      claude.stop(),
      media.stop(),
      notifications?.stop(),
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
