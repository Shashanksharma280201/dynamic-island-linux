/** IPC channels of the desktop companion's page. */
export const COMPANION = {
  STATE: 'companion:state', // main -> page: { mood, character }
  MOVE: 'companion:move', // page -> main: { dx, dy } while dragged
  DROP: 'companion:drop', // page -> main: let go (save the spot)
  CLICK: 'companion:click', // page -> main: clicked (open the island)
  READY: 'companion:ready', // page -> main: listening now, send the state
} as const
