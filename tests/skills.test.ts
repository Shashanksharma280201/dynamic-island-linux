import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { licenceOf, parseSkill, searchSkills, skillDraft, skillFrontmatter, SKILL_MARK } from '@shared/skills'
import { Skills } from '../electron/os/skills'

const APACHE = '\n                                 Apache License\n                           Version 2.0, January 2004\n'

describe('Agent Skills, read', () => {
  it('reads a SKILL.md, with YAML block text and quotes', () => {
    const f = skillFrontmatter('---\nname: claude-api\ndescription: |-\n  Reference for the Claude API.\n  TRIGGER when it names Claude.\nlicense: Complete terms in LICENSE.txt\n---\n\n# Building\n')
    expect(f?.meta).toEqual({ name: 'claude-api', description: 'Reference for the Claude API.\nTRIGGER when it names Claude.', license: 'Complete terms in LICENSE.txt' })
    expect(f?.body.trim()).toBe('# Building')
    expect(skillFrontmatter("---\nname: 'it''s'\ndescription: \"a \\\"b\\\"\"\nfolded: >\n  one\n  two\n---\n")?.meta).toEqual({ name: "it's", description: 'a "b"', folded: 'one two' })
    expect(skillFrontmatter('no frontmatter')).toBeNull()
  })

  it('a skill needs a proper name and a description; its licence comes from LICENSE.txt', () => {
    const s = parseSkill('---\nname: pdf\ndescription: Read, fill and merge PDFs.\nlicense: Complete terms in LICENSE.txt\n---\nUse pypdf.', 'skills/pdf', APACHE, 4)
    expect(s).toEqual({ name: 'pdf', description: 'Read, fill and merge PDFs.', licence: 'Apache 2.0', dir: 'skills/pdf', files: 4, body: 'Use pypdf.' })
    expect(parseSkill('---\nname: Not Valid\ndescription: x\n---\n', 'a')).toBeNull()
    expect(parseSkill('---\nname: ok\n---\n', 'a')).toBeNull()
    expect(licenceOf('Complete terms in LICENSE.txt', '')).toBe('See the repository')
    expect(licenceOf('MIT', '')).toBe('MIT')
    expect(licenceOf('', 'MIT License\n\nCopyright')).toBe('MIT')
    expect(licenceOf('', '© Anthropic. All rights reserved. You may not redistribute.')).toBe('Its own terms (LICENSE.txt)')
  })

  it('searches by name first, then description', () => {
    const list = [
      { name: 'pdf', description: 'PDF files', licence: '', dir: '', files: 1 },
      { name: 'docx', description: 'Word documents, and PDF export', licence: '', dir: '', files: 1 },
      { name: 'webapp-testing', description: 'Test web apps with Playwright', licence: '', dir: '', files: 1 },
    ]
    expect(searchSkills(list, 'pdf').map((s) => s.name)).toEqual(['pdf', 'docx'])
    expect(searchSkills(list, 'web playwright').map((s) => s.name)).toEqual(['webapp-testing'])
    expect(searchSkills(list, '').map((s) => s.name)).toEqual(['docx', 'pdf', 'webapp-testing'])
    expect(skillDraft({ name: 'pdf' })).toBe('Use the pdf skill to ')
  })
})

describe('Agent Skills on this computer', () => {
  let dir: string
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'skills-'))))
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  /** A catalog laid out like github.com/anthropics/skills. */
  const catalog = () => {
    const src = join(dir, 'src')
    const skill = (name: string, md: string, files: Record<string, string> = {}) => {
      mkdirSync(join(src, 'skills', name), { recursive: true })
      writeFileSync(join(src, 'skills', name, 'SKILL.md'), md)
      for (const [f, t] of Object.entries(files)) {
        mkdirSync(join(src, 'skills', name, f, '..'), { recursive: true })
        writeFileSync(join(src, 'skills', name, f), t)
      }
    }
    skill('pdf', '---\nname: pdf\ndescription: Read, fill and merge PDFs.\nlicense: Complete terms in LICENSE.txt\n---\nUse pypdf.\n', { 'LICENSE.txt': APACHE, 'scripts/fill.py': 'print(1)\n', 'reference/forms.md': '# Forms\n' })
    skill('frontend-design', '---\nname: frontend-design\ndescription: |-\n  Distinctive, production-grade\n  interfaces.\n---\nBe bold.\n')
    skill('broken', '---\ndescription: no name\n---\n')
    mkdirSync(join(src, 'template'), { recursive: true })
    writeFileSync(join(src, 'template', 'SKILL.md'), '---\nname: template-skill\ndescription: A template.\n---\n')
    writeFileSync(join(src, 'README.md'), '# Skills\n')
    return src
  }
  const make = (o: Partial<ConstructorParameters<typeof Skills>[0]> = {}) => new Skills({ dir: join(dir, 'island'), claudeSkills: () => join(dir, 'claude', 'skills'), source: catalog(), ...o })

  it('downloads when asked, indexes every skill (not the template), and survives a restart', async () => {
    const s = make()
    expect(s.view()).toMatchObject({ have: false, count: 0 })
    const v = await s.download()
    expect(v).toMatchObject({ have: true, count: 2, error: null, url: 'https://github.com/anthropics/skills' })
    expect(s.search('').map((x) => [x.name, x.licence, x.files])).toEqual([
      ['frontend-design', 'See the repository', 1],
      ['pdf', 'Apache 2.0', 4],
    ])
    expect(s.skill('pdf')).toMatchObject({ body: 'Use pypdf.', installed: false, theirs: false })
    expect(s.skill('nope')).toBeNull()
    expect(make().view().count).toBe(2)
  })

  it('installs a skill whole into Claude Code, marked as the island’s; removes only its own', async () => {
    const s = make()
    await s.download()
    s.install('pdf')
    const at = join(dir, 'claude', 'skills', 'pdf')
    expect(readFileSync(join(at, 'scripts', 'fill.py'), 'utf8')).toBe('print(1)\n')
    expect(existsSync(join(at, 'reference', 'forms.md'))).toBe(true)
    expect(JSON.parse(readFileSync(join(at, SKILL_MARK), 'utf8'))).toMatchObject({ from: 'https://github.com/anthropics/skills/tree/main/skills/pdf', licence: 'Apache 2.0' })
    expect(s.view().installed).toEqual(['pdf'])
    expect(s.skill('pdf')?.installed).toBe(true)
    // Installing again replaces it (an update).
    s.install('pdf')
    expect(s.view().installed).toEqual(['pdf'])
    s.uninstall('pdf')
    expect(existsSync(at)).toBe(false)
    expect(() => s.uninstall('../x')).toThrow(/isn’t a skill’s name/)
    // A skill of yours with the same name is never touched.
    mkdirSync(join(dir, 'claude', 'skills', 'frontend-design'), { recursive: true })
    writeFileSync(join(dir, 'claude', 'skills', 'frontend-design', 'SKILL.md'), 'mine')
    expect(s.skill('frontend-design')?.theirs).toBe(true)
    expect(() => s.install('frontend-design')).toThrow(/already have a skill called frontend-design/)
    expect(() => s.uninstall('frontend-design')).toThrow(/wasn’t installed from the catalog/)
    expect(readFileSync(join(dir, 'claude', 'skills', 'frontend-design', 'SKILL.md'), 'utf8')).toBe('mine')
    expect(s.start('pdf')).toEqual({ draft: 'Use the pdf skill to ' })
  })

  // (Making a link on Windows needs an administrator.)
  it.skipIf(process.platform === 'win32')('never copies a link from the download (it could point anywhere)', async () => {
    const src = catalog()
    writeFileSync(join(dir, 'secret.txt'), 'key')
    symlinkSync(join(dir, 'secret.txt'), join(src, 'skills', 'pdf', 'secret.txt'))
    const s = make({ source: src })
    await s.download()
    s.install('pdf')
    expect(existsSync(join(dir, 'claude', 'skills', 'pdf', 'secret.txt'))).toBe(false)
    expect(s.search('pdf')[0].files).toBe(4)
  })

  it('says what went wrong', async () => {
    const empty = join(dir, 'empty')
    mkdirSync(empty)
    const s = make({ source: empty })
    expect((await s.download()).error).toBe('There were no skills in it.')
    const off = make({ source: 'https://codeload.github.com/x', fetch: (async () => Promise.reject(new Error('fetch failed'))) as typeof fetch })
    expect((await off.download()).error).toMatch(/Couldn’t reach GitHub/)
    expect(() => off.install('pdf')).toThrow(/isn’t in the catalog/)
  })
})
