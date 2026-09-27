import type { IslandApi } from '../electron/preload'

declare global {
  interface Window {
    island: IslandApi
  }
}
