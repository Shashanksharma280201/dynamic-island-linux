import * as MediaLibrary from 'expo-media-library/legacy'
import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'
import { kindOf, type Item } from './files'

/** A file the computer sent: kept in the app (Received), photos and videos in the gallery too. */
export type Received = Item & { from: string }

const LIST = 'received.json'

export function loadReceived(): Received[] {
  try {
    const f = new File(Paths.document, LIST)
    if (!f.exists) return []
    const list = JSON.parse(f.textSync())
    return Array.isArray(list) ? list.filter((i: Received) => i && typeof i.uri === 'string' && new File(i.uri).exists) : []
  } catch {
    return []
  }
}

function save(list: Received[]) {
  new File(Paths.document, LIST).write(JSON.stringify(list.slice(0, 200)))
}

/** Keep a file that arrived; photos and videos also go into the gallery ("Island Drop" album). */
export async function keepReceived(current: Received[], uri: string, name: string, size: number, from: string): Promise<Received[]> {
  const item: Received = { key: `r-${Date.now()}`, uri, name, size, kind: kindOf(name), when: Date.now(), from }
  if (item.kind === 'photo' || item.kind === 'video') {
    try {
      const perm = await MediaLibrary.getPermissionsAsync(false, ['photo', 'video'])
      if (perm.granted) {
        const asset = await MediaLibrary.createAssetAsync(uri)
        const album = await MediaLibrary.getAlbumAsync('Island Drop')
        if (album) await MediaLibrary.addAssetsToAlbumAsync([asset], album, false)
        else await MediaLibrary.createAlbumAsync('Island Drop', asset, false)
      }
    } catch {
      // still kept in the app
    }
  }
  const next = [item, ...current]
  save(next)
  return next
}

export function forgetReceived(current: Received[], key: string): Received[] {
  const item = current.find((i) => i.key === key)
  try {
    if (item) new File(item.uri).delete()
  } catch {
    // gone already
  }
  const next = current.filter((i) => i.key !== key)
  save(next)
  return next
}

/** Open it in another app (the system's share sheet: a viewer, Drive, WhatsApp…). */
export async function openReceived(item: Received): Promise<void> {
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(item.uri, { dialogTitle: item.name })
}
