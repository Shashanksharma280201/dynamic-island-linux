import { useEffect, useState } from 'react'
import type { SettingsState } from '@shared/types'
import { ENGINE_FEATURES, weekText, type CloudMode, type EngineConfig, type JobChoice } from '@shared/engine'
import type { EngineView } from '@shared/os'
import { Segmented, Toggle, useAction } from './Settings'

const sizeText = (p: number | null) => (p ? ` · ${p >= 1 ? `${Math.round(p * 10) / 10}B` : `${Math.round(p * 1000)}M`}` : '')

/**
 * Settings › Model: the model on this computer answers first (Ollama), the
 * cloud only with your yes; which model for every day and for research; and
 * where each job goes.
 */
export function ModelSection({ s }: { s: SettingsState }) {
  const e = s.os.engine
  const { run, error, busy } = useAction()
  const set = (patch: Partial<EngineConfig>) => run(() => window.settings.os<EngineView>('engine.set', patch))
  const [url, setUrl] = useState(e.cfg.localUrl)
  useEffect(() => setUrl(e.cfg.localUrl), [e.cfg.localUrl])
  const models = e.local.models
  const pick = (kind: 'dailyModel' | 'researchModel', label: string, auto: string) => (
    <div className="toggle-row model-pick" data-kind={kind}>
      <div>
        <div>{label}</div>
        <div className="hint">{kind === 'dailyModel' ? 'Summaries, notes and quick answers: a small model is quick.' : 'Research and long answers: the largest you have.'}</div>
      </div>
      <select className="display-select" aria-label={label} value={e.cfg[kind]} disabled={!models.length} onChange={(ev) => void set({ [kind]: ev.target.value })}>
        <option value="">{auto ? `Auto (${auto})` : 'Auto'}</option>
        {models.map((m) => (
          <option key={m.name} value={m.name}>
            {m.name}
            {sizeText(m.params)}
          </option>
        ))}
      </select>
    </div>
  )
  return (
    <section id="model">
      <h2>Model</h2>
      <div className={`toggle-row model-local${e.local.found ? ' found' : ''}`}>
        <div>
          <div>On this computer</div>
          <div className="hint">
            {e.local.found
              ? `Ollama is running with ${models.length} model${models.length === 1 ? '' : 's'}. Answers made here never leave the computer.`
              : e.local.error
                ? `No Ollama at ${e.cfg.localUrl}. Install it from ollama.com, then run “ollama pull llama3.2” and look again.`
                : 'Looking for Ollama…'}
          </div>
        </div>
        <button className="secondary" disabled={busy} onClick={() => run(() => window.settings.os<EngineView>('engine.detect'))}>
          Look again
        </button>
      </div>
      <Toggle label="Use the model on this computer first" hint="Everything starts here when it can; the cloud answers only what this computer can’t, or what you send it." on={e.cfg.localFirst} onChange={(v) => void set({ localFirst: v })} />
      {pick('dailyModel', 'Every day', e.local.daily)}
      {pick('researchModel', 'Research', e.local.research)}
      <div className="toggle-row model-cloud">
        <div>
          <div>The cloud</div>
          <div className="hint">
            {e.cloud ? `${e.cloud}, from Settings › AI. ` : 'There’s no AI in Settings › AI yet. '}
            {e.cfg.cloud === 'ask' ? 'Your questions ask first; background jobs (notes, signals) use it only when this computer can’t.' : e.cfg.cloud === 'always' ? 'Anything this computer can’t answer goes there without asking.' : 'Nothing goes there.'}
          </div>
        </div>
        <Segmented<CloudMode>
          value={e.cfg.cloud}
          options={[
            { value: 'ask', label: 'Ask me' },
            { value: 'always', label: 'Always' },
            { value: 'never', label: 'Never' },
          ]}
          onChange={(v) => void set({ cloud: v })}
        />
      </div>
      <div className="brain-subhead">
        <div>Each job</div>
        <div className="hint">Auto starts on this computer. Pick the cloud for a job that needs it every time.</div>
      </div>
      {ENGINE_FEATURES.map((f) => (
        <div key={f.id} className="row model-job" data-job={f.id}>
          <span>{f.label}</span>
          <select className="display-select" aria-label={`Model for ${f.label}`} value={e.cfg.jobs[f.id] ?? 'auto'} onChange={(ev) => void set({ jobs: { [f.id]: ev.target.value as JobChoice } })}>
            <option value="auto">Auto</option>
            <option value="local">This computer</option>
            <option value="cloud">The cloud</option>
          </select>
        </div>
      ))}
      <Toggle
        label="Learn where questions go"
        hint="When you often ask the cloud again after an answer made here, that kind of question goes to the cloud first. What it learns from stays on this computer."
        on={e.cfg.learn}
        onChange={(v) => void set({ learn: v })}
      />
      {e.cfg.learn && e.learned.length > 0 && <div className="hint model-learned">Now sent to the cloud first: {e.learned.map((l) => l.label).join(', ')}.</div>}
      <div className="toggle-row model-address">
        <div>
          <div>Ollama’s address</div>
          <div className="hint">Another computer on your network works too.</div>
        </div>
        <input
          type="text"
          aria-label="Ollama’s address"
          value={url}
          spellCheck={false}
          onChange={(ev) => setUrl(ev.target.value)}
          onBlur={() => url !== e.cfg.localUrl && void set({ localUrl: url.trim() })}
          onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
        />
      </div>
      <div className="hint model-week">This week: {weekText(e.week)}</div>
      {error && <div className="error">{error}</div>}
    </section>
  )
}
