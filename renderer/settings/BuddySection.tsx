import { useEffect, useState } from 'react'
import type { SettingsState } from '@shared/types'
import { VOICES, type BuddyConfig } from '@shared/buddy'
import { ROUTINE_EXAMPLES, type Routine } from '@shared/jarvis'
import { shortcutLabel } from '@shared/shortcuts'
import { Segmented, Toggle, useAction } from './Settings'

/** Settings › Buddy: ask about your screen, out loud, and it points. */
export function BuddySection({ s }: { s: SettingsState }) {
  const b = s.buddy
  const c = b.config
  const { run, error, busy } = useAction()
  const set = (patch: Partial<BuddyConfig>) => run(() => window.settings.buddy.set(patch))
  const [words, setWords] = useState(c.private.join(', '))
  useEffect(() => setWords(c.private.join(', ')), [c.private.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  const key = shortcutLabel(b.key, navigator.platform.startsWith('Mac'))
  const n = b.natural
  return (
    <section id="buddy">
      <h2>Buddy</h2>
      <Toggle
        label={`Ask ${b.name} about your screen`}
        hint={`Press ${key} and ask, out loud: “where do I change the wallpaper?”, “what does this error mean?”, “walk me through setting up a printer”. ${b.name} answers out loud, with captions on the island, and points at the spot. Press ${key} again to stop it talking. Change the key in Keyboard shortcuts; the name and look in Character.`}
        on={c.on}
        onChange={(v) => set({ on: v })}
      />
      <Toggle
        label="Let it see the screen"
        hint="A screenshot goes with each question to the AI you picked in Settings › AI (Claude points most accurately). It’s taken when you ask, never recorded, and private windows are blacked out first."
        on={c.look}
        onChange={(v) => set({ look: v })}
      />
      <div className="toggle-row">
        <div>
          <div>Private windows</div>
          <div className="hint">Windows whose title has any of these words are blacked out before a screenshot leaves this computer.</div>
          <input
            className="buddy-words"
            value={words}
            onChange={(e) => setWords(e.target.value)}
            onBlur={() =>
              set({
                private: words
                  .split(',')
                  .map((w) => w.trim())
                  .filter(Boolean),
              })
            }
            aria-label="Private window words"
          />
        </div>
      </div>
      <div className="toggle-row">
        <div>
          <div>Voice</div>
          <div className="hint">
            {c.voice === 'natural'
              ? n.ready
                ? 'Kokoro, a natural voice that runs on this computer.'
                : !b.espeak
                  ? 'The natural voice needs espeak-ng: sudo apt install espeak-ng. The system voice speaks meanwhile.'
                  : n.downloading
                    ? `Downloading the natural voice (${Math.round(n.progress * 100)}% of ${n.sizeMb} MB); the system voice speaks meanwhile.`
                    : `Kokoro, a natural voice that runs on this computer, once downloaded (${n.sizeMb} MB, from Hugging Face).`
              : c.voice === 'system'
                ? b.systemVoice
                  ? `Your system’s voice (${b.systemVoice}).`
                  : 'No system voice found: install speech-dispatcher or espeak-ng.'
                : 'Captions only, on the island.'}
          </div>
          {c.voice === 'natural' && n.error && <div className="warn">{n.error}</div>}
        </div>
        <Segmented
          value={c.voice}
          options={[
            { value: 'natural', label: 'Natural' },
            { value: 'system', label: 'System' },
            { value: 'off', label: 'Off' },
          ]}
          onChange={(v) => set({ voice: v })}
        />
      </div>
      {c.voice === 'natural' && (
        <div className="row">
          <select value={c.voiceId} onChange={(e) => set({ voiceId: e.target.value })} aria-label="Natural voice">
            {VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.accent})
              </option>
            ))}
          </select>
          {!n.ready && b.espeak && (
            <button className="secondary" disabled={n.downloading || busy} onClick={() => run(async () => {
              const e = await window.settings.buddy.getVoice()
              if (e) throw new Error(e)
            })}>
              {n.downloading ? 'Downloading…' : 'Download now'}
            </button>
          )}
        </div>
      )}
      <div className="toggle-row">
        <div>
          <div>Speed</div>
          <div className="hint">How fast it talks.</div>
        </div>
        <input type="range" min={0.7} max={1.4} step={0.05} value={c.speed} onChange={(e) => set({ speed: Number(e.target.value) })} aria-label="Speed" />
      </div>
      <div className="toggle-row">
        <div>
          <div>How it talks</div>
          <div className="hint">Its answers are always short: they’re spoken.</div>
        </div>
        <Segmented
          value={c.tone}
          options={[
            { value: 'friendly', label: 'Friendly' },
            { value: 'brief', label: 'Brief' },
            { value: 'playful', label: 'Playful' },
          ]}
          onChange={(v) => set({ tone: v })}
        />
      </div>
      <Toggle
        label="Talk over it"
        hint="Start talking while it speaks and it stops to listen. The microphone takes out its own voice; headphones help with the system voice."
        on={c.interrupt}
        onChange={(v) => set({ interrupt: v })}
      />
      <Toggle
        label="Say the morning brief out loud"
        hint="The one thing for today and what’s on your calendar, once a morning, when you’re first at the computer (never in quiet hours). Today › Say it plays it any time."
        on={c.speakMorning}
        onChange={(v) => set({ speakMorning: v })}
      />
      <Toggle
        label="Keep a note of each question in your brain"
        hint="What you asked and what it said, in the brain’s inbox (Settings › Second brain), so the next answer knows."
        on={c.save}
        onChange={(v) => set({ save: v })}
      />
      <Toggle
        label={`Listen for “hey ${b.name}”`}
        hint={`Say “hey ${b.name}” and ask, without the key. Your speech is turned into text on this computer and nothing leaves it until it hears its name; it listens only while it’s idle. Off by default: it keeps the microphone open and uses some CPU.`}
        on={c.wake}
        onChange={(v) => set({ wake: v })}
      />
      <Toggle
        label="Say what’s urgent out loud"
        hint={`A Claude Code session waiting on you, a permission prompt (say yes or no), or work it handed off that finished. ${c.quietFrom === c.quietTo ? 'At any hour' : `Never between ${hhmm(c.quietFrom, 0)} and ${hhmm(c.quietTo, 0)}`}, never the same thing twice in three days, a few an hour at most.`}
        on={c.alerts}
        onChange={(v) => set({ alerts: v })}
      />
      <div className="toggle-row buddy-quiet">
        <div>
          <div>Quiet hours</div>
          <div className="hint">Nothing is said out loud between these hours; it’s shown on the island and kept for the evening digest. The same hour twice means none.</div>
        </div>
        <span className="buddy-hours">
          <HourSelect value={c.quietFrom} label="Quiet from" onChange={(h) => set({ quietFrom: h })} />
          <span>to</span>
          <HourSelect value={c.quietTo} label="Quiet until" onChange={(h) => set({ quietTo: h })} />
        </span>
      </div>
      <div className="toggle-row buddy-digest">
        <div>
          <div>An evening digest</div>
          <div className="hint">Once a day on the island: what wasn’t said out loud (quiet hours, not urgent, the brain’s jobs, your routines) and the notifications you didn’t get to. Shown only when there’s something to tell; if the computer was asleep, as soon as it wakes.</div>
        </div>
        <span className="buddy-hours">
          <HourSelect value={c.digestAt} label="Digest at" disabled={!c.digest} onChange={(h) => set({ digestAt: h })} />
          <input className="switch" type="checkbox" checked={c.digest} aria-label="An evening digest" onChange={(e) => set({ digest: e.target.checked })} />
        </span>
      </div>
      <div className="row">
        <button className="secondary" disabled={busy} onClick={() => run(() => window.settings.buddy.tryVoice())}>
          Hear it
        </button>
      </div>
      <RoutinesBlock routines={b.routines} run={run} />
      {error && <div className="error">{error}</div>}
    </section>
  )
}

/** An hour of the day, as 18:00. */
function HourSelect({ value, label, disabled, onChange }: { value: number; label: string; disabled?: boolean; onChange: (h: number) => void }) {
  return (
    <select value={value} aria-label={label} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {hhmm(h, 0)}
        </option>
      ))}
    </select>
  )
}

const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
const hhmm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

/** Routines: standing orders the assistant runs at their time; anything that sends or changes still asks. */
function RoutinesBlock({ routines, run }: { routines: Routine[]; run: <T>(f: () => Promise<T>) => Promise<T | undefined> }) {
  const [name, setName] = useState('')
  const [time, setTime] = useState('18:30')
  const [day, setDay] = useState('')
  const [ask, setAsk] = useState('')
  const add = (r: unknown) =>
    run(async () => {
      const e = await window.settings.buddy.setRoutine(r)
      if (e) throw new Error(e)
    })
  return (
    <div className="routines">
      <div>Routines</div>
      <div className="hint">Standing orders: at their time (or as soon as the computer wakes) the assistant does what you wrote. Anything that sends or changes something still asks you first.</div>
      {routines.map((r) => (
        <div key={r.id} className="routine">
          <input type="checkbox" className="switch small" checked={r.on} aria-label={`${r.name} on`} onChange={(e) => add({ ...r, on: e.target.checked })} />
          <div className="routine-main">
            <div>
              {r.name} <span className="hint">· {r.when.weekday !== undefined ? `${DAYS[r.when.weekday]} ` : 'Every day '}at {hhmm(r.when.hour, r.when.minute)}</span>
            </div>
            <div className="hint routine-ask">{r.ask}</div>
          </div>
          <button className="link" onClick={() => run(() => window.settings.buddy.removeRoutine(r.id))}>
            Remove
          </button>
        </div>
      ))}
      {routines.length === 0 && (
        <div className="row">
          {ROUTINE_EXAMPLES.map((x) => (
            <button key={x.name} className="secondary" onClick={() => add({ ...x, on: true })}>
              Add “{x.name}”
            </button>
          ))}
        </div>
      )}
      <div className="routine-new">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Routine name" />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
        <select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Days">
          <option value="">Every day</option>
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
        <input className="grow" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="What to do: “Wrap up my day in three lines…”" aria-label="What the routine asks" />
        <button
          disabled={!name.trim() || !ask.trim()}
          onClick={async () => {
            const [h, m] = time.split(':').map(Number)
            await add({ name, ask, on: true, when: { hour: h, minute: m, ...(day === '' ? {} : { weekday: Number(day) }) } })
            setName('')
            setAsk('')
          }}
        >
          Add
        </button>
      </div>
    </div>
  )
}
