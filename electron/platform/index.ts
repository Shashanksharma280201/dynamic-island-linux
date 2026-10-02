import type { MediaCmd, MediaState, SysCmd, SystemState } from '@shared/types'

/** What's playing, and controlling it. */
export type MediaSource = {
  onChange: (cb: (s: MediaState | null) => void) => void
  start: () => Promise<void>
  command: (c: MediaCmd) => Promise<void>
  /** Play a spotify: URI in a running player; false if there's none. */
  openUri: (uri: string) => Promise<boolean>
  stop: () => Promise<void>
}

/** Volume, brightness, Wi-Fi and Bluetooth (null when not available). */
export type SystemSource = {
  read: () => Promise<SystemState>
  apply: (c: SysCmd) => Promise<void>
}

/** The parts of the island that work differently on each OS. */
export type Platform = {
  id: NodeJS.Platform
  media: () => MediaSource
  system: () => SystemSource
  /** Can show other apps' notifications (only Linux allows watching them). */
  notifications: boolean
  /** Where the pointer is; in physical pixels when `cursorPhysical`, else screen points. */
  readCursor: () => Promise<{ x: number; y: number } | null>
  cursorPhysical: boolean
}

/** Nothing playing that the island can see. */
export const noMedia = (): MediaSource => ({
  onChange: () => {},
  start: async () => {},
  command: async () => {},
  openUri: async () => false,
  stop: async () => {},
})

/** The parts for the OS the island runs on. */
export async function currentPlatform(): Promise<Platform> {
  switch (process.platform) {
    case 'darwin':
      return (await import('./darwin')).darwin()
    case 'win32':
      return (await import('./win32')).win32()
    default:
      return (await import('./linux')).linux()
  }
}
