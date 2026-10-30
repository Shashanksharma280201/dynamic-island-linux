import { phoneApproval, phoneArt, phoneView } from '@shared/phone'
import type { Activity, ToolRequest } from '@shared/types'

const req = (r: Partial<ToolRequest>): ToolRequest => ({ id: 'r1', toolName: 'Bash', inputSummary: '', ...r })

test('approvals as the phone shows them', () => {
  expect(phoneApproval(req({ toolInput: { command: 'rm -rf build' }, cwd: '/home/me/shop', suggestions: [{}] }), 0)).toMatchObject({
    kind: 'claude',
    title: 'Run a command',
    body: 'rm -rf build',
    where: 'shop',
    allow: 'Allow',
    deny: 'Deny',
    canAlways: true,
  })
  const q = phoneApproval(req({ toolName: 'AskUserQuestion', toolInput: { questions: [{ question: 'Which db?', multiSelect: false, options: [{ label: 'Postgres' }, { label: 'SQLite', description: 'simple' }] }] } }), 0)
  expect(q).toMatchObject({ kind: 'question', title: 'Which db?', allow: 'Send', questions: [{ options: [{ label: 'Postgres' }, { label: 'SQLite', description: 'simple' }] }] })
  expect(phoneApproval(req({ toolName: 'ExitPlanMode', toolInput: { plan: '1. do it' } }), 0)).toMatchObject({ kind: 'plan', body: '1. do it', allow: 'Start' })
  expect(phoneApproval(req({ ask: { app: 'WhatsApp', title: 'Send to Alice', body: 'running late' } }), 0)).toMatchObject({ kind: 'agent', app: 'WhatsApp', allow: 'Allow' })
  const trade = phoneApproval(
    req({ connected: { id: 'a', title: 'Buy 19 INFY', subtitle: '₹1,520 each', lines: [{ label: 'Stop', value: '₹1,500', tone: 'down' }], note: 'breakout', approveLabel: 'Buy', rejectLabel: 'Skip', tone: 'up', app: 'Trading', color: '#30d158', deadline: 61_000 } as any }),
    1_000,
  )
  expect(trade).toMatchObject({ kind: 'trade', title: 'Buy 19 INFY', allow: 'Buy', deny: 'Skip', secondsLeft: 60, lines: [{ label: 'Stop', value: '₹1,500', tone: 'down' }] })
})

test('covers the phone can load', () => {
  expect(phoneArt('https://i.scdn.co/image/abc')).toBe('https://i.scdn.co/image/abc')
  expect(phoneArt('file:///home/me/.cache/cover.jpg')).toMatch(/^\/island\/art\?v=/)
  expect(phoneArt('http://insecure/cover.jpg')).toBeUndefined()
  expect(phoneArt(undefined)).toBeUndefined()
})

test('the whole view', () => {
  const activities: Activity[] = [
    { id: 'm', kind: 'media', priority: 1, media: { title: 'Song', artist: 'Band', playing: true, canControl: true } },
    { id: 'r1', kind: 'approval', priority: 10, request: req({ toolInput: { command: 'ls' } }) },
    { id: 'c', kind: 'connected', priority: 2, status: { text: '+₹1,240', short: '+₹1.2k', tone: 'up', detail: '2 open', show: true, app: 'Trading', color: '#30d158' } },
  ]
  const sessions: any[] = [
    { id: 's1', agent: 'claude-code', cwd: '/a', project: 'a', phase: 'done', steps: [], turnSteps: 0, added: 0, removed: 0 },
    { id: 's2', agent: 'claude-code', cwd: '/b', project: 'b', phase: 'working', steps: [{ id: 'x', tool: 'Edit', label: 'Edit app.ts', at: 1, done: false }], turnSteps: 1, added: 3, removed: 1 },
  ]
  const v = phoneView({ name: 'laptop', activities, sessions, center: { entries: [{ id: 'n', at: 5, source: 'notification', app: 'Slack', title: 'Hi', count: 1, seen: false }], unseen: 1, dnd: false }, now: 10 })
  expect(v).toMatchObject({ protocol: 1, name: 'laptop', approvals: [{ id: 'r1', title: 'Run a command' }], media: { title: 'Song', playing: true }, trading: { text: '+₹1,240', tone: 'up' }, dnd: false })
  // Sessions at work first.
  expect(v.sessions.map((s) => s.id)).toEqual(['s2', 's1'])
  expect(v.sessions[0]).toMatchObject({ step: 'Edit app.ts', added: 3 })
  expect(v.notes).toEqual([{ id: 'n', at: 5, app: 'Slack', title: 'Hi', body: undefined, source: 'notification', urgency: undefined }])
})
