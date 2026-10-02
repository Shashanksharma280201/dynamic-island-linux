import { noMedia, type Platform } from './index'
import { electronCursor } from './electronCursor'

/** macOS: filled in on the mac branch. Until then nothing is playing and only the panel works. */
export function darwin(): Platform {
  return {
    id: 'darwin',
    media: noMedia,
    system: () => ({ read: async () => ({ volume: 0, muted: false, wifi: null, bluetooth: null, brightness: null }), apply: async () => {} }),
    notifications: false,
    readCursor: electronCursor,
    cursorPhysical: false,
  }
}
