import { execFile } from 'node:child_process'

/**
 * Text to Kokoro's phonemes. Ported from kokoro-js (Apache-2.0,
 * github.com/hexgrad/kokoro, by Xenova): the same text clean-up, split on
 * punctuation, and fixes to espeak-ng's output. espeak-ng (GPL) runs as its
 * own program, never inside the island.
 */

function splitNum(e: string): string {
  if (e.includes('.')) return e
  if (e.includes(':')) {
    const [a, t] = e.split(':').map(Number)
    return t === 0 ? `${a} o'clock` : t < 10 ? `${a} oh ${t}` : `${a} ${t}`
  }
  const a = parseInt(e.slice(0, 4), 10)
  if (a < 1100 || a % 1000 < 10) return e
  const t = e.slice(0, 2)
  const r = parseInt(e.slice(2, 4), 10)
  const n = e.endsWith('s') ? 's' : ''
  if (a % 1000 >= 100 && a % 1000 <= 999) {
    if (r === 0) return `${t} hundred${n}`
    if (r < 10) return `${t} oh ${r}${n}`
  }
  return `${t} ${r}${n}`
}

function flipMoney(e: string): string {
  const unit = e[0] === '$' ? 'dollar' : 'pound'
  if (isNaN(Number(e.slice(1)))) return `${e.slice(1)} ${unit}s`
  if (!e.includes('.')) return `${e.slice(1)} ${unit}${e.slice(1) === '1' ? '' : 's'}`
  const [whole, frac] = e.slice(1).split('.')
  const n = parseInt(frac.padEnd(2, '0'), 10)
  const small = e[0] === '$' ? (n === 1 ? 'cent' : 'cents') : n === 1 ? 'penny' : 'pence'
  return `${whole} ${unit}${whole === '1' ? '' : 's'} and ${n} ${small}`
}

function pointNum(e: string): string {
  const [a, t] = e.split('.')
  return `${a} point ${t.split('').join(' ')}`
}

/** Kokoro's text clean-up: quotes, titles, numbers, money, times. Pure. */
export function normalizeText(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/«/g, '“')
    .replace(/»/g, '”')
    .replace(/[“”]/g, '"')
    .replace(/\(/g, '«')
    .replace(/\)/g, '»')
    .replace(/、/g, ', ')
    .replace(/。/g, '. ')
    .replace(/！/g, '! ')
    .replace(/，/g, ', ')
    .replace(/：/g, ': ')
    .replace(/；/g, '; ')
    .replace(/？/g, '? ')
    .replace(/[^\S \n]/g, ' ')
    .replace(/  +/, ' ')
    .replace(/(?<=\n) +(?=\n)/g, '')
    .replace(/\bD[Rr]\.(?= [A-Z])/g, 'Doctor')
    .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, 'Mister')
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, 'Miss')
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, 'Mrs')
    .replace(/\betc\.(?! [A-Z])/gi, 'etc')
    .replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, splitNum)
    .replace(/(?<=\d),(?=\d)/g, '')
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, flipMoney)
    .replace(/\d*\.\d+/g, pointNum)
    .replace(/(?<=\d)-(?=\d)/g, ' to ')
    .replace(/(?<=\d)S/g, ' S')
    .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
    .replace(/(?<=X')S\b/g, 's')
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (m) => m.replace(/\./g, '-'))
    .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, '-')
    .trim()
}

// Kept as they are: Kokoro reads them as pauses (\u2014 is the long dash).
const PUNCT = ';:,.!?¡¿\u2014…"«»“”(){}[]'
const PUNCT_RUN = new RegExp(`(\\s*[${PUNCT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]+\\s*)+`, 'g')

/** The text cut into words and punctuation runs, in order. Pure. */
export function splitPunct(text: string): { match: boolean; text: string }[] {
  const out: { match: boolean; text: string }[] = []
  let at = 0
  for (const m of text.matchAll(PUNCT_RUN)) {
    const idx = m.index ?? 0
    if (at < idx) out.push({ match: false, text: text.slice(at, idx) })
    if (m[0].length > 0) out.push({ match: true, text: m[0] })
    at = idx + m[0].length
  }
  if (at < text.length) out.push({ match: false, text: text.slice(at) })
  return out
}

/** espeak-ng's phonemes made into Kokoro's. Pure. */
export function fixPhonemes(s: string, lang: 'a' | 'b'): string {
  let out = s
    .replace(/kəkˈoːɹoʊ/g, 'kˈoʊkəɹoʊ')
    .replace(/kəkˈɔːɹəʊ/g, 'kˈəʊkəɹəʊ')
    .replace(/ʲ/g, 'j')
    .replace(/r/g, 'ɹ')
    .replace(/x/g, 'k')
    .replace(/ɬ/g, 'l')
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ')
    .replace(new RegExp(` z(?=[${PUNCT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ]|$)`, 'g'), 'z')
  if (lang === 'a') out = out.replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di')
  return out.trim()
}

/** Runs espeak-ng over lines of text: one line of phonemes per line in. */
export type Espeak = (lines: string[], voice: string) => Promise<string[]>

/** espeak-ng, or espeak, as a separate program. */
export function espeakProgram(bin: string): Espeak {
  return (lines, voice) =>
    new Promise((resolve, reject) => {
      const p = execFile(bin, ['-q', '--ipa', '-v', voice], { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 }, (e, out) => {
        if (e) return reject(e)
        resolve(String(out).replace(/\n+$/, '').split('\n').map((l) => l.trim()))
      })
      p.stdin?.end(lines.join('\n') + '\n')
    })
}

/** Text to Kokoro's phonemes: American ('a') or British ('b'). */
export async function phonemize(text: string, lang: 'a' | 'b', espeak: Espeak): Promise<string> {
  const parts = splitPunct(normalizeText(text))
  const words = parts.filter((p) => !p.match).map((p) => p.text.replace(/\s+/g, ' ').trim())
  const voice = lang === 'a' ? 'en-us' : 'en'
  const idx = words.map((w, n) => (w ? n : -1)).filter((n) => n >= 0)
  const lines = idx.map((n) => words[n])
  let said = lines.length ? await espeak(lines, voice) : []
  // One line out per line in; if espeak split or merged any, ask for each on its own.
  if (said.length !== lines.length) said = await Promise.all(lines.map(async (l) => (await espeak([l], voice)).join(' ')))
  const byWord = new Map(idx.map((n, k) => [n, said[k] ?? '']))
  let w = 0
  const joined = parts.map((p) => (p.match ? p.text : byWord.get(w++) ?? '')).join('')
  return fixPhonemes(joined, lang)
}
