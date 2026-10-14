import type { Activity } from './types'
import { moodFor, restingMood, type CharacterMood } from './character'
import { currentStep } from './sessions'

/** No news for this long and the desktop companion dozes off. */
export const DOZE_MS = 120_000

/**
 * How the desktop companion looks, from what's on the island: it wants you
 * when something waits for an answer, works along while Claude works, cheers
 * when something finished, dances to music, and dozes after a quiet while. Pure.
 */
export function companionMood(list: Activity[], lastBusyAt: number, now: Date): CharacterMood {
  if (list.some((a) => a.kind === 'approval' || (a.kind === 'session' && a.session.phase === 'waiting'))) return 'attention'
  const session = list.find((a) => a.kind === 'session' && a.session.phase === 'working')
  if (session?.kind === 'session') {
    const step = currentStep(session.session)
    return step ? moodFor('tool', step.tool) : 'thinking'
  }
  const run = list.find((a) => a.kind === 'claude')
  if (run?.kind === 'claude') return moodFor(run.run.phase, run.run.tool?.name)
  if (list.some((a) => a.kind === 'session' && a.session.phase === 'done')) return 'done'
  if (list.some((a) => a.kind === 'media' && a.media.playing)) return 'dancing'
  if (now.getTime() - lastBusyAt > DOZE_MS) return 'sleeping'
  return restingMood(now)
}

/** Where the companion goes: its saved spot if it's still on a screen, else near the bottom right. Pure. */
export function companionSpot(saved: { x: number; y: number } | null, areas: { x: number; y: number; width: number; height: number }[], size: number): { x: number; y: number } {
  const fits = (p: { x: number; y: number }) => areas.some((a) => p.x >= a.x && p.y >= a.y && p.x + size <= a.x + a.width && p.y + size <= a.y + a.height)
  if (saved && fits(saved)) return saved
  const a = areas[0] ?? { x: 0, y: 0, width: 1280, height: 800 }
  return { x: a.x + a.width - size - 40, y: a.y + a.height - size - 40 }
}
