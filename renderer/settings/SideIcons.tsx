import type { ReactNode } from 'react'
import {
  ClaudeAppIcon,
  ConnectedAppIcon,
  MailAppIcon,
  NotesAppIcon,
  ServicesAppIcon,
  SettingsAppIcon,
  SpotifyAppIcon,
  Tile,
  WallpaperAppIcon,
  WhatsAppIcon,
} from '../island/hub/AppIcons'

const W = '#fff'

/** The sidebar's icons: coloured tiles with a white glyph, as in macOS System Settings. */
export const SIDE_ICONS: Record<string, ReactNode> = {
  you: (
    <Tile from="#5ac8fa" to="#007aff">
      <circle cx="14" cy="11" r="4" fill={W} />
      <path d="M6.5 22c.8-4.2 3.9-6.2 7.5-6.2s6.7 2 7.5 6.2z" fill={W} />
    </Tile>
  ),
  brain: (
    <Tile from="#ff7eb3" to="#c644fc">
      <path d="M11 7.5a3 3 0 0 0-3 3 3 3 0 0 0-1 5.6 3 3 0 0 0 4 3.9V7.5zM17 7.5a3 3 0 0 1 3 3 3 3 0 0 1 1 5.6 3 3 0 0 1-4 3.9V7.5z" fill={W} />
      <path d="M14 7v14" stroke="#d65fd8" strokeWidth="1.2" />
    </Tile>
  ),
  wallpaper: <WallpaperAppIcon />,
  character: (
    <Tile from="#ffb340" to="#ff7a00">
      <circle cx="14" cy="14" r="7.5" fill={W} />
      <circle cx="11.4" cy="13" r="1.1" fill="#ff8a00" />
      <circle cx="16.6" cy="13" r="1.1" fill="#ff8a00" />
      <path d="M11 16.2c1.6 1.6 4.4 1.6 6 0" stroke="#ff8a00" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </Tile>
  ),
  ai: (
    <Tile from="#a78bfa" to="#5e5ce6">
      <path d="M14 6.5l1.6 4.4 4.4 1.6-4.4 1.6L14 18.5l-1.6-4.4-4.4-1.6 4.4-1.6z" fill={W} />
      <path d="M20 17l.7 1.8 1.8.7-1.8.7L20 22l-.7-1.8-1.8-.7 1.8-.7z" fill={W} />
    </Tile>
  ),
  packages: (
    <Tile from="#c79a6b" to="#8e6a43">
      <path d="M14 6.5l7 3.5v8L14 21.5 7 18v-8z" fill={W} />
      <path d="M7 10l7 3.5 7-3.5M14 13.5v8" stroke="#a37e54" strokeWidth="1.2" fill="none" />
    </Tile>
  ),
  general: <SettingsAppIcon />,
  shortcuts: (
    <Tile from="#8e8e93" to="#636366">
      <rect x="6" y="9" width="16" height="10" rx="2" fill={W} />
      <path d="M8.5 12h1.5M11.5 12H13M15 12h1.5M18 12h1.5M10 16h8" stroke="#7a7a80" strokeWidth="1.3" strokeLinecap="round" />
    </Tile>
  ),
  drag: (
    <Tile from="#5ad8c4" to="#12a594">
      <rect x="7" y="7" width="9" height="11" rx="1.8" fill={W} opacity="0.55" />
      <rect x="11" y="10" width="9" height="11" rx="1.8" fill={W} />
    </Tile>
  ),
  drop: (
    <Tile from="#5ed36a" to="#28a745">
      <rect x="10" y="6" width="8" height="15" rx="2" fill={W} />
      <path d="M14 23.5v-3M12.3 21.8 14 23.5l1.7-1.7" stroke={W} strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </Tile>
  ),
  claude: <ClaudeAppIcon />,
  connected: <ConnectedAppIcon />,
  services: <ServicesAppIcon />,
  spotify: <SpotifyAppIcon />,
  notes: <NotesAppIcon />,
  whatsapp: <WhatsAppIcon />,
  mail: <MailAppIcon />,
}
