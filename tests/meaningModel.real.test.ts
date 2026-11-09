// Search by meaning with the real model, not the test stand-in: its files
// download from where the app gets them, and it finds notes in a small vault
// better than the model and whole-note reading it replaced, and a few others of its size. Needs the
// network, so it runs only with DI_REAL_EMBED=1 (the "Search by meaning (real
// model)" workflow); the numbers go to the run's summary.
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DIMS, EMBED_FILES, EMBED_MB, EMBED_MODEL, EMBED_POOLING, MEANING_MIN, OLD_EMBED_MODELS, chunkText, cosine, noteChunks, unit } from '../shared/meaning'
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
  '09-sources/whatsapp/2026-11-03-family.md': {
    title: 'WhatsApp: Family',
    body: `# WhatsApp: Family

Mom: Are you all coming for dinner on Sunday? I am making rajma chawal.
Priya: Yes! I will bring the kids around 7.
Me: I will be there, maybe a little late after the gym.
Dad: Don't forget India is playing Australia on Sunday, the match starts at 2.
Priya: Dad, we know. You have told us five times.
Mom: Someone send me the gajar halwa recipe, the one aunty made last year.
Priya: Grated carrots, full fat milk, sugar, ghee, cardamom and some cashews. Cook the carrots in the milk for an hour until it is thick.
Mom: Thank you beta.
Me: Who is getting the Diwali lights this year? The old ones stopped working.
Dad: I will get them from the market near the temple, they have the warm white ones.
Priya: We also need diyas, rangoli colours and sweets for the neighbours.
Mom: I will make the list. Kaju katli for the neighbours, besan ladoo for us.
Me: I can pick up the sweets on Saturday.
Dad: The car needs servicing before any long drive, remind me.
Priya: The school annual day is on the 20th, the kids are doing a dance.
Mom: Send videos, I want to see.
Dad: Did anyone renew the society parking sticker?
Me: Not yet, I will do it this week.
Priya: Big news, Rohan's wedding is fixed! 12 December in Jaipur, at a heritage hotel near Amer fort.
Mom: Finally! We need to book trains soon, December gets full.
Me: I will look at flights too, it may be easier.
Priya: The sangeet is the night before, they want everyone to dance.
Dad: I am not dancing.
Mom: You are dancing.
Mom: My eye doctor appointment moved to Thursday at 4 pm, can someone drive me? They put drops in so I cannot drive back.
Me: I can take you on Thursday, I will work from home that day.
Priya: Thanks, I have school pickup then.
Dad: The internet at home was down again yesterday.
Me: I changed the Wi-Fi password at your place to neem-tree-42, the old one was on a sticky note on the router.
Dad: Write it down for me.
Mom: Your dad bought a new phone and wants help setting up backups of his photos before the old one dies.
Me: I will set up the photo backups on Sunday after dinner.
Dad: And move my WhatsApp chats too.`,
  },
  '04-resources/meetings/2026-10-standups.md': {
    title: 'Standups, October',
    body: `# Standups, October

${log(
  [
    'Ravi: finishing the login page; blocked on the API for password reset.',
    'Meera: new icons for the settings screens are in Figma for review.',
    'Ankit: a flaky test in the payments suite; looking into a timezone bug.',
    'Me: the island panel animation is smoother; measuring CPU next.',
    'Ravi: password reset works end to end; needs a review.',
    'Meera: onboarding screens redesigned, three instead of five.',
    'Ankit: the payments test is fixed, it assumed UTC.',
    'Me: CPU of the idle island is down from 4% to 1%.',
    'Team: the investor demo moved to the 24th.',
    'Ravi: started on notifications; the Android channel setup is fiddly.',
    'Meera: dark mode colours reviewed with Ravi; two contrast fixes.',
    'Ankit: the release script now tags and uploads in one step.',
    'Me: the orb redraw costs less; one frame is under a millisecond.',
    'Ankit: switched CI to self-hosted runners because the hosted macOS runners kept timing out.',
    'Ravi: notifications done; release notes drafted.',
    'Team: decided to drop Windows 10 support in the next major version.',
    'Team: budget for cloud GPUs approved, 40,000 a month from November.',
    'Meera: leaving at the end of December; her hand-off document is due by the 15th.',
    'Ankit: database backups now run every six hours.',
  ],
  0,
)}`,
  },
  '01-inbox/2026-11-05-mail-digest.md': {
    title: 'Mail, 5 November',
    body: `# Mail, 5 November

## Bills

Electricity bill for October: 2,340, due on 10 November, paid by auto-debit. The mobile plan renewed for three months.

## Newsletters

ROS Discourse: Jazzy gets a new navigation release and a call for testing of the new parameter tools. Rust weekly: a long post on async closures, and a crate for zero-copy parsing. A design newsletter on dense dashboards and when tables beat charts. The weekly market wrap: the index closed flat, metals up, IT services down on weak guidance from two large firms. A podcast episode on habit tracking with paper notebooks. Product Hunt: three new note-taking apps with local AI search.

## Travel

IndiGo booking confirmed: Pune to Bangalore on 21 November, departing 6:40 am, PNR XK4Q2. Web check-in opens 48 hours before.

## Insurance

Health insurance renewal is due by 30 November; the premium went up to 18,500 for the family floater.

## Jobs

A recruiter from a robotics startup in Bangalore asked whether I would talk about a perception engineer role, working on camera-based picking.`,
  },
  '06-brain/signals/weekly/2026-w44.md': {
    title: 'Week 44',
    body: `# Week 44

## Shipped

Three releases of the island (0.7.1 to 0.7.3), the side dock fix, and the phone app's new icons.

## Patterns

- Meetings took 9 hours, double the usual, mostly about the investor demo.
- Most evenings went to the robot arm; the gripper work took four sessions.
- Answered approvals on the phone 41 times, mostly in the morning.

## Body

Slept under six hours on four nights, worst after late debugging sessions. Ran 22 km across three runs and the knee held up.

## Next

Book the Jaipur trip. Finish the hand-off with Meera. Write the investor update.`,
  },
}

/**
 * Questions in other words than the notes', the note that answers each, and
 * the words of the answer in it (where in the note it is decides whether the
 * question is about the note's topic or a fact deep in a long note).
 */
const ASK: [string, string, string][] = [
  ['why did the gripper get weaker', '02-projects/robot-arm/robot-arm.md', 'Lowered the gripper torque'],
  ['which framework did we pick for the desktop app and why', '06-brain/decisions/2026-10-02-electron-over-tauri.md', 'We chose Electron'],
  ['who makes the hand parts for the robot', '07-world-model/people/asha.md', 'designs and prints the gripper fingers'],
  ['which friend cannot eat nuts', '07-world-model/people/asha.md', 'Allergic to peanuts'],
  ['what did the physiotherapist tell me about my leg', '04-resources/health/running.md', 'The physio said'],
  ['how much can I lose on a single position', '04-resources/finance/trading-rules.md', 'Never risk more than 1%'],
  ['losing money by keeping a stock through quarterly results', '04-resources/finance/trading-rules.md', 'Infosys earnings gap'],
  ['why did the panel move when it opened', '09-sources/claude-code/2026-11-01-side-dock.md', 'The panel jumped'],
  ['how much do I pay for housing each month', '04-resources/home/apartment.md', 'Rent is 32,000'],
  ['the internet is not working, what should I do', '04-resources/home/apartment.md', 'restart it if the fibre light'],
  ['how to cook lentils', '04-resources/recipes/dal.md', 'Pressure cook the dal'],
  ['a book about concentration', '06-brain/shelves/books.md', 'Deep Work'],
  ['the camera cannot see glossy objects', '02-projects/robot-arm/vision.md', 'Shiny metal parts'],
  ['hotel with a private hot spring', '04-resources/travel/japan.md', 'ryokan in Kyoto'],
  ['what does the investor want before we meet', '07-world-model/people/vikram.md', 'demo video'],
  ['the phone buzzes to tell me how many things wait for me', '02-projects/dynamic-island-linux/dynamic-island-linux.md', 'phone vibrating in short taps'],
  ['turn spoken notes into text', '01-inbox/2026-11-08-idea-voice.md', 'voice memo'],
  ['when is the wedding in Rajasthan', '09-sources/whatsapp/2026-11-03-family.md', "Rohan's wedding is fixed"],
  ['when do I need to take mom to the eye specialist', '09-sources/whatsapp/2026-11-03-family.md', 'eye doctor appointment'],
  ['network key at my parents house', '09-sources/whatsapp/2026-11-03-family.md', 'neem-tree-42'],
  ['helping dad save his pictures from the old phone', '09-sources/whatsapp/2026-11-03-family.md', 'backups of his photos'],
  ['how much money do we have for graphics cards in the cloud', '04-resources/meetings/2026-10-standups.md', 'budget for cloud GPUs'],
  ['who is quitting the team and when', '04-resources/meetings/2026-10-standups.md', 'leaving at the end of December'],
  ['why did we move builds off the hosted machines', '04-resources/meetings/2026-10-standups.md', 'self-hosted runners'],
  ['which old operating system will we stop supporting', '04-resources/meetings/2026-10-standups.md', 'drop Windows 10'],
  ['what time does my plane leave', '01-inbox/2026-11-05-mail-digest.md', 'departing 6:40 am'],
  ['when does my medical cover need renewing', '01-inbox/2026-11-05-mail-digest.md', 'Health insurance renewal'],
  ['someone asked me about a computer vision job', '01-inbox/2026-11-05-mail-digest.md', 'perception engineer role'],
  ['how much was the power bill', '01-inbox/2026-11-05-mail-digest.md', 'Electricity bill'],
  ['how did I sleep last week', '06-brain/signals/weekly/2026-w44.md', 'Slept under six hours'],
  ['how many hours went to meetings', '06-brain/signals/weekly/2026-w44.md', 'Meetings took 9 hours'],
]

/** Questions nothing in the vault answers. */
const NOTHING = ['best price for a used motorcycle', 'who won the football world cup in 1998', 'symptoms of a cold in cats', 'how to change a car tyre', 'what is the capital of Australia']

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
    if (!res.ok) throw new Error(`${id}/${rel}: HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) throw new Error(`${id}/${rel} is empty`)
    if (rel.endsWith('.json')) JSON.parse(buf.toString('utf8'))
    mkdirSync(dirname(join(root, id, rel)), { recursive: true })
    writeFileSync(join(root, id, rel), buf)
    total += buf.length
  }
  return total
}

/** A model to compare: how it makes one vector of a text, and what it wants before a question. */
type Model = { id: string; pooling: 'mean' | 'cls'; prefix: string; label?: string }
const BGE_PREFIX = 'Represent this sentence for searching relevant passages: '
/** The one before, the one shipped, and a few more of about the same size (one missing its files is skipped). */
const MODELS: Model[] = [
  { id: 'Xenova/all-MiniLM-L6-v2', pooling: 'mean', prefix: '' },
  { id: 'Xenova/bge-small-en-v1.5', pooling: 'cls', prefix: BGE_PREFIX },
  { id: 'Xenova/bge-small-en-v1.5', pooling: 'mean', prefix: BGE_PREFIX, label: 'Xenova/bge-small-en-v1.5 (mean)' },
  { id: 'Snowflake/snowflake-arctic-embed-xs', pooling: 'cls', prefix: BGE_PREFIX },
  { id: 'Xenova/gte-small', pooling: 'mean', prefix: '' },
  { id: 'Xenova/all-MiniLM-L12-v2', pooling: 'mean', prefix: '' },
  { id: 'Xenova/multi-qa-MiniLM-L6-cos-v1', pooling: 'mean', prefix: '' },
]
/** Ways to read a note: one vector for its start (as before), one a section, or both (the closest wins). */
const WAYS = ['whole note', 'by section', 'whole note + sections'] as const
type WayName = (typeof WAYS)[number]

type Ranked = { path: string; score: number; chunk?: number }
type Metrics = { hit1: number; hit3: number; mrr: number; n: number }

/** Where each question's answer is: inside the start of its note the model read before, or past it. */
function isDeep(path: string, at: string): boolean {
  const n = VAULT[path]
  const full = wholeNote(n.title, n.body, Infinity)
  const i = full.indexOf(at)
  if (i < 0) throw new Error(`"${at}" isn't in ${path} as the model reads it`)
  return i + at.length > 1200
}

function metrics(ranked: Ranked[][], only: (i: number) => boolean): Metrics {
  let hit1 = 0
  let hit3 = 0
  let rr = 0
  let n = 0
  ASK.forEach(([, want], i) => {
    if (!only(i)) return
    n++
    const at = ranked[i].findIndex((r) => r.path === want)
    if (at === 0) hit1++
    if (at >= 0 && at < 3) hit3++
    if (at >= 0) rr += 1 / (at + 1)
  })
  return { hit1: hit1 / n, hit3: hit3 / n, mrr: rr / n, n }
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const row = (m: Metrics) => `${pct(m.hit1)} | ${pct(m.hit3)} | ${m.mrr.toFixed(3)}`

test.skipIf(!REAL)(
  'the real model: its files download, and it finds notes better than the model and reading before it',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'models-'))
    const out: string[] = []
    const say = (s: string) => (out.push(s), console.log(s))
    const notes = Object.entries(VAULT)
    const deep = ASK.map(([, path, at]) => isDeep(path, at))
    say(`${notes.length} notes; ${ASK.length} questions, ${deep.filter(Boolean).length} of them about a fact past the first 1200 characters of its note; ${NOTHING.length} that nothing answers.`)

    // ---- the shipped model's files, as the app downloads them ----
    const bytes = await download(root, EMBED_MODEL, EMBED_FILES)
    say(`${EMBED_MODEL}: ${EMBED_FILES.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB (the app says ${EMBED_MB} MB)`)
    const { load } = await library(root)
    type Extract = Awaited<ReturnType<typeof load>>
    const loaded = new Map<string, Extract | string>()
    const pipe = async (id: string): Promise<Extract | string> => {
      if (!loaded.has(id)) {
        try {
          if (id !== EMBED_MODEL) await download(root, id, EMBED_FILES)
          loaded.set(id, await load(id))
        } catch (e) {
          loaded.set(id, String((e as Error)?.message ?? e).slice(0, 120))
        }
      }
      return loaded.get(id)!
    }
    const embedder = (fx: Extract, pooling: 'mean' | 'cls') => async (texts: string[]) => {
      const vs: Float32Array[] = []
      for (let i = 0; i < texts.length; i += 16) {
        const t = await fx(texts.slice(i, i + 16), { pooling, normalize: true })
        const dims = t.dims[t.dims.length - 1]
        expect(dims).toBe(DIMS)
        for (let k = 0; k < t.dims[0]; k++) vs.push(unit(t.data.slice(k * dims, (k + 1) * dims)))
      }
      return vs
    }
    const sections = (path: string) => noteChunks(VAULT[path].body).map((c) => chunkText(VAULT[path].title, c))

    // ---- each model, each way ----
    say('')
    say('| Model | Way | All: top 1 | top 3 | MRR | Deep: top 1 | top 3 | MRR | Answers score | Nothing scores up to | ms a section |')
    say('|---|---|---|---|---|---|---|---|---|---|---|')
    const table: { model: string; way: WayName; all: Metrics; deep: Metrics }[] = []
    for (const m of MODELS) {
      const name = m.label ?? m.id
      const fx = await pipe(m.id)
      if (typeof fx === 'string') {
        say(`| ${name} | not available: ${fx} | | | | | | | | | |`)
        continue
      }
      const embed = embedder(fx, m.pooling)
      const whole = await embed(notes.map(([, n]) => wholeNote(n.title, n.body)))
      const t0 = Date.now()
      const flat = notes.map(([path]) => sections(path))
      const sv = await embed(flat.flat())
      const ms = (Date.now() - t0) / sv.length
      let at = 0
      const bySection = flat.map((list) => sv.slice(at, (at += list.length)))
      const qs = await embed(ASK.map(([q]) => m.prefix + q))
      const ns = await embed(NOTHING.map((q) => m.prefix + q))
      const scoreOf = (way: WayName, qv: Float32Array, i: number) => {
        const w = cosine(qv, whole[i])
        const s = Math.max(...bySection[i].map((v) => cosine(qv, v)))
        return way === 'whole note' ? w : way === 'by section' ? s : Math.max(w, s)
      }
      const rank = (way: WayName, qv: Float32Array): Ranked[] => notes.map(([path], i) => ({ path, score: scoreOf(way, qv, i) })).sort((a, b) => b.score - a.score)
      for (const way of WAYS) {
        const ranked = qs.map((qv) => rank(way, qv))
        const all = metrics(ranked, () => true)
        const dp = metrics(ranked, (i) => deep[i])
        table.push({ model: name, way, all, deep: dp })
        const answers = ASK.map(([, want], i) => ranked[i].find((r) => r.path === want)!.score).sort((a, b) => a - b)
        const none = Math.max(...ns.map((qv) => rank(way, qv)[0].score))
        say(`| ${name} | ${way} | ${row(all)} | ${row(dp)} | ${answers[0].toFixed(2)} to ${answers[answers.length - 1].toFixed(2)} (90% above ${answers[Math.floor(answers.length / 10)].toFixed(2)}) | ${none.toFixed(2)} | ${way === 'whole note' ? '' : ms.toFixed(0)} |`)
      }
    }

    // ---- the shipped way, through the app's own index ----
    const shippedFx = await pipe(EMBED_MODEL)
    if (typeof shippedFx === 'string') throw new Error(`${EMBED_MODEL}: ${shippedFx}`)
    const bge = embedder(shippedFx, EMBED_POOLING)
    const idx = new MeaningIndex(join(mkdtempSync(join(tmpdir(), 'idx-')), 'meaning'))
    const list = notes.map(([path]) => ({ path, mtime: 1, chunks: () => sections(path) }))
    while ((await idx.update(list, bge, 1000)) > 0);
    const mine: Ranked[][] = []
    for (const [q] of ASK) mine.push(await idx.query(q, bge, 100))
    const shipped = { all: metrics(mine, () => true), deep: metrics(mine, (i) => deep[i]) }
    say('')
    say(`As shipped (${EMBED_MODEL}, the app's index): ${row(shipped.all)}; deep: ${row(shipped.deep)}`)
    say('')
    say('| Question | Deep | Found | Score | Expected at | Section |')
    say('|---|---|---|---|---|---|')
    const wanted: number[] = []
    ASK.forEach(([q, want], i) => {
      const at = mine[i].findIndex((r) => r.path === want)
      const hit = mine[i][at]
      wanted.push(hit?.score ?? -1)
      const c = hit?.chunk !== undefined ? noteChunks(VAULT[want].body)[hit.chunk] : undefined
      say(`| ${q} | ${deep[i] ? 'yes' : ''} | ${mine[i][0].path.split('/').pop()} | ${mine[i][0].score.toFixed(3)} | ${at + 1} (${hit?.score.toFixed(3)}) | ${c ? (c.heading ? `${c.heading}: ` : '') + c.text.slice(0, 60) : ''} |`)
    })
    const none: number[] = []
    for (const q of NOTHING) none.push((await idx.query(q, bge, 1))[0].score)
    const highestNone = Math.max(...none)
    say('')
    say(`Answers scored ${Math.min(...wanted).toFixed(3)} to ${Math.max(...wanted).toFixed(3)}; questions nothing answers, up to ${highestNone.toFixed(3)}. MEANING_MIN is ${MEANING_MIN}.`)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Search by meaning, real models\n\n${out.join('\n')}\n`)

    // ---- what must hold: the shipped way beats the one before on every count ----
    const before = table.find((r) => r.model === OLD_EMBED_MODELS[0] && r.way === 'whole note')!
    expect(Math.abs(bytes / 1024 / 1024 - EMBED_MB) / EMBED_MB).toBeLessThan(0.15)
    expect(shipped.all.mrr).toBeGreaterThanOrEqual(before.all.mrr)
    expect(shipped.all.hit3).toBeGreaterThanOrEqual(before.all.hit3)
    expect(shipped.deep.mrr).toBeGreaterThan(before.deep.mrr)
    // The floor lets nearly every answer through and keeps out what answers nothing.
    expect(wanted.filter((s) => s >= MEANING_MIN).length / wanted.length).toBeGreaterThanOrEqual(0.9)
    expect(highestNone).toBeLessThan(MEANING_MIN)
  },
  1_500_000,
)
