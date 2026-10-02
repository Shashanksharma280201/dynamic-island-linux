/** IPC channels used by the settings window. */
export const SETTINGS = {
  GET: 'settings:get',
  CHANGED: 'settings:changed',
  SET_NOTIFICATIONS: 'settings:set-notifications',
  SET_AUTOSTART: 'settings:set-autostart',
  SET_HOOK: 'settings:set-hook',
  SET_DOCK_SIDE: 'settings:set-dock-side',
  SET_APPEARANCE: 'settings:set-appearance',
  SET_SHORTCUT: 'settings:set-shortcut',
  SET_FROSTED: 'settings:set-frosted',
  OPEN_NOTES_FOLDER: 'settings:open-notes-folder',
  SET_WHATSAPP: 'settings:set-whatsapp',
  RESTART: 'settings:restart',
  WA_PAIR: 'settings:whatsapp-pair',
  WA_LOGOUT: 'settings:whatsapp-logout',
  MAIL_PRESETS: 'settings:mail-presets',
  MAIL_TEST: 'settings:mail-test',
  MAIL_SAVE: 'settings:mail-save',
  MAIL_REMOVE: 'settings:mail-remove',
  SET_CLAUDE: 'settings:set-claude', // patch of the Claude Code options
  PICK_CLAUDE_FOLDER: 'settings:pick-claude-folder',
  SET_USAGE_BRIDGE: 'settings:set-usage-bridge',
  SET_SPOTIFY_CLIENT: 'settings:set-spotify-client',
  SPOTIFY_SIGN_IN: 'settings:spotify-sign-in',
  SPOTIFY_SIGN_OUT: 'settings:spotify-sign-out',
  SET_CHARACTER: 'settings:set-character', // { id?, name? }
  SET_AI: 'settings:set-ai', // { provider?, model?, baseUrl? } (model / baseUrl for the given or current provider)
  SET_AI_KEY: 'settings:set-ai-key', // (provider, key | '') — '' removes it
  SET_PACKAGE: 'settings:set-package', // (id, on)
  AI_MODELS: 'settings:ai-models', // invoke(provider) -> string[] (also tests the key)
} as const
