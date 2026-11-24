import { useEffect, useState, type MouseEvent } from 'react'
import type { MediaCmd, MediaState } from '@shared/types'
import type { RestingView } from '@shared/os'
import type { AgentSession } from '@shared/sessions'
import { currentWindow, type ClaudeView } from '@shared/claude'
import {
  DEFAULT_TILES,
  FOCUS_CHOICES,
  clockLeft,
  dayProgress,
  leftText,
  setTile,
  timerFraction,
  timerLeft,
  timerPaused,
  timerRunning,
  untilText,
  type Battery,
  type DashView,
  type SystemStats,
  type TileKind,
  type TimerView,
} from '@shared/dashboard'
import { clockText } from '@shared/clock'
import { partOfDay } from '@shared/format'
import { MicIcon, PauseIcon, PlayIcon, PrevIcon, NextIcon } from '../icons'
import { Character } from '../character/Character'
import { useShortcutLabel } from '../useShortcuts'
import type { CharacterMood } from '@shared/character'
import { useMinute } from '../states/NotchClock'
import { TimerRing, timerCmd, useSecond } from '../states/TimerActivity'
import { runActive, runStatus } from '../states/ClaudeActivity'
import { Waveform } from '../states/Waveform'
import { useLoad } from './common'
import type { HubTab } from './Hub'
import { BatteryGlyph, Wx } from '../extras/glyphs'
import { AppsRow, DevicesTile, ScreenTile, ShelfStrip, ShelfTile, TILE_GLYPHS, TileMenu, TodoTile, TranslateTile, WeatherTile, tileName, useShelf, useTodos, useWeather } from './DashTiles'
import type { ExtrasView } from '@shared/extras'

/** Your voice assistant, as the Dashboard needs it: its name, what it's doing, and how to talk to it. */
export type AssistantLink = {
  name: string
  /** Hearing you: getting ready, listening, or making out what you said. */
  listen: 'idle' | 'preparing' | 'listening' | 'transcribing'
  /** Answering: thinking, speaking, or pointing at something. */
  phase: 'idle' | 'listening' | 'thinking' | 'speaking' | 'pointing'
  /** It also listens for "Hey <name>". */
  wake: boolean
  /** Start listening; again to send what you said, or to stop it talking. */
  ask: () => void
}

/** What the assistant is doing, in a word or two, and the orb's mood for it. Pure. */
export function assistantStatus(a: Pick<AssistantLink, 'listen' | 'phase'>): { line: string; mood: CharacterMood; button: string; busy: boolean } {
  if (a.listen === 'preparing') return { line: 'Getting ready…', mood: 'thinking', button: 'Talk', busy: true }
  if (a.listen === 'listening') return { line: 'Listening…', mood: 'listening', button: 'Done', busy: false }
  if (a.listen === 'transcribing') return { line: 'One moment…', mood: 'thinking', button: 'Talk', busy: true }
  if (a.phase === 'thinking') return { line: 'Thinking…', mood: 'thinking', button: 'Talk', busy: true }
  if (a.phase === 'speaking' || a.phase === 'pointing') return { line: 'Answering…', mood: 'working', button: 'Stop', busy: false }
  return { line: 'Ask me anything', mood: 'idle', button: 'Talk', busy: false }
}

/** The battery as the browser sees it, where the island can't read it itself (not Linux). */
function useBrowserBattery(on: boolean): Battery | null {
  const [b, setB] = useState<Battery | null>(null)
  useEffect(() => {
    if (!on) return
    const get = (navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void }> }).getBattery
    if (!get) return
    let live = true
    let off = () => {}
    void get
      .call(navigator)
      .then((m) => {
        const read = () => {
          // A desktop reads as full and charging: nothing worth showing.
          if (live) setB(m.level >= 1 && m.charging ? null : { pct: Math.round(m.level * 100), charging: m.charging })
        }
        read()
        m.addEventListener('levelchange', read)
        m.addEventListener('chargingchange', read)
        off = () => {
          m.removeEventListener('levelchange', read)
          m.removeEventListener('chargingchange', read)
        }
      })
      .catch(() => {})
    return () => {
      live = false
      off()
    }
  }, [on])
  return b
}

/** This computer's numbers, read every few seconds while they're on screen. */
function useStats(on: boolean): SystemStats | null {
  const [s, setS] = useState<SystemStats | null>(null)
  useEffect(() => {
    if (!on) return
    let live = true
    const load = () =>
      window.island
        .os<SystemStats>('dash.stats')
        .then((v) => live && setS(v))
        .catch(() => {})
    void load()
    const t = setInterval(load, 3000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [on])
  return s
}

function Meter({ label, value, text, tone }: { label: string; value: number; text: string; tone?: 'high' | 'full' }) {
  return (
    <div className="dash-meter" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="dash-meter-row">
        <span className="dash-meter-label">{label}</span>
        <span className="dash-meter-text">{text}</span>
      </div>
      <div className="dash-meter-bar">
        <span className={tone ?? ''} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </div>
    </div>
  )
}

const tone = (pct: number) => (pct >= 90 ? 'full' : pct >= 75 ? 'high' : undefined)

// ---- The tiles ---------------------------------------------------------------

function MediaTile({ media }: { media: MediaState | null }) {
  const cmd = (e: MouseEvent, c: MediaCmd) => {
    e.stopPropagation()
    window.island.sendMediaCmd(c)
  }
  if (!media)
    return (
      <div className="dash-empty">
        <Waveform playing={false} size={18} color="currentColor" />
        <div className="dash-line">Nothing playing</div>
        <div className="caption">Music from any app shows here.</div>
      </div>
    )
  return (
    <>
      <div className="dash-media">
        {media.artUrl ? <img className="dash-art" src={media.artUrl} alt="" /> : <div className="dash-art placeholder" />}
        <div className="dash-media-text">
          <div className="dash-line ellipsis">{media.title || 'Playing'}</div>
          <div className="caption ellipsis">{media.artist || 'Now playing'}</div>
        </div>
      </div>
      {media.canControl && (
        <div className="dash-transport">
          <button className="icon-btn" onClick={(e) => cmd(e, 'previous')} title="Previous" aria-label="Previous">
            <PrevIcon />
          </button>
          <button className="icon-btn" onClick={(e) => cmd(e, 'playpause')} title={media.playing ? 'Pause' : 'Play'} aria-label={media.playing ? 'Pause' : 'Play'}>
            {media.playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
          <button className="icon-btn" onClick={(e) => cmd(e, 'next')} title="Next" aria-label="Next">
            <NextIcon />
          </button>
        </div>
      )}
    </>
  )
}

function TimerTile({ timer }: { timer: TimerView }) {
  const now = useSecond(timerRunning(timer))
  const paused = timerPaused(timer)
  const idle = timer.phase === 'idle'
  return (
    <div className="dash-timer" data-phase={timer.phase} data-paused={paused ? 'yes' : undefined}>
      <TimerRing fraction={timerFraction(timer, timer, now)} size={72} stroke={6}>
        <span className="dash-timer-clock">{clockLeft(timerLeft(timer, timer, now))}</span>
      </TimerRing>
      <div className="dash-timer-side">
        <div className="dash-line">{idle ? 'Ready' : timer.phase === 'break' ? (paused ? 'Break, paused' : 'Break') : paused ? 'Paused' : 'Focus'}</div>
        <div className="caption">{timer.done ? `${timer.done} done today` : 'None yet today'}</div>
        {idle ? (
          <>
            <div className="dash-lengths" role="group" aria-label="Minutes of focus">
              {FOCUS_CHOICES.map((c) => (
                <button key={c.focusMin} className={c.focusMin === timer.focusMin ? 'on' : ''} aria-pressed={c.focusMin === timer.focusMin} title={`${c.focusMin} minutes, then a ${c.breakMin} minute break`} onClick={() => void window.island.os('timer.set', c).catch(() => {})}>
                  {c.focusMin}
                </button>
              ))}
            </div>
            <button className="pill primary small dash-start" onClick={() => timerCmd('start')}>
              Start
            </button>
          </>
        ) : (
          <div className="dash-timer-btns">
            <button className="pill primary small" onClick={() => timerCmd(paused ? 'resume' : 'pause')}>
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button className="pill small" onClick={() => timerCmd('reset')}>
              {timer.phase === 'break' ? 'Skip' : 'Stop'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function DayTile({ at }: { at: Date }) {
  const d = dayProgress(at)
  return (
    <div className="dash-day">
      <div className="dash-big">
        {Math.round(d.fraction * 100)}
        <span>%</span>
      </div>
      {/* One mark an hour: the ones gone are lit, this one partly. */}
      <div className="dash-hours" aria-hidden>
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className={h < d.hour ? 'gone' : h === d.hour ? 'now' : ''} />
        ))}
      </div>
      <div className="caption">{leftText(d.leftMin)} today</div>
    </div>
  )
}

function SystemTile({ stats, battery }: { stats: SystemStats | null; battery: Battery | null }) {
  if (!stats) return <div className="caption">Reading…</div>
  return (
    <div className="dash-meters">
      <Meter label="Processor" value={stats.cpu} text={`${stats.cpu}%`} tone={tone(stats.cpu)} />
      <Meter label="Memory" value={stats.mem} text={`${stats.memUsedGb} of ${stats.memTotalGb} GB`} tone={tone(stats.mem)} />
      {battery && <Meter label={battery.charging ? 'Battery, charging' : 'Battery'} value={battery.pct} text={`${battery.pct}%`} tone={battery.pct <= 20 && !battery.charging ? 'full' : undefined} />}
    </div>
  )
}

function NextTile({ resting, now }: { resting: RestingView | null; now: number }) {
  const next = resting?.next ?? null
  const toFile = resting?.toFile ?? 0
  return (
    <div className="dash-next">
      {next ? (
        <>
          <div className="dash-big small">{untilText(next.at, now)}</div>
          <div className="dash-line ellipsis">{next.title}</div>
          <div className="caption">at {clockText(new Date(next.at))}</div>
        </>
      ) : (
        <>
          <div className="dash-line">Nothing else today</div>
          <div className="caption">The next thing on your calendar shows here.</div>
        </>
      )}
      {toFile > 0 && <div className="caption dash-file">{toFile === 1 ? '1 note to file' : `${toFile} notes to file`}</div>}
    </div>
  )
}

function AssistantTile({ a, keys }: { a: AssistantLink; keys: string }) {
  const s = assistantStatus(a)
  return (
    <div className="dash-assistant" data-listening={a.listen === 'listening' ? 'yes' : undefined}>
      <div className="dash-assistant-row">
        <Character mood={s.mood} size={46} />
        <div className="dash-assistant-text">
          <div className="dash-line">{s.line}</div>
          <div className="caption">{a.wake ? `Say “Hey ${a.name}”, or press ${keys}` : `About your screen, your day, anything. ${keys}`}</div>
        </div>
      </div>
      <button className="pill primary small dash-talk" disabled={s.busy} onClick={a.ask}>
        <MicIcon size={13} />
        {s.button}
      </button>
    </div>
  )
}

function ClaudeTile({ sessions, claude }: { sessions: AgentSession[]; claude: ClaudeView | null }) {
  const now = Date.now()
  const waiting = sessions.filter((s) => s.phase === 'waiting')
  const working = sessions.filter((s) => s.phase === 'working')
  const run = claude?.run && runActive(claude.run) ? claude.run : null
  const five = currentWindow(claude?.usage?.fiveHour, now)
  const week = currentWindow(claude?.usage?.sevenDay, now)
  const busy = working.length + (run ? 1 : 0)
  const line = waiting.length ? (waiting.length === 1 ? '1 needs you' : `${waiting.length} need you`) : busy ? `${busy} working` : 'Quiet'
  const sub = waiting.length ? waiting.map((s) => s.project || '~').join(', ') : run ? runStatus(run) : working.length ? working.map((s) => s.project || '~').join(', ') : 'No sessions running.'
  return (
    <div className="dash-claude" data-waiting={waiting.length ? 'yes' : undefined}>
      <div className="dash-line">{line}</div>
      <div className="caption ellipsis">{sub}</div>
      {(five || week) && (
        <div className="dash-meters tight">
          {five && <Meter label="Session" value={five.pct} text={`${Math.round(five.pct)}%`} tone={five.limited ? 'full' : tone(five.pct)} />}
          {week && <Meter label="Week" value={week.pct} text={`${Math.round(week.pct)}%`} tone={week.limited ? 'full' : tone(week.pct)} />}
        </div>
      )}
    </div>
  )
}

/**
 * The Dashboard: the day at the top (the weather, the battery, a microphone
 * for your assistant), then four tiles you choose (Edit, or right-click one,
 * opens a menu of thirteen), and your apps along the bottom. The shelf shows
 * across the top while there's something on it.
 */
export function DashboardView({
  media,
  sessions,
  claude,
  assistant,
  onTab,
  onTyping,
}: {
  media: MediaState | null
  sessions: AgentSession[]
  claude: ClaudeView | null
  assistant: AssistantLink
  onTab: (t: HubTab) => void
  onTyping: (on: boolean) => void
}) {
  const askKeys = useShortcutLabel('buddy')
  const nameOf = (k: TileKind) => tileName(k, assistant.name)
  const { data: dash } = useLoad<DashView>(
    () => window.island.os<DashView>('dash.view'),
    [],
    (reload) => window.island.onOs((topic) => topic === 'dash' && reload()),
    'dash',
  )
  const [edit, setEdit] = useState(false)
  // The tile whose menu is open (while editing).
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => {
    if (!edit) setPicked(null)
  }, [edit])
  const tiles = dash?.tiles ?? DEFAULT_TILES
  const has = (k: TileKind) => tiles.includes(k)
  const at = useMinute()
  const stats = useStats(has('system') && !edit)
  const browserBattery = useBrowserBattery(!!stats && stats.battery === undefined)
  const battery = stats?.battery ?? browserBattery
  const { data: resting } = useLoad<RestingView>(() => window.island.os<RestingView>('status.view'), [at.getHours(), Math.floor(at.getMinutes() / 5)], undefined, 'dash-resting')

  const { data: weather } = useWeather()
  const { data: todos } = useTodos()
  const { data: shelf } = useShelf()
  const { data: extras } = useLoad<ExtrasView>(
    () => window.island.os<ExtrasView>('extras.view'),
    [],
    (reload) => window.island.onOs((topic) => topic === 'extras' && reload()),
    'extras',
  )

  const pick = (slot: number, kind: TileKind) => {
    setPicked(null)
    void window.island.os('dash.tiles', { tiles: setTile(tiles, slot, kind) }).catch(() => {})
  }
  // Where a tile leads when you click it (its own buttons aside).
  const opens: Partial<Record<TileKind, HubTab>> = { next: 'today', claude: sessions.some((s) => s.phase === 'waiting') ? 'sessions' : 'claude' }

  return (
    <div className="dashboard" data-editing={edit ? 'yes' : undefined} onClick={(e) => e.stopPropagation()}>
      <div className="dash-head">
        <div className="dash-date">
          <div className="dash-weekday">{at.toLocaleDateString(undefined, { weekday: 'long' })}</div>
          <div className="caption">
            {at.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })} · {partOfDay(at.getHours())}
          </div>
        </div>
        <span className="spacer" />
        {weather?.weather && (
          <span className="dash-weather" title={`${weather.weather.place}: ${weather.weather.text}, high ${weather.weather.high}°, low ${weather.weather.low}°`}>
            <Wx kind={weather.weather.kind} size={17} />
            {weather.weather.temp}°
          </span>
        )}
        {battery && (
          <span className="dash-battery" title={battery.charging ? `Battery ${battery.pct}%, charging` : `Battery ${battery.pct}%`}>
            <BatteryGlyph {...battery} />
            {battery.pct}%
          </span>
        )}
        <button
          className="dash-mic"
          data-on={assistant.listen === 'listening' ? 'yes' : undefined}
          aria-label={`Ask ${assistant.name}`}
          title={`Ask ${assistant.name} out loud (${askKeys})`}
          disabled={assistantStatus(assistant).busy}
          onClick={assistant.ask}
        >
          <MicIcon size={15} />
        </button>
        <button className={`plain dash-edit${edit ? ' on' : ' muted'}`} aria-pressed={edit} onClick={() => setEdit(!edit)}>
          {edit ? 'Done' : 'Edit'}
        </button>
      </div>
      {shelf && shelf.items.length > 0 && <ShelfStrip view={shelf} />}
      <div className="dash-grid">
        {tiles.map((kind, slot) => {
          const to = opens[kind]
          const Glyph = TILE_GLYPHS[kind]
          return (
            <div
              key={`${slot}-${kind}`}
              className={`module dash-tile${to && !edit ? ' link' : ''}${picked === slot ? ' picked' : ''}`}
              data-slot={slot}
              data-kind={kind}
              role={edit ? 'button' : undefined}
              aria-label={edit ? `Change tile ${slot + 1}: ${nameOf(kind)}` : undefined}
              onClick={edit ? () => setPicked(picked === slot ? null : slot) : to ? () => onTab(to) : undefined}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setEdit(true)
                setPicked(slot)
              }}
            >
              <div className="dash-tile-title">
                <Glyph size={15} />
                {nameOf(kind)}
                {kind === 'weather' && weather?.weather && <span className="dash-tile-side ellipsis">{weather.weather.place}</span>}
                {kind === 'todo' && todos && todos.left > 0 && <span className="dash-tile-side">{todos.left} left</span>}
              </div>
              {/* While you're choosing, a tile is only a picture of itself. */}
              <div className="dash-tile-body" aria-hidden={edit ? true : undefined}>
                {kind === 'media' && <MediaTile media={media} />}
                {kind === 'timer' && (dash ? <TimerTile timer={dash.timer} /> : <div className="caption">Loading…</div>)}
                {kind === 'day' && <DayTile at={at} />}
                {kind === 'system' && <SystemTile stats={stats} battery={battery ?? null} />}
                {kind === 'next' && <NextTile resting={resting} now={at.getTime()} />}
                {kind === 'claude' && <ClaudeTile sessions={sessions} claude={claude} />}
                {kind === 'assistant' && <AssistantTile a={assistant} keys={askKeys} />}
                {kind === 'weather' && <WeatherTile view={weather} onTyping={onTyping} now={at.getTime()} />}
                {kind === 'devices' && <DevicesTile />}
                {kind === 'screen' && <ScreenTile minute={Math.floor(at.getTime() / 60_000)} />}
                {kind === 'todo' && <TodoTile view={todos} onTyping={onTyping} />}
                {kind === 'shelf' && <ShelfTile view={shelf} />}
                {kind === 'translate' && <TranslateTile to={extras?.translateTo ?? 'English'} onTyping={onTyping} />}
              </div>
            </div>
          )
        })}
        {edit && picked !== null && <TileMenu current={tiles[picked]} nameOf={nameOf} onPick={(k) => pick(picked, k)} onClose={() => setPicked(null)} />}
      </div>
      {edit && <div className="caption dash-hint">{dash?.profile === 'evening' ? 'These are the evening’s tiles. Click one to change it.' : 'Click a tile to change what it shows.'}</div>}
      <AppsRow edit={edit} onTyping={onTyping} />
    </div>
  )
}
