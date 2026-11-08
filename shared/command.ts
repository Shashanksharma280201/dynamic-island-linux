/**
 * The command bar (like Spotlight): type to open an app, a file, a note or a
 * setting, work something out, change the system, or ask. The pure parts.
 */

export type CommandKind = 'app' | 'file' | 'note' | 'calc' | 'setting' | 'system' | 'ask' | 'agent'

export type CommandItem = {
  id: string
  kind: CommandKind
  title: string
  sub: string
  /** An icon name or a file:// URL (apps), when there is one. */
  icon?: string
}

export type DesktopApp = { id: string; name: string; comment: string; exec: string; icon: string; keywords: string[]; terminal: boolean }

/** A .desktop file's main entry, or null when it shouldn't be listed. Pure. */
export function parseDesktopEntry(id: string, text: string, lang = 'en'): DesktopApp | null {
  const lines = text.split(/\r?\n/)
  let inMain = false
  const kv: Record<string, string> = {}
  for (const l of lines) {
    const t = l.trim()
    if (t.startsWith('[')) {
      if (inMain) break
      inMain = t === '[Desktop Entry]'
      continue
    }
    if (!inMain || !t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    kv[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
  }
  if (kv.Type !== 'Application' || kv.NoDisplay === 'true' || kv.Hidden === 'true' || !kv.Exec) return null
  if (kv.OnlyShowIn && !/GNOME|Unity/i.test(kv.OnlyShowIn)) return null
  const local = (k: string) => kv[`${k}[${lang}]`] ?? kv[`${k}[${lang.split('_')[0]}]`] ?? kv[k] ?? ''
  const name = local('Name')
  if (!name) return null
  return {
    id,
    name,
    comment: local('Comment') || kv.GenericName || '',
    exec: kv.Exec,
    icon: kv.Icon ?? '',
    keywords: local('Keywords')
      .split(';')
      .map((k) => k.trim())
      .filter(Boolean),
    terminal: kv.Terminal === 'true',
  }
}

/** An Exec line as a command and its arguments, field codes (%U, %f…) taken out. Pure. */
export function cleanExec(exec: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote = false
  let started = false
  for (let i = 0; i < exec.length; i++) {
    const c = exec[i]
    if (c === '"') {
      quote = !quote
      started = true
    } else if (c === '\\' && quote && i + 1 < exec.length) {
      cur += exec[++i]
    } else if (/\s/.test(c) && !quote) {
      if (started) out.push(cur)
      cur = ''
      started = false
    } else {
      cur += c
      started = true
    }
  }
  if (started) out.push(cur)
  return out.filter((a) => !/^%[fFuUdDnNickvm]$/.test(a)).map((a) => a.replace(/%%/g, '%'))
}

/** How well a name matches what was typed: 0 for not at all, higher is better. Pure. */
export function matchScore(query: string, name: string, extra: string[] = []): number {
  const q = query.toLowerCase().trim()
  if (!q) return 0
  const n = name.toLowerCase()
  if (n === q) return 100
  if (n.startsWith(q)) return 80 - Math.min(20, n.length - q.length)
  if (n.split(/[\s\-_.]+/).some((w) => w.startsWith(q))) return 60
  if (n.includes(q)) return 45
  if (extra.some((k) => k.toLowerCase().startsWith(q))) return 35
  // Initials ("vsc" for Visual Studio Code) and letters in order.
  const initials = n
    .split(/[\s\-_.]+/)
    .map((w) => w[0])
    .join('')
  if (q.length >= 2 && initials.startsWith(q)) return 40
  let i = 0
  for (const c of n) if (c === q[i]) i++
  return i === q.length && q.length >= 3 ? 15 : 0
}

/**
 * Arithmetic only (numbers, + - * / % ^, brackets): no names, no code. The
 * answer, or null when it isn't a sum. Pure.
 */
export function calc(input: string): number | null {
  const s = input.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '')
  if (!/^[\d.+\-*/%^()]+$/.test(s) || !/\d/.test(s) || !/[+\-*/%^]/.test(s.replace(/^-/, ''))) return null
  let i = 0
  const peek = () => s[i]
  const num = (): number => {
    if (peek() === '(') {
      i++
      const v = expr()
      if (s[i++] !== ')') throw new Error('bracket')
      return v
    }
    if (peek() === '-') {
      i++
      return -num()
    }
    const m = /^\d*\.?\d+(?:e[+-]?\d+)?/.exec(s.slice(i))
    if (!m) throw new Error('number')
    i += m[0].length
    return Number(m[0])
  }
  const pow = (): number => {
    const b = num()
    if (peek() === '^') {
      i++
      return b ** pow()
    }
    return b
  }
  const term = (): number => {
    let v = pow()
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = s[i++]
      const r = pow()
      v = op === '*' ? v * r : op === '/' ? v / r : v % r
    }
    return v
  }
  const expr = (): number => {
    let v = term()
    while (peek() === '+' || peek() === '-') {
      const op = s[i++]
      const r = term()
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  try {
    const v = expr()
    return i === s.length && Number.isFinite(v) ? Math.round(v * 1e10) / 1e10 : null
  } catch {
    return null
  }
}

/** The files GNOME remembers you opened (recently-used.xbel), newest first. Pure. */
export function parseRecent(xbel: string): { path: string; at: number }[] {
  const out: { path: string; at: number }[] = []
  for (const m of xbel.matchAll(/<bookmark\s[^>]*href="file:\/\/([^"]+)"[^>]*?(?:modified|visited)="([^"]+)"/g)) {
    try {
      out.push({ path: decodeURIComponent(m[1]), at: Date.parse(m[2]) || 0 })
    } catch {
      // a broken entry
    }
  }
  return out.sort((a, b) => b.at - a.at)
}

export type SystemAction =
  | { t: 'theme'; value: 'light' | 'dark' }
  | { t: 'dnd'; on: boolean }
  | { t: 'volume'; value: number }
  | { t: 'mute' }
  | { t: 'lock' }
  | { t: 'wallpaper'; query: string }

/** A system change in plain words ("dark mode", "volume 40", "lock"). Pure. */
export function systemCommand(text: string): { action: SystemAction; title: string } | null {
  const t = text.toLowerCase().trim()
  if (/^(dark( mode)?|go dark)$/.test(t)) return { action: { t: 'theme', value: 'dark' }, title: 'Dark mode' }
  if (/^(light( mode)?|go light)$/.test(t)) return { action: { t: 'theme', value: 'light' }, title: 'Light mode' }
  if (/^(dnd|do not disturb|focus)( on)?$/.test(t)) return { action: { t: 'dnd', on: true }, title: 'Turn on Do Not Disturb' }
  if (/^(dnd|do not disturb|focus) off$/.test(t)) return { action: { t: 'dnd', on: false }, title: 'Turn off Do Not Disturb' }
  const vol = /^(?:volume|vol)\s+(\d{1,3})%?$/.exec(t)
  if (vol) return { action: { t: 'volume', value: Math.min(100, Number(vol[1])) }, title: `Volume ${Math.min(100, Number(vol[1]))}%` }
  if (/^(mute|unmute)$/.test(t)) return { action: { t: 'mute' }, title: t === 'mute' ? 'Mute' : 'Unmute' }
  if (/^(lock|lock screen|lock the screen)$/.test(t)) return { action: { t: 'lock' }, title: 'Lock the screen' }
  const wall = /^(?:wallpaper|background)\s+(.+)$/.exec(t)
  if (wall) return { action: { t: 'wallpaper', query: wall[1] }, title: `Set the wallpaper to “${wall[1]}”` }
  return null
}
