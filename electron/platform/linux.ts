import { readCursor } from '../cursor'
import { MediaProvider } from '../providers/media'
import { SystemControls } from '../providers/system'
import type { Platform } from './index'

/** Linux (X11): MPRIS over D-Bus, command-line system tools, the X cursor. */
export function linux(): Platform {
  return {
    id: 'linux',
    media: () => new MediaProvider(),
    system: () => new SystemControls(),
    notifications: true,
    readCursor,
    cursorPhysical: true,
  }
}
