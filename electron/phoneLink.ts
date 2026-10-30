import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { randomBytes } from 'node:crypto'
import { cleanDevice, dropKind, isDropId } from '@shared/drop'
import type { PhoneCallResult, PhoneIncoming, PhoneTopic, PhoneView } from '@shared/phone'
import type { DecisionMsg, MediaCmd } from '@shared/types'
import { parseDecisionMsg, parseMediaCmd } from './ipc'

type Deps = {
  /** What the phone shows now. */
  view: () => PhoneView
  /** Answer an approval, as a click on the island would. */
  decide: (m: DecisionMsg) => void
  media: (cmd: MediaCmd) => void
  /** What's playing's cover, when it's a file on this computer. */
  art: () => Promise<{ bytes: Buffer; type: string } | null>
  /** A file the computer sent has reached the phone (or didn't). */
  delivered: (id: string, ok: boolean, device: string) => void
  /** Bytes of a file the phone is taking, so far. */
  progress?: (id: string, got: number, size: number) => void
  /** A phone connected or went away. */
  onPhones?: () => void
  /** One of the island's own functions, for the phone (checked there). */
  call?: (fn: unknown, args: unknown) => Promise<PhoneCallResult & { status: number }>
}

type Phone = { res: ServerResponse; device: string; since: number }
type Outgoing = PhoneIncoming & { path: string }

const KEEPALIVE_MS = 15_000
/** Pushes of one topic come at most this often (the latest wins): Claude streams its reply. */
const PUSH_MS = 200
/** A file nobody fetched is forgotten after this long. */
const OUT_MS = 15 * 60_000

async function json(req: IncomingMessage, max = 200_000): Promise<any> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > max) return null
    chunks.push(c as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}

function send(res: ServerResponse, status: number, body: object): void {
  if (res.headersSent) return
  const data = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Cache-Control': 'no-store' })
  res.end(data)
}

/**
 * The island on your phone: a live stream of what it shows (approvals,
 * what's playing, sessions, notifications) and the phone's answers, over
 * the Phone Drop server and its token. Files the computer sends wait here
 * for the phone to fetch them.
 */
export class PhoneLink {
  private phones = new Set<Phone>()
  private outgoing = new Map<string, Outgoing>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private keepalive: ReturnType<typeof setInterval> | null = null
  private pushes = new Map<PhoneTopic, unknown>()
  private pushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private d: Deps) {}

  /** Something the island's window was told (Claude's reply so far, new mail…): the phone hears it too. */
  push(topic: PhoneTopic, data: unknown): void {
    if (!this.phones.size) return
    this.pushes.set(topic, data)
    this.pushTimer ??= setTimeout(() => {
      this.pushTimer = null
      for (const [t, d] of this.pushes) this.broadcast('push', { topic: t, data: d ?? null })
      this.pushes.clear()
    }, PUSH_MS)
  }

  /** The phones listening now (one entry per phone name). */
  connected(): { device: string; since: number }[] {
    const by = new Map<string, number>()
    for (const p of this.phones) by.set(p.device, Math.min(by.get(p.device) ?? Infinity, p.since))
    return [...by].map(([device, since]) => ({ device, since }))
  }

  /** Something the phone shows changed: send the new view soon (changes come in bursts). */
  changed(): void {
    if (!this.phones.size || this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.broadcast('view', this.d.view())
    }, 120)
  }

  /** Send a file to the phone: it hears about it now and fetches it. False if no phone is listening. */
  offer(path: string, size: number, side: PhoneIncoming['side'], thumb?: string): string | null {
    if (!this.phones.size) return null
    const id = `out${Date.now().toString(36)}${randomBytes(4).toString('hex')}`
    const name = basename(path)
    const out: Outgoing = { id, name, size, kind: dropKind(name), thumb, side, at: Date.now(), path }
    this.outgoing.set(id, out)
    setTimeout(() => this.outgoing.delete(id), OUT_MS)
    const { path: _p, ...incoming } = out
    this.broadcast('incoming', incoming)
    return id
  }

  private broadcast(event: string, data: unknown): void {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const p of this.phones) p.res.write(msg)
  }

  stop(): void {
    for (const p of this.phones) p.res.end()
    this.phones.clear()
    if (this.keepalive) clearInterval(this.keepalive)
    this.keepalive = null
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = null
    this.pushes.clear()
  }

  /** Requests for /island/… and /drop/out/…, already authorized. True if it was one of ours. */
  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const route = `${req.method} ${url.pathname}`
    const device = cleanDevice(req.headers['x-island-device'] ?? url.searchParams.get('device'))
    if (route === 'GET /island/view') {
      send(res, 200, this.d.view())
      return true
    }
    if (route === 'GET /island/events') {
      this.listen(req, res, device)
      return true
    }
    if (route === 'POST /island/decide') {
      const m = parseDecisionMsg(await json(req))
      const ask = m && this.d.view().approvals.find((a) => a.id === m.id)
      if (!m || !ask) {
        send(res, 404, { ok: false, message: 'That was already answered' })
        return true
      }
      if (ask.kind === 'question' && m.decision === 'allow' && !m.answers) {
        send(res, 400, { ok: false, message: 'Pick an answer first' })
        return true
      }
      if (ask.kind === 'trade' && m.decision === 'ask') {
        send(res, 400, { ok: false, message: 'Approve or reject it' })
        return true
      }
      this.d.decide(m)
      send(res, 200, { ok: true })
      this.changed()
      return true
    }
    if (route === 'POST /island/call' && this.d.call) {
      const body = await json(req, 400_000)
      const r = await this.d.call(body?.fn, body?.args)
      const { status, ...reply } = r
      send(res, status, reply)
      // Answers and changes show on the phone at once.
      this.changed()
      return true
    }
    if (route === 'POST /island/media') {
      const body = await json(req, 2000)
      const cmd = parseMediaCmd(body?.cmd)
      if (!cmd) {
        send(res, 400, { ok: false, message: 'Unknown command' })
        return true
      }
      this.d.media(cmd)
      send(res, 200, { ok: true })
      return true
    }
    if (route === 'GET /island/art') {
      const art = await this.d.art().catch(() => null)
      if (!art) {
        send(res, 404, { ok: false, message: 'No cover' })
        return true
      }
      res.writeHead(200, { 'Content-Type': art.type, 'Content-Length': art.bytes.length, 'Cache-Control': 'max-age=300' })
      res.end(art.bytes)
      return true
    }
    const out = /^\/drop\/out\/([^/]+)(\/done)?$/.exec(url.pathname)
    if (out && isDropId(out[1])) {
      const o = this.outgoing.get(out[1])
      if (!o) {
        send(res, 404, { ok: false, message: 'That file isn’t waiting any more' })
        return true
      }
      if (req.method === 'POST' && out[2]) {
        const body = await json(req, 2000)
        this.outgoing.delete(o.id)
        this.d.delivered(o.id, body?.ok !== false, device)
        send(res, 200, { ok: true })
        return true
      }
      if (req.method === 'GET' && !out[2]) {
        await this.serve(o, res)
        return true
      }
    }
    return false
  }

  private listen(req: IncomingMessage, res: ServerResponse, device: string): void {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    res.write('retry: 3000\n\n')
    const phone: Phone = { res, device, since: Date.now() }
    this.phones.add(phone)
    this.d.onPhones?.()
    res.write(`event: view\ndata: ${JSON.stringify(this.d.view())}\n\n`)
    // Files offered while it was away (it reconnected).
    for (const o of this.outgoing.values()) {
      const { path: _p, ...incoming } = o
      res.write(`event: incoming\ndata: ${JSON.stringify(incoming)}\n\n`)
    }
    this.keepalive ??= setInterval(() => {
      for (const p of this.phones) p.res.write(': keepalive\n\n')
    }, KEEPALIVE_MS)
    req.on('close', () => {
      this.phones.delete(phone)
      this.d.onPhones?.()
      if (!this.phones.size && this.keepalive) {
        clearInterval(this.keepalive)
        this.keepalive = null
      }
    })
  }

  private async serve(o: Outgoing, res: ServerResponse): Promise<void> {
    const st = await stat(o.path).catch(() => null)
    if (!st || !st.isFile()) {
      send(res, 410, { ok: false, message: 'The file is gone from the computer' })
      return
    }
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': st.size,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(o.name)}`,
      'Cache-Control': 'no-store',
    })
    let got = 0
    let last = 0
    const stream = createReadStream(o.path)
    stream.on('data', (c) => {
      got += c.length
      const now = Date.now()
      if (now - last > 120) {
        last = now
        this.d.progress?.(o.id, got, st.size)
      }
    })
    await new Promise<void>((done) => {
      stream.on('end', done)
      stream.on('error', () => {
        res.destroy()
        done()
      })
      res.on('close', () => {
        stream.destroy()
        done()
      })
      stream.pipe(res)
    })
  }
}
