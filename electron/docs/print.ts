import { BrowserWindow, session } from 'electron'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The pages being printed right now: the only addresses the print window may load. */
const allowed = new Set<string>()
let guarded = false

/**
 * Print an HTML page to an A4 PDF. It loads in a hidden window with
 * JavaScript off and every request blocked except the page itself, so a
 * document can't reach the network or other files on the computer.
 */
export async function printHtmlToPdf(html: string): Promise<Uint8Array> {
  const ses = session.fromPartition('island-print') // in memory, never saved
  if (!guarded) {
    ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !allowed.has(d.url) && !d.url.startsWith('data:') }))
    ses.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
    guarded = true
  }
  const dir = await mkdtemp(join(tmpdir(), 'island-print-'))
  const file = join(dir, 'page.html')
  await writeFile(file, html)
  const url = pathToFileURL(file).href
  allowed.add(url)
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { session: ses, javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
  })
  try {
    await win.loadURL(url)
    // A4 with the page's own margins (@page in the print styles).
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })
    return new Uint8Array(pdf)
  } finally {
    allowed.delete(url)
    if (!win.isDestroyed()) win.destroy()
    await rm(dir, { recursive: true, force: true })
  }
}
