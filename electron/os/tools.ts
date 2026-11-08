import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

/**
 * Where command-line tools live beyond PATH. An app started from the Dock,
 * the Start menu or a launcher gets a short PATH, without Homebrew's or
 * winget's folders.
 */
export function toolDirs(platform: string = process.platform, env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string[] {
  if (platform === 'darwin') return ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', '/usr/bin', join(home, '.local/bin')]
  if (platform === 'win32')
    return [
      env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'),
      env.ProgramData ? join(env.ProgramData, 'chocolatey', 'bin') : 'C:\\ProgramData\\chocolatey\\bin',
      join(env.USERPROFILE || home, 'scoop', 'shims'),
      join(env.ProgramFiles || 'C:\\Program Files', 'GitHub CLI'),
      join(env.ProgramFiles || 'C:\\Program Files', 'ffmpeg', 'bin'),
    ].filter((d): d is string => !!d)
  return ['/usr/bin', '/usr/local/bin', '/snap/bin', join(home, '.local/bin')]
}

/** A tool on PATH or in toolDirs (with .exe and the like on Windows), or null. */
export function findTool(name: string, platform: string = process.platform, env: NodeJS.ProcessEnv = process.env): string | null {
  const exts = platform === 'win32' ? ['', ...(env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').map((e) => e.toLowerCase())] : ['']
  for (const d of [...(env.PATH ?? '').split(delimiter), ...toolDirs(platform, env)].filter(Boolean))
    for (const e of exts) {
      const p = join(d, name + e)
      try {
        accessSync(p, constants.X_OK)
        return p
      } catch {
        // not here
      }
    }
  return null
}

/** The GitHub CLI: DI_GH (tests), else gh wherever it's installed. */
export const ghPath = (): string => process.env.DI_GH || findTool('gh') || 'gh'

/** gh, with what went wrong in plain words. */
export const runGh = (args: string[]): Promise<string> =>
  new Promise((resolve, reject) =>
    execFile(ghPath(), args, { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }, (e, out, err) => {
      if (!e) return resolve(out)
      const code = (e as NodeJS.ErrnoException).code
      reject(new Error(code === 'ENOENT' ? 'Install the GitHub CLI (gh), then run “gh auth login”.' : /auth login|not logged/i.test(String(err)) ? 'Run “gh auth login” first.' : String(err || e.message).trim().split('\n')[0]))
    }),
  )
