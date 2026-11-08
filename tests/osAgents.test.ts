import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  dueFrom,
  findMention,
  fingerprint,
  judgeCi,
  judgePr,
  monitorLine,
  pageText,
  parseMonitor,
  parsePlan,
  peopleNote,
  personFor,
  projectsNote,
  promiseIn,
  promiseLine,
  researchLine,
  researchPath,
} from '@shared/agents'
import { asClaudeAgent, divisionsOf, fromAgency, parseAgent, parseDivisions, searchAgents, startDraft } from '@shared/agency'
import { Agents } from '../electron/os/agents'
import { Agency } from '../electron/os/agency'

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime()

describe('monitors from your words', () => {
  it('pull requests, CI, pages, mentions and files', () => {
    expect(parseMonitor('Tell me when PR #43 is reviewed', 'me/island')).toMatchObject({ kind: 'pr-review', target: 'me/island', ref: '43' })
    expect(parseMonitor('let me know when me/api#7 is merged')).toMatchObject({ kind: 'pr-merged', target: 'me/api', ref: '7' })
    expect(parseMonitor('tell me when pull request 12 in acme/web gets approved')).toMatchObject({ kind: 'pr-review', target: 'acme/web', ref: '12' })
    expect(parseMonitor('tell me when CI on me/island main finishes')).toMatchObject({ kind: 'ci', target: 'me/island', ref: 'main' })
    expect(parseMonitor('tell me when the build on me/island fails')).toMatchObject({ kind: 'ci', target: 'me/island' })
    expect(parseMonitor('Tell me when https://example.com/pricing changes.')).toMatchObject({ kind: 'url', target: 'https://example.com/pricing' })
    expect(parseMonitor('tell me when anyone mentions Acme')).toMatchObject({ kind: 'mention', target: 'Acme' })
    expect(parseMonitor('tell me when ~/Downloads/report.pdf appears')).toMatchObject({ kind: 'file', target: '~/Downloads/report.pdf' })
    // A pull request with no repository and none to assume.
    expect(parseMonitor('tell me when PR #43 is reviewed')).toBeNull()
    expect(parseMonitor('make me a sandwich')).toBeNull()
  })
  it('judges a pull request', () => {
    const m = { kind: 'pr-review' as const, target: 'me/island', ref: '43' }
    expect(judgePr(m, { state: 'OPEN', title: 'Engine', reviews: [] })).toBeNull()
    expect(judgePr(m, { state: 'OPEN', title: 'Engine', reviews: [{ state: 'APPROVED', author: { login: 'asha' } }] })).toBe('me/island#43 (Engine) was approved by asha.')
    expect(judgePr(m, { reviews: [{ state: 'CHANGES_REQUESTED' }] })).toBe('me/island#43: changes requested.')
    expect(judgePr(m, { reviews: [{ state: 'PENDING' }] })).toBeNull()
    const merged = { kind: 'pr-merged' as const, target: 'me/island', ref: '43' }
    expect(judgePr(merged, { state: 'OPEN' })).toBeNull()
    expect(judgePr(merged, { state: 'MERGED', mergedAt: '2026-11-08T10:00:00Z' })).toBe('me/island#43 was merged.')
    expect(judgePr(merged, { state: 'CLOSED' })).toBe('me/island#43 was closed without merging.')
  })
  it('judges CI, only runs that finished after you asked', () => {
    const since = Date.parse('2026-11-08T10:00:00Z')
    const m = { target: 'me/island', ref: 'main' }
    expect(judgeCi(m, [{ status: 'in_progress', headBranch: 'main' }], since)).toBeNull()
    expect(judgeCi(m, [{ status: 'completed', conclusion: 'success', headBranch: 'main', updatedAt: '2026-11-08T09:00:00Z' }], since)).toBeNull()
    expect(judgeCi(m, [{ status: 'completed', conclusion: 'failure', headBranch: 'main', displayTitle: 'Today panel', updatedAt: '2026-11-08T11:00:00Z' }], since)).toBe('CI on me/island main failed: Today panel.')
    expect(judgeCi({ target: 'me/x' }, [{ status: 'completed', conclusion: 'success', updatedAt: '2026-11-08T11:00:00Z' }], since)).toBe('CI on me/x passed.')
    expect(judgeCi(m, { error: 'x' }, since)).toBeNull()
    // GitHub shortens long titles with an ellipsis: no full stop after it.
    expect(judgeCi(m, [{ status: 'completed', conclusion: 'success', headBranch: 'main', displayTitle: 'CI installs espeak-ng; the voice e2e skips talking over it without a \u2026', updatedAt: '2026-11-08T11:00:00Z' }], since)).toBe('CI on me/island main passed: CI installs espeak-ng; the voice e2e skips talking over it without a \u2026')
  })
  it('pages: their words, not their clocks', () => {
    const a = pageText('<html><script>var t=1</script><p>Price: $10</p><span>Updated 10:42</span></html>')
    expect(a).toBe('Price: $10 Updated')
    expect(fingerprint(a)).toBe(fingerprint(pageText('<p>Price: $10</p><span>Updated 11:05</span>')))
    expect(fingerprint(a)).not.toBe(fingerprint(pageText('<p>Price: $12</p>')))
  })
  it('mentions since you asked', () => {
    const texts = [
      { at: 5, text: 'Acme called' },
      { at: 20, text: 'meeting with ACME tomorrow', from: 'Mail' },
    ]
    expect(findMention('acme', texts, 10)).toEqual(texts[1])
    expect(findMention('globex', texts, 0)).toBeNull()
  })
  it('says how it is going', () => {
    const base = { id: 'a', kind: 'url' as const, text: 'x', target: 'https://x', created: 0 }
    expect(monitorLine({ ...base, state: 'watching' }, 1000)).toBe('Watching')
    expect(monitorLine({ ...base, state: 'watching', last: 0 }, 3 * 60_000)).toBe('Watching · checked 3 min ago')
    expect(monitorLine({ ...base, state: 'done', said: 'x changed.' }, 0)).toBe('x changed.')
  })
})

describe('people and promises', () => {
  it('finds what you promised in what you wrote', () => {
    expect(promiseIn('Sure! I’ll send the deck by Friday.')).toBe('send the deck by Friday')
    expect(promiseIn('I will review your PR tomorrow, promise')).toBe('review your PR tomorrow')
    expect(promiseIn('let me get back to you on pricing')).toBe('get back to you on pricing')
    expect(promiseIn('will you send me the deck?')).toBeNull()
    expect(promiseIn('Thanks, see you soon')).toBeNull()
  })
  it('when it is due', () => {
    const sent = at(8, 15) // Sunday
    expect(dueFrom('by Friday', sent)).toBe('2026-11-13')
    expect(dueFrom('tomorrow morning', sent)).toBe('2026-11-09')
    expect(dueFrom('tonight', sent)).toBe('2026-11-08')
    expect(dueFrom('next week', sent)).toBe('2026-11-15')
    expect(dueFrom('on Sunday', sent)).toBe('2026-11-15')
    expect(dueFrom('soon', sent)).toBe('')
  })
  it('matches chats to people notes', () => {
    const people = ['Asha Rao', 'Ravi Kumar', 'Ravi Shah', 'Bo']
    expect(personFor('Asha Rao', people)).toBe('Asha Rao')
    expect(personFor('Asha (work)', people)).toBe('Asha Rao')
    expect(personFor('Ravi', people)).toBeNull() // two Ravis
    expect(personFor('Bob', people)).toBeNull()
  })
  it('writes the ledger line and the people note', () => {
    expect(promiseLine({ date: '2026-11-08', what: 'send the deck', to: 'Asha Rao', due: '2026-11-13', source: 'WhatsApp' })).toBe('- [ ] 2026-11-08 · send the deck · to [[Asha Rao]] · due 2026-11-13 · (WhatsApp)')
    const note = peopleNote(
      [
        { person: 'Ravi Kumar', last: at(6, 9), source: 'mail', count: 1 },
        { person: 'Asha Rao', last: at(8, 13), source: 'WhatsApp', count: 3 },
      ],
      '2026-11-08',
    )
    expect(note).toMatch(/^---\ntype: roster\nroster: people/)
    expect(note.indexOf('[[Asha Rao]]')).toBeLessThan(note.indexOf('[[Ravi Kumar]]'))
    expect(note).toContain('- [[Asha Rao]]: 2026-11-08 (WhatsApp, 3 messages)')
  })
  it('projects: moving, slower, quiet', () => {
    const now = at(8, 21)
    const note = projectsNote(
      [
        { name: 'island', last: at(8, 10), moved: ['Merged #42', 'Pushed 3 commits', 'Released v1', 'Fixed CI'] },
        { name: 'robot-arm', last: at(20, 9) - 30 * 86_400_000, moved: [] },
        { name: 'site', last: at(29, 9) - 30 * 86_400_000, moved: [] },
        { name: 'new', last: null, moved: [] },
      ],
      now,
      '2026-11-08',
    )
    expect(note).toContain('## Moving this week\n\n- [[island]] (last 2026-11-08): Merged #42; Pushed 3 commits; Released v1; and 1 more')
    expect(note).toContain('## Slower\n\n- [[site]]')
    expect(note).toContain('- [[robot-arm]]')
    expect(note).toContain('- [[new]] (nothing yet)')
  })
})

describe('research', () => {
  it('plans, names and says how far it is', () => {
    expect(parsePlan('Here are the questions:\n1. What shipped?\n- Who asked about it?\n\n* What is left?', 'q')).toEqual(['What shipped?', 'Who asked about it?', 'What is left?'])
    expect(parsePlan('', 'What did I ship?')).toEqual(['What did I ship?'])
    expect(parsePlan('Who one?\nWho two?\nWho three?\nWho four?\nWho five?\nWho six?', 'q')).toHaveLength(5)
    expect(researchPath('What did I ship on the island?', at(8, 10))).toBe('04-resources/research/2026-11-08-what-did-i-ship-on-the-island.md')
    const j = { id: 'r', question: 'q', state: 'reading' as const, step: 2, steps: 4, started: 0 }
    expect(researchLine(j)).toBe('Reading 2 of 4')
    expect(researchLine({ ...j, state: 'consent' })).toMatch(/your yes/)
  })
})

describe('The Agency catalog', () => {
  const file = `---\nname: Frontend Developer\ndescription: "Builds fast, accessible web UIs \u2014 React, Vue."\ncolor: cyan\nemoji: 🖥️\nvibe: Ships pixels that load fast.\n---\n\n# Frontend Developer\n\nYou are a frontend developer.\n`
  it('reads an agent file', () => {
    const a = parseAgent(file, 'engineering/engineering-frontend-developer.md')!
    expect(a).toMatchObject({ id: 'engineering/engineering-frontend-developer', slug: 'engineering-frontend-developer', name: 'Frontend Developer', division: 'engineering', color: 'cyan', vibe: 'Ships pixels that load fast.' })
    expect(a.description).toBe('Builds fast, accessible web UIs \u2014 React, Vue.')
    expect(a.body).toMatch(/^# Frontend Developer/)
    expect(parseAgent('# no frontmatter', 'x/y.md')).toBeNull()
    expect(parseAgent('---\nname: X\n---\nbody', 'x/y.md')).toBeNull() // no description
    expect(parseAgent(file, 'top.md')).toBeNull() // not in a division
    expect(parseAgent(file, '../evil/x.md')).toBeNull()
  })
  it('divisions, search and the Claude Code form', () => {
    const a = parseAgent(file, 'engineering/engineering-frontend-developer.md')!
    const b = parseAgent(file.replace('Frontend Developer', 'UI Designer').replace('cyan', 'purple'), 'design/design-ui-designer.md')!
    const known = parseDivisions({ divisions: { engineering: { label: 'Engineering', color: '#3B82F6' }, 'bad id!': { label: 'x' } } })
    expect([...known.keys()]).toEqual(['engineering'])
    expect(divisionsOf([a, b], known)).toEqual([
      { id: 'design', count: 1, label: 'Design', color: '#8e8e93' },
      { id: 'engineering', count: 1, label: 'Engineering', color: '#3B82F6' },
    ])
    expect(searchAgents([a, b], 'designer').map((x) => x.slug)).toEqual(['design-ui-designer'])
    expect(searchAgents([a, b], 'fast').length).toBe(2)
    expect(searchAgents([a, b], '', 'engineering').map((x) => x.slug)).toEqual(['engineering-frontend-developer'])
    expect(searchAgents([a, b], 'nothing-like-this')).toEqual([])
    const claude = asClaudeAgent(a)
    expect(claude).toMatch(/^---\nname: engineering-frontend-developer\ndescription: "Builds fast, accessible web UIs \u2014 React, Vue\."\ncolor: cyan\n---/)
    expect(fromAgency(claude)).toBe(true)
    expect(fromAgency('---\nname: mine\n---\n')).toBe(false)
    expect(startDraft(a)).toBe('Use the engineering-frontend-developer agent (Frontend Developer) to ')
  })
})

describe('The Agency on this computer', () => {
  let dir: string
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'agency-'))))
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const catalog = () => {
    const src = join(dir, 'src')
    for (const [p, body] of Object.entries({
      'divisions.json': JSON.stringify({ divisions: { engineering: { label: 'Engineering', color: '#3B82F6' }, 'game-development': { label: 'Game Development', color: '#10B981' } } }),
      'engineering/engineering-frontend-developer.md': `---\nname: Frontend Developer\ndescription: Builds web UIs.\ncolor: cyan\nemoji: 🖥️\nvibe: Fast pixels.\n---\n\nYou build UIs.\n`,
      'game-development/godot/godot-shader-developer.md': `---\nname: Godot Shader Developer\ndescription: Writes Godot shaders.\ncolor: green\nemoji: 🎮\n---\n\nYou write shaders.\n`,
      'integrations/claude-code/engineering-frontend-developer.md': `---\nname: Converted copy\ndescription: not an agent here\n---\n`,
      'README.md': '# The Agency',
    })) {
      mkdirSync(join(src, p, '..'), { recursive: true })
      writeFileSync(join(src, p), body)
    }
    return src
  }
  const make = (o: Partial<ConstructorParameters<typeof Agency>[0]> = {}) => new Agency({ dir: join(dir, 'agency'), claudeAgents: () => join(dir, 'claude/agents'), source: catalog(), openTerminal: () => true, claudeBinary: () => '/usr/bin/claude', home: dir, ...o })

  it('downloads, indexes (two deep, not integrations), searches, installs and removes', async () => {
    const a = make()
    expect(a.view().have).toBe(false)
    const v = await a.download()
    expect(v).toMatchObject({ have: true, count: 2, error: null })
    expect(v.divisions.map((d) => d.label)).toEqual(['Engineering', 'Game Development'])
    expect(a.search('shader').map((x) => x.id)).toEqual(['game-development/godot/godot-shader-developer'])
    expect(a.agent('engineering/engineering-frontend-developer')).toMatchObject({ body: 'You build UIs.', installed: false })
    a.install('engineering/engineering-frontend-developer')
    expect(readFileSync(join(dir, 'claude/agents/engineering-frontend-developer.md'), 'utf8')).toMatch(/^---\nname: engineering-frontend-developer\n/)
    expect(a.view().installed).toEqual(['engineering-frontend-developer'])
    // It never writes over an agent of yours, or removes one.
    writeFileSync(join(dir, 'claude/agents/godot-shader-developer.md'), '---\nname: mine\ndescription: mine\n---\n')
    expect(() => a.install('game-development/godot/godot-shader-developer')).toThrow(/already have an agent/)
    expect(() => a.uninstall('godot-shader-developer')).toThrow(/wasn’t installed from The Agency/)
    a.uninstall('engineering-frontend-developer')
    expect(existsSync(join(dir, 'claude/agents/engineering-frontend-developer.md'))).toBe(false)
    // Kept between restarts.
    expect(make().view().count).toBe(2)
  })

  it('starts in Claude (installed, with a draft) or a terminal (Claude Code with its instructions)', async () => {
    const opened: string[][] = []
    const a = make({ openTerminal: (_cwd, argv) => (opened.push(argv), true) })
    await a.download()
    expect(a.start('engineering/engineering-frontend-developer', 'claude')).toEqual({ draft: 'Use the engineering-frontend-developer agent (Frontend Developer) to ' })
    expect(a.view().installed).toContain('engineering-frontend-developer')
    a.start('game-development/godot/godot-shader-developer', 'terminal')
    expect(opened[0].slice(0, 2)).toEqual(['/usr/bin/claude', '--append-system-prompt-file'])
    expect(readFileSync(opened[0][2], 'utf8')).toMatch(/^<!-- Godot Shader Developer, from The Agency.*-->\n\nYou write shaders\.$/)
    const none = make({ claudeBinary: () => null })
    await none.download()
    expect(() => none.start('engineering/engineering-frontend-developer', 'terminal')).toThrow(/Claude Code isn’t installed/)
  })

  // (Making a link on Windows needs an administrator.)
  it.skipIf(process.platform === 'win32')('never reads a link in the catalog (it could point anywhere)', async () => {
    const a = make()
    const src = join(dir, 'src')
    writeFileSync(join(dir, 'secret.md'), '---\nname: Secret\ndescription: should never be read\n---\nkey\n')
    symlinkSync(join(dir, 'secret.md'), join(src, 'engineering', 'engineering-secret.md'))
    await a.download()
    expect(a.search('secret')).toEqual([])
    expect(a.view().count).toBe(2)
  })

  it('says when it can’t download', async () => {
    const a = make({ source: 'https://example.invalid/x.tgz', fetch: (async () => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch })
    const v = await a.download()
    expect(v).toMatchObject({ have: false, error: 'Couldn’t reach GitHub. Try again when you’re online.' })
  })
})

describe('the agents', () => {
  let dir: string
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'agents-'))))
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const told: string[] = []
  const make = (o: Partial<ConstructorParameters<typeof Agents>[0]> = {}) =>
    new Agents({
      file: join(dir, 'agents.json'),
      home: dir,
      ask: async () => ({ ok: true, text: 'ok', meta: { where: 'local', label: 'x', model: 'm', ms: 1, usage: null, cost: 0 } }),
      candidates: () => [],
      texts: () => [],
      defaultRepo: () => 'me/island',
      tell: (t, l) => void told.push(`${t}: ${l}`),
      ...o,
    })
  const settle = () => new Promise((r) => setTimeout(r, 20))

  it('a pull request monitor tells you once', async () => {
    let reviews: unknown[] = []
    const a = make({ gh: async (args) => (args[0] === 'pr' ? JSON.stringify({ state: 'OPEN', title: 'Engine', reviews }) : '[]') })
    told.length = 0
    const m = a.addMonitor('tell me when PR #43 is reviewed')
    await settle()
    expect(a.monitors()[0]).toMatchObject({ id: m.id, state: 'watching', target: 'me/island' })
    reviews = [{ state: 'APPROVED', author: { login: 'asha' } }]
    await a.checkAll()
    await a.checkAll()
    expect(a.monitors()[0]).toMatchObject({ state: 'done', said: 'me/island#43 (Engine) was approved by asha.' })
    expect(told).toEqual(['Monitor: me/island#43 (Engine) was approved by asha.'])
    expect(() => a.addMonitor('make tea')).toThrow(/Try “tell me when PR #43 is reviewed”/)
  })

  it('a page monitor notices a change; errors are shown, not fatal', async () => {
    let body = '<p>v1</p>'
    let fail = false
    const a = make({ fetch: (async () => (fail ? new Response('no', { status: 503 }) : new Response(body))) as unknown as typeof fetch })
    a.addMonitor('tell me when https://example.com/x changes')
    await settle()
    await a.checkAll()
    expect(a.monitors()[0].state).toBe('watching')
    fail = true
    await a.checkAll()
    expect(a.monitors()[0].error).toBe('example.com answered 503.')
    fail = false
    body = '<p>v2</p>'
    await a.checkAll()
    expect(a.monitors()[0]).toMatchObject({ state: 'done', said: 'example.com/x changed.' })
  })

  it('a file and a mention', async () => {
    const texts: { at: number; text: string; from?: string }[] = []
    const a = make({ texts: () => texts })
    a.addMonitor(`tell me when ${join(dir, 'report.pdf')} appears`)
    a.addMonitor('tell me when anyone mentions Globex')
    await settle()
    expect(a.monitors().every((m) => m.state === 'watching')).toBe(true)
    writeFileSync(join(dir, 'report.pdf'), 'x')
    texts.push({ at: Date.now() + 1000, text: 'Lunch with Globex?', from: 'Asha' })
    await a.checkAll()
    expect(a.monitors().map((m) => m.state)).toEqual(['done', 'done'])
    expect(a.monitors()[0].said).toBe('“Globex” came up (Asha): Lunch with Globex?')
  })

  it('research: plans, reads, writes a note with sources; asks before the cloud', async () => {
    const notes: Record<string, string> = {}
    const prompts: string[] = []
    const a = make({
      ask: async (o) => {
        prompts.push(o.prompt)
        if (/plan research/.test(o.system)) return { ok: true, text: '1. What shipped?\n2. Who asked?', meta: { where: 'local', label: 'x', model: 'm', ms: 1, usage: null, cost: 0 } }
        if (/numbered sources/.test(o.system)) return { ok: true, text: /shipped/.test(o.prompt) ? 'The engine [1].' : 'Asha [1].', meta: { where: 'local', label: 'x', model: 'm', ms: 1, usage: null, cost: 0 } }
        return { ok: true, text: 'You shipped the engine [1]; Asha asked [2].', meta: { where: 'local', label: 'x', model: 'm', ms: 1, usage: null, cost: 0 } }
      },
      candidates: (q) => (/shipped/i.test(q) ? [{ title: 'Merged #42 The engine', kind: 'github', text: 'shipped the engine', url: 'https://github.com/me/island/pull/42' }] : [{ title: 'Re: demo', kind: 'mail', text: 'who asked: Asha', path: '09-sources/mail/2026-11-07.md' }]),
      writeNote: (p, t) => ((notes[p] = t), true),
    })
    a.startResearch('What did I ship and who asked?')
    for (let i = 0; i < 50 && a.research()[0].state !== 'done'; i++) await settle()
    const j = a.research()[0]
    expect(j).toMatchObject({ state: 'done', answer: 'You shipped the engine [1]; Asha asked [2].', where: 'local' })
    const note = notes[j.path!]
    expect(note).toContain('## What shipped?\n\nThe engine [1].')
    expect(note).toContain('## Who asked?\n\nAsha [2].')
    expect(note).toContain('1. [Merged #42 The engine](https://github.com/me/island/pull/42) (github)')
    expect(note).toContain('2. [[09-sources/mail/2026-11-07]] (mail)')
    // The cloud needs a yes.
    const b = make({ ask: async () => ({ ok: false, needsConsent: 'Claude (claude-opus-5-5)' }) })
    b.startResearch('anything')
    await settle()
    expect(b.research()[0]).toMatchObject({ state: 'consent', error: 'Use Claude (claude-opus-5-5)? It goes to the cloud.' })
  })
})
