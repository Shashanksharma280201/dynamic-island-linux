/**
 * Build the PermissionRequest hook output for a reply from the island.
 * `reply` is { decision, message?, always?, answers? }. Returns null for a
 * no-op (print nothing, so Claude shows its normal terminal prompt).
 * `request` is { toolName, toolInput } of what Claude asked: a question
 * (AskUserQuestion) is answered by handing Claude its input back with the
 * answers filled in, and only when they fit the questions exactly.
 */
function buildDecision(reply, suggestions, request) {
  const r = typeof reply === 'string' ? { decision: reply } : reply || {}
  const behavior = r.decision
  if (behavior !== 'allow' && behavior !== 'deny') return null
  const decision = { behavior }
  if (request && request.toolName === 'AskUserQuestion' && behavior === 'allow') {
    const input = request.toolInput || {}
    // No answers that fit: let Claude ask in the terminal instead.
    if (!answersFit(input.questions, r.answers)) return null
    decision.updatedInput = { ...input, answers: r.answers }
    return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } }
  }
  if (behavior === 'deny' && typeof r.message === 'string' && r.message) {
    decision.message = r.message
  }
  if (behavior === 'allow' && r.always) {
    const rules = allowSuggestions(suggestions)
    if (rules.length > 0) decision.updatedPermissions = rules
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision,
    },
  }
}

/** The "always allow" rule updates Claude suggested for this request. */
function allowSuggestions(suggestions) {
  if (!Array.isArray(suggestions)) return []
  return suggestions.filter(
    (s) => s && s.type === 'addRules' && s.behavior === 'allow' && Array.isArray(s.rules),
  )
}

/**
 * True if `answers` answers every question in `questions` and nothing else:
 * { "<question text>": "<label>" }, several labels joined with ", ", or what
 * you typed for "Other".
 */
function answersFit(questions, answers) {
  if (!Array.isArray(questions) || questions.length === 0) return false
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return false
  const asked = questions.map((q) => q && q.question).filter((q) => typeof q === 'string')
  if (asked.length !== questions.length) return false
  const keys = Object.keys(answers)
  if (keys.length !== asked.length || !asked.every((q) => keys.includes(q))) return false
  return asked.every((q) => typeof answers[q] === 'string' && answers[q].trim() && answers[q].length <= 2000)
}

function summarize(input) {
  if (!input) return ''
  if (typeof input.command === 'string') return input.command
  if (typeof input.file_path === 'string') return input.file_path
  return JSON.stringify(input).slice(0, 200)
}

module.exports = { buildDecision, allowSuggestions, answersFit, summarize }
