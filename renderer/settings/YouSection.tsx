import { useState } from 'react'
import type { SettingsState } from '@shared/types'
import { useAction } from './Settings'

const ASK: Record<string, string> = {
  'profile.md': 'Who you are: name, what you do, where, what you are known for, your setup.',
  'preferences.md': 'How you like answers, your tools and stack, what to always and never do.',
  'goals.md': 'What you are chasing this quarter, and the one number for each.',
  'voice.md': 'How you write and talk, so drafts sound like you.',
}

/** Settings → You: the four notes every connected AI reads about you, and the interview that fills them. */
export function YouSection({ s }: { s: SettingsState }) {
  const b = s.brain
  const { run, error } = useAction()
  const [editing, setEditing] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [brief, setBrief] = useState<string | null>(null)
  if (!b.exists) return null
  const filled = b.me.filter((m) => !m.empty).length
  return (
    <section id="you">
      <h2>You</h2>
      <div className="toggle-row">
        <div>
          <div>{filled === 0 ? 'Tell your AI tools who you are' : `${filled} of ${b.me.length} filled in`}</div>
          <div className="hint">
            What every connected AI knows about you, from the brain’s 00-me folder. The fastest way: Claude Code interviews you (about 20 minutes, one question at a time) and saves the four notes when you agree.
          </div>
        </div>
        <button
          onClick={() =>
            run(async () => {
              const e = await window.settings.brain.interview()
              if (e) throw new Error(e)
            })
          }
        >
          Interview me
        </button>
      </div>
      {b.me.map((m) =>
        editing === m.file ? (
          <div key={m.file} className="me-editor">
            <div>{m.title}</div>
            <div className="hint">{ASK[m.file]}</div>
            <textarea aria-label={m.title} value={text} onChange={(e) => setText(e.target.value)} rows={12} spellCheck />
            <div className="row">
              <button
                onClick={() =>
                  run(async () => {
                    const e = await window.settings.brain.meSave(m.file, text)
                    if (e) throw new Error(e)
                    setEditing(null)
                  })
                }
              >
                Save
              </button>
              <button className="secondary" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div key={m.file} className="toggle-row" data-me={m.file}>
            <div>
              <div>{m.title}</div>
              <div className="hint">{m.empty ? `Not filled in yet. ${ASK[m.file]}` : 'Filled in.'}</div>
            </div>
            <button
              className="secondary"
              onClick={() =>
                run(async () => {
                  setText(await window.settings.brain.meGet(m.file))
                  setEditing(m.file)
                })
              }
            >
              Edit
            </button>
          </div>
        ),
      )}
      <div className="toggle-row">
        <div>
          <div>Your brief</div>
          <div className="hint">What Claude Code and the others load at the start of every session, built from the notes above and your projects.</div>
        </div>
        <button className="secondary" onClick={() => run(async () => setBrief(brief === null ? await window.settings.brain.brief() : null))}>
          {brief === null ? 'Show' : 'Hide'}
        </button>
      </div>
      {brief !== null && <pre className="brief">{brief || 'The brief is written once the brain is on.'}</pre>}
      {error && <div className="error">{error}</div>}
    </section>
  )
}
