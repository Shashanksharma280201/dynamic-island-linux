import { useRef } from 'react'
import { useKeyboard } from './useKeyboard'
import { SearchIcon } from '../icons'

/** iOS-style search field. Takes keyboard focus for the island only while in use. */
export function SearchField({
  value,
  onChange,
  onTyping,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onTyping: (on: boolean) => void
  placeholder: string
}) {
  const kb = useKeyboard(onTyping)
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="search" onClick={(e) => e.stopPropagation()}>
      <SearchIcon />
      <input
        ref={input}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onPointerDown={() => {
          kb.take()
          // Focus again once the window has become focusable.
          setTimeout(() => input.current?.focus(), 50)
        }}
        onFocus={kb.take}
        onBlur={kb.release}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onChange('')
            input.current?.blur()
          }
        }}
      />
      {value && (
        <button className="search-clear" aria-label="Clear search" onClick={() => onChange('')}>
          ×
        </button>
      )}
    </div>
  )
}
