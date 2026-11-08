import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import {
  MONITOR_LIMIT,
  findMention,
  fingerprint,
  judgeCi,
  judgePr,
  pageText,
  parseMonitor,
  parsePlan,
  researchPath,
  type Monitor,
  type ResearchJob,
} from '@shared/agents'
import { citedPrompt, pickSources, readCites, type Candidate } from '@shared/memory'
import type { OsAnswer } from '@shared/os'
import { runGh } from './tools'

export type AgentsDeps = {
  file: string
  home: string
  /** Ask the engine (Island OS's model: this computer first). */
  ask: (o: { feature: string; system: string; prompt: string; purpose: string; research?: boolean; interactive?: boolean; consent?: boolean }) => Promise<OsAnswer>
  /** What may answer a research question: notes, activity and messages. */
  candidates: (q: string) => Candidate[]
  /** Write a note into the brain (null when there's no brain). */
  writeNote?: (path: string, text: string, why: string) => boolean
  /** Messages and activity, for "when anyone mentions…". */
  texts: () => { at: number; text: string; from?: string }[]
  /** The repository to use for "PR #43" without one (your most recent). */
  defaultRepo: () => string
  gh?: (args: string[]) => Promise<string>
  fetch?: typeof fetch
  /** Tell you (on the island, and in Notifications). */
  tell: (title: string, line: string) => void
  now?: () => number
  onChange?: () => void
}

type State = { monitors: Monitor[]; research: ResearchJob[] }

/**
 * Island OS's agents: monitors that watch for something and tell you once,
 * and research over your own brain that plans, reads and writes up with
 * sources. Their state is kept on this computer.
 */
export class Agents {
  private s: State = { monitors: [], research: [] }
  private timer: NodeJS.Timeout | null = null
  private checking = false

  constructor(private d: AgentsDeps) {
    try {
      const raw = JSON.parse(readFileSync(d.file, 'utf8'))
      if (Array.isArray(raw.monitors)) this.s.monitors = raw.monitors.filter((m: Monitor) => m && typeof m.id === 'string' && typeof m.kind === 'string')
      // Research that was running when the island quit didn't finish.
      if (Array.isArray(raw.research))
        this.s.research = raw.research
          .filter((j: ResearchJob) => j && typeof j.id === 'string')
          .map((j: ResearchJob) => (['done', 'failed'].includes(j.state) ? j : { ...j, state: 'failed', error: 'The island quit before it finished.' }))
    } catch {
      // first run
    }
  }

  private now(): number {
    return (this.d.now ?? Date.now)()
  }

  start(everyMs = 5 * 60_000): void {
    this.stop()
    this.timer = setInterval(() => void this.checkAll(), everyMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  monitors(): Monitor[] {
    return [...this.s.monitors]
  }

  research(): ResearchJob[] {
    return [...this.s.research]
  }

  // ---------------------------------------------------------- monitors ----

  /** A monitor from your words; an error says what it understands. */
  addMonitor(text: string): Monitor {
    const parsed = parseMonitor(text.slice(0, 300), this.d.defaultRepo())
    if (!parsed)
      throw new Error('Try “tell me when PR #43 is reviewed”, “…when CI on me/app main finishes”, “…when https://example.com changes”, “…when anyone mentions Acme” or “…when ~/Downloads/report.pdf appears”.')
    if (this.s.monitors.filter((m) => m.state === 'watching').length >= MONITOR_LIMIT) throw new Error(`That’s ${MONITOR_LIMIT} monitors; stop one first.`)
    const m: Monitor = { ...parsed, id: randomBytes(4).toString('hex'), created: this.now(), state: 'watching' }
    this.s.monitors = [m, ...this.s.monitors].slice(0, 100)
    this.save()
    void this.check(m.id)
    return m
  }

  removeMonitor(id: string): void {
    this.s.monitors = this.s.monitors.filter((m) => m.id !== id)
    this.save()
  }

  async checkAll(): Promise<void> {
    if (this.checking) return
    this.checking = true
    try {
      for (const m of this.s.monitors.filter((x) => x.state === 'watching')) await this.check(m.id)
    } finally {
      this.checking = false
    }
  }

  async check(id: string): Promise<void> {
    const m = this.s.monitors.find((x) => x.id === id)
    if (!m || m.state !== 'watching') return
    let said: string | null = null
    try {
      said = await this.look(m)
      delete m.error
    } catch (e) {
      m.error = (e as Error).message
    }
    m.last = this.now()
    if (said) {
      m.state = 'done'
      m.said = said
      this.d.tell('Monitor', said)
    }
    this.save()
  }

  private async look(m: Monitor): Promise<string | null> {
    const gh = this.d.gh ?? runGh
    switch (m.kind) {
      case 'pr-review':
      case 'pr-merged': {
        const raw = await gh(['pr', 'view', String(m.ref), '-R', m.target, '--json', 'state,title,mergedAt,reviews'])
        return judgePr(m, JSON.parse(raw))
      }
      case 'ci': {
        const args = ['run', 'list', '-R', m.target, '-L', '5', '--json', 'status,conclusion,displayTitle,headBranch,createdAt,updatedAt']
        if (m.ref) args.push('-b', m.ref)
        return judgeCi(m, JSON.parse(await gh(args)), m.created)
      }
      case 'url': {
        const r = await (this.d.fetch ?? fetch)(m.target, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'dynamic-island-monitor' } })
        if (!r.ok) throw new Error(`${new URL(m.target).host} answered ${r.status}.`)
        const fp = fingerprint(pageText(await r.text()))
        if (!m.seen) {
          m.seen = fp
          return null
        }
        return fp !== m.seen ? `${new URL(m.target).host}${new URL(m.target).pathname === '/' ? '' : new URL(m.target).pathname} changed.` : null
      }
      case 'mention': {
        const hit = findMention(m.target, this.d.texts(), m.created)
        return hit ? `“${m.target}” came up${hit.from ? ` (${hit.from})` : ''}: ${hit.text.slice(0, 120)}` : null
      }
      case 'file': {
        const p = m.target.replace(/^~(?=[\\/])/, this.d.home)
        if (!existsSync(p)) return null
        const st = `${statSync(p).size}:${Math.round(statSync(p).mtimeMs)}`
        if (m.seen === undefined) {
          m.seen = st
          // There already: "appears" is true now.
          return /appears|exists|is there/i.test(m.text) ? `${m.target} is there.` : null
        }
        return st !== m.seen ? `${m.target} changed.` : null
      }
    }
  }

  // ---------------------------------------------------------- research ----

  /** Research over your brain: plan, read, write up, with sources. */
  startResearch(question: string, consent = false): ResearchJob {
    const q = question.trim().slice(0, 400)
    if (!q) throw new Error('Ask a question to research.')
    if (this.s.research.some((j) => !['done', 'failed', 'consent'].includes(j.state))) throw new Error('One research at a time: the last one is still going.')
    const job: ResearchJob = { id: randomBytes(4).toString('hex'), question: q, state: 'planning', step: 0, steps: 0, started: this.now() }
    this.s.research = [job, ...this.s.research.filter((j) => !(j.question === q && j.state === 'consent'))].slice(0, 20)
    this.save()
    void this.runResearch(job, consent)
    return job
  }

  removeResearch(id: string): void {
    this.s.research = this.s.research.filter((j) => j.id !== id)
    this.save()
  }

  private async runResearch(job: ResearchJob, consent: boolean): Promise<void> {
    const update = (p: Partial<ResearchJob>) => {
      Object.assign(job, p)
      this.save()
    }
    const ask = async (system: string, prompt: string, purpose: string) => {
      const r = await this.d.ask({ feature: 'research', system, prompt, purpose, research: true, interactive: true, consent })
      if (!r.ok) {
        if ('needsConsent' in r) throw Object.assign(new Error(`Use ${r.needsConsent}? It goes to the cloud.`), { consent: true })
        throw new Error(r.error)
      }
      update({ where: r.meta.where, cost: (job.cost ?? 0) + (r.meta.cost ?? 0) })
      return r.text
    }
    try {
      // Plan: a few questions that together answer it.
      const plan = parsePlan(
        await ask(
          'You plan research over the user’s own notes and activity. Break their question into at most four short questions, one per line, nothing else.',
          `Question: ${job.question}`,
          'your research question, to plan it',
        ),
        job.question,
      )
      update({ state: 'reading', steps: plan.length, step: 0 })
      const findings: { q: string; text: string; sources: (Candidate & { n: number })[] }[] = []
      for (const [i, q] of plan.entries()) {
        update({ step: i + 1 })
        const sources = pickSources(this.d.candidates(q), q, this.now(), 6)
        if (!sources.length) {
          findings.push({ q, text: 'Nothing in the brain about this.', sources: [] })
          continue
        }
        const p = citedPrompt(q, sources, this.now())
        const r = readCites(await ask(p.system, p.prompt, 'a research question and the notes it found'), sources)
        findings.push({ q, text: r.text, sources: sources.filter((s) => r.cites.some((c) => c.n === s.n)) })
      }
      // Write it up: one numbering for every source.
      update({ state: 'writing' })
      const all: (Candidate & { n: number })[] = []
      const renumber = (f: (typeof findings)[number]) =>
        f.text.replace(/\[(\d{1,2})\]/g, (m, n) => {
          const s = f.sources.find((x) => x.n === Number(n))
          if (!s) return ''
          let k = all.findIndex((x) => (x.path ?? x.url ?? x.title) === (s.path ?? s.url ?? s.title))
          if (k < 0) {
            all.push({ ...s, n: all.length + 1 })
            k = all.length - 1
          }
          return `[${k + 1}]`
        })
      const body = findings.map((f) => `## ${f.q}\n\n${renumber(f)}`).join('\n\n')
      const summary = await ask(
        'You write the short answer at the top of a research note: three sentences at most, keeping the [n] numbers of the findings you use. Plain words.',
        `Question: ${job.question}\n\nFindings:\n${body}`,
        'the findings, to sum them up',
      )
      const sources = all.map((s) => `${s.n}. ${s.path ? `[[${s.path.replace(/\.md$/, '')}]]` : s.url ? `[${s.title}](${s.url})` : s.title} (${s.kind}${s.at ? `, ${new Date(s.at).toISOString().slice(0, 10)}` : ''})`).join('\n')
      const note = `---\ntype: research\nquestion: ${JSON.stringify(job.question)}\ndate: ${new Date(this.now()).toISOString().slice(0, 10)}\n---\n# ${job.question}\n\n${summary.trim()}\n\n${body}\n\n## Sources\n\n${sources || 'None.'}\n`
      const path = researchPath(job.question, this.now())
      const kept = this.d.writeNote?.(path, note, `research: ${job.question}`) ?? false
      update({ state: 'done', answer: summary.trim(), path: kept ? path : undefined })
      this.d.tell('Research', `Done: ${job.question}`)
    } catch (e) {
      if ((e as { consent?: boolean }).consent) update({ state: 'consent', error: (e as Error).message })
      else update({ state: 'failed', error: (e as Error).message || 'It didn’t finish.' })
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.d.file), { recursive: true })
      writeFileSync(`${this.d.file}.tmp`, JSON.stringify(this.s))
      renameSync(`${this.d.file}.tmp`, this.d.file)
    } catch (e) {
      console.error('[island] agents:', e)
    }
    this.d.onChange?.()
  }
}
