import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { newRun, type ClaudeRun, type ClaudeState, type ClaudeTurn } from '@shared/claude'
import type { ProviderInfo } from '@shared/ai'
import { friendlyError, runTurn, type TextTurn } from './providers'
import type { AgentTool } from './tools'

/** What the agent needs to know about the AI it's talking to right now. */
export type AgentTarget = {
  provider: ProviderInfo
  model: string
  apiKey: string
  baseUrl?: string
}

type Deps = {
  dataDir: string
  /** Current provider, model and key, or an error message if not set up. */
  target: () => AgentTarget | string
  tools: () => AgentTool[]
  system: () => string
  onChange: (s: ClaudeState) => void
  onFinished: (run: ClaudeRun) => void
}

const MAX_TURNS = 30
/** Turns sent back as context (older ones are only kept for the panel). */
const CONTEXT_TURNS = 12

/** The conversation as plain text turns for the next request. Pure. */
export function contextFrom(turns: ClaudeTurn[], max = CONTEXT_TURNS): TextTurn[] {
  return turns
    .filter((t) => t.ok && t.reply)
    .slice(-max)
    .map((t) => ({ user: t.prompt, assistant: t.reply }))
}

/**
 * The island's own agent for API providers (Claude API, OpenAI, Gemini,
 * DeepSeek, OpenRouter, Ollama…). Same shape as the Claude Code runner, so
 * the Claude tab, cards and character work the same with either.
 */
export class ApiAgent {
  private run?: ClaudeRun
  private turns: ClaudeTurn[] = []
  private abort?: AbortController
  private pushTimer: ReturnType<typeof setTimeout> | null = null
  private seq = 0

  constructor(private d: Deps) {
    try {
      const saved = JSON.parse(readFileSync(join(d.dataDir, 'agent-conversation.json'), 'utf8'))
      if (Array.isArray(saved.turns)) this.turns = saved.turns.slice(-MAX_TURNS)
    } catch {
      // first run
    }
  }

  private save(): void {
    try {
      mkdirSync(this.d.dataDir, { recursive: true })
      const f = join(this.d.dataDir, 'agent-conversation.json')
      writeFileSync(f + '.tmp', JSON.stringify({ turns: this.turns }))
      renameSync(f + '.tmp', f)
    } catch (e) {
      console.error('[agent] save failed:', e)
    }
  }

  cwd(): string {
    return homedir()
  }

  state(): ClaudeState {
    return { binary: null, cwd: this.cwd(), turns: this.turns, run: this.run, usageBridge: false, approvals: false }
  }

  get busy(): boolean {
    return !!this.abort
  }

  changed(now = false): void {
    if (now) {
      if (this.pushTimer) clearTimeout(this.pushTimer)
      this.pushTimer = null
      this.d.onChange(this.state())
      return
    }
    if (this.pushTimer) return
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null
      this.d.onChange(this.state())
    }, 60)
  }

  newConversation(): void {
    if (this.busy) throw new Error('Still working. Stop it first.')
    this.turns = []
    this.run = undefined
    this.save()
    this.changed(true)
  }

  ask(prompt: string): ClaudeRun {
    const text = prompt.trim().slice(0, 8000)
    if (!text) throw new Error('Say or type what you need.')
    if (this.busy) throw new Error('Still working on the last one.')
    const target = this.d.target()
    if (typeof target === 'string') throw new Error(target)
    const run = newRun(`run-${Date.now()}-${++this.seq}`, text, this.cwd(), Date.now())
    this.run = run
    const abort = new AbortController()
    this.abort = abort
    const update = (patch: Partial<ClaudeRun>) => {
      if (this.run?.id !== run.id || this.run.phase === 'stopped') return
      this.run = { ...this.run, ...patch }
      this.changed()
    }
    let partial = ''
    const kind = target.provider.kind === 'anthropic' ? 'anthropic' : 'openai-compatible'
    runTurn({
      kind,
      model: target.model,
      apiKey: target.apiKey,
      baseUrl: target.baseUrl,
      system: this.d.system(),
      history: contextFrom(this.turns),
      prompt: text,
      tools: this.d.tools(),
      signal: abort.signal,
      events: {
        onMessageStart: () => {
          partial = ''
          update({ phase: 'thinking', tool: undefined })
        },
        onText: (delta) => {
          partial += delta
          update({ phase: 'writing', tool: undefined, reply: partial.trim() })
        },
        onTool: (name, label) => update({ phase: 'tool', tool: { name, detail: label }, steps: (this.run?.steps ?? 0) + 1 }),
        onToolDone: () => update({ phase: 'thinking', tool: undefined }),
      },
    })
      .then((r) => this.finish(run.id, { phase: 'done', reply: r.text || partial.trim() || '(no reply)', steps: r.steps }))
      .catch((e) => {
        const label = `${target.provider.label}`
        this.finish(run.id, abort.signal.aborted ? { phase: 'stopped' } : { phase: 'error', error: friendlyError(e, label, target.baseUrl) })
        if (!abort.signal.aborted) console.error('[agent]', e?.status ?? '', e?.message ?? e)
      })
    this.changed(true)
    return run
  }

  private finish(id: string, patch: Partial<ClaudeRun>): void {
    this.abort = undefined
    let run = this.run
    if (!run || run.id !== id) return
    // A stop wins over whatever the request did afterwards.
    run = run.phase === 'stopped' ? run : { ...run, ...patch }
    run = { ...run, tool: undefined, partial: undefined, finishedAt: run.finishedAt ?? Date.now() }
    this.run = run
    const reply = run.phase === 'done' ? run.reply : run.phase === 'stopped' ? 'Stopped.' : run.error ?? ''
    this.turns = [...this.turns, { prompt: run.prompt, reply, ok: run.phase === 'done', at: run.finishedAt! }].slice(-MAX_TURNS)
    this.save()
    this.changed(true)
    this.d.onFinished(run)
  }

  stop(): void {
    if (!this.abort || !this.run) return
    this.run = { ...this.run, phase: 'stopped', tool: undefined, finishedAt: Date.now() }
    this.abort.abort()
    this.changed(true)
  }

  dispose(): void {
    this.abort?.abort()
  }
}
