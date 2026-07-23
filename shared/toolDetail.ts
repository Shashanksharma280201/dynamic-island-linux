type Detail = { label: string; body: string }

const CAP = 1200 // don't render huge blobs on the island

function cap(s: string): string {
  return s.length > CAP ? s.slice(0, CAP) + '\n…(truncated)' : s
}

/**
 * Human-readable description of what a Claude tool call will do — the label
 * (what tool + target) and a monospace body (the command / content / diff).
 * Pure and tested.
 */
export function describeTool(toolName: string, input: any): Detail {
  const i = input ?? {}
  switch (toolName) {
    case 'Bash':
      return { label: 'Bash — run command', body: cap(String(i.command ?? '')) }
    case 'Write':
      return {
        label: `Write — ${i.file_path ?? ''}`,
        body: cap(String(i.content ?? '')),
      }
    case 'Edit':
      return {
        label: `Edit — ${i.file_path ?? ''}`,
        body: cap(`- ${i.old_string ?? ''}\n+ ${i.new_string ?? ''}`),
      }
    case 'MultiEdit':
      return {
        label: `MultiEdit — ${i.file_path ?? ''}`,
        body: cap(
          Array.isArray(i.edits)
            ? i.edits
                .map((e: any) => `- ${e.old_string ?? ''}\n+ ${e.new_string ?? ''}`)
                .join('\n\n')
            : '',
        ),
      }
    case 'Read':
    case 'Glob':
      return { label: toolName, body: cap(String(i.file_path ?? i.pattern ?? '')) }
    case 'Grep':
      return { label: 'Grep', body: cap(String(i.pattern ?? '')) }
    default:
      return { label: toolName, body: cap(JSON.stringify(i, null, 2)) }
  }
}
