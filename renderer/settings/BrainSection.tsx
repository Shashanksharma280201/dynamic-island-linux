import { useState } from 'react'
import type { SettingsState } from '@shared/types'
import type { InboxItem, ToolLink } from '@shared/brain'
import { Segmented, Toggle, useAction } from './Settings'

const TYPE_LABEL: Record<string, string> = { project: 'Project', session: 'Session', person: 'Person', decision: 'Decision', preference: 'Preference', fact: 'Fact', idea: 'Idea' }

/** Settings → Brain: the folder every AI shares, what it captures, and the tools it's connected to. */
export function BrainSection({ s }: { s: SettingsState }) {
  const b = s.brain
  const { run, error, busy } = useAction()
  const [folder, setFolder] = useState<string | null>(null)
  const [mined, setMined] = useState<string | null>(null)

  if (!b.exists)
    return (
      <section id="brain">
        <h2>Second brain</h2>
        <div className="brain-intro">
          <div className="brain-title">One memory for you and every AI you use</div>
          <div className="hint">
            A folder of plain notes on this computer, in the Living Brain layout: who you are, your projects, people, decisions and every Claude Code session, five lines each. Claude Code in any terminal, the island’s
            assistant, Codex and Gemini CLI read it to know you, and add what they learn. Nothing leaves this computer unless an AI you use reads it. Open it in Obsidian any time.
          </div>
        </div>
        <div className="toggle-row">
          <div>
            <div>Folder</div>
            <div className="hint">{folder ?? b.vaultLabel}</div>
          </div>
          <button className="secondary" onClick={() => run(async () => setFolder((await window.settings.brain.pickFolder()) ?? folder))}>
            Choose…
          </button>
        </div>
        <div className="row">
          <button disabled={busy} onClick={() => run(async () => { const e = await window.settings.brain.create(folder ?? undefined); if (e) throw new Error(e) })}>
            Make my brain
          </button>
          <span className="hint">Makes the folders, the rules every AI follows and four notes about you to fill in. An existing Obsidian vault works too: its notes are kept.</span>
        </div>
        {error && <div className="error">{error}</div>}
      </section>
    )

  return (
    <section id="brain">
      <h2>Second brain</h2>
      <Toggle
        label="Keep my second brain"
        hint={`${b.vaultLabel} · ${b.notes} note${b.notes === 1 ? '' : 's'}${b.on ? '' : ' · paused: nothing is filed and the tools are off'}`}
        on={b.on}
        onChange={(v) => run(() => window.settings.brain.setOn(v))}
      />
      <div className="row">
        {b.obsidian && (
          <button className="secondary" onClick={() => run(() => window.settings.brain.open(''))}>
            Open in Obsidian
          </button>
        )}
        <button className="secondary" onClick={() => run(() => window.settings.brain.openFolder())}>
          Open folder
        </button>
        {!b.obsidian && <span className="hint">Tip: install Obsidian and open this folder as a vault to read and link your notes.</span>}
      </div>

      <div className="brain-subhead">
        <div>Connect your AI tools</div>
        <div className="hint">They read your brief, search the brain, and file what they learn in its inbox. Nothing is changed without this switch, and switching it off undoes it.</div>
      </div>
      {b.tools.map((t) => (
        <ToolRow key={t.id} t={t} disabled={!b.on} run={run} />
      ))}

      <Toggle
        label="File a note for every Claude Code session"
        hint="When a session ends (or goes quiet for half an hour), its five lines go to the project’s sessions folder, or the inbox until the project has a page. What was said goes to 09-sources."
        on={b.captureSessions}
        onChange={(v) => run(() => window.settings.brain.set({ captureSessions: v }))}
      />
      <div className="toggle-row">
        <div>
          <div>Session notes are written</div>
          <div className="hint">
            {b.distil === 'plain'
              ? 'From the session alone: what you asked, what changed, how it ended. Nothing is sent to an AI.'
              : b.distiller
                ? `By ${b.distiller}: shipped, decided, promised, the number, the next step. The session is sent to it to write them.`
                : 'No AI is set up (Settings → AI), so notes are written from the session alone for now.'}
          </div>
        </div>
        <Segmented
          value={b.distil}
          options={[
            { value: 'ai', label: 'By my AI' },
            { value: 'plain', label: 'Plain' },
          ]}
          onChange={(v) => run(() => window.settings.brain.set({ distil: v }))}
        />
      </div>
      <div className="brain-list-row">
        <div className="toggle-row">
          <div>
            <div>Never file sessions from</div>
            <div className="hint">{b.skip.length ? 'Sessions in these folders (and below) stay out of the brain.' : 'Every folder is filed. Add private ones here.'}</div>
          </div>
          <button className="secondary" onClick={() => run(() => window.settings.brain.addSkip())}>
            Add folder…
          </button>
        </div>
        {b.skip.map((p) => (
          <div key={p} className="brain-chip">
            <code>{p}</code>
            <button className="link" aria-label={`Stop skipping ${p}`} onClick={() => run(() => window.settings.brain.set({ skip: b.skip.filter((x) => x !== p) }))}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="toggle-row">
        <div>
          <div>Find my projects</div>
          <div className="hint">{b.busy ?? mined ?? 'Reads your past Claude Code sessions and the git history of their folders, and drafts a page for each project in the inbox. Keep the ones you want.'}</div>
        </div>
        <button className="secondary" disabled={!!b.busy || busy} onClick={() => run(async () => setMined(await window.settings.brain.mine()))}>
          {b.busy ? 'Reading…' : 'Look'}
        </button>
      </div>

      <Inbox items={b.inbox} run={run} />

      {b.log.length > 0 && (
        <div className="brain-log">
          <div>Lately</div>
          <ul className="hint">
            {b.log.map((l, i) => (
              <li key={i}>{l.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[([^\]]*)\]\]/g, '$1')}</li>
            ))}
          </ul>
        </div>
      )}
      {b.mcp.url || b.mcp.error ? <div className="hint">{b.mcp.error ? `The brain’s tools for other apps are off: ${b.mcp.error}` : `The brain’s tools for other apps: ${b.mcp.url} (this computer only, with a key).`}</div> : null}
      {error && <div className="error">{error}</div>}
    </section>
  )
}

function ToolRow({ t, disabled, run }: { t: ToolLink; disabled: boolean; run: ReturnType<typeof useAction>['run'] }) {
  const partly = !t.connected && t.parts.some((p) => p.done)
  return (
    <div className="brain-tool" data-tool={t.id}>
      <div className="toggle-row">
        <div>
          <div>
            {t.name}
            {!t.present && <span className="hint"> · not found on this computer</span>}
          </div>
          <ul className="brain-parts">
            {t.parts.map((p) => (
              <li key={p.label} className={p.done ? 'done' : ''}>
                {p.label}
              </li>
            ))}
          </ul>
        </div>
        <input
          className="switch"
          type="checkbox"
          aria-label={`Connect ${t.name}`}
          checked={t.connected || partly}
          disabled={disabled && !t.connected && !partly}
          onChange={(e) =>
            run(async () => {
              const problem = await window.settings.brain.connect(t.id, e.target.checked)
              if (problem) throw new Error(problem)
            })
          }
        />
      </div>
      {t.manual && (
        <div className="hint">
          Run this once in a terminal to give it the brain’s tools: <code className="code">{t.manual}</code>
        </div>
      )}
    </div>
  )
}

function Inbox({ items, run }: { items: InboxItem[]; run: ReturnType<typeof useAction>['run'] }) {
  const placeable = items.filter((i) => i.suggested).length
  return (
    <div className="brain-inbox">
      <div className="toggle-row">
        <div>
          <div>Inbox{items.length ? ` (${items.length})` : ''}</div>
          <div className="hint">{items.length ? 'New notes wait here. Keep files a note where it belongs; Archive puts it away (nothing is deleted).' : 'Empty. New captures land here first.'}</div>
        </div>
        {placeable > 1 && (
          <button className="secondary" onClick={() => run(() => window.settings.brain.keepAll())}>
            Keep {placeable}
          </button>
        )}
      </div>
      {items.map((i) => (
        <div key={i.path} className="brain-item">
          <div className="brain-item-text">
            <button className="link brain-item-title" title={i.path} onClick={() => run(() => window.settings.brain.open(i.path))}>
              {i.title}
            </button>
            <div className="hint">
              {TYPE_LABEL[i.type] ?? 'Note'} · {i.date}
              {i.suggested ? ` · goes to ${i.suggested.replace(/\/[^/]*\.md$/, '/')}` : ''}
            </div>
          </div>
          {i.suggested && (
            <button
              className="secondary"
              onClick={() =>
                run(async () => {
                  const e = await window.settings.brain.keep(i.path)
                  if (e) throw new Error(e)
                })
              }
            >
              Keep
            </button>
          )}
          <button className="secondary" onClick={() => run(() => window.settings.brain.archive(i.path))}>
            Archive
          </button>
        </div>
      ))}
    </div>
  )
}
