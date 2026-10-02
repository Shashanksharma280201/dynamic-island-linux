import type { NotesStore } from '../notes'

/** JSON Schema for a tool's input (the subset every provider understands). */
export type ToolSchema = {
  type: 'object'
  properties: Record<string, { type: 'string' | 'number' | 'boolean'; description?: string }>
  required: string[]
  additionalProperties: false
}

/** Something the agent can do. Packages will add their own. */
export type AgentTool = {
  name: string
  description: string
  input_schema: ToolSchema
  /** Status line while it runs, e.g. "Searching your notes for “rent”". */
  label: (input: Record<string, unknown>) => string
  run: (input: Record<string, unknown>) => Promise<string>
}

/**
 * Check a tool input against its schema (models can send bad JSON or wrong
 * types). Returns an error message, or null when it's fine. Pure.
 */
export function checkInput(schema: ToolSchema, input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Input must be a JSON object.'
  const o = input as Record<string, unknown>
  for (const k of schema.required) if (!(k in o)) return `Missing "${k}".`
  for (const [k, v] of Object.entries(o)) {
    const p = schema.properties[k]
    if (!p) return `Unknown field "${k}".`
    if (typeof v !== p.type) return `"${k}" must be a ${p.type}.`
  }
  return null
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const schema = (properties: ToolSchema['properties'], required: string[] = []): ToolSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})

/** The tools every provider gets. */
export function builtinTools(d: { notes: NotesStore; now?: () => Date }): AgentTool[] {
  const now = d.now ?? (() => new Date())
  return [
    {
      name: 'current_time',
      description: 'The current local date, time and time zone on the user’s computer.',
      input_schema: schema({}),
      label: () => 'Checking the time',
      run: async () => {
        const t = now()
        return `${t.toString()} (ISO ${t.toISOString()}, time zone ${Intl.DateTimeFormat().resolvedOptions().timeZone})`
      },
    },
    {
      name: 'notes_search',
      description:
        'Search the user’s notes (kept on this computer). Returns matching notes, newest first, with their id, title and a preview. An empty query lists the latest notes.',
      input_schema: schema({ query: { type: 'string', description: 'Words to look for; empty for the latest notes.' } }),
      label: (i) => (str(i.query) ? `Searching your notes for “${str(i.query)}”` : 'Looking through your notes'),
      run: async (i) => {
        const q = str(i.query).trim().toLowerCase()
        const all = await d.notes.list()
        const hits = (q ? all.filter((n) => `${n.title}\n${n.preview}`.toLowerCase().includes(q)) : all).slice(0, 15)
        if (!hits.length) return q ? `No notes match “${q}”.` : 'There are no notes yet.'
        return hits.map((n) => `id: ${n.id}\ntitle: ${n.title}\nupdated: ${new Date(n.updated).toISOString()}\npreview: ${n.preview}`).join('\n\n')
      },
    },
    {
      name: 'notes_read',
      description: 'Read the full text of one note by its id (from notes_search).',
      input_schema: schema({ id: { type: 'string', description: 'The note id.' } }, ['id']),
      label: () => 'Reading a note',
      run: async (i) => {
        const n = await d.notes.get(str(i.id))
        return n.body
      },
    },
    {
      name: 'notes_create',
      description:
        'Save a new note for the user. The first line becomes its title. Use it when they ask you to note, remember or write something down.',
      input_schema: schema({ text: { type: 'string', description: 'The note: first line is the title.' } }, ['text']),
      label: () => 'Writing a note',
      run: async (i) => {
        const text = str(i.text).trim()
        if (!text) throw new Error('The note is empty.')
        const id = await d.notes.save(undefined, text.slice(0, 20000))
        return `Saved the note (id ${id}).`
      },
    },
  ]
}

/** Run one tool call: validated, and failures returned as text for the model. */
export async function runTool(tools: AgentTool[], name: string, input: unknown): Promise<{ ok: boolean; output: string }> {
  const tool = tools.find((t) => t.name === name)
  if (!tool) return { ok: false, output: `There is no tool called ${name}.` }
  const bad = checkInput(tool.input_schema, input)
  if (bad) return { ok: false, output: `Invalid input: ${bad}` }
  try {
    return { ok: true, output: (await tool.run(input as Record<string, unknown>)).slice(0, 50_000) }
  } catch (e: any) {
    return { ok: false, output: `Failed: ${e?.message ?? e}` }
  }
}
