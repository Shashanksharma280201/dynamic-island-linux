import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { parseLsappinfoName } from '@shared/intake'

/**
 * The window in front, for screen time. `name` is an app's own name (a
 * Mac's), `comm` a process name to tidy (Linux, Windows).
 */
export type FrontApp = { title: string; pid?: number; name?: string; comm?: string }

const run = (cmd: string, args: string[]): Promise<string> =>
  new Promise((resolve) => execFile(cmd, args, { timeout: 3000 }, (e, out) => resolve(e ? '' : String(out))))

/**
 * A Mac: the app in front, from Launch Services. It needs no permission;
 * window titles would (Screen Recording), so a Mac's screen time has none.
 */
export async function macFrontApp(): Promise<FrontApp | null> {
  const asn = (await run('lsappinfo', ['front'])).trim()
  if (!/^ASN:/.test(asn)) return null
  const name = parseLsappinfoName(await run('lsappinfo', ['info', '-only', 'name', asn]))
  return name ? { title: '', name } : null
}

/** Windows: the window in front and its process, one JSON line for each line asked. */
export const WIN_FRONT_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class IslandFront {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint procId);
}
'@
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $h = [IslandFront]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 512
  $null = [IslandFront]::GetWindowText($h, $sb, 512)
  $procId = [uint32]0
  $null = [IslandFront]::GetWindowThreadProcessId($h, [ref]$procId)
  $name = ''
  try { $name = (Get-Process -Id $procId).ProcessName } catch { }
  [Console]::Out.WriteLine((@{ title = $sb.ToString(); comm = $name; pid = [int]$procId } | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
`

/**
 * Windows: one small PowerShell that stays (starting one each minute costs
 * more than the answer). It starts the first time it's asked, and comes
 * back if it stops.
 */
export class WinFrontApp {
  private proc: ChildProcessWithoutNullStreams | null = null
  private waiting: ((f: FrontApp | null) => void) | null = null
  private stopped = false

  constructor(private readonly how: () => { command: string; args: string[] } = winPowerShell) {}

  read(): Promise<FrontApp | null> {
    if (this.stopped) return Promise.resolve(null)
    // One at a time: a slow answer isn't asked again.
    if (this.waiting) return Promise.resolve(null)
    if (!this.proc) this.start()
    const p = this.proc
    if (!p) return Promise.resolve(null)
    return new Promise((resolve) => {
      const t = setTimeout(() => done(null), 8000)
      const done = (f: FrontApp | null) => {
        clearTimeout(t)
        if (this.waiting === done) this.waiting = null
        resolve(f)
      }
      this.waiting = done
      p.stdin.write('front\n')
    })
  }

  stop(): void {
    this.stopped = true
    this.proc?.kill()
    this.proc = null
    this.waiting?.(null)
  }

  private start(): void {
    let how: { command: string; args: string[] }
    try {
      how = this.how()
    } catch {
      return
    }
    const p = spawn(how.command, how.args, { windowsHide: true })
    this.proc = p
    p.on('error', () => {})
    p.stdin.on('error', () => {})
    createInterface({ input: p.stdout }).on('line', (line) => {
      let f: FrontApp | null = null
      try {
        const o = JSON.parse(line)
        if (o && typeof o.title === 'string') f = { title: o.title.slice(0, 300), comm: typeof o.comm === 'string' ? o.comm : '', pid: typeof o.pid === 'number' ? o.pid : undefined }
      } catch {
        // not an answer
      }
      this.waiting?.(f)
    })
    // 'close', not 'exit': its last answer may still be on the way.
    p.on('close', () => {
      if (this.proc === p) this.proc = null
      this.waiting?.(null)
    })
  }
}

function winPowerShell(): { command: string; args: string[] } {
  const file = join(tmpdir(), `dynamic-island-front-${createHash('sha1').update(WIN_FRONT_SCRIPT).digest('hex').slice(0, 10)}.ps1`)
  writeFileSync(file, '﻿' + WIN_FRONT_SCRIPT) // BOM: Windows PowerShell reads it as UTF-8
  return { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file] }
}
