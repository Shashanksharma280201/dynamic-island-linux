import { vi } from 'vitest'
vi.mock('electron', () => ({ app: {}, ipcMain: {}, shell: {} }))
import { attachmentName } from '../electron/inbox'
import { fileSize } from '../shared/format'

test('attachment file names are safe and never empty', () => {
  const when = new Date('2026-09-29T10:20:30Z')
  expect(attachmentName('Trip plan.pdf', 'application/pdf', when)).toBe('Trip plan.pdf')
  expect(attachmentName('../../etc/passwd', 'text/plain', when)).toBe('_.._etc_passwd')
  expect(attachmentName('.hidden', 'text/plain', when)).toBe('hidden')
  expect(attachmentName(undefined, 'image/jpeg', when)).toBe('WhatsApp 2026-09-29 10.20.30.jpg')
  expect(attachmentName('', 'audio/ogg; codecs=opus', when)).toBe('WhatsApp 2026-09-29 10.20.30.ogg')
  expect(attachmentName(undefined, 'application/x-unknown', when)).toBe('WhatsApp 2026-09-29 10.20.30')
})

test('file sizes', () => {
  expect(fileSize(900)).toBe('900 B')
  expect(fileSize(52000)).toBe('51 KB')
  expect(fileSize(2.4 * 1024 * 1024)).toBe('2.4 MB')
  expect(fileSize(25 * 1024 * 1024)).toBe('25 MB')
})
