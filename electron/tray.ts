import { app, Menu, Tray, nativeImage } from 'electron'
import { join } from 'node:path'

export type TrayState = {
  notifications: boolean
  hookInstalled: boolean
  autostart: boolean
}

export type TrayActions = {
  setNotifications: (on: boolean) => void
  setHook: (on: boolean) => Promise<void>
  setAutostart: (on: boolean) => void
  openSettings: () => void
  uninstall: () => void
  quit: () => void
}

function iconPath(): string {
  const base = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'assets')
  // macOS: a menu-bar sized template (black + alpha) it tints for light and dark menu bars.
  return join(base, process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png')
}

/**
 * Status-area menu: toggles plus Quit (the island has no window chrome or
 * taskbar entry). On GNOME this needs the AppIndicator extension, which Ubuntu
 * ships enabled; without it `dynamic-island-linux --quit` still works.
 */
export class IslandTray {
  private tray: Tray | null = null

  constructor(
    private state: () => TrayState,
    private actions: TrayActions,
  ) {}

  create(): void {
    try {
      const img = nativeImage.createFromPath(iconPath())
      this.tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img)
      this.tray.setToolTip('Dynamic Island')
      this.refresh()
    } catch (e) {
      console.error('tray unavailable:', e)
    }
  }

  refresh(): void {
    if (!this.tray) return
    const s = this.state()
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Dynamic Island', enabled: false },
        { type: 'separator' },
        { label: 'Settings… (WhatsApp, Mail)', click: () => this.actions.openSettings() },
        { type: 'separator' },
        {
          label: 'Show desktop notifications',
          type: 'checkbox',
          checked: s.notifications,
          click: (i) => {
            this.actions.setNotifications(i.checked)
            this.refresh()
          },
        },
        {
          label: 'Claude Code approvals (hook)',
          type: 'checkbox',
          checked: s.hookInstalled,
          click: async (i) => {
            await this.actions.setHook(i.checked).catch((e) => console.error('hook:', e))
            this.refresh()
          },
        },
        {
          label: 'Start at login',
          type: 'checkbox',
          checked: s.autostart,
          click: (i) => {
            this.actions.setAutostart(i.checked)
            this.refresh()
          },
        },
        { type: 'separator' },
        { label: 'Uninstall Dynamic Island…', click: () => this.actions.uninstall() },
        { label: 'Quit', click: () => this.actions.quit() },
      ]),
    )
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
