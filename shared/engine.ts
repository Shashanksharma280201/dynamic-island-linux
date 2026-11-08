/**
 * The engine: a model on this computer answers first (Ollama), the cloud
 * only with your yes; each answer says where it ran, how long it took and
 * what it cost; and it learns from your own traces which questions you'd
 * rather send to the cloud. Pure functions.
 */

export type CloudMode = 'ask' | 'always' | 'never'
export type Where = 'local' | 'cloud'
export type JobChoice = 'auto' | Where

export type EngineConfig = {
  /** Answer with the local model first, when there is one. */
  localFirst: boolean
  /** Ollama's address. */
  localUrl: string
  /** Models for every day and for research ('' = pick from what's installed). */
  dailyModel: string
  researchModel: string
  /** The cloud (the AI in Settings › AI): ask each time, always, or never. */
  cloud: CloudMode
  /** Per job or feature: auto (local first), or always local or cloud. */
  jobs: Record<string, JobChoice>
  /** Learn from your traces (on this computer only) where each kind of question goes. */
  learn: boolean
}

export const ENGINE_DEFAULTS: EngineConfig = { localFirst: true, localUrl: 'http://localhost:11434', dailyModel: '', researchModel: '', cloud: 'ask', jobs: {}, learn: true }

const MODEL_RE = /^[\w.:/@+-]{1,120}$/

export function parseEngineConfig(raw: any): EngineConfig {
  const r = raw && typeof raw === 'object' ? raw : {}
  const c: EngineConfig = { ...ENGINE_DEFAULTS, jobs: {} }
  if (typeof r.localFirst === 'boolean') c.localFirst = r.localFirst
  if (typeof r.localUrl === 'string' && /^https?:\/\/[^\s/@]+(:\d+)?\/?$/.test(r.localUrl)) c.localUrl = r.localUrl.replace(/\/$/, '')
  if (typeof r.dailyModel === 'string' && (r.dailyModel === '' || MODEL_RE.test(r.dailyModel))) c.dailyModel = r.dailyModel
  if (typeof r.researchModel === 'string' && (r.researchModel === '' || MODEL_RE.test(r.researchModel))) c.researchModel = r.researchModel
  if (r.cloud === 'ask' || r.cloud === 'always' || r.cloud === 'never') c.cloud = r.cloud
  if (r.jobs && typeof r.jobs === 'object')
    for (const [k, v] of Object.entries(r.jobs)) if (/^[\w-]{1,40}$/.test(k) && (v === 'auto' || v === 'local' || v === 'cloud')) c.jobs[k] = v
  if (typeof r.learn === 'boolean') c.learn = r.learn
  return c
}

/** What each job and feature is called in Settings › Model. */
export const ENGINE_FEATURES: { id: string; label: string }[] = [
  { id: 'ask', label: 'Answers in Today' },
  { id: 'notifications', label: 'Sum up notifications' },
  { id: 'research', label: 'Research' },
  { id: 'brain', label: 'Session notes' },
  { id: 'daily', label: 'Daily signal' },
  { id: 'weekly', label: 'Weekly signal' },
  { id: 'morning', label: 'Morning card' },
  { id: 'triage', label: 'Evening filing' },
  { id: 'calls', label: 'Call notes' },
]

// ------------------------------------------------------------- cost ----

export type Usage = { input: number; output: number }

/**
 * Dollars per million tokens, input and output, for the models whose price
 * is known (Anthropic's current list). Anything else says "cost not known"
 * rather than guess.
 */
export const PRICES: Record<string, [number, number]> = {
  'claude-fable-5-1': [10, 50],
  'claude-fable-5': [10, 50],
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-opus-4-8': [5, 25],
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
}

/** What an answer cost in dollars, or null when the price isn't known. Pure. */
export function costOf(model: string, usage: Usage | null, where: Where): number | null {
  if (where === 'local') return 0
  if (!usage) return null
  const id = model.toLowerCase().replace(/-\d{8}$/, '')
  const p = PRICES[id] ?? Object.entries(PRICES).find(([k]) => id.startsWith(`${k}-`))?.[1]
  if (!p) return null
  // Haiku 5.5 costs more above 100K input tokens.
  const [i, o] = id.startsWith('claude-haiku-5-5') && usage.input > 100_000 ? [0.5, 2.5] : p
  return (usage.input * i + usage.output * o) / 1_000_000
}

/** "0 ¢", "0.03 ¢", "1.2 ¢", "$0.31". Pure. */
export function moneyText(usd: number | null): string {
  if (usd === null) return 'cost not known'
  if (usd === 0) return '0 ¢'
  const cents = usd * 100
  if (cents < 0.01) return '<0.01 ¢'
  if (cents < 100) return `${cents < 1 ? cents.toFixed(2) : cents.toFixed(1)} ¢`
  return `$${usd.toFixed(2)}`
}

export type AnswerMeta = { where: Where; label: string; model: string; ms: number; usage: Usage | null; cost: number | null }

/** "local model · 1.4 s · 0 ¢". Pure. */
export function metaText(m: AnswerMeta): string {
  const secs = m.ms < 1000 ? `${Math.max(0.1, Math.round(m.ms / 100) / 10)} s` : `${(m.ms / 1000).toFixed(1)} s`
  return `${m.where === 'local' ? 'local model' : m.label} · ${secs} · ${moneyText(m.cost)}`
}

// ----------------------------------------------------------- routing ----

/**
 * Where a question goes: a job's own choice first; then local when there
 * is a local model and it comes first (unless your traces say you send
 * this kind to the cloud); the cloud otherwise. Pure.
 */
export function route(o: { feature: string; cfg: EngineConfig; local: boolean; prefer?: Where; learned?: Where | null }): Where | null {
  const pinned = o.prefer ?? (o.cfg.jobs[o.feature] && o.cfg.jobs[o.feature] !== 'auto' ? (o.cfg.jobs[o.feature] as Where) : undefined)
  if (pinned === 'local') return o.local ? 'local' : null
  if (pinned === 'cloud') return o.cfg.cloud === 'never' ? null : 'cloud'
  if (o.cfg.learn && o.learned === 'cloud' && o.cfg.cloud !== 'never') return 'cloud'
  if (o.local && o.cfg.localFirst) return 'local'
  if (o.cfg.cloud === 'never') return o.local ? 'local' : null
  return 'cloud'
}

// ------------------------------------------------------------ traces ----

/** One answer, kept on this computer: where it ran, how long, what it cost, and whether you sent it on to the cloud. */
export type Trace = { at: number; feature: string; where: Where; model: string; ms: number; cost: number | null; escalated?: boolean }

/** This week's answers: how many here, how many in the cloud, and what they cost. Pure. */
export function weekUsage(log: Trace[], now: number): { local: number; cloud: number; cost: number; unknown: number } {
  const since = now - 7 * 86_400_000
  const out = { local: 0, cloud: 0, cost: 0, unknown: 0 }
  for (const t of log) {
    if (t.at < since) continue
    if (t.where === 'local') out.local++
    else {
      out.cloud++
      if (t.cost === null) out.unknown++
      else out.cost += t.cost
    }
  }
  return out
}

/** "412 local · 9 cloud · $0.31". Pure. */
export function weekText(w: ReturnType<typeof weekUsage>): string {
  return `${w.local} local · ${w.cloud} cloud · ${moneyText(w.cost)}${w.unknown ? ` (+${w.unknown} not priced)` : ''}`
}

/** What your traces say about a kind of question: you send most of these on to the cloud. Pure. */
export function learned(log: Trace[], feature: string, look = 20): Where | null {
  const mine = log.filter((t) => t.feature === feature && t.where === 'local').slice(-look)
  if (mine.length < 5) return null
  const sent = mine.filter((t) => t.escalated).length
  return sent >= 3 && sent * 2 >= mine.length ? 'cloud' : null
}

// ------------------------------------------------------------ models ----

export type LocalModel = { name: string; params: number | null }

/** Ollama's /api/tags, checked. Pure. */
export function parseTags(raw: unknown): LocalModel[] {
  const list = (raw as { models?: unknown[] })?.models
  if (!Array.isArray(list)) return []
  const out: LocalModel[] = []
  for (const m of list) {
    const name = (m as { name?: unknown })?.name
    if (typeof name !== 'string' || !MODEL_RE.test(name) || name.includes('..')) continue
    const p = String((m as { details?: { parameter_size?: unknown } }).details?.parameter_size ?? '')
    const n = /([\d.]+)\s*([BM])/i.exec(p) ?? /:(\d+(?:\.\d+)?)b\b/i.exec(name)
    const params = n ? Number(n[1]) / (n[2]?.toUpperCase() === 'M' ? 1000 : 1) : null
    // Embedding models can't answer questions.
    if (/embed|nomic|bge|minilm/i.test(name)) continue
    out.push({ name, params })
  }
  return out
}

/** A small model for every day, a larger one for research (what's installed decides). Pure. */
export function pickModel(models: LocalModel[], kind: 'daily' | 'research', chosen = ''): string {
  if (chosen && models.some((m) => m.name === chosen)) return chosen
  if (!models.length) return ''
  const sized = [...models].sort((a, b) => (a.params ?? 7) - (b.params ?? 7))
  if (kind === 'daily') return (sized.find((m) => (m.params ?? 7) <= 9) ?? sized[0]).name
  return sized[sized.length - 1].name
}
