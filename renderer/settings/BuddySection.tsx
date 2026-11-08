import { useEffect, useState } from 'react'
import type { SettingsState } from '@shared/types'
import { VOICES, type BuddyConfig } from '@shared/buddy'
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
        label="Keep a note of each question in your brain"
        hint="What you asked and what it said, in the brain’s inbox (Settings › Second brain), so the next answer knows."
        on={c.save}
        onChange={(v) => set({ save: v })}
      />
      <div className="row">
        <button className="secondary" disabled={busy} onClick={() => run(() => window.settings.buddy.tryVoice())}>
          Hear it
        </button>
      </div>
      {error && <div className="error">{error}</div>}
    </section>
  )
}
