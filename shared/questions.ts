/** Claude Code's AskUserQuestion: questions with options, answered on the island. */

export type QuestionOption = { label: string; description?: string }
export type Question = { question: string; header?: string; multiSelect: boolean; options: QuestionOption[] }

/** The questions in an AskUserQuestion input, or null if it isn't one we can show. Pure. */
export function parseQuestions(input: unknown): Question[] | null {
  const qs = (input as { questions?: unknown } | undefined)?.questions
  if (!Array.isArray(qs) || qs.length === 0 || qs.length > 10) return null
  const out: Question[] = []
  for (const q of qs) {
    if (!q || typeof q.question !== 'string' || !q.question.trim() || !Array.isArray(q.options)) return null
    const options = q.options
      .filter((o: any) => o && typeof o.label === 'string' && o.label.trim())
      .map((o: any) => ({ label: o.label, description: typeof o.description === 'string' && o.description ? o.description : undefined }))
    if (!options.length) return null
    out.push({ question: q.question, header: typeof q.header === 'string' && q.header ? q.header : undefined, multiSelect: q.multiSelect === true, options })
  }
  // Answers are keyed by question text: two the same can't both be answered.
  if (new Set(out.map((q) => q.question)).size !== out.length) return null
  return out
}

/**
 * The answer Claude gets for one question: the option picked, the ones
 * picked joined with ", ", your own words (with any picked, for multi-select),
 * or null if nothing yet. Pure.
 */
export function questionAnswer(q: Question, picked: string[], other: string): string | null {
  const mine = other.trim()
  const chosen = q.options.map((o) => o.label).filter((l) => picked.includes(l))
  if (!q.multiSelect) return chosen[0] ?? (mine || null)
  const all = mine ? [...chosen, mine] : chosen
  return all.length ? all.join(', ') : null
}
