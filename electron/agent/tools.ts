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
  /**
   * Acts for the user (sends, replies…): what to show when asking first.
   * The tool only runs if they allow it.
   */
  asks?: (input: Record<string, unknown>) => Promise<{ title: string; body: string }>
}

/** Ask the user before a tool that acts for them; resolves true to go ahead. */
export type Approver = (tool: AgentTool, input: Record<string, unknown>) => Promise<boolean>

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

export const str = (v: unknown) => (typeof v === 'string' ? v : '')
export const schema = (properties: ToolSchema['properties'], required: string[] = []): ToolSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})

/** Run one tool call: validated, and failures returned as text for the model. */
export async function runTool(tools: AgentTool[], name: string, input: unknown, approve?: Approver): Promise<{ ok: boolean; output: string }> {
  const tool = tools.find((t) => t.name === name)
  if (!tool) return { ok: false, output: `There is no tool called ${name}.` }
  const bad = checkInput(tool.input_schema, input)
  if (bad) return { ok: false, output: `Invalid input: ${bad}` }
  try {
    if (tool.asks) {
      // Never act for the user without asking, even if no one can be asked.
      const ok = approve ? await approve(tool, input as Record<string, unknown>) : false
      if (!ok) return { ok: false, output: 'The user did not allow this, so it was not done. Don’t retry it unless they ask again.' }
    }
    return { ok: true, output: (await tool.run(input as Record<string, unknown>)).slice(0, 50_000) }
  } catch (e: any) {
    return { ok: false, output: `Failed: ${e?.message ?? e}` }
  }
}
