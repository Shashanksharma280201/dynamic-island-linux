import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { ChatMedia, ChatMediaFile, ChatMessage } from '@shared/types'
import { fileSize, formatTime } from '@shared/format'
import { errorText, Spinner } from './common'
import { DocIcon, DownloadIcon, PauseIcon, PlayIcon, XIcon } from '../icons'

const stop = (e: MouseEvent) => e.stopPropagation()

// One download per attachment, shared by the bubble and the viewer.
const downloads = new Map<string, Promise<ChatMediaFile>>()
const done = new Map<string, ChatMediaFile>()
function fetchMedia(chatId: string, msgId: string): Promise<ChatMediaFile> {
  let p = downloads.get(msgId)
  if (!p) {
    p = window.island.inbox.chatMedia(chatId, msgId).then((f) => (done.set(msgId, f), f))
    p.catch(() => downloads.delete(msgId)) // let a later tap retry
    downloads.set(msgId, p)
  }
  return p
}

/** Downloads (once) a message's attachment. */
function useMediaFile(chatId: string, msgId: string, auto: boolean) {
  const [file, setFile] = useState<ChatMediaFile | null>(() => done.get(msgId) ?? null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const live = useRef(true)
  useEffect(() => () => void (live.current = false), [])
  const load = async (): Promise<ChatMediaFile | null> => {
    if (file) return file
    setLoading(true)
    setError(null)
    try {
      const f = await fetchMedia(chatId, msgId)
      if (live.current) setFile(f)
      return f
    } catch (e) {
      if (live.current) setError(errorText(e))
      return null
    } finally {
      if (live.current) setLoading(false)
    }
  }
  useEffect(() => {
    if (auto) void load()
  }, [auto]) // eslint-disable-line react-hooks/exhaustive-deps
  return { file, error, loading, load }
}

/** The nearest ancestor that scrolls (the chat thread), or null for the window. */
function scrollParent(el: Element): Element | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === 'auto' || o === 'scroll') return p
  }
  return null
}

/** True once the element is in or near view (and stays true). */
function useSeen<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    // Measured against the thread itself, so the margin counts there: a photo
    // just above the visible part loads too, whichever way the thread scrolled first.
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setSeen(true), { root: scrollParent(el), rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return [ref, seen]
}

/** Photos load in full quality on their own (like WhatsApp), up to this size. */
const AUTO_PHOTO_BYTES = 12 * 1024 * 1024

/** Width x height for a preview, keeping the photo's shape. Pure. */
export function previewSize(m: ChatMedia, maxW = 220, maxH = 260): { width: number; height: number } {
  const ratio = m.width && m.height ? m.width / m.height : 4 / 3
  let width = maxW
  let height = width / ratio
  if (height > maxH) {
    height = maxH
    width = height * ratio
  }
  return { width: Math.round(Math.max(90, width)), height: Math.round(Math.max(60, height)) }
}

/**
 * Photo, video or GIF in a bubble, tap to view. Shows WhatsApp's small
 * preview at once; photos then load in full quality when scrolled to.
 */
function Visual({ chatId, m, onView }: { chatId: string; m: ChatMessage & { media: ChatMedia }; onView: () => void }) {
  const size = previewSize(m.media)
  const [ref, seen] = useSeen<HTMLButtonElement>()
  const photo = m.media.kind === 'image' && (!m.media.size || m.media.size <= AUTO_PHOTO_BYTES)
  const { file } = useMediaFile(chatId, m.id, photo && seen)
  const [sharp, setSharp] = useState(false)
  return (
    <button
      ref={ref}
      className={`wa-visual ${m.media.kind}`}
      style={size}
      onClick={(e) => (stop(e), onView())}
      aria-label={m.media.kind === 'video' ? 'Play video' : 'View photo'}
    >
      {m.media.thumb ? <img className="wa-preview" src={m.media.thumb} alt="" /> : !sharp && <span className="wa-visual-empty" />}
      {file && <img className={`wa-full${sharp ? ' shown' : ''}`} src={file.url} alt="" onLoad={() => setSharp(true)} />}
      {m.media.kind === 'video' && (
        <>
          <span className="wa-play">
            <PlayIcon size={20} />
          </span>
          {m.media.duration ? <span className="wa-badge">{formatTime(m.media.duration)}</span> : null}
        </>
      )}
    </button>
  )
}

/** Stickers have no bubble and load straight away (they are tiny). */
function Sticker({ chatId, m }: { chatId: string; m: ChatMessage & { media: ChatMedia } }) {
  const { file } = useMediaFile(chatId, m.id, true)
  const src = file?.url ?? m.media.thumb
  return src ? <img className="wa-sticker" src={src} alt="Sticker" /> : <span className="wa-sticker placeholder">Sticker</span>
}

/** Voice note / audio: play inline. */
function Voice({ chatId, m }: { chatId: string; m: ChatMessage & { media: ChatMedia } }) {
  const { error, loading, load } = useMediaFile(chatId, m.id, false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(m.media.duration ?? 0)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  useEffect(() => () => audio.current?.pause(), [])
  const toggle = async (e: MouseEvent) => {
    stop(e)
    if (audio.current && !audio.current.paused) return audio.current.pause()
    if (!audio.current) {
      const f = await load()
      if (!f) return
      const a = new Audio(f.url)
      a.ontimeupdate = () => setPos(a.currentTime)
      a.onloadedmetadata = () => Number.isFinite(a.duration) && setDur(a.duration)
      a.onplay = () => setPlaying(true)
      a.onpause = () => setPlaying(false)
      a.onended = () => (setPlaying(false), setPos(0))
      a.onerror = () => (setPlaying(false), setVoiceError('This voice message can\u2019t play here'))
      audio.current = a
    }
    void audio.current.play()
  }
  const pct = dur ? Math.min(100, (pos / dur) * 100) : 0
  return (
    <div className="wa-voice" data-pos={pos.toFixed(2)}>
      <button className="wa-voice-btn" onClick={(e) => void toggle(e)} aria-label={playing ? 'Pause' : 'Play voice message'}>
        {loading ? <Spinner /> : playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
      </button>
      <div className="wa-voice-main">
        <div className="wa-voice-track">
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className="wa-voice-time">{error ?? voiceError ?? formatTime(playing || pos ? pos : dur)}</span>
      </div>
    </div>
  )
}

/** Document: name and size; tap to save to Downloads and open it. */
function Doc({ chatId, m }: { chatId: string; m: ChatMessage & { media: ChatMedia } }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | string>('idle')
  const open = async (e: MouseEvent) => {
    stop(e)
    setState('saving')
    try {
      await window.island.inbox.openChatMedia(chatId, m.id)
      setState('saved')
    } catch (err) {
      setState(errorText(err))
    }
  }
  const name = m.media.name || 'Document'
  const ext = name.includes('.') ? name.split('.').pop()!.toUpperCase() : ''
  return (
    <button className="wa-doc" onClick={(e) => void open(e)} aria-label={`Open ${name}`}>
      <span className="wa-doc-icon">
        <DocIcon />
      </span>
      <span className="wa-doc-text">
        <span className="wa-doc-name ellipsis">{name}</span>
        <span className="wa-doc-sub">
          {state === 'saving'
            ? 'Downloading…'
            : state === 'saved'
              ? 'Saved to Downloads'
              : state !== 'idle'
                ? state
                : [ext, m.media.size ? fileSize(m.media.size) : ''].filter(Boolean).join(' · ')}
        </span>
      </span>
      <DownloadIcon />
    </button>
  )
}

/** The attachment part of a chat bubble. */
export function MessageMedia({ chatId, m, onView }: { chatId: string; m: ChatMessage & { media: ChatMedia }; onView: (m: ChatMessage) => void }) {
  switch (m.media.kind) {
    case 'image':
    case 'video':
      return <Visual chatId={chatId} m={m} onView={() => onView(m)} />
    case 'sticker':
      return <Sticker chatId={chatId} m={m} />
    case 'voice':
    case 'audio':
      return <Voice chatId={chatId} m={m} />
    default:
      return <Doc chatId={chatId} m={m} />
  }
}

/** Full-size photo / video over the conversation. */
export function MediaViewer({ chatId, m, onClose }: { chatId: string; m: ChatMessage; onClose: () => void }) {
  const { file, error } = useMediaFile(chatId, m.id, true)
  const [saved, setSaved] = useState<string | null>(null)
  const [cantPlay, setCantPlay] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const video = m.media?.kind === 'video'
  return (
    <div className="wa-viewer" onClick={(e) => (stop(e), onClose())} role="dialog" aria-label={video ? 'Video' : 'Photo'}>
      <div className="wa-viewer-bar" onClick={stop}>
        <button className="sp-icon-btn" aria-label="Close" onClick={onClose}>
          <XIcon />
        </button>
        <span className="spacer" />
        <button
          className="pill"
          onClick={() =>
            window.island.inbox
              .openChatMedia(chatId, m.id)
              .then(() => setSaved('Saved to Downloads'))
              .catch((e) => setSaved(errorText(e)))
          }
        >
          {saved ?? 'Open'}
        </button>
      </div>
      <div className="wa-viewer-body" onClick={stop}>
        {file && cantPlay ? (
          <div className="wa-viewer-error">This video can&apos;t play here. Use Open to watch it in your video player.</div>
        ) : file ? (
          video ? (
            <video src={file.url} controls autoPlay playsInline onError={() => setCantPlay(true)} />
          ) : (
            <img src={file.url} alt={m.text || 'Photo'} />
          )
        ) : error ? (
          <div className="wa-viewer-error">{error}</div>
        ) : (
          <>
            {m.media?.thumb && <img className="wa-viewer-thumb" src={m.media.thumb} alt="" />}
            <div className="wa-viewer-loading">
              <Spinner />
              <span>{video ? 'Downloading video…' : 'Loading photo…'}</span>
            </div>
          </>
        )}
      </div>
      {m.text && <div className="wa-viewer-caption">{m.text}</div>}
    </div>
  )
}
