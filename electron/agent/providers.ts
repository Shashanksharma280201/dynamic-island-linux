import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { ProviderKind } from '@shared/ai'
import { runTool, type AgentTool, type Approver } from './tools'

/** A finished exchange, as plain text (works with any provider). */
export type TextTurn = { user: string; assistant: string }

export type TurnEvents = {
  /** A new model message started (its text replaces what was shown). */
  onMessageStart: () => void
  onText: (delta: string) => void
  onTool: (name: string, label: string) => void
  /** A tool finished; the model is thinking again. */
  onToolDone: () => void
}

export type TurnRequest = {
  kind: Exclude<ProviderKind, 'claude-code'>
  model: string
  apiKey: string
  baseUrl?: string
  system: string
  history: TextTurn[]
  prompt: string
  tools: AgentTool[]
  /** Asks the user before tools that act for them. */
  approve?: Approver
  signal: AbortSignal
  events: TurnEvents
}

export type TurnResult = { text: string; steps: number }

/** Stop a runaway tool loop. */
export const MAX_STEPS = 12

export class AgentError extends Error {}

// ------------------------------------------------------------- Anthropic ----

/** Models that take server-side refusal fallbacks (`fallbacks: "default"`). Pure. */
export function supportsFallback(model: string): boolean {
  return /^claude-(opus-5|fable-5-1|sonnet-5-5)/.test(model)
}

/**
 * The assistant content to send back on the next request. After a mid-output
 * fallback, thinking and tool_use blocks before the last fallback block belong
 * to the model that declined and must be left out. Pure.
 */
export function echoContent<T extends { type: string }>(content: T[]): T[] {
  const last = content.map((b) => b.type).lastIndexOf('fallback')
  if (last < 0) return content
  const drop = new Set(['thinking', 'redacted_thinking', 'tool_use'])
  return content.filter((b, i) => i > last || !drop.has(b.type))
}

async function anthropicTurn(r: TurnRequest): Promise<TurnResult> {
  const client = new Anthropic({ apiKey: r.apiKey, authToken: null, baseURL: r.baseUrl || undefined, maxRetries: 2 })
  const messages: Anthropic.Beta.BetaMessageParam[] = []
  for (const t of r.history) {
    messages.push({ role: 'user', content: t.user }, { role: 'assistant', content: t.assistant })
  }
  messages.push({ role: 'user', content: r.prompt })
  // Tool inputs here are small, so the server's buffered validation is kept
  // (no eager_input_streaming); inputs are still checked before running.
  const tools: Anthropic.Beta.BetaTool[] = r.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
  const fallback = supportsFallback(r.model)
  let steps = 0
  for (let i = 0; i <= MAX_STEPS; i++) {
    r.events.onMessageStart()
    const stream = client.beta.messages.stream(
      {
        model: r.model,
        max_tokens: 16000,
        system: r.system,
        messages,
        tools,
        // A request a model's safeguards decline is re-run on Anthropic's
        // recommended fallback model instead of failing.
        ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      },
      { signal: r.signal },
    )
    stream.on('text', (d) => r.events.onText(d))
    const msg = await stream.finalMessage()
    if (msg.stop_reason === 'refusal') throw new AgentError('The model declined to answer this one.')
    const content = echoContent(msg.content)
    const text = content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim()
    if (msg.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content })
      continue
    }
    const calls = content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (msg.stop_reason !== 'tool_use' || !calls.length) {
      if (msg.stop_reason === 'max_tokens' && calls.length) throw new AgentError('The answer was too long and got cut off.')
      return { text, steps }
    }
    if (i === MAX_STEPS) break
    messages.push({ role: 'assistant', content })
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
    for (const c of calls) {
      const tool = r.tools.find((t) => t.name === c.name)
      r.events.onTool(c.name, tool?.label((c.input ?? {}) as Record<string, unknown>) ?? c.name)
      const out = await runTool(r.tools, c.name, c.input, r.approve)
      steps++
      results.push({ type: 'tool_result', tool_use_id: c.id, content: out.output, ...(out.ok ? {} : { is_error: true }) })
    }
    // All results of one turn go back in a single user message.
    messages.push({ role: 'user', content: results })
    r.events.onToolDone()
  }
  throw new AgentError(`Stopped after ${MAX_STEPS} steps without finishing.`)
}

// --------------------------------------------------- OpenAI-compatible ----

type Call = { id: string; name: string; args: string }

/** Fold one streamed chunk's tool-call fragments into the calls so far. Pure. */
export function mergeToolCallDeltas(calls: Call[], deltas: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> | undefined): Call[] {
  if (!deltas?.length) return calls
  const next = calls.map((c) => ({ ...c }))
  for (const d of deltas) {
    const i = d.index ?? next.length
    const c = (next[i] ??= { id: '', name: '', args: '' })
    if (d.id) c.id = d.id
    if (d.function?.name) c.name += d.function.name
    if (d.function?.arguments) c.args += d.function.arguments
  }
  return next
}

/** Some local models reject the tools field; we then retry without tools. Pure. */
export function rejectsTools(e: any): boolean {
  return e?.status === 400 && /tool|function/i.test(String(e?.message ?? ''))
}

async function openaiTurn(r: TurnRequest): Promise<TurnResult> {
  const client = new OpenAI({ apiKey: r.apiKey || 'not-needed', baseURL: r.baseUrl, maxRetries: 2 })
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: r.system }]
  for (const t of r.history) messages.push({ role: 'user', content: t.user }, { role: 'assistant', content: t.assistant })
  messages.push({ role: 'user', content: r.prompt })
  let tools: OpenAI.Chat.ChatCompletionTool[] | undefined = r.tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }))
  let steps = 0
  for (let i = 0; i <= MAX_STEPS; i++) {
    r.events.onMessageStart()
    let stream
    try {
      stream = await client.chat.completions.create({ model: r.model, messages, stream: true, ...(tools ? { tools } : {}) }, { signal: r.signal })
    } catch (e) {
      if (tools && rejectsTools(e)) {
        tools = undefined // this model can't use tools: answer without them
        i--
        continue
      }
      throw e
    }
    let text = ''
    let calls: Call[] = []
    let finish: string | null = null
    for await (const chunk of stream) {
      const ch = chunk.choices?.[0]
      if (!ch) continue
      const d = ch.delta as any
      if (typeof d?.content === 'string' && d.content) {
        text += d.content
        r.events.onText(d.content)
      }
      calls = mergeToolCallDeltas(calls, d?.tool_calls)
      if (ch.finish_reason) finish = ch.finish_reason
    }
    calls = calls.filter((c) => c.name)
    if (!calls.length) {
      if (finish === 'length' && !text) throw new AgentError('The answer was too long and got cut off.')
      return { text: text.trim(), steps }
    }
    if (i === MAX_STEPS) break
    calls = calls.map((c, n) => ({ ...c, id: c.id || `call_${i}_${n}` }))
    messages.push({
      role: 'assistant',
      content: text || null,
      tool_calls: calls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.args || '{}' } })),
    })
    for (const c of calls) {
      let input: unknown
      try {
        input = c.args ? JSON.parse(c.args) : {}
      } catch {
        input = undefined
      }
      const tool = r.tools.find((t) => t.name === c.name)
      r.events.onTool(c.name, tool?.label((input ?? {}) as Record<string, unknown>) ?? c.name)
      const out = input === undefined ? { ok: false, output: `Invalid JSON in the arguments: ${c.args.slice(0, 500)}` } : await runTool(r.tools, c.name, input, r.approve)
      steps++
      messages.push({ role: 'tool', tool_call_id: c.id, content: out.output })
    }
    r.events.onToolDone()
  }
  throw new AgentError(`Stopped after ${MAX_STEPS} steps without finishing.`)
}

// ---------------------------------------------------------------- shared ----

export function runTurn(r: TurnRequest): Promise<TurnResult> {
  return r.kind === 'anthropic' ? anthropicTurn(r) : openaiTurn(r)
}

/** A plain-language message for what went wrong talking to a provider. */
export function friendlyError(e: any, label: string, baseUrl?: string): string {
  if (e instanceof AgentError) return e.message
  if (e?.name === 'AbortError' || e instanceof Anthropic.APIUserAbortError || e instanceof OpenAI.APIUserAbortError) return 'Stopped.'
  const status: number | undefined = e?.status
  if (e instanceof Anthropic.APIConnectionError || e instanceof OpenAI.APIConnectionError || (!status && /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(String(e?.message ?? e?.cause ?? ''))))
    return baseUrl?.includes('localhost') || baseUrl?.includes('127.0.0.1')
      ? `Couldn't reach ${baseUrl}. Is it running? (For Ollama: start it and pull the model.)`
      : `Couldn't reach ${label}. Check your internet connection.`
  if (status === 401 || status === 403) return `${label} rejected the API key. Check it in Settings → AI.`
  if (status === 404) return `${label} doesn't know that model. Pick another in Settings → AI.`
  if (status === 429) return `${label} says you're over your rate limit or out of credit. Try again in a bit.`
  if (status && status >= 500) return `${label} is having trouble right now (error ${status}). Try again shortly.`
  const msg = String(e?.error?.error?.message ?? e?.error?.message ?? e?.message ?? e)
  return `${label}: ${msg.slice(0, 300)}`
}

/** The models a provider offers (to pick from in Settings). */
export async function listModels(kind: Exclude<ProviderKind, 'claude-code'>, apiKey: string, baseUrl?: string): Promise<string[]> {
  if (kind === 'anthropic') {
    const client = new Anthropic({ apiKey, authToken: null, baseURL: baseUrl || undefined, maxRetries: 1, timeout: 15_000 })
    const out: string[] = []
    for await (const m of client.models.list()) out.push(m.id)
    return out
  }
  const client = new OpenAI({ apiKey: apiKey || 'not-needed', baseURL: baseUrl, maxRetries: 1, timeout: 15_000 })
  const out: string[] = []
  for await (const m of client.models.list()) out.push(m.id)
  return out.sort()
}
