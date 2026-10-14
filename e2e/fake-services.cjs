// Fake GitHub, Vercel, Stripe, Resend, Notion, Cal.com and n8n APIs for the
// services e2e test, all on one port (the island's DI_SERVICES_BASE points
// here: /github/…, /vercel/…). The key "good" is accepted, anything else gets
// 401. POST /__state merges JSON into the state, to make things happen.
const http = require('http')

const state = {
  ci: 'running', // the check runs of my PR: running | failing | passing
  deployState: 'BUILDING',
  charges: [{ id: 'ch_1', amount: 1999, currency: 'usd', description: 'Starter plan', created: Math.floor(Date.now() / 1000) - 3600, paid: true, status: 'succeeded' }],
  execStatus: 'success',
}
const hits = []

const pr = (n, repo, title, extra = {}) => ({ number: n, title, html_url: `https://github.com/${repo}/pull/${n}`, repository_url: `https://api.github.com/repos/${repo}`, draft: false, updated_at: new Date(Date.now() - 600_000).toISOString(), ...extra })

function answer(path, method, body) {
  const [, service, ...rest] = path.split('?')[0].split('/')
  const p = '/' + rest.join('/')
  const q = new URLSearchParams(path.split('?')[1] || '')
  switch (service) {
    case 'github':
      if (p === '/search/issues') {
        const query = q.get('q') || ''
        if (/author:@me/.test(query)) return { total_count: 1, items: [pr(12, 'me/shop', 'Fix the cart total')] }
        if (/review-requested:@me/.test(query)) return { total_count: 2, items: [pr(3, 'team/app', 'Add login'), pr(4, 'team/app', 'Dark mode', { draft: true })] }
      }
      if (p === '/repos/me/shop/pulls/12') return { head: { sha: 'abc123' } }
      if (p === '/repos/me/shop/commits/abc123/check-runs')
        return { check_runs: [{ status: state.ci === 'running' ? 'in_progress' : 'completed', conclusion: state.ci === 'failing' ? 'failure' : state.ci === 'passing' ? 'success' : null }] }
      break
    case 'vercel':
      if (p === '/v6/deployments')
        return { deployments: [{ uid: 'dpl_1', name: 'shop-site', state: state.deployState, url: 'shop-site-abc.vercel.app', created: Date.now() - 120_000, meta: { githubCommitMessage: 'Fix the cart total', githubCommitRef: 'main' } }] }
      break
    case 'stripe':
      if (p === '/v1/balance') return { available: [{ amount: 124050, currency: 'usd' }] }
      if (p === '/v1/charges') return { data: state.charges }
      break
    case 'resend':
      if (p === '/emails') return { object: 'list', data: [{ id: 'em_1', to: ['ann@example.com'], subject: 'Your receipt', created_at: new Date(Date.now() - 300_000).toISOString(), last_event: 'delivered' }] }
      break
    case 'notion':
      if (p === '/v1/search' && method === 'POST')
        return { results: [{ id: 'pg_1', url: 'https://www.notion.so/Roadmap-pg1', icon: { type: 'emoji', emoji: '🗺' }, last_edited_time: new Date(Date.now() - 3_600_000).toISOString(), properties: { title: { type: 'title', title: [{ plain_text: 'Roadmap' }] } } }] }
      break
    case 'calcom':
      if (p === '/v2/bookings') return { status: 'success', data: [{ id: 9, title: 'Intro call', start: new Date(Date.now() + 2 * 3_600_000).toISOString(), attendees: [{ name: 'Ann' }], meetingUrl: 'https://meet.google.com/abc-defg-hij' }] }
      break
    case 'n8n':
      if (p === '/api/v1/executions') return { data: [{ id: 41, workflowId: 'wf1', status: state.execStatus, startedAt: new Date(Date.now() - 60_000).toISOString(), stoppedAt: new Date(Date.now() - 50_000).toISOString() }] }
      if (p === '/api/v1/workflows/wf1') return { id: 'wf1', name: 'Daily digest' }
      break
  }
  return null
}

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (d) => (body += d))
  req.on('end', () => {
    if (req.url === '/__state' && req.method === 'POST') {
      Object.assign(state, JSON.parse(body || '{}'))
      res.end('{}')
      return
    }
    if (req.url === '/__hits') {
      res.end(JSON.stringify(hits))
      return
    }
    const service = req.url.split('/')[1]
    const key = service === 'n8n' ? req.headers['x-n8n-api-key'] : (req.headers.authorization || '').replace(/^Bearer /, '')
    hits.push({ service, path: req.url, method: req.method, notionVersion: req.headers['notion-version'], calVersion: req.headers['cal-api-version'], gh: req.headers['x-github-api-version'] })
    if (key !== 'good') {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end('{"message":"Bad credentials"}')
      return
    }
    const out = answer(req.url, req.method, body)
    res.writeHead(out ? 200 : 404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(out ?? { message: 'Not Found' }))
  })
})
server.listen(Number(process.argv[2]) || 0, '127.0.0.1', () => console.log(`port ${server.address().port}`))
