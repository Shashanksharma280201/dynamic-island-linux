/** The island's sound events, and your own files for them. */

export const SOUND_KINDS = ['peek', 'open', 'close', 'ask', 'ok', 'done', 'error', 'gulp', 'boop', 'dizzy'] as const
export type SoundKind = (typeof SOUND_KINDS)[number]

/** What each sound is for (Settings explains the file names). */
export const SOUND_INFO: Record<SoundKind, string> = {
  peek: 'the island peeks',
  open: 'it opens',
  close: 'it closes',
  ask: 'something needs you',
  ok: 'you allow something',
  done: 'Claude finishes',
  error: 'something went wrong',
  gulp: 'files dropped on it',
  boop: 'you boop the character',
  dizzy: 'it gets dizzy',
}

const EXTS: Record<string, string> = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.webm': 'audio/webm' }

/** Biggest file used: a sound, not a song. */
export const MAX_SOUND_BYTES = 2 * 1024 * 1024

/** The audio type of a file name, or null if it isn't one we play. Pure. */
export function soundMime(name: string): string | null {
  const m = name.toLowerCase().match(/\.[a-z0-9]+$/)
  return (m && EXTS[m[0]]) || null
}

/** Which files in the folder replace which sounds ("done.mp3" → done). Pure. */
export function customSoundFiles(names: string[]): Partial<Record<SoundKind, string>> {
  const out: Partial<Record<SoundKind, string>> = {}
  for (const name of [...names].sort()) {
    const base = name.toLowerCase().replace(/\.[a-z0-9]+$/, '')
    if ((SOUND_KINDS as readonly string[]).includes(base) && soundMime(name) && !out[base as SoundKind]) out[base as SoundKind] = name
  }
  return out
}
