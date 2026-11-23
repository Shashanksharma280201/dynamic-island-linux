import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import type { MediaCmd, MediaState } from '@shared/types'
import type { RestingView } from '@shared/os'
import type { AgentSession } from '@shared/sessions'
import { currentWindow, type ClaudeView } from '@shared/claude'
import {
  DEFAULT_TILES,
  FOCUS_CHOICES,
  TILE_KINDS,
  TILE_NAMES,
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
import { PauseIcon, PlayIcon, PrevIcon, NextIcon } from '../icons'
import { useMinute } from '../states/NotchClock'
import { TimerRing, timerCmd, useSecond } from '../states/TimerActivity'
import { runActive, runStatus } from '../states/ClaudeActivity'
import { Waveform } from '../states/Waveform'
import { useLoad } from './common'
import type { HubTab } from './Hub'

/** One small drawn icon per kind of tile (for choosing them). */
const Line = ({ children }: { children: ReactNode }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)
const TILE_ICONS: Record<TileKind, ReactNode> = {
  media: (
    <Line>
      <path d="M9 17.5V5.5l11-2v12" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="15.5" r="2.5" />
    </Line>
  ),
  timer: (
    <Line>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4l2.5 1.5M9.5 3h5" />
    </Line>
  ),
  day: (
    <Line>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </Line>
  ),
  system: (
    <Line>
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
      <path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3" />
    </Line>
  ),
  next: (
    <Line>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 9.8h17M8 3v4M16 3v4" />
    </Line>
  ),
  claude: (
    <Line>
      <path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18" />
    </Line>
  ),
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

function BatteryGlyph({ pct, charging }: Battery) {
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden>
      <rect x="0.75" y="0.75" width="17.5" height="10.5" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.2" />
      <rect x="19.6" y="3.8" width="1.8" height="4.4" rx="0.9" fill="currentColor" fillOpacity="0.45" />
      <rect x="2.4" y="2.4" width={Math.max(1.5, (14.2 * pct) / 100)} height="7.2" rx="1.6" className={`level${pct <= 20 && !charging ? ' low' : charging ? ' charging' : ''}`} />
    </svg>
  )
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
 * The Dashboard: the day at the top, then four tiles you choose (Edit, or
 * right-click one): what's playing, a focus timer, how far the day has gone,
 * this computer, what's next, and Claude.
 */
export function DashboardView({ media, sessions, claude, onTab }: { media: MediaState | null; sessions: AgentSession[]; claude: ClaudeView | null; onTab: (t: HubTab) => void }) {
  const { data: dash } = useLoad<DashView>(
    () => window.island.os<DashView>('dash.view'),
    [],
    (reload) => window.island.onOs((topic) => topic === 'dash' && reload()),
    'dash',
  )
  const [edit, setEdit] = useState(false)
  const tiles = dash?.tiles ?? DEFAULT_TILES
  const has = (k: TileKind) => tiles.includes(k)
  const at = useMinute()
  const stats = useStats(has('system') && !edit)
  const browserBattery = useBrowserBattery(!!stats && stats.battery === undefined)
  const battery = stats?.battery ?? browserBattery
  const { data: resting } = useLoad<RestingView>(() => window.island.os<RestingView>('status.view'), [at.getHours(), Math.floor(at.getMinutes() / 5)], undefined, 'dash-resting')

  const pick = (slot: number, kind: TileKind) => void window.island.os('dash.tiles', { tiles: setTile(tiles, slot, kind) }).catch(() => {})
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
        {battery && (
          <span className="dash-battery" title={battery.charging ? `Battery ${battery.pct}%, charging` : `Battery ${battery.pct}%`}>
            <BatteryGlyph {...battery} />
            {battery.pct}%
          </span>
        )}
        <button className={`plain dash-edit${edit ? ' on' : ' muted'}`} aria-pressed={edit} onClick={() => setEdit(!edit)}>
          {edit ? 'Done' : 'Edit'}
        </button>
      </div>
      <div className="dash-grid">
        {tiles.map((kind, slot) => {
          const to = opens[kind]
          return (
            <div
              key={`${slot}-${kind}`}
              className={`module dash-tile${to && !edit ? ' link' : ''}`}
              data-slot={slot}
              data-kind={kind}
              onClick={to && !edit ? () => onTab(to) : undefined}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setEdit(true)
              }}
            >
              {edit ? (
                <div className="dash-choose" role="radiogroup" aria-label={`Tile ${slot + 1}`}>
                  {TILE_KINDS.map((k) => (
                    <button key={k} role="radio" aria-checked={k === kind} className={k === kind ? 'on' : ''} onClick={() => pick(slot, k)}>
                      {TILE_ICONS[k]}
                      <span className="ellipsis">{TILE_NAMES[k]}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <div className="dash-tile-title">
                    {TILE_ICONS[kind]}
                    {TILE_NAMES[kind]}
                  </div>
                  {kind === 'media' && <MediaTile media={media} />}
                  {kind === 'timer' && (dash ? <TimerTile timer={dash.timer} /> : <div className="caption">Loading…</div>)}
                  {kind === 'day' && <DayTile at={at} />}
                  {kind === 'system' && <SystemTile stats={stats} battery={battery ?? null} />}
                  {kind === 'next' && <NextTile resting={resting} now={at.getTime()} />}
                  {kind === 'claude' && <ClaudeTile sessions={sessions} claude={claude} />}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
