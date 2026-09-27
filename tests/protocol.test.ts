import { encode, createDecoder, defaultSocketPath } from '@shared/protocol'

test('encode ends with newline and round-trips', () => {
  const line = encode({ a: 1 })
  expect(line.endsWith('\n')).toBe(true)
  const decode = createDecoder()
  expect(decode(line)).toEqual([{ a: 1 }])
})

test('decoder handles split and multiple messages', () => {
  const decode = createDecoder()
  expect(decode('{"a":1}\n{"b":')).toEqual([{ a: 1 }])
  expect(decode('2}\n')).toEqual([{ b: 2 }])
})

test('decoder skips malformed lines instead of throwing', () => {
  const decode = createDecoder()
  expect(decode('not json\n{"ok":1}\n42\n')).toEqual([{ ok: 1 }])
})

test('defaultSocketPath prefers env override, then XDG_RUNTIME_DIR, then per-user /tmp', () => {
  expect(defaultSocketPath({ DYNAMIC_ISLAND_SOCK: '/x.sock' }, 1)).toBe('/x.sock')
  expect(defaultSocketPath({ XDG_RUNTIME_DIR: '/run/user/1000' }, 1000)).toBe(
    '/run/user/1000/dynamic-island.sock',
  )
  expect(defaultSocketPath({}, 1000)).toBe('/tmp/dynamic-island-1000.sock')
})
