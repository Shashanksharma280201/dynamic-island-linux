import { encode, createDecoder } from '@shared/protocol'

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
