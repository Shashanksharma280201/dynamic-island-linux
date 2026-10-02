import { useEffect, useRef, useState } from 'react'
import type { ClaudeView } from '@shared/claude'
import { moodFor } from '@shared/character'
import { fileSize, relativeTime } from '@shared/format'
import {
  CONVERT_TARGETS,
  KIND_LABEL,
  canConvert,
  type ConvertTarget,
  type DocAction,
  type DocEntry,
  type DocKind,
  type DocRecipe,
  type DocsView as DocsState,
} from '@shared/docs'
import { Empty, Spinner, errorText, useLoad, useNow } from './common'
import { useKeyboard } from './useKeyboard'
import { Character, useCharacter } from '../character/Character'
import { runActive, runStatus } from '../states/ClaudeActivity'
import { DocIcon, FolderIcon, PlusIcon, StopIcon, XIcon } from '../icons'

/** Files just dropped on the island: they get selected when the tab shows. */
export type DocsIncoming = { ids: string[]; skipped: { path: string; why: string }[]; at: number }

const BADGE: Record<DocKind, { text: string; color: string }> = {
  pdf: { text: 'PDF', color: '#ff453a' },
  docx: { text: 'DOC', color: '#0a84ff' },
  xlsx: { text: 'XLS', color: '#30d158' },
  csv: { text: 'CSV', color: '#32ade6' },
  pptx: { text: 'PPT', color: '#ff9f0a' },
  md: { text: 'MD', color: '#8e8e93' },
  txt: { text: 'TXT', color: '#8e8e93' },
}

/** A document icon with its type on a coloured band, like in a file manager. */
export function FileBadge({ kind }: { kind: DocKind }) {
  const b = BADGE[kind]
  return (
    <svg className="file-badge" width="26" height="32" viewBox="0 0 28 34" aria-hidden>
      <path d="M4 1h14l9 9v20a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3z" fill="rgba(255,255,255,0.92)" />
      <path d="M18 1v6a3 3 0 0 0 3 3h6z" fill="rgba(0,0,0,0.14)" />
      <rect x="1" y="17" width="26" height="10" rx="1.5" fill={b.color} />
      <text x="14" y="24.6" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#fff">
        {b.text}
      </text>
    </svg>
  )
}

const TARGET_LABEL: Record<ConvertTarget, string> = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', csv: 'CSV', txt: 'Text', md: 'Markdown' }

function details(e: DocEntry): string {
  if (e.missing) return 'Moved or deleted'
  return [e.origin === 'made' ? 'Made' : '', e.pages ? `${e.pages} page${e.pages === 1 ? '' : 's'}` : '', fileSize(e.size), KIND_LABEL[e.kind]].filter(Boolean).join(' · ')
}

/** Ready-made requests for what's selected. */
function suggestions(files: DocEntry[]): { name: string; instruction: string }[] {
  const kinds = new Set(files.map((f) => f.kind))
  const out: { name: string; instruction: string }[] = []
  if (files.length === 1 && kinds.has('docx'))
    out.push({ name: 'Fix spelling and grammar', instruction: 'Correct the spelling and grammar. Keep my wording otherwise, and make the corrections tracked changes.' })
  if (files.length >= 2 && files.every((f) => f.kind === 'pdf'))
    out.push({ name: 'Merge and number pages', instruction: 'Merge these PDFs in this order and add page numbers.' })
  if (kinds.has('xlsx') || kinds.has('csv')) out.push({ name: 'Check the numbers', instruction: 'Check this spreadsheet for mistakes (totals, formulas, odd values) and tell me what you find.' })
  out.push({ name: files.length > 1 ? 'Summarize them' : 'Summarize', instruction: 'Summarize this in a few bullet points.' })
  if (files.length === 1 && (kinds.has('docx') || kinds.has('pdf')))
    out.push({ name: 'Review it', instruction: 'Review this document: point out mistakes, unclear parts and anything risky.' })
  return out.slice(0, 3)
}

/** A short name for a saved request: its first few words. Pure. */
export function recipeName(instruction: string): string {
  const words = instruction.trim().split(/\s+/).slice(0, 4).join(' ')
  return words.length > 28 ? `${words.slice(0, 27)}…` : words
}

type Result = { text: string; note?: string; files: DocEntry[]; error?: boolean }

/**
 * The Documents tab: files you added (drop them on the island) and what was
 * made from them, quick actions that need no AI, and a box to ask the agent.
 */
export function DocsView({
  claude,
  onTyping,
  incoming,
}: {
  claude: ClaudeView | null
  onTyping: (on: boolean) => void
  incoming?: DocsIncoming | null
}) {
  const { name } = useCharacter()
  const now = useNow()
  const { data, error, loading, reload } = useLoad<DocsState>(
    () => window.island.docs.view(),
    [],
    (r) => window.island.docs.onChanged(r),
    'docs',
  )
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [form, setForm] = useState<'pages' | 'convert' | null>(null)
  // The latest of a quick action and a question to the agent is shown.
  const [actedAt, setActedAt] = useState(0)

  // Dropped files arrive selected, with a word about any that were left out.
  useEffect(() => {
    if (!incoming) return
    setSelected(incoming.ids)
    setForm(null)
    const skipped = incoming.skipped.map((s) => `${s.path.split('/').pop()}: ${s.why}`)
    setResult(
      incoming.ids.length
        ? { text: `Added ${incoming.ids.length} file${incoming.ids.length === 1 ? '' : 's'}.${skipped.length ? ` Left out ${skipped.join('; ')}.` : ''}`, files: [] }
        : { text: skipped.length ? `Couldn’t add ${skipped.join('; ')}.` : 'Nothing to add.', files: [], error: true },
    )
  }, [incoming?.at]) // eslint-disable-line react-hooks/exhaustive-deps

  const files = data?.files ?? []
  // Keep the selection to files that are still listed, in the order picked.
  const picked = selected.map((id) => files.find((f) => f.id === id)).filter((f): f is DocEntry => !!f)
  const usable = picked.filter((f) => !f.missing)
  const toggle = (id: string) => {
    setForm(null)
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const act = async (a: DocAction) => {
    setBusy(true)
    setResult(null)
    setActedAt(Date.now())
    try {
      const r = await window.island.docs.action(a)
      const made = r.made.map((m) => m.name)
      setResult({ text: made.length === 1 ? `Saved “${made[0]}”.` : `Saved ${made.length} files.`, note: r.note, files: r.made })
      setSelected(r.made.map((m) => m.id))
      setForm(null)
    } catch (e) {
      setResult({ text: errorText(e), files: [], error: true })
    } finally {
      setBusy(false)
      reload()
    }
  }

  const add = async () => {
    // The file chooser takes the pointer away; keep the panel open meanwhile.
    onTyping(true)
    try {
      const r = await window.island.docs.pick()
      if (r.added.length) setSelected(r.added.map((f) => f.id))
      if (r.skipped.length) setResult({ text: `Left out ${r.skipped.map((s) => `${s.path.split('/').pop()}: ${s.why}`).join('; ')}.`, files: [], error: true })
    } catch (e) {
      setResult({ text: errorText(e), files: [], error: true })
    } finally {
      onTyping(false)
    }
  }

  // What was just added or made is selected: bring it into view.
  const listRef = useRef<HTMLDivElement>(null)
  const firstPicked = picked[0]?.id
  useEffect(() => {
    listRef.current?.querySelector('.doc-row.selected')?.scrollIntoView({ block: 'nearest' })
  }, [firstPicked])

  const row = (f: DocEntry) => {
    const on = selected.includes(f.id)
    return (
      <button
        key={f.id}
        className={`list-row doc-row${on ? ' selected' : ''}${f.missing ? ' missing' : ''}`}
        data-doc={f.name}
        aria-pressed={on}
        title={f.path}
        onClick={(e) => (e.stopPropagation(), toggle(f.id))}
        onDoubleClick={(e) => (e.stopPropagation(), void window.island.docs.open(f.id).catch(() => {}))}
      >
        <FileBadge kind={f.kind} />
        {f.origin === 'made' && <span className="doc-new" title="Made here" aria-hidden />}
        <div className="list-main">
          <div className="list-top">
            <span className="title ellipsis">{f.name}</span>
            <span className="when">{relativeTime(f.at, now)}</span>
          </div>
          <div className="caption ellipsis">{details(f)}</div>
        </div>
        <span className={`doc-check${on ? ' on' : ''}`} aria-hidden>
          {on && (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m2.5 6.2 2.3 2.3 4.7-5" />
            </svg>
          )}
        </span>
      </button>
    )
  }

  return (
    <div className="view docs-view">
      <div className="section-head docs-head">
        <span className="large-title">Documents</span>
        <span className="spacer" />
        <button className="icon-btn" title={`Open ${data?.outDir ?? 'the folder'}`} aria-label="Open the folder new files are saved in" onClick={(e) => (e.stopPropagation(), void window.island.docs.openFolder().catch(() => {}))}>
          <FolderIcon />
        </button>
        <button className="icon-btn" title="Add files" aria-label="Add files" onClick={(e) => (e.stopPropagation(), void add())}>
          <PlusIcon />
        </button>
      </div>

      <div className="list docs-list" ref={listRef}>
        {!data && loading && <Spinner />}
        {error && !data && <Empty title="Couldn't load your documents" body={error} />}
        {data && !files.length && (
          <Empty
            icon={<DocIcon />}
            title="Drop files on the island"
            body={`PDFs, Word files, spreadsheets, slides or text. ${name} and the buttons here can merge, split, convert, correct and more. Your originals are never changed.`}
            action={
              <button className="pill primary" onClick={(e) => (e.stopPropagation(), void add())}>
                Add Files
              </button>
            }
          />
        )}
        {files.map(row)}
      </div>

      {picked.length > 0 && <Actions files={picked} libreOffice={!!data?.libreOffice} busy={busy} form={form} setForm={setForm} act={act} onTyping={onTyping} onRemove={() => {
        void window.island.docs.remove(picked.map((f) => f.id)).then(reload)
        setSelected([])
      }} />}

      {(busy || result) && (
        <div className={`docs-result${result?.error ? ' error' : ''}`} role="status">
          {busy ? (
            <>
              <span className="spinner small" /> <span>Working…</span>
            </>
          ) : (
            result && (
              <>
                <span className="docs-result-text">
                  {result.text}
                  {result.note && <span className="docs-result-note">{result.note}</span>}
                </span>
                {result.files.length === 1 && (
                  <button className="chip" onClick={(e) => (e.stopPropagation(), void window.island.docs.open(result.files[0].id).catch(() => {}))}>
                    Open
                  </button>
                )}
                <button className="close-btn" aria-label="Dismiss" onClick={(e) => (e.stopPropagation(), setResult(null))}>
                  <XIcon />
                </button>
              </>
            )
          )}
        </div>
      )}

      <Ask
        claude={claude}
        files={usable}
        all={files}
        recipes={data?.recipes ?? []}
        onTyping={onTyping}
        hideBefore={actedAt}
        onAsk={() => setResult(null)}
      />
    </div>
  )
}

/** Buttons for what's selected: things that need no AI. */
function Actions({
  files,
  libreOffice,
  busy,
  form,
  setForm,
  act,
  onTyping,
  onRemove,
}: {
  files: DocEntry[]
  libreOffice: boolean
  busy: boolean
  form: 'pages' | 'convert' | null
  setForm: (f: 'pages' | 'convert' | null) => void
  act: (a: DocAction) => Promise<void>
  onTyping: (on: boolean) => void
  onRemove: () => void
}) {
  const one = files.length === 1 ? files[0] : null
  const pdfs = files.every((f) => f.kind === 'pdf')
  const gone = files.some((f) => f.missing)
  const targets = one ? CONVERT_TARGETS.filter((t) => canConvert(one.kind, t, libreOffice)) : []
  const [pages, setPages] = useState('')
  const kb = useKeyboard(onTyping)
  const pagesRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (form === 'pages') setTimeout(() => pagesRef.current?.focus(), 30)
  }, [form])
  const chip = (label: string, run: () => void, cls = '') => (
    <button key={label} className={`chip${cls}`} disabled={busy} onClick={(e) => (e.stopPropagation(), run())}>
      {label}
    </button>
  )

  const remove = (
    <button
      className="close-btn doc-remove"
      title={files.length > 1 ? `Take these ${files.length} off the list (the files stay)` : 'Take it off the list (the file stays)'}
      aria-label="Remove from list"
      onClick={(e) => (e.stopPropagation(), onRemove())}
    >
      <XIcon />
    </button>
  )

  // A file that was moved or deleted can only be taken off the list.
  if (gone)
    return (
      <div className="doc-actions" onClick={(e) => e.stopPropagation()}>
        <span className="caption">{files.length === 1 ? 'This file was moved or deleted.' : 'Some of these were moved or deleted.'}</span>
        {remove}
      </div>
    )

  if (form === 'pages' && one)
    return (
      <div className="doc-actions doc-form" onClick={(e) => e.stopPropagation()}>
        <input
          ref={pagesRef}
          className="doc-input"
          value={pages}
          placeholder={`Pages of ${one.pages ?? '?'}, like 1-3, 5`}
          aria-label="Pages"
          onPointerDown={kb.take}
          onFocus={kb.take}
          onBlur={kb.release}
          onChange={(e) => setPages(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && pages.trim()) void act({ op: 'pages', id: one.id, pages, mode: 'keep' })
            if (e.key === 'Escape') setForm(null)
          }}
        />
        {chip('Keep', () => pages.trim() && void act({ op: 'pages', id: one.id, pages, mode: 'keep' }), ' on')}
        {chip('Delete', () => pages.trim() && void act({ op: 'pages', id: one.id, pages, mode: 'delete' }))}
        <button className="close-btn" aria-label="Cancel" onClick={(e) => (e.stopPropagation(), setForm(null))}>
          <XIcon />
        </button>
      </div>
    )

  if (form === 'convert' && one)
    return (
      <div className="doc-actions" onClick={(e) => e.stopPropagation()}>
        <span className="caption">Make a</span>
        {targets.map((t) => chip(TARGET_LABEL[t], () => void act({ op: 'convert', id: one.id, to: t })))}
        {!libreOffice && one.kind === 'pptx' && <span className="caption">PowerPoint needs LibreOffice for PDF.</span>}
        <button className="close-btn" aria-label="Cancel" onClick={(e) => (e.stopPropagation(), setForm(null))}>
          <XIcon />
        </button>
      </div>
    )

  return (
    <div className="doc-actions" onClick={(e) => e.stopPropagation()}>
      {files.length > 1 && pdfs && chip(`Merge ${files.length} PDFs`, () => void act({ op: 'merge', ids: files.map((f) => f.id) }), ' on')}
      {one?.kind === 'pdf' && (
        <>
          {chip('Pages…', () => (setPages(''), setForm('pages')))}
          {chip('Rotate', () => void act({ op: 'rotate', id: one.id, degrees: 90 }))}
          {(one.pages ?? 0) > 1 && chip('Split', () => void act({ op: 'split', id: one.id, every: 1 }))}
          {chip('Number pages', () => void act({ op: 'numbers', id: one.id }))}
        </>
      )}
      {one && targets.length > 0 && chip('Convert…', () => setForm('convert'))}
      {one && chip('Open', () => void window.island.docs.open(one.id).catch(() => {}))}
      {one && chip('Show in Folder', () => void window.island.docs.show(one.id).catch(() => {}))}
      {remove}
    </div>
  )
}

/** Ask the agent about the selected files; saved requests ("recipes") are one tap. */
function Ask({
  claude,
  files,
  all,
  recipes,
  onTyping,
  hideBefore,
  onAsk,
}: {
  claude: ClaudeView | null
  files: DocEntry[]
  /** Every listed file (to offer the ones the agent makes). */
  all: DocEntry[]
  recipes: DocRecipe[]
  onTyping: (on: boolean) => void
  /** A quick action ran after this question: its result shows instead. */
  hideBefore: number
  onAsk: () => void
}) {
  const { name } = useCharacter()
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [askedAt, setAskedAt] = useState(0)
  const [closedRun, setClosedRun] = useState<string | null>(null)
  const kb = useKeyboard(onTyping)
  const ref = useRef<HTMLTextAreaElement>(null)
  if (!claude) return null
  const code = claude.assistant.provider === 'claude-code'
  const who = code ? 'Claude' : name
  const run = claude.run
  const working = runActive(run)
  // The answer to what was asked from here (not to the Claude tab).
  const ours = run && askedAt && askedAt > hideBefore && run.startedAt >= askedAt - 2000 && run.id !== closedRun ? run : null
  // Files made while answering, to open in one tap.
  const fresh = ours && !working ? all.filter((f) => f.origin === 'made' && f.at >= ours.startedAt && !f.missing).slice(0, 2) : []

  if (!code && claude.assistant.problem)
    return (
      <div className="docs-ask setup">
        <span className="caption">Set up an AI in Settings to ask {name} to review, correct or write documents. The buttons above work without it.</span>
        <button className="pill small" onClick={(e) => (e.stopPropagation(), window.island.openSettings('ai'))}>
          Set Up
        </button>
      </div>
    )

  const send = async (instruction: string) => {
    const t = instruction.trim()
    if (!t || working) return
    setErr(null)
    // Claude Code works with paths; the island's agent with the workspace ids.
    const list = files.map((f) => (code ? f.path : `${f.name} (id ${f.id})`)).join('; ')
    try {
      setAskedAt(Date.now())
      onAsk()
      await window.island.claude.ask(files.length ? `${t}\n\n(Files: ${list})` : t)
      setText('')
    } catch (e) {
      setErr(errorText(e))
    }
  }
  const ideas = files.length ? suggestions(files) : []
  const saveRecipe = async () => {
    const t = text.trim()
    if (!t) return
    await window.island.docs.saveRecipe({ name: recipeName(t), instruction: t }).catch((e) => setErr(errorText(e)))
  }

  return (
    <div className="docs-ask" onClick={(e) => e.stopPropagation()}>
      {ours && (
        <div className={`docs-run${working ? ' live' : ''}${ours.phase === 'error' ? ' failed' : ''}`}>
          <Character mood={moodFor(ours.phase, ours.tool?.name)} size={26} label={runStatus(ours)} />
          <div className="docs-run-text">
            <div className="claude-status">{working ? runStatus(ours) : ours.phase === 'error' ? 'Couldn’t finish' : runStatus(ours)}</div>
            {(ours.reply || ours.error) && <div className="docs-run-reply">{ours.phase === 'error' ? ours.error : ours.reply}</div>}
            {fresh.length > 0 && (
              <div className="docs-run-files">
                {fresh.map((f) => (
                  <button key={f.id} className="chip" title={f.path} onClick={() => void window.island.docs.open(f.id).catch(() => {})}>
                    Open {f.name.length > 30 ? `${f.name.slice(0, 29)}…` : f.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {working ? (
            <button className="round-btn stop" title={`Stop ${who}`} aria-label={`Stop ${who}`} onClick={() => void window.island.claude.stop()}>
              <StopIcon />
            </button>
          ) : (
            <button className="close-btn" aria-label="Dismiss" onClick={() => setClosedRun(ours.id)}>
              <XIcon />
            </button>
          )}
        </div>
      )}
      {!working && !text.trim() && (ideas.length > 0 || recipes.length > 0) && (
        <div className="chips docs-ideas">
          {recipes.map((r) => (
            <span key={r.id} className="chip recipe" title={r.instruction}>
              <button className="plain" onClick={() => (files.length ? void send(r.instruction) : setText(r.instruction))}>
                {r.name}
              </button>
              <button className="plain recipe-x" aria-label={`Forget “${r.name}”`} onClick={() => void window.island.docs.removeRecipe(r.id)}>
                <XIcon />
              </button>
            </span>
          ))}
          {ideas.map((s) => (
            <button key={s.name} className="chip idea" title={s.instruction} onClick={() => void send(s.instruction)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      {err && (
        <div className="status error" onClick={() => setErr(null)}>
          {err}
        </div>
      )}
      <div className="reply-field claude-field">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={working ? `${who} is working…` : files.length ? `Ask ${who} to do something with ${files.length === 1 ? 'this file' : `these ${files.length} files`}…` : `Ask ${who}, or pick files first…`}
          aria-label={`Ask ${who} about documents`}
          onPointerDown={() => {
            kb.take()
            setTimeout(() => ref.current?.focus(), 50)
          }}
          onFocus={kb.take}
          onBlur={kb.release}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(text)
            } else if (e.key === 'Escape') {
              ref.current?.blur()
            }
          }}
        />
        {text.trim() && !working && (
          <button className="plain save-recipe" title="Save as a recipe (one tap next time)" aria-label="Save as a recipe" onClick={() => void saveRecipe()}>
            ☆
          </button>
        )}
        <button className="send" title="Send" aria-label="Send" disabled={!text.trim() || working} onClick={() => void send(text)}>
          ↑
        </button>
      </div>
    </div>
  )
}
