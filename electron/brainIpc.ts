import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { homedir } from 'node:os'
import type { ToolId } from '@shared/brain'
import type { Brain } from './brain'
import { BRAIN } from './brainChannels'

const TOOLS: ToolId[] = ['claude-code', 'codex', 'gemini']

/** Settings → You and Settings → Brain. */
export function wireBrain(brain: Brain): void {
  const pick = async (e: IpcMainInvokeEvent, title: string, defaultPath: string): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const o = { title, defaultPath, properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] }
    const r = win ? await dialog.showOpenDialog(win, o) : await dialog.showOpenDialog(o)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  }
  const text = (v: unknown) => (typeof v === 'string' ? v : '')
  ipcMain.handle(BRAIN.CREATE, (_e, folder) => brain.create(text(folder) || undefined))
  ipcMain.handle(BRAIN.PICK_FOLDER, (e) => pick(e, 'Where your second brain lives', brain.path()))
  ipcMain.handle(BRAIN.SET_ON, (_e, on) => brain.setOn(on === true))
  ipcMain.handle(BRAIN.SET, (_e, patch) => brain.setOptions(patch && typeof patch === 'object' ? patch : {}))
  ipcMain.handle(BRAIN.ADD_SKIP, async (e) => {
    const folder = await pick(e, 'Never file Claude Code sessions from this folder', homedir())
    if (folder) brain.setOptions({ skip: [...brain.view().skip, folder] })
  })
  ipcMain.handle(BRAIN.CONNECT, (_e, id, on) => (TOOLS.includes(id) ? brain.connect(id, on === true) : 'Unknown tool.'))
  ipcMain.handle(BRAIN.MINE, () => brain.mine())
  ipcMain.handle(BRAIN.KEEP, (_e, path) => brain.keep(text(path)))
  ipcMain.handle(BRAIN.KEEP_ALL, () => brain.keepAll())
  ipcMain.handle(BRAIN.ARCHIVE, (_e, path) => brain.archive(text(path)))
  ipcMain.handle(BRAIN.OPEN, (_e, path) => brain.open(text(path)))
  ipcMain.handle(BRAIN.OPEN_FOLDER, () => brain.openFolder())
  ipcMain.handle(BRAIN.INTERVIEW, () => brain.interview())
  ipcMain.handle(BRAIN.ME_GET, (_e, file) => brain.meGet(text(file)))
  ipcMain.handle(BRAIN.ME_SAVE, (_e, file, body) => (typeof body === 'string' ? brain.meSave(text(file), body) : 'Nothing to save.'))
  ipcMain.handle(BRAIN.BRIEF, () => brain.brief())
}
