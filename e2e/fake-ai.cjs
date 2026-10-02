// Stand-in for AI providers in tests: Anthropic's Messages API (/v1/messages,
// /v1/models) and the OpenAI-compatible chat API (/chat/completions, /models),
// both streaming, with tool calls. Records every request in s.log.
//
// Scripted by the prompt: "remember …" saves a note (tool call), "notes?"
// searches notes (tool call), "tell <name> <text>" sends a WhatsApp message
// (tool call that asks first), "slow" waits 6 s, anything else is echoed.
// With "(Files: … (id d3) …)" from the Documents tab: "grammar" corrects a
// Word file, "merge" merges the PDFs, "summar…" reads it, "trash" moves it
// to the Trash (asks first).
// The model "no-tools" rejects requests that include tools (like some local
// models); the key "bad-key" is rejected.
const http = require('http')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function startFakeAi() {
  const s = { log: [] }
  const lastUser = (messages) => {
    const users = messages.filter((m) => m.role === 'user')
    const m = users[users.length - 1]
    if (!m) return ''
    if (typeof m.content === 'string') return m.content
    return m.content.map((b) => b.text ?? '').join('')
  }
  const toolResult = (body) => {
    // Anthropic: a user message of tool_result blocks; OpenAI: role "tool".
    const last = body.messages[body.messages.length - 1]
    if (last.role === 'tool') return last.content
    if (Array.isArray(last.content) && last.content[0]?.type === 'tool_result') return String(last.content[0].content)
    return null
  }
  /** What the "model" does next: { text } or { text, tool: { name, input } }. */
  const plan = (body) => {
    const result = toolResult(body)
    const prompt = lastUser(body.messages.filter((m) => !(Array.isArray(m.content) && m.content[0]?.type === 'tool_result')))
    if (result !== null) {
      if (/^Saved the note/.test(result)) return { text: 'Done! I saved that note for you.' }
      if (/^Sent to/.test(result)) return { text: 'Sent it!' }
      if (/did not allow/.test(result)) return { text: 'Okay, I didn’t send it.' }
      if (/^(Saved|Made) /.test(result)) return { text: `Done. ${result.split('\n')[0]}` }
      if (/^Moved /.test(result)) return { text: 'Moved it to the Trash.' }
      if (/^Failed: /.test(result)) return { text: `Sorry: ${result.slice(8)}` }
      if (/^.+ \(id d\d+\) · /.test(result)) return { text: `Summary: ${result.split('\n\n')[1]?.replace(/\s+/g, ' ').slice(0, 80)}` }
      return { text: `Here’s what I found: ${result.split('\n').find((l) => l.startsWith('title:'))?.slice(7) ?? result.slice(0, 80)}` }
    }
    const ids = [...prompt.matchAll(/\(id (d\d+)\)/g)].map((x) => x[1])
    if (ids.length) {
      if (/grammar|spelling/i.test(prompt)) return { text: '', tool: { name: 'docx_edit', input: { file: ids[0], edits: [{ find: 'teh rent', replace: 'the rent' }] } } }
      if (/merge/i.test(prompt)) return { text: '', tool: { name: 'pdf_merge', input: { files: ids } } }
      if (/summar/i.test(prompt)) return { text: '', tool: { name: 'docs_read', input: { file: ids[0] } } }
      if (/trash/i.test(prompt)) return { text: '', tool: { name: 'docs_trash', input: { file: ids[0] } } }
    }
    const tell = /^tell (\w+) (.+)/i.exec(prompt)
    if (tell) return { text: '', tool: { name: 'chats_send', input: { chat: tell[1], text: tell[2] } } }
    const m = /remember (?:to )?(.+)/i.exec(prompt)
    if (m) return { text: 'Sure, saving that.', tool: { name: 'notes_create', input: { text: m[1] } } }
    if (/notes\?/i.test(prompt)) return { text: '', tool: { name: 'notes_search', input: { query: '' } } }
    if (/slow/i.test(prompt)) return { text: 'Finally done.', delay: 6000 }
    return { text: `You said: ${prompt}` }
  }

  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (d) => (raw += d))
    req.on('end', async () => {
      const body = raw ? JSON.parse(raw) : {}
      const path = new URL(req.url, 'http://x').pathname
      const entry = { method: req.method, path, headers: req.headers, body }
      s.log.push(entry)
      const key = req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer /, '')
      if (key === 'bad-key') {
        const anth = path.startsWith('/v1/')
        res.writeHead(401, { 'content-type': 'application/json' })
        return res.end(JSON.stringify(anth ? { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } : { error: { message: 'Incorrect API key provided', type: 'invalid_request_error' } }))
      }
      // ---- model lists ----
      if (req.method === 'GET' && path === '/v1/models') {
        const data = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'].map((id) => ({ id, type: 'model', display_name: id, created_at: '2026-01-01T00:00:00Z' }))
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ data, has_more: false, first_id: data[0].id, last_id: data[2].id }))
      }
      if (req.method === 'GET' && path === '/models') {
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ object: 'list', data: ['gpt-5', 'gpt-5-mini', 'llama3.2'].map((id) => ({ id, object: 'model', created: 0, owned_by: 'x' })) }))
      }
      const sse = () => res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      // ---- Anthropic Messages API ----
      if (req.method === 'POST' && path === '/v1/messages') {
        const p = plan(body)
        sse()
        const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
        ev('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } })
        let i = 0
        if (p.delay) await sleep(p.delay)
        if (p.text) {
          ev('content_block_start', { index: i, content_block: { type: 'text', text: '' } })
          for (const part of p.text.match(/.{1,8}/g)) {
            ev('content_block_delta', { index: i, delta: { type: 'text_delta', text: part } })
            await sleep(20)
          }
          ev('content_block_stop', { index: i++ })
        }
        if (p.tool) {
          await sleep(300)
          ev('content_block_start', { index: i, content_block: { type: 'tool_use', id: 'toolu_1', name: p.tool.name, input: {} } })
          ev('content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(p.tool.input) } })
          ev('content_block_stop', { index: i++ })
        }
        ev('message_delta', { delta: { stop_reason: p.tool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 12 } })
        ev('message_stop', {})
        return res.end()
      }
      // ---- OpenAI-compatible chat ----
      if (req.method === 'POST' && path === '/chat/completions') {
        if (body.model === 'no-tools' && body.tools) {
          res.writeHead(400, { 'content-type': 'application/json' })
          return res.end(JSON.stringify({ error: { message: 'registry.ollama.ai/library/no-tools does not support tools', type: 'invalid_request_error' } }))
        }
        const p = plan(body)
        sse()
        const chunk = (delta, finish = null) =>
          res.write(`data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 0, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
        chunk({ role: 'assistant', content: '' })
        if (p.delay) await sleep(p.delay)
        if (p.text) {
          for (const part of p.text.match(/.{1,8}/g)) {
            chunk({ content: part })
            await sleep(20)
          }
        }
        if (p.tool) {
          await sleep(300)
          const args = JSON.stringify(p.tool.input)
          chunk({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: p.tool.name, arguments: '' } }] })
          chunk({ tool_calls: [{ index: 0, function: { arguments: args.slice(0, 5) } }] })
          chunk({ tool_calls: [{ index: 0, function: { arguments: args.slice(5) } }] })
        }
        chunk({}, p.tool ? 'tool_calls' : 'stop')
        res.write('data: [DONE]\n\n')
        return res.end()
      }
      res.writeHead(404).end()
    })
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      s.base = `http://127.0.0.1:${server.address().port}`
      s.close = () => server.close()
      resolve(s)
    }),
  )
}

module.exports = { startFakeAi }
