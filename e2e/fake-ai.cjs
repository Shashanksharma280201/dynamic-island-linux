// Stand-in for AI providers in tests: Anthropic's Messages API (/v1/messages,
// /v1/models) and the OpenAI-compatible chat API (/chat/completions, /models),
// both streaming, with tool calls. Records every request in s.log.
//
// Scripted by the prompt: "set my background to …" changes the wallpaper,
// "remember …" saves a note (tool call), "notes?"
// searches notes (tool call), "tell <name> <text>" sends a WhatsApp message
// (tool call that asks first), "slow" waits 6 s, anything else is echoed.
// With "(Files: … (id d3) …)" from the Documents tab: "grammar" corrects a
// Word file, "merge" merges the PDFs, "summar…" reads it, "trash" moves it
// to the Trash (asks first). CRM: "log a call with <name> … remind me" logs a
// call, then adds a follow-up; "add <First Last> from <Company> as a lead"
// adds a contact; "delete <name>" deletes them (asks first).
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
    // The brain's loop: the daily signal and the morning card.
    if (result === null && /exactly five lines/.test(prompt)) return { text: '- Shipped: the loop\n- Decided: rules first for filing\n- Promised: the deck for Asha\n- Number: 1 note\n- Next: send the deck' }
    // Notifications, summed up.
    if (result === null && /my notifications to sum up/.test(prompt)) return { text: 'Alice wants lunch at 1, and the design team posted new mockups on Slack. Mail has the quarterly report.' }
    if (result === null && /chief of staff/.test(prompt)) return { text: 'One: Send Asha the deck\nWhy: You promised it on Friday.\nTo: Asha, by mail\nDraft: Hi Asha, here is the deck we talked about.' }
    // The buddy: a question with a screenshot.
    const last = body.messages[body.messages.length - 1]
    const pic = Array.isArray(last?.content) && last.content.some((b) => b.type === 'image' || b.type === 'image_url')
    if (pic && result === null) {
      s.lastImage = last.content.find((b) => b.type === 'image')?.source?.data ?? last.content.find((b) => b.type === 'image_url')?.image_url?.url ?? ''
      if (/please fix/i.test(prompt)) return { text: 'On it: I’ve asked the assistant. [DO: fix the failing cart test] [POINT:none]' }
      if (/i always use pnpm/i.test(prompt)) return { text: 'Noted. [REMEMBER: prefers pnpm over npm] [POINT:none]' }
      if (/click the red/i.test(prompt)) return { text: 'I can click it for you. [CLICK:300,350:Red window]' }
      if (/walk me through|how do i/i.test(prompt)) return { text: 'First open the menu at the top. Then choose Settings. [POINT:400,40:Menu] [POINT:520,300:Settings]' }
      if (/where/i.test(prompt)) return { text: 'It’s the gear at the top right. [POINT:1800,30:Settings gear]' }
      return { text: 'I can see your screen. [POINT:none]' }
    }
    if (result !== null) {
      if (/^Saved the note/.test(result)) return { text: 'Done! I saved that note for you.' }
      if (/^Set as the background: /.test(result)) return { text: result.split(' (Say')[0] }
      if (/^Sent to/.test(result)) return { text: 'Sent it!' }
      if (/did not allow/.test(result)) return { text: 'Okay, I didn’t send it.' }
      if (/^Logged \(/.test(result) && /remind/i.test(prompt)) {
        const who = /with (\w+)/i.exec(prompt)?.[1] ?? ''
        const d = new Date(Date.now() + 86_400_000)
        const due = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        return { text: '', tool: { name: 'crm_add_task', input: { title: `Follow up with ${who}`, contact: who, due } } }
      }
      if (/^Added follow-up /.test(result)) return { text: 'Logged the call and added a follow-up for tomorrow.' }
      if (/^Logged \(/.test(result)) return { text: 'Logged it.' }
      if (/^Added .+ \(c\d+\)\.$/.test(result)) return { text: result.replace(/ \(c\d+\)/, '') }
      if (/^Deleted /.test(result)) return { text: result }
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
    const call = /^log a call with (\w+)/i.exec(prompt)
    if (call) return { text: '', tool: { name: 'crm_log', input: { contact: call[1], kind: 'call', text: 'Talked about the proposal' } } }
    const lead = /^add (\w+ \w+) from (\w+) as a lead/i.exec(prompt)
    if (lead) return { text: '', tool: { name: 'crm_add_contact', input: { name: lead[1], company: lead[2], status: 'lead' } } }
    const del = /^delete (\w+)/i.exec(prompt)
    if (del) return { text: '', tool: { name: 'crm_delete', input: { what: 'contact', id: del[1] } } }
    const tell = /^tell (\w+) (.+)/i.exec(prompt)
    if (tell) return { text: '', tool: { name: 'chats_send', input: { chat: tell[1], text: tell[2] } } }
    const bg = /(?:background|wallpaper) to (?:an? )?(.+)/i.exec(prompt)
    if (bg) return { text: '', tool: { name: 'wallpaper_set', input: { query: bg[1].replace(/^video of /i, ''), kind: /video/i.test(prompt) ? 'video' : 'image' } } }
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
          for (const part of p.text.match(/[\s\S]{1,8}/g)) {
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
          for (const part of p.text.match(/[\s\S]{1,8}/g)) {
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
