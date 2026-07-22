# Dynamic Island — Fix & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Electron Dynamic Island actually interactive on X11, fix the Claude Code approval integration, and raise the visuals/motion to Mac-grade fidelity.

**Architecture:** Keep Electron + React + Framer Motion. The main process owns a transparent always-on-top overlay whose interactivity is driven by **global-cursor hit-testing** (not the broken `forward` flag). Providers (MPRIS media, Claude approvals) feed a priority activity store; the renderer draws compact/minimal/expanded states with spring morphs, squircle corners, and an in-pill goo merge.

**Tech Stack:** Electron, TypeScript, React, Framer Motion, dbus-next, `squircle.js`/`figma-squircle`, vitest. X11 + GNOME.

## Global Constraints (copied from research findings)

- **X11 only.** Do not add Wayland-only APIs. We rely on X11 window hints.
- **Never use `setIgnoreMouseEvents(true, { forward: true })` for interactivity** — the `forward` flag is unimplemented on Linux (Electron #16777). Interactivity comes from main-process cursor hit-testing.
- **Do not use `screen.getCursorScreenPoint()`** for the cursor read — it is broken on Electron v29+ Linux (#42519). Read the global cursor via the pure-JS **`x11`** package (`QueryPointer` on the root window → `rootX`/`rootY`); no system dependency, no sudo. Graceful fallback to null if the X client can't connect.
- Launch with `--enable-transparent-visuals` before `app.whenReady()` or alpha may fail.
- Hook must **fail open as a true no-op**: on any error/timeout, exit 0 with **no JSON** (normal permission flow applies) — never emit `ask` (which would force prompts for allowlisted tools).
- Hook matcher must be a valid regex (`.*` or a tool-name alternation), never `*`.
- Squircle corners via a superellipse path, not plain `border-radius`.
- Spring feel target: Framer Motion `{ type:'spring', stiffness: 360, damping: 30, mass: 1 }` (≈ iOS `.snappy`), or `{ duration: 0.5, bounce: 0.15 }`.
- TDD for pure logic (hit-box math, hook decision, state selection, squircle path). Windowing/cursor behavior is verified manually with documented screenshot checks.
- Frequent commits; one deliverable per task.

---

## File map (new/changed)

- `electron/window.ts` — remove `forward`; add `type:'dock'`, transparent-visuals note, expose bounds.
- `electron/interactivity.ts` **(new)** — cursor reader + hit-test loop toggling ignore-mouse.
- `electron/cursor.ts` **(new)** — `readCursor()` via xdotool with fallback; pure parse helper.
- `shared/hitbox.ts` **(new)** — pure `pointInRect` + rect types (shared main/renderer).
- `electron/main.ts` — wire interactivity; pass island rect from renderer via IPC.
- `electron/preload.ts` / `shared/types.ts` — add `reportRect` IPC channel.
- `hook/claude-island-hook.cjs` — fail-open no-op; keep debug log.
- `hook/decision.cjs` **(new)** + `tests/hook-decision.test.ts` — pure output-builder, unit-tested.
- `hook/install.js` **(new)** — safe installer that fixes the matcher in `~/.claude/settings.json`.
- `renderer/anim/spring.ts` — Apple spring values.
- `renderer/island/squircle.ts` **(new)** + `tests/squircle.test.ts` — superellipse path/clip generator.
- `renderer/island/Island.tsx` + `renderer/island/states/*` — compact leading/trailing, minimal (attached + detached circle), expanded regions, goo merge.
- `renderer/island/Goo.tsx` **(new)** — SVG goo filter wrapper.
- `shared/present.ts` **(new)** + `tests/present.test.ts` — pure "which activities → which presentation" selector.

---

# PHASE A — Make it interactive on X11 (the blocker)

## Task A1: Pure hit-box helper

**Files:**
- Create: `shared/hitbox.ts`
- Test: `tests/hitbox.test.ts`

**Interfaces:**
- Produces: `type Rect = { x:number; y:number; width:number; height:number }` and
  `pointInRect(px:number, py:number, r:Rect): boolean`.

- [ ] **Step 1: Failing test** — `tests/hitbox.test.ts`

```ts
import { pointInRect } from '../shared/hitbox'

test('point inside rect', () => {
  const r = { x: 10, y: 0, width: 100, height: 40 }
  expect(pointInRect(50, 20, r)).toBe(true)
  expect(pointInRect(5, 20, r)).toBe(false)   // left of rect
  expect(pointInRect(50, 50, r)).toBe(false)  // below rect
  expect(pointInRect(10, 0, r)).toBe(true)    // top-left edge inclusive
  expect(pointInRect(110, 40, r)).toBe(true)  // bottom-right edge inclusive
})
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run tests/hitbox.test.ts`
Expected: FAIL — cannot find module `../shared/hitbox`.

- [ ] **Step 3: Implement `shared/hitbox.ts`**

```ts
export type Rect = { x: number; y: number; width: number; height: number }

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run tests/hitbox.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add shared/hitbox.ts tests/hitbox.test.ts
git commit -m "feat: pure point-in-rect hit-box helper"
```

## Task A2: Cursor reader via the `x11` package

**Files:**
- Create: `electron/cursor.ts`
- Test: `tests/cursor.test.ts`
- Dep: `x11` (already added to dependencies)

**Interfaces:**
- Produces:
  - `pickPointer(reply: { rootX:number; rootY:number }): { x:number; y:number }`
    — extracts `{x,y}` from an X `QueryPointer` reply. **Pure, exported.**
  - `readCursor(): Promise<{ x:number; y:number } | null>` — connects a persistent
    X client (lazy singleton), calls `QueryPointer` on the root window; resolves
    null if the X client can't connect or the request errors.

- [ ] **Step 1: Failing test** — `tests/cursor.test.ts`

```ts
import { pickPointer } from '../electron/cursor'

test('picks x/y from a QueryPointer reply', () => {
  expect(pickPointer({ rootX: 734, rootY: 12 })).toEqual({ x: 734, y: 12 })
})
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run tests/cursor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `electron/cursor.ts`**

```ts
// @ts-expect-error - x11 ships no types
import x11 from 'x11'

export function pickPointer(reply: { rootX: number; rootY: number }): {
  x: number
  y: number
} {
  return { x: reply.rootX, y: reply.rootY }
}

let clientP: Promise<{ X: any; root: number }> | null = null
function getClient(): Promise<{ X: any; root: number }> {
  if (!clientP) {
    clientP = new Promise((resolve, reject) => {
      x11.createClient((err: unknown, display: any) => {
        if (err || !display) return reject(err ?? new Error('no display'))
        resolve({ X: display.client, root: display.screen[0].root })
      })
    }).catch((e) => {
      clientP = null // allow retry on next call
      throw e
    })
  }
  return clientP
}

export async function readCursor(): Promise<{ x: number; y: number } | null> {
  try {
    const { X, root } = await getClient()
    return await new Promise((resolve) => {
      X.QueryPointer(root, (err: unknown, p: any) => {
        if (err || !p) return resolve(null)
        resolve(pickPointer(p))
      })
    })
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run tests/cursor.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add electron/cursor.ts tests/cursor.test.ts package.json package-lock.json
git commit -m "feat: global cursor reader via x11 QueryPointer"
```

## Task A3: Interactivity loop (main process)

**Files:**
- Create: `electron/interactivity.ts`
- Modify: `shared/types.ts` (add `REPORT_RECT` channel), `electron/preload.ts`, `renderer` rect reporting

**Interfaces:**
- Consumes: `readCursor` (A2), `pointInRect`/`Rect` (A1).
- Produces:
  - `class Interactivity { constructor(win: BrowserWindow); setRect(r: Rect|null): void; start(): void; stop(): void }`
    — every 40 ms reads the cursor; if inside the current island rect →
    `win.setIgnoreMouseEvents(false)`, else `win.setIgnoreMouseEvents(true)`.
    When rect is null (idle/hidden) → always ignore.
- New IPC: `IPC.REPORT_RECT = 'island:rect'` (renderer → main: `Rect` in **screen**
  coordinates; renderer computes it from the pill's bounding box + window position).

- [ ] **Step 1: Add IPC channel** — edit `shared/types.ts`

```ts
// add to IPC object:
REPORT_RECT: 'island:rect', // renderer -> main: island bounding Rect (screen coords)
```
And export: `export type { Rect } from './hitbox'`

- [ ] **Step 2: Expose in preload** — edit `electron/preload.ts`

Add inside `exposeInMainWorld('island', { ... })`:
```ts
reportRect: (rect: import('@shared/hitbox').Rect | null) =>
  ipcRenderer.send(IPC.REPORT_RECT, rect),
```

- [ ] **Step 3: Implement `electron/interactivity.ts`**

```ts
import type { BrowserWindow } from 'electron'
import { readCursor } from './cursor'
import { pointInRect, type Rect } from '@shared/hitbox'

export class Interactivity {
  private rect: Rect | null = null
  private timer: NodeJS.Timeout | null = null
  private ignoring = true

  constructor(private win: BrowserWindow) {
    this.win.setIgnoreMouseEvents(true)
  }

  setRect(r: Rect | null): void {
    this.rect = r
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(async () => {
      const p = this.rect ? await readCursor() : null
      const inside = !!(p && this.rect && pointInRect(p.x, p.y, this.rect))
      if (inside && this.ignoring) {
        this.win.setIgnoreMouseEvents(false)
        this.ignoring = false
      } else if (!inside && !this.ignoring) {
        this.win.setIgnoreMouseEvents(true, { forward: false })
        this.ignoring = true
      }
    }, 40)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
```

- [ ] **Step 4: Wire in `electron/main.ts`**

After creating `win`, add:
```ts
import { Interactivity } from './interactivity'
import { IPC } from '@shared/types'
import { ipcMain } from 'electron'
// ...
const interactivity = new Interactivity(win)
interactivity.start()
ipcMain.on(IPC.REPORT_RECT, (_e, rect) => interactivity.setRect(rect))
```
Remove any prior reliance on `SET_HOVER`/`onHover` toggling ignore-mouse (the
renderer hover no longer drives interactivity; the cursor loop does).

- [ ] **Step 5: Renderer reports its rect** — edit `renderer/island/Island.tsx`

Add a ref on the pill container and report its screen-space rect after every
layout/animation frame:
```tsx
import { useEffect, useRef } from 'react'
// inside component:
const ref = useRef<HTMLDivElement>(null)
useEffect(() => {
  let raf = 0
  const report = () => {
    const el = ref.current
    if (el) {
      const b = el.getBoundingClientRect()
      // window is full-width at screen top; screenX≈b.x, screenY≈b.y
      ;(window as any).island.reportRect({ x: b.x, y: b.y, width: b.width, height: b.height })
    }
    raf = requestAnimationFrame(report)
  }
  raf = requestAnimationFrame(report)
  return () => cancelAnimationFrame(raf)
}, [])
// put ref={ref} on the outer motion.div
```

- [ ] **Step 6: Manual verification** — build & run

Run: `rm -rf out && npm run build && DISPLAY=:1 DI_DEMO=1 ./node_modules/.bin/electron out/main/main.js`
Expected: the demo approval card appears; **hovering the island triggers `:hover`
styles and the Allow/Deny buttons are clickable**; moving the cursor off the
island lets clicks fall through to the desktop.

- [ ] **Step 7: Commit**

```bash
git add electron/interactivity.ts electron/main.ts electron/preload.ts shared/types.ts renderer/island/Island.tsx
git commit -m "feat: X11 cursor hit-testing drives island interactivity (fixes hover/click)"
```

## Task A4: Reliable transparency & always-on-top over the GNOME bar

**Files:**
- Modify: `electron/main.ts` (launch switch), `electron/window.ts`

**Interfaces:** no new API; hardens window flags per research.

- [ ] **Step 1: Add transparent-visuals switch** — top of `electron/main.ts`, before `app.whenReady()`

```ts
import { app } from 'electron'
app.commandLine.appendSwitch('enable-transparent-visuals')
```

- [ ] **Step 2: Harden window flags** — edit `electron/window.ts` BrowserWindow options

Add / ensure:
```ts
type: 'dock',
focusable: false,
```
Keep existing `frame:false, transparent:true, alwaysOnTop:true, skipTaskbar:true,
hasShadow:false`. Keep `win.setAlwaysOnTop(true, 'screen-saver')` and
`win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`.

- [ ] **Step 3: Manual verification**

Run: `rm -rf out && npm run build && DISPLAY=:1 DI_DEMO=1 ./node_modules/.bin/electron out/main/main.js`
Then capture: `DISPLAY=:1 import -window root -crop 1920x160+0+0 /tmp/di-a4.png`
Expected: the island renders with a transparent background **above** the GNOME top
bar, and stays visible when another window is focused.

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts electron/window.ts
git commit -m "feat: dock-level always-on-top + transparent visuals for X11"
```

---

# PHASE B — Fix Claude Code integration

> **Mechanism (confirmed):** use the **`PermissionRequest`** hook, NOT `PreToolUse`.
> `PermissionRequest` fires **only when Claude actually needs permission** — so the
> island shows exactly the prompts Claude would show, with **no per-tool spam** (no
> tool-scoping heuristic needed). Default hook timeout is **600 s** (ample for a GUI
> click); we set `timeout: 60`.
>
> - **stdin** (same fields as before): `session_id`, `transcript_path`, `cwd`,
>   `permission_mode`, `hook_event_name` (`"PermissionRequest"`), `tool_name`,
>   `tool_input`.
> - **stdout to decide** (different shape from PreToolUse):
>   ```json
>   {"hookSpecificOutput":{"hookEventName":"PermissionRequest",
>     "decision":{"behavior":"allow"}}}   // or "deny"
>   ```
>   Field is `decision.behavior` (`"allow"|"deny"`), NOT `permissionDecision`.
>   Optional `decision.permissionRule` (e.g. `"Bash(npm *)"`) memoises the choice.
> - **Fail-open** = print **nothing**, exit 0 → Claude falls back to its own
>   terminal permission prompt. Never emit anything on error/timeout.
> Source: https://code.claude.com/docs/en/hooks.md

## Task B1: Pure decision-output builder (fail-open no-op)

**Files:**
- Create: `hook/decision.cjs`
- Test: `tests/hook-decision.test.ts`

**Interfaces:**
- Produces (CommonJS):
  - `buildDecision(behavior)` → the exact `PermissionRequest` object to
    `JSON.stringify` to stdout for `'allow'`/`'deny'`; returns `null` for no-op
    (caller prints nothing).
  - `summarize(toolInput)` → short human string.

- [ ] **Step 1: Failing test** — `tests/hook-decision.test.ts`

```ts
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { buildDecision, summarize } = require('../hook/decision.cjs')

test('allow/deny build PermissionRequest hookSpecificOutput', () => {
  expect(buildDecision('allow')).toEqual({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'allow' },
    },
  })
  expect(buildDecision('deny')).toEqual({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'deny' },
    },
  })
})

test('no-op returns null (print nothing, exit 0)', () => {
  expect(buildDecision('noop')).toBeNull()
})

test('summarize prefers command then file_path', () => {
  expect(summarize({ command: 'rm -rf /' })).toBe('rm -rf /')
  expect(summarize({ file_path: '/a/b.txt' })).toBe('/a/b.txt')
  expect(summarize(undefined)).toBe('')
})
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run tests/hook-decision.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `hook/decision.cjs`**

```js
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
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run tests/hook-decision.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add hook/decision.cjs tests/hook-decision.test.ts
git commit -m "feat: pure hook decision builder with no-op fail-open"
```

## Task B2: Hook uses PermissionRequest + fail-open no-op

**Files:**
- Modify: `hook/claude-island-hook.cjs`
- Modify: `tests/hook.test.ts`

**Interfaces:**
- Uses `hook/decision.cjs`. Behavior:
  - The hook is registered on `PermissionRequest`, so it is invoked **only when
    Claude needs permission** — no tool-scoping needed; every invocation is a real
    approval. It relays the tool request to the island and waits.
  - Island unreachable / bad input / timeout → **no-op** (exit 0, no output) →
    Claude shows its own terminal prompt.
  - Island decision `allow`/`deny` → print the `PermissionRequest` decision JSON.
  - Timeout set to 45s (under the 600s hook budget).

- [ ] **Step 1: Update tests** — `tests/hook.test.ts`

Add a `runHookRaw` helper returning `{ stdout }` (spawns the hook, no `JSON.parse`).
Replace prior assertions:
```ts
test('hook relays island allow as PermissionRequest decision', async () => {
  const sock = join(tmpdir(), `di-hook-${process.pid}.sock`)
  const server = net.createServer((socket) => {
    const decode = createDecoder()
    socket.on('data', (c) => {
      for (const m of decode(c) as any[]) {
        if (m.type === 'request')
          socket.write(encode({ type: 'decision', id: m.request.id, decision: 'allow' }))
      }
    })
  })
  await new Promise<void>((r) => server.listen(sock, r))
  const res = await runHook(sock, { tool_name: 'Bash', tool_input: { command: 'echo hi' } })
  expect(res.hookSpecificOutput.hookEventName).toBe('PermissionRequest')
  expect(res.hookSpecificOutput.decision.behavior).toBe('allow')
  await new Promise<void>((r) => server.close(() => r()))
})

test('hook no-ops (empty stdout) when socket missing', async () => {
  const res = await runHookRaw(join(tmpdir(), 'nonexistent.sock'),
    { tool_name: 'Bash', tool_input: { command: 'ls' } })
  expect(res.stdout.trim()).toBe('')   // no JSON => Claude's own prompt
})
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run tests/hook.test.ts`
Expected: FAIL (current hook emits the old PreToolUse `ask`/`permissionDecision`).

- [ ] **Step 3: Rewrite `hook/claude-island-hook.cjs`**

```js
#!/usr/bin/env node
const net = require('node:net')
const fs = require('node:fs')
const path = require('node:path')
const { buildDecision, summarize } = require(path.join(__dirname, 'decision.cjs'))

const SOCK = process.env.DYNAMIC_ISLAND_SOCK ||
  `${process.env.XDG_RUNTIME_DIR || '/tmp'}/dynamic-island.sock`
const DEBUG_LOG = process.env.DYNAMIC_ISLAND_DEBUG_LOG
function debug(m) { if (DEBUG_LOG) { try { fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${m}\n`) } catch {} } }

function emit(behavior) {           // 'allow' | 'deny' | anything else = no-op
  const obj = buildDecision(behavior)
  if (obj) process.stdout.write(JSON.stringify(obj))
  process.exit(0)
}

let raw = ''
process.stdin.on('data', (d) => (raw += d))
process.stdin.on('end', () => {
  debug(`INVOKED stdin=${raw.slice(0, 400)}`)
  let hook
  try { hook = JSON.parse(raw || '{}') } catch { return emit('noop') }

  const request = {
    id: `${process.pid}-${Date.now()}`,
    toolName: hook.tool_name || 'unknown',
    inputSummary: summarize(hook.tool_input),
    cwd: hook.cwd,
  }

  const timer = setTimeout(() => { debug('timeout -> noop'); emit('noop') }, 45000)
  const client = net.createConnection(SOCK, () => {
    client.write(JSON.stringify({ type: 'request', request }) + '\n')
  })
  let buf = ''
  client.on('data', (d) => {
    buf += d.toString()
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1)
      if (!line.trim()) continue
      const m = JSON.parse(line)
      if (m.type === 'decision') { clearTimeout(timer); debug(`decision ${m.decision}`); emit(m.decision) }
    }
  })
  client.on('error', (e) => { clearTimeout(timer); debug(`unreachable ${e && e.message} -> noop`); emit('noop') })
})
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run tests/hook.test.ts`
Expected: PASS (relay-allow → PermissionRequest decision, no-op-missing-socket).

- [ ] **Step 5: Commit**

```bash
git add hook/claude-island-hook.cjs hook/decision.cjs tests/hook.test.ts
git commit -m "fix: hook uses PermissionRequest event, fails open as no-op"
```

## Task B3: Safe hook installer (fix the matcher)

**Files:**
- Create: `hook/install.js`
- Modify: `hook/README.md`

**Interfaces:**
- `node hook/install.js` — reads `~/.claude/settings.json`, backs it up to
  `settings.json.bak`, registers a **`PermissionRequest`** entry with
  **`"matcher": ".*"`** and `timeout: 60`, pointing at the absolute path of
  `claude-island-hook.cjs`. **Also removes the old broken `PreToolUse` `"*"`
  island entry** if present. Idempotent; preserves unrelated hooks.

- [ ] **Step 1: Implement `hook/install.js`**

```js
#!/usr/bin/env node
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
const hookCmd = `node ${path.resolve(__dirname, 'claude-island-hook.cjs')}`

const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
fs.writeFileSync(settingsPath + '.bak', JSON.stringify(s, null, 2))

s.hooks = s.hooks || {}
const stripIsland = (arr) =>
  (arr || []).filter((e) => !JSON.stringify(e).includes('claude-island-hook'))

// Remove any prior island entry from the old (broken) PreToolUse wiring.
s.hooks.PreToolUse = stripIsland(s.hooks.PreToolUse)
if (s.hooks.PreToolUse.length === 0) delete s.hooks.PreToolUse

// Register on PermissionRequest (fires only when Claude needs permission).
s.hooks.PermissionRequest = stripIsland(s.hooks.PermissionRequest)
s.hooks.PermissionRequest.push({
  matcher: '.*',
  hooks: [{ type: 'command', command: hookCmd, timeout: 60 }],
})

fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2))
console.log('Installed island hook on PermissionRequest (matcher ".*") ->', hookCmd)
console.log('Backup at', settingsPath + '.bak')
```

- [ ] **Step 2: Run the installer and verify**

Run: `node hook/install.js && node -e "const s=require(process.env.HOME+'/.claude/settings.json'); const e=s.hooks.PermissionRequest.find(x=>JSON.stringify(x).includes('claude-island-hook')); console.log('matcher=', e.matcher, 'timeout=', e.hooks[0].timeout)"`
Expected: prints `Installed island hook on PermissionRequest ...` and `matcher= .* timeout= 60`.

- [ ] **Step 3: Update `hook/README.md`**

Document `node hook/install.js` as the recommended install; explain it registers on
**`PermissionRequest`** (only fires on real permission prompts — no spam) and
removes the old broken `PreToolUse "*"` entry; document the no-op fail-open
behavior and `DYNAMIC_ISLAND_DEBUG_LOG` for troubleshooting.

- [ ] **Step 4: Commit**

```bash
git add hook/install.js hook/README.md
git commit -m "feat: safe hook installer that repairs the matcher regex"
```

## Task B4: Live end-to-end approval verification

**Files:** none (verification only)

- [ ] **Step 1: Start the island (no demo)**

Run: `rm -rf out && npm run build && DISPLAY=:1 ./node_modules/.bin/electron out/main/main.js &`

- [ ] **Step 2: Fire a mutating-tool hook request and confirm the card + round-trip**

Run in another shell:
```bash
echo '{"tool_name":"Bash","tool_input":{"command":"echo hi"}}' | \
  DYNAMIC_ISLAND_SOCK=${XDG_RUNTIME_DIR:-/tmp}/dynamic-island.sock \
  node hook/claude-island-hook.cjs
```
Expected: the island shows an Approve/Deny card; clicking **Allow** makes the
command print
`{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}`
and exit. (Interactivity from Phase A makes the click work.)

- [ ] **Step 3: Confirm fail-open no-op when island is off**

Run (island stopped):
```bash
echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | \
  DYNAMIC_ISLAND_SOCK=/tmp/nope.sock node hook/claude-island-hook.cjs; echo "[exit $?]"
```
Expected: **no output**, exit 0 → Claude would fall back to its own prompt.

- [ ] **Step 4: Confirm the fix in a real Claude session (manual)**

Install the hook (B3), start the island, then start a Claude Code session and have
it run a command that needs permission → the approval appears **only then** on the
island (no spam for allowlisted/read-only calls); approving there lets Claude
proceed without a terminal prompt.

---

# PHASE C — Mac-grade look & motion

## Task C1: Apple spring values + squircle corners

**Files:**
- Modify: `renderer/anim/spring.ts`
- Create: `renderer/island/squircle.ts`, `tests/squircle.test.ts`
- Add dep: `squircle.js` (or `figma-squircle`)

**Interfaces:**
- `spring` = `{ type:'spring', stiffness:360, damping:30, mass:1 }`;
  `collapseSpring` = `{ type:'spring', stiffness:420, damping:32, mass:1 }`.
- `squirclePath(width, height, radius, smoothing=0.6): string` — SVG path `d` for a
  superellipse-cornered rounded rect. **Pure, tested.**

- [ ] **Step 1: Add dependency**

Run: `npm install figma-squircle`
Expected: added to dependencies.

- [ ] **Step 2: Failing test** — `tests/squircle.test.ts`

```ts
import { squirclePath } from '../renderer/island/squircle'

test('returns a non-trivial SVG path for a rounded rect', () => {
  const d = squirclePath(100, 40, 20, 0.6)
  expect(typeof d).toBe('string')
  expect(d.length).toBeGreaterThan(20)
  expect(d.startsWith('M')).toBe(true) // path moveto
})
```

- [ ] **Step 3: Run — expect fail**

Run: `npx vitest run tests/squircle.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `renderer/island/squircle.ts`**

```ts
import { getSvgPath } from 'figma-squircle'

export function squirclePath(
  width: number,
  height: number,
  radius: number,
  smoothing = 0.6,
): string {
  return getSvgPath({ width, height, cornerRadius: radius, cornerSmoothing: smoothing })
}
```

- [ ] **Step 5: Run — expect pass**

Run: `npx vitest run tests/squircle.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Update springs** — `renderer/anim/spring.ts`

```ts
export const spring = { type: 'spring', stiffness: 360, damping: 30, mass: 1 } as const
export const collapseSpring = { type: 'spring', stiffness: 420, damping: 32, mass: 1 } as const
export const contentFade = { duration: 0.18 } as const
```

- [ ] **Step 7: Apply squircle clip to the island shell** — `renderer/island/Island.tsx`

Wrap the pill in an element whose `clipPath` is set from `squirclePath(w,h,r)` using
the measured size (from the same ref used in A3). Fall back to `borderRadius` while
size is unknown. Keep the shell background solid black.

- [ ] **Step 8: Commit**

```bash
git add renderer/anim/spring.ts renderer/island/squircle.ts tests/squircle.test.ts renderer/island/Island.tsx package.json package-lock.json
git commit -m "feat: Apple spring values + squircle (superellipse) corners"
```

## Task C2: Presentation selector + compact/minimal/expanded states

**Files:**
- Create: `shared/present.ts`, `tests/present.test.ts`
- Modify: `renderer/island/Island.tsx`, `renderer/island/states/*`

**Interfaces:**
- `present(list: Activity[], opts:{expanded:boolean}): Presentation` where
  `Presentation =`
  - `{ mode:'idle' }`
  - `{ mode:'compact', primary:Activity }`
  - `{ mode:'minimal', primary:Activity, detached:Activity }`
  - `{ mode:'expanded', primary:Activity }`
  Rules: 0 activities → idle; 1 → compact (or expanded if `opts.expanded`);
  ≥2 → minimal (highest priority primary attached, 2nd priority detached);
  an `approval` activity forces `expanded`.

- [ ] **Step 1: Failing test** — `tests/present.test.ts`

```ts
import { present } from '../shared/present'
import type { Activity } from '@shared/types'

const media: Activity = { kind:'media', id:'media', priority:1,
  media:{ title:'S', artist:'A', playing:true, canControl:true } }
const approval: Activity = { kind:'approval', id:'a1', priority:10,
  request:{ id:'a1', toolName:'Bash', inputSummary:'x' } }

test('idle when empty', () => {
  expect(present([], { expanded:false }).mode).toBe('idle')
})
test('single media compact, expands on hover', () => {
  expect(present([media], { expanded:false }).mode).toBe('compact')
  expect(present([media], { expanded:true }).mode).toBe('expanded')
})
test('approval forces expanded', () => {
  expect(present([approval, media], { expanded:false }).mode).toBe('expanded')
})
test('two ambient activities -> minimal with detached', () => {
  const other: Activity = { ...media, id:'m2', priority:2 }
  const p = present([media, other], { expanded:false })
  expect(p.mode).toBe('minimal')
  if (p.mode === 'minimal') {
    expect(p.primary.id).toBe('m2')     // higher priority attached
    expect(p.detached.id).toBe('media')
  }
})
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run tests/present.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `shared/present.ts`**

```ts
import type { Activity } from './types'

export type Presentation =
  | { mode: 'idle' }
  | { mode: 'compact'; primary: Activity }
  | { mode: 'minimal'; primary: Activity; detached: Activity }
  | { mode: 'expanded'; primary: Activity }

export function present(list: Activity[], opts: { expanded: boolean }): Presentation {
  if (list.length === 0) return { mode: 'idle' }
  const sorted = [...list].sort((a, b) => b.priority - a.priority)
  const primary = sorted[0]
  const forceExpanded = primary.kind === 'approval' || opts.expanded
  if (forceExpanded) return { mode: 'expanded', primary }
  if (sorted.length >= 2) return { mode: 'minimal', primary, detached: sorted[1] }
  return { mode: 'compact', primary }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run tests/present.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Render the four modes** — `renderer/island/Island.tsx` + states

- `idle`: tiny pill (existing `IdlePill`).
- `compact`: a `CompactMedia` with **leading** (album art / app glyph) and
  **trailing** (animated waveform for media; icon for other) hugging a ~14px
  virtual center gap.
- `minimal`: primary shown as the attached compact pill + a separate small circle
  (the detached activity's glyph) offset to the right by ~10px.
- `expanded`: `MediaCard` (art, title/artist, transport) or `ApprovalCard`
  (existing), laid out with leading/trailing/center/bottom structure.

Drive all via Framer Motion `layout` on the shell + children, `AnimatePresence`
with the staggered `contentFade`. Report the shell rect (A3) after morph.

- [ ] **Step 6: Manual verification**

Run: `rm -rf out && npm run build && DISPLAY=:1 DI_DEMO=1 ./node_modules/.bin/electron out/main/main.js`
Then: `DISPLAY=:1 import -window root -crop 1000x200+460+0 /tmp/di-c2.png`
Expected: compact pill with leading/trailing; hover expands with spring; the demo
approval auto-expands; with two demo activities the minimal detached circle shows.

- [ ] **Step 7: Commit**

```bash
git add shared/present.ts tests/present.test.ts renderer/island
git commit -m "feat: compact/minimal/expanded presentations with leading/trailing regions"
```

## Task C3: Gooey split/merge inside the pill

**Files:**
- Create: `renderer/island/Goo.tsx`
- Modify: `renderer/island/Island.tsx` (wrap the attached-pill + detached-circle in Goo during minimal transitions)

**Interfaces:**
- `<Goo>{children}</Goo>` — renders an inline SVG `goo` filter and applies it to a
  wrapper `div` (opaque black shapes only; `aria-hidden`; interactive content stays
  OUTSIDE the filtered group per research — the filter traps pointer events).

- [ ] **Step 1: Implement `renderer/island/Goo.tsx`**

```tsx
import { useId } from 'react'

export function Goo({ children }: { children: React.ReactNode }) {
  const id = useId().replace(/[:]/g, '')
  return (
    <div aria-hidden style={{ filter: `url(#goo-${id})` }}>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <filter id={`goo-${id}`} colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
          <feColorMatrix in="blur" mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </svg>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Use Goo for the minimal split** — `renderer/island/Island.tsx`

In `minimal` mode, render the attached pill and the detached circle as two solid
black shapes inside `<Goo>` so they visually pinch/merge as the circle detaches.
Keep text/buttons rendered ABOVE (outside) the Goo wrapper so they stay crisp and
clickable.

- [ ] **Step 3: Manual verification**

Run: `rm -rf out && npm run build && DISPLAY=:1 DI_DEMO=1 ./node_modules/.bin/electron out/main/main.js`
Expected: when a second activity appears, the detached circle separates from the
pill with a liquid "goo" bridge, then snaps apart. Text stays sharp.

- [ ] **Step 4: Commit**

```bash
git add renderer/island/Goo.tsx renderer/island/Island.tsx
git commit -m "feat: gooey metaball split/merge for the minimal detached circle"
```

## Task C4: Final polish pass + README/demo update

**Files:**
- Modify: `README.md`; add `DI_DEMO=2` (two activities) to `electron/main.ts`

- [ ] **Step 1: Add a two-activity demo mode** — `electron/main.ts`

When `DI_DEMO === '2'`, seed media + a second ambient activity (e.g. a fake
"timer") so the minimal/goo path is demoable.

- [ ] **Step 2: Full test run**

Run: `npm test`
Expected: all unit tests pass (hitbox, cursor, hook-decision, hook, squircle,
present, plus prior store/protocol/media/claude-server).

- [ ] **Step 3: Update `README.md`**

Document: `xdotool` dependency, `node hook/install.js`, `DI_DEMO=1|2`, the X11-only
limitation, and the interactivity model (cursor hit-testing).

- [ ] **Step 4: Commit**

```bash
git add README.md electron/main.ts
git commit -m "docs: xdotool dep, installer, two-activity demo; final polish"
```

---

## Self-review notes

- **Spec/finding coverage:** click-through root cause → A1–A3; transparency/always-
  on-top → A4; PermissionRequest hook + fail-open no-op + installer → B1–B3; live
  verification → B4; springs + squircle → C1; states/presentations → C2; goo merge
  → C3. All research §6/§7 items mapped.
- **Type consistency:** `Rect` defined once in `shared/hitbox.ts` and re-exported via
  `shared/types.ts`; `Presentation` in `shared/present.ts`; `buildDecision(behavior)`
  in `hook/decision.cjs` used by both the hook script and tests; decision JSON uses
  `hookSpecificOutput.decision.behavior` (PermissionRequest shape) consistently.
- **Claude mechanism (confirmed):** `PermissionRequest` fires only on real permission
  prompts (no tool-scoping needed); 600s default timeout; `decision.behavior`
  allow/deny; fail-open = no output. The existing socket protocol (request/decision)
  and store are reused unchanged — only the hook script + settings change.
- **Known follow-ups (not v1 blockers):** X11 SHAPE input region (polling-free hover)
  is a future upgrade over the 40ms cursor loop; optional `decision.permissionRule`
  memoisation; Wayland support out of scope.
```
