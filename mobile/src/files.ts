import * as MediaLibrary from 'expo-media-library/legacy'
import { Directory, File, Paths } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'

/** Something on the phone you can send. */
export type Item = {
  key: string
  uri: string
  name: string
  size: number
  kind: 'photo' | 'video' | 'file'
  /** For the grid: "13:10", "Yesterday", "3 Oct". */
  when: number
  width?: number
  height?: number
}

const TRAY = 'tray'
const TRAY_LIST = 'tray.json'

function sizeOf(uri: string): number {
  try {
    return new File(uri).size ?? 0
  } catch {
    return 0
  }
}

/** Your latest photos and videos (asks for permission the first time). */
export async function recentMedia(limit = 60): Promise<{ items: Item[]; allowed: boolean; canAsk: boolean }> {
  let perm = await MediaLibrary.getPermissionsAsync(false, ['photo', 'video'])
  if (!perm.granted && perm.canAskAgain) perm = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video'])
  if (!perm.granted) return { items: [], allowed: false, canAsk: perm.canAskAgain }
  const page = await MediaLibrary.getAssetsAsync({ first: limit, mediaType: ['photo', 'video'], sortBy: [['creationTime', false]] })
  const items = page.assets.map(
    (a): Item => ({
      key: `m-${a.id}`,
      uri: a.uri,
      name: a.filename,
      size: sizeOf(a.uri),
      kind: a.mediaType === 'video' ? 'video' : 'photo',
      when: a.creationTime || a.modificationTime,
      width: a.width,
      height: a.height,
    }),
  )
  return { items, allowed: true, canAsk: perm.canAskAgain }
}

function trayDir(): Directory {
  const d = new Directory(Paths.document, TRAY)
  if (!d.exists) d.create({ intermediates: true })
  return d
}

/** Files you added (kept in the app, so they're there next time too). */
export function loadTray(): Item[] {
  try {
    const f = new File(Paths.document, TRAY_LIST)
    if (!f.exists) return []
    const list = JSON.parse(f.textSync())
    return Array.isArray(list) ? list.filter((i: Item) => i && typeof i.uri === 'string' && new File(i.uri).exists) : []
  } catch {
    return []
  }
}

function saveTray(items: Item[]) {
  new File(Paths.document, TRAY_LIST).write(JSON.stringify(items))
}

const kindOf = (name: string): Item['kind'] =>
  /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i.test(name) ? 'photo' : /\.(mp4|mov|mkv|webm|3gp)$/i.test(name) ? 'video' : 'file'

/** Pick files with the system picker and add copies of them to the tray. */
export async function addFiles(current: Item[]): Promise<Item[]> {
  const res = await File.pickFileAsync({ multipleFiles: true })
  if (res.canceled) return current
  const dir = trayDir()
  const added: Item[] = []
  for (const picked of res.result) {
    let name = picked.name || 'file'
    let dest = new File(dir, name)
    for (let i = 2; dest.exists; i++) {
      const dot = name.lastIndexOf('.')
      dest = new File(dir, dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`)
    }
    await picked.copy(dest)
    name = dest.name
    added.push({ key: `f-${Date.now()}-${added.length}`, uri: dest.uri, name, size: sizeOf(dest.uri), kind: kindOf(name), when: Date.now() })
  }
  const next = [...added, ...current]
  saveTray(next)
  return next
}

/** Take a file off the tray (and delete the app's copy). */
export function removeFromTray(current: Item[], key: string): Item[] {
  const item = current.find((i) => i.key === key)
  try {
    if (item) new File(item.uri).delete()
  } catch {
    // already gone
  }
  const next = current.filter((i) => i.key !== key)
  saveTray(next)
  return next
}

const thumbs = new Map<string, Promise<string | undefined>>()

/** A small JPEG of a photo, as a data URL, for the computer's glow (cached). */
export function thumbOf(item: Item): Promise<string | undefined> {
  if (item.kind !== 'photo') return Promise.resolve(undefined)
  let t = thumbs.get(item.key)
  if (!t) {
    t = (async () => {
      try {
        const ref = await ImageManipulator.manipulate(item.uri).resize({ width: 360 }).renderAsync()
        const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.62, base64: true })
        return out.base64 && out.base64.length < 280_000 ? `data:image/jpeg;base64,${out.base64}` : undefined
      } catch {
        return undefined
      }
    })()
    thumbs.set(item.key, t)
  }
  return t
}

/** "13:10" today, "Yesterday", or "3 Oct". */
export function whenText(ms: number, now = Date.now()): string {
  const d = new Date(ms)
  const today = new Date(now)
  const sameDay = d.toDateString() === today.toDateString()
  if (sameDay) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const y = new Date(now - 86_400_000)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
