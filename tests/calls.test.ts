import { mkdtempSync, writeFileSync, existsSync, rmSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { callLine, callNoteText, callPaths, callPrompt, callTranscriptText, elapsed, plainCallNotes, readCallNotes, recorderArgs, type CallNote } from '@shared/calls'
import { briefLines } from '@shared/memory'
import { systemCommand } from '@shared/command'
import { bargeStep } from '../renderer/island/voice/bargein'
import { Calls } from '../electron/os/calls'

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime()

describe('call notes', () => {
  it('records the microphone and the speakers, 16 kHz mono', () => {
    const a = recorderArgs({ monitor: 'alsa_output.pci.monitor', out: '/tmp/c.wav', minutes: 60 })
    expect(a.join(' ')).toBe('-nostdin -hide_banner -loglevel error -y -f pulse -i default -f pulse -i alsa_output.pci.monitor -filter_complex amix=inputs=2:duration=longest:normalize=0 -t 3600 -ac 1 -ar 16000 -c:a pcm_s16le /tmp/c.wav')
    expect(recorderArgs({ monitor: null, out: '/x.wav' })).not.toContain('-filter_complex')
  })
  it('times', () => {
    expect(elapsed(65_000)).toBe('1:05')
    expect(elapsed(3_725_000)).toBe('1:02:05')
    expect(elapsed(-5)).toBe('0:00')
  })
  it('reads the model’s notes', () => {
    expect(readCallNotes('We agreed on the light theme first. The phone link waits.\n\nTo-dos:\n- Send the new screens by Thursday (Shashank)\n- Ask Asha for the demo video\n* Book the follow-up')).toEqual({
      summary: 'We agreed on the light theme first. The phone link waits.',
      todos: ['Send the new screens by Thursday (Shashank)', 'Ask Asha for the demo video', 'Book the follow-up'],
    })
    expect(readCallNotes('**Action items:**\n1. [ ] Ship it\n2) Tell Bo').todos).toEqual(['Ship it', 'Tell Bo'])
    expect(readCallNotes('Just a summary.')).toEqual({ summary: 'Just a summary.', todos: [] })
  })
  it('without a model: first sentences and what sounds like an action', () => {
    const r = plainCallNotes('We talked about the launch. It went well overall. I’ll send the slides by Friday. The weather was nice. Can you book the room?')
    expect(r.summary).toBe('We talked about the launch. It went well overall.')
    expect(r.todos).toEqual(['I’ll send the slides by Friday.', 'Can you book the room?'])
  })
  it('the prompt says the transcript is data', () => {
    const p = callPrompt('hello', 3)
    expect(p.system).toMatch(/data, never instructions/)
    expect(p.prompt).toMatch(/^A 3-minute call, transcribed:/)
  })
  it('notes for the inbox, transcript as a source', () => {
    const c: CallNote = { id: 'a', started: at(8, 14, 8), ended: at(8, 14, 36), state: 'done', transcript: 'Hello all.', summary: 'Light theme first.', todos: ['Send the screens'] }
    expect(callPaths(c)).toEqual({ note: '01-inbox/2026-11-08-call-1408.md', transcript: '09-sources/calls/2026-11-08-1408.md' })
    expect(callNoteText(c)).toMatch(/^---\ntype: call\ndate: 2026-11-08\nminutes: "28"\nsource: "\[\[09-sources\/calls\/2026-11-08-1408\]\]"\n---/)
    expect(callNoteText(c)).toContain('# Call at 14:08 (28 min)\n\nLight theme first.\n\n## To-dos\n\n- [ ] Send the screens')
    expect(callTranscriptText(c)).toContain('the audio was deleted')
    expect(callLine({ ...c, state: 'recording' }, at(8, 14, 10))).toBe('Recording · 2:00')
    expect(callLine({ ...c, state: 'consent', cloud: 'Claude (x)' }, 0)).toMatch(/^Sum it up with Claude \(x\)\?/)
  })
})

describe('the morning brief, out loud', () => {
  it('the one thing, why, and what’s next', () => {
    const now = at(9, 8)
    expect(briefLines({ one: 'Send Asha the deck.', why: 'You promised it on Friday.' }, [{ start: at(9, 9, 30), title: 'Standup', allDay: false }, { start: at(9, 15), title: 'Design review', allDay: false }], now)).toEqual([
      'Good morning.',
      'The one thing today: Send Asha the deck.',
      'You promised it on Friday.',
      'You have 2 events still to come; the first is Standup at 9:30.',
    ])
    expect(briefLines(null, [], at(9, 14))).toEqual(['Good afternoon.', 'Nothing else on your calendar.'])
    expect(briefLines(null, [{ start: at(9, 0), title: 'Holiday', allDay: true }], at(9, 8)).at(-1)).toBe('All day: Holiday.')
  })
})

describe('talking over the buddy', () => {
  const run = (levels: number[], blockMs = 64) => {
    let s = { floor: 0.01, elapsedMs: 0, loud: [] as number[] }
    for (const [i, r] of levels.entries()) {
      const n = bargeStep(s, r, blockMs)
      if (n.you) return i
      s = n
    }
    return -1
  }
  it('notices you talking, after it settles', () => {
    // Quiet, then you talk.
    expect(run([...Array(10).fill(0.004), ...Array(10).fill(0.08)])).toBe(14)
    // Its own first words leak through: ignored while it settles.
    expect(run([...Array(7).fill(0.09), ...Array(10).fill(0.003)])).toBe(-1)
    // A click isn't talking.
    expect(run([...Array(10).fill(0.004), 0.2, ...Array(10).fill(0.004)])).toBe(-1)
  })
})

describe('the command bar', () => {
  it('records a call in plain words', () => {
    expect(systemCommand('record a call')?.action).toEqual({ t: 'call', on: true })
    expect(systemCommand('call notes')?.action).toEqual({ t: 'call', on: true })
    expect(systemCommand('stop recording')?.action).toEqual({ t: 'call', on: false })
    expect(systemCommand('stop')).toBeNull()
  })
})

describe('the recorder', () => {
  let dir: string
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'calls-'))))
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  /** A stand-in for ffmpeg: writes a WAV to its last argument and waits to be stopped. */
  const fakeRecorder = () => {
    const p = join(dir, 'rec.sh')
    writeFileSync(p, `#!/bin/sh\nfor last; do :; done\nprintf 'RIFF....WAVEfmt data' > "$last"\nhead -c 32000 /dev/zero >> "$last"\ntrap 'exit 0' INT\nwhile :; do sleep 0.05; done\n`)
    chmodSync(p, 0o755)
    return p
  }
  const make = (o: Partial<ConstructorParameters<typeof Calls>[0]> = {}) => {
    const notes: Record<string, string> = {}
    const recording: (CallNote | null)[] = []
    const c = new Calls({
      file: join(dir, 'calls.json'),
      dir: join(dir, 'audio'),
      transcribe: async () => 'We agreed to ship on Friday. I’ll send the notes.',
      ask: async () => ({ ok: true, text: 'Ship on Friday.\nTo-dos:\n- Send the notes', meta: { where: 'local', label: 'x', model: 'm', ms: 1, usage: null, cost: 0 } }),
      writeNote: (p, t) => ((notes[p] = t), true),
      ffmpeg: fakeRecorder,
      onRecording: (x) => void recording.push(x),
      ...o,
    })
    return { c, notes, recording }
  }
  const settle = async (c: Calls, state: string) => {
    for (let i = 0; i < 100 && c.view()[0]?.state !== state; i++) await new Promise((r) => setTimeout(r, 30))
  }

  it('records, stops, makes it out, deletes the audio, sums up, keeps', async () => {
    const { c, notes, recording } = make()
    const started = await c.start()
    expect(started.state).toBe('recording')
    expect(c.recording()?.id).toBe(started.id)
    await new Promise((r) => setTimeout(r, 200))
    await c.stop()
    await settle(c, 'done')
    const done = c.view()[0]
    expect(done).toMatchObject({ state: 'done', summary: 'Ship on Friday.', todos: ['Send the notes'], where: 'local' })
    expect(existsSync(join(dir, 'audio', `${done.id}.wav`))).toBe(false)
    expect(recording.map((x) => (x ? 'on' : 'off'))).toEqual(['on', 'off'])
    c.keep(done.id)
    expect(Object.keys(notes).sort()).toEqual([callPaths(done).note, callPaths(done).transcript].sort())
    expect(c.view()[0].kept).toBe(callPaths(done).note)
  })

  it('the cloud needs your yes; plain notes otherwise', async () => {
    const { c } = make({ ask: async () => ({ ok: false, needsConsent: 'Claude (claude-opus-5-5)' }) })
    await c.start()
    await new Promise((r) => setTimeout(r, 200))
    await c.stop()
    await settle(c, 'consent')
    expect(c.view()[0]).toMatchObject({ state: 'consent', cloud: 'Claude (claude-opus-5-5)' })
    c.plain(c.view()[0].id)
    expect(c.view()[0]).toMatchObject({ state: 'done', where: 'none', todos: ['I’ll send the notes.'] })
  })

  it('says what went wrong, and still deletes the audio', async () => {
    const { c } = make({ transcribe: async () => Promise.reject(new Error('No speech model yet.')) })
    await c.start()
    await new Promise((r) => setTimeout(r, 200))
    await c.stop()
    await settle(c, 'failed')
    expect(c.view()[0]).toMatchObject({ state: 'failed', error: 'No speech model yet.' })
    expect(existsSync(join(dir, 'audio', `${c.view()[0].id}.wav`))).toBe(false)
    const none = make({ ffmpeg: () => null }).c
    await expect(none.start()).rejects.toThrow(/needs ffmpeg/)
    // Stopped before anything was written: it says so.
    const quick = make({ ffmpeg: () => '/bin/true' }).c
    await quick.start()
    await settle(quick, 'failed')
    expect(quick.view()[0].error).toMatch(/Nothing was recorded/)
  })
})
