import { requireOptionalNativeModule } from 'expo'
import type { IslandSummary } from '../../src/summary'

type IslandWidgetModule = {
  update(json: string): void
  count(): number
  add(): boolean
}

/** The home screen widget. Missing in Expo Go and on iOS: then there's none. */
const native = requireOptionalNativeModule<IslandWidgetModule>('IslandWidget')

let last = ''

export const islandWidget = {
  available: !!native,
  /** What the widget shows now (only written when it changed). */
  show(s: IslandSummary) {
    if (!native) return
    const json = JSON.stringify({ line: s.line, detail: s.detail, color: s.orb.color, ring: s.ring, dim: s.dim })
    if (json === last) return
    last = json
    try {
      native.update(json)
    } catch {
      // no widget support on this phone
    }
  },
  count: () => native?.count() ?? 0,
  /** Ask the home screen to add it; false where it can't. */
  add: () => native?.add() ?? false,
}
