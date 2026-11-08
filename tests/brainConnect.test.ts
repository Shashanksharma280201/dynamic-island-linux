import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { slugify } from '@shared/brain'
import { Vault } from '../electron/brain/vault'
import { BrainIndex } from '../electron/brain/search'
import { brainTools, forMcp } from '../electron/brain/tools'
import { runTool } from '../electron/agent/tools'
import { IslandMcp } from '../electron/agent/mcpServer'
import { ALLOW_RULE, Wiring, applyBrainHooks, claudeBlock, hasBlock, hasBrainHooks, importLine, removeBrainHooks, withBlock, withoutBlock } from '../electron/brain/wire'

const tmp = () => mkdtempSync(join(tmpdir(), 'brain-c-'))

function brain() {
  const root = join(tmp(), 'Brain')
  const vault = new Vault(root, { git: false })
  vault.create()
  const index = new BrainIndex(() => vault.list(), (p) => vault.read(p))
  const tools = brainTools({ vault, index, brief: () => '# My brief\n\nSam.', source: 'claude-code', now: () => Date.parse('2026-11-07T10:00:00') })
  const call = (name: string, input: object) => runTool(tools, name, input)
  return { root, vault, index, tools, call }
}

describe('the brain’s tools', () => {
  test('search, read and look up, never Restricted', async () => {
    const { vault, call } = brain()
    vault.write('02-projects/island/island.md', '# island\n\nQR pairing for the phone.\n', 'x')
    vault.write('01-inbox/n.md', '# n\n\nThe [[island]] pairs by QR.\n', 'x')
    vault.write('08-restricted/bank.md', '# bank\n\nQR pairing code 1234\n', 'x')
    const found = await call('brain_search', { query: 'qr pairing' })
    expect(found.ok).toBe(true)
    expect(found.output).toContain('02-projects/island/island.md')
    expect(found.output).not.toContain('08-restricted')
    expect((await call('brain_read', { path: '02-projects/island/island' })).output).toContain('QR pairing for the phone.')
    expect((await call('brain_read', { path: '08-restricted/bank.md' })).output).toContain('private')
    expect((await call('brain_read', { path: '../../etc/passwd' })).output).toContain('inside the brain')
    expect((await call('brain_read', { path: '01-inbox/missing.md' })).output).toContain('no note')
    const entity = (await call('brain_entity', { name: '[[island]]' })).output
    expect(entity).toContain('# 02-projects/island/island.md')
    expect(entity).toContain('Linked from:\n- 01-inbox/n.md: The [[island]] pairs by QR.')
    expect((await call('brain_entity', { name: 'nobody' })).output).toContain('nothing on “nobody”')
    expect((await call('brain_recent', { days: 3 })).output).toContain('01-inbox/n.md')
    expect((await call('brain_search', { query: 'x', folder: '08-restricted' })).output).toContain('private')
    expect((await call('brain_brief', {})).output).toBe('# My brief\n\nSam.')
  })

  test('writes only add: the inbox, a dated decision, a promise line', async () => {
    const { vault, call, root } = brain()
    const r = await call('brain_capture', { title: 'Prefers pnpm', text: 'Uses pnpm, not npm.', type: 'preference', about: ['island'] })
    expect(r.output).toContain('01-inbox/2026-11-07-prefers-pnpm.md')
    const note = vault.read('01-inbox/2026-11-07-prefers-pnpm.md')!
    expect(note).toContain('type: preference')
    expect(note).toContain('source: claude-code')
    expect(note).toContain('about: ["[[island]]"]')
    expect((await call('brain_capture', { title: 'Prefers pnpm', text: 'again' })).output).toContain('prefers-pnpm-2.md')
    expect((await call('brain_decision', { decision: 'Keep QR pairing', why: 'It works offline.', options: ['NFC'], project: 'island' })).output).toContain('07-world-model/decisions/2026-11-07-keep-qr-pairing.md')
    expect(vault.read('07-world-model/decisions/2026-11-07-keep-qr-pairing.md')).toContain('## Also considered\n\n- NFC')
    await call('brain_promise', { what: 'Send the APK', to: 'Ravi', due: '2026-11-10' })
    expect(readFileSync(join(root, '07-world-model/ledgers/promises.md'), 'utf8')).toContain('- [ ] 2026-11-07 · Send the APK · to [[Ravi]] · due 2026-11-10 · (claude-code)')
    expect((await call('brain_capture', { title: 'x' })).output).toContain('Missing "text"')
    expect(vault.recentLog(3).join('\n')).toContain('Claude Code recorded the decision')
  })

  test('over MCP they lose the brain_ prefix (the server is called brain)', () => {
    const { tools } = brain()
    expect(forMcp(tools).map((t) => t.name)).toEqual(['brief', 'search', 'read', 'entity', 'recent', 'capture', 'decision', 'promise'])
  })
})

describe('the brain’s MCP server', () => {
  test('a fixed port, a lasting token, and which app is calling', async () => {
    const seen: string[] = []
    const a = new IslandMcp({ name: 'brain', port: 47950, token: 'a'.repeat(48), instructions: 'The brain.' })
    a.serve((client) => (seen.push(client), []))
    await a.start()
    // The port is taken: the next one.
    const b = new IslandMcp({ name: 'brain', port: 47950, token: 'b'.repeat(48) })
    await b.start()
    expect(a.url()).toBe('http://127.0.0.1:47950/mcp')
    expect(b.url()).toBe('http://127.0.0.1:47951/mcp')
    expect(JSON.parse(a.config()!).mcpServers.brain.headers.Authorization).toBe(`Bearer ${'a'.repeat(48)}`)
    const post = (url: string, auth: string, body: object) =>
      fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: r.status === 200 ? await r.json() : null }))
    const init = await post(`${a.url()}?client=codex`, a.authorization(), { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    expect(init.json.result.instructions).toBe('The brain.')
    expect(init.json.result.serverInfo.name).toBe('dynamic-island-brain')
    await post(`${a.url()}?client=codex`, a.authorization(), { jsonrpc: '2.0', id: 2, method: 'tools/list' })
    expect(seen).toEqual(['codex'])
    expect((await post(a.url()!, b.authorization(), { jsonrpc: '2.0', id: 3, method: 'tools/list' })).status).toBe(401)
    a.stop()
    b.stop()
    expect(a.url()).toBeNull()
  })
})

describe('connecting your AI tools', () => {
  test('the CLAUDE.md block: added once, replaced, removed, the rest untouched', () => {
    const block = claudeBlock('/home/me/Brain', '/home/me')
    expect(block).toContain('@~/Brain/_system/brief.md')
    expect(importLine('/data/brain', '/home/me')).toBe('@/data/brain/_system/brief.md')
    const mine = '# My rules\n\nUse pnpm.\n'
    const once = withBlock(mine, block)
    expect(once.startsWith(mine.trim())).toBe(true)
    expect(hasBlock(once)).toBe(true)
    expect(withBlock(once, block)).toBe(once)
    const moved = withBlock(once, claudeBlock('/home/me/Notes', '/home/me'))
    expect(moved).toContain('@~/Notes/_system/brief.md')
    expect(moved).not.toContain('@~/Brain/')
    expect(withoutBlock(moved)).toBe(mine)
    expect(withoutBlock(withBlock('', block))).toBe('')
    expect(withoutBlock('nothing of ours\n')).toBe('nothing of ours\n')
  })

  test('Claude Code settings: the hooks and the tools allowed, without touching the island’s other hooks', () => {
    const island = { matcher: '.*', hooks: [{ type: 'command', command: 'node "/x/claude-island-hook.cjs"' }] }
    const settings = { hooks: { PermissionRequest: [island], SessionStart: [{ hooks: [{ type: 'command', command: 'other' }] }] }, permissions: { allow: ['Bash(npm test)'] }, model: 'opus' }
    const on = applyBrainHooks(settings, 'node "/x/island-brain-hook.cjs" --vault "/home/me/Brain"')
    expect(hasBrainHooks(on)).toBe(true)
    expect(on.hooks.SessionStart).toHaveLength(2)
    expect(on.hooks.SessionEnd[0].hooks[0].command).toContain('island-brain-hook')
    expect(on.permissions.allow).toEqual(['Bash(npm test)', ALLOW_RULE])
    expect(applyBrainHooks(on, 'node "/x/island-brain-hook.cjs" --vault "/home/me/Brain"')).toEqual(on)
    const off = removeBrainHooks(on)
    expect(off).toEqual(settings)
    expect(removeBrainHooks({ permissions: { allow: [ALLOW_RULE] }, hooks: { SessionEnd: on.hooks.SessionEnd } })).toEqual({})
  })

  // The stand-in claude CLI is a script with a shebang, which Windows can't run.
  test.skipIf(process.platform === 'win32')('connect and disconnect Claude Code, Codex and Gemini CLI from files, with backups', async () => {
    const home = tmp()
    const claudeDir = join(home, '.claude')
    mkdirSync(claudeDir)
    writeFileSync(join(claudeDir, 'CLAUDE.md'), '# Mine\n')
    writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify({ model: 'opus' }))
    mkdirSync(join(home, '.codex'))
    const fakeClaude = join(home, 'claude')
    const calls = join(home, 'calls.txt')
    // A stand-in claude CLI that records its arguments and writes ~/.claude.json like the real one.
    writeFileSync(
      fakeClaude,
      `#!/usr/bin/env node\nconst fs=require('fs');fs.appendFileSync(${JSON.stringify(calls)}, process.argv.slice(2).join(' ')+'\\n');\nconst f=${JSON.stringify(join(home, '.claude.json'))};let j={};try{j=JSON.parse(fs.readFileSync(f,'utf8'))}catch{}\nconst a=process.argv.slice(2);if(a[1]==='add-json'){j.mcpServers=j.mcpServers||{};j.mcpServers[a[4]]=JSON.parse(a[5])}if(a[1]==='remove'&&j.mcpServers){delete j.mcpServers[a[4]]}fs.writeFileSync(f,JSON.stringify(j))\n`,
      { mode: 0o755 },
    )
    let brief = '# My brief\n\nOne.'
    const w = new Wiring({
      home,
      claudeDir,
      claudeJson: join(home, '.claude.json'),
      codexDir: join(home, '.codex'),
      geminiDir: join(home, '.gemini'),
      vault: () => join(home, 'Brain'),
      claudeBinary: () => fakeClaude,
      hookCommand: () => `node "/x/island-brain-hook.cjs" --vault "${join(home, 'Brain')}"`,
      mcp: () => ({ url: 'http://127.0.0.1:47823/mcp', authorization: 'Bearer t' }),
      brief: () => brief,
    })
    const status = () => Object.fromEntries(w.status().map((t) => [t.id, t]))
    expect(status()['claude-code']).toMatchObject({ present: true, connected: false })
    expect(status().gemini.present).toBe(false)

    expect(await w.connect('claude-code')).toBeNull()
    expect(status()['claude-code'].connected).toBe(true)
    expect(readFileSync(join(claudeDir, 'CLAUDE.md'), 'utf8')).toContain('# Mine\n\n<!-- dynamic-island-brain:start')
    expect(readFileSync(join(claudeDir, 'CLAUDE.md.bak'), 'utf8')).toBe('# Mine\n')
    expect(JSON.parse(readFileSync(join(home, '.claude.json'), 'utf8')).mcpServers.brain).toEqual({ type: 'http', url: 'http://127.0.0.1:47823/mcp?client=claude-code', headers: { Authorization: 'Bearer t' } })
    expect(readFileSync(calls, 'utf8')).toContain('mcp add-json --scope user brain')

    expect(await w.connect('codex')).toBeNull()
    expect(readFileSync(join(home, '.codex', 'AGENTS.md'), 'utf8')).toContain('One.')
    brief = '# My brief\n\nTwo.'
    w.refreshInline()
    expect(readFileSync(join(home, '.codex', 'AGENTS.md'), 'utf8')).toContain('Two.')
    expect(existsSync(join(home, '.gemini'))).toBe(false)

    expect(await w.disconnect('claude-code')).toBeNull()
    expect(readFileSync(join(claudeDir, 'CLAUDE.md'), 'utf8')).toBe('# Mine\n')
    expect(JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf8'))).toEqual({ model: 'opus' })
    expect(JSON.parse(readFileSync(join(home, '.claude.json'), 'utf8')).mcpServers.brain).toBeUndefined()
    await w.disconnect('codex')
    // The file only held the island's block: gone, as before.
    expect(existsSync(join(home, '.codex', 'AGENTS.md'))).toBe(false)
    expect(w.any()).toBe(false)
  })

  test('a settings.json that isn’t JSON is left alone', async () => {
    const home = tmp()
    mkdirSync(join(home, '.claude'))
    writeFileSync(join(home, '.claude', 'settings.json'), '{ broken')
    const w = new Wiring({
      home,
      claudeDir: join(home, '.claude'),
      claudeJson: join(home, '.claude.json'),
      codexDir: join(home, '.codex'),
      geminiDir: join(home, '.gemini'),
      vault: () => join(home, 'Brain'),
      claudeBinary: () => null,
      hookCommand: () => 'x island-brain-hook',
      mcp: () => ({ url: 'http://127.0.0.1:47823/mcp', authorization: 'Bearer t' }),
      brief: () => '',
    })
    expect(await w.connect('claude-code')).toMatch(/isn’t valid JSON/)
    expect(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')).toBe('{ broken')
    expect(w.status()[0].manual).toContain("claude mcp add-json --scope user brain '")
  })
})

describe('the hook Claude Code runs', () => {
  function run(vault: string, input: object, env: Record<string, string> = {}): Promise<string> {
    return new Promise((resolve) => {
      const p = spawn('node', ['hook/island-brain-hook.cjs', '--vault', vault], { env: { ...process.env, ...env } })
      let out = ''
      p.stdout.on('data', (d) => (out += d))
      p.on('close', () => resolve(out))
      p.stdin.end(JSON.stringify(input))
    })
  }

  test('at the start: this project’s page, last sessions and open promises', async () => {
    const { vault, root } = brain()
    const repo = join(tmp(), 'Island App')
    mkdirSync(join(repo, '.git'), { recursive: true })
    mkdirSync(join(repo, 'src'))
    const name = slugify('Island App', 80)
    vault.write(`02-projects/${name}/${name}.md`, '---\ntype: project\n---\n# Island App\n\nThe Dynamic Island.\n<!-- hint -->\n', 'x')
    vault.write(`02-projects/${name}/sessions/2026-11-06-${name}-aaaaaa.md`, '---\ntype: session\n---\n# Older\n\n- Shipped: a\n- Next: b\n', 'x')
    vault.write(`01-inbox/2026-11-07-session-${name}-bbbbbb.md`, '---\ntype: session\n---\n# Newer\n\n- Shipped: c\n', 'x')
    vault.append('07-world-model/ledgers/promises.md', '- [ ] 2026-11-07 · Send the APK · (island)', 'x')
    vault.append('07-world-model/ledgers/promises.md', '- [x] 2026-11-01 · Done one', 'x')
    const out = JSON.parse(await run(root, { hook_event_name: 'SessionStart', cwd: join(repo, 'src'), session_id: 's' }))
    const ctx: string = out.hookSpecificOutput.additionalContext
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart')
    expect(ctx).toContain(`for this project (${name})`)
    expect(ctx).toContain('The Dynamic Island.')
    expect(ctx).not.toContain('hint')
    expect(ctx.indexOf('### Newer (2026-11-07)')).toBeLessThan(ctx.indexOf('### Older (2026-11-06)'))
    expect(ctx).toContain('- Shipped: c')
    expect(ctx).toContain('- [ ] 2026-11-07 · Send the APK')
    expect(ctx).not.toContain('Done one')
    // A project the brain doesn't know yet.
    expect(JSON.parse(await run(brain().root, { hook_event_name: 'SessionStart', cwd: tmp() })).hookSpecificOutput.additionalContext).toContain('has nothing on this project')
  })

  test('at the end: the session waits in the queue; nothing for skipped runs, the vault, or no vault', async () => {
    const { root } = brain()
    expect(await run(root, { hook_event_name: 'SessionEnd', session_id: 'abc-123', transcript_path: '/t/abc.jsonl', cwd: '/home/me/x', reason: 'exit' })).toBe('')
    const job = JSON.parse(readFileSync(join(root, '_system/queue/abc-123.json'), 'utf8'))
    expect(job).toMatchObject({ session_id: 'abc-123', transcript_path: '/t/abc.jsonl', cwd: '/home/me/x', reason: 'exit' })
    await run(root, { hook_event_name: 'SessionEnd', session_id: 'skip', transcript_path: '/t/s.jsonl', cwd: '/x' }, { DI_BRAIN_SKIP: '1' })
    await run(root, { hook_event_name: 'SessionEnd', session_id: 'inside', transcript_path: '/t/i.jsonl', cwd: join(root, '01-inbox') })
    expect(readdirSync(join(root, '_system/queue'))).toEqual(['abc-123.json'])
    expect(await run(root, { hook_event_name: 'SessionStart', cwd: root })).toBe('')
    expect(await run(join(tmp(), 'none'), { hook_event_name: 'SessionStart', cwd: '/x' })).toBe('')
    expect(await run(root, { hook_event_name: 'Stop' })).toBe('')
  })
})
