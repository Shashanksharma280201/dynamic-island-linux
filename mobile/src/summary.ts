/**
 * The island in a few words, the same everywhere it shows: the Island tab,
 * the home screen widget and the lock screen. Pure, so it can be tested.
 */
import type { PhoneCharacter, PhoneView } from './islandTypes'
import { MOOD_COLOR, ORB_COLOR, moodWords } from './orb'

export type LinkPhase = 'live' | 'searching' | 'offline' | 'sending' | 'receiving'

export type IslandSummary = {
  /** The orb: which, its name, colour and mood (an older island doesn't say: the default orb, its mood from what's here). */
  orb: PhoneCharacter
  /** What it's doing: "2 waiting for you", "At work", "Resting", "Offline". */
  line: string
  /** A little more: the project it's at work on, or the computer and the link. */
  detail: string
  /** The mood's colour (the ring), none at rest or offline. */
  ring: string | null
  /** Offline: drawn faded. */
  dim: boolean
  /** What's waiting, for the status bar chip on Android 16 ("2"), or nothing. */
  chip: string | null
  /** The same in a few capitals, for the dot widget: "2 WAITING", "AT WORK", "RESTING". */
  word: string
  /** Something needs you (the dot widget's red dot). */
  alert: boolean
  /** The computer's name. */
  computer: string
}

const WORD: Record<string, string> = {
  idle: 'RESTING',
  sleeping: 'ASLEEP',
  working: 'AT WORK',
  writing: 'WRITING',
  searching: 'LOOKING',
  thinking: 'THINKING',
  listening: 'LISTENING',
  done: 'DONE',
  attention: 'NEEDS YOU',
  error: 'TROUBLE',
  dancing: 'DONE',
}

const BUSY = new Set(['working', 'writing', 'searching', 'thinking', 'listening'])

export function islandSummary(view: PhoneView | undefined, phase: LinkPhase, computer: string): IslandSummary {
  const working = view?.sessions.find((x) => x.phase === 'working')
  const waiting = view?.approvals.length ?? 0
  const orb: PhoneCharacter = view?.character ?? { id: 'orbit', name: 'Orbit', color: ORB_COLOR.orbit, mood: waiting ? 'attention' : working ? 'working' : 'idle' }
  const offline = phase === 'offline'
  const line = offline ? 'Offline' : phase === 'searching' && !view ? 'Connecting…' : orb.mood === 'attention' && waiting ? `${waiting} waiting for you` : moodWords(orb.mood)
  const status = offline ? 'Can’t reach it' : phase === 'searching' ? 'Connecting…' : phase === 'sending' ? 'Sending' : phase === 'receiving' ? 'Receiving' : 'Connected'
  const detail = !offline && BUSY.has(orb.mood) && working ? `${working.project} · ${computer}` : `${computer} · ${status}`
  const word = offline ? 'OFFLINE' : phase === 'searching' && !view ? 'CONNECTING' : waiting ? `${waiting} WAITING` : (WORD[orb.mood] ?? 'RESTING')
  return {
    orb,
    line,
    detail,
    ring: offline ? null : (MOOD_COLOR[orb.mood] ?? null),
    dim: offline,
    chip: !offline && waiting ? String(waiting) : null,
    word,
    alert: !offline && (waiting > 0 || orb.mood === 'attention'),
    computer,
  }
}
