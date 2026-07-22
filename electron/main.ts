import { app } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { ActivityStore } from './store'
import { ClaudeServer } from './providers/claude'
import { MediaProvider } from './providers/media'
import { createIslandWindow } from './window'
import { pushState, wireIpc } from './ipc'
import type { ToolRequest } from '@shared/types'

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
    onHover: (b) => win.setIgnoreMouseEvents(!b, { forward: true }),
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
