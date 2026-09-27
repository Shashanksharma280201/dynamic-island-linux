import type { IslandApi, SettingsApi } from '../electron/preload'

declare global {
  interface Window {
    island: IslandApi
    settings: SettingsApi
  }
}
