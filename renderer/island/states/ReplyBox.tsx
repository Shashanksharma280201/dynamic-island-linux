import { useEffect, useRef, useState } from 'react'

/**
 * Inline reply field. Takes keyboard focus while open (the island is normally
 * unfocusable) and gives it back on close. Enter sends, Shift+Enter adds a
 * line, Escape cancels.
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
      <textarea
        ref={ref}
        rows={2}
        value={text}
        placeholder={placeholder}
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
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="link" onClick={onClose}>
          Cancel
        </button>
        <button className="btn allow small" disabled={!text.trim()} onClick={send}>
          Send
        </button>
      </div>
    </div>
  )
}
