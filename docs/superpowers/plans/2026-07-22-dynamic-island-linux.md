# Dynamic Island for Linux — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Mac-style Dynamic Island for Ubuntu (X11 + GNOME): a frameless, transparent, always-on-top Electron widget that morphs with spring physics and surfaces live media (MPRIS) + interactive Claude Code approvals.

**Architecture:** Electron main process owns the transparent always-on-top window, a priority activity store, and two providers (MPRIS media over D-Bus, Claude approvals over a unix socket). A React + Framer Motion renderer draws the morphing island and sends user actions back over IPC. A standalone Node hook script bridges Claude Code's `PreToolUse` hook to the socket.

**Tech Stack:** Electron, TypeScript, React, Framer Motion, electron-vite, dbus-next, vitest. Node 24.

## Global Constraints

- Platform: X11 + GNOME (Ubuntu). Do **not** add Wayland-only APIs.
- No dependency on `playerctl`; media uses `dbus-next` directly.
- Window is never resized to morph — the OS window is fixed & transparent; only in-DOM elements animate.
- Hook must **fail open**: if the island is unreachable or the user does not respond within 30s, emit `permissionDecision: "ask"` (never block Claude, never hard allow/deny).
- All shared message shapes live in `shared/types.ts` and are imported by both processes and the hook.
- Pure logic (store, MPRIS parsing, wire-protocol) is unit-tested with vitest before wiring into Electron.
- TDD: failing test → run (fail) → minimal impl → run (pass) → commit.

---

## File Structure

- `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `vitest.config.ts` — project config
- `shared/types.ts` — `Activity`, `Decision`, IPC channel names, socket message shapes
- `shared/protocol.ts` — encode/decode framing for the unix socket (newline-delimited JSON)
- `electron/store.ts` — `ActivityStore`: add/remove/resolve activities, priority selection
- `electron/providers/media.ts` — MPRIS subscription + metadata parsing (`parseMprisMetadata` is pure & exported)
- `electron/providers/claude.ts` — unix socket server, emits approval activities, resolves decisions
- `electron/window.ts` — create/position the transparent always-on-top window + mouse passthrough
- `electron/main.ts` — app entry; wires store + providers + IPC + window
- `electron/ipc.ts` — main-side IPC handlers/emitters
- `renderer/index.html`, `renderer/main.tsx`, `renderer/App.tsx`
- `renderer/anim/spring.ts` — shared spring config
- `renderer/island/Island.tsx` — morph container + state machine
- `renderer/island/states/{IdlePill,MediaCard,ApprovalCard}.tsx`
- `renderer/preload.ts` — contextBridge exposing the IPC surface
- `hook/claude-island-hook.js` — the `PreToolUse` hook script
- `hook/README.md` — install instructions
- Tests: `tests/store.test.ts`, `tests/media.test.ts`, `tests/protocol.test.ts`, `tests/claude-server.test.ts`

---

## Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `electron.vite.config.ts`, `shared/types.ts`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: build/test scripts (`npm test`, `npm run dev`), and the `Activity`/`Decision` types other tasks import.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "dynamic-island-linux",
  "version": "0.1.0",
  "description": "Mac-style Dynamic Island for Linux (X11 + GNOME)",
  "main": "out/main/main.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-vite": "^2.3.0",
    "vite": "^5.4.0",
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vitest": "^2.1.0"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "framer-motion": "^11.11.0",
    "dbus-next": "^0.10.2"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node", "vitest/globals"],
    "baseUrl": ".",
    "paths": { "@shared/*": ["shared/*"] }
  },
  "include": ["electron", "renderer", "shared", "tests"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@shared': new URL('./shared', import.meta.url).pathname } },
})
```

- [ ] **Step 4: Write `electron.vite.config.ts`**

```ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: { build: { rollupOptions: { input: resolve('electron/main.ts') } } },
  preload: { build: { rollupOptions: { input: resolve('electron/preload.ts') } } },
  renderer: {
    root: 'renderer',
    plugins: [react()],
    resolve: { alias: { '@shared': resolve('shared') } },
    build: { rollupOptions: { input: resolve('renderer/index.html') } },
  },
})
```

- [ ] **Step 5: Write `shared/types.ts`**

```ts
export type ToolRequest = {
  id: string
  toolName: string
  inputSummary: string
  cwd?: string
}

export type Decision = 'allow' | 'deny' | 'ask'

export type MediaState = {
  title: string
  artist: string
  artUrl?: string
  playing: boolean
  canControl: boolean
}

export type Activity =
  | { kind: 'media'; id: string; priority: number; media: MediaState }
  | { kind: 'approval'; id: string; priority: number; request: ToolRequest }

export const IPC = {
  STATE: 'island:state',        // main -> renderer: Activity[]
  DECISION: 'island:decision',  // renderer -> main: { id, decision }
  MEDIA_CMD: 'island:media-cmd',// renderer -> main: 'playpause'|'next'|'previous'
  SET_HOVER: 'island:set-hover',// renderer -> main: boolean (mouse passthrough)
} as const

export type DecisionMsg = { id: string; decision: Decision }
export type MediaCmd = 'playpause' | 'next' | 'previous'
```

- [ ] **Step 6: Write `tests/smoke.test.ts`**

```ts
import { IPC } from '@shared/types'
test('IPC channels are defined', () => {
  expect(IPC.STATE).toBe('island:state')
  expect(IPC.DECISION).toBe('island:decision')
})
```

- [ ] **Step 7: Install deps and run the test**

Run: `npm install && npm test`
Expected: 1 passing test (`tests/smoke.test.ts`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron-vite + vitest project"
```

---

## Task 2: Activity store with priority

**Files:**
- Create: `electron/store.ts`
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: `Activity` from `@shared/types`.
- Produces:
  - `class ActivityStore` with:
    - `upsert(a: Activity): void`
    - `remove(id: string): void`
    - `list(): Activity[]` (all, unsorted-insertion order)
    - `presented(): Activity | null` (highest `priority`; ties → most recently upserted)
    - `onChange(cb: () => void): void`

- [ ] **Step 1: Write the failing test**

```ts
import { ActivityStore } from '../electron/store'
import type { Activity } from '@shared/types'

const media: Activity = { kind: 'media', id: 'm1', priority: 1,
  media: { title: 'Song', artist: 'Artist', playing: true, canControl: true } }
const approval: Activity = { kind: 'approval', id: 'a1', priority: 10,
  request: { id: 'a1', toolName: 'Bash', inputSummary: 'rm -rf' } }

test('presented() returns highest priority activity', () => {
  const s = new ActivityStore()
  s.upsert(media)
  s.upsert(approval)
  expect(s.presented()?.id).toBe('a1')
  s.remove('a1')
  expect(s.presented()?.id).toBe('m1')
})

test('onChange fires on upsert and remove', () => {
  const s = new ActivityStore()
  let n = 0
  s.onChange(() => { n++ })
  s.upsert(media)
  s.remove('m1')
  expect(n).toBe(2)
})

test('upsert replaces same id', () => {
  const s = new ActivityStore()
  s.upsert(media)
  s.upsert({ ...media, media: { ...media.media, title: 'New' } })
  expect(s.list().length).toBe(1)
  expect(s.list()[0].kind === 'media' && s.list()[0].media.title).toBe('New')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store.test.ts`
Expected: FAIL — cannot find module `../electron/store`.

- [ ] **Step 3: Implement `electron/store.ts`**

```ts
import type { Activity } from '@shared/types'

export class ActivityStore {
  private items: Activity[] = []
  private seq = 0
  private order = new Map<string, number>()
  private cbs: Array<() => void> = []

  upsert(a: Activity): void {
    const i = this.items.findIndex((x) => x.id === a.id)
    if (i >= 0) this.items[i] = a
    else this.items.push(a)
    this.order.set(a.id, this.seq++)
    this.emit()
  }

  remove(id: string): void {
    const i = this.items.findIndex((x) => x.id === id)
    if (i < 0) return
    this.items.splice(i, 1)
    this.order.delete(id)
    this.emit()
  }

  list(): Activity[] {
    return [...this.items]
  }

  presented(): Activity | null {
    if (this.items.length === 0) return null
    return [...this.items].sort((a, b) =>
      b.priority - a.priority ||
      (this.order.get(b.id)! - this.order.get(a.id)!),
    )[0]
  }

  onChange(cb: () => void): void {
    this.cbs.push(cb)
  }

  private emit(): void {
    for (const cb of this.cbs) cb()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/store.test.ts`
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add electron/store.ts tests/store.test.ts
git commit -m "feat: activity store with priority selection"
```

---

## Task 3: Socket wire-protocol (framing)

**Files:**
- Create: `shared/protocol.ts`
- Test: `tests/protocol.test.ts`

**Interfaces:**
- Produces:
  - `encode(msg: object): string` — returns one JSON line ending in `\n`.
  - `createDecoder(): (chunk: Buffer | string) => object[]` — accumulates partial chunks, returns complete messages parsed from newline-delimited JSON.

- [ ] **Step 1: Write the failing test**

```ts
import { encode, createDecoder } from '@shared/protocol'

test('encode ends with newline and round-trips', () => {
  const line = encode({ a: 1 })
  expect(line.endsWith('\n')).toBe(true)
  const decode = createDecoder()
  expect(decode(line)).toEqual([{ a: 1 }])
})

test('decoder handles split and multiple messages', () => {
  const decode = createDecoder()
  expect(decode('{"a":1}\n{"b":')).toEqual([{ a: 1 }])
  expect(decode('2}\n')).toEqual([{ b: 2 }])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/protocol.test.ts`
Expected: FAIL — cannot find module `@shared/protocol`.

- [ ] **Step 3: Implement `shared/protocol.ts`**

```ts
export function encode(msg: object): string {
  return JSON.stringify(msg) + '\n'
}

export function createDecoder(): (chunk: Buffer | string) => object[] {
  let buf = ''
  return (chunk) => {
    buf += chunk.toString()
    const out: object[] = []
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx)
      buf = buf.slice(idx + 1)
      if (line.trim()) out.push(JSON.parse(line))
    }
    return out
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/protocol.test.ts`
Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add shared/protocol.ts tests/protocol.test.ts
git commit -m "feat: newline-delimited JSON wire protocol"
```

---

## Task 4: Claude approval socket server

**Files:**
- Create: `electron/providers/claude.ts`
- Test: `tests/claude-server.test.ts`

**Interfaces:**
- Consumes: `encode`/`createDecoder` from `@shared/protocol`; `ToolRequest`, `Decision` from `@shared/types`.
- Produces:
  - `class ClaudeServer`:
    - `constructor(socketPath: string)`
    - `start(): Promise<void>` — begins listening.
    - `onRequest(cb: (req: ToolRequest) => void): void` — fired when a hook connects with a tool request.
    - `resolve(id: string, decision: Decision): void` — sends decision back to the waiting hook and closes its connection.
    - `stop(): Promise<void>`
  - Hook → server message: `{ type: 'request', request: ToolRequest }`
  - Server → hook message: `{ type: 'decision', id: string, decision: Decision }`

- [ ] **Step 1: Write the failing test**

```ts
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClaudeServer } from '../electron/providers/claude'
import { encode, createDecoder } from '@shared/protocol'
import type { ToolRequest } from '@shared/types'

test('server receives request and returns decision to client', async () => {
  const sock = join(tmpdir(), `di-test-${process.pid}.sock`)
  const server = new ClaudeServer(sock)
  let got: ToolRequest | null = null
  server.onRequest((req) => {
    got = req
    server.resolve(req.id, 'allow')
  })
  await server.start()

  const decision = await new Promise<string>((resolvePromise) => {
    const c = net.createConnection(sock, () => {
      c.write(encode({ type: 'request',
        request: { id: 'x1', toolName: 'Bash', inputSummary: 'ls' } }))
    })
    const decode = createDecoder()
    c.on('data', (d) => {
      for (const m of decode(d) as any[]) {
        if (m.type === 'decision') resolvePromise(m.decision)
      }
    })
  })

  expect(got!.id).toBe('x1')
  expect(decision).toBe('allow')
  await server.stop()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/claude-server.test.ts`
Expected: FAIL — cannot find module `../electron/providers/claude`.

- [ ] **Step 3: Implement `electron/providers/claude.ts`**

```ts
import net from 'node:net'
import { unlink } from 'node:fs/promises'
import { encode, createDecoder } from '@shared/protocol'
import type { ToolRequest, Decision } from '@shared/types'

export class ClaudeServer {
  private server: net.Server | null = null
  private pending = new Map<string, net.Socket>()
  private cb: ((req: ToolRequest) => void) | null = null

  constructor(private socketPath: string) {}

  onRequest(cb: (req: ToolRequest) => void): void {
    this.cb = cb
  }

  async start(): Promise<void> {
    await unlink(this.socketPath).catch(() => {})
    this.server = net.createServer((socket) => {
      const decode = createDecoder()
      socket.on('data', (chunk) => {
        for (const m of decode(chunk) as any[]) {
          if (m.type === 'request' && m.request) {
            this.pending.set(m.request.id, socket)
            this.cb?.(m.request as ToolRequest)
          }
        }
      })
      socket.on('error', () => {})
    })
    await new Promise<void>((res) => this.server!.listen(this.socketPath, res))
  }

  resolve(id: string, decision: Decision): void {
    const socket = this.pending.get(id)
    if (!socket) return
    socket.write(encode({ type: 'decision', id, decision }))
    socket.end()
    this.pending.delete(id)
  }

  async stop(): Promise<void> {
    for (const s of this.pending.values()) s.destroy()
    this.pending.clear()
    await new Promise<void>((res) => this.server?.close(() => res()))
    await unlink(this.socketPath).catch(() => {})
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/claude-server.test.ts`
Expected: 1 passing test.

- [ ] **Step 5: Commit**

```bash
git add electron/providers/claude.ts tests/claude-server.test.ts
git commit -m "feat: Claude approval socket server"
```

---

## Task 5: The hook script (fail-open bridge)

**Files:**
- Create: `hook/claude-island-hook.js`, `hook/README.md`
- Test: `tests/hook.test.ts`

**Interfaces:**
- Consumes: reads Claude `PreToolUse` JSON on stdin; env `DYNAMIC_ISLAND_SOCK` (default `${XDG_RUNTIME_DIR|/tmp}/dynamic-island.sock`).
- Produces: prints `{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason } }` to stdout and exits 0.
- Behavior: builds `ToolRequest` from stdin, connects to socket, sends `request`, waits for `decision`; on any error or 30s timeout → `ask`.

- [ ] **Step 1: Write the failing test** (spawns the hook against a stub server)

```ts
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { encode, createDecoder } from '@shared/protocol'

function runHook(sock: string, input: object): Promise<any> {
  return new Promise((resolve) => {
    const p = spawn('node', ['hook/claude-island-hook.js'], {
      env: { ...process.env, DYNAMIC_ISLAND_SOCK: sock },
    })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.on('close', () => resolve(JSON.parse(out)))
    p.stdin.end(JSON.stringify(input))
  })
}

test('hook relays server decision', async () => {
  const sock = join(tmpdir(), `di-hook-${process.pid}.sock`)
  const server = net.createServer((socket) => {
    const decode = createDecoder()
    socket.on('data', (c) => {
      for (const m of decode(c) as any[]) {
        if (m.type === 'request')
          socket.write(encode({ type: 'decision', id: m.request.id, decision: 'deny' }))
      }
    })
  })
  await new Promise<void>((r) => server.listen(sock, r))

  const res = await runHook(sock, { tool_name: 'Bash', tool_input: { command: 'rm -rf /' } })
  expect(res.hookSpecificOutput.permissionDecision).toBe('deny')
  await new Promise<void>((r) => server.close(() => r()))
})

test('hook falls back to ask when socket missing', async () => {
  const res = await runHook(join(tmpdir(), 'nonexistent.sock'),
    { tool_name: 'Bash', tool_input: { command: 'ls' } })
  expect(res.hookSpecificOutput.permissionDecision).toBe('ask')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hook.test.ts`
Expected: FAIL — `hook/claude-island-hook.js` does not exist.

- [ ] **Step 3: Implement `hook/claude-island-hook.js`**

```js
#!/usr/bin/env node
const net = require('node:net')

const SOCK = process.env.DYNAMIC_ISLAND_SOCK ||
  `${process.env.XDG_RUNTIME_DIR || '/tmp'}/dynamic-island.sock`

function output(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }))
  process.exit(0)
}

function summarize(input) {
  if (!input) return ''
  if (typeof input.command === 'string') return input.command
  if (typeof input.file_path === 'string') return input.file_path
  return JSON.stringify(input).slice(0, 200)
}

let raw = ''
process.stdin.on('data', (d) => (raw += d))
process.stdin.on('end', () => {
  let hook
  try { hook = JSON.parse(raw || '{}') } catch { return output('ask', 'bad input') }

  const request = {
    id: `${process.pid}-${Date.now()}`,
    toolName: hook.tool_name || 'unknown',
    inputSummary: summarize(hook.tool_input),
    cwd: hook.cwd,
  }

  const timer = setTimeout(() => output('ask', 'island timeout'), 30000)
  const client = net.createConnection(SOCK, () => {
    client.write(JSON.stringify({ type: 'request', request }) + '\n')
  })

  let buf = ''
  client.on('data', (d) => {
    buf += d.toString()
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx); buf = buf.slice(idx + 1)
      if (!line.trim()) continue
      const m = JSON.parse(line)
      if (m.type === 'decision') {
        clearTimeout(timer)
        output(m.decision, 'via dynamic island')
      }
    }
  })
  client.on('error', () => { clearTimeout(timer); output('ask', 'island unreachable') })
})
```

Note: hook uses CommonJS `require` and a self-contained decoder (no bundler runs on it).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hook.test.ts`
Expected: 2 passing tests.

- [ ] **Step 5: Write `hook/README.md`**

````markdown
# Claude Code approval hook

Add to `~/.claude/settings.json` (adjust the absolute path):

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "*", "hooks": [
        { "type": "command", "command": "node /home/shanks/Pictures/dynamic-island-linux/hook/claude-island-hook.js" }
      ] }
    ]
  }
}
```

The hook fails open: if the island isn't running or you don't respond within
30s, it returns `ask` and Claude's normal terminal prompt takes over.
Override the socket path with `DYNAMIC_ISLAND_SOCK`.
````

- [ ] **Step 6: Commit**

```bash
git add hook/claude-island-hook.js hook/README.md tests/hook.test.ts
git commit -m "feat: fail-open Claude PreToolUse hook bridge"
```

---

## Task 6: MPRIS media provider

**Files:**
- Create: `electron/providers/media.ts`
- Test: `tests/media.test.ts`

**Interfaces:**
- Consumes: `dbus-next`; `MediaState`, `MediaCmd` from `@shared/types`.
- Produces:
  - `parseMprisMetadata(meta: Record<string, { value: unknown }>, status: string, canControl: boolean): MediaState` — **pure**, exported for testing.
  - `class MediaProvider`:
    - `start(): Promise<void>` — finds an MPRIS player, subscribes to `PropertiesChanged`.
    - `onChange(cb: (state: MediaState | null) => void): void` (null = no player).
    - `command(cmd: MediaCmd): Promise<void>` — PlayPause/Next/Previous.
    - `stop(): Promise<void>`

- [ ] **Step 1: Write the failing test** (pure parser only — D-Bus is integration, not unit)

```ts
import { parseMprisMetadata } from '../electron/providers/media'

test('parses MPRIS metadata variant map', () => {
  const meta = {
    'xesam:title': { value: 'Bohemian Rhapsody' },
    'xesam:artist': { value: ['Queen'] },
    'mpris:artUrl': { value: 'file:///art.png' },
  }
  const s = parseMprisMetadata(meta as any, 'Playing', true)
  expect(s).toEqual({
    title: 'Bohemian Rhapsody', artist: 'Queen',
    artUrl: 'file:///art.png', playing: true, canControl: true,
  })
})

test('handles missing fields and paused status', () => {
  const s = parseMprisMetadata({} as any, 'Paused', false)
  expect(s.title).toBe('Unknown')
  expect(s.artist).toBe('')
  expect(s.playing).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media.test.ts`
Expected: FAIL — cannot find module `../electron/providers/media`.

- [ ] **Step 3: Implement `electron/providers/media.ts`**

```ts
import dbus from 'dbus-next'
import type { MediaState, MediaCmd } from '@shared/types'

export function parseMprisMetadata(
  meta: Record<string, { value: unknown }>,
  status: string,
  canControl: boolean,
): MediaState {
  const get = (k: string) => meta?.[k]?.value
  const artistRaw = get('xesam:artist')
  const artist = Array.isArray(artistRaw) ? artistRaw.join(', ') : (artistRaw as string) ?? ''
  return {
    title: (get('xesam:title') as string) || 'Unknown',
    artist: artist || '',
    artUrl: (get('mpris:artUrl') as string) || undefined,
    playing: status === 'Playing',
    canControl,
  }
}

const PREFIX = 'org.mpris.MediaPlayer2.'
const PATH = '/org/mpris/MediaPlayer2'
const PLAYER = 'org.mpris.MediaPlayer2.Player'

export class MediaProvider {
  private bus = dbus.sessionBus()
  private cb: ((s: MediaState | null) => void) | null = null
  private player: any = null
  private name: string | null = null

  onChange(cb: (s: MediaState | null) => void): void { this.cb = cb }

  async start(): Promise<void> {
    const proxy = await this.bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus')
    const dbusIface = proxy.getInterface('org.freedesktop.DBus')
    const names: string[] = await dbusIface.ListNames()
    this.name = names.find((n) => n.startsWith(PREFIX)) ?? null
    if (!this.name) { this.cb?.(null); return }
    await this.bind(this.name)
  }

  private async bind(name: string): Promise<void> {
    const obj = await this.bus.getProxyObject(name, PATH)
    this.player = obj.getInterface(PLAYER)
    const props = obj.getInterface('org.freedesktop.DBus.Properties')
    const emit = async () => {
      const meta = (await props.Get(PLAYER, 'Metadata')).value
      const status = (await props.Get(PLAYER, 'PlaybackStatus')).value
      const canControl = (await props.Get(PLAYER, 'CanControl')).value
      this.cb?.(parseMprisMetadata(meta, status, canControl))
    }
    props.on('PropertiesChanged', emit)
    await emit()
  }

  async command(cmd: MediaCmd): Promise<void> {
    if (!this.player) return
    if (cmd === 'playpause') await this.player.PlayPause()
    if (cmd === 'next') await this.player.Next()
    if (cmd === 'previous') await this.player.Previous()
  }

  async stop(): Promise<void> {
    this.bus.disconnect()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/media.test.ts`
Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add electron/providers/media.ts tests/media.test.ts
git commit -m "feat: MPRIS media provider over D-Bus"
```

---

## Task 7: Transparent always-on-top window + passthrough

**Files:**
- Create: `electron/window.ts`, `electron/preload.ts`
- (No unit test — Electron window behavior is verified manually in Task 10)

**Interfaces:**
- Consumes: `IPC`, `DecisionMsg`, `MediaCmd` from `@shared/types`.
- Produces:
  - `createIslandWindow(): BrowserWindow` — transparent, frameless, always-on-top, top-centered, screen-width × 500px, click-through by default.
  - `preload.ts` exposes `window.island` = `{ onState(cb), sendDecision(msg), sendMediaCmd(cmd), setHover(b) }`.

- [ ] **Step 1: Write `electron/preload.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/types'
import type { Activity, DecisionMsg, MediaCmd } from '@shared/types'

contextBridge.exposeInMainWorld('island', {
  onState: (cb: (a: Activity[]) => void) =>
    ipcRenderer.on(IPC.STATE, (_e, a) => cb(a)),
  sendDecision: (msg: DecisionMsg) => ipcRenderer.send(IPC.DECISION, msg),
  sendMediaCmd: (cmd: MediaCmd) => ipcRenderer.send(IPC.MEDIA_CMD, cmd),
  setHover: (b: boolean) => ipcRenderer.send(IPC.SET_HOVER, b),
})
```

- [ ] **Step 2: Write `electron/window.ts`**

```ts
import { BrowserWindow, screen } from 'electron'
import { resolve } from 'node:path'

export function createIslandWindow(): BrowserWindow {
  const { width } = screen.getPrimaryDisplay().workAreaSize
  const height = 500
  const win = new BrowserWindow({
    width, height, x: 0, y: 0,
    frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, focusable: false, hasShadow: false,
    alwaysOnTop: true, backgroundColor: '#00000000',
    webPreferences: { preload: resolve(__dirname, '../preload/preload.js') },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setBounds({ x: Math.round((screen.getPrimaryDisplay().workAreaSize.width - width) / 2) + 0, y: 0, width, height })
  return win
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/window.ts electron/preload.ts
git commit -m "feat: transparent always-on-top island window + preload bridge"
```

---

## Task 8: Main process wiring + demo mode

**Files:**
- Create: `electron/main.ts`, `electron/ipc.ts`

**Interfaces:**
- Consumes: `ActivityStore`, `ClaudeServer`, `MediaProvider`, `createIslandWindow`, `IPC` types.
- Produces: running app. Env `DI_DEMO=1` seeds a fake media activity and a fake approval after 2s. Socket path = `DYNAMIC_ISLAND_SOCK` or `${XDG_RUNTIME_DIR|/tmp}/dynamic-island.sock`.

- [ ] **Step 1: Write `electron/ipc.ts`**

```ts
import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '@shared/types'
import type { Activity, DecisionMsg, MediaCmd } from '@shared/types'

export function pushState(win: BrowserWindow, activities: Activity[]): void {
  win.webContents.send(IPC.STATE, activities)
}

export function wireIpc(handlers: {
  onDecision: (m: DecisionMsg) => void
  onMediaCmd: (c: MediaCmd) => void
  onHover: (b: boolean) => void
}): void {
  ipcMain.on(IPC.DECISION, (_e, m) => handlers.onDecision(m))
  ipcMain.on(IPC.MEDIA_CMD, (_e, c) => handlers.onMediaCmd(c))
  ipcMain.on(IPC.SET_HOVER, (_e, b) => handlers.onHover(b))
}
```

- [ ] **Step 2: Write `electron/main.ts`**

```ts
import { app, BrowserWindow } from 'electron'
import { ActivityStore } from './store'
import { ClaudeServer } from './providers/claude'
import { MediaProvider } from './providers/media'
import { createIslandWindow } from './window'
import { pushState, wireIpc } from './ipc'
import type { Activity, ToolRequest } from '@shared/types'

const SOCK = process.env.DYNAMIC_ISLAND_SOCK ||
  `${process.env.XDG_RUNTIME_DIR || '/tmp'}/dynamic-island.sock`
const DEMO = process.env.DI_DEMO === '1'

async function main() {
  const store = new ActivityStore()
  const win = createIslandWindow()
  if (process.env.ELECTRON_RENDERER_URL)
    await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await win.loadFile('out/renderer/index.html')

  store.onChange(() => pushState(win, store.list()))

  const claude = new ClaudeServer(SOCK)
  claude.onRequest((req: ToolRequest) => {
    store.upsert({ kind: 'approval', id: req.id, priority: 10, request: req })
  })
  await claude.start()

  const media = new MediaProvider()
  media.onChange((s) => {
    if (!s) { store.remove('media'); return }
    store.upsert({ kind: 'media', id: 'media', priority: 1, media: s })
  })
  await media.start().catch(() => {})

  wireIpc({
    onDecision: (m) => { claude.resolve(m.id, m.decision); store.remove(m.id) },
    onMediaCmd: (c) => media.command(c),
    onHover: (b) => win.setIgnoreMouseEvents(!b, { forward: true }),
  })

  if (DEMO) {
    store.upsert({ kind: 'media', id: 'media', priority: 1,
      media: { title: 'Demo Song', artist: 'Demo Artist', playing: true, canControl: true } })
    setTimeout(() => store.upsert({ kind: 'approval', id: 'demo-approval', priority: 10,
      request: { id: 'demo-approval', toolName: 'Bash', inputSummary: 'rm -rf /tmp/x' } }), 2000)
  }
}

app.whenReady().then(main)
app.on('window-all-closed', () => {}) // keep running (widget)
```

- [ ] **Step 3: Manual smoke — build & run demo (no renderer yet is fine to defer to Task 10)**

Run: `npm run build` and confirm it compiles without type errors.
Expected: build succeeds (renderer entry exists after Task 9; if running before Task 9, expect only the renderer bundle to be missing — main/preload compile clean).

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts electron/ipc.ts
git commit -m "feat: main process wiring + demo mode"
```

---

## Task 9: Renderer — morphing island UI

**Files:**
- Create: `renderer/index.html`, `renderer/main.tsx`, `renderer/App.tsx`,
  `renderer/anim/spring.ts`, `renderer/island/Island.tsx`,
  `renderer/island/states/IdlePill.tsx`, `renderer/island/states/MediaCard.tsx`,
  `renderer/island/states/ApprovalCard.tsx`, `renderer/styles.css`

**Interfaces:**
- Consumes: `window.island` bridge (from Task 7 preload); `Activity` type.
- Produces: the visible island driven by state; buttons call `window.island.sendDecision` / `sendMediaCmd`; hover calls `setHover`.

- [ ] **Step 1: Write `renderer/index.html`**

```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><link rel="stylesheet" href="./styles.css" /></head>
  <body><div id="root"></div><script type="module" src="./main.tsx"></script></body>
</html>
```

- [ ] **Step 2: Write `renderer/styles.css`**

```css
html, body { margin: 0; background: transparent; overflow: hidden; height: 100%; font-family: -apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif; }
#root { display: flex; justify-content: center; align-items: flex-start; padding-top: 6px; }
.island { background: #000; color: #fff; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.45); }
.row { display: flex; align-items: center; gap: 10px; }
.btn { background: rgba(255,255,255,0.12); border: 0; color: #fff; border-radius: 999px; padding: 8px 14px; cursor: pointer; font-size: 13px; }
.btn.allow { background: #2fd267; color: #000; }
.btn.deny { background: #ff4d4f; }
.art { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; background: #222; }
.title { font-size: 13px; font-weight: 600; }
.sub { font-size: 11px; opacity: 0.7; }
```

- [ ] **Step 3: Write `renderer/anim/spring.ts`**

```ts
export const spring = { type: 'spring', stiffness: 500, damping: 34, mass: 1 } as const
export const softSpring = { type: 'spring', stiffness: 300, damping: 30 } as const
```

- [ ] **Step 4: Write `renderer/island/states/IdlePill.tsx`**

```tsx
export function IdlePill() {
  return <div className="row" style={{ padding: '6px 14px' }}>
    <span style={{ width: 6, height: 6, borderRadius: 999, background: '#4a4a4a' }} />
  </div>
}
```

- [ ] **Step 5: Write `renderer/island/states/MediaCard.tsx`**

```tsx
import type { MediaState, MediaCmd } from '@shared/types'

export function MediaCard({ media, expanded }: { media: MediaState; expanded: boolean }) {
  const cmd = (c: MediaCmd) => (window as any).island.sendMediaCmd(c)
  return (
    <div className="row" style={{ padding: expanded ? '12px 16px' : '6px 12px' }}>
      {media.artUrl ? <img className="art" src={media.artUrl} /> : <div className="art" />}
      <div style={{ minWidth: expanded ? 160 : 90 }}>
        <div className="title">{media.title}</div>
        <div className="sub">{media.artist}</div>
      </div>
      {expanded && media.canControl && (
        <div className="row">
          <button className="btn" onClick={() => cmd('previous')}>⏮</button>
          <button className="btn" onClick={() => cmd('playpause')}>{media.playing ? '⏸' : '▶'}</button>
          <button className="btn" onClick={() => cmd('next')}>⏭</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Write `renderer/island/states/ApprovalCard.tsx`**

```tsx
import type { ToolRequest } from '@shared/types'

export function ApprovalCard({ request }: { request: ToolRequest }) {
  const decide = (decision: 'allow' | 'deny') =>
    (window as any).island.sendDecision({ id: request.id, decision })
  return (
    <div style={{ padding: '14px 16px', maxWidth: 360 }}>
      <div className="sub">Claude wants to run</div>
      <div className="title" style={{ margin: '4px 0 2px' }}>{request.toolName}</div>
      <div className="sub" style={{ fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{request.inputSummary}</div>
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="btn deny" onClick={() => decide('deny')}>Deny</button>
        <button className="btn allow" onClick={() => decide('allow')}>Allow</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Write `renderer/island/Island.tsx`**

```tsx
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import type { Activity } from '@shared/types'
import { spring } from '../anim/spring'
import { IdlePill } from './states/IdlePill'
import { MediaCard } from './states/MediaCard'
import { ApprovalCard } from './states/ApprovalCard'

export function Island({ activity }: { activity: Activity | null }) {
  const [hover, setHover] = useState(false)
  const setH = (b: boolean) => { setHover(b); (window as any).island.setHover(b) }
  const isApproval = activity?.kind === 'approval'
  const expanded = hover || isApproval

  const radius = expanded ? 24 : 20
  return (
    <motion.div
      className="island"
      layout
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      transition={spring}
      style={{ borderRadius: radius }}
      animate={{ borderRadius: radius }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={activity ? activity.kind + activity.id : 'idle'}
          layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}>
          {!activity && <IdlePill />}
          {activity?.kind === 'media' && <MediaCard media={activity.media} expanded={expanded} />}
          {activity?.kind === 'approval' && <ApprovalCard request={activity.request} />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
```

- [ ] **Step 8: Write `renderer/App.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { Activity } from '@shared/types'
import { Island } from './island/Island'

function presented(list: Activity[]): Activity | null {
  if (list.length === 0) return null
  return [...list].sort((a, b) => b.priority - a.priority)[0]
}

export function App() {
  const [list, setList] = useState<Activity[]>([])
  useEffect(() => { (window as any).island.onState((a: Activity[]) => setList(a)) }, [])
  return <Island activity={presented(list)} />
}
```

- [ ] **Step 9: Write `renderer/main.tsx`**

```tsx
import { createRoot } from 'react-dom/client'
import { App } from './App'
createRoot(document.getElementById('root')!).render(<App />)
```

- [ ] **Step 10: Commit**

```bash
git add renderer
git commit -m "feat: morphing island renderer (idle/media/approval)"
```

---

## Task 10: End-to-end demo verification

**Files:**
- Modify: `README.md` (create)

**Interfaces:** none new — verifies the whole system.

- [ ] **Step 1: Run the demo**

Run: `DI_DEMO=1 npm run dev`
Expected: transparent app launches; a pill appears top-center showing "Demo Song / Demo Artist"; after 2s it morphs into an Allow/Deny approval card. Hovering the media pill expands it to show transport controls. Rest of desktop stays clickable.

- [ ] **Step 2: Verify hover passthrough**

Move the mouse off the island; confirm clicks land on the desktop/other windows. Move onto the island; confirm buttons are clickable.

- [ ] **Step 3: Verify approval round-trip end-to-end**

In a second terminal:
Run: `echo '{"tool_name":"Bash","tool_input":{"command":"echo hi"}}' | DYNAMIC_ISLAND_SOCK=${XDG_RUNTIME_DIR:-/tmp}/dynamic-island.sock node hook/claude-island-hook.js`
Expected: the island shows an approval card; clicking **Allow** makes the command print `{"hookSpecificOutput":{...,"permissionDecision":"allow",...}}` and exit.

- [ ] **Step 4: Verify real media (if a player is running)**

Start any MPRIS player (e.g. a browser playing audio, or Spotify). Confirm the island shows the current track and that play/pause works.

- [ ] **Step 5: Write `README.md`**

```markdown
# Dynamic Island for Linux

Mac-style Dynamic Island for Ubuntu (X11 + GNOME). Electron + Framer Motion.

## Run
- `npm install`
- `DI_DEMO=1 npm run dev` — demo animations without real data
- `npm run build && npm start` — normal run

## Providers
- **Media** — any MPRIS player (Spotify, browsers). No `playerctl` needed.
- **Claude approvals** — install the hook (see `hook/README.md`); approve/deny from the island.

Limitations: X11 only.
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: run instructions + e2e demo verification"
```

---

## Self-review notes

- **Spec coverage:** window/morph (T7,T9), state model (T9), media provider (T6), Claude interactive approvals (T3–T5,T8), fail-open (T5), demo mode (T8,T10), priority store (T2), tests for pure logic (T2,T3,T5,T6). All spec sections mapped.
- **Type consistency:** `Activity`, `Decision`, `MediaState`, `ToolRequest`, `IPC`, `DecisionMsg`, `MediaCmd` defined once in `shared/types.ts` (T1) and reused verbatim by all tasks. Socket messages `{type:'request'|'decision'}` consistent across T4/T5.
- **Known follow-ups (not v1 blockers):** the `presented()` tie-break lives in both `store.ts` and `App.tsx`; App uses a simpler sort (acceptable — main is source of truth, renderer just needs top item). Multi-activity trailing indicator is deferred (single presented activity shown in v1).
```
