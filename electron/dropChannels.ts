/** IPC channels of Phone Drop's overlay (the glow over the whole screen). */
export const DROP = {
  CMD: 'drop:cmd', // main -> page: a DropCmd
  READY: 'drop:ready', // page -> main: loaded and listening
  LANDED: 'drop:landed', // page -> main: id, the file reached the island
  IDLE: 'drop:idle', // page -> main: nothing showing: hide the window
} as const
