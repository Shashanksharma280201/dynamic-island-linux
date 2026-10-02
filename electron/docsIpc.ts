import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import type { DocAction, DocActionResult, DocsAdded, DocsView } from '@shared/docs'
import { DOCS } from './docsChannels'
import { CONVERT_TARGETS } from './docs/convert'
import type { DocsService } from './docs/service'

export { DOCS }

const idOf = (v: unknown): string => {
  if (typeof v !== 'string' || !/^d\d{1,9}$/.test(v)) throw new Error('Invalid document')
  return v
}
const idsOf = (v: unknown): string[] => {
  if (!Array.isArray(v) || !v.length || v.length > 100) throw new Error('Invalid documents')
  return v.map(idOf)
}
const short = (v: unknown, what: string, max = 200): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(`Invalid ${what}`)
  return v
}

/** Files the picker offers. */
const EXTENSIONS = ['pdf', 'docx', 'xlsx', 'csv', 'pptx', 'md', 'markdown', 'txt']

/** Wires the island's Documents tab to the workspace. */
export function wireDocs(
  win: BrowserWindow,
  docs: DocsService,
  d: { libreOffice: () => boolean },
): { changed: () => void } {
  const changed = () => {
    if (!win.isDestroyed()) win.webContents.send(DOCS.CHANGED)
  }
  // Tests: don't start other apps.
  const noOpen = !!process.env.DI_NO_OPEN
  ipcMain.handle(DOCS.VIEW, async (): Promise<DocsView> => ({
    files: await docs.list(),
    recipes: docs.recipes(),
    outDir: docs.outLabel(),
    libreOffice: d.libreOffice(),
  }))
  ipcMain.handle(DOCS.ADD, (_e, paths): Promise<DocsAdded> => {
    if (!Array.isArray(paths) || paths.length > 100) throw new Error('Invalid files')
    return docs.add(paths.filter((p): p is string => typeof p === 'string'))
  })
  ipcMain.handle(DOCS.PICK, async (): Promise<DocsAdded> => {
    // Tests choose the files without the system dialog.
    const preset = process.env.DI_DOCS_PICK
    const paths =
      preset !== undefined
        ? preset.split('\n').filter(Boolean)
        : (
            await dialog.showOpenDialog({
              title: 'Add documents',
              buttonLabel: 'Add',
              properties: ['openFile', 'multiSelections'],
              filters: [
                { name: 'Documents', extensions: EXTENSIONS },
                { name: 'All files', extensions: ['*'] },
              ],
            })
          ).filePaths
    return docs.add(paths)
  })
  ipcMain.handle(DOCS.REMOVE, (_e, ids) => docs.remove(idsOf(ids)))
  ipcMain.handle(DOCS.OPEN, async (_e, id) => {
    const e = await docs.resolve(idOf(id))
    if (noOpen) return
    const err = await shell.openPath(e.path)
    if (err) throw new Error(err)
  })
  ipcMain.handle(DOCS.SHOW, async (_e, id) => {
    const e = await docs.resolve(idOf(id))
    if (!noOpen) shell.showItemInFolder(e.path)
  })
  ipcMain.handle(DOCS.OPEN_FOLDER, async () => {
    const dir = await docs.ensureOutDir()
    if (noOpen) return
    const err = await shell.openPath(dir)
    if (err) throw new Error(err)
  })
  ipcMain.handle(DOCS.ACTION, async (_e, a: DocAction): Promise<DocActionResult> => {
    switch (a?.op) {
      case 'merge':
        return { made: [await docs.merge(idsOf(a.ids))] }
      case 'pages': {
        if (a.mode !== 'keep' && a.mode !== 'delete') throw new Error('Invalid mode')
        return { made: [(await docs.pages(idOf(a.id), short(a.pages, 'pages'), a.mode)).entry] }
      }
      case 'rotate':
        if (![90, 180, 270, -90].includes(a.degrees)) throw new Error('Invalid rotation')
        return { made: [await docs.rotate(idOf(a.id), a.degrees)] }
      case 'split': {
        const every = Number(a.every)
        if (!Number.isInteger(every) || every < 1 || every > 1000) throw new Error('Invalid split')
        return { made: await docs.split(idOf(a.id), { every }) }
      }
      case 'convert': {
        if (!CONVERT_TARGETS.includes(a.to)) throw new Error('Invalid format')
        const r = await docs.convert(idOf(a.id), a.to)
        return { made: [r.entry], note: r.note }
      }
      case 'numbers':
        return { made: [await docs.stamp(idOf(a.id), { pageNumbers: true })] }
      default:
        throw new Error('Unknown action')
    }
  })
  ipcMain.handle(DOCS.RECIPE_SAVE, (_e, r) => {
    if (!r || typeof r !== 'object') throw new Error('Invalid recipe')
    return docs.saveRecipe({
      id: typeof r.id === 'string' ? r.id.slice(0, 40) : undefined,
      name: short(r.name, 'name', 80),
      instruction: short(r.instruction, 'instruction', 4000),
    })
  })
  ipcMain.handle(DOCS.RECIPE_REMOVE, (_e, id) => docs.removeRecipe(short(id, 'recipe', 40)))
  return { changed }
}
