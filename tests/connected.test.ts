import {
  askIdOf,
  askRequest,
  cleanUrl,
  createSseParser,
  parseConnectedConfig,
  parseManifest,
  parseNotify,
  parseView,
  secondsLeft,
  viewText,
} from '../shared/connected'
import { ConnectedHub, connectedError, syncActivities } from '../electron/connected'
import { ActivityStore } from '../electron/store'
import { present } from '../shared/present'

const MANIFEST = { protocol: 1, id: 'trading', name: 'Trading', color: '#22c55e', description: 'd', permissions: ['p'], tab_title: 'Trading', phone_url: 'http://100.64.0.1:8765', pairing_link: 'daytrader://pair?url=x&token=y' }

const VIEW = {
  protocol: 1,
  updated_at: 1,
  status: { text: '+₹1,240.00', short: '+1.2k', tone: 'up', detail: '1 open · 2 trades · PAPER', show: true },
  asks: [
    {
      id: '97d851f4',
      title: 'Buy 19 INFY',
      subtitle: 'INFY · 09:31',
      lines: [
        { label: 'Price', value: '~₹1,002.51' },
        { label: 'Risk', value: '₹139.46', tone: 'down' },
      ],
      note: 'ORB long',
      approve_label: 'Buy',
      reject_label: 'Skip',
      seconds_left: 58,
      expires_at: 0,
      tone: 'up',
    },
  ],
  sections: [
    { type: 'stats', items: [{ label: 'Today', value: '+₹1,240.00', tone: 'up' }] },
    { type: 'list', title: 'Open positions', empty: 'None', rows: [{ title: 'Long 19 INFY', subtitle: 'in ₹1,003', value: '+₹20.00', tone: 'up' }] },
    { type: 'actions', actions: [{ id: 'stop_today', label: 'Stop trading today', style: 'danger', confirm: 'Sure?' }] },
    { type: 'note', text: 'Strategy ORB' },
  ],
}

test('addresses: http(s) only, no credentials, no trailing slash', () => {
  expect(cleanUrl('http://127.0.0.1:8765/')).toBe('http://127.0.0.1:8765')
  expect(cleanUrl(' https://box.tail1234.ts.net ')).toBe('https://box.tail1234.ts.net')
  expect(cleanUrl('file:///etc/passwd')).toBe('')
  expect(cleanUrl('http://user:pw@host')).toBe('')
  expect(cleanUrl('javascript:alert(1)')).toBe('')
  expect(parseConnectedConfig({ on: true, url: 'http://127.0.0.1:8765/', secret: 'enc' })).toEqual({ on: true, url: 'http://127.0.0.1:8765', secret: 'enc' })
  expect(parseConnectedConfig(null)).toEqual({ on: false, url: '', secret: '' })
})

test('manifest: checked, and the wrong protocol is refused', () => {
  const m = parseManifest(MANIFEST)!
  expect(m).toMatchObject({ id: 'trading', name: 'Trading', tabTitle: 'Trading', phoneUrl: 'http://100.64.0.1:8765', pairingLink: 'daytrader://pair?url=x&token=y' })
  expect(parseManifest({ ...MANIFEST, protocol: 2 })).toBeNull()
  expect(parseManifest({ ...MANIFEST, id: 'Bad Id!' })).toBeNull()
  expect(parseManifest({ ...MANIFEST, color: 'red;background:url(x)' })!.color).toBe('#30d158')
  expect(parseManifest({ ...MANIFEST, pairing_link: 'https://evil' })!.pairingLink).toBeUndefined()
})

test('view: shapes are checked, junk is dropped, sizes are capped', () => {
  const v = parseView(VIEW)!
  expect(v.status).toMatchObject({ text: '+₹1,240.00', short: '+1.2k', tone: 'up', show: true })
  expect(v.asks[0]).toMatchObject({ id: '97d851f4', approveLabel: 'Buy', rejectLabel: 'Skip', secondsLeft: 58, tone: 'up' })
  expect(v.sections.map((s) => s.type)).toEqual(['stats', 'list', 'actions', 'note'])
  const junk = parseView({
    ...VIEW,
    status: { text: 'x'.repeat(500), tone: 'rainbow', show: true },
    asks: [{ id: '../../x', title: 'bad' }, { id: 'ok1', title: 'Fine', seconds_left: 1e9 }, { id: 'ok1', title: 'Duplicate' }],
    sections: [{ type: 'html', html: '<script>' }, { type: 'actions', actions: [{ id: 'Bad Id', label: 'x' }] }],
  })!
  expect(junk.status.text.length).toBe(40)
  expect(junk.status.tone).toBe('neutral')
  expect(junk.asks.map((a) => a.id)).toEqual(['ok1'])
  expect(junk.asks[0].secondsLeft).toBe(3600)
  expect(junk.sections).toEqual([])
  expect(parseView({ ...VIEW, protocol: 9 })).toBeNull()
  expect(parseView({ ...VIEW, status: { ...VIEW.status, text: '' } })!.status.show).toBe(false)
  expect(parseNotify({ title: 'INFY closed: +₹6.30', body: 'target hit', urgency: 'whatever' })).toEqual({ title: 'INFY closed: +₹6.30', body: 'target hit', urgency: 'normal' })
  expect(parseNotify({})).toBeNull()
})

test('the event stream parser handles split chunks, comments and CRLF', () => {
  const parse = createSseParser()
  expect(parse('event: view\ndata: {"a"')).toEqual([])
  expect(parse(':1}\n\n: keepalive\n\nevent: notify\r\ndata: {"b":2}\r\n\r\n')).toEqual([
    { event: 'view', data: '{"a":1}' },
    { event: 'notify', data: '{"b":2}' },
  ])
  expect(parse('data: line1\ndata: line2\n\n')).toEqual([{ event: 'message', data: 'line1\nline2' }])
  const small = createSseParser(10)
  small('data: ' + 'x'.repeat(50))
  expect(small('\n\ndata: ok\n\n')).toEqual([{ event: 'message', data: 'ok' }])
})

test('asks become approval cards and follow the view', () => {
  const store = new ActivityStore()
  const deadlines = new Map<string, number>()
  const m = parseManifest(MANIFEST)!
  const v = parseView(VIEW)!
  syncActivities(v, m, store, deadlines, 1_000_000)
  const card = store.list().find((a) => a.kind === 'approval')!
  expect(card.id).toBe('connected-ask-97d851f4')
  expect(card.kind === 'approval' && card.request.connected).toMatchObject({ title: 'Buy 19 INFY', app: 'Trading', deadline: 1_000_000 + 58_000 })
  expect(store.list().find((a) => a.kind === 'connected')).toMatchObject({ id: 'connected-status', status: { text: '+₹1,240.00', app: 'Trading' } })
  // The approval shows first, as a card.
  expect(present(store.list(), { expanded: false })).toMatchObject({ mode: 'expanded', primary: { id: 'connected-ask-97d851f4' } })
  // A later view keeps the first deadline (no countdown reset every second).
  syncActivities(parseView({ ...VIEW, asks: [{ ...VIEW.asks[0], seconds_left: 50 }] })!, m, store, deadlines, 1_005_000)
  const again = store.list().find((a) => a.kind === 'approval')!
  expect(again.kind === 'approval' && again.request.connected!.deadline).toBe(1_058_000)
  // Answered or expired: the card goes; nothing to watch: the capsule goes too.
  syncActivities(parseView({ ...VIEW, asks: [], status: { ...VIEW.status, show: false } })!, m, store, deadlines, 1_010_000)
  expect(store.list()).toEqual([])
  expect(deadlines.size).toBe(0)
  // Only the capsule: a compact pill.
  syncActivities(parseView({ ...VIEW, asks: [] })!, m, store, deadlines, 1_010_000)
  expect(present(store.list(), { expanded: false })).toMatchObject({ mode: 'compact', primary: { kind: 'connected' } })
  // Disconnected: everything goes.
  syncActivities(null, null, store, deadlines, 1_020_000)
  expect(store.list()).toEqual([])
})

test('card helpers', () => {
  const req = askRequest(parseView(VIEW)!.asks[0], { name: 'Trading', color: '#22c55e' }, 5000)
  expect(askIdOf(req.id)).toBe('97d851f4')
  expect(askIdOf('agent-ask-1')).toBeNull()
  expect(secondsLeft(5000, 2100)).toBe(3)
  expect(secondsLeft(5000, 9000)).toBe(0)
  const text = viewText(parseManifest(MANIFEST)!, parseView(VIEW)!, 'live')
  expect(text).toContain('Trading: +₹1,240.00')
  expect(text).toContain('only the user can answer')
  expect(text).toContain('Open positions: Long 19 INFY')
  expect(viewText(undefined, undefined, 'off')).toMatch(/No connected package/)
  expect(connectedError({ status: 401 })).toMatch(/token/)
  expect(connectedError(new Error('fetch failed'))).toMatch(/Is the engine running/)
})

/** A stand-in engine: answers the manifest, streams views, records POSTs. */
function fakeEngine(o: { status?: number } = {}) {
  const posts: { path: string; body: any; auth: string }[] = []
  let push: ((s: string) => void) | null = null
  let close: (() => void) | null = null
  const enc = new TextEncoder()
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname
    const auth = (init.headers as Record<string, string>)?.Authorization ?? ''
    if (o.status) return new Response('{}', { status: o.status })
    if (auth !== 'Bearer tok') return new Response('{}', { status: 401 })
    if (path === '/island/manifest') return Response.json(MANIFEST)
    if (path === '/island/events') {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          push = (s) => c.enqueue(enc.encode(s))
          close = () => c.close()
          init.signal?.addEventListener('abort', () => {
            try {
              c.error(new DOMException('aborted', 'AbortError'))
            } catch {
              // already closed
            }
          })
        },
      })
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
    }
    if (init.method === 'POST') {
      posts.push({ path, body: JSON.parse(String(init.body)), auth })
      return Response.json({ ok: true, message: 'filled 19 @ 1003.15' })
    }
    return new Response('{}', { status: 404 })
  }) as unknown as typeof fetch
  return { fetchFn, posts, push: (s: string) => push?.(s), close: () => close?.() }
}

const until = async (ok: () => boolean) => {
  for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 10))
  expect(ok()).toBe(true)
}

test('the hub follows the stream, raises notifications, and answers', async () => {
  const eng = fakeEngine()
  const views: unknown[] = []
  const notes: string[] = []
  const phases: string[] = []
  const hub: ConnectedHub = new ConnectedHub({
    config: () => ({ on: true, url: 'http://127.0.0.1:8765', secret: 'x' }),
    token: () => 'tok',
    onChange: () => phases.push(hub.view().phase),
    onView: (v) => views.push(v),
    onNotify: (n) => notes.push(n.title),
    fetch: eng.fetchFn,
    sleep: () => new Promise((r) => setTimeout(r, 1)),
  })
  hub.start()
  await until(() => hub.view().phase === 'connecting' && !!hub.view().manifest)
  eng.push(`event: view\ndata: ${JSON.stringify({ type: 'view', data: VIEW })}\n\n`)
  eng.push(`event: notify\ndata: ${JSON.stringify({ type: 'notify', data: { title: 'Bought 19 INFY', body: '', urgency: 'normal' } })}\n\n`)
  await until(() => hub.view().phase === 'live' && notes.length === 1)
  expect(hub.view().view!.asks[0].id).toBe('97d851f4')
  expect(notes).toEqual(['Bought 19 INFY'])
  expect(await hub.answer('97d851f4', true)).toEqual({ ok: true, message: 'filled 19 @ 1003.15' })
  expect(eng.posts[0]).toEqual({ path: '/island/answer', body: { ask_id: '97d851f4', answer: 'approve', device: 'island' }, auth: 'Bearer tok' })
  await hub.action('stop_today')
  expect(eng.posts[1].body).toEqual({ action_id: 'stop_today', device: 'island' })
  // The engine stops: the island drops its cards and says why.
  eng.close()
  await until(() => phases.includes('error'))
  expect(hub.view().error ?? 'reconnected').toBeTruthy()
  expect(views).toContain(null)
  hub.stop()
})

test('verify: a wrong token or address is caught before saving', async () => {
  const hub = new ConnectedHub({ config: () => ({ on: false, url: '', secret: '' }), token: () => '', onChange: () => {}, onView: () => {}, onNotify: () => {}, fetch: fakeEngine().fetchFn })
  expect(await hub.verify('http://127.0.0.1:8765', 'tok')).toBeNull()
  expect(await hub.verify('http://127.0.0.1:8765', 'wrong')).toMatch(/token/)
  expect(await hub.verify('not an address', 'tok')).toMatch(/address/)
  const off = new ConnectedHub({ config: () => ({ on: false, url: '', secret: '' }), token: () => '', onChange: () => {}, onView: () => {}, onNotify: () => {}, fetch: fakeEngine({ status: 404 }).fetchFn })
  expect(await off.verify('http://127.0.0.1:9', 'tok')).toMatch(/404/)
})
