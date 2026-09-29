import { useEffect, useState, type ReactNode } from 'react'
import { avatarGradient, initialsOf } from '@shared/avatar'

/** Strip Electron's "Error invoking remote method" prefix. */
export function errorText(e: any): string {
  return String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/**
 * Load data from the main process, reload when `reloadOn` fires, and expose
 * loading / error state. Keeps showing the previous data while reloading.
 */
/** Last loaded value per cache key: reopening a view shows it straight away. */
const loadCache = new Map<string, unknown>()

export function useLoad<T>(
  load: () => Promise<T>,
  deps: unknown[],
  reloadOn?: (reload: () => void) => () => void,
  /** Start from the last value loaded under this key (then refresh it). */
  cacheKey?: string,
) {
  const [data, setData] = useState<T | null>(() => (cacheKey ? ((loadCache.get(cacheKey) as T) ?? null) : null))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let live = true
    setLoading(true)
    load()
      .then((d) => {
        if (!live) return
        if (cacheKey) loadCache.set(cacheKey, d)
        setData(d)
        setError(null)
      })
      .catch((e) => live && setError(errorText(e)))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  useEffect(() => reloadOn?.(() => setNonce((n) => n + 1)), deps) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error, loading, reload: () => setNonce((n) => n + 1) }
}

/** Apple-style activity indicator. */
export function Spinner() {
  return <span className="spinner" aria-label="Loading" />
}

/** Centered empty / error state with an optional action. */
export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="title">{title}</div>
      {body && <div className="caption">{body}</div>}
      {action}
    </div>
  )
}

export function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button
      className="back"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 2 2 8l6 6" />
      </svg>
      {label}
    </button>
  )
}

export function initials(name: string): string {
  return initialsOf(name) || '?'
}

/** Photo if we have one, else coloured initials (a person glyph when the name has no letters). */
export function Avatar({ name, src, small }: { name: string; src?: string; small?: boolean }) {
  const cls = `avatar${small ? ' small' : ''}`
  if (src) return <img className={cls} src={src} alt="" />
  const text = initialsOf(name)
  return (
    <div className={`${cls} placeholder`} style={{ background: avatarGradient(name) }} aria-hidden>
      {text || (
        <svg width="55%" height="55%" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="8" r="4.2" />
          <path d="M3.5 21c.8-4.3 4.2-6.6 8.5-6.6s7.7 2.3 8.5 6.6z" />
        </svg>
      )}
    </div>
  )
}

/** Re-render every `ms` so relative times ("5m") stay current. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
