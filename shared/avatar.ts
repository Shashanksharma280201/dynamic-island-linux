/** Up to two initials from letters/digits only (emoji and punctuation skipped). Pure. */
export function initialsOf(name: string): string {
  const out: string[] = []
  for (const word of name.split(/\s+/)) {
    const ch = word.match(/[\p{L}\p{N}]/u)?.[0]
    if (ch) out.push(ch.toUpperCase())
    if (out.length === 2) break
  }
  return out.join('')
}

// Colourful but calm gradients, like the default avatars in Messages / WhatsApp.
const PALETTE: [string, string][] = [
  ['#ff8a65', '#f4511e'],
  ['#ffb74d', '#fb8c00'],
  ['#81c784', '#43a047'],
  ['#4dd0e1', '#00acc1'],
  ['#64b5f6', '#1e88e5'],
  ['#9575cd', '#5e35b1'],
  ['#f06292', '#d81b60'],
  ['#a1887f', '#6d4c41'],
  ['#90a4ae', '#546e7a'],
  ['#aed581', '#7cb342'],
]

/** Stable colour for a name (same name, same colour). Pure. */
export function avatarGradient(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  const [a, b] = PALETTE[h % PALETTE.length]
  return `linear-gradient(180deg, ${a}, ${b})`
}

// Readable on dark glass, for group sender names.
const NAME_COLORS = ['#ff9f0a', '#64d2ff', '#30d158', '#ff6482', '#bf5af2', '#ffd60a', '#5e9eff', '#ff8a65']

export function nameColor(name: string): string {
  let h = 7
  for (const ch of name) h = (h * 33 + (ch.codePointAt(0) ?? 0)) >>> 0
  return NAME_COLORS[h % NAME_COLORS.length]
}
