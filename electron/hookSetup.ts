import { app } from 'electron'
import { execFile } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const FILES = ['claude-island-hook.cjs', 'decision.cjs', 'install.cjs']

function settingsPath(): string {
  return join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json')
}

/**
 * Where the hook scripts live. In a packaged build they are copied out of the
 * (possibly temporary, e.g. AppImage) install dir into userData so the path
 * written to Claude's settings stays valid.
 */
function hookDir(): string {
  if (!app.isPackaged) return join(app.getAppPath(), 'hook')
  const dest = join(app.getPath('userData'), 'hook')
  mkdirSync(dest, { recursive: true })
  for (const f of FILES) cpSync(join(process.resourcesPath, 'hook', f), join(dest, f))
  return dest
}

export function isHookInstalled(): boolean {
  try {
    const s = JSON.parse(readFileSync(settingsPath(), 'utf8'))
    return JSON.stringify(s.hooks?.PermissionRequest ?? []).includes('claude-island-hook')
  } catch {
    return false
  }
}

/** Run the bundled installer with Electron acting as Node. */
export function setHookInstalled(on: boolean): Promise<string> {
  const dir = hookDir()
  const args = [join(dir, 'install.cjs'), ...(on ? [] : ['--uninstall'])]
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      args,
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
      (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)),
    )
  })
}
