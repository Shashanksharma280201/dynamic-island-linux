/**
 * Drag actions: hold a dragged file still and a ring of actions opens around
 * the pointer (Convert, Edit, Capture, Ask Claude, Shrink, Copy text, always in
 * those six places). What each file offers, the ring's geometry and hit
 * testing, and the hold-still timing. Pure.
 */

export type DragKind = 'pdf' | 'docx' | 'sheet' | 'slides' | 'text' | 'image' | 'other'
export type SlotId = 'convert' | 'edit' | 'capture' | 'ask' | 'shrink' | 'text'

/** Clockwise from the top. Never reordered: your hand learns the places. */
export const SLOT_IDS: SlotId[] = ['convert', 'edit', 'capture', 'ask', 'shrink', 'text']
export const SLOT_LABEL: Record<SlotId, string> = { convert: 'Convert', edit: 'Edit', capture: 'Capture', ask: 'Ask Claude', shrink: 'Shrink', text: 'Copy text' }

const EXT_KIND: Record<string, DragKind> = {
  pdf: 'pdf',
  docx: 'docx',
  doc: 'docx',
  odt: 'docx',
  rtf: 'docx',
  xlsx: 'sheet',
  xls: 'sheet',
  ods: 'sheet',
  csv: 'sheet',
  tsv: 'sheet',
  pptx: 'slides',
  ppt: 'slides',
  odp: 'slides',
  md: 'text',
  markdown: 'text',
  txt: 'text',
  html: 'text',
  htm: 'text',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
}

/** Other files that are text: code, data, logs, subtitles. Copy text works on them as they are. */
const PLAIN_TEXT = new Set(
  'json xml yaml yml log ini toml conf cfg env srt vtt tex rst adoc js mjs cjs ts tsx jsx py java c h cc cpp hpp cs go rs rb php swift kt kts sh bash zsh fish ps1 css scss less sql r lua pl dart vue svelte graphql proto'.split(' '),
)
for (const e of PLAIN_TEXT) EXT_KIND[e] = 'text'

/** Badge colour per extension (the same as everywhere on the island). */
export const EXT_COLOR: Record<string, string> = {
  pdf: '#ff453a',
  docx: '#0a84ff',
  doc: '#0a84ff',
  odt: '#0a84ff',
  rtf: '#0a84ff',
  xlsx: '#30d158',
  xls: '#30d158',
  ods: '#30d158',
  csv: '#30d158',
  tsv: '#30d158',
  json: '#ffd60a',
  html: '#ff9f0a',
  htm: '#ff9f0a',
  pptx: '#ff9f0a',
  ppt: '#ff9f0a',
  odp: '#ff9f0a',
  md: '#8e8e93',
  markdown: '#8e8e93',
  txt: '#8e8e93',
  png: '#bf5af2',
  jpg: '#bf5af2',
  jpeg: '#bf5af2',
  webp: '#bf5af2',
}

const FORMAT_LABEL: Record<string, string> = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', csv: 'CSV', tsv: 'TSV', json: 'JSON', html: 'Web page', txt: 'Text', md: 'Markdown', pptx: 'PowerPoint', png: 'PNG', jpg: 'JPEG', webp: 'WebP' }

/** "Report.PDF" → "pdf". Pure. */
export function extOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** A full path on any system: /Users/me/a.pdf, C:\\Users\\me\\a.pdf, \\\\server\\share\\a.pdf. Pure. */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')
}

export function dragKindOf(path: string): DragKind {
  return EXT_KIND[extOf(path)] ?? 'other'
}

export type RingFile = { path: string; name: string; base: string; ext: string; kind: DragKind; color: string }

export function ringFile(path: string): RingFile {
  const name = path.split(/[\\/]/).pop() || path
  const ext = extOf(path)
  return { path, name, base: ext ? name.slice(0, -(ext.length + 1)) : name, ext, kind: dragKindOf(path), color: EXT_COLOR[ext] ?? '#8e8e93' }
}

/** A choice on the second ring: a format to convert to, or a question for Claude. */
export type Choice = { id: string; label: string; sub: string; color: string }
export type Slot = { id: SlotId; label: string; enabled: boolean; why?: string; hint: string; choices?: Choice[] }
export type RingPlan = { files: RingFile[]; slots: Slot[] }

/** What this computer can do, which changes what the ring offers. */
export type PlanEnv = {
  libreOffice: boolean
  /** Whether tesseract is installed: Copy text reads images and scans then. */
  ocr?: boolean
  /** The assistant Ask Claude and Edit go to; null if none is set up. */
  assistant: 'claude-code' | 'api' | null
  /** The language "Translate" means ("English"). */
  language: string
  /** Where results are saved (next to the original unless set). */
  saveTo?: 'next' | 'downloads'
}

/** Formats each kind of file converts to. */
function convertTargets(f: RingFile, env: PlanEnv): string[] {
  switch (f.ext) {
    case 'pdf':
      return ['docx', 'txt', 'md']
    case 'docx':
      return ['pdf', 'txt', 'md']
    case 'xlsx':
      return ['csv', 'pdf', 'docx', 'json', 'md', 'html']
    case 'csv':
      return ['xlsx', 'pdf', 'docx', 'json', 'md', 'html']
    case 'tsv':
    case 'ods':
      return ['xlsx', 'csv', 'pdf', 'docx', 'json', 'md']
    case 'xls':
      return env.libreOffice ? ['xlsx', 'csv', 'pdf', 'docx', 'json', 'md'] : []
    case 'odt':
    case 'rtf':
      return env.libreOffice ? ['docx', 'pdf', 'txt', 'md'] : ['txt', 'md']
    case 'doc':
      return env.libreOffice ? ['docx', 'pdf', 'txt', 'md'] : []
    case 'pptx':
      return [...(env.libreOffice ? ['pdf'] : []), 'txt', 'md']
    case 'odp':
      return env.libreOffice ? ['pdf', 'pptx', 'txt'] : ['txt']
    case 'ppt':
      return env.libreOffice ? ['pdf', 'pptx', 'txt'] : []
    case 'html':
    case 'htm':
      return ['pdf', 'txt', 'md']
    case 'md':
    case 'markdown':
      return ['docx', 'pdf', 'txt']
    case 'txt':
      return ['docx', 'pdf', 'md']
    case 'png':
      return ['jpg', 'webp', 'pdf']
    case 'jpg':
    case 'jpeg':
      return ['png', 'webp', 'pdf']
    case 'webp':
      return ['png', 'jpg', 'pdf']
  }
  return PLAIN_TEXT.has(f.ext) ? ['pdf', 'txt'] : []
}

/** Old binary Office files: LibreOffice reads them. */
const OFFICE_ONLY = new Set(['doc', 'xls', 'ppt'])

const choice = (ext: string): Choice => ({ id: ext, label: FORMAT_LABEL[ext] ?? ext.toUpperCase(), sub: `.${ext}`, color: EXT_COLOR[ext] ?? '#8e8e93' })

/** Questions for Claude, per kind of file: [id, label, sub]. */
const QUESTIONS: Record<DragKind, [string, string, string][]> = {
  pdf: [['summarize', 'Summarize', 'in 3 lines'], ['translate', 'Translate', 'into your language'], ['explain', 'Explain', 'in plain words']],
  docx: [['summarize', 'Summarize', 'in 3 lines'], ['rewrite', 'Rewrite', 'more clearly'], ['translate', 'Translate', 'into your language']],
  sheet: [['summarize', 'Summarize', 'in 3 lines'], ['explain', 'Explain', 'the numbers'], ['check', 'Check', 'for mistakes']],
  slides: [['summarize', 'Summarize', 'slide by slide'], ['notes', 'Notes', 'for each slide'], ['translate', 'Translate', 'into your language']],
  text: [['summarize', 'Summarize', 'in 3 lines'], ['rewrite', 'Rewrite', 'more clearly'], ['translate', 'Translate', 'into your language']],
  image: [['describe', 'Describe', 'what is in it'], ['read', 'Read', 'the text in it'], ['explain', 'Explain', 'in plain words']],
  other: [['summarize', 'Summarize', 'what it is'], ['explain', 'Explain', 'in plain words']],
}

const NO_ASSISTANT = 'Set up the assistant in Settings first'

/** One file's six places. */
function slotsFor(f: RingFile, env: PlanEnv): Slot[] {
  const k = f.kind
  const officeWhy = OFFICE_ONLY.has(f.ext) && !env.libreOffice ? `Opening .${f.ext} files needs LibreOffice` : undefined
  const doc = k === 'pdf' || k === 'docx' || k === 'sheet' || k === 'slides' || k === 'text'
  const textWhy = officeWhy ?? (doc ? undefined : k === 'image' ? (env.ocr ? undefined : 'Install tesseract to copy the words in images') : 'No text to copy')
  const targets = convertTargets(f, env)
  const askWhy = !env.assistant ? NO_ASSISTANT : k === 'image' && env.assistant !== 'claude-code' ? 'Seeing images needs Claude Code as the assistant' : undefined
  const editable = k === 'docx' || k === 'sheet' || k === 'text'
  return [
    { id: 'convert', label: SLOT_LABEL.convert, enabled: targets.length > 0, why: targets.length ? undefined : (officeWhy ?? 'Nothing to convert this to'), hint: 'Convert: choose a format', choices: targets.map(choice) },
    {
      id: 'edit',
      label: SLOT_LABEL.edit,
      enabled: editable && !!env.assistant,
      why: !editable ? (k === 'image' ? 'Not yet for images' : k === 'pdf' ? 'Not yet for PDFs' : k === 'slides' ? 'Not yet for slides' : 'Not for this kind of file') : env.assistant ? undefined : NO_ASSISTANT,
      hint: 'Edit: tell Claude what to change',
    },
    { id: 'capture', label: SLOT_LABEL.capture, enabled: k === 'image', why: k === 'image' ? undefined : 'Not yet for this kind of file', hint: 'Copy the image, ready to paste' },
    { id: 'ask', label: SLOT_LABEL.ask, enabled: !askWhy, why: askWhy, hint: 'Ask Claude about it: choose what you want', choices: QUESTIONS[k].map(([id, label, sub]) => ({ id, label, sub, color: '#e8845f' })) },
    {
      id: 'shrink',
      label: SLOT_LABEL.shrink,
      enabled: k === 'image' || k === 'pdf',
      why: k === 'image' || k === 'pdf' ? undefined : 'Nothing to shrink in this kind of file',
      hint: 'Make a smaller copy, next to the original',
    },
    { id: 'text', label: SLOT_LABEL.text, enabled: !textWhy, why: textWhy, hint: k === 'sheet' ? 'Copy it as a table' : k === 'image' ? 'Copy the words in it' : 'Copy all the text' },
  ]
}

/**
 * The ring for the files being dragged: an action is on only if it works for
 * every file, with the choices they all share. Null when none of the files
 * is one the ring knows (dragging a folder, say): no ring then.
 */
export function ringPlan(paths: string[], env: PlanEnv): RingPlan | null {
  const files = paths.filter(Boolean).slice(0, 50).map(ringFile)
  if (!files.length || files.every((f) => f.kind === 'other')) return null
  const per = files.map((f) => slotsFor(f, env))
  const slots = SLOT_IDS.map((id, i) => {
    const all = per.map((p) => p[i])
    const first = all[0]
    const off = all.find((s) => !s.enabled)
    let choices = first.choices
    if (choices) choices = choices.filter((c) => all.every((s) => s.choices?.some((x) => x.id === c.id)))
    const enabled = !off && (!first.choices || (choices?.length ?? 0) > 0)
    const why = off?.why ?? (enabled ? undefined : files.length > 1 ? 'Not for these files together' : first.why)
    const slot: Slot = { id, label: first.label, enabled, why, hint: first.hint }
    if (choices) slot.choices = choices
    return slot
  })
  return { files, slots }
}

/** What Claude is asked for a question on the ring. Pure. */
export function askPrompt(questionId: string, files: RingFile[], language: string): string {
  const list = files.length === 1 ? `the file "${files[0].path}"` : `these files: ${files.map((f) => `"${f.path}"`).join(', ')}`
  switch (questionId) {
    case 'summarize':
      return `Summarize ${list} in 3 short lines.`
    case 'translate':
      return `Translate the text of ${list} into ${language}.`
    case 'explain':
      return `Explain ${list} in plain words, briefly.`
    case 'rewrite':
      return `Rewrite the text of ${list} more clearly, and show me the new text.`
    case 'check':
      return `Check ${list} for mistakes or anything that looks wrong. Be brief.`
    case 'notes':
      return `Write short speaker notes for each slide of ${list}.`
    case 'describe':
      return `Describe what is in the image ${list}.`
    case 'read':
      return `Read out all the text in the image ${list}.`
  }
  return `Tell me about ${list}.`
}

/** The start of the request Edit puts in the Claude box, for you to finish. Pure. */
export function editDraft(files: RingFile[]): string {
  return files.length === 1 ? `In "${files[0].path}", change ` : `In these files: ${files.map((f) => `"${f.path}"`).join(', ')}, change `
}

/** File types as a drop target sees them before the drop (no names yet). */
const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/markdown': 'md',
  'text/x-markdown': 'md',
  'text/plain': 'txt',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function extForMime(mime: string): string | null {
  return MIME_EXT[mime.toLowerCase().split(';')[0].trim()] ?? null
}

/**
 * The ring while the files are still being dragged: a drop target only learns
 * their types then (their names come with the drop). Pure.
 */
export function ringPlanForTypes(mimes: string[], env: PlanEnv): RingPlan | null {
  return ringPlan(mimes.map((m, i) => `file${i + 1}.${extForMime(m) ?? 'bin'}`), env)
}

const KIND_NAME: Record<DragKind, string> = { pdf: 'PDF', docx: 'Word file', sheet: 'Spreadsheet', slides: 'Slides', text: 'Text file', image: 'Image', other: 'File' }

/** What the middle of the ring says it holds: "PDF", "PNG", "3 files". Pure. */
export function ringTitle(files: RingFile[]): string {
  if (files.length !== 1) return `${files.length} files`
  const f = files[0]
  if (f.kind === 'image') return f.ext === 'jpg' || f.ext === 'jpeg' ? 'JPEG' : f.ext.toUpperCase()
  return EXT_NAME[f.ext] ?? (f.kind === 'text' && PLAIN_TEXT.has(f.ext) ? `${f.ext.toUpperCase()} file` : KIND_NAME[f.kind])
}

/** Names for files whose kind's name would be wrong ("Word file" for an .odt). */
const EXT_NAME: Record<string, string> = {
  odt: 'Document',
  rtf: 'RTF document',
  ods: 'Spreadsheet',
  tsv: 'TSV sheet',
  csv: 'CSV sheet',
  odp: 'Presentation',
  html: 'Web page',
  htm: 'Web page',
}

// ---- Geometry ---------------------------------------------------------------

/** Sizes in px, as designed (see the Drag Actions canvas). */
export const RING = {
  /** Outer and inner radius of the six actions. */
  outer: 150,
  inner: 60,
  labelAt: 105,
  /** Let go inside this to cancel. */
  cancel: 60,
  /** The six actions answer out to here. */
  reach: 176,
  /** The second ring: radius, degrees between choices, how close counts. */
  choiceAt: 216,
  choiceSpread: 27,
  choiceHit: 40,
  /** Beyond the second ring's band… */
  band: 270,
  /** …and this far away the ring closes and the drag carries on. */
  far: 300,
  /** The ring's window is this square, the ring in its middle. */
  window: 620,
}

/** Clockwise degrees from straight up, 0 to 360. Pure. */
export function angleOf(dx: number, dy: number): number {
  return ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
}

/** Where choice `i` of `n` sits for the action in `slot`: degrees clockwise from up. Pure. */
export function choiceAngle(slot: number, i: number, n: number): number {
  return slot * 60 + (i - (n - 1) / 2) * RING.choiceSpread
}

export type Hit = { slot: number; hub: boolean; choice: number; sub: number; far: boolean }

/**
 * What the pointer is over, at (dx, dy) from the ring's middle. `sub` is the
 * action whose second ring is open (-1: none) and `choices` how many it has.
 * `sub` in the result: the second ring to show now. Pure.
 */
export function ringHit(dx: number, dy: number, sub: number, choices: number, hasChoices: (slot: number) => boolean): Hit {
  const d = Math.hypot(dx, dy)
  const ang = angleOf(dx, dy)
  if (sub >= 0) {
    for (let i = 0; i < choices; i++) {
      const a = (choiceAngle(sub, i, choices) * Math.PI) / 180
      if (Math.hypot(dx - RING.choiceAt * Math.sin(a), dy + RING.choiceAt * Math.cos(a)) < RING.choiceHit) return { slot: sub, hub: false, choice: i, sub, far: false }
    }
  }
  if (d < RING.cancel) return { slot: -1, hub: true, choice: -1, sub: -1, far: false }
  if (d <= RING.reach) {
    const slot = Math.round(ang / 60) % 6
    return { slot, hub: false, choice: -1, sub: hasChoices(slot) ? slot : -1, far: false }
  }
  if (sub >= 0 && d < RING.band) {
    const diff = Math.abs(((ang - sub * 60 + 540) % 360) - 180)
    if (diff < (choices * RING.choiceSpread) / 2 + 14) return { slot: sub, hub: false, choice: -1, sub, far: false }
  }
  return { slot: -1, hub: false, choice: -1, sub: -1, far: d > RING.far }
}

/** The ring's middle on screen: at the pointer, slid inward to stay whole on `area`. Pure. */
export function ringCenter(p: { x: number; y: number }, area: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  const m = RING.window / 2
  const clamp = (v: number, lo: number, hi: number) => (hi < lo ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)))
  return { x: Math.round(clamp(p.x, area.x + m, area.x + area.width - m)), y: Math.round(clamp(p.y, area.y + m, area.y + area.height - m)) }
}

// ---- Holding still ------------------------------------------------------------

export type OpenWhen = 'still' | 'alt' | 'either'

/** Settings, General, Drag actions. */
export type DragConfig = {
  on: boolean
  when: OpenWhen
  /** How long to hold still, 200 to 900 ms. */
  dwellMs: number
  /** Results next to the original, or in Downloads. */
  saveTo: 'next' | 'downloads'
}

export const DRAG_DEFAULTS: DragConfig = { on: true, when: 'either', dwellMs: 420, saveTo: 'next' }

/** A saved drag-actions setting, checked. Pure. */
export function parseDragConfig(raw: any): DragConfig {
  const c = { ...DRAG_DEFAULTS }
  if (!raw || typeof raw !== 'object') return c
  if (typeof raw.on === 'boolean') c.on = raw.on
  if (raw.when === 'still' || raw.when === 'alt' || raw.when === 'either') c.when = raw.when
  const ms = Number(raw.dwellMs)
  if (Number.isFinite(ms)) c.dwellMs = Math.round(Math.min(900, Math.max(200, ms)))
  if (raw.saveTo === 'next' || raw.saveTo === 'downloads') c.saveTo = raw.saveTo
  return c
}

export type DwellState = { anchor: { x: number; y: number; t: number } | null; bloomed: boolean }

/**
 * One pointer sample during a drag: has the moment come to open the ring?
 * Holding still means staying within 5 px for `dwellMs`. Pure.
 */
export function dwellStep(
  s: DwellState,
  p: { x: number; y: number; t: number; alt: boolean },
  cfg: { dwellMs: number; when: OpenWhen },
): { state: DwellState; bloom: boolean; holding: number } {
  if (s.bloomed) return { state: s, bloom: false, holding: 0 }
  if (p.alt && cfg.when !== 'still') return { state: { anchor: s.anchor, bloomed: true }, bloom: true, holding: 0 }
  let anchor = s.anchor
  if (!anchor || Math.hypot(p.x - anchor.x, p.y - anchor.y) > 5) anchor = { x: p.x, y: p.y, t: p.t }
  const held = p.t - anchor.t
  if (cfg.when !== 'alt' && held >= cfg.dwellMs) return { state: { anchor, bloomed: true }, bloom: true, holding: 1 }
  return { state: { anchor, bloomed: false }, bloom: false, holding: cfg.when === 'alt' ? 0 : Math.max(0, held / cfg.dwellMs) }
}

// ---- Files ---------------------------------------------------------------------

/** Paths from a text/uri-list ("file:///home/me/A%20B.pdf"); other links are left out. Pure. */
export function parseUriList(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^file:\/\/([^/]*)(\/.*)$/i.exec(line)
    if (!m || (m[1] && m[1] !== 'localhost' && !/^[\w.-]+$/.test(m[1]))) continue
    try {
      out.push(decodeURIComponent(m[2]))
    } catch {
      out.push(m[2])
    }
  }
  return out
}

/** The name a result gets, next to the original: "Report.docx", "Report (smaller).pdf". Pure. */
export function resultName(base: string, action: 'convert' | 'shrink', ext: string): string {
  return action === 'shrink' ? `${base} (smaller).${ext}` : `${base}.${ext}`
}
