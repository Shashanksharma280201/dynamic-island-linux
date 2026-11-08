import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WinFrontApp, WIN_FRONT_SCRIPT } from '../electron/os/frontApp'

describe('the window in front on Windows', () => {
  let dir: string
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'front-'))))
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  /** A stand-in for the PowerShell: one JSON line for each line asked (Node, so it runs anywhere). */
  const helper = (body: string, start = '') => {
    const p = join(dir, 'front.js')
    writeFileSync(p, `${start}; const rl = require('node:readline').createInterface({ input: process.stdin }); let n = 0; rl.on('line', () => { n++; ${body} })`)
    return () => ({ command: process.execPath, args: [p] })
  }

  it('asks the helper that stays, and reads its answer', async () => {
    const f = new WinFrontApp(helper(`console.log(JSON.stringify({ title: 'Inbox - Outlook ' + n, comm: 'OUTLOOK', pid: 42 }))`))
    try {
      expect(await f.read()).toEqual({ title: 'Inbox - Outlook 1', comm: 'OUTLOOK', pid: 42 })
      // The same helper answers again (it isn't started each minute).
      expect(await f.read()).toEqual({ title: 'Inbox - Outlook 2', comm: 'OUTLOOK', pid: 42 })
    } finally {
      f.stop()
    }
    expect(await f.read()).toBeNull()
  })

  it('a helper that stops comes back the next time; nonsense is no answer', async () => {
    // The first helper says nonsense, then answers once and quits; the next one answers.
    const marker = JSON.stringify(join(dir, 'started'))
    const f = new WinFrontApp(
      helper(
        `if (!again && n === 1) console.log('not json'); else { console.log(JSON.stringify({ title: again ? 'again' : 'x', comm: 'y' })); if (!again) process.exit(0) }`,
        `const fs = require('node:fs'); const again = fs.existsSync(${marker}); fs.writeFileSync(${marker}, '')`,
      ),
    )
    try {
      expect(await f.read()).toBeNull()
      expect(await f.read()).toEqual({ title: 'x', comm: 'y', pid: undefined })
      await new Promise((r) => setTimeout(r, 300))
      // It quit after that answer: a new one starts.
      expect(await f.read()).toEqual({ title: 'again', comm: 'y', pid: undefined })
    } finally {
      f.stop()
    }
  })

  it('the PowerShell reads the window and its process, and avoids PowerShell’s own $pid', () => {
    expect(WIN_FRONT_SCRIPT).toContain('GetForegroundWindow')
    expect(WIN_FRONT_SCRIPT).toContain('GetWindowThreadProcessId')
    expect(WIN_FRONT_SCRIPT).not.toMatch(/\$pid\b/)
  })
})
