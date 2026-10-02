import { PROVIDERS, baseUrlFor, modelFor, parseAiConfig, setupProblem, validBaseUrl } from '../shared/ai'
import { agentSystemPrompt } from '../electron/agent/prompt'
import { moodFor } from '../shared/character'

test('every provider is described', () => {
  expect(PROVIDERS.map((p) => p.id)).toEqual(['claude-code', 'anthropic', 'openai', 'gemini', 'deepseek', 'openrouter', 'ollama', 'custom'])
  for (const p of PROVIDERS) expect(p.label && p.note).toBeTruthy()
  expect(PROVIDERS.find((p) => p.id === 'anthropic')!.defaultModel).toBe('claude-opus-5-5')
})

test('stored AI settings are validated', () => {
  expect(parseAiConfig(null)).toEqual({ provider: 'claude-code', models: {}, baseUrls: {}, keys: {} })
  const c = parseAiConfig({
    provider: 'openai',
    models: { openai: 'gpt-5-mini', anthropic: 'bad model name!', nope: 'x' },
    baseUrls: { ollama: 'http://192.168.1.5:11434/v1', openai: 'https://evil.example/v1', custom: 'ftp://x' },
    keys: { openai: 'enc:abc', deepseek: 'raw-key' },
  })
  expect(c).toEqual({ provider: 'openai', models: { openai: 'gpt-5-mini' }, baseUrls: { ollama: 'http://192.168.1.5:11434/v1' }, keys: { openai: 'enc:abc' } })
  expect(parseAiConfig({ provider: 'skynet' }).provider).toBe('claude-code')
})

test('model, address and what is missing', () => {
  const c = parseAiConfig({ provider: 'anthropic' })
  expect(modelFor(c)).toBe('claude-opus-5-5')
  expect(setupProblem(c)).toBe('Add your Claude (API key) API key in Settings → AI.')
  expect(setupProblem({ ...c, keys: { anthropic: 'enc:x' } })).toBeNull()
  expect(setupProblem(parseAiConfig({ provider: 'ollama' }))).toBeNull() // no key needed
  expect(baseUrlFor(parseAiConfig({ provider: 'ollama' }))).toBe('http://localhost:11434/v1')
  expect(setupProblem(parseAiConfig({ provider: 'custom' }))).toBe('Set the server address in Settings → AI.')
  expect(setupProblem(parseAiConfig({ provider: 'custom', baseUrls: { custom: 'http://localhost:1234/v1' } }))).toBe('Choose a model in Settings → AI.')
  expect(setupProblem(parseAiConfig({}))).toBeNull() // Claude Code
  expect(validBaseUrl('http://user:pass@host/v1')).toBe(false)
  expect(validBaseUrl('https://openrouter.ai/api/v1')).toBe(true)
})

test('the agent is the character', () => {
  const p = agentSystemPrompt({ id: 'mochi', name: 'Momo' })
  expect(p).toContain('You are Momo')
  expect(p).toContain('soft blob')
})

test('agent tools set the character’s mood', () => {
  expect(moodFor('tool', 'notes_search')).toBe('searching')
  expect(moodFor('tool', 'notes_read')).toBe('searching')
  expect(moodFor('tool', 'notes_create')).toBe('writing')
  expect(moodFor('tool', 'current_time')).toBe('working')
  expect(moodFor('tool', 'docs_read')).toBe('searching')
  expect(moodFor('tool', 'docx_edit')).toBe('writing')
  expect(moodFor('tool', 'pdf_merge')).toBe('working')
})
