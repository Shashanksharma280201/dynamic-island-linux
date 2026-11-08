#!/usr/bin/env node
// A stand-in for the GitHub CLI in tests: "gh api user --jq .login" says
// "me", and "gh api users/me/events" lists today's events (a merged pull
// request, a review and a push). FAKE_GH_FAIL=1 fails like a logged-out gh.
const args = process.argv.slice(2)
if (process.env.FAKE_GH_FAIL) {
  process.stderr.write('To get started with GitHub CLI, please run:  gh auth login\n')
  process.exit(4)
}
if (args[0] === 'api' && args[1] === 'user') {
  process.stdout.write('me\n')
} else if (args[0] === 'api' && /^users\/me\/events/.test(args[1] ?? '')) {
  const now = Date.now()
  const at = (minAgo) => new Date(now - minAgo * 60_000).toISOString()
  process.stdout.write(
    JSON.stringify([
      { id: 'e3', type: 'PushEvent', created_at: at(5), repo: { name: 'me/island' }, payload: { size: 1, ref: 'refs/heads/main', commits: [{ message: 'Today panel' }] } },
      { id: 'e2', type: 'PullRequestReviewEvent', created_at: at(20), repo: { name: 'me/api' }, payload: { review: { state: 'approved', html_url: 'https://github.com/me/api/pull/7#r1' }, pull_request: { number: 7, title: 'Fix CI' } } },
      { id: 'e1', type: 'PullRequestEvent', created_at: at(40), repo: { name: 'me/island' }, payload: { action: 'closed', pull_request: { number: 42, title: 'The engine', merged: true, html_url: 'https://github.com/me/island/pull/42' } } },
    ]),
  )
} else {
  process.stderr.write(`fake gh: unknown ${args.join(' ')}\n`)
  process.exit(1)
}
