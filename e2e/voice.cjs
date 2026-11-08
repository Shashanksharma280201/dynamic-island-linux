// End-to-end test of Island OS's voice: Today's Record call puts a red dot
// on the island while a stand-in recorder runs; Stop makes it out on this
// computer (a stand-in for Whisper, after the island really decodes the
// audio), deletes the audio, and sums it up with to-dos (a stand-in
// Ollama); Add to brain keeps the notes and the transcript. The morning
// brief is said out loud with Say it, and talking over the buddy (a speech
// file as the microphone) stops it to listen. Needs an X server and a bus.
const { _electron } = require('playwright-core')
const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { startFakeAi } = require('./fake-ai.cjs')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-voice-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const SOCK = path.join(TMP, 'island.sock')
const USER_DATA = path.join(TMP, 'profile')
const CLAUDE_DIR = path.join(TMP, 'claude-config')
const HOME = process.env.HOME && process.env.HOME !== os.userInfo().homedir ? process.env.HOME : path.join(TMP, 'home')
const VAULT = path.join(HOME, 'Brain')
const TTS = path.join(TMP, 'tts.log')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
const SCALE = Number(process.env.E2E_SCALE) || 1
const HEARD = 'We agreed to ship the island on Friday. I will send the slides tomorrow.'
for (const d of [OUT, USER_DATA, CLAUDE_DIR, HOME]) fs.mkdirSync(d, { recursive: true })

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (f, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) {
    try {
      const v = await f()
      if (v) return v
    } catch {}
  }
  return null
}
const seen = (page, sel, ms = 5000) => page.waitForSelector(sel, { timeout: ms }).then(() => true, () => false)
const gone = (page, sel, ms = 5000) => page.waitForSelector(sel, { state: 'detached', timeout: ms }).then(() => true, () => false)
const key = (combo) => execFileSync('node', [path.join(__dirname, 'xtest.cjs'), 'key', combo])
const said = () => (fs.existsSync(TTS) ? fs.readFileSync(TTS, 'utf8') : '')

/** 16 kHz mono 16-bit PCM WAV of `seconds`: a tone (for the call) or speech (for the microphone). */
function wav(file, samples) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + samples.length * 2, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(16000, 24)
  h.writeUInt32LE(32000, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(samples.length * 2, 40)
  const body = Buffer.alloc(samples.length * 2)
  samples.forEach((v, i) => body.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2))
  fs.writeFileSync(file, Buffer.concat([h, body]))
}
const tone = Array.from({ length: 16000 * 2 }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / 16000))
const CALL_WAV = path.join(TMP, 'call.wav')
wav(CALL_WAV, tone)
// The microphone: someone talking (espeak), with quiet around it.
const MIC = path.join(TMP, 'mic.wav')
try {
  const raw = path.join(TMP, 'raw.wav')
  execFileSync('espeak-ng', ['-v', 'en-us', '-s', '150', '-w', raw, 'Wait, what about the slides for Friday?'])
  const b = fs.readFileSync(raw)
  const rate = b.readUInt32LE(24)
  const pcm = b.subarray(44)
  const n = Math.floor(pcm.length / 2)
  const speech = Array.from({ length: Math.floor((n * 16000) / rate) }, (_, i) => pcm.readInt16LE(Math.min(n - 1, Math.floor((i * rate) / 16000)) * 2) / 32767)
  wav(MIC, [...Array(16000 * 1.5).fill(0), ...speech, ...Array(16000 * 2.5).fill(0)])
} catch {
  // No espeak: a loud tone stands in for a voice.
  wav(MIC, [...Array(16000 * 1.5).fill(0), ...tone.map((v) => v * 2), ...Array(16000 * 2.5).fill(0)])
}
// A stand-in for ffmpeg: writes the call's audio to its last argument and waits for Stop.
const REC = path.join(TMP, 'recorder.sh')
fs.writeFileSync(REC, `#!/bin/sh\nfor last; do :; done\ncp '${CALL_WAV}' "$last"\ntrap 'exit 0' INT TERM\nwhile :; do sleep 0.1; done\n`)
fs.chmodSync(REC, 0o755)

;(async () => {
  const ai = await startFakeAi()
  fs.writeFileSync(
    path.join(USER_DATA, 'config.json'),
    JSON.stringify({ character: { id: 'bolt', name: 'Sparky' }, buddy: { on: true, voice: 'system', interrupt: false, alerts: false, quietFrom: 0, quietTo: 0 } }),
  )
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox', ...(SCALE !== 1 ? [`--force-device-scale-factor=${SCALE}`] : [])],
    cwd: ROOT,
    env: { ...process.env, HOME, DYNAMIC_ISLAND_SOCK: SOCK, CLAUDE_CONFIG_DIR: CLAUDE_DIR, DI_USER_DATA: USER_DATA, DI_NO_GREETING: '1', DI_BACKDROP: 'off', DI_OLLAMA_URL: ai.base, DI_AI_BASE_URL: ai.base, DI_CLAUDE_BIN: '/nonexistent', DI_EGRESS_COUNT_LOCAL: '1', DI_CALL_RECORDER: REC, DI_STT_FAKE: HEARD, DI_TTS_LOG: TTS, DI_TTS_MS: '1500', DI_FAKE_MIC: MIC },
  })
  const page = await app.firstWindow()
  const shot = (p, name) => p.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => {})
  try {
    await page.waitForSelector('.capsule.idle', { timeout: 15000 })
    // A brain, to keep the notes, and the morning card to say.
    const [settings] = await Promise.all([app.waitForEvent('window'), page.evaluate(() => window.island.openSettings('buddy'))])
    await settings.waitForSelector('#buddy', { timeout: 8000 })
    check('Settings › Buddy has Talk over it and Say the morning brief', await seen(settings, '#buddy .toggle-row:has-text("Talk over it")') && (await seen(settings, '#buddy .toggle-row:has-text("Say the morning brief out loud")')))
    check('a brain is made', (await settings.evaluate((v) => window.settings.brain.create(v), VAULT)) === null)
    await settings.evaluate(() => window.settings.brain.runJob('morning'))

    // ---- Record a call ----
    key('ctrl+i')
    await page.waitForSelector('.hub', { timeout: 4000 })
    await page.click('.rail-btn[aria-label="Today"]')
    await page.click('.today-record')
    check('Record call starts recording', await seen(page, '.today-record.on:has-text("Stop")', 6000))
    await page.mouse.move(2, 2)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index.html')).webContents.send('island:toggle-panel'))
    await gone(page, '.hub', 5000)
    check('the island shows a red dot and the time while it records', await seen(page, '.call-compact .rec-dot', 6000) && (await seen(page, '.call-compact .call-time:text-matches("^0:0[0-9]$")')))
    await sleep(1200)
    await shot(page, '01-recording')
    key('ctrl+i')
    await page.waitForSelector('.hub', { timeout: 4000 })
    await page.click('.rail-btn[aria-label="Today"]')
    await page.click('.today-record.on')
    check('Stop makes notes: a summary and to-dos', await seen(page, '.today-call.done .today-call-summary:has-text("We agreed to ship the island on Friday.")', 15000))
    check('with its to-dos', (await page.$$eval('.today-call-todos li', (e) => e.map((x) => x.textContent))).join('|') === 'Send the slides tomorrow|Book the launch room')
    check('by the model on this computer', await seen(page, '.today-call .today-call-meta:has-text("local model")'))
    check('and the audio is deleted', !(fs.existsSync(path.join(USER_DATA, 'calls')) && fs.readdirSync(path.join(USER_DATA, 'calls')).some((f) => f.endsWith('.wav'))))
    check('the red dot is gone', !(await page.$('.call-compact')))
    await page.click('.today-call button:has-text("Transcript")')
    check('the transcript is there to read', await seen(page, `.today-call-transcript:has-text("${HEARD}")`))
    await page.click('.today-call button:has-text("Add to brain")')
    check('Add to brain keeps the notes in the inbox', !!(await until(() => fs.readdirSync(path.join(VAULT, '01-inbox')).find((f) => /-call-\d{4}\.md$/.test(f)))))
    const note = fs.readdirSync(path.join(VAULT, '01-inbox')).find((f) => /-call-\d{4}\.md$/.test(f))
    check('with the to-dos as boxes', /- \[ \] Send the slides tomorrow/.test(fs.readFileSync(path.join(VAULT, '01-inbox', note), 'utf8')))
    check('and the transcript as a source', fs.readdirSync(path.join(VAULT, '09-sources/calls')).length === 1)
    check('it says so', await seen(page, '.today-call-kept:has-text("In the brain")'))
    await sleep(300)
    await shot(page, '02-call-notes')

    // ---- The morning brief, out loud ----
    check('the one thing has Say it', await seen(page, '.today-one .today-say', 6000))
    await page.click('.today-one .today-say')
    check('Say it says the brief out loud', !!(await until(() => /The one thing today: Send Asha the deck\./.test(said()), 10000)), said())
    await until(async () => (await page.evaluate(() => window.island.buddy.get())).phase === 'idle', 15000)

    // ---- Talking over it ----
    await settings.click('#buddy .toggle-row:has-text("Talk over it") input')
    check('Talk over it is saved', !!(await until(() => JSON.parse(fs.readFileSync(path.join(USER_DATA, 'config.json'), 'utf8')).buddy.interrupt === true)))
    const before = said().split('\n').filter(Boolean).length
    await page.click('.today-one .today-say')
    check('it starts saying the brief', !!(await until(async () => (await page.evaluate(() => window.island.buddy.get())).phase === 'speaking', 6000)))
    // You talk (the microphone file): it stops and turns to listen. (Making out what you said needs the
    // Whisper model, which the tests don't download; the buddy's own tests cover that part.)
    const turned = await until(async () => {
      const phase = await page.$eval('.buddy-pill', (e) => e.getAttribute('data-phase')).catch(() => '')
      return ['preparing', 'listening', 'transcribing'].includes(phase) || (await page.$('.buddy-pill.error')) ? phase || 'error' : null
    }, 10000)
    check('talking over it stops it, and it turns to listen to you', !!turned, String(turned))
    await sleep(2000)
    const lines = said().split('\n').filter(Boolean).slice(before)
    check('before it finished the brief', lines.length > 0 && !lines.some((l) => /still to come|Nothing else on your calendar/.test(l)), JSON.stringify(lines))
    await settings.click('#buddy .toggle-row:has-text("Talk over it") input')
  } catch (e) {
    check('no errors', false, e.stack)
  } finally {
    await app.close().catch(() => {})
    ai.close()
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} checks passed (screenshots: ${OUT})`)
    process.exit(failed.length ? 1 : 0)
  }
})()
