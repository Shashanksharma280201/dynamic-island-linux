import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
// @ts-expect-error - x11 ships no types
import x11 from 'x11'
import { clientMessage } from './inputShape'

/** A process's parent, from /proc (Linux). */
function linuxParent(pid: number): number {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
  return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
}

/** `pid`, its parent, its parent's parent… up to (not including) init. Pure given `parentOf`. */
export function ancestry(pid: number, parentOf: (pid: number) => number, max = 40): number[] {
  const out: number[] = []
  let p = pid
  while (p > 1 && out.length < max && !out.includes(p)) {
    out.push(p)
    try {
      p = parentOf(p)
    } catch {
      break
    }
  }
  return out
}

/**
 * The window that holds a process: the one owned by its nearest ancestor (the
 * terminal emulator, or the editor with the terminal in it), topmost first if
 * that program has several. `windows` is bottom to top. Pure.
 */
export function windowFor(windows: { id: number; pid: number }[], chain: number[]): number | null {
  for (const pid of chain) {
    const mine = windows.filter((w) => w.pid === pid)
    if (mine.length) return mine[mine.length - 1].id
  }
  return null
}

/** The X client windows with their owning process, bottom to top. */
function x11Windows(): Promise<{ X: any; root: number; windows: { id: number; pid: number }[] }> {
  return new Promise((resolve, reject) => {
    if (!process.env.DISPLAY) return reject(new Error('no DISPLAY'))
    const timer = setTimeout(() => reject(new Error('X11 timed out')), 3000)
    const display = x11.createClient((err: unknown, d: any) => {
      if (err || !d) {
        clearTimeout(timer)
        return reject(err ?? new Error('no display'))
      }
      const X = d.client
      const root = d.screen[0].root
      X.on('error', () => {}) // a window that closed meanwhile
      const atom = (name: string) => new Promise<number>((res) => X.InternAtom(false, name, (e: unknown, a: number) => res(e ? 0 : a)))
      const prop = (win: number, a: number) =>
        new Promise<Buffer | null>((res) => X.GetProperty(0, win, a, 0, 0, 100_000, (e: unknown, p: any) => res(e || !p?.data?.length ? null : p.data)))
      const ids = (b: Buffer | null) => (b ? Array.from({ length: b.length / 4 }, (_x, i) => b.readUInt32LE(i * 4)) : [])
      ;(async () => {
        const [stacking, list, wmPid] = await Promise.all([atom('_NET_CLIENT_LIST_STACKING'), atom('_NET_CLIENT_LIST'), atom('_NET_WM_PID')])
        let wins = ids(await prop(root, stacking))
        if (!wins.length) wins = ids(await prop(root, list))
        // No window manager: the top-level windows themselves.
        if (!wins.length) wins = await new Promise<number[]>((res) => X.QueryTree(root, (e: unknown, t: any) => res(e ? [] : t.children)))
        const windows: { id: number; pid: number }[] = []
        for (const id of wins) {
          const p = await prop(id, wmPid)
          if (p && p.length >= 4) windows.push({ id, pid: p.readUInt32LE(0) })
        }
        clearTimeout(timer)
        resolve({ X, root, windows })
      })().catch((e) => {
        clearTimeout(timer)
        reject(e)
      })
    })
    display?.on?.('error', (e: unknown) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}

const run = (cmd: string, args: string[]) =>
  new Promise<string>((resolve, reject) => execFile(cmd, args, { timeout: 3000 }, (e, out) => (e ? reject(e) : resolve(String(out)))))

/** macOS: the .app a process runs inside (Terminal, iTerm, VS Code…), from `ps`. */
async function macApp(pid: number): Promise<string | null> {
  let p = pid
  for (let i = 0; i < 40 && p > 1; i++) {
    const out = (await run('ps', ['-o', 'ppid=,comm=', '-p', String(p)])).trim()
    const m = out.match(/^(\d+)\s+(.*)$/)
    if (!m) return null
    const app = m[2].match(/^(.*?\.app)\//)
    if (app) return app[1]
    p = Number(m[1])
  }
  return null
}

/**
 * Bring the terminal (or editor) running `pid` to the front. True if a window
 * was found and asked to activate. X11 and macOS; elsewhere false.
 */
export async function focusTerminal(pid: number): Promise<boolean> {
  try {
    if (process.platform === 'darwin') {
      const app = await macApp(pid)
      if (!app) return false
      await run('open', ['-a', app])
      return true
    }
    if (process.platform !== 'linux') return false
    const chain = ancestry(pid, linuxParent)
    const { X, root, windows } = await x11Windows()
    const win = windowFor(windows, chain)
    if (win) {
      const active = await new Promise<number>((res) => X.InternAtom(false, '_NET_ACTIVE_WINDOW', (e: unknown, a: number) => res(e ? 0 : a)))
      const SubstructureNotify = 0x80000
      const SubstructureRedirect = 0x100000
      // Source 2: a pager, which window managers obey.
      if (active) X.SendEvent(root, false, SubstructureNotify | SubstructureRedirect, clientMessage(win, active, [2, 0, 0]))
      X.RaiseWindow(win)
      X.SetInputFocus(win, 2)
    }
    await new Promise((r) => setTimeout(r, 100))
    X.terminate()
    return !!win
  } catch {
    return false
  }
}

/** Whether the window holding `pid` has the keyboard right now (X11 only; else false). */
export async function terminalFocused(pid: number): Promise<boolean> {
  if (process.platform !== 'linux') return false
  try {
    const chain = ancestry(pid, linuxParent)
    const { X, windows } = await x11Windows()
    const focus = await new Promise<number>((res) => X.GetInputFocus((e: unknown, f: any) => res(e ? 0 : f.focus)))
    X.terminate()
    const win = windowFor(windows, chain)
    return !!win && win === focus
  } catch {
    return false
  }
}

/**
 * The window you're working in (X11): the active one, or the one with the
 * keyboard when there's no window manager to say. Its title, process and
 * place on screen. Null elsewhere or when it can't be told.
 */
export function frontWindow(): Promise<{ xid: number; title: string; pid: number; rect: { x: number; y: number; width: number; height: number } } | null> {
  return new Promise((resolve) => {
    if (process.platform !== 'linux' || !process.env.DISPLAY) return resolve(null)
    const timer = setTimeout(() => resolve(null), 2000)
    x11.createClient((err: unknown, d: any) => {
      if (err || !d) {
        clearTimeout(timer)
        return resolve(null)
      }
      const X = d.client
      const root = d.screen[0].root
      X.on('error', () => {})
      const finish = (v: any) => {
        clearTimeout(timer)
        X.terminate()
        resolve(v)
      }
      const atom = (name: string) => new Promise<number>((res) => X.InternAtom(false, name, (e: unknown, a: number) => res(e ? 0 : a)))
      const prop = (win: number, a: number, type = 0) =>
        new Promise<Buffer | null>((res) => X.GetProperty(0, win, a, type, 0, 10_000, (e: unknown, p: any) => res(e || !p?.data?.length ? null : p.data)))
      // Plain callbacks only: the x11 library drops async ones.
      const run = async () => {
        const [active, netName, utf8, wmPid] = await Promise.all([atom('_NET_ACTIVE_WINDOW'), atom('_NET_WM_NAME'), atom('UTF8_STRING'), atom('_NET_WM_PID')])
        let xid = (await prop(root, active))?.readUInt32LE(0) ?? 0
        if (!xid) xid = await new Promise<number>((res) => X.GetInputFocus((e: unknown, f: any) => res(e ? 0 : f.focus)))
        if (!xid || xid <= 1) return finish(null)
        const title = ((await prop(xid, netName, utf8))?.toString('utf8') || (await prop(xid, 39 /* WM_NAME */))?.toString('latin1') || '').replace(/\0/g, '').trim()
        const pid = (await prop(xid, wmPid))?.readUInt32LE(0) ?? 0
        const rect = await new Promise<any>((res) =>
          X.GetGeometry(xid, (e: unknown, g: any) => {
            if (e || !g) return res(null)
            X.TranslateCoordinates(xid, root, 0, 0, (e2: unknown, t: any) => res(e2 || !t ? null : { x: t.destX, y: t.destY, width: g.width, height: g.height }))
          }),
        )
        finish(rect ? { xid, title, pid, rect } : null)
      }
      run().catch(() => finish(null))
    })
  })
}
