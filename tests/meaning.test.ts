import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DIMS, EMBED_MODEL, QUERY_PREFIX, chunkText, cosine, fuse, hashEmbed, noteChunks, queryText, unit } from '../shared/meaning'
import { MeaningIndex } from '../electron/brain/meaning'

const fake = async (texts: string[]) => texts.map(hashEmbed)
const tmpFile = () => join(mkdtempSync(join(tmpdir(), 'meaning-')), '_system/index/meaning')

test('a note in the stretches the model reads: its sections, plain', () => {
  const body = '---\ntype: project\n---\n# Robot arm\n\nUses [[ROS 2|ROS]] and [the docs](https://x.y).\n\n```\ncode\n```\n\n## Decisions\n\n- [x] Stay on **Humble**\n- Torque limit 2 Nm\n\n## Empty\n\n## People\n\nAsha builds the gripper.'
  expect(noteChunks(body, 900)).toEqual([{ heading: 'Robot arm', text: 'Uses ROS and the docs. Decisions: Stay on Humble Torque limit 2 Nm People: Asha builds the gripper.' }])
  // Long enough sections stay apart; the heading names each.
  const long = (w: string) => `${w} `.repeat(50).trim()
  const two = noteChunks(`## Goals\n\n${long('reach')}\n\n## Risks\n\n${long('slip')}`, 400)
  expect(two.map((c) => c.heading)).toEqual(['Goals', 'Risks'])
  expect(two[1].text.startsWith('slip slip')).toBe(true)
  // A long section in pieces, cut between paragraphs, then sentences, then anywhere.
  const big = noteChunks(['A. '.repeat(100), 'B. '.repeat(100), 'x'.repeat(2500)].join('\n\n'), 400)
  expect(big.every((c) => c.text.length <= 400)).toBe(true)
  expect(big.map((c) => c.text).join(' ').replace(/\s+/g, '').length).toBe(200 * 2 + 2500)
  // At most `max`; a note with no text is one empty stretch.
  expect(noteChunks('word. '.repeat(10000), 100, 5).length).toBe(5)
  expect(noteChunks('---\na: b\n---\n')).toEqual([{ heading: '', text: '' }])
  expect(chunkText('Robot arm', { heading: 'Decisions', text: 'Stay on Humble.' })).toBe('Robot arm. Decisions. Stay on Humble.')
  expect(chunkText('Groceries', { heading: '', text: '' })).toBe('Groceries')
  expect(queryText('  kinematics ')).toBe(`${QUERY_PREFIX}kinematics`)
})

test('unit vectors, cosine and rank fusion', () => {
  const a = unit(new Float32Array([3, 4]))
  expect(a[0]).toBeCloseTo(0.6)
  expect(cosine(a, a)).toBeCloseTo(1)
  expect(fuse([['a', 'b', 'c'], ['c', 'a']]).map((h) => h.path)).toEqual(['a', 'c', 'b'])
  expect(hashEmbed('inverse kinematics solver').length).toBe(DIMS)
  expect(cosine(hashEmbed('inverse kinematics solver'), hashEmbed('the kinematics solver'))).toBeGreaterThan(cosine(hashEmbed('inverse kinematics solver'), hashEmbed('grocery list')))
  // The stand-in ignores the model's question prefix.
  expect(cosine(hashEmbed(queryText('kinematics')), hashEmbed('kinematics'))).toBeCloseTo(1)
})

const note = (path: string, mtime: number, ...sections: string[]) => ({ path, mtime, chunks: () => sections })

test('MeaningIndex: a note is as close as its closest section, and says which', async () => {
  const idx = new MeaningIndex(tmpFile())
  const notes = [
    note('02-projects/robot-arm/robot-arm.md', 1, 'Robot arm. Goals. reach the shelf', 'Robot arm. Decisions. inverse kinematics solver for the gripper', 'Robot arm. People. Asha'),
    note('04-resources/groceries.md', 1, 'Groceries. milk eggs bread'),
  ]
  expect(await idx.update(notes, fake)).toBe(2)
  expect(idx.size()).toBe(2)
  expect(idx.vectors()).toBe(4)
  expect(await idx.update(notes, fake)).toBe(0) // nothing changed
  const [top] = await idx.query('kinematics solver', fake)
  expect(top).toMatchObject({ path: '02-projects/robot-arm/robot-arm.md', chunk: 1 })
  expect(top.score).toBeGreaterThan(0.4)
  expect((await idx.query('kinematics', fake, 30, '04-resources')).map((h) => h.path)).toEqual(['04-resources/groceries.md'])
})

test('MeaningIndex: reads a few sections at a time, forgets what’s gone, keeps it on disk', async () => {
  const file = tmpFile()
  const idx = new MeaningIndex(file)
  const notes = [note('a.md', 1, 'a1', 'a2', 'a3'), note('b.md', 1, 'b1', 'b2'), note('c.md', 1, 'c1')]
  let asked = 0
  const counting = async (texts: string[]) => ((asked += texts.length), fake(texts))
  // About `budget` sections a time, at least one note.
  expect(await idx.update(notes, counting, 4)).toBe(1)
  expect(await idx.update(notes, counting, 1)).toBe(1)
  expect(await idx.update(notes, counting, 4)).toBe(1)
  expect(asked).toBe(6)
  idx.save()
  const again = new MeaningIndex(file)
  expect(again.size()).toBe(3)
  expect(again.vectors()).toBe(6)
  expect(await again.update([notes[0], note('b.md', 2, 'b1 changed')], counting)).toBe(1)
  expect(again.size()).toBe(2)
  expect(again.vectors()).toBe(4)
  again.save()
  const meta = JSON.parse(readFileSync(`${file}.json`, 'utf8'))
  expect(meta).toMatchObject({ version: 2, model: EMBED_MODEL, dims: DIMS })
  expect(meta.notes).toEqual([
    { path: 'a.md', mtime: 1, n: 3 },
    { path: 'b.md', mtime: 2, n: 1 },
  ])
})

test('MeaningIndex: another model’s (or the old one-vector-a-note) index is read again', async () => {
  const file = tmpFile()
  const idx = new MeaningIndex(file)
  await idx.update([note('a.md', 1, 'a1', 'a2')], fake)
  idx.save()
  expect(new MeaningIndex(file, 'Xenova/some-other-model').size()).toBe(0)
  // The format before sections: no version, one vector a note.
  writeFileSync(`${file}.json`, JSON.stringify({ dims: DIMS, notes: [{ path: 'a.md', mtime: 1 }] }))
  writeFileSync(`${file}.bin`, Buffer.alloc(DIMS * 4))
  const old = new MeaningIndex(file)
  expect(old.size()).toBe(0)
  expect(await old.update([note('a.md', 1, 'a1', 'a2')], fake)).toBe(1)
})

test('MeaningIndex: lets go of the vectors when idle, and reads them back', async () => {
  const file = tmpFile()
  const idx = new MeaningIndex(file)
  await idx.update([note('a.md', 1, 'kinematics')], fake)
  expect(idx.releaseIfIdle(0, Date.now() + 1000)).toBe(false) // not saved yet
  idx.save()
  expect(idx.releaseIfIdle(60_000)).toBe(false) // just used
  expect(idx.releaseIfIdle(60_000, Date.now() + 120_000)).toBe(true)
  expect((await idx.query('kinematics', fake))[0].path).toBe('a.md')
})
