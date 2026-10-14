import { clipboard } from 'electron'
import { execFile } from 'node:child_process'
// @ts-expect-error - x11 ships no types
import x11 from 'x11'

const TERMINALS = /terminal|konsole|xterm|alacritty|kitty|terminator|tilix|wezterm|urxvt|rxvt|foot|st-256color|ghostty|warp|tabby|hyper|guake|yakuake|sakura|lxterminal|qterminal|deepin-terminal/i

/** Terminals paste with Ctrl+Shift+V; everything else with Ctrl+V. Pure. */
export function pasteChord(wmClass: string): 'ctrl+shift+v' | 'ctrl+v' {
  return TERMINALS.test(wmClass) ? 'ctrl+shift+v' : 'ctrl+v'
}

/** Dictated text, tidied for typing into an app: one line of words, trimmed. Pure. */
export function dictatedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

const KEYSYM = { ctrl: 0xffe3, shift: 0xffe1, v: 0x76 }

/** Press a chord in whatever window has the keyboard (X11, XTest). Resolves to that window's WM_CLASS. */
function x11Paste(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.env.DISPLAY) return reject(new Error('no DISPLAY'))
    const timer = setTimeout(() => reject(new Error('X11 timed out')), 3000)
    x11.createClient((err: unknown, display: any) => {
      if (err || !display) {
        clearTimeout(timer)
        return reject(err ?? new Error('no display'))
      }
      const X = display.client
      const root = display.screen[0].root
      X.on('error', () => {})
      const done = (r: string | Error) => {
        clearTimeout(timer)
        setTimeout(() => X.terminate(), 100)
        r instanceof Error ? reject(r) : resolve(r)
      }
      // The focused window's class (walking up to the top-level window that has it).
      const wmClass = (win: number, depth = 0): Promise<string> =>
        new Promise((res) => {
          if (!win || win <= 1 || depth > 6) return res('')
          X.GetProperty(0, win, 67 /* WM_CLASS */, 31 /* STRING */, 0, 256, (e: unknown, p: any) => {
            const v = !e && p?.data?.length ? p.data.toString('latin1').replace(/\0/g, ' ').trim() : ''
            if (v) return res(v)
            X.QueryTree(win, (e2: unknown, t: any) => (e2 || !t?.parent || t.parent === root ? res('') : wmClass(t.parent, depth + 1).then(res)))
          })
        })
      X.require('xtest', (e: unknown, xt: any) => {
        if (e || !xt) return done(new Error('no XTest'))
        // (A plain callback: the x11 library drops async ones.)
        X.GetInputFocus((e2: unknown, f: any) => void (e2 ? Promise.resolve('') : wmClass(f?.focus)).then((cls) => {
          const chord = pasteChord(cls).split('+') as (keyof typeof KEYSYM)[]
          const min = display.min_keycode
          X.GetKeyboardMapping(min, display.max_keycode - min, (e3: unknown, map: number[][]) => {
            if (e3) return done(new Error('no keyboard map'))
            const codes = chord.map((k) => map.findIndex((row) => row.includes(KEYSYM[k])) + min)
            if (codes.some((c) => c < min)) return done(new Error('no keycode for paste'))
            for (const c of codes) xt.FakeInput(xt.KeyPress, c, 0, root, 0, 0)
            for (const c of [...codes].reverse()) xt.FakeInput(xt.KeyRelease, c, 0, root, 0, 0)
            done(cls)
          })
        }))
      })
    })
  })
}

const run = (cmd: string, args: string[]) => new Promise<void>((resolve, reject) => execFile(cmd, args, { timeout: 4000 }, (e) => (e ? reject(e) : resolve())))

/**
 * Type dictated text into the app you're in: through the clipboard and a
 * paste keystroke, then your clipboard comes back as it was. False if it
 * couldn't be pasted (the text stays on the clipboard then).
 */
export async function pasteIntoFocusedApp(text: string): Promise<boolean> {
  const before = clipboard.readText()
  clipboard.writeText(text)
  let ok = true
  try {
    if (process.platform === 'darwin') await run('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down'])
    else if (process.platform === 'win32') await run('powershell', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")'])
    else await x11Paste()
  } catch (e: any) {
    console.error(`[island] couldn't paste the dictated text: ${e?.message ?? e}`)
    ok = false
  }
  // Give the app a moment to read it, then put your clipboard back.
  if (ok) setTimeout(() => clipboard.readText() === text && clipboard.writeText(before), 800)
  return ok
}
