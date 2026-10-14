/** IPC channels of the notification center (Notifications tab, Clear all, Do Not Disturb). */
export const NOTIFS = {
  VIEW: 'notifs:view', // invoke -> CenterView
  DISMISS: 'notifs:dismiss', // invoke(id)
  CLEAR_ALL: 'notifs:clear-all', // invoke -> number cleared
  UNDO: 'notifs:undo', // invoke: put the last cleared ones back
  SEEN: 'notifs:seen', // invoke: the Notifications tab was looked at
  SET_DND: 'notifs:set-dnd', // invoke(boolean)
  CHANGED: 'notifs:changed', // main -> renderer: CenterView
} as const
