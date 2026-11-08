import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { macLauncher, shQuote, winLauncher, winQuote } from '../electron/brain/wire'

describe('opening a terminal on a Mac and on Windows', () => {
  const prompt = 'You are “Frontend Developer”.\nSay "hi" and don’t use C:\\temp\\ or a trailing \\'

  it('quotes for Windows the way programs read it back', () => {
    expect(winQuote('plain')).toBe('plain')
    expect(winQuote('')).toBe('""')
    expect(winQuote('two words')).toBe('"two words"')
    expect(winQuote('say "hi"')).toBe('"say \\"hi\\""')
    expect(winQuote('C:\\Program Files\\x\\')).toBe('"C:\\Program Files\\x\\\\"')
    expect(winQuote('a\\"b')).toBe('"a\\\\\\"b"')
  })

  it('a PowerShell window runs Claude Code with the whole prompt as one argument', () => {
    const ps = winLauncher('C:\\Users\\me', ['C:\\Users\\me\\.local\\bin\\claude.exe', '--append-system-prompt', prompt])
    expect(ps.split('\n')[0]).toBe("Set-Location -LiteralPath 'C:\\Users\\me'")
    expect(ps).toContain("Start-Process -FilePath 'C:\\Users\\me\\.local\\bin\\claude.exe' -ArgumentList '--append-system-prompt ")
    // PowerShell takes curly quotes as quotes: they're doubled inside its string.
    expect(ps).toContain('don\u2019\u2019t')
    expect(ps.trimEnd().endsWith('-NoNewWindow -Wait')).toBe(true)
  })

  it.skipIf(process.platform === 'win32')('a Mac’s .command file runs the command as given', () => {
    const dir = mkdtempSync(join(tmpdir(), 'launch-'))
    try {
      const echo = join(dir, 'echo.sh')
      writeFileSync(echo, '#!/bin/sh\npwd\nfor a; do printf "[%s]\\n" "$a"; done\n', { mode: 0o755 })
      const file = join(dir, 'run.command')
      writeFileSync(file, macLauncher(dir, [echo, "it's", prompt]), { mode: 0o755 })
      const out = execFileSync('/bin/sh', [file]).toString()
      expect(out).toBe(`${dir}\n[it's]\n[${prompt}]\n`)
      expect(shQuote("a'b")).toBe(`'a'\\''b'`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
