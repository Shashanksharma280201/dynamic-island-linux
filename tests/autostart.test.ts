import { vi } from 'vitest'
vi.mock('electron', () => ({ app: {} }))
import { desktopEntry, quoteExecArg, autostartFile } from '../electron/autostart'
import { mergeConfig, parseMailAccount } from '../electron/config'

test('quoteExecArg quotes only when needed', () => {
  expect(quoteExecArg('/opt/app/island')).toBe('/opt/app/island')
  expect(quoteExecArg('/home/a b/Island.AppImage')).toBe('"/home/a b/Island.AppImage"')
  expect(quoteExecArg('/x/$HOME')).toBe('"/x/\\$HOME"')
})

test('desktopEntry is a valid autostart entry', () => {
  const e = desktopEntry(['/usr/bin/electron', '/home/a b/app'])
  expect(e).toContain('[Desktop Entry]')
  expect(e).toContain('Exec=/usr/bin/electron "/home/a b/app"')
  expect(e).toContain('X-GNOME-Autostart-enabled=true')
})

test('autostartFile honours XDG_CONFIG_HOME', () => {
  expect(autostartFile({ XDG_CONFIG_HOME: '/cfg' })).toBe(
    '/cfg/autostart/dynamic-island-linux.desktop',
  )
})

test('mergeConfig ignores unknown and mistyped keys', () => {
  const d = {
    notifications: true,
    dnd: false,
    whatsapp: false,
    mail: [],
    dock: { side: 'right', y: 0.3 },
    appearance: 'glass',
    shortcut: true,
    keys: { panel: 'CommandOrControl+I', voice: 'Control+Alt+Space', dictate: 'Control+Alt+D', allow: 'Control+Alt+Y', deny: 'Control+Alt+N', always: 'Control+Alt+A' },
    openOnHover: false,
    companion: { on: false, at: null },
    dictation: true,
    display: 'primary',
    services: Object.fromEntries(['github', 'vercel', 'stripe', 'resend', 'notion', 'calcom', 'n8n'].map((id) => [id, { on: false, url: '', secret: '' }])),
    connected: { on: false, url: '', secret: '' },
    recap: true,
    frosted: true,
    sounds: false,
    greeted: '',
    claude: { cwd: '', permissionMode: 'default', voiceShortcut: true, sttModel: 'base', binary: '' },
    spotify: { clientId: '' },
    character: { id: 'orbit', name: 'Orbit', outfit: 'auto', color: null },
    ai: { provider: 'claude-code', models: {}, baseUrls: {}, keys: {} },
    packages: { disabled: [] },
    drag: { on: true, when: 'either', dwellMs: 420, saveTo: 'next' },
  }
  expect(mergeConfig(null)).toEqual(d)
  expect(mergeConfig({ notifications: 'no', x: 1 })).toEqual(d)
  expect(mergeConfig({ notifications: false, whatsapp: true })).toEqual({
    ...d,
    notifications: false,
    whatsapp: true,
  })
  expect(
    mergeConfig({ claude: { cwd: '/p', permissionMode: 'yolo', sttModel: 'tiny'  } }).claude,
  ).toEqual({ ...d.claude, cwd: '/p', sttModel: 'tiny' })
  expect(mergeConfig({ drag: { on: false, when: 'sometimes', dwellMs: 5000, saveTo: 'downloads' } }).drag).toEqual({ on: false, when: 'either', dwellMs: 900, saveTo: 'downloads' })
})

const ACC = {
  id: 'a1',
  user: 'me@gmail.com',
  imap: { host: 'imap.gmail.com', port: 993, secure: true },
  smtp: { host: 'smtp.gmail.com', port: '465', secure: true },
  secret: 'enc:xyz',
}

test('parseMailAccount validates servers and defaults the label', () => {
  expect(parseMailAccount(ACC)).toEqual({
    ...ACC,
    label: 'me@gmail.com',
    name: undefined,
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  })
  expect(parseMailAccount({ ...ACC, imap: { host: 'x', port: 99999 } })).toBeNull()
  expect(parseMailAccount({ ...ACC, secret: undefined })).toBeNull()
  expect(mergeConfig({ mail: [ACC, { bogus: 1 }] }).mail).toHaveLength(1)
  expect(mergeConfig({ dock: { side: 'left', y: 0.8 } }).dock).toEqual({ side: 'left', y: 0.8 })
  expect(mergeConfig({ appearance: 'solid' }).appearance).toBe('solid')
  expect(mergeConfig({ appearance: 'neon' }).appearance).toBe('glass')
})
