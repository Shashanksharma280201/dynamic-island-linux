import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { screen } from 'electron'
import type { DragEvents, DragSource } from '../dragSource'

/**
 * Notices file drags in any app on macOS. Every drag writes what it carries
 * to the system's drag pasteboard, so its change count moves when one starts:
 * while the left button is down, a change with file URLs on it is a file
 * drag, and those URLs are its files. Runs as JavaScript for Automation
 * (osascript, built in) and needs no permission: it only reads the button,
 * the Option key and the drag pasteboard. One JSON object a line:
 * {"ready":true}, {"start":[paths]}, {"held":true,"alt":false} while the drag
 * goes on, {"end":true}.
 *
 * DI_DRAG_ASSUME_DOWN=<file> (tests) treats the button as down while that
 * file exists, so a test can play a drag by writing to the drag pasteboard.
 */
export const DRAG_HELPER = String.raw`
ObjC.import('AppKit')
const stdout = $.NSFileHandle.fileHandleWithStandardOutput
const say = (o) => stdout.writeData($(JSON.stringify(o) + '\n').dataUsingEncoding($.NSUTF8StringEncoding))
const pb = $.NSPasteboard.pasteboardWithName(typeof $.NSPasteboardNameDrag === 'undefined' ? 'Apple CFPasteboard drag' : $.NSPasteboardNameDrag)
const env = $.NSProcessInfo.processInfo.environment
const assume = env.objectForKey('DI_DRAG_ASSUME_DOWN')
const assumeFile = assume.isNil() ? '' : assume.js
const fm = $.NSFileManager.defaultManager
const held = () => (assumeFile ? fm.fileExistsAtPath(assumeFile) : ($.NSEvent.pressedMouseButtons & 1) !== 0)
const OPTION = 1 << 19

/** The file paths on the drag pasteboard ([] for text, links and the like). */
function files() {
  const out = []
  try {
    const urls = pb.readObjectsForClassesOptions($([$.NSURL]), $({ NSPasteboardURLReadingFileURLsOnlyKey: true }))
    if (urls && !urls.isNil()) for (let i = 0; i < urls.count; i++) {
      const u = urls.objectAtIndex(i)
      if (u.isFileURL) out.push(u.path.js)
    }
  } catch (e) {}
  return out
}

say({ ready: true })
let down = false
let base = 0
let state = 'idle' // idle, watching (button down), dragging (files), other (a drag of something else)
while (true) {
  const b = held()
  if (b && !down) {
    down = true
    base = pb.changeCount
    state = 'watching'
  } else if (!b && down) {
    down = false
    if (state === 'dragging') say({ end: true })
    state = 'idle'
  }
  if (state === 'watching' && pb.changeCount !== base) {
    const f = files()
    if (f.length) {
      state = 'dragging'
      say({ start: f })
    } else state = 'other'
  }
  if (state === 'dragging') say({ held: true, alt: ($.NSEvent.modifierFlags & OPTION) !== 0 })
  $.NSThread.sleepForTimeInterval(state === 'idle' ? 0.05 : 0.03)
}
`

/** A line from the helper, as a drag event, or null. Pure. */
export function dragLine(line: string): { ready: true } | { start: string[] } | { held: true; alt: boolean } | { end: true } | null {
  let m: any
  try {
    m = JSON.parse(line)
  } catch {
    return null
  }
  if (m?.ready === true) return { ready: true }
  if (Array.isArray(m?.start)) {
    const files = m.start.filter((p: unknown): p is string => typeof p === 'string' && p.startsWith('/'))
    return files.length ? { start: files } : null
  }
  if (m?.held === true) return { held: true, alt: m.alt === true }
  if (m?.end === true) return { end: true }
  return null
}

/** Drags on macOS, from the helper; the pointer from Electron, in screen units. */
export function darwinDragSource(e: DragEvents): DragSource {
  let child: ChildProcessWithoutNullStreams | null = null
  let dragging = false
  let ours = false
  let problem: string | null = null
  const stop = () => {
    child?.kill()
    child = null
    if (dragging) e.onEnd()
    dragging = false
  }
  return {
    get problem() {
      return problem
    },
    start: () =>
      new Promise<boolean>((resolve) => {
        let settled = false
        const done = (ok: boolean, why: string | null = null) => {
          if (settled) return
          settled = true
          problem = why
          resolve(ok)
        }
        try {
          child = spawn('osascript', ['-l', 'JavaScript', '-e', DRAG_HELPER], { stdio: ['pipe', 'pipe', 'pipe'] })
        } catch {
          return done(false, 'no-helper')
        }
        child.on('error', () => done(false, 'no-helper'))
        child.on('exit', () => {
          done(false, 'no-helper')
          if (dragging) e.onEnd()
          dragging = false
          child = null
        })
        child.stderr.on('data', (d) => console.error('[island] drag helper:', String(d).trim().slice(0, 300)))
        setTimeout(() => done(false, 'no-helper'), 8000)
        createInterface({ input: child.stdout }).on('line', (line) => {
          const m = dragLine(line)
          if (!m) return
          if ('ready' in m) return done(true)
          if ('start' in m) {
            // A result dragged out of the island itself: leave it be.
            ours = e.ownDrag()
            if (ours) return
            dragging = true
            return e.onStart(m.start)
          }
          if (ours || !dragging) {
            if ('end' in m) ours = false
            return
          }
          if ('held' in m) {
            const p = screen.getCursorScreenPoint()
            return e.onSample({ x: p.x, y: p.y, t: Date.now(), alt: m.alt, down: true })
          }
          dragging = false
          e.onEnd()
        })
      }),
    stop,
    // macOS looks at what's under the pointer on its own: nothing to nudge.
    nudge: () => {},
  }
}
