import { app } from 'electron'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Quote one argument for a .desktop Exec line. Pure. */
export function quoteExecArg(s: string): string {
  return /[\s"'\\$`]/.test(s) ? `"${s.replace(/(["\\$`])/g, '\\$1')}"` : s
}

/** Contents of the XDG autostart entry. Pure. */
export function desktopEntry(exec: string[]): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Dynamic Island',
    'Comment=Mac-style Dynamic Island for Linux',
    `Exec=${exec.map(quoteExecArg).join(' ')}`,
    'Icon=dynamic-island-linux',
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    'X-GNOME-Autostart-Delay=3',
    '',
  ].join('\n')
}

export function autostartFile(env = process.env): string {
  const base = env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(base, 'autostart', 'dynamic-island-linux.desktop')
}

/** The command that relaunches this exact build of the app. */
function launchCommand(): string[] {
  if (process.env.APPIMAGE) return [process.env.APPIMAGE]
  if (app.isPackaged) return [process.execPath]
  return [process.execPath, app.getAppPath()]
}

/** macOS and Windows keep their own list of login items. */
const nativeLogin = process.platform === 'darwin' || process.platform === 'win32'

export function isAutostartEnabled(): boolean {
  if (nativeLogin) return app.getLoginItemSettings().openAtLogin
  return existsSync(autostartFile())
}

export function setAutostart(on: boolean): void {
  if (nativeLogin) {
    // In development the app is electron + the project folder.
    app.setLoginItemSettings({ openAtLogin: on, ...(app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] }) })
    return
  }
  const f = autostartFile()
  if (on) {
    mkdirSync(join(f, '..'), { recursive: true })
    writeFileSync(f, desktopEntry(launchCommand()))
  } else {
    rmSync(f, { force: true })
  }
}
