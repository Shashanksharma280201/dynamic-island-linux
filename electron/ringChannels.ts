/** IPC channels of the drag actions ring's page. */
export const RING = {
  OPEN: 'ring:open', // main -> page: { env, pointer, files? } a drag is holding still: get ready
  POINTER: 'ring:pointer', // main -> page: { x, y } the pointer, in the page
  END: 'ring:end', // main -> page: the button was let go (a drop here may follow, or not)
  CLOSE: 'ring:close', // main -> page: the pointer moved away: fold up
  READY: 'ring:ready', // page -> main: loaded and listening
  SHOWN: 'ring:shown', // page -> main: the ring is showing (it knows the files' types)
  NONE: 'ring:none', // page -> main: nothing here for these files: hide
  DROP: 'ring:drop', // page -> main: { slot, choice?, paths } let go on an action
} as const

/** The island's buttons on a drag action's card. */
export const JOB = {
  OPEN: 'job:open', // id: open the file it made
  SHOW: 'job:show', // id: show it in its folder
  UNDO: 'job:undo', // id: move what it made to the trash
  DRAG: 'job:drag', // id: drag the file it made out of the island
} as const
