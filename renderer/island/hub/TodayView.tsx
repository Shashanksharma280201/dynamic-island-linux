import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { MorningCard } from '@shared/loop'
import type { OsAnswer, OsCite, TodayView as Today } from '@shared/os'
import type { TimelineEntry } from '@shared/memory'
import { AnswerChip, CloudConsent } from '../AnswerChip'

const hm = (t: number) => {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const ICON: Record<string, ReactNode> = {
  github: <path d="M8 6.5a2 2 0 1 0 0 .01M8 8.5v7M16 17.5a2 2 0 1 0 0 .01M16 15.5V12a3 3 0 0 0-3-3h-2" />,
  git: <path d="M8 6.5a2 2 0 1 0 0 .01M8 8.5v7M16 17.5a2 2 0 1 0 0 .01M16 15.5V12a3 3 0 0 0-3-3h-2" />,
  shell: <path d="M5 7l5 5-5 5M12 17h7" />,
  calendar: <path d="M5 7h14v12H5zM5 11h14M9 4v3M15 4v3" />,
  screen: <path d="M4 6h16v10H4zM9 20h6M12 16v4" />,
  codex: <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />,
  gemini: <path d="M12 4c.8 4.2 3.8 7.2 8 8-4.2.8-7.2 3.8-8 8-.8-4.2-3.8-7.2-8-8 4.2-.8 7.2-3.8 8-8z" />,
  whatsapp: <path d="M5 19l1.3-3.6A7 7 0 1 1 9 18.2z" />,
  mail: <path d="M4 7h16v10H4zM4 7l8 6 8-6" />,
  note: <path d="M7 4h7l4 4v12H7zM14 4v4h4M9.5 13h6M9.5 16h4" />,
}

function Glyph({ source }: { source: string }) {
  return (
    <svg className="today-glyph" viewBox="0 0 24 24" aria-hidden="true">
      {ICON[source] ?? ICON.note}
    </svg>
  )
}

/** "[1]" in an answer, as a small chip you can hover for its source. */
function withCites(text: string, cites: OsCite[]): ReactNode[] {
  const by = new Map(cites.map((c) => [c.n, c]))
  return text.split(/(\[\d{1,2}\])/g).map((part, i) => {
    const m = /^\[(\d{1,2})\]$/.exec(part)
    const c = m ? by.get(Number(m[1])) : undefined
    return c ? (
      <span key={i} className="cite" title={c.title}>
        {c.n}
      </span>
    ) : (
      part
    )
  })
}

/** Today: the one thing, the day by hour from every source, what's next, and "what did I do?" with sources. */
export function TodayView({ onTyping }: { onTyping: (on: boolean) => void }) {
  const [v, setV] = useState<Today | null>(null)
  const [card, setCard] = useState<MorningCard | null>(null)
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState('')
  const [answer, setAnswer] = useState<OsAnswer | null>(null)
  const [busy, setBusy] = useState(false)
  const [all, setAll] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const load = () =>
    window.island
      .os<Today>('today.view')
      .then(setV)
      .catch(() => {})
  useEffect(() => {
    void load()
    void window.island.morning
      ?.get()
      .then(setCard)
      .catch(() => {})
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])
  const ask = async (o: { prefer?: 'local' | 'cloud'; consent?: boolean } = {}, question = asked) => {
    if (!question.trim()) return
    setAsked(question)
    setBusy(true)
    const a = await window.island.os<OsAnswer>('today.ask', question, o).catch((e: Error): OsAnswer => ({ ok: false, error: e.message }))
    setAnswer(a)
    setBusy(false)
  }
  const hours = v?.timeline ?? []
  const shown = all ? hours : hours.slice(-4)
  const one = card && card.state !== 'done' ? card : null
  return (
    <div className="today">
      <div className="nc-head today-head">
        <div className="nc-title">Today</div>
        {v && <span className={`today-where${v.local ? ' local' : ''}`}>{v.local ? 'local' : 'cloud asks first'}</span>}
      </div>
      {one && (
        <div className="today-one">
          <div className="today-kicker">The one thing</div>
          <div className="today-one-text">{one.one}</div>
          <div className="today-one-actions">
            {one.draft && one.to && (
              <button className="pill primary small" onClick={() => void window.island.morning.act('send').then(() => setCard(null))}>
                Send draft
              </button>
            )}
            {one.draft && (
              <button className="pill small" onClick={() => void window.island.morning.act('edit')}>
                Edit
              </button>
            )}
            <button className="pill small" onClick={() => void window.island.morning.act('hold').then(() => setCard(null))}>
              Later
            </button>
          </div>
        </div>
      )}
      <form
        className="today-ask"
        onSubmit={(e) => {
          e.preventDefault()
          void ask({}, q)
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4.5-4.5" />
        </svg>
        <input ref={input} value={q} placeholder="What did I do last week?" aria-label="Ask about your days" onChange={(e) => setQ(e.target.value)} onFocus={() => onTyping(true)} onBlur={() => onTyping(false)} />
        {busy && <span className="today-busy" aria-label="Thinking" />}
      </form>
      {answer && !busy && (
        <div className={`today-answer${!answer.ok && 'error' in answer ? ' error' : ''}`} role="status">
          {answer.ok ? (
            <>
              <div className="today-answer-text">{withCites(answer.text, answer.cites ?? [])}</div>
              {!!answer.cites?.length && (
                <ol className="today-cites">
                  {answer.cites.map((c) => (
                    <li key={c.n} value={c.n}>
                      <span className="cite">{c.n}</span>
                      <span className="ellipsis">{c.title}</span>
                      <span className="today-cite-kind">{c.kind}</span>
                    </li>
                  ))}
                </ol>
              )}
              {answer.meta.model && <AnswerChip meta={answer.meta} onCloud={() => void ask({ prefer: 'cloud', consent: true })} />}
            </>
          ) : 'needsConsent' in answer ? (
            <CloudConsent label={answer.needsConsent} onYes={() => void ask({ consent: true })} onNo={() => setAnswer(null)} />
          ) : (
            answer.error
          )}
        </div>
      )}
      {v && !v.any && !hours.length && <div className="today-empty">Turn on sources in Settings › Sources (or the second brain) and your day fills in here.</div>}
      {v && v.any && !hours.length && <div className="today-empty">Nothing yet today.</div>}
      {hours.length > 0 && (
        <ol className="today-timeline">
          {!all && hours.length > 4 && (
            <li className="today-more">
              <button className="plain" onClick={() => setAll(true)}>
                Earlier today ({hours.length - 4} more hours)
              </button>
            </li>
          )}
          {shown.flatMap((h) =>
            h.entries.slice(0, 6).map((e: TimelineEntry, i) => (
              <li key={`${h.hour}-${i}`} className={`today-entry ${e.source}`} title={e.detail}>
                <time>{hm(e.at)}</time>
                <Glyph source={e.source} />
                <span className="ellipsis">
                  {e.title}
                  {e.project && <em> · {e.project}</em>}
                </span>
              </li>
            )),
          )}
        </ol>
      )}
      {!!v?.upcoming.length && (
        <div className="today-next">
          <div className="today-kicker">Next</div>
          {v.upcoming.slice(0, 3).map((e) => (
            <div key={`${e.start}-${e.title}`} className="today-next-row">
              <time>{e.allDay ? 'All day' : hm(e.start)}</time>
              <span className="ellipsis">
                {e.title}
                {e.where && <em> · {e.where}</em>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
