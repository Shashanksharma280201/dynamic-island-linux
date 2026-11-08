import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  aiMayWrite,
  durationText,
  formatNote,
  isRestricted,
  noteTitle,
  parseBrainConfig,
  parseNote,
  projectOf,
  safeVaultPath,
  slugify,
  wikilinks,
  within,
} from '@shared/brain'
import { Vault } from '../electron/brain/vault'
import { buildBrief, filledIn, projectNames, projectSummary, BRIEF_MAX } from '../electron/brain/brief'
import { BrainIndex, snippet, stem, words } from '../electron/brain/search'
import { meTemplate } from '../electron/brain/templates'

const tmp = () => mkdtempSync(join(tmpdir(), 'brain-'))

describe('the brain’s pure pieces', () => {
  test('config: defaults, and only sane values get in', () => {
    expect(parseBrainConfig(null)).toMatchObject({ on: false, vault: '', captureSessions: true, distil: 'ai', skip: [], port: 47823, since: 0 })
    expect(parseBrainConfig({ on: true, vault: 'relative/path', port: 80, distil: 'x', skip: ['/a', 'b', 3], since: 5 })).toMatchObject({
      on: true,
      vault: '',
      port: 47823,
      distil: 'ai',
      skip: ['/a'],
      since: 5,
    })
    expect(parseBrainConfig({ vault: '/home/me/Brain', port: 50000, distil: 'plain' })).toMatchObject({ vault: '/home/me/Brain', port: 50000, distil: 'plain' })
  })

  test('notes: frontmatter round trip, links quoted, empty values left out', () => {
    const text = formatNote({ type: 'session', date: '2026-11-07', project: '[[dynamic-island-linux]]', about: ['[[A]]', 'b c'], empty: '' }, '# Title\n\nBody')
    expect(text).toBe('---\ntype: session\ndate: 2026-11-07\nproject: "[[dynamic-island-linux]]"\nabout: ["[[A]]", b c]\n---\n# Title\n\nBody\n')
    const back = parseNote(text)
    expect(back.meta).toEqual({ type: 'session', date: '2026-11-07', project: '[[dynamic-island-linux]]', about: ['[[A]]', 'b c'] })
    expect(back.body).toBe('# Title\n\nBody\n')
    expect(formatNote({ summary: '' }, 'x', ['summary'])).toContain('summary: ""')
    expect(parseNote('no frontmatter').meta).toEqual({})
    // Values YAML would misread are quoted.
    expect(formatNote({ a: 'yes', b: 'x: y', c: '12' }, '')).toContain('a: "yes"\nb: "x: y"\nc: "12"')
  })

  test('names, titles, links and durations', () => {
    expect(slugify('Island Drop: the QR & pairing!')).toBe('island-drop-the-qr-pairing')
    expect(slugify('Café déjà vu')).toBe('cafe-deja-vu')
    expect(slugify('***')).toBe('note')
    expect(noteTitle('a/b/c.md', 'text\n# Real title\n')).toBe('Real title')
    expect(noteTitle('a/b/c.md', 'no heading')).toBe('c')
    expect(wikilinks('see [[Ravi|him]], [[02-projects/x/x#Plan]] and [[y^abc]]')).toEqual(['Ravi', '02-projects/x/x', 'y'])
    expect(durationText(30_000)).toBe('under a minute')
    expect(durationText(25 * 60_000)).toBe('25 min')
    expect(durationText(130 * 60_000)).toBe('2 h 10 min')
  })

  test('paths an AI gives: inside the brain, never Restricted or the machinery', () => {
    expect(safeVaultPath('02-projects/x/x.md')).toEqual({ path: '02-projects/x/x.md' })
    expect(safeVaultPath('./01-inbox//a.md')).toEqual({ path: '01-inbox/a.md' })
    for (const bad of ['', '/etc/passwd', '~/x', '../x.md', '01-inbox/../../x', '08-restricted/money.md', '08-RESTRICTED/a', 'restricted/a', '.obsidian/app.json', '_system/index/x', '_system/queue/a.json']) {
      expect('error' in safeVaultPath(bad), bad).toBe(true)
    }
    expect(isRestricted('08-restricted')).toBe(true)
    expect(isRestricted('02-projects/restricted-api/x.md')).toBe(false)
    expect(aiMayWrite('01-inbox/a.md')).toBe(true)
    expect(aiMayWrite('07-world-model/ledgers/promises.md')).toBe(true)
    expect(aiMayWrite('00-me/profile.md')).toBe(false)
  })

  test('a folder’s project: its git root, else itself', () => {
    const git = new Set(['/home/me/code/dynamic-island-linux'])
    const has = (d: string) => git.has(d)
    expect(projectOf('/home/me/code/dynamic-island-linux/mobile/src', has)).toEqual({ name: 'dynamic-island-linux', root: '/home/me/code/dynamic-island-linux' })
    expect(projectOf('/home/me/ros2_ws/src/', has)).toEqual({ name: 'src', root: '/home/me/ros2_ws/src' })
    expect(projectOf('/', has).name).toBe('home')
    expect(within('/a/b', '/a')).toBe(true)
    expect(within('/ab', '/a')).toBe(false)
    expect(within('/a', '')).toBe(false)
  })
})

describe('the vault', () => {
  test('makes the Living Brain layout once, and never overwrites', () => {
    const root = join(tmp(), 'Brain')
    const v = new Vault(root, { git: false })
    expect(v.exists()).toBe(false)
    const made = v.create(Date.parse('2026-11-07T10:00:00'))
    expect(v.exists()).toBe(true)
    for (const dir of ['00-me', '01-inbox', '02-projects', '06-brain', '07-world-model/decisions', '08-restricted', '09-sources/claude-code', '_system']) expect(existsSync(join(root, dir)), dir).toBe(true)
    expect(made).toEqual(expect.arrayContaining(['AGENTS.md', 'CLAUDE.md', '_system/index.md', '_system/log.md', '00-me/profile.md', '07-world-model/ledgers/promises.md']))
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain('Never open, list, search or quote anything in `08-restricted/`')
    expect(readFileSync(join(root, '00-me/profile.md'), 'utf8')).toContain('updated: 2026-11-07')
    writeFileSync(join(root, '00-me/profile.md'), 'mine')
    expect(v.create()).toEqual([])
    expect(readFileSync(join(root, '00-me/profile.md'), 'utf8')).toBe('mine')
  })

  test('lists notes but never Restricted, hidden folders or the machinery; writes stay put', () => {
    const root = tmp()
    const v = new Vault(root, { git: false })
    v.create()
    v.write('08-restricted/money.md', 'secret', 'x')
    mkdirSync(join(root, '.obsidian'))
    writeFileSync(join(root, '.obsidian/a.md'), 'x')
    v.write('_system/index/x.md', 'x', 'x')
    v.write('01-inbox/a.md', 'a', 'x')
    const paths = v.list().map((f) => f.path)
    expect(paths).toContain('01-inbox/a.md')
    expect(paths.some((p) => p.startsWith('08-restricted') || p.startsWith('.obsidian') || p.startsWith('_system/index/'))).toBe(false)
    expect(v.writeNew('01-inbox/a.md', 'b', 'x')).toBe('01-inbox/a-2.md')
    v.append('07-world-model/ledgers/promises.md', '- [ ] one', 'x')
    v.append('07-world-model/ledgers/promises.md', '- [ ] two', 'x')
    expect(readFileSync(join(root, '07-world-model/ledgers/promises.md'), 'utf8').endsWith('- [ ] one\n- [ ] two\n')).toBe(true)
    expect(v.move('01-inbox/a.md', '01-inbox/a-2.md', 'x')).toBe('01-inbox/a-2-2.md')
    v.log('did a thing', Date.parse('2026-11-07T09:05:00'))
    expect(v.recentLog(1)[0]).toBe('2026-11-07 09:05 · did a thing')
  })

  // Windows needs admin rights for symlinks.
  test.skipIf(process.platform === 'win32')('a symlink out of the vault is not inside it', () => {
    const root = tmp()
    const outside = join(tmp(), 'secret.md')
    writeFileSync(outside, 'secret')
    const v = new Vault(root, { git: false })
    v.create()
    symlinkSync(outside, join(root, '01-inbox/link.md'))
    expect(v.inside('01-inbox/link.md')).toBe(false)
    expect(v.inside('AGENTS.md')).toBe(true)
  })
})

describe('the brief', () => {
  test('templates count as empty; what you fill in shows', () => {
    expect(filledIn(meTemplate('profile.md', '2026-11-07'))).toBe('')
    expect(filledIn(meTemplate('preferences.md', '2026-11-07'))).toBe('')
    const pref = meTemplate('preferences.md', '2026-11-07').replace('## Never\n\n-', '## Never\n\n- Use em dashes')
    expect(filledIn(pref)).toBe('## Never\n\n- Use em dashes')
    const profile = meTemplate('profile.md', '2026-11-07').replace('- What I do:', '- What I do: robotics (ROS 2 Humble on Ubuntu 22.04)')
    expect(filledIn(profile)).toBe('- What I do: robotics (ROS 2 Humble on Ubuntu 22.04)')
  })

  test('built from 00-me and the projects, with the rules, within its size', () => {
    const files: Record<string, string> = {
      '00-me/profile.md': '---\ntype: me\n---\n# Profile\n\n- Name: Sam\n',
      '00-me/voice.md': '# How I write\n\nShort and plain.',
    }
    const brief = buildBrief((p) => files[p] ?? null, [{ name: 'dynamic-island-linux', summary: 'A Dynamic Island for Ubuntu' }], '~/Brain')
    expect(brief).toContain('~/Brain/AGENTS.md')
    expect(brief).toContain('Never open its 08-restricted folder')
    expect(brief).toContain('## Profile\n\n- Name: Sam')
    expect(brief).toContain('## How I write and talk\n\nShort and plain.')
    expect(brief).not.toContain('## Goals now')
    expect(brief).toContain('- [[dynamic-island-linux]]: A Dynamic Island for Ubuntu')
    expect(buildBrief(() => null, [], '~/Brain')).toContain('Not filled in yet')
    const huge = buildBrief((p) => (p === '00-me/profile.md' ? `- ${'word '.repeat(5000)}` : null), [], '~/Brain')
    expect(huge.length).toBeLessThanOrEqual(BRIEF_MAX)
    expect(huge).toContain('## Profile')
  })

  test('project names and summaries', () => {
    expect(projectNames(['02-projects/a/a.md', '02-projects/a/sessions/x.md', '02-projects/b/notes.md', '02-projects/c/c.md'])).toEqual(['a', 'c'])
    expect(projectSummary('---\nsummary: The thing\n---\n# A\n')).toBe('The thing')
    expect(projectSummary('# A\n<!-- hint -->\n\n- list\n\nFirst real line.\n')).toBe('First real line.')
  })
})

describe('search', () => {
  test('words and stems', () => {
    expect(words('The Notes, testing and pairing QR codes!')).toEqual(['note', 'test', 'pair', 'qr', 'code'])
    expect(stem('stories')).toBe('story')
    expect(stem('class')).toBe('class')
  })

  test('finds by keywords, ranks titles and links, never reads Restricted', () => {
    const root = tmp()
    const v = new Vault(root, { git: false })
    v.create()
    v.write('02-projects/island/island.md', '---\ntype: project\n---\n# Island\n\nThe Dynamic Island for Ubuntu. Phone pairing by QR code.\n', 'x')
    v.write('04-resources/qr.md', '# QR codes\n\nHow QR pairing works in general.\n', 'x')
    v.write('01-inbox/a.md', '# A note\n\nAbout [[island]] and nothing else.\n', 'x')
    v.write('01-inbox/b.md', '# B note\n\nAlso [[island]].\n', 'x')
    v.write('08-restricted/bank.md', '# Bank\n\nQR pairing with my bank: account 1234.\n', 'x')
    const idx = new BrainIndex(() => v.list(), (p) => v.read(p))
    const hits = idx.search('qr pairing')
    expect(hits.map((h) => h.path)).toEqual(expect.arrayContaining(['02-projects/island/island.md', '04-resources/qr.md']))
    expect(hits.some((h) => h.path.startsWith('08-restricted'))).toBe(false)
    expect(hits[0].snippet).toMatch(/QR/)
    expect(idx.search('qr', { under: '04-resources' }).map((h) => h.path)).toEqual(['04-resources/qr.md'])
    expect(idx.find('Island')).toBe('02-projects/island/island.md')
    expect(idx.linksTo('island').map((l) => l.path).sort()).toEqual(['01-inbox/a.md', '01-inbox/b.md'])
    expect(idx.linksTo('island')[0].line).toContain('[[island]]')
    expect(idx.search('')).toEqual([])
    // It follows the files, and lets go of its memory when idle.
    v.write('04-resources/new.md', '# Zebra crossing\n', 'x')
    expect(idx.search('zebra')[0].path).toBe('04-resources/new.md')
    expect(idx.releaseIfIdle(60_000, Date.now() + 120_000)).toBe(true)
    expect(idx.size()).toBe(0)
    expect(idx.search('zebra')[0].path).toBe('04-resources/new.md')
  })

  test('snippets pick the best line', () => {
    expect(snippet('# T\n\nnothing here\nthe qr pairing line\n', ['qr', 'pair'])).toBe('the qr pairing line')
  })
})
