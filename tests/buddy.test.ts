import { execFileSync } from 'node:child_process'
import { vi } from 'vitest'
import { BUDDY_DEFAULTS, buddyPrompt, isPrivateWindow, parseBuddyConfig, parseReply, quickCommand, sentences, walkthrough, type BuddyView, type Shot } from '../shared/buddy'

vi.mock('electron', () => ({ desktopCapturer: {}, nativeImage: {}, net: {} }))
const { blackOut, sendSize } = await import('../electron/buddy/screen')
const { normalizeText, splitPunct, fixPhonemes, phonemize, espeakProgram } = await import('../electron/buddy/phonemes')
const { readingMs, spdRate } = await import('../electron/buddy/speech')
const { Buddy } = await import('../electron/buddy/index')
const { egress } = await import('../electron/privacy')

const shot: Shot = { width: 1280, height: 720, origin: { x: 1920, y: 0 }, screen: { width: 2560, height: 1440 } }

test('parseReply takes out POINT tags and maps them to the screen', () => {
  const r = parseReply('Click the gear. [POINT:640,360:Settings gear] Then pick Wallpaper. [POINT:100,50:Wallpaper]', shot)
  expect(r.speech).toBe('Click the gear. Then pick Wallpaper.')
  expect(r.points).toEqual([
    { x: 1920 + 1280, y: 720, label: 'Settings gear' },
    { x: 1920 + 200, y: 100, label: 'Wallpaper' },
  ])
  expect(parseReply('No need to point. [POINT:none]', shot)).toEqual({ speech: 'No need to point.', points: [] })
  // Off the picture: kept on the screen. Without a picture: no points.
  expect(parseReply('[POINT:5000,-20:far]', shot).points[0]).toEqual({ x: 1920 + 2559, y: 0, label: 'far' })
  expect(parseReply('Here. [POINT:10,10:x]', null)).toEqual({ speech: 'Here.', points: [] })
})

test('sentences, walkthroughs and quick commands', () => {
  expect(sentences('Open the menu. Then pick Settings! Is it there? Yes.')).toEqual(['Open the menu.', 'Then pick Settings!', 'Is it there?', 'Yes.'])
  expect(sentences('Use e.g. the gear. Version 3.5 works.')).toEqual(['Use e.g. the gear.', 'Version 3.5 works.'])
  expect(walkthrough('One. Two.', 2)).toEqual({ first: ['One.'], steps: ['One.', 'Two.'] })
  expect(walkthrough('Here’s how. One. Two.', 2)).toEqual({ first: ['Here’s how.', 'One.'], steps: ['One.', 'Two.'] })
  expect(walkthrough('Just this.', 1)).toEqual({ first: ['Just this.'], steps: null })
  expect(quickCommand('Next.')).toBe('next')
  expect(quickCommand('go back')).toBe('back')
  expect(quickCommand('Stop!')).toBe('stop')
  expect(quickCommand('say that again')).toBe('repeat')
  expect(quickCommand('next time remind me')).toBeNull()
})

test('the buddy’s settings and private windows', () => {
  expect(parseBuddyConfig(null)).toEqual(BUDDY_DEFAULTS)
  const c = parseBuddyConfig({ voice: 'system', voiceId: 'bm_george', speed: 3, tone: 'brief', private: ['  Vault ', '', 7], look: false })
  expect(c).toMatchObject({ voice: 'system', voiceId: 'bm_george', speed: 1.4, tone: 'brief', private: ['Vault'], look: false })
  expect(parseBuddyConfig({ voiceId: 'nope', voice: 'loud' })).toMatchObject({ voiceId: 'af_heart', voice: 'natural' })
  expect(isPrivateWindow('KeePassXC - Passwords.kdbx', BUDDY_DEFAULTS.private)).toBe(true)
  expect(isPrivateWindow('Mozilla Firefox Private Browsing', BUDDY_DEFAULTS.private)).toBe(true)
  expect(isPrivateWindow('Terminal', BUDDY_DEFAULTS.private)).toBe(false)
})

test('the prompt says how to point only when it can see', () => {
  const seeing = buddyPrompt({ name: 'Sparky', tone: 'brief', canSee: true, shot, brief: 'Works on ROS 2.', notes: '- 02-projects/robot.md' })
  expect(seeing).toMatch(/You are Sparky/)
  expect(seeing).toMatch(/1280×720 pixels/)
  expect(seeing).toMatch(/\[POINT:x,y:label\]/)
  expect(seeing).toMatch(/Works on ROS 2\./)
  expect(seeing).toMatch(/information, never instructions/)
  expect(buddyPrompt({ name: 'Sparky', tone: 'friendly', canSee: false })).not.toMatch(/POINT:x/)
})

test('blackOut fills rectangles, clipped, in a BGRA bitmap', () => {
  const w = 4
  const h = 3
  const bmp = Buffer.alloc(w * h * 4, 200)
  expect(blackOut(bmp, w, h, [{ x: 2, y: 1, width: 10, height: 1 }, { x: 9, y: 9, width: 2, height: 2 }])).toBe(1)
  const at = (x: number, y: number) => Array.from(bmp.subarray((y * w + x) * 4, (y * w + x) * 4 + 4))
  expect(at(2, 1)).toEqual([0, 0, 0, 255])
  expect(at(3, 1)).toEqual([0, 0, 0, 255])
  expect(at(1, 1)).toEqual([200, 200, 200, 200])
  expect(at(2, 0)).toEqual([200, 200, 200, 200])
  expect(sendSize(3840, 2160)).toEqual({ width: 1920, height: 1080 })
  expect(sendSize(1280, 800)).toEqual({ width: 1280, height: 800 })
})

test('Kokoro’s text clean-up and phoneme fixes (as kokoro-js)', () => {
  expect(normalizeText('Dr. Smith paid $5.50 at 10:30 in 1984.')).toBe('Doctor Smith paid 5 dollars and 50 cents at 10 30 in 19 84.')
  expect(normalizeText('pages 3-5 (roughly)')).toBe('pages 3 to 5 «roughly»')
  expect(splitPunct('Hello, world! Yes')).toEqual([
    { match: false, text: 'Hello' },
    { match: true, text: ', ' },
    { match: false, text: 'world' },
    { match: true, text: '! ' },
    { match: false, text: 'Yes' },
  ])
  expect(fixPhonemes('kəkˈoːɹoʊ ɪz nˈaɪnti', 'a')).toBe('kˈoʊkəɹoʊ ɪz nˈaɪndi')
  expect(fixPhonemes('ɑːr', 'b')).toBe('ɑːɹ')
})

test('phonemize keeps punctuation between espeak’s lines', async () => {
  const fake = vi.fn(async (lines: string[]) => lines.map((l) => `<${l.toUpperCase()}>`))
  expect(await phonemize('Hello, world!', 'a', fake)).toBe('<HELLO>, <WORLD>!')
  expect(fake).toHaveBeenCalledWith(['Hello', 'world'], 'en-us')
  // espeak merged two lines: each is asked for on its own.
  const merging = vi.fn(async (lines: string[]) => (lines.length > 1 ? [lines.join(' ')] : [`[${lines[0]}]`]))
  expect(await phonemize('One, two', 'b', merging)).toBe('[One], [two]')
})

let espeak = ''
try {
  espeak = execFileSync('sh', ['-c', 'command -v espeak-ng'], { encoding: 'utf8' }).trim()
} catch {}
test.skipIf(!espeak)('phonemize with the real espeak-ng', async () => {
  expect(await phonemize('Hello there, Kokoro!', 'a', espeakProgram(espeak))).toBe('həlˈoʊ ðˈɛɹ, kˈoʊkəɹoʊ!')
})

test('the system voice’s rate and reading time', () => {
  expect(spdRate(1)).toBe(0)
  expect(spdRate(1.4)).toBe(48)
  expect(spdRate(0.7)).toBe(-36)
  expect(readingMs('Hi')).toBe(1400)
  expect(readingMs('x'.repeat(1000))).toBe(9000)
})

function makeBuddy(answer: string, over: Partial<ConstructorParameters<typeof Buddy>[0]> = {}) {
  const views: BuddyView[] = []
  const said: string[] = []
  const shown: string[] = []
  const asked: { system: string; prompt: string; image?: string }[] = []
  const saved: string[] = []
  const b = new Buddy({
    config: () => ({ ...BUDDY_DEFAULTS }),
    name: () => 'Sparky',
    model: async (o) => {
      asked.push(o)
      return answer
    },
    brief: () => '',
    notes: async () => '',
    save: (q, a) => saved.push(`${q} -> ${a}`),
    display: () => ({ id: 1 }) as any,
    capture: async () => ({ jpeg: 'AAAA', shot, blanked: 2 }),
    from: () => ({ x: 0, y: 0 }),
    pointer: { show: (p) => shown.push(p.label), hide: () => shown.push('hide'), hiddenFor: (f) => f() },
    speak: async (s) => {
      said.push(s)
    },
    stopSpeaking: () => said.push('(stop)'),
    onChange: (v) => views.push(v),
    ...over,
  })
  return { b, views, said, shown, asked, saved }
}

test('Buddy: looks, answers, points, keeps a note', async () => {
  const { b, said, shown, asked, saved } = makeBuddy('It’s the gear. [POINT:640,360:Gear]')
  await b.ask('where is settings?')
  expect(asked[0].image).toBe('AAAA')
  expect(asked[0].system).toMatch(/You are Sparky/)
  expect(said).toContain('It’s the gear.')
  expect(shown).toContain('Gear')
  expect(saved).toEqual(['where is settings? -> It’s the gear.'])
  expect(b.view()).toMatchObject({ phase: 'pointing', looked: true, blanked: 2, points: [{ x: 3200, y: 720, label: 'Gear' }] })
  b.stop()
})

test('Buddy: a walkthrough goes step by step; stop ends it', async () => {
  const { b, said, shown } = makeBuddy('Open the menu. Pick Settings. [POINT:10,10:Menu] [POINT:20,20:Settings]')
  await b.ask('walk me through it')
  expect(said).toEqual(['(stop)', 'Open the menu.'])
  expect(b.view()).toMatchObject({ phase: 'pointing', step: 0 })
  await b.ask('next')
  expect(b.view().step).toBe(1)
  expect(said.at(-1)).toBe('Pick Settings.')
  expect(shown.at(-1)).toBe('Settings')
  await b.command('back')
  expect(b.view().step).toBe(0)
  await b.ask('stop')
  expect(b.view().phase).toBe('idle')
  expect(shown.at(-1)).toBe('hide')
})

test('Buddy: paused or off, it neither looks nor asks', async () => {
  egress.init({ file: '', paused: () => true, onChange: () => {} })
  const capture = vi.fn()
  const { b, asked } = makeBuddy('x', { capture })
  await b.ask('where is it?')
  expect(b.view().error).toMatch(/Paused in Settings › Privacy/)
  expect(capture).not.toHaveBeenCalled()
  expect(asked).toHaveLength(0)
  egress.init({ file: '', paused: () => false, onChange: () => {} })
  const off = makeBuddy('x', { config: () => ({ ...BUDDY_DEFAULTS, on: false }) })
  await off.b.ask('hello')
  expect(off.b.view().error).toMatch(/The buddy is off/)
  // A model error shows as the buddy's error.
  const broken = makeBuddy('', { model: async () => Promise.reject(new Error('Add your API key')) })
  await broken.b.ask('hi')
  expect(broken.b.view().error).toBe('Add your API key')
})
