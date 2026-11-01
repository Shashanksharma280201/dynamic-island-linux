import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JobState } from '@shared/types'

vi.mock('electron', () => ({
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
  screen: { getCursorScreenPoint: () => ({ x: 10, y: 10 }) },
}))

const { PhoneOut, filesToSend } = await import('../electron/phoneOut')

/** A folder with a hidden file, a folder inside it and a link back to itself, and a file beside it. */
function tree(): string {
  const root = mkdtempSync(join(tmpdir(), 'island-out-'))
  mkdirSync(join(root, 'Holiday', 'Day 1'), { recursive: true })
  writeFileSync(join(root, 'Holiday', 'b.jpg'), 'bb')
  writeFileSync(join(root, 'Holiday', '.hidden'), 'h')
  writeFileSync(join(root, 'Holiday', 'Day 1', 'a.txt'), 'aaa')
  writeFileSync(join(root, 'single.pdf'), 'pdf!')
  symlinkSync(join(root, 'Holiday'), join(root, 'Holiday', 'loop'))
  return root
}

describe('files to send', () => {
  test('folders are every file in them, in their folders; links are not followed', async () => {
    const root = tree()
    const { files, more } = await filesToSend([join(root, 'single.pdf'), join(root, 'Holiday'), join(root, 'missing')])
    expect(more).toBe(false)
    const got = Object.fromEntries(files.map((f) => [f.path.slice(root.length + 1), { dir: f.dir, size: f.size }]))
    expect(got).toEqual({
      'single.pdf': { dir: undefined, size: 4 },
      'Holiday/b.jpg': { dir: 'Holiday', size: 2 },
      'Holiday/.hidden': { dir: 'Holiday', size: 1 },
      'Holiday/Day 1/a.txt': { dir: 'Holiday/Day 1', size: 3 },
    })
  })

  test('at most so many, and it says there were more', async () => {
    const root = tree()
    const { files, more } = await filesToSend([join(root, 'Holiday'), join(root, 'single.pdf')], 2)
    expect(files.length).toBe(2)
    expect(more).toBe(true)
  })
})

describe('sending to the phone', () => {
  test('a folder is one card on the island, counting its files', async () => {
    const root = tree()
    const offers: { id: string; dir?: string; batch?: { i: number; n: number; title: string } }[] = []
    const cards: [string, JobState][] = []
    const out = new PhoneOut({
      link: {
        connected: () => [{ device: 'Pixel 8' }],
        offer: (_path: string, _size: number, _side: string, _thumb: string | undefined, more: { dir?: string; batch?: { i: number; n: number; title: string } }) => {
          const id = `out${offers.length}`
          offers.push({ id, ...more })
          return id
        },
      } as never,
      overlay: { toPage: (p: { x: number; y: number }) => p, send: () => {} } as never,
      present: (id, job) => cards.push([id, job]),
      side: () => ({ side: 'right', at: 0.5 }),
    })
    await out.send([join(root, 'Holiday')])
    expect(offers.map((o) => [o.dir, o.batch?.i, o.batch?.n, o.batch?.title])).toEqual([
      ['Holiday', 0, 3, 'Holiday · 3 files'],
      ['Holiday', 1, 3, 'Holiday · 3 files'],
      ['Holiday/Day 1', 2, 3, 'Holiday · 3 files'],
    ].sort((a, b) => String(a[1]).localeCompare(String(b[1]))))
    const id = cards[0][0]
    expect(cards.every(([c]) => c === id)).toBe(true)
    expect(cards.at(-1)![1]).toMatchObject({ title: 'To Pixel 8', sub: 'Holiday · 3 files · 1 of 3', phase: 'working', progress: 0 })
    out.progress('out0', 1, 2)
    out.delivered('out0', true, 'Pixel 8')
    expect(cards.at(-1)![1]).toMatchObject({ sub: 'Holiday · 3 files · 2 of 3', phase: 'working' })
    out.delivered('out1', true, 'Pixel 8')
    out.delivered('out2', true, 'Pixel 8')
    expect(cards.at(-1)).toEqual([id, { title: 'Sent to Pixel 8', sub: 'Holiday · 3 files', phase: 'done', note: '6 B, in Island Drop on your phone' }])
  })

  test('if some don’t arrive it says how many', async () => {
    const root = tree()
    let n = 0
    const cards: JobState[] = []
    const out = new PhoneOut({
      link: { connected: () => [], offer: () => `out${n++}` } as never,
      overlay: { toPage: (p: { x: number; y: number }) => p, send: () => {} } as never,
      present: (_id, job) => cards.push(job),
      side: () => ({ side: 'left', at: 0.5 }),
    })
    await out.send([join(root, 'single.pdf'), join(root, 'Holiday', 'b.jpg')])
    out.delivered('out0', true, 'Pixel 8')
    out.delivered('out1', false, 'Pixel 8')
    expect(cards.at(-1)).toMatchObject({ title: 'Didn’t all reach your phone', sub: '2 files', phase: 'error', note: '1 of 2 didn’t arrive on Pixel 8.' })
  })

  test('with no phone listening it says so', async () => {
    const root = tree()
    const cards: JobState[] = []
    const out = new PhoneOut({
      link: { connected: () => [], offer: () => null } as never,
      overlay: { toPage: (p: { x: number; y: number }) => p, send: () => {} } as never,
      present: (_id, job) => cards.push(job),
      side: () => ({ side: 'left', at: 0.5 }),
    })
    await out.send([join(root, 'single.pdf')])
    expect(cards).toEqual([expect.objectContaining({ title: 'No phone is listening', sub: 'single.pdf', phase: 'error' })])
  })
})
