import { pickPointer } from '../electron/cursor'

test('picks x/y from a QueryPointer reply', () => {
  expect(pickPointer({ rootX: 734, rootY: 12 })).toEqual({ x: 734, y: 12 })
})
