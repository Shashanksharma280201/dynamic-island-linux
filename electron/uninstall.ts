import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join, posix, win32 } from 'node:path'

/** How this copy of the island was installed, which decides how it removes itself. */
export type InstallKind = 'mac-app' | 'windows-installer' | 'appimage' | 'deb' | 'source'

export function installKind(o: { packaged: boolean; platform: NodeJS.Platform; execPath: string; appImage?: string }): InstallKind {
  if (!o.packaged) return 'source'
  if (o.platform === 'darwin') return 'mac-app'
  if (o.platform === 'win32') return 'windows-installer'
  if (o.appImage) return 'appimage'
  return 'deb'
}

/** The .app bundle a macOS executable lives in, or null. Pure. */
export function appBundle(execPath: string): string | null {
  const i = execPath.indexOf('.app/')
  return i < 0 ? null : execPath.slice(0, i + 4)
}

/** NSIS puts its uninstaller next to the app as "Uninstall <Product>.exe". Pure. */
export function windowsUninstaller(execPath: string, productName: string): string {
  return win32.join(win32.dirname(execPath), `Uninstall ${productName}.exe`)
}

/**
 * Everything the island keeps on this computer besides the app itself: its
 * data folder (settings, notes, CRM, sign-ins) and what macOS adds for any
 * app. Files it made in Documents are the user's and are never listed. Pure.
 */
export function dataPaths(o: { userData: string; platform: NodeJS.Platform; home: string; appId: string; productName: string }): string[] {
  const paths = [o.userData]
  if (o.platform === 'darwin') {
    const lib = posix.join(o.home, 'Library')
    paths.push(
      posix.join(lib, 'Preferences', `${o.appId}.plist`),
      posix.join(lib, 'Saved Application State', `${o.appId}.savedState`),
      posix.join(lib, 'Caches', o.appId),
      posix.join(lib, 'Caches', o.productName),
      posix.join(lib, 'Logs', o.productName),
      posix.join(lib, 'HTTPStorages', o.appId),
    )
  }
  return paths
}

const sh = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
const ps = (s: string) => `'${s.replace(/'/g, "''")}'`

/** Where the finishing script writes what it did, to look at if something stays behind. */
export const FINISH_LOG = 'dynamic-island-uninstall.log'

/**
 * The script that finishes the uninstall once the island has quit (a running
 * app can't delete itself everywhere): waits for this process, deletes the
 * data paths, then removes the app the way it was installed. Pure.
 */
export function finishScript(o: {
  platform: NodeJS.Platform
  pid: number
  remove: string[]
  kind: InstallKind
  appImage?: string
  uninstaller?: string
  productName?: string
  debPackage?: string
}): { ext: 'ps1' | 'sh'; text: string } {
  if (o.platform === 'win32') {
    // Each step says what it does: the transcript only keeps what is written out.
    const lines = [
      `Start-Transcript -Path (Join-Path $env:TEMP '${FINISH_LOG}') -Force | Out-Null`,
      `Write-Output 'waiting for the island (${o.pid}) to quit'`,
      `Wait-Process -Id ${o.pid} -Timeout 30 -ErrorAction SilentlyContinue`,
      'Start-Sleep -Seconds 1',
      ...o.remove.flatMap((p) => [`Write-Output ${ps(`removing ${p}`)}`, `Remove-Item -LiteralPath ${ps(p)} -Recurse -Force -ErrorAction Continue`]),
      ...(o.kind === 'windows-installer'
        ? [
            `$u = ${ps(o.uninstaller ?? '')}`,
            // Fall back to what Settings > Apps uses to remove it.
            ...(o.productName
              ? [
                  `if (-not $u -or -not (Test-Path -LiteralPath $u)) { $e = Get-ChildItem HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object DisplayName -like ${ps(`${o.productName}*`)} | Select-Object -First 1; if ($e) { $u = [regex]::Match($e.UninstallString, '"([^"]+)"').Groups[1].Value } }`,
                ]
              : []),
            'if ($u -and (Test-Path -LiteralPath $u)) {',
            '  Write-Output "running $u /S"',
            "  $p = Start-Process -FilePath $u -ArgumentList '/S' -Wait -PassThru",
            '  Write-Output "uninstaller exit code: $($p.ExitCode)"',
            '} else { Write-Output "no uninstaller found" }',
          ]
        : []),
      "Write-Output 'done'",
      'Stop-Transcript | Out-Null',
    ]
    return { ext: 'ps1', text: lines.join('\r\n') + '\r\n' }
  }
  const lines = [
    // The log goes next to this script, in the same temp folder the island uses.
    `exec >>"$(dirname "$0")/${FINISH_LOG}" 2>&1`,
    'set -x',
    `while kill -0 ${o.pid} 2>/dev/null; do sleep 0.3; done`,
    // macOS keeps preferences in memory and writes them back after the app quits:
    // tell it to forget them, not just delete the file.
    ...o.remove.filter((p) => o.platform === 'darwin' && p.endsWith('.plist')).map((p) => `defaults delete ${sh(p.slice(0, -'.plist'.length))} 2>/dev/null`),
    ...o.remove.map((p) => `rm -rf ${sh(p)}`),
    ...o.remove.filter((p) => o.platform === 'darwin' && p.endsWith('.plist')).flatMap((p) => ['sleep 2', `rm -f ${sh(p)}`]),
    ...(o.kind === 'appimage' && o.appImage ? [`rm -f ${sh(o.appImage)}`] : []),
    // A system package needs the administrator: the desktop asks for the password.
    ...(o.kind === 'deb' && o.debPackage ? [`command -v pkexec >/dev/null && pkexec apt-get remove -y ${sh(o.debPackage)}`] : []),
  ]
  return { ext: 'sh', text: lines.join('\n') + '\n' }
}

/**
 * How to start that script so it outlives the island. On Windows it goes
 * through `start`, so it isn't tied to the app's process tree. Pure.
 */
export function launchCommand(platform: NodeJS.Platform, file: string): { cmd: string; args: string[]; verbatim: boolean } {
  if (platform === 'win32')
    return {
      cmd: 'cmd.exe',
      args: ['/d', '/s', '/c', `start "" /min powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${file}"`],
      verbatim: true,
    }
  return { cmd: '/bin/sh', args: [file], verbatim: false }
}

export type UninstallDeps = {
  packaged: boolean
  userData: string
  appId: string
  productName: string
  debPackage: string
  /** Undo what the island set up outside its own folders. */
  removeHook: () => Promise<unknown>
  removeStatusLine: () => Promise<unknown>
  removeLoginItem: () => void
  /** Move a file or folder to the Trash (macOS app bundle). */
  trash: (path: string) => Promise<void>
}

/** What the user sees afterwards, by how it was installed. Pure. */
export function doneText(kind: InstallKind, removeData: boolean, debPackage: string): string {
  const data = removeData ? 'its settings and data' : 'its login item and Claude Code setup (your settings and data are kept)'
  switch (kind) {
    case 'mac-app':
      return `Dynamic Island was moved to the Trash, with ${data}.`
    case 'windows-installer':
      return `Dynamic Island is being removed, with ${data}.`
    case 'appimage':
      return `The AppImage is deleted, with ${data}.`
    case 'deb':
      return `Removed ${data}. Enter your password when asked to remove the app (or run: sudo apt remove ${debPackage}).`
    case 'source':
      return `Removed ${data}. To remove the app too, delete the folder you cloned it into.`
  }
}

/**
 * Removes the island: Claude Code hook and status line, login item, optionally
 * its data, then the app itself (once the island has quit). Returns the
 * message to show; the caller quits.
 */
export async function uninstall(d: UninstallDeps, o: { removeData: boolean }): Promise<string> {
  const kind = installKind({ packaged: d.packaged, platform: process.platform, execPath: process.execPath, appImage: process.env.APPIMAGE })
  await d.removeHook().catch((e) => console.error('uninstall: hook', e))
  await d.removeStatusLine().catch((e) => console.error('uninstall: status line', e))
  try {
    d.removeLoginItem()
  } catch (e) {
    console.error('uninstall: login item', e)
  }
  const remove = o.removeData ? dataPaths({ userData: d.userData, platform: process.platform, home: homedir(), appId: d.appId, productName: d.productName }) : []
  const uninstaller = windowsUninstaller(process.execPath, d.productName)
  const finish = finishScript({
    platform: process.platform,
    pid: process.pid,
    remove,
    kind,
    appImage: process.env.APPIMAGE,
    uninstaller: existsSync(uninstaller) ? uninstaller : undefined,
    productName: d.productName,
    debPackage: d.debPackage,
  })
  const file = join(tmpdir(), `dynamic-island-uninstall.${finish.ext}`)
  writeFileSync(file, finish.text)
  const run = launchCommand(process.platform, file)
  spawn(run.cmd, run.args, { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: run.verbatim }).unref()
  if (kind === 'mac-app') {
    const bundle = appBundle(process.execPath)
    if (bundle && basename(bundle).endsWith('.app')) await d.trash(bundle).catch((e) => console.error('uninstall: trash', e))
  }
  return doneText(kind, o.removeData, d.debPackage)
}
