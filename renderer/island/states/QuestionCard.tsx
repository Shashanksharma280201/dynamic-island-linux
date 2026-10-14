import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { ToolRequest } from '@shared/types'
import { parseQuestions, questionAnswer, type Question } from '@shared/questions'
import { Badge } from './Badge'
import { sound } from '../../sound'

/**
 * Claude asking you something (AskUserQuestion), answered on the island: one
 * question at a time, its options as buttons (several for multi-select), or
 * your own words under "Other". Nothing is sent until the last one.
 */
export function QuestionCard({ request, queued, project }: { request: ToolRequest; queued: number; project?: string }) {
  const questions = parseQuestions(request.toolInput) ?? []
  const [at, setAt] = useState(0)
  const [picked, setPicked] = useState<string[][]>(() => questions.map(() => []))
  const [other, setOther] = useState<string[]>(() => questions.map(() => ''))
  const [typing, setTyping] = useState(false)
  const q: Question | undefined = questions[at]
  const last = at === questions.length - 1
  const answer = (i: number) => questionAnswer(questions[i], picked[i], other[i])
  const ready = questions.every((_q, i) => !!answer(i))

  const send = (e: MouseEvent) => {
    e.stopPropagation()
    if (!ready) return
    sound('ok')
    window.island.sendDecision({ id: request.id, decision: 'allow', answers: Object.fromEntries(questions.map((qq, i) => [qq.question, answer(i)!])) })
  }
  const pick = (e: MouseEvent, label: string) => {
    e.stopPropagation()
    setTyping(false)
    setOther((o) => o.map((v, i) => (i === at ? '' : v)))
    setPicked((p) =>
      p.map((sel, i) => {
        if (i !== at) return sel
        if (!q?.multiSelect) return [label]
        return sel.includes(label) ? sel.filter((l) => l !== label) : [...sel, label]
      }),
    )
    // One choice made: on to the next question.
    if (!q?.multiSelect && !last) setTimeout(() => setAt((a) => Math.min(a + 1, questions.length - 1)), 160)
  }

  if (!q) return null
  return (
    <div className="card approval question-card" data-tool="AskUserQuestion">
      <div className="card-head">
        <span className="claude-mark" aria-hidden>
          ✳
        </span>
        <span className="app-name ellipsis">Claude asks{project ? ` · ${project}` : ''}</span>
        <span className="spacer" />
        {questions.length > 1 && (
          <span className="q-count" aria-label={`Question ${at + 1} of ${questions.length}`}>
            {at + 1} of {questions.length}
          </span>
        )}
        <Badge count={queued} />
      </div>
      {q.header && <div className="q-header">{q.header}</div>}
      <div className="headline q-text">{q.question}</div>
      <div className={`q-options${q.multiSelect ? ' multi' : ''}`} role={q.multiSelect ? 'group' : 'radiogroup'}>
        {q.options.map((o, n) => {
          const on = picked[at].includes(o.label)
          return (
            <button
              key={o.label}
              className={`q-option${on ? ' on' : ''}`}
              role={q.multiSelect ? 'checkbox' : 'radio'}
              aria-checked={on}
              onClick={(e) => pick(e, o.label)}
            >
              <span className="q-mark" aria-hidden>
                {q.multiSelect ? (on ? '✓' : '') : n + 1}
              </span>
              <span className="q-label">
                <span className="ellipsis">{o.label}</span>
                {o.description && <span className="q-desc">{o.description}</span>}
              </span>
            </button>
          )
        })}
        {typing ? (
          <OtherField
            value={other[at]}
            onChange={(v) => {
              setOther((o) => o.map((x, i) => (i === at ? v : x)))
              if (v && !q.multiSelect) setPicked((p) => p.map((sel, i) => (i === at ? [] : sel)))
            }}
            onDone={() => (last ? undefined : setAt(at + 1))}
          />
        ) : (
          <button className="q-option q-other" onClick={(e) => (e.stopPropagation(), setTyping(true))}>
            <span className="q-mark" aria-hidden>
              …
            </span>
            <span className="q-label">{other[at] ? other[at] : 'Something else'}</span>
          </button>
        )}
      </div>
      <div className="actions">
        <button
          className="plain muted"
          title="Dismiss here and answer in Claude's terminal"
          onClick={(e) => (e.stopPropagation(), window.island.sendDecision({ id: request.id, decision: 'ask' }))}
        >
          Answer in terminal
        </button>
        <span className="spacer" />
        {at > 0 && (
          <button className="pill" onClick={(e) => (e.stopPropagation(), setTyping(false), setAt(at - 1))}>
            Back
          </button>
        )}
        {last ? (
          <button className="pill primary allow" disabled={!ready} onClick={send}>
            Send
          </button>
        ) : (
          <button className="pill primary" disabled={!answer(at)} onClick={(e) => (e.stopPropagation(), setTyping(false), setAt(at + 1))}>
            Next
          </button>
        )}
      </div>
    </div>
  )
}

/** Your own answer: takes the keyboard while it's open. */
function OtherField({ value, onChange, onDone }: { value: string; onChange: (v: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    window.island.setFocus(true)
    const t = setTimeout(() => ref.current?.focus(), 50)
    ref.current?.focus()
    return () => {
      clearTimeout(t)
      window.island.setFocus(false)
    }
  }, [])
  return (
    <input
      ref={ref}
      className="q-input"
      placeholder="Type your answer"
      value={value}
      maxLength={2000}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={() => window.island.setFocus(true)}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone()
      }}
    />
  )
}
