import { useEffect, useRef, useState } from 'react'
import type { NoteSummary } from '@shared/types'
import { relativeTime, fullTime } from '@shared/format'
import { BackButton, Empty, Spinner, errorText, useLoad, useNow } from './common'
import { useKeyboard } from './useKeyboard'
import { SearchField } from './SearchField'
import { NoteIcon, PlusIcon, TrashIcon } from '../icons'

type Status = 'idle' | 'saving' | 'saved' | 'error'

/** Edit one note; saves automatically shortly after you stop typing. */
function Editor({
  note,
  onBack,
  onTyping,
}: {
  note: { id?: string; body: string; updated?: number }
  onBack: () => void
  onTyping: (on: boolean) => void
}) {
  const [body, setBody] = useState(note.body)
  const [id, setId] = useState(note.id)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const saved = useRef(note.body)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const kb = useKeyboard(onTyping)

  const save = async (text: string) => {
    if (text === saved.current) return
    if (!id && !text.trim()) return // don't create empty notes
    setStatus('saving')
    try {
      const newId = await window.island.notes.save(id, text)
      saved.current = text
      setId(newId)
      setStatus('saved')
      setError(null)
    } catch (e) {
      setStatus('error')
      setError(errorText(e))
    }
  }

  // New notes open ready to type.
  useEffect(() => {
    if (!note.id) {
      kb.take()
      ref.current?.focus()
      setTimeout(() => ref.current?.focus(), 50)
    }
    return () => clearTimeout(timer.current ?? undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = async () => {
    clearTimeout(timer.current ?? undefined)
    await save(body)
    // A note left empty is removed rather than kept as "New Note".
    if (id && !body.trim()) await window.island.notes.remove(id).catch(() => {})
    kb.release()
    onBack()
  }

  return (
    <div className="view">
      <div className="view-head">
        <BackButton onClick={() => void close()} label="Notes" />
        <span className="view-title caption">
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Not saved' : ''}
        </span>
        {id &&
          (confirmDelete ? (
            <button
              className="pill danger small"
              onClick={async (e) => {
                e.stopPropagation()
                await window.island.notes.remove(id)
                kb.release()
                onBack()
              }}
            >
              Delete
            </button>
          ) : (
            <button className="icon-btn" title="Delete note" aria-label="Delete note" onClick={(e) => (e.stopPropagation(), setConfirmDelete(true))}>
              <TrashIcon />
            </button>
          ))}
        {!id && <span style={{ width: 36 }} />}
      </div>
      {note.updated && <div className="caption note-date">{fullTime(note.updated)}</div>}
      <textarea
        ref={ref}
        className="note-editor"
        value={body}
        placeholder="Start typing… the first line is the title"
        onPointerDown={() => {
          kb.take()
          setTimeout(() => ref.current?.focus(), 50)
        }}
        onFocus={kb.take}
        onChange={(e) => {
          const v = e.target.value
          setBody(v)
          setStatus('idle')
          clearTimeout(timer.current ?? undefined)
          timer.current = setTimeout(() => void save(v), 600)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            void close()
          }
        }}
      />
      {error && <div className="status error">{error}</div>}
    </div>
  )
}

export function NotesView({ onTyping }: { onTyping: (on: boolean) => void }) {
  const [open, setOpen] = useState<{ id?: string; body: string; updated?: number } | null>(null)
  const [query, setQuery] = useState('')
  const { data, error, loading } = useLoad(() => window.island.notes.list(), [open === null])
  const now = useNow()

  if (open) return <Editor note={open} onBack={() => setOpen(null)} onTyping={onTyping} />

  const q = query.trim().toLowerCase()
  const shown = (data ?? []).filter(
    (n: NoteSummary) => !q || n.title.toLowerCase().includes(q) || n.preview.toLowerCase().includes(q),
  )

  const openNote = async (n: NoteSummary) => {
    try {
      const full = await window.island.notes.get(n.id)
      setOpen({ id: full.id, body: full.body, updated: full.updated })
    } catch (e) {
      console.error(errorText(e))
    }
  }

  return (
    <div className="view">
      <div className="view-head">
        <SearchField value={query} onChange={setQuery} onTyping={onTyping} placeholder="Search notes" />
        <button
          className="icon-btn new-note"
          aria-label="New note"
          title="New note"
          onClick={(e) => {
            e.stopPropagation()
            setOpen({ body: '' })
          }}
        >
          <PlusIcon />
        </button>
      </div>
      <div className="list">
        {!data && loading && <Spinner />}
        {error && !data && <Empty title="Couldn't load notes" body={error} />}
        {data && data.length === 0 && (
          <Empty
            icon={<NoteIcon />}
            title="No notes yet"
            body="Jot things down any time. Notes are saved on this computer."
            action={
              <button className="pill primary" onClick={(e) => (e.stopPropagation(), setOpen({ body: '' }))}>
                New Note
              </button>
            }
          />
        )}
        {data && data.length > 0 && shown.length === 0 && <Empty title="No matching notes" />}
        {shown.map((n) => (
          <button key={n.id} className="list-row note-row" onClick={(e) => (e.stopPropagation(), void openNote(n))}>
            <div className="list-main">
              <div className="list-top">
                <span className="title ellipsis">{n.title}</span>
                <span className="when">{relativeTime(n.updated, now)}</span>
              </div>
              <div className="secondary ellipsis snippet">{n.preview || 'No additional text'}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
