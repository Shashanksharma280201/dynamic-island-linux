/** The command bar's messages. */
export const COMMAND = {
  OPEN: 'command:open', // island -> main (invoke): open the command bar
  QUERY: 'command:query', // (text) -> CommandItem[]
  RUN: 'command:run', // (id)
  CLOSE: 'command:close',
  SHOWN: 'command:shown', // main -> page: clear and focus
} as const
