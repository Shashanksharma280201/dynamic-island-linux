import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClaudeView } from '@shared/claude'
import { Recorder } from './recorder'

export type VoicePhase = 'idle' | 'preparing' | 'listening' | 'transcribing'

export type Voice = {
  phase: VoicePhase
  /** Microphone level 0..1 while listening. */
  level: number
  /** What was heard last (shown until Claude picks it up). */
  heard: string
  error: string | null
  /** Start listening, or finish and send if already listening. */
  toggle: () => void
  cancel: () => void
  clearError: () => void
}

// One worker for the whole island: the model stays loaded between uses.
let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./stt.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e) => {
    const m = e.data
    const p = pending.get(m.id)
    if (!p) return
    pending.delete(m.id)
    if (m.type === 'text') p.resolve(m.text)
    else if (m.type === 'error') p.reject(new Error(m.error))
  }
  worker.onerror = (e) => {
    warmed = ''
    for (const p of pending.values()) p.reject(new Error(e.message || 'Speech recognition crashed'))
    pending.clear()
    worker = null
  }
  return worker
}

let warmed = ''
/** Load the model in the background so the first command is quick. */
export function warmUp(model: string): void {
  if (warmed === model) return
  warmed = model
  getWorker().postMessage({ type: 'load', id: 0, model })
}

function transcribe(model: string, audio: Float32Array): Promise<string> {
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ type: 'transcribe', id, model, audio }, [audio.buffer])
  })
}

/** Whisper sometimes "hears" these in silence or noise. */
const NOISE = /^[\s.,!?]*$|^\[(blank_audio|music|noise|silence)\]$|^\((.*)\)$/i

/**
 * Talk to Claude: record until you stop speaking, transcribe locally, send.
 * Lives at the island level so switching tabs doesn't cut you off.
 */
export function useVoice(view: ClaudeView | null, onSent?: (text: string) => void): Voice {
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [level, setLevel] = useState(0)
  const [heard, setHeard] = useState('')
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<Recorder | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  const fail = (msg: string) => {
    rec.current = null
    setPhase('idle')
    setLevel(0)
    setError(msg)
  }

  const start = useCallback(async () => {
    const v = viewRef.current
    if (!v) return
    if (!v.binary) return fail('Claude Code isn’t installed, so there’s nothing to talk to yet.')
    if (v.run && !['done', 'error', 'stopped'].includes(v.run.phase)) return fail('Claude is still working on the last one.')
    setError(null)
    setHeard('')
    try {
      if (!v.stt.ready) {
        setPhase('preparing')
        await window.island.claude.ensureSpeechModel()
      }
      const model = (viewRef.current ?? v).stt.model
      warmUp(model) // loads while you talk
      const r = new Recorder({
        level: (rms) => setLevel(Math.min(1, rms * 12)),
        done: async (audio, reason) => {
          rec.current = null
          setLevel(0)
          if (!audio) return fail(reason === 'nothing' ? 'I didn’t hear anything. Try again a little closer to the mic.' : 'Nothing was recorded.')
          setPhase('transcribing')
          try {
            const text = (await transcribe(model, audio)).trim()
            if (!text || NOISE.test(text)) return fail('I couldn’t make that out. Try again?')
            setHeard(text)
            await window.island.claude.ask(text)
            onSent?.(text)
            setPhase('idle')
          } catch (e: any) {
            fail(String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
          }
        },
      })
      rec.current = r
      setPhase('listening')
      await r.start()
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      if (/Permission|NotAllowed/i.test(msg)) fail('The island isn’t allowed to use the microphone.')
      else if (/NotFound|Requested device not found/i.test(msg)) fail('No microphone found.')
      else fail(msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }, [onSent])

  const toggle = useCallback(() => {
    if (phaseRef.current === 'listening') rec.current?.stop()
    else if (phaseRef.current === 'idle') void start()
  }, [start])

  const cancel = useCallback(() => {
    rec.current?.cancel()
    rec.current = null
    setPhase('idle')
    setLevel(0)
  }, [])

  // Clear the "heard" line once Claude has picked the command up.
  useEffect(() => {
    if (heard && view?.run?.prompt === heard) setHeard('')
  }, [view?.run?.prompt, heard])

  useEffect(() => () => rec.current?.cancel(), [])

  return { phase, level, heard, error, toggle, cancel, clearError: () => setError(null) }
}
