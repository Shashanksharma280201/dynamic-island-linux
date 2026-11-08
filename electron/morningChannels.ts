/** The morning card between the main process and the island. */
export const MORNING = {
  CARD: 'morning:card', // main -> island: MorningCard | null
  GET: 'morning:get', // island -> main (invoke): MorningCard | null
  ACT: 'morning:act', // island -> main (invoke): 'send' | 'edit' | 'hold' | 'done'
} as const
