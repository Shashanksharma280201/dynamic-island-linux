/**
 * The AI behind the island's agent. Claude Code runs on your Claude
 * subscription; every other provider is called with your own API key.
 * Two wire protocols cover them all: Anthropic's Messages API and the
 * OpenAI-compatible chat API (OpenAI, Gemini, DeepSeek, OpenRouter, Ollama…).
 */
export type ProviderId = 'claude-code' | 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'openrouter' | 'ollama' | 'custom'

export type ProviderKind = 'claude-code' | 'anthropic' | 'openai-compatible'

export type ProviderInfo = {
  id: ProviderId
  label: string
  kind: ProviderKind
  /** Where requests go (OpenAI-compatible); editable for Ollama and Other. */
  baseUrl?: string
  needsKey: boolean
  /** Where to get an API key. */
  keyHelp?: string
  /** A model to start with; "Load models" lists the rest. */
  defaultModel: string
  /** Suggestions shown before the list is loaded. */
  models: string[]
  note: string
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    kind: 'claude-code',
    needsKey: false,
    defaultModel: '',
    models: [],
    note: 'Uses your Claude subscription through the claude command. Works in a project folder, with your plan limits shown.',
  },
  {
    id: 'anthropic',
    label: 'Claude (API key)',
    kind: 'anthropic',
    needsKey: true,
    keyHelp: 'Create a key in the Claude Console under API keys.',
    defaultModel: 'claude-opus-5-5',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'],
    note: 'Anthropic’s API, billed to your API account.',
  },
  {
    id: 'openai',
    label: 'ChatGPT (OpenAI)',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    needsKey: true,
    keyHelp: 'Create a key at platform.openai.com under API keys.',
    defaultModel: 'gpt-5',
    models: ['gpt-5', 'gpt-5-mini'],
    note: 'OpenAI’s API, billed to your OpenAI account.',
  },
  {
    id: 'gemini',
    label: 'Gemini (Google)',
    kind: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    needsKey: true,
    keyHelp: 'Create a key in Google AI Studio.',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    note: 'Google’s Gemini models, through their OpenAI-compatible API.',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    needsKey: true,
    keyHelp: 'Create a key at platform.deepseek.com.',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    note: 'DeepSeek’s API.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    keyHelp: 'Create a key at openrouter.ai/keys. One key reaches hundreds of models.',
    defaultModel: 'openrouter/auto',
    models: ['openrouter/auto'],
    note: 'Many providers’ models with one key.',
  },
  {
    id: 'ollama',
    label: 'Ollama (on this computer)',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    needsKey: false,
    defaultModel: 'llama3.2',
    models: ['llama3.2', 'qwen2.5', 'mistral'],
    note: 'Free and private: models run on your own computer. Install Ollama and pull a model first. Small models can struggle with multi-step tasks.',
  },
  {
    id: 'custom',
    label: 'Other (OpenAI-compatible)',
    kind: 'openai-compatible',
    baseUrl: '',
    needsKey: false,
    defaultModel: '',
    models: [],
    note: 'Any service with an OpenAI-compatible chat API (LM Studio, vLLM, Groq, Together…).',
  },
]

export const DEFAULT_PROVIDER: ProviderId = 'claude-code'

export function providerInfo(id: ProviderId): ProviderInfo {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]
}

/** What's saved: the chosen provider and, per provider, its model and address. Keys are stored encrypted, separately. */
export type AiConfig = {
  provider: ProviderId
  models: Partial<Record<ProviderId, string>>
  baseUrls: Partial<Record<ProviderId, string>>
  /** Encrypted API keys (see secrets.ts). */
  keys: Partial<Record<ProviderId, string>>
}

const isProvider = (v: unknown): v is ProviderId => typeof v === 'string' && PROVIDERS.some((p) => p.id === v)

const MODEL_RE = /^[\w.:/@+-]{1,120}$/

/** Is this a usable base URL (http(s), no credentials in it)? Pure. */
export function validBaseUrl(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 300) return false
  try {
    const u = new URL(v)
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password
  } catch {
    return false
  }
}

/** Validate the stored AI settings. Pure. */
export function parseAiConfig(raw: any): AiConfig {
  const c: AiConfig = { provider: DEFAULT_PROVIDER, models: {}, baseUrls: {}, keys: {} }
  if (!raw || typeof raw !== 'object') return c
  if (isProvider(raw.provider)) c.provider = raw.provider
  for (const p of PROVIDERS) {
    const m = raw.models?.[p.id]
    if (typeof m === 'string' && MODEL_RE.test(m)) c.models[p.id] = m
    const u = raw.baseUrls?.[p.id]
    if ((p.id === 'ollama' || p.id === 'custom') && validBaseUrl(u)) c.baseUrls[p.id] = u
    const k = raw.keys?.[p.id]
    if (typeof k === 'string' && /^(enc|plain):/.test(k)) c.keys[p.id] = k
  }
  return c
}

/** The model a provider will use. Pure. */
export function modelFor(c: AiConfig, id: ProviderId = c.provider): string {
  return c.models[id] || providerInfo(id).defaultModel
}

/** The address a provider's requests go to. Pure. */
export function baseUrlFor(c: AiConfig, id: ProviderId = c.provider): string {
  return c.baseUrls[id] || providerInfo(id).baseUrl || ''
}

/** Why a provider can't be used yet, or null when it's ready. Pure. */
export function setupProblem(c: AiConfig, id: ProviderId = c.provider): string | null {
  const p = providerInfo(id)
  if (p.kind === 'claude-code') return null
  if (p.needsKey && !c.keys[id]) return `Add your ${p.label} API key in Settings → AI.`
  if (p.kind === 'openai-compatible' && !baseUrlFor(c, id)) return 'Set the server address in Settings → AI.'
  if (!modelFor(c, id)) return 'Choose a model in Settings → AI.'
  return null
}

/** The island's view of the agent's AI. */
export type AssistantInfo = {
  provider: ProviderId
  label: string
  model: string
  /** null when ready. */
  problem: string | null
}

/** What Settings → AI shows (never the keys themselves). */
export type AiSettings = {
  provider: ProviderId
  providers: Array<{ id: ProviderId; model: string; baseUrl: string; hasKey: boolean }>
}
