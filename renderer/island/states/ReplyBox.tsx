import { useEffect, useRef, useState } from 'react'

const SendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
  </svg>
)

/**
 * iMessage-style reply field. Takes keyboard focus while open (the island is
 * normally unfocusable) and gives it back on close. Enter sends, Shift+Enter
 * adds a line, Escape cancels.
 */
export function ReplyBox({
  placeholder,
  onSend,
  onClose,
}: {
  placeholder: string
  onSend: (text: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    window.island.setFocus(true)
    // The window becomes focusable asynchronously; focus the field once it is.
    const t = setTimeout(() => ref.current?.focus(), 50)
    ref.current?.focus()
    return () => {
      clearTimeout(t)
      window.island.setFocus(false)
    }
  }, [])

  const send = () => {
    const v = text.trim()
    if (v) onSend(v)
  }

  return (
    <div className="reply" onClick={(e) => e.stopPropagation()}>
      <button className="plain muted" onClick={onClose}>
        Cancel
      </button>
      <div className="reply-field">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={placeholder}
          onPointerDown={() => window.island.setFocus(true)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        />
        <button className="send" disabled={!text.trim()} onClick={send} title="Send">
          <SendIcon />
        </button>
      </div>
    </div>
  )
}
