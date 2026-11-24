import type { ReactNode } from 'react'
import { agentName } from '@shared/sessions'
import { AsteriskGlyph, CursorGlyph, PromptGlyph, SparkGlyph } from './glyphs'

type Mark = { ink: string; glyph: (size: number) => ReactNode }

/** Each coding agent's own mark: a colour and a simple sign, so a list of them reads at a glance. */
const MARKS: Record<string, Mark> = {
  'claude-code': { ink: 'linear-gradient(180deg, #ff9f6b, #d97757)', glyph: (s) => <AsteriskGlyph size={s} /> },
  cursor: { ink: 'linear-gradient(180deg, #48484a, #1c1c1e)', glyph: (s) => <CursorGlyph size={s} /> },
  codex: { ink: 'linear-gradient(180deg, #5e5ce6, #3634a3)', glyph: (s) => <PromptGlyph size={s} /> },
  gemini: { ink: 'linear-gradient(180deg, #64d2ff, #0a84ff)', glyph: (s) => <SparkGlyph size={s} /> },
}
const OTHER: Mark = { ink: 'linear-gradient(180deg, #8e8e93, #636366)', glyph: (s) => <PromptGlyph size={s} /> }

export function AgentMark({ agent, size = 34 }: { agent: string; size?: number }) {
  const m = MARKS[agent] ?? OTHER
  return (
    <span className="agent-mark" data-agent={agent} title={agentName(agent)} style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: m.ink }} aria-hidden>
      {m.glyph(Math.round(size * 0.52))}
    </span>
  )
}
