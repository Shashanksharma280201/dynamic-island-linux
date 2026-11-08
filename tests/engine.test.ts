import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ENGINE_DEFAULTS,
  costOf,
  learned,
  metaText,
  moneyText,
  parseEngineConfig,
  parseTags,
  pickModel,
  route,
  weekText,
  weekUsage,
  type EngineConfig,
  type Trace,
} from '@shared/engine'
import { osCallArgs } from '@shared/os'
import { Engine, type Cloud } from '../electron/engine'

const require = createRequire(import.meta.url)
const { startFakeAi } = require('../e2e/fake-ai.cjs')

const cfg = (p: Partial<EngineConfig> = {}): EngineConfig => ({ ...ENGINE_DEFAULTS, jobs: {}, ...p })

describe('engine config', () => {
  it('keeps what is valid and drops the rest', () => {
    const c = parseEngineConfig({ localFirst: false, localUrl: 'http://box.lan:11434/', dailyModel: 'llama3.2:3b', researchModel: 'rm -rf /', cloud: 'always', jobs: { brain: 'cloud', 'bad key!': 'cloud', daily: 'sideways' }, learn: false })
    expect(c).toEqual({ localFirst: false, localUrl: 'http://box.lan:11434', dailyModel: 'llama3.2:3b', researchModel: '', cloud: 'always', jobs: { brain: 'cloud' }, learn: false })
    expect(parseEngineConfig(null)).toEqual(ENGINE_DEFAULTS)
    expect(parseEngineConfig({ localUrl: 'file:///etc/passwd' }).localUrl).toBe(ENGINE_DEFAULTS.localUrl)
    expect(parseEngineConfig({ localUrl: 'http://user@evil/' }).localUrl).toBe(ENGINE_DEFAULTS.localUrl)
  })
})

describe('routing', () => {
  it('starts on this computer when it can', () => {
    expect(route({ feature: 'notifications', cfg: cfg(), local: true })).toBe('local')
    expect(route({ feature: 'notifications', cfg: cfg(), local: false })).toBe('cloud')
    expect(route({ feature: 'notifications', cfg: cfg({ localFirst: false }), local: true })).toBe('cloud')
  })
  it('never means never', () => {
    expect(route({ feature: 'x', cfg: cfg({ cloud: 'never' }), local: false })).toBeNull()
    expect(route({ feature: 'x', cfg: cfg({ cloud: 'never', localFirst: false }), local: true })).toBe('local')
    expect(route({ feature: 'x', cfg: cfg({ cloud: 'never' }), local: true, prefer: 'cloud' })).toBeNull()
  })
  it('a job pinned to one place goes there (or nowhere)', () => {
    expect(route({ feature: 'brain', cfg: cfg({ jobs: { brain: 'cloud' } }), local: true })).toBe('cloud')
    expect(route({ feature: 'brain', cfg: cfg({ jobs: { brain: 'local' } }), local: false })).toBeNull()
    expect(route({ feature: 'brain', cfg: cfg({ jobs: { brain: 'auto' } }), local: true })).toBe('local')
  })
  it('what you pressed wins, then what it learned', () => {
    expect(route({ feature: 'brain', cfg: cfg({ jobs: { brain: 'cloud' } }), local: true, prefer: 'local' })).toBe('local')
    expect(route({ feature: 'ask', cfg: cfg(), local: true, learned: 'cloud' })).toBe('cloud')
    expect(route({ feature: 'ask', cfg: cfg({ learn: false }), local: true, learned: 'cloud' })).toBe('local')
  })
})

describe('cost', () => {
  it('prices known models per million tokens', () => {
    expect(costOf('claude-opus-5-5', { input: 1_000_000, output: 100_000 }, 'cloud')).toBeCloseTo(4 + 2)
    expect(costOf('claude-sonnet-5-5', { input: 1000, output: 500 }, 'cloud')).toBeCloseTo(0.002 + 0.005)
    expect(costOf('claude-haiku-5-5', { input: 100_000, output: 10_000 }, 'cloud')).toBeCloseTo(0.01 + 0.005)
    // Haiku 5.5 costs more past 100K input tokens in one request.
    expect(costOf('claude-haiku-5-5', { input: 200_000, output: 10_000 }, 'cloud')).toBeCloseTo(0.1 + 0.025)
  })
  it('local is free; unknown is unknown', () => {
    expect(costOf('llama3.2:3b', null, 'local')).toBe(0)
    expect(costOf('gpt-5', { input: 10, output: 10 }, 'cloud')).toBeNull()
    expect(costOf('claude-opus-5-5', null, 'cloud')).toBeNull()
  })
  it('says it plainly', () => {
    expect(moneyText(0)).toBe('0 ¢')
    expect(moneyText(null)).toBe('cost not known')
    expect(metaText({ where: 'local', label: 'Ollama (llama3.2:3b)', model: 'llama3.2:3b', ms: 1400, usage: null, cost: 0 })).toBe('local model · 1.4 s · 0 ¢')
    expect(metaText({ where: 'cloud', label: 'Claude (claude-opus-5-5)', model: 'claude-opus-5-5', ms: 300, usage: null, cost: null })).toBe('Claude (claude-opus-5-5) · 0.3 s · cost not known')
  })
})

describe('traces', () => {
  const now = Date.UTC(2026, 10, 8, 12)
  const t = (p: Partial<Trace>): Trace => ({ at: now - 1000, feature: 'ask', where: 'local', model: 'm', ms: 10, cost: 0, ...p })
  it('sums the week', () => {
    const log = [t({}), t({}), t({ where: 'cloud', cost: 0.02 }), t({ where: 'cloud', cost: null }), t({ at: now - 8 * 86_400_000, where: 'cloud', cost: 5 })]
    const w = weekUsage(log, now)
    expect(w).toEqual({ local: 2, cloud: 2, cost: 0.02, unknown: 1 })
    expect(weekText(w)).toMatch(/^2 local · 2 cloud · .+\(\+1 not priced\)$/)
  })
  it('learns only from enough of your own escalations', () => {
    const few = [t({ escalated: true }), t({ escalated: true }), t({ escalated: true })]
    expect(learned(few, 'ask')).toBeNull()
    const many = [...few, t({}), t({}), t({})]
    expect(learned(many, 'ask')).toBe('cloud')
    expect(learned([...many, t({}), t({})], 'ask')).toBeNull()
    expect(learned(many, 'brain')).toBeNull()
  })
})

describe('local models', () => {
  it('reads Ollama’s list, without embedding models', () => {
    const m = parseTags({ models: [{ name: 'llama3.2:3b', details: { parameter_size: '3.2B' } }, { name: 'nomic-embed-text:latest' }, { name: 'qwen3:14b' }, { name: 'tiny', details: { parameter_size: '494M' } }, { name: '../bad' }] })
    expect(m).toEqual([
      { name: 'llama3.2:3b', params: 3.2 },
      { name: 'qwen3:14b', params: 14 },
      { name: 'tiny', params: 0.494 },
    ])
    expect(parseTags('nope')).toEqual([])
  })
  it('a small one every day, the largest for research', () => {
    const m = parseTags({ models: [{ name: 'qwen3:14b' }, { name: 'llama3.2:3b' }, { name: 'big:70b' }] })
    expect(pickModel(m, 'daily')).toBe('llama3.2:3b')
    expect(pickModel(m, 'research')).toBe('big:70b')
    expect(pickModel(m, 'daily', 'qwen3:14b')).toBe('qwen3:14b')
    expect(pickModel(m, 'daily', 'gone:1b')).toBe('llama3.2:3b')
    expect(pickModel([], 'daily')).toBe('')
  })
})

describe('os calls', () => {
  it('only known calls, with arguments of the right kind', () => {
    expect(osCallArgs('engine.view', [])).toEqual({ fn: 'engine.view', args: [] })
    expect(osCallArgs('engine.set', [{ cloud: 'never' }])).not.toBeNull()
    expect(osCallArgs('engine.set', ['never'])).toBeNull()
    expect(osCallArgs('engine.set', [[1]])).toBeNull()
    expect(osCallArgs('engine.view', [1])).toBeNull()
    expect(osCallArgs('shell.exec', ['rm'])).toBeNull()
    expect(osCallArgs('toString', [])).toBeNull()
    expect(osCallArgs(42, [])).toBeNull()
  })
})

describe('the engine', () => {
  let ai: any
  let dir: string
  beforeAll(async () => (ai = await startFakeAi()))
  afterAll(() => ai.close())
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'engine-'))
    ai.ollama = true
    ai.log.length = 0
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const cloudCalls: string[] = []
  const fakeCloud: Cloud = {
    label: 'Claude (claude-sonnet-5-5)',
    model: 'claude-sonnet-5-5',
    ask: async (o) => {
      cloudCalls.push(o.feature)
      return { text: ' From the cloud. ', usage: { input: 1000, output: 100 } }
    },
  }
  const make = (c: Partial<EngineConfig> = {}, cloud: Cloud | null = fakeCloud) => {
    let config = cfg({ localUrl: ai.base, ...c })
    const e = new Engine({ config: () => config, cloud: () => cloud, file: join(dir, 'traces.json') })
    return { e, set: (p: Partial<EngineConfig>) => (config = { ...config, ...p }) }
  }

  it('finds Ollama and its models', async () => {
    const { e } = make()
    const st = await e.detect()
    expect(st.found).toBe(true)
    expect(st.daily).toBe('llama3.2:3b')
    expect(st.research).toBe('qwen3:14b')
    expect(e.label()).toBe('Ollama (llama3.2:3b) first, then Claude (claude-sonnet-5-5)')
  })

  it('says when there is no Ollama', async () => {
    ai.ollama = false
    const { e } = make()
    const st = await e.detect()
    expect(st.found).toBe(false)
    expect(st.error).toMatch(/Ollama/)
    expect(e.label()).toBe('Claude (claude-sonnet-5-5)')
    const off = make({ localUrl: 'http://127.0.0.1:9' }).e
    expect((await off.detect()).error).toBe('Ollama isn’t running here.')
  })

  it('answers locally first, for free, and keeps a trace', async () => {
    const { e } = make()
    const r = await e.ask({ feature: 'notifications', system: 'Sum up.', prompt: 'Here are my notifications to sum up: x', purpose: 'test', interactive: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.meta.where).toBe('local')
    expect(r.meta.model).toBe('llama3.2:3b')
    expect(r.meta.cost).toBe(0)
    expect(r.text).toMatch(/Alice wants lunch/)
    expect(ai.log.some((l: any) => l.path === '/v1/chat/completions' && l.body.model === 'llama3.2:3b')).toBe(true)
    expect(e.traceLog()).toHaveLength(1)
    expect(e.week().local).toBe(1)
  })

  it('research uses the larger model', async () => {
    const { e } = make()
    const r = await e.ask({ feature: 'research', system: 's', prompt: 'p', purpose: 't', research: true })
    expect(r.ok && r.meta.model).toBe('qwen3:14b')
  })

  it('asks before your question goes to the cloud, then counts it', async () => {
    ai.ollama = false
    const { e } = make()
    const first = await e.ask({ feature: 'notifications', system: 's', prompt: 'p', purpose: 't', interactive: true })
    expect(first).toEqual({ ok: false, needsConsent: 'Claude (claude-sonnet-5-5)' })
    const yes = await e.ask({ feature: 'notifications', system: 's', prompt: 'p', purpose: 't', interactive: true, consent: true })
    expect(yes.ok).toBe(true)
    if (!yes.ok) return
    expect(yes.text).toBe('From the cloud.')
    expect(yes.meta.cost).toBeCloseTo(0.002 + 0.001)
    // Always: no question.
    const always = make({ cloud: 'always' }).e
    expect((await always.ask({ feature: 'n', system: 's', prompt: 'p', purpose: 't', interactive: true })).ok).toBe(true)
  })

  it('Ask cloud after a local answer is remembered, and enough of them teach it', async () => {
    const { e } = make()
    for (let i = 0; i < 5; i++) {
      await e.ask({ feature: 'ask', system: 's', prompt: 'p', purpose: 't', interactive: true })
      if (i < 3) await e.ask({ feature: 'ask', system: 's', prompt: 'p', purpose: 't', interactive: true, prefer: 'cloud', consent: true })
    }
    expect(e.traceLog().filter((t) => t.escalated)).toHaveLength(3)
    expect(e.learnedFor('ask')).toBe('cloud')
    // Now this kind starts in the cloud (and, interactive, asks first).
    expect(await e.ask({ feature: 'ask', system: 's', prompt: 'p', purpose: 't', interactive: true })).toEqual({ ok: false, needsConsent: 'Claude (claude-sonnet-5-5)' })
  })

  it('a background job falls back to the cloud when the local model fails, without teaching it', async () => {
    cloudCalls.length = 0
    const { e } = make()
    await e.detect()
    ai.ollama = false // gone after it was found: the chat call fails
    const r = await e.ask({ feature: 'brain', system: 's', prompt: 'p', purpose: 't' })
    expect(r.ok && r.meta.where).toBe('cloud')
    expect(cloudCalls).toEqual(['brain'])
    expect(e.traceLog().some((t) => t.escalated)).toBe(false)
    // Your own question doesn't silently go to the cloud.
    const mine = await e.ask({ feature: 'ask', system: 's', prompt: 'p', purpose: 't', interactive: true })
    expect(mine.ok).toBe(false)
    expect(cloudCalls).toEqual(['brain'])
  })

  it('never and nothing', async () => {
    ai.ollama = false
    const { e } = make({ cloud: 'never' })
    expect(e.available()).toBe(false)
    const r = await e.ask({ feature: 'x', system: 's', prompt: 'p', purpose: 't', interactive: true })
    expect(r.ok).toBe(false)
    expect(!r.ok && 'error' in r && r.error).toMatch(/cloud is off/)
    const none = make({}, null).e
    const r2 = await none.ask({ feature: 'x', system: 's', prompt: 'p', purpose: 't' })
    expect(!r2.ok && 'error' in r2 && r2.error).toMatch(/no AI to ask/)
  })

  it('keeps its traces on disk', async () => {
    const { e } = make()
    await e.ask({ feature: 'daily', system: 's', prompt: 'p', purpose: 't' })
    await new Promise((r) => setTimeout(r, 1300))
    const file = join(dir, 'traces.json')
    expect(existsSync(file)).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(1)
    const again = new Engine({ config: () => cfg({ localUrl: ai.base }), cloud: () => null, file })
    expect(again.traceLog()[0].feature).toBe('daily')
  })
})
