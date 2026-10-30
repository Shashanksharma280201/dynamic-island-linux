/** IPC channels of Phone Drop's overlay (the glow over the whole screen). */
export const DROP = {
  CMD: 'drop:cmd', // main -> page: a DropCmd
  READY: 'drop:ready', // page -> main: loaded and listening
  LANDED: 'drop:landed', // page -> main: id, the file reached the island
  IDLE: 'drop:idle', // page -> main: nothing showing: hide the window
  EDGE_READY: 'drop:edge-ready', // catcher page -> main: loaded
  EDGE_OVER: 'drop:edge-over', // catcher page -> main: the drag is over it (it takes the drop)
  EDGE_DROP: 'drop:edge-drop', // catcher page -> main: paths dropped at the phone's edge
} as const
