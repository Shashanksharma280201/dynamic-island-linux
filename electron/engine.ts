import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { runTurn, friendlyError } from './agent/providers'
import { costOf, learned, parseTags, pickModel, route, weekUsage, type AnswerMeta, type EngineConfig, type LocalModel, type Trace, type Usage, type Where } from '@shared/engine'

/** The AI in Settings › AI, as the engine calls it for the cloud. */
export type Cloud = {
  label: string
  model: string
  ask: (o: { feature: string; system: string; prompt: string; purpose: string }) => Promise<{ text: string; usage: Usage | null }>
}

export type AskOptions = {
  feature: string
  system: string
  prompt: string
  /** For Settings › Privacy: what goes (when it goes to the cloud). */
  purpose: string
  /** Research uses the larger local model. */
  research?: boolean
  /** Asked by you, waiting for the answer: the cloud needs your yes first (when it's set to ask). */
  interactive?: boolean
  /** You pressed Ask cloud (or Use local). */
  prefer?: Where
  /** You said yes to the cloud for this one. */
  consent?: boolean
  /** The engine's own retry in the cloud after the local model failed (not yours). */
  fallback?: boolean
}

export type AskResult = { ok: true; text: string; meta: AnswerMeta } | { ok: false; needsConsent: string } | { ok: false; error: string }

export type LocalStatus = { found: boolean; url: string; models: LocalModel[]; daily: string; research: string; error: string | null; checked: number }

/**
 * The engine: answers with the model on this computer first (Ollama), the
 * cloud only when you say so (or a job you set to use it); every answer
 * keeps where it ran, how long it took and what it cost, on this computer,
 * for the week's usage and to learn where each kind of question goes.
 */
export class Engine {
  private local: LocalStatus
  private traces: Trace[] = []
  private saveTimer: NodeJS.Timeout | null = null

  constructor(
    private d: {
      config: () => EngineConfig
      cloud: () => Cloud | null
      file: string
      onChange?: () => void
      now?: () => number
      fetch?: typeof fetch
    },
  ) {
    this.local = { found: false, url: d.config().localUrl, models: [], daily: '', research: '', error: null, checked: 0 }
    try {
      const raw = JSON.parse(readFileSync(d.file, 'utf8'))
      if (Array.isArray(raw)) this.traces = raw.filter((t) => t && typeof t.at === 'number' && typeof t.feature === 'string' && (t.where === 'local' || t.where === 'cloud')).slice(-2000)
    } catch {
      // first run
    }
  }

  private now(): number {
    return (this.d.now ?? Date.now)()
  }

  /** Is Ollama there, and which models does it have? (Checked again after a minute.) */
  async detect(force = false): Promise<LocalStatus> {
    const cfg = this.d.config()
    if (!force && this.local.checked && this.now() - this.local.checked < 60_000 && this.local.url === cfg.localUrl) return this.local
    const f = this.d.fetch ?? fetch
    let models: LocalModel[] = []
    let error: string | null = null
    try {
      const r = await f(`${cfg.localUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
      if (!r.ok) throw new Error(`answered ${r.status}`)
      models = parseTags(await r.json())
      if (!models.length) error = 'Ollama is running but has no models. Pull one: ollama pull llama3.2'
    } catch (e) {
      error = /fetch failed|ECONNREFUSED|timeout|aborted/i.test(String((e as Error)?.message ?? e)) ? 'Ollama isn’t running here.' : `Ollama: ${(e as Error).message}`
    }
    this.local = { found: models.length > 0, url: cfg.localUrl, models, daily: pickModel(models, 'daily', cfg.dailyModel), research: pickModel(models, 'research', cfg.researchModel), error, checked: this.now() }
    this.d.onChange?.()
    return this.local
  }

  status(): LocalStatus {
    return this.local
  }

  traceLog(): Trace[] {
    return this.traces
  }

  week(): ReturnType<typeof weekUsage> {
    return weekUsage(this.traces, this.now())
  }

  learnedFor(feature: string): Where | null {
    return this.d.config().learn ? learned(this.traces, feature) : null
  }

  /** You sent the last local answer of this kind on to the cloud: remember it (for learning). */
  escalated(feature: string): void {
    for (let i = this.traces.length - 1; i >= 0; i--)
      if (this.traces[i].feature === feature && this.traces[i].where === 'local') {
        this.traces[i] = { ...this.traces[i], escalated: true }
        break
      }
    this.saveSoon()
  }

  /** Who answers now, in words ("Ollama (llama3.2) first, then Claude"). */
  label(): string {
    const cloud = this.d.config().cloud === 'never' ? null : this.d.cloud()
    const local = this.local.found && this.d.config().localFirst ? `Ollama (${this.local.daily})` : null
    if (local && cloud) return `${local} first, then ${cloud.label}`
    return local ?? cloud?.label ?? 'no AI'
  }

  /** Can anything answer at all? */
  available(): boolean {
    return (this.local.found && this.d.config().localFirst) || (this.d.config().cloud !== 'never' && !!this.d.cloud())
  }

  async ask(o: AskOptions): Promise<AskResult> {
    const cfg = this.d.config()
    await this.detect()
    const local = this.local.found
    const where = route({ feature: o.feature, cfg, local, prefer: o.prefer, learned: o.prefer ? null : this.learnedFor(o.feature) })
    const cloud = this.d.cloud()
    if (!where || (where === 'cloud' && !cloud)) {
      return { ok: false, error: local ? 'The cloud is off for this (Settings › Model).' : cloud ? 'The cloud is off (Settings › Model), and there’s no model on this computer: install Ollama and pull one.' : 'There’s no AI to ask: install Ollama for one on this computer, or pick one in Settings › AI.' }
    }
    if (where === 'cloud' && o.interactive && cfg.cloud === 'ask' && !o.consent) return { ok: false, needsConsent: cloud!.label }
    // You asked the cloud after an answer made here: that's what learning counts.
    if (o.prefer === 'cloud' && o.interactive && !o.fallback) this.escalated(o.feature)
    const started = this.now()
    try {
      let text: string
      let usage: Usage | null
      let model: string
      let label: string
      if (where === 'local') {
        model = o.research ? this.local.research : this.local.daily
        label = `Ollama (${model})`
        const r = await runTurn({
          kind: 'openai-compatible',
          model,
          apiKey: '',
          baseUrl: `${cfg.localUrl}/v1`,
          system: o.system,
          history: [],
          prompt: o.prompt,
          tools: [],
          feature: o.feature,
          purpose: o.purpose,
          signal: AbortSignal.timeout(o.research ? 600_000 : 180_000),
          events: { onMessageStart() {}, onText() {}, onTool() {}, onToolDone() {} },
        })
        text = r.text
        usage = r.usage ?? null
      } else {
        model = cloud!.model
        label = cloud!.label
        const r = await cloud!.ask({ feature: o.feature, system: o.system, prompt: o.prompt, purpose: o.purpose })
        text = r.text
        usage = r.usage
      }
      const meta: AnswerMeta = { where, label, model, ms: this.now() - started, usage, cost: costOf(model, usage, where) }
      this.trace({ at: this.now(), feature: o.feature, where, model, ms: meta.ms, cost: meta.cost })
      return { ok: true, text: text.trim(), meta }
    } catch (e) {
      // A background job whose local model failed goes to the cloud (as it did before there was one), unless that's off.
      if (where === 'local' && !o.interactive && !o.prefer && cfg.cloud !== 'never' && cloud) return this.ask({ ...o, prefer: 'cloud', fallback: true })
      return { ok: false, error: friendlyError(e, where === 'local' ? 'Ollama' : (cloud?.label ?? 'The cloud'), where === 'local' ? cfg.localUrl : undefined) }
    }
  }

  private trace(t: Trace): void {
    this.traces = [...this.traces, t].slice(-2000)
    this.saveSoon()
    this.d.onChange?.()
  }

  private saveSoon(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      try {
        mkdirSync(dirname(this.d.file), { recursive: true })
        writeFileSync(`${this.d.file}.tmp`, JSON.stringify(this.traces))
        renameSync(`${this.d.file}.tmp`, this.d.file)
      } catch (e) {
        console.error('[island] engine traces:', e)
      }
    }, 1000)
    this.saveTimer.unref?.()
  }
}
