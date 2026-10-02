import { BrowserWindow, dialog, globalShortcut, ipcMain } from 'electron'
import { CLAUDE } from './claudeChannels'
import type { ClaudeCode } from './claudeCode'
import type { ApiAgent } from './agent/agent'
import { modelFor, providerInfo, setupProblem } from '@shared/ai'
import type { SpeechModels } from './stt'
import type { Config } from './config'
import type { ClaudeView } from '@shared/claude'

export const VOICE_SHORTCUT = 'Control+Alt+Space'

type Deps = {
  win: BrowserWindow
  config: Config
  claude: ClaudeCode
  /** The island's own agent, used for every provider except Claude Code. */
  agent: ApiAgent
  speech: SpeechModels
  saveConfig: () => void
  setUsageBridge: (on: boolean) => Promise<unknown>
  setApprovals: (on: boolean) => Promise<unknown>
  /** Something the Settings window shows changed. */
  onSettingsChanged: () => void
}

/**
 * Answer the island's first "what's the Claude state?" as soon as the window
 * loads, even though the services behind it start a moment later.
 */
export function earlyClaudeState(): (c: ClaudeController) => void {
  let ready: (c: ClaudeController) => void = () => {}
  const controller = new Promise<ClaudeController>((r) => (ready = r))
  ipcMain.handle(CLAUDE.STATE, async () => (await controller).view())
  return ready
}

/** Wires the island's Claude tab to Claude Code, speech models and settings. */
export class ClaudeController {
  private voiceActive: string | null = null

  constructor(private d: Deps) {}

  /** Claude Code, or the island's agent for an API provider. */
  engine(): ClaudeCode | ApiAgent {
    return providerInfo(this.d.config.ai.provider).kind === 'claude-code' ? this.d.claude : this.d.agent
  }

  view(): ClaudeView {
    const ai = this.d.config.ai
    const p = providerInfo(ai.provider)
    const state = this.engine().state()
    return {
      ...state,
      // Plan limits belong to Claude Code; keep showing them only there.
      usage: p.kind === 'claude-code' ? state.usage : undefined,
      assistant: { provider: p.id, label: p.label, model: p.kind === 'claude-code' ? '' : modelFor(ai), problem: setupProblem(ai) },
      stt: this.d.speech.status(this.d.config.claude.sttModel),
      permissionMode: this.d.config.claude.permissionMode,
      voiceShortcut: this.voiceActive,
    }
  }

  push(): void {
    const { win } = this.d
    if (!win.isDestroyed()) win.webContents.send(CLAUDE.CHANGED, this.view())
  }

  get voiceShortcut(): string | null {
    return this.voiceActive
  }

  /** (Re)register the global talk shortcut. */
  applyVoiceShortcut(): string | null {
    if (this.voiceActive) globalShortcut.unregister(this.voiceActive)
    this.voiceActive = null
    if (this.d.config.claude.voiceShortcut) {
      const ok = globalShortcut.register(VOICE_SHORTCUT, () => this.d.win.webContents.send(CLAUDE.VOICE))
      this.voiceActive = ok ? 'Ctrl+Alt+Space' : null
      if (!ok) console.error(`[island] couldn't register ${VOICE_SHORTCUT}; another app may own it`)
    }
    return this.voiceActive
  }

  async pickFolder(parent?: BrowserWindow): Promise<string | null> {
    const opts = {
      title: 'Project folder for Claude Code',
      defaultPath: this.d.claude.cwd(),
      properties: ['openDirectory' as const, 'createDirectory' as const],
    }
    const r = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts)
    const dir = r.canceled ? null : r.filePaths[0] ?? null
    if (dir) {
      this.d.config.claude.cwd = dir
      this.d.saveConfig()
      this.push()
      this.d.onSettingsChanged()
    }
    return dir
  }

  wire(): void {
    const { speech, config } = this.d
    ipcMain.handle(CLAUDE.ASK, (_e, text) => {
      if (typeof text !== 'string') throw new Error('Invalid command')
      this.engine().ask(text)
    })
    ipcMain.handle(CLAUDE.STOP, () => this.engine().stop())
    ipcMain.handle(CLAUDE.NEW, () => this.engine().newConversation())
    ipcMain.handle(CLAUDE.PICK_FOLDER, () => this.pickFolder())
    ipcMain.handle(CLAUDE.SET_BRIDGE, async (_e, on) => {
      await this.d.setUsageBridge(on === true)
      this.push()
      this.d.onSettingsChanged()
    })
    ipcMain.handle(CLAUDE.SET_APPROVALS, async (_e, on) => {
      await this.d.setApprovals(on === true)
      this.push()
      this.d.onSettingsChanged()
    })
    ipcMain.handle(CLAUDE.STT_ENSURE, () => speech.ensure(config.claude.sttModel))
  }
}
