import {
  calSnapshot,
  ciFromChecks,
  githubEvents,
  githubPrs,
  githubSnapshot,
  money,
  n8nEvents,
  n8nExecutions,
  n8nSnapshot,
  notionSnapshot,
  notionTitle,
  resendSnapshot,
  safeServiceUrl,
  stripeCharges,
  stripeEvents,
  stripeSnapshot,
  vercelDeploys,
  vercelEvents,
  vercelSnapshot,
  worstCi,
} from '../shared/services'

test('GitHub: pull requests, CI, and what changed', () => {
  const prs = githubPrs({ items: [{ number: 12, title: 'Fix cart', html_url: 'https://github.com/me/shop/pull/12', repository_url: 'https://api.github.com/repos/me/shop', draft: false, updated_at: '2026-10-14T10:00:00Z' }] })
  expect(prs[0]).toMatchObject({ id: 'me/shop#12', repo: 'me/shop', number: 12, ci: 'none' })
  expect(ciFromChecks({ check_runs: [{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'failure' }] })).toBe('failing')
  expect(ciFromChecks({ check_runs: [{ status: 'in_progress', conclusion: null }, { status: 'completed', conclusion: 'success' }] })).toBe('running')
  expect(ciFromChecks({ check_runs: [{ status: 'completed', conclusion: 'skipped' }] })).toBe('passing')
  expect(ciFromChecks({ check_runs: [] })).toBe('none')
  expect(worstCi(['passing', 'running', 'none'])).toBe('running')
  const running = [{ ...prs[0], ci: 'running' as const }]
  const failing = [{ ...prs[0], ci: 'failing' as const }]
  expect(githubEvents(null, { mine: failing, review: [] })).toEqual([]) // the first look is quiet
  expect(githubEvents({ mine: running, review: [] }, { mine: failing, review: [] })[0]).toMatchObject({ title: 'CI failed: Fix cart', urgency: 'critical' })
  expect(githubEvents({ mine: failing, review: [] }, { mine: [{ ...prs[0], ci: 'passing' }], review: [] })[0].title).toBe('CI passed: Fix cart')
  const ask = [{ ...prs[0], id: 'you/app#3', title: 'Add login' }]
  expect(githubEvents({ mine: [], review: [] }, { mine: [], review: ask })[0]).toMatchObject({ title: 'Review requested: Add login' })
  const snap = githubSnapshot(failing, ask, 1)
  expect(snap.big).toEqual({ value: '1', label: 'pull request to review' })
  expect(snap.sections[1].rows[0]).toMatchObject({ tone: 'bad', side: 'failing' })
})

test('Vercel: deployments and finished deploys', () => {
  const d = vercelDeploys({ deployments: [{ uid: 'd1', name: 'site', state: 'BUILDING', url: 'site-abc.vercel.app', created: 1760000000000, meta: { githubCommitMessage: 'Fix footer', githubCommitRef: 'main' } }] })
  expect(d[0]).toMatchObject({ id: 'd1', state: 'BUILDING', url: 'https://site-abc.vercel.app', branch: 'main' })
  expect(vercelSnapshot(d).sections[0].rows[0]).toMatchObject({ title: 'site', sub: 'main · Fix footer', tone: 'busy', side: 'Building' })
  expect(vercelEvents(d, [{ ...d[0], state: 'ERROR' }])[0]).toMatchObject({ title: 'Deploy failed: site', urgency: 'critical' })
  expect(vercelEvents(d, [{ ...d[0], state: 'READY' }])[0]).toMatchObject({ title: 'Deployed: site', urgency: 'low' })
  expect(vercelEvents(d, d)).toEqual([])
})

test('Stripe: balance, payments, new ones', () => {
  expect(money(124050, 'usd')).toBe('$1,240.50')
  expect(money(500, 'jpy')).toBe('¥500')
  const c = stripeCharges({ data: [{ id: 'ch_1', amount: 4200, currency: 'eur', description: 'Pro plan', created: 1760000000, paid: true, status: 'succeeded' }] })
  expect(c[0]).toMatchObject({ id: 'ch_1', ok: true, at: 1760000000000 })
  const snap = stripeSnapshot({ available: [{ amount: 124050, currency: 'usd' }] }, c)
  expect(snap.big).toEqual({ value: '$1,240.50', label: 'available' })
  expect(snap.sections[0].rows[0].side).toBe('+€42.00')
  expect(stripeEvents([], c)[0]).toMatchObject({ title: '+€42.00', body: 'Pro plan' })
  expect(stripeEvents(null, c)).toEqual([])
})

test('Resend, Notion, Cal.com and n8n', () => {
  const r = resendSnapshot({ data: [{ id: 'e1', to: ['a@b.co'], subject: 'Welcome', created_at: '2026-10-14T09:00:00Z', last_event: 'bounced' }] })
  expect(r.sections[0].rows[0]).toMatchObject({ title: 'Welcome', sub: 'a@b.co', tone: 'bad' })
  expect(notionTitle({ properties: { Name: { type: 'title', title: [{ plain_text: 'Road' }, { plain_text: 'map' }] } } })).toBe('Roadmap')
  expect(notionSnapshot({ results: [{ id: 'p', url: 'https://www.notion.so/p', icon: { type: 'emoji', emoji: '🗺' }, last_edited_time: '2026-10-14T09:00:00Z', properties: { title: { type: 'title', title: [{ plain_text: 'Plan' }] } } }] }).sections[0].rows[0].title).toBe('🗺 Plan')
  const now = Date.parse('2026-10-14T09:00:00Z')
  const cal = calSnapshot({ data: [{ id: 2, title: 'Later', start: '2026-10-15T09:00:00Z' }, { id: 1, title: 'Soon', start: '2026-10-14T10:00:00Z', attendees: [{ name: 'Ann' }] }, { id: 0, title: 'Past', start: '2026-10-13T09:00:00Z' }] }, now)
  expect(cal.sections[0].rows.map((x) => x.title)).toEqual(['Soon', 'Later'])
  expect(cal.sections[0].rows[0].sub).toBe('Ann')
  const ex = n8nExecutions({ data: [{ id: 7, workflowId: 'w1', status: 'error', stoppedAt: '2026-10-14T09:00:00Z' }] })
  expect(n8nSnapshot(ex, { w1: 'Daily digest' }, 'https://n8n.me').sections[0].rows[0]).toMatchObject({ title: 'Daily digest', tone: 'bad', url: 'https://n8n.me/workflow/w1/executions/7' })
  expect(n8nEvents([], ex, { w1: 'Daily digest' }, 'https://n8n.me')[0]).toMatchObject({ title: 'Workflow failed: Daily digest' })
})

test('only the services own links open', () => {
  expect(safeServiceUrl('https://github.com/me/shop/pull/12')).toBe(true)
  expect(safeServiceUrl('https://site-abc.vercel.app')).toBe(true)
  expect(safeServiceUrl('https://evil.example/github.com')).toBe(false)
  expect(safeServiceUrl('javascript:alert(1)')).toBe(false)
  expect(safeServiceUrl('https://n8n.me/workflow/1', 'https://n8n.me')).toBe(true)
  expect(safeServiceUrl('http://localhost:5678/workflow/1', 'http://localhost:5678')).toBe(true)
})
