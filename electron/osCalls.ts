import { ipcMain, type WebContents } from 'electron'
import { osCallArgs, type OsCall } from '@shared/os'

/** Island OS's channel: the island and Settings call main's functions by name. */
export const OS = {
  CALL: 'os:call', // invoke(fn, args) -> its value
  CHANGED: 'os:changed', // main -> island: something Island OS shows changed (a topic)
} as const

export type OsRoutes = Record<OsCall, (...args: any[]) => unknown>

/**
 * One handler for every Island OS call: only from the island's or Settings'
 * own pages, only names it knows, each argument checked before it runs.
 */
export function wireOs(routes: () => OsRoutes | null, allowed: (sender: WebContents) => boolean): void {
  ipcMain.handle(OS.CALL, async (e, fn, args) => {
    if (!allowed(e.sender)) throw new Error('Not from the island.')
    const c = osCallArgs(fn, args)
    if (!c) throw new Error('That isn’t something the island does.')
    const run = routes()?.[c.fn]
    if (!run) throw new Error('The island is still starting.')
    return run(...c.args)
  })
}
