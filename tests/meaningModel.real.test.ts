// Search by meaning with the real model, not the test stand-in: its files
// download from where the app gets them, and it finds notes in a small vault
// at least as well as the model and whole-note reading it replaced. Needs the
// network, so it runs only with DI_REAL_EMBED=1 (the "Search by meaning (real
// model)" workflow); the numbers go to the run's summary.
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DIMS, EMBED_FILES, EMBED_MB, EMBED_MODEL, EMBED_POOLING, MEANING_MIN, OLD_EMBED_MODELS, QUERY_PREFIX, chunkText, cosine, noteChunks, unit } from '../shared/meaning'
import { MeaningIndex } from '../electron/brain/meaning'

const REAL = !!process.env.DI_REAL_EMBED

/** How the brain read a note before sections: its title and the start of its body. */
function wholeNote(title: string, body: string, max = 1200): string {
  const clean = body
    .replace(/^---[\s\S]*?\n---\n?/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/[#>*_`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${title}. ${clean}`.slice(0, max)
}

const log = (lines: string[], from: number) => lines.map((l, i) => `- 2026-${String(9 + Math.floor((from + i) / 28)).padStart(2, '0')}-${String(1 + ((from + i) % 28)).padStart(2, '0')}: ${l}`).join('\n')

/** A small vault like a real one: projects, people, resources, decisions, a session; some facts deep in long notes. */
const VAULT: Record<string, { title: string; body: string }> = {
  '02-projects/robot-arm/robot-arm.md': {
    title: 'Robot arm',
    body: `# Robot arm

## Goal

Pick parts off the conveyor and drop them in the right bin, for the warehouse demo in December.

## Hardware

A six-axis arm from a kit with Dynamixel servos, a Raspberry Pi 5 as the controller, and an Intel RealSense depth camera on a bracket above the belt.

## Software

ROS 2 Humble on Ubuntu 22.04, MoveIt for motion planning, and our own grasp node in Python that picks a grasp from the point cloud.

## Log

${log(
  [
    'Mounted the camera bracket; recalibrated the extrinsics.',
    'MoveIt plans fine in simulation; the real arm overshoots on joint 3.',
    'Tuned the PID gains on joint 3; overshoot is down to two degrees.',
    'Wrote the bin layout config; five bins along the belt.',
    'The grasp node now ranks grasps by how flat the surface is.',
    'Belt speed set to 0.2 m/s for the demo.',
    'Replaced a stripped servo horn on the wrist.',
    'Added an emergency stop button wired to the controller.',
    'Measured cycle time: 7.5 seconds per pick, the target is 6.',
    'Cable management on the elbow; nothing snags at full rotation now.',
    'Lowered the gripper torque limit to 2 Nm after it crushed a plastic cup during testing.',
    'Simulation and the real arm agree within a centimetre at the bins.',
  ],
  0,
)}

## Open questions

Whether to switch to a suction cup for the flat parts.`,
  },
  '02-projects/robot-arm/vision.md': {
    title: 'Robot arm vision',
    body: `# Robot arm vision

## Calibration

Calibrated the depth camera with a checkerboard at nine poses; reprojection error 0.3 px.

## Problem

Shiny metal parts leave holes in the depth image, so the grasp node sees nothing there. Try a polarizing filter, or a structured light sensor instead.`,
  },
  '02-projects/dynamic-island-linux/dynamic-island-linux.md': {
    title: 'Dynamic Island for Linux',
    body: `# Dynamic Island for Linux

## What

A notch-style status island for the Ubuntu desktop, built with Electron, that shows what Claude Code is doing and asks before it runs anything risky.

## Releases

${log(
  [
    'v0.5.0: the island OS with agents and the morning card.',
    'v0.6.0: orbs instead of faces for the characters.',
    'v0.7.0: one island with a tab bar of line icons.',
    'v0.8.0: the orb on the phone, and a side dock that stays put.',
    'Release workflow now verifies the installers on macOS and Windows runners.',
    'Linux packages: .deb and AppImage, both signed with the checksum file.',
  ],
  0,
)}

## Phone app

An Expo app for Android: the island on the phone, approvals, files both ways, and widgets for the home screen and the lock screen. Its APK is built in CI on every change to the app.

## Ideas

${log(
  [
    'Let the island show the weather when nothing else is happening.',
    'A keyboard shortcut to open the last approval.',
    'Show the cost of each Claude Code session in the recap.',
    'Use the phone vibrating in short taps to say how many approvals are waiting.',
    'Dark mode that follows sunset instead of the system setting.',
  ],
  10,
)}`,
  },
  '07-world-model/people/asha.md': {
    title: 'Asha Rao',
    body: `# Asha Rao

## Who

Mechanical engineer at the maker space; she designs and prints the gripper fingers for the robot arm.

## Notes

Prefers calls in the evening. Allergic to peanuts. Birthday on 14 March.`,
  },
  '07-world-model/people/vikram.md': {
    title: 'Vikram Mehta',
    body: `# Vikram Mehta

## Who

A friend from college who now runs a small angel fund.

## Notes

Asked for a two-minute demo video of the island before our next meeting. Likes short monthly updates by email.`,
  },
  '04-resources/health/running.md': {
    title: 'Running plan',
    body: `# Running plan

## Plan

Three easy runs a week and one long run on Sunday, building to a half marathon in February.

## Injuries

The left knee hurt after the 15 km run. The physio said to strengthen the hips and cut the weekly distance for two weeks.`,
  },
  '04-resources/finance/trading-rules.md': {
    title: 'Trading rules',
    body: `# Trading rules

## Rules

Never risk more than 1% of the account on one trade. Set the stop loss before entering. No trades in the first 15 minutes after the open.

## Journal

${log(
  [
    'Bought Reliance on the breakout; sold at the target for +2R.',
    'Skipped a trade on HDFC Bank because the setup was not clean.',
    'Small loss on Tata Motors; the stop was hit on a wide candle.',
    'Nifty futures scalp; flat after fees.',
    'Missed the entry on ITC and did not chase it. Good.',
    'Wipro gap up; waited for the first pullback and took +1R.',
    'Lost money on an Infosys earnings gap because I held through the results.',
    'Reviewed the month: win rate 48%, average win 1.9R.',
    'Moved the stop to break even too early on Axis Bank; it then ran.',
    'No trades this week; the market was choppy.',
  ],
  3,
)}`,
  },
  '06-brain/decisions/2026-10-02-electron-over-tauri.md': {
    title: 'Electron over Tauri',
    body: `We chose Electron instead of Tauri because the island needs transparent click-through windows on X11, and Tauri's webview flickered with transparency on Linux. Revisit when webkit2gtk fixes it.`,
  },
  '09-sources/claude-code/2026-11-01-side-dock.md': {
    title: 'Session: the side dock',
    body: `# Session: the side dock

${log(
  [
    'Asked Claude Code to look at the mac smoke test failing on the Agents tab click.',
    'It reproduced the failure under xvfb with the side dock on the left.',
    'The Playwright click failed with "element is not stable", then "element was detached".',
    'It added a probe that logs the bar position every frame.',
    'The probe showed the bar at y=84 most of the time, but sometimes at y=12.',
    'Checked the preload: the state channels are only sent on change.',
    'Found that the renderer subscribes after the first dock message was sent, so it misses it.',
    'Added a cache in the preload so each channel replays its last value to new listeners.',
    'The panel jumped because its top was computed before the dock position arrived; the fix sends the dock position right after the window loads.',
    'Added panelTop to place the open panel inside the screen.',
    'All smoke tests pass on mac, windows and linux.',
  ],
  0,
)}`,
  },
  '04-resources/home/apartment.md': {
    title: 'Apartment',
    body: `# Apartment

## Lease

Rent is 32,000 a month, paid on the 5th. The lease renews in June.

## Wifi

The router is in the hall cupboard; restart it if the fibre light blinks red.

## Landlord

Mr. Kulkarni, who prefers WhatsApp messages to calls.`,
  },
  '04-resources/recipes/dal.md': {
    title: 'Dal tadka',
    body: `# Dal tadka

## Ingredients

Toor dal, ghee, cumin seeds, garlic, dried red chillies, tomato, turmeric, salt.

## Steps

Pressure cook the dal with turmeric for three whistles. Heat ghee, crackle the cumin, add garlic and chillies, then the tomato, and pour it over the dal.`,
  },
  '01-inbox/2026-11-08-idea-voice.md': {
    title: 'Idea: voice memos',
    body: `Record a voice memo on the phone and have it transcribed straight into the brain's inbox.`,
  },
  '06-brain/shelves/books.md': {
    title: 'Books',
    body: `# Books

## Reading

Thinking in Systems by Donella Meadows.

## Finished

The Pragmatic Programmer. Deep Work by Cal Newport, on doing hard work without distraction.

## Want to read

Designing Data-Intensive Applications.`,
  },
  '04-resources/travel/japan.md': {
    title: 'Japan trip',
    body: `# Japan trip

## Plan

Four nights in Tokyo and three in Kyoto in early April, for the cherry blossoms.

## Bookings

JR pass ordered. A ryokan in Kyoto with a private onsen is booked for the last two nights.`,
  },
}

/** Questions in other words than the notes', and the note that answers each. */
const ASK: [string, string][] = [
  ['why did the gripper get weaker', '02-projects/robot-arm/robot-arm.md'],
  ['which framework did we pick for the desktop app and why', '06-brain/decisions/2026-10-02-electron-over-tauri.md'],
  ['who makes the hand parts for the robot', '07-world-model/people/asha.md'],
  ['which friend cannot eat nuts', '07-world-model/people/asha.md'],
  ['what did the physiotherapist tell me about my leg', '04-resources/health/running.md'],
  ['how much can I lose on a single position', '04-resources/finance/trading-rules.md'],
  ['losing money by keeping a stock through quarterly results', '04-resources/finance/trading-rules.md'],
  ['why did the panel move when it opened', '09-sources/claude-code/2026-11-01-side-dock.md'],
  ['how much do I pay for housing each month', '04-resources/home/apartment.md'],
  ['the internet is not working, what should I do', '04-resources/home/apartment.md'],
  ['how to cook lentils', '04-resources/recipes/dal.md'],
  ['a book about concentration', '06-brain/shelves/books.md'],
  ['the camera cannot see glossy objects', '02-projects/robot-arm/vision.md'],
  ['hotel with a private hot spring', '04-resources/travel/japan.md'],
  ['what does the investor want before we meet', '07-world-model/people/vikram.md'],
  ['the phone buzzes to tell me how many things wait for me', '02-projects/dynamic-island-linux/dynamic-island-linux.md'],
  ['turn spoken notes into text', '01-inbox/2026-11-08-idea-voice.md'],
]

/** Questions nothing in the vault answers. */
const NOTHING = ['best price for a used motorcycle', 'who won the football world cup in 1998', 'symptoms of a cold in cats']

/**
 * The model library as the island's worker runs it: its browser build, on
 * WebAssembly (onnxruntime-web, which runs in Node too), the model's files
 * read from island-model://models/ as the app serves them. (Its Node build
 * wants native parts this repository stubs out: see stubs/README.md.)
 */
export async function library(models: string) {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (!url.startsWith('island-model://models/')) return realFetch(input, init)
    try {
      const file = join(models, decodeURIComponent(url.slice('island-model://models/'.length)))
      if (!file.startsWith(models) || !statSync(file).isFile()) throw new Error('not here')
      const buf = readFileSync(file)
      return new Response(buf, { status: 200, headers: { 'content-length': String(buf.length) } })
    } catch {
      return new Response(null, { status: 404 })
    }
  }) as typeof fetch
  const ort = await import('onnxruntime-web')
  ;(globalThis as any)[Symbol.for('onnxruntime')] = ort
  const web = fileURLToPath(new URL('../node_modules/@huggingface/transformers/dist/transformers.web.js', import.meta.url))
  // It decides at load whether it's in Node; here it's to act as in the browser.
  const release = process.release
  Object.defineProperty(process, 'release', { value: { ...release, name: 'browser' }, configurable: true, writable: true })
  let t: typeof import('@huggingface/transformers')
  try {
    t = (await import(pathToFileURL(web).href)) as typeof import('@huggingface/transformers')
  } finally {
    Object.defineProperty(process, 'release', { value: release, configurable: true, writable: true })
  }
  t.env.allowRemoteModels = false
  t.env.allowLocalModels = true
  t.env.useBrowserCache = false
  t.env.localModelPath = 'island-model://models/'
  // Its own WebAssembly files, not a CDN's; one thread, as in the worker.
  ort.env.wasm.wasmPaths = undefined as any
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  type Extract = (texts: string[], o: { pooling: 'mean' | 'cls'; normalize: boolean }) => Promise<{ data: Float32Array; dims: number[] }>
  return {
    close: () => void (globalThis.fetch = realFetch),
    /** A model's feature extraction (the q8 file, as the worker loads it). */
    load: async (id: string) => (await t.pipeline('feature-extraction', id, { dtype: 'q8', device: 'auto' as any, session_options: { executionProviders: ['wasm'] } })) as unknown as Extract,
  }
}

/** A model's files, fetched as the app fetches them (ModelFiles), into `root`. Returns their total size. */
async function download(root: string, id: string, files: string[]): Promise<number> {
  let total = 0
  for (const rel of files) {
    const res = await fetch(`https://huggingface.co/${id}/resolve/main/${rel}`)
    expect(res.ok, `${id}/${rel}: HTTP ${res.status}`).toBe(true)
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.length, `${id}/${rel} is empty`).toBeGreaterThan(0)
    if (rel.endsWith('.json')) JSON.parse(buf.toString('utf8'))
    mkdirSync(dirname(join(root, id, rel)), { recursive: true })
    writeFileSync(join(root, id, rel), buf)
    total += buf.length
  }
  return total
}

type Ranked = { path: string; score: number; chunk?: number }
type Way = { name: string; rank: (q: string) => Promise<Ranked[]> }

function score(way: string, ranked: Ranked[][]) {
  let hit1 = 0
  let hit3 = 0
  let rr = 0
  ASK.forEach(([, want], i) => {
    const at = ranked[i].findIndex((r) => r.path === want)
    if (at === 0) hit1++
    if (at >= 0 && at < 3) hit3++
    if (at >= 0) rr += 1 / (at + 1)
  })
  return { way, hit1: hit1 / ASK.length, hit3: hit3 / ASK.length, mrr: rr / ASK.length }
}

test.skipIf(!REAL)(
  'the real model: its files download, and sections find notes better than whole notes did',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'models-'))
    const out: string[] = []
    const say = (s: string) => (out.push(s), console.log(s))

    // ---- the files, as the app downloads them ----
    const bytes = await download(root, EMBED_MODEL, EMBED_FILES)
    say(`${EMBED_MODEL}: ${EMBED_FILES.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB (the app says ${EMBED_MB} MB)`)
    expect(Math.abs(bytes / 1024 / 1024 - EMBED_MB) / EMBED_MB).toBeLessThan(0.15)
    const [old] = OLD_EMBED_MODELS
    await download(root, old, EMBED_FILES)

    const { load } = await library(root)
    type Extract = Awaited<ReturnType<typeof load>>
    const embedder = (fx: Extract, pooling: 'mean' | 'cls') => async (texts: string[]) => {
      const t = await fx(texts, { pooling, normalize: true })
      const dims = t.dims[t.dims.length - 1]
      expect(dims).toBe(DIMS)
      return texts.map((_, i) => t.data.slice(i * dims, (i + 1) * dims))
    }
    const bge = embedder(await load(EMBED_MODEL), EMBED_POOLING)
    const bgeMean = embedder(await load(EMBED_MODEL), 'mean')
    const mini = embedder(await load(old), 'mean')

    // ---- the ways to read the vault ----
    const notes = Object.entries(VAULT)
    const sections = (path: string) => noteChunks(VAULT[path].body).map((c) => chunkText(VAULT[path].title, c))
    const byChunks = async (name: string, embed: (t: string[]) => Promise<Float32Array[]>, model: string): Promise<Way> => {
      const idx = new MeaningIndex(join(mkdtempSync(join(tmpdir(), 'idx-')), 'meaning'), model)
      const list = notes.map(([path]) => ({ path, mtime: 1, chunks: () => sections(path) }))
      while ((await idx.update(list, embed, 1000)) > 0);
      return { name, rank: (q) => idx.query(q, embed, 100) }
    }
    const byWholeNote = async (name: string, embed: (t: string[]) => Promise<Float32Array[]>, prefix: string): Promise<Way> => {
      const vs = await embed(notes.map(([, n]) => wholeNote(n.title, n.body)))
      return {
        name,
        rank: async (q) => {
          const [qv] = await embed([prefix + q])
          return notes.map(([path], i) => ({ path, score: cosine(unit(qv), unit(vs[i])) })).sort((a, b) => b.score - a.score)
        },
      }
    }
    const t0 = Date.now()
    const shipping = await byChunks(`${EMBED_MODEL}, by section (${EMBED_POOLING}), as shipped`, bge, EMBED_MODEL)
    const sectionsMs = Date.now() - t0
    const ways: Way[] = [
      await byWholeNote(`${old}, whole note (before)`, mini, ''),
      await byChunks(`${old}, by section`, mini, old),
      await byWholeNote(`${EMBED_MODEL}, whole note`, bge, QUERY_PREFIX),
      await byChunks(`${EMBED_MODEL}, by section (mean)`, bgeMean, EMBED_MODEL),
      shipping,
    ]
    const results = []
    const ranked = new Map<Way, Ranked[][]>()
    for (const w of ways) {
      const r = []
      for (const [q] of ASK) r.push(await w.rank(q))
      ranked.set(w, r)
      results.push(score(w.name, r))
    }
    say('')
    say('| Way | Top 1 | Top 3 | MRR |')
    say('|---|---|---|---|')
    for (const r of results) say(`| ${r.way} | ${(r.hit1 * 100).toFixed(0)}% | ${(r.hit3 * 100).toFixed(0)}% | ${r.mrr.toFixed(3)} |`)
    const chunkCount = notes.reduce((s, [p]) => s + sections(p).length, 0)
    say('')
    say(`${notes.length} notes in ${chunkCount} sections, read in ${sectionsMs} ms with the new model (${(sectionsMs / chunkCount).toFixed(0)} ms a section here).`)

    // ---- what the shipped way found, and how close ----
    say('')
    say('| Question | Found | Score | Expected at | Section |')
    say('|---|---|---|---|---|')
    const mine = ranked.get(shipping)!
    const wanted: number[] = []
    ASK.forEach(([q, want], i) => {
      const at = mine[i].findIndex((r) => r.path === want)
      const hit = mine[i][at]
      wanted.push(hit?.score ?? -1)
      const c = hit?.chunk !== undefined ? noteChunks(VAULT[want].body)[hit.chunk] : undefined
      say(`| ${q} | ${mine[i][0].path.split('/').pop()} | ${mine[i][0].score.toFixed(3)} | ${at + 1} (${hit?.score.toFixed(3)}) | ${c ? (c.heading ? `${c.heading}: ` : '') + c.text.slice(0, 70) : ''} |`)
    })
    const idx = new MeaningIndex(join(mkdtempSync(join(tmpdir(), 'idx-')), 'meaning'))
    const list = notes.map(([path]) => ({ path, mtime: 1, chunks: () => sections(path) }))
    while ((await idx.update(list, bge, 1000)) > 0);
    const none: number[] = []
    for (const q of NOTHING) {
      const [top] = await idx.query(q, bge, 1)
      none.push(top.score)
      say(`| ${q} (nothing answers it) | ${top.path.split('/').pop()} | ${top.score.toFixed(3)} | - | - |`)
    }
    const lowest = Math.min(...wanted)
    const highestNone = Math.max(...none)
    say('')
    say(`Answers scored ${lowest.toFixed(3)} to ${Math.max(...wanted).toFixed(3)}; questions nothing answers, up to ${highestNone.toFixed(3)}. MEANING_MIN is ${MEANING_MIN}.`)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Search by meaning, real model\n\n${out.join('\n')}\n`)

    // ---- what must hold ----
    const [before] = results
    const now = results[results.length - 1]
    expect(now.mrr).toBeGreaterThanOrEqual(before.mrr)
    expect(now.hit3).toBeGreaterThanOrEqual(before.hit3)
    expect(now.hit3).toBeGreaterThanOrEqual(0.85)
    // The floor lets nearly every answer through and keeps out what answers nothing.
    expect(wanted.filter((s) => s >= MEANING_MIN).length / wanted.length).toBeGreaterThanOrEqual(0.9)
    expect(highestNone).toBeLessThan(MEANING_MIN)
  },
  900_000,
)
