import { parseCharacter } from '@shared/character'
import { PACKAGES } from '@shared/packages'
import { PROVIDERS, baseUrlFor, modelFor, providerInfo, validBaseUrl, type ProviderId } from '@shared/ai'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { ClaudeSettings, SettingsState } from '@shared/types'
import { saveConfig, parseMailAccount, type Config, type StoredMailAccount } from './config'
import { encryptSecret, decryptSecret, isSecretStorageSecure } from './secrets'
import { isAutostartEnabled, setAutostart } from './autostart'
import { isHookInstalled, setHookInstalled } from './hookSetup'
import { MAIL_PRESETS, presetFor, testMailAccount, type MailAccount } from './providers/mail'
import type { MailManager } from './mailManager'
import type { WhatsAppService } from './providers/whatsapp'
import { SETTINGS } from './settingsChannels'

export { SETTINGS }

const here = dirname(fileURLToPath(import.meta.url))


/** Validate an account submitted by the settings form (no secret yet). Pure. */
export function parseAccountInput(raw: any): MailAccount | null {
  const acc = parseMailAccount({ ...raw, id: raw?.id || 'new', secret: '' })
  return acc ? { ...acc, id: raw?.id || '' } : null
}

type Deps = {
  config: Config
  mail: MailManager
  whatsapp: WhatsAppService
  /** Whether this process was started with the CDP port WhatsApp needs. */
  whatsappCapable: boolean
  onConfigChanged: () => void
  onDockSide: (side: 'left' | 'right' | 'top') => void
  onAppearance: () => void
  /** Re-register the global shortcut; returns whether it is active. */
  applyShortcut: () => boolean
  shortcutActive: () => boolean
  onFrosted: () => void
  /** Ask, then remove the island from this computer. */
  uninstall: () => void
  frostedAvailable: boolean
  notesFolder: string
  claude: () => ClaudeSettings
  /** Claude options changed (re-register shortcut, update the island). */
  onClaude: () => void
  pickClaudeFolder: (parent: BrowserWindow) => Promise<string | null>
  setUsageBridge: (on: boolean) => Promise<unknown>
  spotify: () => SettingsState['spotify']
  spotifySignIn: () => Promise<void>
  spotifySignOut: () => void
  onSpotifyClient: () => void
  onCharacter: () => void
  /** The AI provider, model or key changed. */
  onAi: (previous: ProviderId) => void
  listModels: (provider: ProviderId) => Promise<string[]>
  onPackages: () => void
}

/** Settings window + the IPC it uses. */
export class SettingsController {
  private win: BrowserWindow | null = null

  constructor(private d: Deps) {}

  state(): SettingsState {
    const { config, mail, whatsapp, whatsappCapable } = this.d
    return {
      notifications: config.notifications,
      autostart: isAutostartEnabled(),
      hookInstalled: isHookInstalled(),
      secureStorage: isSecretStorageSecure(),
      dockSide: config.dock.side,
      appearance: config.appearance,
      shortcut: config.shortcut,
      frosted: config.frosted,
      frostedAvailable: this.d.frostedAvailable,
      notesFolder: this.d.notesFolder,
      shortcutActive: this.d.shortcutActive(),
      whatsapp: {
        enabled: config.whatsapp,
        needsRestart: config.whatsapp && !whatsappCapable,
        status: whatsapp.current,
      },
      mail: config.mail.map(({ secret: _s, ...a }) => ({ ...a, status: mail.status(a.id) })),
      claude: this.d.claude(),
      spotify: this.d.spotify(),
      character: config.character,
      packages: config.packages,
      ai: {
        provider: config.ai.provider,
        providers: PROVIDERS.map((p) => ({ id: p.id, model: modelFor(config.ai, p.id), baseUrl: baseUrlFor(config.ai, p.id), hasKey: !!config.ai.keys[p.id] })),
      },
    }
  }

  /** Push fresh state to the settings window, if open. */
  changed(): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(SETTINGS.CHANGED, this.state())
  }

  private save(): void {
    saveConfig(this.d.config)
    this.d.onConfigChanged()
    this.changed()
  }

  open(section?: string): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show()
      this.win.focus()
      return
    }
    this.win = new BrowserWindow({
      width: 620,
      height: 760,
      minWidth: 480,
      minHeight: 480,
      title: 'Dynamic Island Settings',
      backgroundColor: '#15171c',
      autoHideMenuBar: true,
      webPreferences: {
        preload: resolve(here, '../preload/preload.mjs'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.win.webContents.on('will-navigate', (e) => e.preventDefault())
    const hash = section ? `#${section}` : ''
    if (process.env.ELECTRON_RENDERER_URL) {
      void this.win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/settings.html${hash}`)
    } else {
      void this.win.loadFile(resolve(here, '../renderer/settings.html'), { hash: section })
    }
    this.win.on('closed', () => (this.win = null))
  }

  wire(): void {
    const { config, mail, whatsapp } = this.d
    ipcMain.handle(SETTINGS.GET, () => this.state())
    ipcMain.handle(SETTINGS.SET_NOTIFICATIONS, (_e, on) => {
      config.notifications = on === true
      this.save()
    })
    ipcMain.handle(SETTINGS.SET_AUTOSTART, (_e, on) => {
      setAutostart(on === true)
      this.changed()
      this.d.onConfigChanged()
    })
    ipcMain.handle(SETTINGS.SET_FROSTED, (_e, on) => {
      config.frosted = on === true
      this.save()
      this.d.onFrosted()
    })
    ipcMain.handle(SETTINGS.OPEN_NOTES_FOLDER, async () => {
      await mkdir(this.d.notesFolder, { recursive: true })
      const err = await shell.openPath(this.d.notesFolder)
      if (err) throw new Error(err)
    })
    ipcMain.handle(SETTINGS.SET_CLAUDE, (_e, patch) => {
      const c = config.claude
      const p = patch && typeof patch === 'object' ? patch : {}
      if (['default', 'acceptEdits', 'auto'].includes(p.permissionMode)) c.permissionMode = p.permissionMode
      if (typeof p.voiceShortcut === 'boolean') c.voiceShortcut = p.voiceShortcut
      if (p.sttModel === 'tiny' || p.sttModel === 'base') c.sttModel = p.sttModel
      if (typeof p.binary === 'string' && p.binary.length < 500) c.binary = p.binary.trim()
      this.save()
      this.d.onClaude()
      this.changed()
    })
    ipcMain.handle(SETTINGS.SET_SPOTIFY_CLIENT, (_e, id) => {
      const v = typeof id === 'string' ? id.trim() : ''
      if (!/^[A-Za-z0-9]{0,64}$/.test(v)) throw new Error('That doesn\u2019t look like a Spotify Client ID')
      if (v !== config.spotify.clientId) {
        config.spotify.clientId = v
        this.save()
        this.d.onSpotifyClient()
      }
    })
    ipcMain.handle(SETTINGS.SPOTIFY_SIGN_IN, () => this.d.spotifySignIn())
    ipcMain.handle(SETTINGS.SPOTIFY_SIGN_OUT, () => this.d.spotifySignOut())
    ipcMain.handle(SETTINGS.PICK_CLAUDE_FOLDER, () => (this.win ? this.d.pickClaudeFolder(this.win) : null))
    ipcMain.handle(SETTINGS.SET_USAGE_BRIDGE, async (_e, on) => {
      await this.d.setUsageBridge(on === true)
      this.d.onClaude()
      this.changed()
    })
    ipcMain.handle(SETTINGS.SET_SHORTCUT, (_e, on) => {
      config.shortcut = on === true
      this.save()
      this.d.applyShortcut()
      this.changed()
    })
    ipcMain.handle(SETTINGS.SET_CHARACTER, (_e, patch) => {
      const switching = typeof patch?.id === 'string' && patch.id !== config.character.id
      config.character = parseCharacter({
        id: typeof patch?.id === 'string' ? patch.id : config.character.id,
        // Switching without renaming takes the new character's own name.
        name: typeof patch?.name === 'string' ? patch.name : switching ? '' : config.character.name,
      })
      this.save()
      this.d.onCharacter()
    })
    const isProvider = (v: unknown): v is ProviderId => typeof v === 'string' && PROVIDERS.some((p) => p.id === v)
    ipcMain.handle(SETTINGS.SET_AI, (_e, patch) => {
      const previous = config.ai.provider
      const target: ProviderId = isProvider(patch?.provider) ? patch.provider : previous
      if (isProvider(patch?.provider)) config.ai.provider = patch.provider
      if (typeof patch?.model === 'string') {
        const m = patch.model.trim()
        if (m && !/^[\w.:/@+-]{1,120}$/.test(m)) throw new Error('That doesn’t look like a model name.')
        if (m) config.ai.models[target] = m
        else delete config.ai.models[target]
      }
      if (typeof patch?.baseUrl === 'string') {
        if (target !== 'ollama' && target !== 'custom') throw new Error('This provider’s address can’t be changed.')
        const u = patch.baseUrl.trim()
        if (u && !validBaseUrl(u)) throw new Error('Enter a full address, like http://localhost:11434/v1')
        if (u) config.ai.baseUrls[target] = u
        else delete config.ai.baseUrls[target]
      }
      this.save()
      this.d.onAi(previous)
    })
    ipcMain.handle(SETTINGS.SET_AI_KEY, (_e, provider, key) => {
      if (!isProvider(provider) || providerInfo(provider).kind === 'claude-code') throw new Error('Invalid provider')
      const k = typeof key === 'string' ? key.trim() : ''
      if (k.length > 500 || /\s/.test(k)) throw new Error('That doesn’t look like an API key.')
      if (k) config.ai.keys[provider] = encryptSecret(k)
      else delete config.ai.keys[provider]
      this.save()
      this.d.onAi(config.ai.provider)
    })
    ipcMain.handle(SETTINGS.SET_PACKAGE, (_e, id, on) => {
      const p = PACKAGES.find((x) => x.id === id)
      if (!p || p.required) throw new Error('That package can’t be turned off.')
      const rest = config.packages.disabled.filter((x) => x !== p.id)
      config.packages = { disabled: on === true ? rest : [...rest, p.id] }
      this.save()
      this.d.onPackages()
    })
    ipcMain.handle(SETTINGS.AI_MODELS, (_e, provider) => {
      if (!isProvider(provider)) throw new Error('Invalid provider')
      return this.d.listModels(provider)
    })
    ipcMain.handle(SETTINGS.SET_APPEARANCE, (_e, a) => {
      if (a !== 'glass' && a !== 'solid') return
      config.appearance = a
      this.save()
      this.d.onAppearance()
    })
    ipcMain.handle(SETTINGS.SET_DOCK_SIDE, (_e, side) => {
      if (side === 'left' || side === 'right' || side === 'top') this.d.onDockSide(side)
    })
    ipcMain.handle(SETTINGS.SET_HOOK, async (_e, on) => {
      await setHookInstalled(on === true)
      this.changed()
      this.d.onConfigChanged()
    })
    ipcMain.handle(SETTINGS.SET_WHATSAPP, async (_e, on) => {
      config.whatsapp = on === true
      this.save()
      if (!config.whatsapp) await whatsapp.stop()
      else if (this.d.whatsappCapable) void whatsapp.start()
      this.changed()
      return { restart: config.whatsapp && !this.d.whatsappCapable }
    })
    ipcMain.handle(SETTINGS.UNINSTALL, () => this.d.uninstall())
    ipcMain.handle(SETTINGS.RESTART, () => {
      app.relaunch()
      app.quit()
    })
    ipcMain.handle(SETTINGS.WA_PAIR, (_e, phone) => {
      if (typeof phone !== 'string' || !/^\+?[\d\s-]{6,20}$/.test(phone)) {
        throw new Error('Enter your phone number with country code, e.g. +91 98765 43210')
      }
      return whatsapp.pairingCode(phone)
    })
    ipcMain.handle(SETTINGS.WA_LOGOUT, async () => {
      await whatsapp.logout()
      if (config.whatsapp && this.d.whatsappCapable) void whatsapp.start()
    })
    ipcMain.handle(SETTINGS.MAIL_PRESETS, (_e, email) => ({
      presets: MAIL_PRESETS,
      suggested: typeof email === 'string' ? presetFor(email) : null,
    }))
    ipcMain.handle(SETTINGS.MAIL_TEST, async (_e, raw, password) => {
      const acc = parseAccountInput(raw)
      if (!acc) throw new Error('Check the server names and ports')
      await testMailAccount(acc, this.passwordFor(acc.id, password))
    })
    ipcMain.handle(SETTINGS.MAIL_SAVE, async (_e, raw, password) => {
      const acc = parseAccountInput(raw)
      if (!acc) throw new Error('Check the server names and ports')
      const pass = this.passwordFor(acc.id, password)
      const stored: StoredMailAccount = {
        ...acc,
        id: acc.id || randomUUID(),
        secret: encryptSecret(pass),
      }
      const i = config.mail.findIndex((a) => a.id === stored.id)
      if (i >= 0) config.mail[i] = stored
      else config.mail.push(stored)
      this.save()
      const { secret: _s, ...plain } = stored
      await mail.set(plain, pass)
      return stored.id
    })
    ipcMain.handle(SETTINGS.MAIL_REMOVE, async (_e, id) => {
      config.mail = config.mail.filter((a) => a.id !== id)
      this.save()
      await mail.remove(String(id))
    })
  }

  /** A new password if one was typed, else the saved one for this account. */
  private passwordFor(id: string, typed: unknown): string {
    if (typeof typed === 'string' && typed) return typed
    const saved = this.d.config.mail.find((a) => a.id === id)
    if (!saved) throw new Error('Enter the password (or app password)')
    return decryptSecret(saved.secret)
  }
}
