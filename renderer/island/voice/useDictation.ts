import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClaudeView } from '@shared/claude'
import { Recorder } from './recorder'
import { NOISE, transcribe, warmUp } from './useVoice'

/** A problem in a few plain words. Pure. */
export function friendly(raw: string): string {
  const msg = raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  if (/Permission|NotAllowed/i.test(msg)) return 'The island isn’t allowed to use the microphone'
  if (/NotFound|Requested device not found/i.test(msg)) return 'No microphone found'
  if (/fetch|network|ENOTFOUND|ECONN|EAI_AGAIN|download|timed? ?out|403|404/i.test(msg)) return 'Couldn’t download speech recognition. Check your connection and try again'
  return msg
}

export type DictationPhase = 'idle' | 'preparing' | 'listening' | 'transcribing' | 'typed' | 'error'

export type Dictation = {
  phase: DictationPhase
  /** Microphone level 0..1 while listening. */
  level: number
  /** What was typed (or why not). */
  text: string
  toggle: () => void
  cancel: () => void
}

/**
 * Dictate anywhere: press the shortcut, speak, and what you said is typed
 * into the app you're in (on this computer: local Whisper, nothing leaves it).
 * Stops when you stop talking, or press the shortcut again.
 */
export function useDictation(view: ClaudeView | null): Dictation {
  const [phase, setPhase] = useState<DictationPhase>('idle')
  const [level, setLevel] = useState(0)
  const [text, setText] = useState('')
  const rec = useRef<Recorder | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const clear = useRef<ReturnType<typeof setTimeout>>()

  const settle = (p: 'typed' | 'error', t: string) => {
    rec.current = null
    setLevel(0)
    setText(t)
    setPhase(p)
    clearTimeout(clear.current)
    clear.current = setTimeout(() => setPhase('idle'), p === 'error' ? 3200 : 2200)
  }

  const start = useCallback(async () => {
    clearTimeout(clear.current)
    setText('')
    try {
      const v = viewRef.current
      if (!v?.stt.ready) {
        setPhase('preparing')
        await window.island.claude.ensureSpeechModel()
      }
      const model = viewRef.current?.stt.model ?? v?.stt.model ?? 'base'
      warmUp(model)
      const r = new Recorder({
        level: (rms) => setLevel(Math.min(1, rms * 12)),
        done: async (audio, reason) => {
          rec.current = null
          setLevel(0)
          if (!audio) return settle('error', reason === 'nothing' ? 'I didn’t hear anything' : 'Nothing was recorded')
          setPhase('transcribing')
          try {
            const said = (await transcribe(model, audio)).trim()
            if (!said || NOISE.test(said)) return settle('error', 'I couldn’t make that out')
            const ok = await window.island.dictate.type(said)
            settle(ok ? 'typed' : 'error', ok ? said : 'Copied: press Ctrl+V to paste it')
          } catch (e: any) {
            settle('error', friendly(String(e?.message ?? e)))
          }
        },
      })
      rec.current = r
      setPhase('listening')
      await r.start()
    } catch (e: any) {
      settle('error', friendly(String(e?.message ?? e)))
    }
  }, [])

  const toggle = useCallback(() => {
    if (phaseRef.current === 'listening') rec.current?.stop()
    else if (phaseRef.current === 'idle' || phaseRef.current === 'typed' || phaseRef.current === 'error') void start()
  }, [start])

  const cancel = useCallback(() => {
    rec.current?.cancel()
    rec.current = null
    setLevel(0)
    setPhase('idle')
  }, [])

  useEffect(() => window.island.dictate?.onToggle(toggle), [toggle])
  useEffect(() => () => (rec.current?.cancel(), clearTimeout(clear.current)), [])

  return { phase, level, text, toggle, cancel }
}
