import { describeTool } from '../shared/toolDetail'

test('Bash shows the full command', () => {
  const d = describeTool('Bash', { command: 'rm -rf /tmp/build && npm ci' })
  expect(d.label).toMatch(/Bash/)
  expect(d.body).toBe('rm -rf /tmp/build && npm ci')
})

test('Write shows path and content', () => {
  const d = describeTool('Write', { file_path: '/a/b.ts', content: 'export const x = 1' })
  expect(d.label).toContain('/a/b.ts')
  expect(d.body).toContain('export const x = 1')
})

test('Edit shows a diff of old -> new', () => {
  const d = describeTool('Edit', { file_path: '/a.ts', old_string: 'foo', new_string: 'bar' })
  expect(d.label).toContain('/a.ts')
  expect(d.body).toContain('foo')
  expect(d.body).toContain('bar')
})

test('unknown tool falls back to pretty JSON', () => {
  const d = describeTool('Weird', { a: 1, b: [2, 3] })
  expect(d.label).toBe('Weird')
  expect(d.body).toContain('"a": 1')
})
