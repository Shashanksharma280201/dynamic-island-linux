import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { callLine, callNoteText, callPaths, callPrompt, callTranscriptText, elapsed, ffmpegHint, listedAudioDevices, pickAudioDevices, plainCallNotes, readCallNotes, recorderArgs, type CallNote } from '@shared/calls'
import { briefLines } from '@shared/memory'
import { systemCommand } from '@shared/command'
import { bargeStep } from '../renderer/island/voice/bargein'
import { audioInputs, Calls, fixWavSizes } from '../electron/os/calls'

const posix = process.platform !== 'win32'

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime()

describe('call notes', () => {
  it('records the microphone and the speakers, 16 kHz mono', () => {
    const a = recorderArgs({ monitor: 'alsa_output.pci.monitor', out: '/tmp/c.wav', minutes: 60 })
    expect(a.join(' ')).toBe('-nostdin -hide_banner -loglevel error -y -f pulse -i default -f pulse -i alsa_output.pci.monitor -filter_complex amix=inputs=2:duration=longest:normalize=0 -t 3600 -ac 1 -ar 16000 -c:a pcm_s16le /tmp/c.wav')
    expect(recorderArgs({ monitor: null, out: '/x.wav' })).not.toContain('-filter_complex')
  })
  it('on a Mac, the default input (and a loopback); on Windows, named devices, stopped with q', () => {
    expect(recorderArgs({ platform: 'darwin', monitor: null, out: '/x.wav' }).slice(0, 9).join(' ')).toBe('-nostdin -hide_banner -loglevel error -y -f avfoundation -i :default')
    expect(recorderArgs({ platform: 'darwin', mic: 'default', monitor: 'BlackHole 2ch', out: '/x.wav' }).join(' ')).toContain('-f avfoundation -i :default -f avfoundation -i :BlackHole 2ch -filter_complex amix')
    const w = recorderArgs({ platform: 'win32', mic: 'Microphone (Realtek(R) Audio)', monitor: 'Stereo Mix (Realtek(R) Audio)', out: 'C:\\x.wav' })
    expect(w).not.toContain('-nostdin')
    expect(w.slice(0, 12)).toEqual(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'dshow', '-i', 'audio=Microphone (Realtek(R) Audio)', '-f', 'dshow', '-i', 'audio=Stereo Mix (Realtek(R) Audio)'])
    expect([ffmpegHint('darwin'), ffmpegHint('win32'), ffmpegHint('linux')]).toEqual(['brew install ffmpeg', 'winget install ffmpeg', 'sudo apt install ffmpeg'])
  })
  it('reads ffmpeg’s device lists and picks a microphone and a loopback', () => {
    const mac = `[AVFoundation indev @ 0x7f8] AVFoundation video devices:\n[AVFoundation indev @ 0x7f8] [0] FaceTime HD Camera\n[AVFoundation indev @ 0x7f8] [1] Capture screen 0\n[AVFoundation indev @ 0x7f8] AVFoundation audio devices:\n[AVFoundation indev @ 0x7f8] [0] ZoomAudioDevice\n[AVFoundation indev @ 0x7f8] [1] MacBook Pro Microphone\n[AVFoundation indev @ 0x7f8] [2] BlackHole 2ch\n: Input/output error`
    expect(listedAudioDevices(mac)).toEqual(['ZoomAudioDevice', 'MacBook Pro Microphone', 'BlackHole 2ch'])
    expect(pickAudioDevices(listedAudioDevices(mac))).toEqual({ mic: 'MacBook Pro Microphone', monitor: 'BlackHole 2ch' })
    const win = `[dshow @ 000001] "Integrated Camera" (video)\r\n[dshow @ 000001]   Alternative name "@device_pnp_\\\\?\\usb"\r\n[dshow @ 000001] "Stereo Mix (Realtek(R) Audio)" (audio)\r\n[dshow @ 000001]   Alternative name "@device_cm_{33D9A762}\\wave_{A}"\r\n[dshow @ 000001] "Microphone Array (Realtek(R) Audio)" (audio)\r\n[dshow @ 000001] "OBS Virtual Camera" (none)\r\ndummy: Immediate exit requested`
    expect(pickAudioDevices(listedAudioDevices(win))).toEqual({ mic: 'Microphone Array (Realtek(R) Audio)', monitor: 'Stereo Mix (Realtek(R) Audio)' })
    const old = `[dshow @ 0x1] DirectShow video devices (some may be both video and audio devices)\n[dshow @ 0x1]  "HD Webcam"\n[dshow @ 0x1]     Alternative name "@device_pnp_x"\n[dshow @ 0x1] DirectShow audio devices\n[dshow @ 0x1]  "Headset Microphone (Jabra)"\n[dshow @ 0x1]     Alternative name "@device_cm_y"`
    expect(listedAudioDevices(old)).toEqual(['Headset Microphone (Jabra)'])
    expect(pickAudioDevices(listedAudioDevices(old))).toEqual({ mic: 'Headset Microphone (Jabra)', monitor: null })
    expect(pickAudioDevices([])).toEqual({ mic: null, monitor: null })
  })
  it('a WAV stopped hard still says how long it is', () => {
    const header = Buffer.alloc(44)
    header.write('RIFF', 0, 'ascii')
    header.write('WAVEfmt ', 8, 'ascii')
    header.writeUInt32LE(16, 16)
    header.write('data', 36, 'ascii')
    const b = Buffer.concat([header, Buffer.alloc(3200)])
    fixWavSizes(b)
    expect([b.readUInt32LE(4), b.readUInt32LE(40)]).toEqual([b.length - 8, 3200])
    // A finished one stays as it was.
    const ok = Buffer.concat([header, Buffer.alloc(100)])
    ok.writeUInt32LE(100, 40)
    ok.writeUInt32LE(136, 4)
    expect(fixWavSizes(Buffer.from(ok)).equals(ok)).toBe(true)
    expect(fixWavSizes(Buffer.from('not a wav')).toString()).toBe('not a wav')
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

describe.skipIf(!posix)('the recorder', () => {
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

  it('quitting while it records stops the recorder and deletes the audio; a crash’s audio goes too', async () => {
    const { c } = make()
    const started = await c.start()
    await new Promise((r) => setTimeout(r, 200))
    c.abort()
    expect(c.recording()).toBeNull()
    expect(existsSync(join(dir, 'audio', `${started.id}.wav`))).toBe(false)
    expect(c.view()[0]).toMatchObject({ state: 'failed', error: 'The island quit while it was recording; the audio was deleted.' })
    writeFileSync(join(dir, 'audio', 'left.wav'), 'x')
    make()
    expect(existsSync(join(dir, 'audio', 'left.wav'))).toBe(false)
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
    const gone = join(dir, 'gone.sh')
    writeFileSync(gone, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
    const quick = make({ ffmpeg: () => gone }).c
    await quick.start()
    await settle(quick, 'failed')
    expect(quick.view()[0].error).toMatch(/Nothing was recorded|stopped/)
  })

  it('on Windows it asks for a microphone and stops ffmpeg with q', async () => {
    const rec = join(dir, 'win.sh')
    // Ignores Ctrl+C, as ffmpeg does on Windows (there's no such signal there): only q stops it.
    writeFileSync(rec, `#!/bin/sh\ntrap '' INT\nfor last; do :; done\nprintf 'RIFF....WAVEfmt data' > "$last"\nhead -c 32000 /dev/zero >> "$last"\nread q\necho "$q" > "${dir}/said"\nexit 0\n`, { mode: 0o755 })
    const args: string[][] = []
    const none = make({ platform: 'win32', ffmpeg: () => rec, inputs: async () => ({ mic: null, monitor: null }) }).c
    await expect(none.start()).rejects.toThrow(/No microphone/)
    const { c } = make({ platform: 'win32', ffmpeg: () => rec, inputs: async (f) => (args.push([f]), { mic: 'Microphone (USB)', monitor: null }) })
    await c.start()
    expect(args).toEqual([[rec]])
    await new Promise((r) => setTimeout(r, 200))
    const t0 = Date.now()
    await c.stop()
    expect(Date.now() - t0).toBeLessThan(3000)
    expect(readFileSync(join(dir, 'said'), 'utf8').trim()).toBe('q')
    await settle(c, 'done')
    expect(c.view()[0].state).toBe('done')
  })

  it('finds what to record: PulseAudio’s monitor; ffmpeg’s devices elsewhere', async () => {
    const pactl = join(dir, 'pactl')
    writeFileSync(pactl, '#!/bin/sh\n[ "$1" = get-default-sink ] && echo alsa_output.pci-0000.analog-stereo\n', { mode: 0o755 })
    expect(await audioInputs('linux', 'ffmpeg', pactl)).toEqual({ mic: 'default', monitor: 'alsa_output.pci-0000.analog-stereo.monitor' })
    expect(await audioInputs('linux', 'ffmpeg', null)).toEqual({ mic: 'default', monitor: null })
    const ff = join(dir, 'ffmpeg')
    writeFileSync(ff, `#!/bin/sh\necho "$*" > "${dir}/asked"\necho '[dshow @ 01] "Microphone (USB)" (audio)' >&2\necho '[dshow @ 01] "Stereo Mix (Realtek)" (audio)' >&2\nexit 1\n`, { mode: 0o755 })
    expect(await audioInputs('win32', ff, null)).toEqual({ mic: 'Microphone (USB)', monitor: 'Stereo Mix (Realtek)' })
    expect(readFileSync(join(dir, 'asked'), 'utf8').trim()).toBe('-hide_banner -list_devices true -f dshow -i dummy')
    // A Mac records its default input; the list is only for a loopback.
    expect(await audioInputs('darwin', ff, null)).toEqual({ mic: 'default', monitor: 'Stereo Mix (Realtek)' })
  })
})
