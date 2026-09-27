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
  SET_WHATSAPP: 'settings:set-whatsapp',
  RESTART: 'settings:restart',
  WA_PAIR: 'settings:whatsapp-pair',
  WA_LOGOUT: 'settings:whatsapp-logout',
  MAIL_PRESETS: 'settings:mail-presets',
  MAIL_TEST: 'settings:mail-test',
  MAIL_SAVE: 'settings:mail-save',
  MAIL_REMOVE: 'settings:mail-remove',
} as const
