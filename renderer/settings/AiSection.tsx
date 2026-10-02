import { useEffect, useState } from 'react'
import type { SettingsState } from '@shared/types'
import { PROVIDERS, providerInfo, type ProviderId } from '@shared/ai'
import { useAction } from './Settings'

/** Settings → AI: which AI the agent uses, your key, and the model. */
export function AiSection({ s }: { s: SettingsState }) {
  const { run, error, busy, setError } = useAction()
  const id = s.ai.provider
  const info = providerInfo(id)
  const mine = s.ai.providers.find((p) => p.id === id)!
  const [key, setKey] = useState('')
  const [model, setModel] = useState(mine.model)
  const [base, setBase] = useState(mine.baseUrl)
  const [models, setModels] = useState<string[] | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  useEffect(() => {
    setKey('')
    setModel(mine.model)
    setBase(mine.baseUrl)
    setModels(null)
    setStatus(null)
    setError(null)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setModel(mine.model), [mine.model])
  useEffect(() => setBase(mine.baseUrl), [mine.baseUrl])

  const load = () =>
    run(async () => {
      setStatus(null)
      const list = await window.settings.aiModels(id)
      setModels(list)
      setStatus(list.length ? `Connected · ${list.length} model${list.length === 1 ? '' : 's'} available` : 'Connected, but no models were listed.')
    })
  const api = info.kind !== 'claude-code'
  return (
    <section id="ai">
      <h2>AI</h2>
      <div className="toggle-row">
        <div>
          <div>Your agent uses</div>
          <div className="hint">{info.note}</div>
        </div>
        <select aria-label="AI provider" value={id} onChange={(e) => run(() => window.settings.setAi({ provider: e.target.value as ProviderId }))}>
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {!api && <div className="hint">Set up Claude Code in the Claude Code section below.</div>}
      {api && info.needsKey && (
        <div className="toggle-row ai-key">
          <div>
            <div>API key {mine.hasKey && <span className="ok-badge">Saved</span>}</div>
            <div className="hint">{info.keyHelp} It’s stored encrypted on this computer and only sent to {info.label}.</div>
          </div>
          <div className="row">
            <input
              type="password"
              aria-label="API key"
              placeholder={mine.hasKey ? '••••••••  (replace)' : 'Paste your key'}
              value={key}
              spellCheck={false}
              onChange={(e) => setKey(e.target.value.trim())}
            />
            <button disabled={!key || busy} onClick={() => run(async () => (await window.settings.setAiKey(id, key), setKey(''), await load()))}>
              Save
            </button>
            {mine.hasKey && (
              <button className="secondary" disabled={busy} onClick={() => run(() => window.settings.setAiKey(id, ''))}>
                Remove
              </button>
            )}
          </div>
        </div>
      )}
      {api && (id === 'ollama' || id === 'custom') && (
        <div className="toggle-row">
          <div>
            <div>Server address</div>
            <div className="hint">{id === 'ollama' ? 'Where Ollama listens (the default is usually right).' : 'The base URL of its OpenAI-compatible API, ending in /v1.'}</div>
          </div>
          <div className="row">
            <input aria-label="Server address" value={base} placeholder="http://localhost:11434/v1" spellCheck={false} onChange={(e) => setBase(e.target.value.trim())} />
            <button disabled={base === mine.baseUrl || busy} onClick={() => run(() => window.settings.setAi({ baseUrl: base }))}>
              Save
            </button>
          </div>
        </div>
      )}
      {api && (
        <div className="toggle-row">
          <div>
            <div>Model</div>
            <div className="hint">{status ?? 'Pick from the list, or type any model name the provider offers.'}</div>
          </div>
          <div className="row">
            <input aria-label="Model" list="ai-models" value={model} spellCheck={false} onChange={(e) => setModel(e.target.value.trim())} />
            <datalist id="ai-models">
              {(models ?? info.models).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <button disabled={model === mine.model || busy} onClick={() => run(() => window.settings.setAi({ model }))}>
              Save
            </button>
            <button className="secondary" disabled={busy || (info.needsKey && !mine.hasKey)} onClick={() => void load()}>
              {busy ? 'Checking…' : 'Load models'}
            </button>
          </div>
        </div>
      )}
      {api && (
        <div className="hint">
          {id === 'ollama'
            ? 'Everything stays on this computer.'
            : `What you ask, and notes you ask it to use, are sent to ${info.label} to answer. Your notes, contacts and files stay on this computer otherwise.`}
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </section>
  )
}
