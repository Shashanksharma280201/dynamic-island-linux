import { File } from 'expo-file-system'
import { folderFiles, type Item } from './files'
import type { DropLink, SendResult } from './link'
import type { Side } from './protocol'

/** A file to send; `dir` is the folder it's in when a folder is sent ("Holiday/Day 1"). */
export type Outgoing = { uri: string; name: string; size: number; dir?: string }

/** What to send for these: files as they are, a folder as all its files in their folders (at most 500 in all). */
export function filesOf(items: Pick<Item, 'uri' | 'name' | 'size' | 'kind'>[], max = 500): Outgoing[] {
  const out: Outgoing[] = []
  for (const it of items) {
    if (out.length >= max) break
    if (it.kind === 'folder') out.push(...folderFiles(it.uri, it.name, max - out.length))
    else out.push({ uri: it.uri, name: it.name, size: it.size })
  }
  return out
}

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
  const infos = files.map((f) => (f.dir ? { name: f.name, size: sizeOf(f), dir: f.dir } : { name: f.name, size: sizeOf(f) }))
  if (opts.approach) {
    const thumb = await Promise.race([opts.thumb ?? Promise.resolve(undefined), new Promise<undefined>((r) => setTimeout(r, 450))])
    await link.approach(id, side, along, infos, thumb)
  }
  const total = infos.reduce((n, f) => n + f.size, 0) || 1
  let done = 0
  let last: SendResult = { ok: true, message: '' }
  for (const [i, f] of files.entries()) {
    const base = done
    last = await link.send(id, i, { uri: f.uri, name: f.name, size: infos[i].size, dir: f.dir }, (p) => opts.onProgress((base + p * infos[i].size) / total))
    if (!last.ok) return { ...last, sent: i }
    done += infos[i].size
  }
  opts.onProgress(1)
  return { ...last, sent: files.length }
}
