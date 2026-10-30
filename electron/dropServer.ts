import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, rm, statfs } from 'node:fs/promises'
import { join } from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import { DROP_PROTOCOL, cleanFileName, freeName, isDropId, parseApproach, validSize, type DropApproach } from '@shared/drop'

export type DropEvents = {
  /** A file is heading for the edge. */
  approach: (a: DropApproach) => void
  /** It went back. */
  cancel: (id: string) => void
  /** Its bytes started coming. */
  start: (id: string, index: number, name: string, size: number) => void
  /** Bytes of this file so far (at most ten times a second). */
  progress: (id: string, index: number, got: number, size: number) => void
  /** Saved, under this path. */
  saved: (id: string, index: number, path: string) => void
  /** It didn't arrive whole. */
  failed: (id: string, why: string) => void
}

type Deps = {
  /** The pairing token ('' refuses everyone). */
  token: () => string
  /** Where files go (created if missing). */
  folder: () => string
  /** This computer's name, for the phone's list. */
  name: () => string
  events: DropEvents
}

const MAX_JSON = 400_000
const MAX_UPLOADS = 4
/** Room left on the disk after a file. */
const SPARE_BYTES = 64 * 1024 * 1024

/**
 * The island's end of Phone Drop: a small HTTP server your phone sends files
 * to, with the pairing token. Files are written next to where they'll live
 * (hidden, .part) and renamed when every byte is there; nothing is
 * overwritten.
 */
export class DropServer {
  private server: Server | null = null
  private uploads = 0
  /** Paths being saved right now: two files with one name get two names. */
  private claimed = new Set<string>()

  constructor(private d: Deps) {}

  get listening(): boolean {
    return !!this.server?.listening
  }

  /** null when listening, else why not. */
  start(port: number, host = '0.0.0.0'): Promise<string | null> {
    this.stop()
    const server = createServer((req, res) => void this.handle(req, res).catch(() => send(res, 500, { ok: false, message: 'Something went wrong on the computer' })))
    server.requestTimeout = 0 // big files take a while
    server.headersTimeout = 20_000
    this.server = server
    return new Promise((resolve) => {
      server.once('error', (e: any) => {
        this.server = null
        resolve(e?.code === 'EADDRINUSE' ? `Port ${port} is already in use` : `Couldn’t listen on port ${port}: ${e?.message ?? e}`)
      })
      server.listen(port, host, () => resolve(null))
    })
  }

  stop(): void {
    this.server?.close()
    this.server?.closeAllConnections()
    this.server = null
  }

  private authorized(req: IncomingMessage): boolean {
    const want = this.d.token()
    const got = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? ''
    if (!want || got.length !== want.length) return false
    return timingSafeEqual(Buffer.from(got), Buffer.from(want))
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://island')
    if (!url.pathname.startsWith('/drop/')) return send(res, 404, { ok: false, message: 'Not here' })
    if (!this.authorized(req)) {
      req.resume()
      return send(res, 401, { ok: false, message: 'This phone isn’t paired with this computer. Scan the QR again.' })
    }
    const route = `${req.method} ${url.pathname}`
    if (route === 'GET /drop/hello') return send(res, 200, { ok: true, protocol: DROP_PROTOCOL, app: 'dynamic-island', name: this.d.name() })
    if (route === 'POST /drop/approach') {
      const a = parseApproach(await readJson(req))
      if (!a) return send(res, 400, { ok: false, message: 'That isn’t a file on its way' })
      this.d.events.approach(a)
      return send(res, 200, { ok: true })
    }
    if (route === 'POST /drop/cancel') {
      const body = await readJson(req)
      if (!isDropId(body?.id)) return send(res, 400, { ok: false, message: 'Which drop?' })
      this.d.events.cancel(body.id)
      return send(res, 200, { ok: true })
    }
    if (route === 'PUT /drop/file') return this.receive(req, res, url)
    req.resume()
    return send(res, 404, { ok: false, message: 'Not here' })
  }

  private async receive(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const id = url.searchParams.get('id')
    const index = Number(url.searchParams.get('index') ?? 0)
    const size = Number(url.searchParams.get('size'))
    const name = cleanFileName(url.searchParams.get('name') ?? '')
    if (!isDropId(id) || !Number.isInteger(index) || index < 0 || index > 99 || !validSize(size)) {
      req.resume()
      return send(res, 400, { ok: false, message: 'That file’s details look wrong' })
    }
    if (this.uploads >= MAX_UPLOADS) {
      req.resume()
      return send(res, 429, { ok: false, message: 'Busy with other files; try again in a moment' })
    }
    const folder = this.d.folder()
    try {
      await mkdir(folder, { recursive: true })
      const fs = await statfs(folder)
      if (fs.bavail * fs.bsize < size + SPARE_BYTES) {
        req.resume()
        return send(res, 507, { ok: false, message: 'Not enough space on the computer for that' })
      }
    } catch {
      req.resume()
      return send(res, 500, { ok: false, message: 'Couldn’t open the folder files go to' })
    }

    this.uploads++
    const part = join(folder, `.${id}-${index}.island-drop.part`)
    const out = createWriteStream(part, { flags: 'w', mode: 0o644 })
    let got = 0
    let last = 0
    let broken: string | null = null
    this.d.events.start(id, index, name, size)
    const finish = async (status: number, body: object, why?: string) => {
      this.uploads--
      if (why) {
        await rm(part, { force: true }).catch(() => {})
        this.d.events.failed(id, why)
      }
      send(res, status, body)
    }
    req.on('data', (chunk: Buffer) => {
      got += chunk.length
      if (got > size && !broken) {
        broken = 'It was bigger than it said'
        req.unpipe(out)
        out.destroy()
        req.resume()
      }
      const now = Date.now()
      if (now - last > 100) {
        last = now
        this.d.events.progress(id, index, Math.min(got, size), size)
      }
    })
    req.on('aborted', () => (broken ||= 'The phone stopped sending'))
    out.on('error', () => (broken ||= 'Couldn’t write it to the disk'))
    req.pipe(out)
    await new Promise<void>((done) => {
      let settled = false
      const end = () => !settled && ((settled = true), done())
      out.on('close', end)
      out.on('error', end)
      req.on('close', () => {
        if (!req.complete) broken ||= 'The phone stopped sending'
        if (broken) out.destroy()
      })
    })
    if (broken) return finish(400, { ok: false, message: broken }, broken)
    if (got !== size) return finish(400, { ok: false, message: 'It didn’t arrive whole' }, 'It didn’t arrive whole')
    this.d.events.progress(id, index, size, size)
    const path = join(folder, freeName(name, (n) => existsSync(join(folder, n)) || this.claimed.has(join(folder, n))))
    this.claimed.add(path)
    try {
      await rename(part, path)
    } catch {
      return finish(500, { ok: false, message: 'Couldn’t save it' }, 'Couldn’t save it')
    } finally {
      this.claimed.delete(path)
    }
    this.d.events.saved(id, index, path)
    return finish(200, { ok: true, name: path.split(/[\\/]/).pop() })
  }
}

function send(res: ServerResponse, status: number, body: object): void {
  if (res.headersSent) return
  const data = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Cache-Control': 'no-store' })
  res.end(data)
}

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_JSON) {
        req.destroy()
        resolve(null)
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}
