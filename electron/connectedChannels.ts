/** IPC channels of the connected package (its tab and buttons). */
export const CONNECTED = {
  VIEW: 'connected:view', // invoke -> ConnectedState
  CHANGED: 'connected:changed', // main -> renderer: ConnectedState
  ACTION: 'connected:action', // invoke(actionId) -> { ok, message }: a button in its tab, after you confirmed
} as const
