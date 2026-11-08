import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DIMS, cosine, embedText, fuse, hashEmbed, unit } from '../shared/meaning'
import { MeaningIndex } from '../electron/brain/meaning'

const fake = async (texts: string[]) => texts.map(hashEmbed)

test('what the model reads of a note', () => {
  expect(embedText('Robot arm', '---\ntype: project\n---\n# Robot arm\n\nUses [[ROS 2|ROS]] and ```code```.')).toBe('Robot arm. Robot arm Uses ROS and .')
  expect(embedText('x', 'y'.repeat(5000)).length).toBe(1200)
})

test('unit vectors, cosine and rank fusion', () => {
  const a = unit(new Float32Array([3, 4]))
  expect(a[0]).toBeCloseTo(0.6)
  expect(cosine(a, a)).toBeCloseTo(1)
  expect(fuse([['a', 'b', 'c'], ['c', 'a']]).map((h) => h.path)).toEqual(['a', 'c', 'b'])
  expect(hashEmbed('inverse kinematics solver').length).toBe(DIMS)
  expect(cosine(hashEmbed('inverse kinematics solver'), hashEmbed('the kinematics solver'))).toBeGreaterThan(cosine(hashEmbed('inverse kinematics solver'), hashEmbed('grocery list')))
})

test('MeaningIndex: embeds what changed, forgets what’s gone, keeps it on disk', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'meaning-')), '_system/index/meaning')
  const idx = new MeaningIndex(file)
  const notes = [
    { path: '02-projects/robot-arm/robot-arm.md', mtime: 1, text: () => 'Robot arm. inverse kinematics solver for the gripper' },
    { path: '04-resources/groceries.md', mtime: 1, text: () => 'Groceries. milk eggs bread' },
  ]
  expect(await idx.update(notes, fake)).toBe(2)
  expect(await idx.update(notes, fake)).toBe(0) // nothing changed
  const hits = await idx.query('kinematics of the arm', fake)
  expect(hits[0].path).toBe('02-projects/robot-arm/robot-arm.md')
  expect((await idx.query('kinematics', fake, 30, '04-resources')).map((h) => h.path)).toEqual(['04-resources/groceries.md'])
  idx.save()
  const again = new MeaningIndex(file)
  expect(again.size()).toBe(2)
  expect(await again.update([notes[0]], fake)).toBe(0)
  expect(again.size()).toBe(1)
})
