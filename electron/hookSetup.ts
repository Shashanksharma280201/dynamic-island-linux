import { app } from 'electron'
import { execFile } from 'node:child_process'
import { accessSync, constants, cpSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

const FILES = ['claude-island-hook.cjs', 'decision.cjs', 'install.cjs', 'claude-island-status.cjs', 'statusline.cjs']

function settingsPath(): string {
  return join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json')
}

function readSettings(): any {
  try {
    return JSON.parse(readFileSync(settingsPath(), 'utf8'))
  } catch {
    return {}
  }
}

/**
 * Where the hook scripts live. In a packaged build they are copied out of the
 * (possibly temporary, e.g. AppImage) install dir into userData so the path
 * written to Claude's settings stays valid.
 */
export function hookDir(): string {
  if (!app.isPackaged) return join(app.getAppPath(), 'hook')
  const dest = join(app.getPath('userData'), 'hook')
  mkdirSync(dest, { recursive: true })
  for (const f of FILES) cpSync(join(process.resourcesPath, 'hook', f), join(dest, f))
  return dest
}

/** First executable named `name` on PATH (plus the usual per-user dirs). */
export function findExecutable(name: string, extraDirs: string[] = []): string | null {
  const dirs = [...(process.env.PATH ?? '').split(delimiter), ...extraDirs].filter(Boolean)
  // Windows finds "claude" as claude.exe or claude.cmd.
  const exts = process.platform === 'win32' ? ['', ...(process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').map((e) => e.toLowerCase())] : ['']
  for (const d of dirs) {
    for (const ext of exts) {
      const p = join(d, name + ext)
      try {
        accessSync(p, constants.X_OK)
        if (process.platform === 'win32' && ext === '' && !/\.[a-z]+$/i.test(name)) continue // an extensionless file isn't runnable there
        return p
      } catch {
        // not here
      }
    }
  }
  return null
}


/**
 * How Claude Code should run the island's small Node scripts: Node if it is
 * installed (fast), otherwise the island's own Electron in Node mode, so the
 * hooks work on machines without Node (e.g. Claude Code's native installer).
 */
export function nodeRunner(): string {
  const node = findExecutable('node', [join(homedir(), '.local/bin'), '/usr/local/bin', '/usr/bin'])
  if (node) return JSON.stringify(node)
  const self = process.env.APPIMAGE || process.execPath
  return `ELECTRON_RUN_AS_NODE=1 ${JSON.stringify(self)}`
}

function runInstaller(script: string, on: boolean): Promise<string> {
  const args = [join(hookDir(), script), ...(on ? [] : ['--uninstall'])]
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      args,
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DI_NODE_RUNNER: nodeRunner() } },
      (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)),
    )
  })
}

export function isHookInstalled(): boolean {
  return JSON.stringify(readSettings().hooks?.PermissionRequest ?? []).includes('claude-island-hook')
}

/** Run the bundled installer with Electron acting as Node. */
export function setHookInstalled(on: boolean): Promise<string> {
  return runInstaller('install.cjs', on)
}

/** Whether Claude Code's status line feeds your plan limits to the island. */
export function isUsageBridgeInstalled(): boolean {
  return JSON.stringify(readSettings().statusLine ?? '').includes('claude-island-status')
}

export function setUsageBridgeInstalled(on: boolean): Promise<string> {
  return runInstaller('statusline.cjs', on)
}
