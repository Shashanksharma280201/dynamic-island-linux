/** m:ss (or h:mm:ss) for a number of seconds. Pure. */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

/** Current playback position, extrapolated from the last report. Pure. */
export function currentPosition(
  m: { position?: number; positionAt?: number; length?: number; playing: boolean },
  now: number,
): number {
  if (m.position === undefined) return 0
  const elapsed = m.playing && m.positionAt ? (now - m.positionAt) / 1000 : 0
  const p = m.position + Math.max(0, elapsed)
  return m.length ? Math.min(p, m.length) : p
}

/** Human label for a Claude permission rule suggestion, e.g. `Bash(npm test)`. Pure. */
export function ruleLabel(suggestions: unknown[] | undefined): string | null {
  const labels: string[] = []
  for (const s of suggestions ?? []) {
    const rules = (s as any)?.rules
    if (!Array.isArray(rules)) continue
    for (const r of rules) {
      if (typeof r?.toolName !== 'string') continue
      labels.push(r.ruleContent ? `${r.toolName}(${r.ruleContent})` : r.toolName)
    }
  }
  return labels.length ? labels.join(', ') : null
}
