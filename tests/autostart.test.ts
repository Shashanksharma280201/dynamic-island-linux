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
  const d = { notifications: true, whatsapp: false, mail: [] }
  expect(mergeConfig(null)).toEqual(d)
  expect(mergeConfig({ notifications: 'no', x: 1 })).toEqual(d)
  expect(mergeConfig({ notifications: false, whatsapp: true })).toEqual({
    ...d,
    notifications: false,
    whatsapp: true,
  })
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
})
