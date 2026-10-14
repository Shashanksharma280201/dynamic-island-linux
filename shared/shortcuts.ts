/** The island's global keyboard shortcuts, which you can change in Settings. */

export type ShortcutId = 'panel' | 'voice' | 'dictate' | 'allow' | 'deny' | 'always'
export type Shortcuts = Record<ShortcutId, string>

export const DEFAULT_SHORTCUTS: Shortcuts = {
  panel: 'CommandOrControl+I',
  voice: 'Control+Alt+Space',
  dictate: 'Control+Alt+D',
  allow: 'Control+Alt+Y',
  deny: 'Control+Alt+N',
  always: 'Control+Alt+A',
}

/** What each one does, for Settings and the cheat sheet. */
export const SHORTCUT_INFO: Record<ShortcutId, { label: string; hint: string }> = {
  panel: { label: 'Open or close the island', hint: 'From any app' },
  voice: { label: 'Talk to Claude', hint: 'Press again (or stop talking) to send' },
  dictate: { label: 'Dictate anywhere', hint: 'Speak, and it’s typed into the app you’re in' },
  allow: { label: 'Allow', hint: 'While Claude Code asks for permission' },
  deny: { label: 'Don’t Allow', hint: 'While Claude Code asks for permission' },
  always: { label: 'Always Allow', hint: 'While Claude Code asks for permission' },
}

const MODIFIERS = ['CommandOrControl', 'Control', 'Ctrl', 'Alt', 'Shift', 'Super', 'Meta', 'Command', 'Cmd']
const NAMED = ['Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'Up', 'Down', 'Left', 'Right', 'Escape', 'Enter']

/** Electron's name for the key of a KeyboardEvent `code`, or null for one we don't take. Pure. */
export function keyFromCode(code: string): string | null {
  let m = code.match(/^Key([A-Z])$/)
  if (m) return m[1]
  m = code.match(/^Digit(\d)$/)
  if (m) return m[1]
  m = code.match(/^F(\d{1,2})$/)
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 24) return `F${m[1]}`
  const map: Record<string, string> = {
    Space: 'Space',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Enter',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Backquote: '`',
  }
  return map[code] ?? null
}

/**
 * The accelerator for a key press (what you pressed while recording), or a
 * reason it can't be one: it needs Ctrl, Alt or Super plus one other key. Pure.
 */
export function accelFromKeys(e: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; code: string }): { accel: string } | { error: string } {
  const key = keyFromCode(e.code)
  if (!key) return { error: 'Press a letter, a number or a function key with it' }
  const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean) as string[]
  if (!e.ctrlKey && !e.altKey && !e.metaKey && !/^F\d+$/.test(key)) return { error: 'Use Ctrl, Alt or Super with it, so normal typing isn’t caught' }
  return { accel: [...mods, key].join('+') }
}

/** Whether `accel` is a shortcut we can register. Pure. */
export function validAccel(accel: unknown): accel is string {
  if (typeof accel !== 'string' || accel.length > 60) return false
  const parts = accel.split('+')
  const key = parts[parts.length - 1]
  const mods = parts.slice(0, -1)
  if (!mods.every((m) => MODIFIERS.includes(m))) return false
  if (new Set(mods).size !== mods.length) return false
  const keyOk = /^[A-Z0-9]$/.test(key) || /^F([1-9]|1\d|2[0-4])$/.test(key) || NAMED.includes(key) || /^[-=[\];',./\\`]$/.test(key)
  if (!keyOk) return false
  return mods.length > 0 || /^F\d+$/.test(key)
}

/** The same keys, whichever way they're written ("CommandOrControl" is Ctrl here). Pure. */
export function sameAccel(a: string, b: string, mac = false): boolean {
  const norm = (s: string) =>
    s
      .split('+')
      .map((p) => (p === 'CommandOrControl' ? (mac ? 'Command' : 'Control') : p === 'Ctrl' ? 'Control' : p === 'Cmd' ? 'Command' : p === 'Meta' ? 'Super' : p))
      .sort()
      .join('+')
  return norm(a) === norm(b)
}

/** Which other shortcut of ours already uses `accel`, if any. Pure. */
export function clash(keys: Shortcuts, id: ShortcutId, accel: string, mac = false): ShortcutId | null {
  for (const other of Object.keys(keys) as ShortcutId[]) if (other !== id && sameAccel(keys[other], accel, mac)) return other
  return null
}

/** "Ctrl+Alt+Y" (or "⌃⌥Y" on a Mac). Pure. */
export function shortcutLabel(accel: string, mac = false): string {
  const parts = accel.split('+')
  if (mac) return parts.map((k) => ({ CommandOrControl: '⌘', Command: '⌘', Cmd: '⌘', Control: '⌃', Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Super: '⌘', Meta: '⌘' })[k] ?? k).join('')
  return parts.map((k) => ({ CommandOrControl: 'Ctrl', Control: 'Ctrl', Super: 'Super', Meta: 'Super' })[k] ?? k).join('+')
}

/** Saved shortcuts, with defaults for anything missing or broken. Pure. */
export function parseShortcuts(raw: unknown): Shortcuts {
  const out = { ...DEFAULT_SHORTCUTS }
  if (!raw || typeof raw !== 'object') return out
  for (const id of Object.keys(out) as ShortcutId[]) {
    const v = (raw as Record<string, unknown>)[id]
    if (validAccel(v)) out[id] = v
  }
  return out
}
