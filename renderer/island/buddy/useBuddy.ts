import { BargeIn } from '../voice/bargein'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClaudeView } from '@shared/claude'
import { IDLE_BUDDY, type BuddyView } from '@shared/buddy'
import { Recorder } from '../voice/recorder'
import { NOISE, transcribe, transcribeLong, warmUp } from '../voice/useVoice'
import { wakeMatch } from '@shared/jarvis'
import { IdleWorker } from '../idleWorker'

export type BuddyListen = 'idle' | 'preparing' | 'listening' | 'transcribing'

export type Buddy = {
  view: BuddyView
  listen: BuddyListen
  level: number
  /** A problem with the microphone or hearing you (the buddy's own are in view.error). */
  micError: string | null
  /** The shortcut: listen, or send what you said, or stop it talking. */
  key: () => void
  cmd: (c: 'next' | 'back' | 'stop' | 'repeat') => void
  /** Yes or no to what it offered. */
  answer: (yes: boolean) => void
  dismiss: () => void
}

// Kokoro, in a worker (let go after a few minutes quiet); audio plays here.
let ctx: AudioContext | null = null
let playing: AudioBufferSourceNode | null = null
let hush: ReturnType<typeof setTimeout> | null = null
const waiting = new Map<number, { resolve: (a: Float32Array) => void; reject: (e: Error) => void }>()

const tts = new IdleWorker(
  () => new Worker(new URL('./tts.worker.ts', import.meta.url), { type: 'module' }),
  (e) => {
    const w = waiting.get(e.data.id)
    if (!w) return
    waiting.delete(e.data.id)
    tts.done()
    if (e.data.type === 'audio') w.resolve(e.data.audio)
    else w.reject(new Error(e.data.error))
  },
  (message) => {
    for (const w of waiting.values()) w.reject(new Error(message === 'crashed' ? 'The natural voice crashed' : message))
    waiting.clear()
  },
)

function synth(id: number, phonemes: string, voice: string, speed: number): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    tts.ask({ type: 'speak', id, phonemes, voice, speed })
  })
}

/** The audio output, running only while it speaks (a running one keeps the audio thread busy with silence). */
function output(): AudioContext {
  if (hush) clearTimeout(hush)
  hush = null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}
function quietSoon(): void {
  if (hush) clearTimeout(hush)
  hush = setTimeout(() => {
    hush = null
    if (!playing && ctx?.state === 'running') void ctx.suspend()
  }, 3000)
}

function play(audio: Float32Array): Promise<void> {
  const ctx = output()
  const buf = ctx.createBuffer(1, audio.length, 24000)
  buf.copyToChannel(new Float32Array(audio), 0)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  playing?.stop()
  playing = src
  return new Promise((resolve) => {
    src.onended = () => {
      if (playing === src) playing = null
      if (!playing) quietSoon()
      resolve()
    }
    src.start()
  })
}

const plain = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** A recording from the phone (AAC, WAV…) as 16 kHz mono, as Whisper wants it. */
export async function decodeForWhisper(bytes: ArrayBuffer): Promise<Float32Array> {
  // Decoding into a 16 kHz context resamples on the way.
  const ac = new OfflineAudioContext(1, 1, 16000)
  const b = await ac.decodeAudioData(bytes)
  if (b.numberOfChannels === 1) return b.getChannelData(0).slice()
  const out = new Float32Array(b.length)
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c)
    for (let i = 0; i < d.length; i++) out[i] += d[i] / b.numberOfChannels
  }
  return out
}

/**
 * The buddy on the island: its shortcut listens (and stops when you stop
 * talking), sends what you said, and plays its natural voice. What it says
 * and where it points come from the main process.
 */
export function useBuddy(claude: ClaudeView | null, name = 'Buddy'): Buddy {
  const [view, setView] = useState<BuddyView>(IDLE_BUDDY)
  const [listen, setListen] = useState<BuddyListen>('idle')
  const [level, setLevel] = useState(0)
  const [micError, setMicError] = useState<string | null>(null)
  const rec = useRef<Recorder | null>(null)
  const claudeRef = useRef(claude)
  claudeRef.current = claude
  const listenRef = useRef(listen)
  listenRef.current = listen
  const viewRef = useRef(view)
  viewRef.current = view

  useEffect(() => {
    if (!window.island.buddy) return
    void window.island.buddy.get().then(setView).catch(() => {})
    return window.island.buddy.onState(setView)
  }, [])

  // The natural voice: the main process sends phonemes, one sentence at a time.
  useEffect(() => {
    if (!window.island.buddy) return
    return window.island.buddy.onSpeak(async (s) => {
      if (s.stop) {
        playing?.stop()
        playing = null
        return
      }
      try {
        const audio = await synth(s.id, s.phonemes ?? '', s.voice ?? 'af_heart', s.speed ?? 1)
        await play(audio)
        window.island.buddy.spoken({ id: s.id, ok: true })
      } catch (e) {
        window.island.buddy.spoken({ id: s.id, ok: false, error: plain(e) })
      }
    })
  }, [])

  const fail = (msg: string) => {
    rec.current = null
    setListen('idle')
    setLevel(0)
    setMicError(msg)
  }

  const start = useCallback(async () => {
    const c = claudeRef.current
    if (!c) return
    setMicError(null)
    try {
      if (!c.stt.ready) {
        setListen('preparing')
        await window.island.claude.ensureSpeechModel()
      }
      const model = (claudeRef.current ?? c).stt.model
      warmUp(model)
      const r = new Recorder({
        level: (rms) => setLevel(Math.min(1, rms * 12)),
        done: async (audio, reason) => {
          rec.current = null
          setLevel(0)
          if (!audio) return fail(reason === 'nothing' ? 'I didn’t hear anything. Try again a little closer to the mic.' : 'Nothing was recorded.')
          setListen('transcribing')
          try {
            const text = (await transcribe(model, audio)).trim()
            if (!text || NOISE.test(text)) return fail('I couldn’t make that out. Try again?')
            setListen('idle')
            await window.island.buddy.ask(text)
          } catch (e) {
            fail(plain(e))
          }
        },
      })
      rec.current = r
      setListen('listening')
      await r.start()
    } catch (e) {
      const msg = plain(e)
      if (/Permission|NotAllowed/i.test(msg)) fail('The island isn’t allowed to use the microphone.')
      else if (/NotFound|Requested device not found/i.test(msg)) fail('No microphone found.')
      else fail(msg)
    }
  }, [])

  const key = useCallback(() => {
    if (listenRef.current === 'listening') return rec.current?.stop()
    if (listenRef.current !== 'idle') return
    // Talking or pointing: the key stops it.
    if (viewRef.current.phase === 'speaking' || viewRef.current.phase === 'pointing') return void window.island.buddy.cmd('stop')
    void start()
  }, [start])

  useEffect(() => {
    if (!window.island.buddy) return
    return window.island.buddy.onKey(key)
  }, [key])

  useEffect(() => () => rec.current?.cancel(), [])

  // The phone as the microphone: its recording is made out here, on this computer.
  useEffect(() => {
    if (!window.island.buddy?.onHear) return
    return window.island.buddy.onHear(async (h) => {
      const answer = (r: { text: string } | { error: string }) => void window.island.buddy.heard(h.id, r)
      try {
        const bytes = Uint8Array.from(atob(h.data), (ch) => ch.charCodeAt(0))
        const audio = await decodeForWhisper(bytes.buffer)
        if (audio.length < 16000 * 0.3) return answer({ error: 'That was too short to make out.' })
        setListen('transcribing')
        let text: string
        if (h.fake) {
          // Tests: a stand-in for Whisper, once the audio really decoded.
          text = h.fake
        } else {
          const c = claudeRef.current
          if (!c) return answer({ error: 'The island is still starting.' })
          if (!c.stt.ready) await window.island.claude.ensureSpeechModel()
          text = (await transcribe((claudeRef.current ?? c).stt.model, audio)).trim()
        }
        setListen('idle')
        if (!text || NOISE.test(text)) return answer({ error: 'I couldn’t make that out. Try again?' })
        answer({ text })
      } catch (e) {
        setListen('idle')
        answer({ error: plain(e) })
      }
    })
  }, [])

  // Call notes: a recording made out here, in pieces (it's long), on this computer.
  useEffect(() => {
    if (!window.island.onTranscribe) return
    return window.island.onTranscribe(async (h) => {
      const answer = (r: { text: string } | { error: string }) => void window.island.transcribed(h.id, r)
      try {
        const audio = await decodeForWhisper(h.data.buffer.slice(h.data.byteOffset, h.data.byteOffset + h.data.byteLength) as ArrayBuffer)
        if (audio.length < 16000 * 0.3) return answer({ error: 'The recording was too short to make out.' })
        // Tests: a stand-in for Whisper, once the audio really decoded.
        if (h.fake) return answer({ text: h.fake })
        const c = claudeRef.current
        if (!c) return answer({ error: 'The island is still starting.' })
        if (!c.stt.ready) await window.island.claude.ensureSpeechModel()
        answer({ text: (await transcribeLong((claudeRef.current ?? c).stt.model, audio)).trim() })
      } catch (e) {
        answer({ error: plain(e) })
      }
    })
  }, [])

  // Talking over it: while it speaks, start talking and it stops to listen.
  useEffect(() => {
    if (view.phase !== 'speaking' || !view.interrupt || listen !== 'idle') return
    let gone = false
    const b = new BargeIn(() => {
      if (gone) return
      gone = true
      void window.island.buddy.cmd('stop')
      void start()
    })
    b.start().catch(() => {})
    return () => {
      gone = true
      b.stop()
    }
  }, [view.phase, view.interrupt, listen, start])

  // The wake word: while it's idle, listen for "hey <name>" (speech stays on this computer).
  const nameRef = useRef(name)
  nameRef.current = name
  const wakeRec = useRef<Recorder | null>(null)
  const idle = listen === 'idle' && view.phase === 'idle' && !view.offer
  useEffect(() => {
    if (!view.wake || !idle || !claudeRef.current?.stt.ready) return
    let stopped = false
    const round = () => {
      if (stopped) return
      const model = claudeRef.current?.stt.model
      if (!model) return
      const r = new Recorder({
        level: () => {},
        done: async (audio) => {
          wakeRec.current = null
          if (stopped) return
          const text = audio ? (await transcribe(model, audio).catch(() => '')).trim() : ''
          const rest = text && !NOISE.test(text) ? wakeMatch(text, nameRef.current) : null
          if (rest === null) return void setTimeout(round, 250)
          if (rest) void window.island.buddy.ask(rest)
          else void start()
        },
      })
      wakeRec.current = r
      r.start().catch(() => setTimeout(round, 5000))
    }
    warmUp(claudeRef.current.stt.model)
    round()
    return () => {
      stopped = true
      wakeRec.current?.cancel()
      wakeRec.current = null
    }
  }, [view.wake, idle, start]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    view,
    listen,
    level,
    micError,
    key,
    cmd: (c) => void window.island.buddy.cmd(c),
    answer: (yes) => void window.island.buddy.answer(yes),
    dismiss: () => {
      setMicError(null)
      if (viewRef.current.error) void window.island.buddy.cmd('stop')
    },
  }
}
