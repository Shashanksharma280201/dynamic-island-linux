import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findTool, toolDirs } from '../electron/os/tools'

describe('finding command-line tools', () => {
  it('looks where Homebrew, winget, Scoop and Chocolatey put them', () => {
    expect(toolDirs('darwin', {}, '/Users/me').slice(0, 2)).toEqual(['/opt/homebrew/bin', '/usr/local/bin'])
    const win = toolDirs('win32', { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', USERPROFILE: 'C:\\Users\\me', ProgramFiles: 'C:\\Program Files' }, 'C:\\Users\\me')
    expect(win.some((d) => /WinGet[\\/]Links$/.test(d))).toBe(true)
    expect(win.some((d) => /scoop[\\/]shims$/.test(d))).toBe(true)
    expect(win.some((d) => /GitHub CLI$/.test(d))).toBe(true)
    // Without LOCALAPPDATA there's no WinGet folder to guess.
    expect(toolDirs('win32', {}, 'C:\\Users\\me').some((d) => /WinGet/.test(d))).toBe(false)
    expect(toolDirs('linux', {}, '/home/me')).toContain('/snap/bin')
  })

  it.skipIf(process.platform === 'win32')('finds a tool on PATH, with Windows’ extensions when it’s Windows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tools-'))
    try {
      mkdirSync(join(dir, 'bin'))
      writeFileSync(join(dir, 'bin', 'island-test-gh'), '', { mode: 0o755 })
      writeFileSync(join(dir, 'bin', 'island-test-ffmpeg.exe'), '', { mode: 0o755 })
      writeFileSync(join(dir, 'bin', 'island-test-plain'), '', { mode: 0o644 })
      const env = { PATH: join(dir, 'bin') }
      expect(findTool('island-test-gh', 'linux', env)).toBe(join(dir, 'bin', 'island-test-gh'))
      expect(findTool('island-test-ffmpeg', 'linux', env)).toBeNull()
      expect(findTool('island-test-ffmpeg', 'win32', { ...env, PATHEXT: '.COM;.EXE' })).toBe(join(dir, 'bin', 'island-test-ffmpeg.exe'))
      // Not something it can run.
      expect(findTool('island-test-plain', 'linux', env)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
