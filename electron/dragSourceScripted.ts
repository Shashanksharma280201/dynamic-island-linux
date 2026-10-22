import { existsSync, readFileSync } from 'node:fs'
import type { DragEvents, DragSource } from './dragSource'

/**
 * A drag source for tests: follows a file of JSON lines the test appends to,
 * like a system reporting a drag. {"start": [paths]} (paths known up front, as
 * on macOS; [] when not), {"at": [x, y], "alt": false} while the button is
 * held, {"end": true} when it's let go. Screen units.
 */
export function scriptedDragSource(file: string) {
  return (e: DragEvents): DragSource => {
    let timer: ReturnType<typeof setInterval> | null = null
    let read = 0
    const step = () => {
      if (!existsSync(file)) return
      const text = readFileSync(file, 'utf8')
      const lines = text.slice(read).split('\n')
      const done = lines.pop() ?? '' // a line still being written waits for the next look
      read = text.length - done.length
      for (const line of lines) {
        let m: any
        try {
          m = JSON.parse(line)
        } catch {
          continue
        }
        if (Array.isArray(m.start)) e.onStart(m.start.length ? m.start : undefined)
        else if (Array.isArray(m.at)) e.onSample({ x: m.at[0], y: m.at[1], t: Date.now(), alt: !!m.alt, down: true })
        else if (m.end) e.onEnd()
      }
    }
    return {
      problem: null,
      start: async () => {
        timer = setInterval(step, 30)
        return true
      },
      stop: () => {
        if (timer) clearInterval(timer)
        timer = null
      },
      nudge: () => {},
    }
  }
}
