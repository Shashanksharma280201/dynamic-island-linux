import type { BrowserWindow } from 'electron'

/** How long a helper window may sit hidden before it closes (each is a whole renderer process, 60 to 100 MB). */
export const IDLE_CLOSE_MS = Number(process.env.DI_IDLE_CLOSE_MS) || 3 * 60_000

/**
 * Close a helper window (the drag ring, the Phone Drop light, the edge strip)
 * once it has stayed hidden this long, made ahead of time and never shown
 * included. Its owner makes it again the next time it's needed, which takes a
 * fraction of a second and happens as a drag starts, before it's wanted.
 */
export function closeWhenIdle(win: BrowserWindow, ms = IDLE_CLOSE_MS): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  const arm = (): void => {
    clear()
    timer = setTimeout(() => {
      timer = null
      if (!win.isDestroyed() && !win.isVisible()) win.destroy()
    }, ms)
    timer.unref?.()
  }
  win.on('hide', arm)
  win.on('show', clear)
  win.on('closed', clear)
  if (!win.isVisible()) arm()
}
