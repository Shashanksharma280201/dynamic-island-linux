function buildDecision(behavior) {
  if (behavior !== 'allow' && behavior !== 'deny') return null // no-op
  return {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior },
    },
  }
}

function summarize(input) {
  if (!input) return ''
  if (typeof input.command === 'string') return input.command
  if (typeof input.file_path === 'string') return input.file_path
  return JSON.stringify(input).slice(0, 200)
}

module.exports = { buildDecision, summarize }
