// @ts-expect-error - x11 ships no types
import x11 from 'x11'
import { parseUriList } from '@shared/dragActions'

/** The pointer during a drag, in physical root-window pixels. */
export type DragSample = { x: number; y: number; t: number; alt: boolean; down: boolean }

type Deps = {
  /** A drag began somewhere (an app took the XdndSelection). */
  onStart: () => void
  onSample: (s: DragSample) => void
  /** The button was let go: dropped or cancelled. */
  onEnd: (last: DragSample | null) => void
  /** Drags the island started itself (a result dragged out of it). */
  ownDrag: () => boolean
}

const BUTTON1 = 0x100
const MOD1 = 0x8 // Alt
const POLL_MS = 30
/** A drag that seems to go on for ever (the release was missed) ends here. */
const MAX_DRAG_MS = 120_000

/** Why the watcher isn't running, for Settings to say. */
export type WatchProblem = 'no-x11' | 'wayland' | 'no-xfixes' | null

/**
 * Notices file drags in any app (X11): every drag starts by taking the
 * XdndSelection, which XFixes reports. While the button stays down the pointer
 * is sampled; what's being dragged is asked of the dragging app as a
 * text/uri-list, the same way a drop target would.
 */
export class DragWatcher {
  private X: any = null
  private root = 0
  private win = 0
  private atoms = { sel: 0, uriList: 0, prop: 0 }
  private poll: ReturnType<typeof setInterval> | null = null
  private dragStart = 0
  private sawDown = false
  private last: DragSample | null = null
  private waiting: Array<(paths: string[]) => void> = []
  private xt: any = null
  problem: WatchProblem = null

  constructor(private d: Deps) {}

  get dragging(): boolean {
    return !!this.poll
  }

  start(): Promise<boolean> {
    if (process.platform !== 'linux' || !process.env.DISPLAY) return Promise.resolve(this.fail('no-x11'))
    if (process.env.XDG_SESSION_TYPE === 'wayland') return Promise.resolve(this.fail('wayland'))
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(this.fail('no-x11')), 4000)
      const display = x11.createClient((err: unknown, disp: any) => {
        if (err || !disp) {
          clearTimeout(timer)
          return resolve(this.fail('no-x11'))
        }
        const X = disp.client
        this.X = X
        this.root = disp.screen[0].root
        X.on('error', () => {})
        X.on('event', (ev: any) => this.onEvent(ev))
        X.on('end', () => {
          this.X = null
          this.stopPolling()
        })
        const atom = (name: string) => new Promise<number>((res) => X.InternAtom(false, name, (e: unknown, a: number) => res(e ? 0 : a)))
        Promise.all([atom('XdndSelection'), atom('text/uri-list'), atom('DYNAMIC_ISLAND_DRAG')]).then(([sel, uriList, prop]) => {
          this.atoms = { sel, uriList, prop }
          this.win = X.AllocID()
          // An unmapped window of our own, to receive what the dragging app sends.
          X.CreateWindow(this.win, this.root, -10, -10, 1, 1, 0, 0, 0, 0, {})
          X.require('xtest', (e: unknown, xt: any) => (this.xt = e ? null : xt))
          this.selectXdnd((ok) => {
            clearTimeout(timer)
            resolve(ok ? true : this.fail('no-xfixes'))
          })
        })
      })
      display?.on?.('error', () => {})
    })
  }

  stop(): void {
    this.stopPolling()
    try {
      this.X?.terminate()
    } catch {
      // already gone
    }
    this.X = null
  }

  /**
   * The files being dragged right now, asked of the dragging app ([] if it
   * doesn't answer in time, or isn't dragging files).
   */
  files(timeoutMs = 500): Promise<string[]> {
    const X = this.X
    if (!X || !this.dragging) return Promise.resolve([])
    return new Promise((resolve) => {
      let done = false
      const finish = (paths: string[]) => {
        if (done) return
        done = true
        clearTimeout(timer)
        this.waiting = this.waiting.filter((w) => w !== finish)
        resolve(paths)
      }
      const timer = setTimeout(() => finish([]), timeoutMs)
      this.waiting.push(finish)
      X.ConvertSelection(this.win, this.atoms.sel, this.atoms.uriList, this.atoms.prop, 0)
    })
  }

  /**
   * Move the pointer a pixel and back: the dragging app looks again at what's
   * under it (a window that just appeared there), as it would on any move.
   */
  nudge(): void {
    const s = this.last
    if (!this.xt || !s || !this.dragging) return
    this.xt.FakeInput(this.xt.MotionNotify, 0, 0, this.root, s.x + 1, s.y)
    setTimeout(() => this.xt?.FakeInput(this.xt.MotionNotify, 0, 0, this.root, s.x, s.y), 30)
  }

  private fail(p: WatchProblem): false {
    this.problem = p
    return false
  }

  /** XFixes: tell us whenever someone takes the XdndSelection. */
  private selectXdnd(cb: (ok: boolean) => void): void {
    const X = this.X
    X.QueryExtension('XFIXES', (err: unknown, ext: any) => {
      if (err || !ext?.present) return cb(false)
      const op = ext.majorOpcode
      // The selection-owner event: window, owner, selection, time.
      X.eventParsers[ext.firstEvent] = (_type: number, seq: number, extra: number, code: number, raw: any) => {
        const v = raw.unpack('LLLL')
        return { name: 'XFixesSelectionNotify', seq, subtype: code, window: extra, owner: v[0], selection: v[1], time: v[2] }
      }
      // QueryVersion must come first.
      X.seq_num++
      X.pack_stream.pack('CCSLL', [op, 0, 3, 5, 0])
      X.replies[X.seq_num] = [
        (buf: any) => buf.unpack('LL'),
        (e: unknown) => {
          if (e) return cb(false)
          // SelectSelectionInput(window, selection, SetSelectionOwnerNotifyMask)
          X.seq_num++
          X.pack_stream.pack('CCSLLL', [op, 2, 4, this.win, this.atoms.sel, 1])
          X.pack_stream.flush()
          cb(true)
        },
      ]
      X.pack_stream.flush()
    })
  }

  private onEvent(ev: any): void {
    if (ev.name === 'XFixesSelectionNotify' && ev.selection === this.atoms.sel && ev.owner) {
      if (this.d.ownDrag()) return
      this.begin()
      return
    }
    if (ev.name === 'SelectionNotify' && ev.requestor === this.win) {
      const answer = (paths: string[]) => this.waiting.slice().forEach((w) => w(paths))
      if (!ev.property) return answer([]) // the app wouldn't give a file list
      this.X.GetProperty(1, this.win, ev.property, 0, 0, 1_000_000, (e: unknown, p: any) => {
        answer(e || !p?.data?.length ? [] : parseUriList(Buffer.from(p.data).toString('utf8')))
      })
    }
  }

  private begin(): void {
    this.stopPolling()
    this.dragStart = Date.now()
    this.sawDown = false
    this.last = null
    this.d.onStart()
    const X = this.X
    // (A plain callback: the x11 library drops async ones.)
    this.poll = setInterval(() => {
      if (!this.X || !this.poll) return
      X.QueryPointer(this.root, (err: unknown, p: any) => {
        if (!this.poll) return
        if (err || !p) return this.end()
        const s: DragSample = { x: p.rootX, y: p.rootY, t: Date.now(), alt: !!(p.keyMask & MOD1), down: !!(p.keyMask & BUTTON1) }
        if (s.down) this.sawDown = true
        // Not held at all (a drag started from the keyboard, or one that
        // already ended): nothing to do.
        if (!s.down || s.t - this.dragStart > MAX_DRAG_MS) {
          this.last = s
          return this.end()
        }
        this.last = s
        this.d.onSample(s)
      })
    }, POLL_MS)
  }

  private end(): void {
    if (!this.poll) return
    this.stopPolling()
    this.d.onEnd(this.sawDown ? this.last : null)
  }

  private stopPolling(): void {
    if (this.poll) clearInterval(this.poll)
    this.poll = null
  }
}
