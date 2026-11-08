/** Search by meaning: the main process asks the island's page for vectors. */
export const EMBED = {
  ASK: 'embed:ask', // main -> island: { id, texts }
  DONE: 'embed:done', // island -> main: { id, vectors } | { id, error }
} as const
