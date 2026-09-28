import { useEffect, useRef, useState } from 'react'
import type { ClaudeView, ClaudeUsage, UsageWindow } from '@shared/claude'
import { currentWindow, orbFor } from '@shared/claude'
import { agoText, resetText } from '@shared/format'
import { Empty, errorText, useNow } from './common'
import { useKeyboard } from './useKeyboard'
import { Orb } from '../voice/Orb'
import { warmUp, type Voice } from '../voice/useVoice'
import { runActive, runStatus } from '../states/ClaudeActivity'
import { ComposeIcon, FolderIcon, MicIcon, SparkIcon, StopIcon } from '../icons'

const folderName = (p: string) => p.split('/').filter(Boolean).pop() ?? '~'

function Meter({ label, win, now }: { label: string; win?: UsageWindow; now: number }) {
  const w = currentWindow(win, now)
  if (!w) return null
  const pct = Math.round(w.pct)
  const level = w.limited || pct >= 95 ? 'full' : pct >= 80 ? 'high' : 'ok'
  return (
    <div className={`meter ${level}`} data-window={label}>
      <div className="meter-top">
        <span className="meter-label">{label}</span>
        <span className="meter-pct">{w.limited ? 'Limit reached' : `${pct}%`}</span>
      </div>
      <div className="meter-bar" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} usage`}>
        <span style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <div className="meter-reset caption">{w.resetsAt ? `Resets ${resetText(w.resetsAt, now)}` : 'Reset'}</div>
    </div>
  )
}

function Limits({ usage, bridge }: { usage?: ClaudeUsage; bridge: boolean }) {
  const now = useNow(30_000)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!usage?.fiveHour && !usage?.sevenDay) {
    return (
      <div className="limits empty-limits">
        <div className="caption">
          {bridge
            ? 'Your plan limits show up here after your next message in Claude Code.'
            : 'See your Claude plan limits (session and weekly) here.'}
        </div>
        {!bridge && (
          <button
            className="pill small primary"
            disabled={busy}
            onClick={async (e) => {
              e.stopPropagation()
              setBusy(true)
              setErr(null)
              await window.island.claude.setUsageBridge(true).catch((x) => setErr(errorText(x)))
              setBusy(false)
            }}
          >
            {busy ? 'Connecting…' : 'Show My Limits'}
          </button>
        )}
        {err && <div className="status error">{err}</div>}
      </div>
    )
  }
  return (
    <div className="limits">
      <div className="meters">
        <Meter label="Session" win={usage.fiveHour} now={now} />
        <Meter label="Week" win={usage.sevenDay} now={now} />
      </div>
      <div className="caption limits-foot">
        {usage.model ? `${usage.model} · ` : ''}updated {agoText(usage.updatedAt, now)}
        {!bridge && ' · from the island’s own runs'}
      </div>
    </div>
  )
}

function Conversation({ view }: { view: ClaudeView }) {
  const scroller = useRef<HTMLDivElement>(null)
  const run = view.run
  const active = runActive(run)
  const turns = view.turns
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns.length, run?.reply, run?.phase])
  if (!turns.length && !active) return null
  return (
    <div className="claude-thread" ref={scroller}>
      {turns.map((t, i) => (
        <div key={i} className="claude-turn">
          <div className="bubble mine">{t.prompt}</div>
          <div className={`claude-answer${t.ok ? '' : ' failed'}`}>
            <span className="claude-mark" aria-hidden>
              ✳
            </span>
            <div className="claude-answer-text">{t.reply || '(no reply)'}</div>
          </div>
        </div>
      ))}
      {active && run && (
        <div className="claude-turn live">
          <div className="bubble mine">{run.prompt}</div>
          <div className="claude-answer live">
            <Orb mood={orbFor(run.phase, run.tool?.name)} size={20} label={runStatus(run)} />
            <div className="claude-answer-text">
              <div className="claude-status">{runStatus(run)}</div>
              {run.reply && <div className="claude-live-reply">{run.reply}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function voiceCaption(v: Voice, view: ClaudeView): string {
  switch (v.phase) {
    case 'preparing':
      return view.stt.downloading
        ? `Getting the speech model ready… ${Math.round(view.stt.progress * 100)}%`
        : 'Getting ready…'
    case 'listening':
      return 'Listening… stop talking to send, or tap the mic'
    case 'transcribing':
      return 'Working out what you said…'
    default:
      return ''
  }
}

function InputBar({ view, voice, onTyping }: { view: ClaudeView; voice: Voice; onTyping: (on: boolean) => void }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const kb = useKeyboard(onTyping)
  const ref = useRef<HTMLTextAreaElement>(null)
  const busy = runActive(view.run)
  const send = async () => {
    const t = text.trim()
    if (!t || busy) return
    setErr(null)
    try {
      await window.island.claude.ask(t)
      setText('')
    } catch (e) {
      setErr(errorText(e))
    }
  }
  const listening = voice.phase === 'listening'
  return (
    <div className="claude-input" onClick={(e) => e.stopPropagation()}>
      {(err || voice.error) && (
        <div className="status error" onClick={() => (setErr(null), voice.clearError())}>
          {err || voice.error}
        </div>
      )}
      <div className="reply-field claude-field">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={busy ? 'Claude is working…' : 'Ask Claude…'}
          aria-label="Ask Claude"
          onPointerDown={() => {
            kb.take()
            setTimeout(() => ref.current?.focus(), 50)
          }}
          onFocus={kb.take}
          onBlur={kb.release}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            } else if (e.key === 'Escape') {
              ref.current?.blur()
            }
          }}
        />
        {busy ? (
          <button className="round-btn stop" title="Stop Claude" aria-label="Stop Claude" onClick={() => void window.island.claude.stop()}>
            <StopIcon />
          </button>
        ) : text.trim() ? (
          <button className="send" title="Send" aria-label="Send" onClick={() => void send()}>
            ↑
          </button>
        ) : (
          <button
            className={`round-btn mic${listening ? ' on' : ''}`}
            title={listening ? 'Finish and send' : 'Talk to Claude'}
            aria-label={listening ? 'Finish and send' : 'Talk to Claude'}
            disabled={voice.phase === 'preparing' || voice.phase === 'transcribing'}
            onClick={voice.toggle}
            style={listening ? { boxShadow: `0 0 0 ${2 + voice.level * 8}px rgba(255, 179, 92, 0.35)` } : undefined}
          >
            <MicIcon size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

/** The Claude tab: plan limits, the conversation, and voice / text input. */
export function ClaudePanel({ view, voice, onTyping }: { view: ClaudeView | null; voice: Voice; onTyping: (on: boolean) => void }) {
  const ready = view?.binary && view.stt.ready ? view.stt.model : ''
  useEffect(() => {
    if (ready) warmUp(ready)
  }, [ready])
  if (!view) return <div className="view claude-panel" />
  if (!view.binary)
    return (
      <div className="view claude-panel">
        <Limits usage={view.usage} bridge={view.usageBridge} />
        <Empty
          icon={<SparkIcon />}
          title="Claude Code isn't installed"
          body="Install Claude Code (the claude command) and log in once in a terminal. If it's installed somewhere unusual, set its path in Settings."
          action={
            <button className="pill" onClick={(e) => (e.stopPropagation(), window.island.openSettings('claude'))}>
              Open Settings
            </button>
          }
        />
      </div>
    )
  const voiceOn = voice.phase !== 'idle'
  const hasHistory = view.turns.length > 0 || runActive(view.run)
  return (
    <div className="view claude-panel">
      <div className="section-head claude-head">
        <span className="large-title">Claude</span>
        <span className="spacer" />
        <button
          className="chip folder-chip"
          title={view.cwd}
          onClick={(e) => (e.stopPropagation(), void window.island.claude.pickFolder())}
        >
          <FolderIcon />
          <span className="ellipsis">{folderName(view.cwd)}</span>
        </button>
        <button
          className="icon-btn"
          title="New conversation"
          aria-label="New conversation"
          disabled={runActive(view.run) || !view.turns.length}
          onClick={(e) => (e.stopPropagation(), void window.island.claude.newConversation())}
        >
          <ComposeIcon />
        </button>
      </div>
      <Limits usage={view.usage} bridge={view.usageBridge} />
      {voiceOn ? (
        <div className={`voice-stage ${voice.phase}`}>
          <Orb mood={voice.phase === 'listening' ? 'listening' : voice.phase === 'transcribing' ? 'solving' : 'breathing'} size={64} />
          <div className="caption voice-caption">{voiceCaption(voice, view)}</div>
          {voice.phase === 'preparing' && view.stt.downloading && (
            <div className="meter-bar download">
              <span style={{ width: `${Math.max(3, view.stt.progress * 100)}%` }} />
            </div>
          )}
          {voice.phase === 'listening' && (
            <button className="plain" onClick={(e) => (e.stopPropagation(), voice.cancel())}>
              Cancel
            </button>
          )}
        </div>
      ) : hasHistory ? (
        <Conversation view={view} />
      ) : (
        <div className="voice-stage idle">
          <Orb mood="breathing" size={64} />
          <div className="caption voice-caption">
            Tap the mic{view.voiceShortcut ? ` or press ${view.voiceShortcut}` : ''} and tell Claude what to do in{' '}
            <b>{folderName(view.cwd)}</b>.
          </div>
        </div>
      )}
      {voice.heard && <div className="heard caption">“{voice.heard}”</div>}
      <InputBar view={view} voice={voice} onTyping={onTyping} />
    </div>
  )
}
