import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

/**
 * One answer from Claude Code (Haiku), for session notes when the island's AI
 * is Claude Code. Runs in its own folder, saves no session and loads no MCP
 * servers or island hooks, so it never shows up as a session of yours.
 */
export function claudeOnce(bin: string, prompt: string, cwd: string, timeoutMs = 120_000): Promise<string> {
  mkdirSync(cwd, { recursive: true })
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ['-p', prompt, '--model', 'haiku', '--output-format', 'text', '--strict-mcp-config', '--no-session-persistence'], {
      cwd,
      env: { ...process.env, DYNAMIC_ISLAND_RUN: '1', DI_BRAIN_SKIP: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    const timer = setTimeout(() => p.kill('SIGTERM'), timeoutMs)
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    p.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && out.trim()) resolve(out)
      else reject(new Error(err.trim().split('\n')[0] || `claude exited with ${code}`))
    })
  })
}
