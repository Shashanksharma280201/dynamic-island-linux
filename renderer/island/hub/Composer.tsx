import { useEffect, useRef, useState } from 'react'
import { useKeyboard } from './useKeyboard'

const SendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
  </svg>
)

/**
 * Always-visible message field for the hub (Messages-style). The island is
 * normally unfocusable, so clicking the field asks for keyboard focus and it
 * is handed back on Escape, after sending, or when the field goes away.
 */
export function Composer({
  placeholder,
  onSend,
  onTyping,
  autoFocus = false,
}: {
  placeholder: string
  onSend: (text: string) => Promise<void>
  onTyping: (on: boolean) => void
  autoFocus?: boolean
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const kb = useKeyboard(onTyping)

  const take = () => {
    kb.take()
    ref.current?.focus()
    setTimeout(() => ref.current?.focus(), 50)
  }
  const release = kb.release

  useEffect(() => {
    if (autoFocus) take()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const send = async () => {
    const v = text.trim()
    if (!v || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSend(v)
      setText('')
    } catch (e: any) {
      setError(String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="composer" onClick={(e) => e.stopPropagation()}>
      {error && <div className="status error">Couldn't send: {error}</div>}
      <div className="reply-field">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={placeholder}
          onPointerDown={take}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              ref.current?.blur()
              release()
            }
          }}
        />
        <button className="send" disabled={!text.trim() || busy} onClick={() => void send()} title="Send">
          <SendIcon />
        </button>
      </div>
    </div>
  )
}
