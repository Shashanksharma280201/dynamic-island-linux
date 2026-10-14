/** How an attached window reads in your message to Claude. Pure. */
export function attachmentNote(a: { title: string; path: string | null }): string {
  const name = a.title ? ` ("${a.title}")` : ''
  return a.path ? `(Attached: a screenshot of the window I was in${name}, at ${a.path}. Look at it if it helps.)` : `(For context: I was in the window${a.title ? ` "${a.title}"` : ' I had open'}.)`
}
