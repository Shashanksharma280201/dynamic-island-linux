import { File } from 'expo-file-system'
import type { DropLink, SendResult } from './link'
import type { Side } from './protocol'

export type Outgoing = { uri: string; name: string; size: number }

/** The computer's edge the last file went in at: where a tap on Send sends the next one. */
let lastSide: Side = 'right'
export const sideUsed = () => lastSide
export const setSideUsed = (s: Side) => {
  lastSide = s
}

/** A file's size, read from the disk if it isn't known. */
export function sizeOf(f: { uri: string; size?: number }): number {
  if (f.size) return f.size
  try {
    return new File(f.uri).size ?? 0
  } catch {
    return 0
  }
}

/**
 * Send files to the computer as one drop: tell it which edge first (unless
 * the gesture already did), then each file's bytes in turn. `onProgress` gets
 * 0 to 1 for all of them together.
 */
export async function sendAll(
  link: DropLink,
  id: string,
  files: Outgoing[],
  side: Side,
  along: number,
  opts: { approach: boolean; thumb?: Promise<string | undefined>; onProgress: (p: number) => void },
): Promise<SendResult & { sent: number }> {
  const infos = files.map((f) => ({ name: f.name, size: sizeOf(f) }))
  if (opts.approach) {
    const thumb = await Promise.race([opts.thumb ?? Promise.resolve(undefined), new Promise<undefined>((r) => setTimeout(r, 450))])
    await link.approach(id, side, along, infos, thumb)
  }
  const total = infos.reduce((n, f) => n + f.size, 0) || 1
  let done = 0
  let last: SendResult = { ok: true, message: '' }
  for (const [i, f] of files.entries()) {
    const base = done
    last = await link.send(id, i, { uri: f.uri, name: f.name, size: infos[i].size }, (p) => opts.onProgress((base + p * infos[i].size) / total))
    if (!last.ok) return { ...last, sent: i }
    done += infos[i].size
  }
  opts.onProgress(1)
  return { ...last, sent: files.length }
}
