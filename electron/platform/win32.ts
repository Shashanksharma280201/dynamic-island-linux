import { noMedia, type Platform } from './index'
import { electronCursor } from './electronCursor'

/** Windows: filled in on the windows branch. Until then nothing is playing and only the panel works. */
export function win32(): Platform {
  return {
    id: 'win32',
    media: noMedia,
    system: () => ({ read: async () => ({ volume: 0, muted: false, wifi: null, bluetooth: null, brightness: null }), apply: async () => {} }),
    notifications: false,
    readCursor: electronCursor,
    cursorPhysical: false,
  }
}
