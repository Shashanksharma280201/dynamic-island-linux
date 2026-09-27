import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NotesStore, noteTitle, notePreview, newNoteId, noteCreated } from '../electron/notes'

test('title and preview come from the text', () => {
  expect(noteTitle('\n# Groceries\nmilk\neggs')).toBe('Groceries')
  expect(noteTitle('   ')).toBe('New Note')
  expect(notePreview('# Groceries\nmilk\n\neggs')).toBe('milk eggs')
})

test('ids encode creation time', () => {
  const id = newNoteId(1_700_000_000_000)
  expect(noteCreated(id)).toBe(1_700_000_000_000)
  expect(id).toMatch(/^[a-z0-9]+$/)
})

test('store: create, list newest first, update, get, delete', async () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'notes-')), 'notes')
  const s = new NotesStore(dir)
  expect(await s.list()).toEqual([])
  const a = await s.save(undefined, 'Ideas\nisland notes')
  await new Promise((r) => setTimeout(r, 20))
  const b = await s.save(undefined, 'Groceries\nmilk')
  expect((await s.list()).map((n) => n.title)).toEqual(['Groceries', 'Ideas'])
  await new Promise((r) => setTimeout(r, 20))
  await s.save(a, 'Ideas\nisland notes\nand more')
  const list = await s.list()
  expect(list[0]).toMatchObject({ id: a, title: 'Ideas', preview: 'island notes and more' })
  expect((await s.get(b)).body).toBe('Groceries\nmilk')
  expect(readFileSync(join(dir, `${a}.md`), 'utf8')).toBe('Ideas\nisland notes\nand more')
  expect(readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false)
  await s.remove(b)
  await s.remove(b) // idempotent
  expect((await s.list()).map((n) => n.id)).toEqual([a])
  await expect(s.get('../../etc/passwd')).rejects.toThrow(/Invalid/)
})
