import { createRequire } from 'node:module'
import { runTurn, echoContent, mergeToolCallDeltas, supportsFallback, friendlyError, listModels, rejectsTools } from '../electron/agent/providers'
import { checkInput, runTool } from '../electron/agent/tools'
import { packageTools } from '../electron/packages/tools'

/** Basics + Notes, with the other packages off. */
const builtinTools = (o: { notes: any }) => packageTools({ disabled: ['chats', 'mail', 'music', 'docs'] }, { notes: o.notes } as any)
import { contextFrom } from '../electron/agent/agent'

const require = createRequire(import.meta.url)
const { startFakeAi } = require('../e2e/fake-ai.cjs')

let ai: any
beforeAll(async () => (ai = await startFakeAi()))
afterAll(() => ai.close())

/** A notes store in memory. */
function memNotes() {
  const notes: { id: string; body: string }[] = []
  return {
    notes,
    store: {
      list: async () => notes.map((n) => ({ id: n.id, title: n.body.split('\n')[0], preview: n.body, created: 0, updated: 0 })),
      get: async (id: string) => ({ id, body: notes.find((n) => n.id === id)!.body }),
      save: async (_id: string | undefined, body: string) => {
        const id = `n${notes.length + 1}`
        notes.push({ id, body })
        return id
      },
    } as any,
  }
}

function turn(kind: 'anthropic' | 'openai-compatible', prompt: string, o: { model?: string; key?: string; history?: any[] } = {}) {
  const { store, notes } = memNotes()
  const seen: string[] = []
  const p = runTurn({
    kind,
    model: o.model ?? (kind === 'anthropic' ? 'claude-opus-5-5' : 'gpt-5'),
    apiKey: o.key ?? 'sk-test',
    baseUrl: ai.base,
    system: 'You are Orbit.',
    history: o.history ?? [],
    prompt,
    tools: builtinTools({ notes: store }),
    signal: new AbortController().signal,
    events: {
      onMessageStart: () => seen.push('start'),
      onText: () => {},
      onTool: (name, label) => seen.push(`tool:${name}:${label}`),
      onToolDone: () => seen.push('tool-done'),
    },
  })
  return { p, seen, notes }
}

test('Claude API: a tool call runs, its result goes back, and the answer comes out', async () => {
  ai.log.length = 0
  const { p, seen, notes } = turn('anthropic', 'remember to buy milk')
  const r = await p
  expect(r).toEqual({ text: 'Done! I saved that note for you.', steps: 1 })
  expect(notes.map((n) => n.body)).toEqual(['buy milk'])
  expect(seen).toEqual(['start', 'tool:notes_create:Writing a note', 'tool-done', 'start'])
  const [first, second] = ai.log.filter((l: any) => l.path === '/v1/messages')
  expect(first.headers['x-api-key']).toBe('sk-test')
  expect(first.body.system).toBe('You are Orbit.')
  expect(first.body.tools.map((t: any) => t.name)).toContain('notes_create')
  // Refusal fallbacks are on for current models.
  expect(first.body.fallbacks).toBe('default')
  expect(first.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01')
  // The tool result goes back in one user message, after the assistant turn.
  const [asst, user] = second.body.messages.slice(-2)
  expect(asst.content.map((b: any) => b.type)).toEqual(['text', 'tool_use'])
  expect(user.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_1' })
})

test('older Claude models don’t get the fallback beta', async () => {
  ai.log.length = 0
  await turn('anthropic', 'hello', { model: 'claude-haiku-4-5' }).p
  expect(ai.log[0].body.fallbacks).toBeUndefined()
  expect(supportsFallback('claude-sonnet-5-5')).toBe(true)
  expect(supportsFallback('claude-haiku-4-5')).toBe(false)
})

test('OpenAI-compatible: streamed tool call fragments are joined and run', async () => {
  ai.log.length = 0
  const { p, notes } = turn('openai-compatible', 'remember call mom')
  expect((await p).text).toBe('Done! I saved that note for you.')
  expect(notes[0].body).toBe('call mom')
  const [first, second] = ai.log.filter((l: any) => l.path === '/chat/completions')
  expect(first.headers.authorization).toBe('Bearer sk-test')
  expect(first.body.messages[0]).toEqual({ role: 'system', content: 'You are Orbit.' })
  expect(first.body.tools[0].type).toBe('function')
  const tail = second.body.messages.slice(-2)
  expect(tail[0].tool_calls[0]).toMatchObject({ id: 'call_1', function: { name: 'notes_create', arguments: '{"text":"call mom"}' } })
  expect(tail[1]).toMatchObject({ role: 'tool', tool_call_id: 'call_1' })
})

test('history is sent as plain turns', async () => {
  ai.log.length = 0
  await turn('openai-compatible', 'and now?', { history: [{ user: 'hi', assistant: 'hello!' }] }).p
  expect(ai.log[0].body.messages.slice(1)).toEqual([
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello!' },
    { role: 'user', content: 'and now?' },
  ])
  expect(contextFrom([{ prompt: 'a', reply: 'b', ok: true, at: 1 }, { prompt: 'x', reply: 'oops', ok: false, at: 2 }])).toEqual([{ user: 'a', assistant: 'b' }])
})

test('a model that can’t use tools still answers', async () => {
  ai.log.length = 0
  expect((await turn('openai-compatible', 'hi there', { model: 'no-tools' }).p).text).toBe('You said: hi there')
  expect(ai.log.map((l: any) => !!l.body.tools)).toEqual([true, false])
})

test('a rejected key becomes a plain message', async () => {
  for (const kind of ['anthropic', 'openai-compatible'] as const) {
    const e = await turn(kind, 'hi', { key: 'bad-key' }).p.catch((x) => x)
    expect(friendlyError(e, 'Test')).toBe('Test rejected the API key. Check it in Settings → AI.')
  }
  expect(friendlyError(Object.assign(new Error('fetch failed'), {}), 'Ollama', 'http://localhost:11434/v1')).toMatch(/Is it running/)
  expect(friendlyError({ status: 429 }, 'X')).toMatch(/rate limit/)
  expect(rejectsTools({ status: 400, message: 'model does not support tools' })).toBe(true)
})

test('model lists', async () => {
  expect(await listModels('anthropic', 'sk', ai.base)).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'])
  expect(await listModels('openai-compatible', '', ai.base)).toEqual(['gpt-5', 'gpt-5-mini', 'llama3.2'])
})

test('tool fragments, fallback echo, input checks', () => {
  let c = mergeToolCallDeltas([], [{ index: 0, id: 'a', function: { name: 'notes_', arguments: '{"q' } }])
  c = mergeToolCallDeltas(c, [{ index: 0, function: { name: 'search', arguments: '":1}' } }, { index: 1, id: 'b', function: { name: 'x' } }])
  expect(c).toEqual([{ id: 'a', name: 'notes_search', args: '{"q":1}' }, { id: 'b', name: 'x', args: '' }])
  expect(echoContent([{ type: 'thinking' }, { type: 'tool_use' }, { type: 'text' }, { type: 'fallback' }, { type: 'thinking' }, { type: 'tool_use' }]).map((b) => b.type)).toEqual([
    'text',
    'fallback',
    'thinking',
    'tool_use',
  ])
  expect(echoContent([{ type: 'thinking' }, { type: 'tool_use' }]).length).toBe(2)
  const schema = builtinTools({ notes: {} as any })[2].input_schema
  expect(checkInput(schema, { id: 'x' })).toBeNull()
  expect(checkInput(schema, {})).toBe('Missing "id".')
  expect(checkInput(schema, { id: 3 })).toBe('"id" must be a string.')
  expect(checkInput(schema, { id: 'x', extra: 1 })).toBe('Unknown field "extra".')
  expect(checkInput(schema, [])).toBe('Input must be a JSON object.')
})

test('tool failures go back to the model as text', async () => {
  const tools = builtinTools({ notes: { get: async () => Promise.reject(new Error('no such note')) } as any })
  expect(await runTool(tools, 'notes_read', { id: 'x' })).toEqual({ ok: false, output: 'Failed: no such note' })
  expect(await runTool(tools, 'nope', {})).toEqual({ ok: false, output: 'There is no tool called nope.' })
  expect((await runTool(tools, 'current_time', {})).ok).toBe(true)
})
