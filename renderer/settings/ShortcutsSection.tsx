import { useEffect, useState } from 'react'
import type { SettingsState } from '@shared/types'
import { accelFromKeys, DEFAULT_SHORTCUTS, SHORTCUT_INFO, sameAccel, shortcutLabel, type ShortcutId } from '@shared/shortcuts'

const ORDER: ShortcutId[] = ['panel', 'voice', 'dictate', 'allow', 'deny', 'always']

/**
 * The global shortcuts, each with its keys: click, press the new keys, done.
 * A combination another of ours (or another app) already uses is refused,
 * with why; Esc cancels; Reset puts the default back.
 */
export function ShortcutsSection({ s }: { s: SettingsState }) {
  const [recording, setRecording] = useState<ShortcutId | null>(null)
  const [error, setError] = useState<{ id: ShortcutId; text: string } | null>(null)
  const [hint, setHint] = useState('')

  useEffect(() => {
    if (!recording) return
    // Our own shortcuts let go while you record, so pressing one reaches us.
    void window.settings.setRecording(true)
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return setRecording(null)
      if (['Control', 'Alt', 'Shift', 'Meta', 'OS', 'Super'].includes(e.key)) return setHint('…and a key')
      const r = accelFromKeys(e)
      if ('error' in r) return setHint(r.error)
      const id = recording
      setRecording(null)
      void window.settings.setKey(id, r.accel).then((err) => setError(err ? { id, text: err } : null))
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      void window.settings.setRecording(false)
      setHint('')
    }
  }, [recording])

  return (
    <section id="shortcuts">
      <h2>Keyboard shortcuts</h2>
      <p className="hint section-hint">They work from any app. Click one and press the keys you want instead.</p>
      {ORDER.map((id) => {
        const info = SHORTCUT_INFO[id]
        const keys = s.keys[id]
        const custom = !sameAccel(keys, DEFAULT_SHORTCUTS[id], s.mac)
        const off = (id === 'panel' && !s.shortcut) || (id === 'voice' && !s.claude?.voiceShortcut) || (id === 'dictate' && !s.dictation)
        return (
          <div className="toggle-row" key={id}>
            <div>
              <div>{info.label}</div>
              <div className="hint">
                {error?.id === id ? <span className="error-text">{error.text}</span> : recording === id ? hint || 'Press the new keys (Esc to cancel)' : off ? 'Turned off' : info.hint}
              </div>
            </div>
            <div className="key-actions">
              {custom && recording !== id && (
                <button
                  className="link"
                  onClick={() => void window.settings.setKey(id, null).then((err) => setError(err ? { id, text: err } : null))}
                  title={`Back to ${shortcutLabel(DEFAULT_SHORTCUTS[id], s.mac)}`}
                >
                  Reset
                </button>
              )}
              <button
                className={`key-recorder${recording === id ? ' recording' : ''}`}
                data-shortcut={id}
                onClick={() => {
                  setError(null)
                  setRecording(recording === id ? null : id)
                }}
              >
                {recording === id ? 'Press keys…' : shortcutLabel(keys, s.mac)}
              </button>
            </div>
          </div>
        )
      })}
    </section>
  )
}
