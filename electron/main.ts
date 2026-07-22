import { app, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { ActivityStore } from './store'
import { ClaudeServer } from './providers/claude'
import { MediaProvider } from './providers/media'
import { createIslandWindow } from './window'
import { Interactivity } from './interactivity'
import { pushState, wireIpc } from './ipc'
import { IPC } from '@shared/types'
import type { ToolRequest } from '@shared/types'

app.commandLine.appendSwitch('enable-transparent-visuals')

const here = dirname(fileURLToPath(import.meta.url))

const SOCK =
  process.env.DYNAMIC_ISLAND_SOCK ||
  `${process.env.XDG_RUNTIME_DIR || '/tmp'}/dynamic-island.sock`
const DEMO = process.env.DI_DEMO === '1'

async function main() {
  const store = new ActivityStore()
  const win = createIslandWindow()

  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await win.loadFile(resolve(here, '../renderer/index.html'))
  }

  store.onChange(() => pushState(win, store.list()))

  const interactivity = new Interactivity(win)
  interactivity.start()
  ipcMain.on(IPC.REPORT_RECT, (_e, rect) => interactivity.setRect(rect))

  const claude = new ClaudeServer(SOCK)
  claude.onRequest((req: ToolRequest) => {
    store.upsert({ kind: 'approval', id: req.id, priority: 10, request: req })
  })
  await claude.start().catch((e) => console.error('claude server:', e))

  const media = new MediaProvider()
  media.onChange((s) => {
    if (!s) {
      store.remove('media')
      return
    }
    store.upsert({ kind: 'media', id: 'media', priority: 1, media: s })
  })
  await media.start().catch((e) => console.error('media provider:', e))

  wireIpc({
    onDecision: (m) => {
      claude.resolve(m.id, m.decision)
      store.remove(m.id)
    },
    onMediaCmd: (c) => media.command(c),
    // Interactivity (click-through) is driven by the global-cursor loop, not
    // the renderer hover state. onHover is kept only for renderer-side expand.
    onHover: () => {},
  })

  if (DEMO) {
    store.upsert({
      kind: 'media',
      id: 'media',
      priority: 1,
      media: { title: 'Demo Song', artist: 'Demo Artist', playing: true, canControl: true },
    })
    setTimeout(
      () =>
        store.upsert({
          kind: 'approval',
          id: 'demo-approval',
          priority: 10,
          request: { id: 'demo-approval', toolName: 'Bash', inputSummary: 'rm -rf /tmp/x' },
        }),
      2000,
    )
  }
}

app.whenReady().then(main)
app.on('window-all-closed', () => {
  // keep running as a persistent widget
})
