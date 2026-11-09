import { useEffect, useRef, useState } from 'react'
import type { AgencyAgent, AgencyView } from '@shared/agency'
import type { AgencyDetail, AgentsView as Agents } from '@shared/os'
import type { SkillDetail, SkillMeta, SkillsView } from '@shared/skills'
import { agentName, type AgentSession } from '@shared/sessions'
import { moneyText } from '@shared/engine'

/** An agent's mark: the first letter of its name (its own emoji isn't shown). */
const agentMark = (name: string) => (name.match(/[A-Za-z0-9]/)?.[0] ?? '·').toUpperCase()

const ago = (t: number) => {
  if (!t) return 'not yet'
  const m = Math.round((Date.now() - t) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

function useAgents(): [Agents | null, () => void] {
  const [v, setV] = useState<Agents | null>(null)
  const load = () =>
    window.island
      .os<Agents>('agents.view')
      .then(setV)
      .catch(() => {})
  useEffect(() => {
    void load()
    const off = window.island.onOs((t) => t === 'agents' && void load())
    const t = setInterval(load, 30_000)
    return () => {
      off()
      clearInterval(t)
    }
  }, [])
  return [v, load]
}

/**
 * Agents: what works while you don't. Your coding agents, research over the
 * brain, monitors that tell you once, the roster that tends the brain, the
 * week's usage, and The Agency's specialists.
 */
export function AgentsView({ sessions, onTyping }: { sessions: AgentSession[]; onTyping: (on: boolean) => void }) {
  const [v, reload] = useAgents()
  const [agency, setAgency] = useState(false)
  const [skills, setSkills] = useState(false)
  const [watch, setWatch] = useState('')
  const [ask, setAsk] = useState('')
  const [error, setError] = useState<string | null>(null)
  const run = async (f: () => Promise<unknown>) => {
    setError(null)
    try {
      await f()
    } catch (e) {
      setError(String((e as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
    reload()
  }
  if (agency && v) return <AgencyBrowser view={v.agency} onBack={() => setAgency(false)} onTyping={onTyping} reload={reload} />
  if (skills && v) return <SkillsBrowser view={v.skills} onBack={() => setSkills(false)} onTyping={onTyping} reload={reload} />
  const live = sessions.filter((s) => s.phase === 'working' || s.phase === 'waiting')
  const running = live.length + (v?.monitors.filter((m) => m.state === 'watching').length ?? 0) + (v?.research.filter((j) => !['done', 'failed', 'consent'].includes(j.state)).length ?? 0)
  return (
    <div className="agents">
      <div className="nc-head">
        <div className="nc-title">Agents</div>
        <span className="agents-count">{running} running</span>
      </div>
      {error && <div className="agents-error">{error}</div>}

      {live.length > 0 && (
        <div className="agents-group">
          {live.slice(0, 4).map((s) => (
            <div key={s.id} className={`agent-row session ${s.phase}`}>
              <div className="agent-main">
                <div className="agent-name ellipsis">
                  {agentName(s.agent)} {s.phase === 'waiting' ? 'needs you' : 'working'}
                </div>
                <div className="agent-sub ellipsis">{[s.project, s.prompt].filter(Boolean).join(' · ')}</div>
              </div>
              <span className={`agent-state ${s.phase === 'waiting' ? 'wait' : 'run'}`}>{s.phase === 'waiting' ? 'needs you' : `step ${s.turnSteps}`}</span>
            </div>
          ))}
        </div>
      )}

      <div className="agents-group">
        <div className="agents-kicker">Research</div>
        <form
          className="agents-input"
          onSubmit={(e) => {
            e.preventDefault()
            if (ask.trim()) void run(() => window.island.os('agents.research', ask.trim())).then(() => setAsk(''))
          }}
        >
          <input value={ask} placeholder="Research a question over your brain…" aria-label="Research a question" onChange={(e) => setAsk(e.target.value)} onFocus={() => onTyping(true)} onBlur={() => onTyping(false)} />
        </form>
        {v?.research.slice(0, 3).map((j) => (
          <div key={j.id} className={`agent-row research ${j.state}`}>
            <div className="agent-main">
              <div className="agent-name ellipsis">{j.question}</div>
              <div className="agent-sub ellipsis">{j.state === 'done' ? (j.answer ?? 'Done') : j.line}</div>
              {['reading', 'planning', 'writing'].includes(j.state) && (
                <div className="agent-meter">
                  <i style={{ width: `${j.state === 'planning' ? 8 : j.state === 'writing' ? 92 : Math.round((j.step / Math.max(1, j.steps)) * 80)}%` }} />
                </div>
              )}
            </div>
            {j.state === 'consent' ? (
              <button className="pill primary small" onClick={() => void run(() => window.island.os('agents.research', j.question, true))}>
                Use the cloud
              </button>
            ) : j.state === 'done' || j.state === 'failed' ? (
              <button className="agent-x" aria-label="Forget it" title="Forget it" onClick={() => void run(() => window.island.os('agents.forget', j.id))}>
                ×
              </button>
            ) : (
              <span className="agent-state run">{j.line}</span>
            )}
          </div>
        ))}
      </div>

      <div className="agents-group">
        <div className="agents-kicker">Monitors</div>
        <form
          className="agents-input"
          onSubmit={(e) => {
            e.preventDefault()
            if (watch.trim()) void run(() => window.island.os('agents.monitor', watch.trim())).then(() => setWatch(''))
          }}
        >
          <input value={watch} placeholder="Tell me when PR #43 is reviewed…" aria-label="Tell me when" onChange={(e) => setWatch(e.target.value)} onFocus={() => onTyping(true)} onBlur={() => onTyping(false)} />
        </form>
        {v?.monitors.slice(0, 5).map((m) => (
          <div key={m.id} className={`agent-row monitor ${m.state}`}>
            <div className="agent-main">
              <div className="agent-name ellipsis">{m.text}</div>
              <div className={`agent-sub ellipsis${m.error ? ' warn' : ''}`}>{m.error && m.state === 'watching' ? m.error : m.line}</div>
            </div>
            <span className={`agent-state ${m.state === 'watching' ? 'run' : ''}`}>{m.state === 'watching' ? 'watching' : 'told you'}</span>
            <button className="agent-x" aria-label="Stop watching" title={m.state === 'watching' ? 'Stop watching' : 'Remove'} onClick={() => void run(() => window.island.os('agents.unmonitor', m.id))}>
              ×
            </button>
          </div>
        ))}
      </div>

      {v && v.roster.length > 0 && (
        <div className="agents-group">
          <div className="agents-kicker">Tending the brain</div>
          {v.roster.map((r) => (
            <div key={r.id} className="agent-row roster" data-job={r.id} title={r.what}>
              <div className="agent-main">
                <div className="agent-name">{r.label}</div>
                <div className={`agent-sub ellipsis${r.ok === false ? ' warn' : ''}`}>{r.note || r.what}</div>
              </div>
              {r.ok !== null && <span className="agent-when">{ago(r.lastRun)}</span>}
              <button className="pill small" onClick={() => void run(() => window.island.os('agents.run', r.id))}>
                Run now
              </button>
            </div>
          ))}
        </div>
      )}

      <button className="agents-agency" onClick={() => setAgency(true)}>
        <span className="agents-agency-glyph" aria-hidden="true">
          ✦
        </span>
        <span className="agent-main">
          <span className="agent-name">The Agency</span>
          <span className="agent-sub">{v?.agency.have ? `${v.agency.count} specialist agents to start or install` : 'Specialist agents, downloaded when you want them'}</span>
        </span>
        <span className="agents-chev" aria-hidden="true">
          ›
        </span>
      </button>

      <button className="agents-agency skills" onClick={() => setSkills(true)}>
        <span className="agents-agency-glyph" aria-hidden="true">
          ◆
        </span>
        <span className="agent-main">
          <span className="agent-name">Agent Skills</span>
          <span className="agent-sub">{v?.skills.have ? `${v.skills.count} skills for Claude Code${v.skills.installed.length ? ` · ${v.skills.installed.length} installed` : ''}` : 'Anthropic’s skills for Claude Code, downloaded when you want them'}</span>
        </span>
        <span className="agents-chev" aria-hidden="true">
          ›
        </span>
      </button>

      {v && (
        <div className="agents-week">
          This week: {v.week.local} local · {v.week.cloud} cloud · {moneyText(v.week.cost)}
        </div>
      )}
    </div>
  )
}

/** Agent Skills: search, open one, read its licence, install it into Claude Code (or start it in Claude). */
function SkillsBrowser({ view, onBack, onTyping, reload }: { view: SkillsView; onBack: () => void; onTyping: (on: boolean) => void; reload: () => void }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<SkillMeta[]>([])
  const [open, setOpen] = useState<SkillDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const seq = useRef(0)
  useEffect(() => {
    if (!view.have) return
    const n = ++seq.current
    void window.island.os<SkillMeta[]>('skills.search', q).then((l) => n === seq.current && setList(l))
  }, [q, view.have, view.count])
  const refresh = (name: string) => void window.island.os<SkillDetail | null>('skills.skill', name).then((d) => d && setOpen(d))
  const act = async (f: () => Promise<unknown>, done?: string, name?: string) => {
    setBusy(true)
    setNote(null)
    try {
      await f()
      if (done) setNote(done)
    } catch (e) {
      setNote(String((e as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
    setBusy(false)
    if (name) refresh(name)
    reload()
  }
  const back = (
    <button className="agency-back" onClick={open ? () => (setOpen(null), setNote(null)) : onBack} aria-label="Back">
      ‹ {open ? 'Agent Skills' : 'Agents'}
    </button>
  )
  if (open) {
    return (
      <div className="agents agency skills-view">
        {back}
        <div className="agency-hero">
          <span className="agency-emoji">◆</span>
          <div>
            <div className="agency-name">{open.name}</div>
            <div className="agency-vibe">
              {open.licence} · {open.files} {open.files === 1 ? 'file' : 'files'}
            </div>
          </div>
        </div>
        <div className="agency-desc">{open.description}</div>
        <div className="agency-actions">
          {!open.theirs && (
            <button className="pill primary small" disabled={busy} onClick={() => void act(() => window.island.os('skills.start', open.name), 'Opened in Claude: finish the sentence and send.', open.name)}>
              Use in Claude
            </button>
          )}
          {open.installed ? (
            <button className="pill small" disabled={busy} onClick={() => void act(() => window.island.os('skills.uninstall', open.name), 'Removed from Claude Code.', open.name)}>
              Remove from Claude Code
            </button>
          ) : open.theirs ? (
            <span className="agency-note">You have a skill called {open.name} already; it’s left as it is.</span>
          ) : (
            <button className="pill small" disabled={busy} onClick={() => void act(() => window.island.os('skills.install', open.name), `Installed: Claude Code can use ${open.name} now.`, open.name)}>
              Install for Claude Code
            </button>
          )}
        </div>
        {note && <div className="agency-note">{note}</div>}
        <pre className="agency-body">{open.body}</pre>
        <a className="agency-credit" href={`${view.url}/tree/main/${open.dir}`} target="_blank" rel="noreferrer">
          {open.name}: {open.licence}, from {view.credit}
        </a>
      </div>
    )
  }
  return (
    <div className="agents agency skills-view">
      {back}
      <div className="nc-head">
        <div className="nc-title">Agent Skills</div>
        {view.have && (
          <button className="nc-clear" disabled={!!view.busy} onClick={() => void act(() => window.island.os('skills.get'), 'Up to date.')}>
            {view.busy ? 'Updating…' : 'Update'}
          </button>
        )}
      </div>
      {!view.have ? (
        <div className="agency-get">
          <p>Anthropic’s skills for Claude Code: documents (Word, Excel, PowerPoint, PDF), design, testing web apps, building MCP servers and more. Each one is a folder Claude Code loads when it helps, under its own licence. The island downloads them from GitHub only when you ask.</p>
          <button className="pill primary" disabled={!!view.busy} onClick={() => void act(() => window.island.os('skills.get'))}>
            {view.busy ? 'Downloading…' : 'Get Agent Skills'}
          </button>
          {view.error && <div className="agents-error">{view.error}</div>}
        </div>
      ) : (
        <>
          <input className="agency-search" value={q} placeholder={`Search ${view.count} skills`} aria-label="Search Agent Skills" onChange={(e) => setQ(e.target.value)} onFocus={() => onTyping(true)} onBlur={() => onTyping(false)} />
          <div className="agency-list">
            {list.map((s) => (
              <button key={s.name} className="agency-row" data-skill={s.name} onClick={() => refresh(s.name)}>
                <span className="agency-emoji small">◆</span>
                <span className="agent-main">
                  <span className="agent-name ellipsis">
                    {s.name}
                    {view.installed.includes(s.name) && <span className="agency-tick"> · in Claude Code</span>}
                  </span>
                  <span className="agent-sub ellipsis">{s.description}</span>
                </span>
              </button>
            ))}
            {!list.length && <div className="today-empty">No skills match.</div>}
          </div>
          {view.error && <div className="agents-error">{view.error}</div>}
          <a className="agency-credit" href={view.url} target="_blank" rel="noreferrer">
            {view.credit}
          </a>
        </>
      )}
    </div>
  )
}

/** The Agency: browse by division, search, open one, start it or install it. */
function AgencyBrowser({ view, onBack, onTyping, reload }: { view: AgencyView; onBack: () => void; onTyping: (on: boolean) => void; reload: () => void }) {
  const [q, setQ] = useState('')
  const [division, setDivision] = useState('')
  const [list, setList] = useState<AgencyAgent[]>([])
  const [open, setOpen] = useState<AgencyDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const seq = useRef(0)
  useEffect(() => {
    if (!view.have) return
    const n = ++seq.current
    void window.island.os<AgencyAgent[]>('agency.search', q, division).then((l) => n === seq.current && setList(l))
  }, [q, division, view.have, view.count])
  const act = async (f: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    setNote(null)
    try {
      await f()
      if (done) setNote(done)
    } catch (e) {
      setNote(String((e as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
    setBusy(false)
    reload()
  }
  const back = (
    <button className="agency-back" onClick={open ? () => setOpen(null) : onBack} aria-label="Back">
      ‹ {open ? 'The Agency' : 'Agents'}
    </button>
  )
  if (open) {
    const installed = view.installed.includes(open.slug)
    return (
      <div className="agents agency">
        {back}
        <div className="agency-hero">
          <span className="agency-emoji mark">{agentMark(open.name)}</span>
          <div>
            <div className="agency-name">{open.name}</div>
            {open.vibe && <div className="agency-vibe">{open.vibe}</div>}
          </div>
        </div>
        <div className="agency-desc">{open.description}</div>
        <div className="agency-actions">
          <button className="pill primary small" disabled={busy} onClick={() => void act(() => window.island.os('agency.start', open.id, 'claude'), 'Opened in Claude: finish the sentence and send.')}>
            Start in Claude
          </button>
          <button className="pill small" disabled={busy} onClick={() => void act(() => window.island.os('agency.start', open.id, 'terminal'), 'Opened in a terminal.')}>
            In a terminal
          </button>
          {installed ? (
            <button className="pill small" disabled={busy} onClick={() => void act(() => window.island.os('agency.uninstall', open.slug), 'Removed from Claude Code.')}>
              Remove from Claude Code
            </button>
          ) : (
            <button className="pill small" disabled={busy} onClick={() => void act(() => window.island.os('agency.install', open.id), `Installed: Claude Code can use ${open.slug} now.`)}>
              Install for Claude Code
            </button>
          )}
        </div>
        {note && <div className="agency-note">{note}</div>}
        <pre className="agency-body">{open.body}</pre>
        <a className="agency-credit" href={`${view.url}/blob/main/${open.id}.md`} target="_blank" rel="noreferrer">
          {view.credit}
        </a>
      </div>
    )
  }
  return (
    <div className="agents agency">
      {back}
      <div className="nc-head">
        <div className="nc-title">The Agency</div>
        {view.have && (
          <button className="nc-clear" disabled={!!view.busy} onClick={() => void act(() => window.island.os('agency.get'), 'Up to date.')}>
            {view.busy ? 'Updating…' : 'Update'}
          </button>
        )}
      </div>
      {!view.have ? (
        <div className="agency-get">
          <p>Hundreds of specialist agents (engineering, design, marketing, research, testing and more), each ready to start in Claude or a terminal, or to add to Claude Code. The island downloads the catalog from GitHub only when you ask.</p>
          <button className="pill primary" disabled={!!view.busy} onClick={() => void act(() => window.island.os('agency.get'))}>
            {view.busy ? 'Downloading…' : 'Get The Agency'}
          </button>
          {view.error && <div className="agents-error">{view.error}</div>}
        </div>
      ) : (
        <>
          <input className="agency-search" value={q} placeholder={`Search ${view.count} agents`} aria-label="Search The Agency" onChange={(e) => setQ(e.target.value)} onFocus={() => onTyping(true)} onBlur={() => onTyping(false)} />
          <div className="agency-divisions" role="tablist">
            <button className={!division ? 'on' : ''} onClick={() => setDivision('')}>
              All
            </button>
            {view.divisions.map((d) => (
              <button key={d.id} className={division === d.id ? 'on' : ''} style={{ ['--div' as string]: d.color }} onClick={() => setDivision(division === d.id ? '' : d.id)}>
                {d.label}
              </button>
            ))}
          </div>
          <div className="agency-list">
            {list.map((a) => (
              <button key={a.id} className="agency-row" data-agent={a.id} onClick={() => void window.island.os<AgencyDetail | null>('agency.agent', a.id).then((d) => d && setOpen(d))}>
                <span className="agency-emoji small mark">{agentMark(a.name)}</span>
                <span className="agent-main">
                  <span className="agent-name ellipsis">
                    {a.name}
                    {view.installed.includes(a.slug) && <span className="agency-tick"> · in Claude Code</span>}
                  </span>
                  <span className="agent-sub ellipsis">{a.vibe || a.description}</span>
                </span>
              </button>
            ))}
            {!list.length && <div className="today-empty">No agents match.</div>}
          </div>
          {view.error && <div className="agents-error">{view.error}</div>}
          <a className="agency-credit" href={view.url} target="_blank" rel="noreferrer">
            {view.credit}
          </a>
        </>
      )}
    </div>
  )
}
