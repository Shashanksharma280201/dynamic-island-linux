// A stand-in Day-Trading engine for e2e/connected.cjs: speaks the island view
// protocol (manifest, view stream, answers, actions) with token "good-token".
// The test drives it through /__control/*.
const http = require('http')

const TOKEN = 'good-token'
const clients = new Set()
const posts = []
let view = {
  protocol: 1,
  updated_at: Date.now(),
  status: { text: '₹0.00', short: '₹0', tone: 'neutral', detail: '0 open · 0 trades · PAPER', show: false },
  asks: [],
  sections: [{ type: 'note', text: 'Waiting for the market' }],
}
const manifest = (port) => ({
  protocol: 1,
  id: 'trading',
  name: 'Trading',
  color: '#22c55e',
  description: 'Fake engine',
  permissions: ['Reads positions'],
  tab_title: 'Trading',
  phone_url: `http://127.0.0.1:${port}`,
  pairing_link: `daytrader://pair?url=http%3A%2F%2F127.0.0.1%3A${port}&token=${TOKEN}`,
})
const send = (res, type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, data })}\n\n`)
const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}
const body = (req) => new Promise((r) => {
  let b = ''
  req.on('data', (d) => (b += d))
  req.on('end', () => r(b ? JSON.parse(b) : {}))
})

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname.startsWith('/__control/')) {
    const what = url.pathname.slice(11)
    if (what === 'posts') return json(res, 200, posts)
    const b = await body(req)
    if (what === 'view') {
      view = { ...view, ...b, updated_at: Date.now() }
      for (const c of clients) send(c, 'view', view)
    }
    if (what === 'notify') for (const c of clients) send(c, 'notify', b)
    return json(res, 200, { ok: true })
  }
  if ((req.headers.authorization || '') !== `Bearer ${TOKEN}`) return json(res, 401, { ok: false })
  if (url.pathname === '/island/manifest') return json(res, 200, manifest(server.address().port))
  if (url.pathname === '/island/view') return json(res, 200, view)
  if (url.pathname === '/island/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' })
    clients.add(res)
    send(res, 'view', view)
    req.on('close', () => clients.delete(res))
    return
  }
  if (req.method === 'POST' && (url.pathname === '/island/answer' || url.pathname === '/island/action')) {
    const b = await body(req)
    posts.push({ path: url.pathname, body: b })
    return json(res, 200, { ok: true, message: url.pathname === '/island/answer' ? 'filled 19 @ 1002.71' : 'No new trades today' })
  }
  json(res, 404, { ok: false })
})
server.listen(0, '127.0.0.1', () => console.log(`fake engine port ${server.address().port}`))
