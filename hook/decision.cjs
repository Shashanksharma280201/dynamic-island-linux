/**
 * Build the PermissionRequest hook output for a reply from the island.
 * `reply` is { decision, message?, always?, suggestions? }. Returns null for a
 * no-op (print nothing, so Claude shows its normal terminal prompt).
 */
function buildDecision(reply, suggestions) {
  const r = typeof reply === 'string' ? { decision: reply } : reply || {}
  const behavior = r.decision
  if (behavior !== 'allow' && behavior !== 'deny') return null
  const decision = { behavior }
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

function summarize(input) {
  if (!input) return ''
  if (typeof input.command === 'string') return input.command
  if (typeof input.file_path === 'string') return input.file_path
  return JSON.stringify(input).slice(0, 200)
}

module.exports = { buildDecision, allowSuggestions, summarize }
