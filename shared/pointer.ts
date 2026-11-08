/** What the pointer page draws: an arrow flying to a spot (page pixels), or nothing. */
export type PointerCmd =
  | { t: 'show'; x: number; y: number; label: string; fromX: number; fromY: number; step?: { n: number; of: number } }
  | { t: 'hide' }
