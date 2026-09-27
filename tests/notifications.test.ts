import {
  parseNotify,
  notifKey,
  displayMs,
  Deduper,
  iconCandidates,
} from '../electron/providers/notifications'

test('parseNotify pulls app/summary/body/icon from Notify args', () => {
  // Notify signature: app_name, replaces_id, app_icon, summary, body, actions, hints, expire
  const body = ['WhatsApp', 0, 'whatsapp-icon', 'Alice', 'Hey there', [], {}, -1]
  expect(parseNotify(body)).toEqual({
    app: 'WhatsApp',
    summary: 'Alice',
    body: 'Hey there',
    icon: 'whatsapp-icon',
  })
})

test('parseNotify reads urgency and image-path hints', () => {
  const hints = { urgency: { signature: 'y', value: 2 }, 'image-path': { value: '/i.png' } }
  const n = parseNotify(['App', 0, '', 'S', 'B', [], hints, -1])
  expect(n.urgency).toBe('critical')
  expect(n.icon).toBe('/i.png')
  expect(displayMs(n)).toBe(10000)
  expect(displayMs({ ...n, urgency: 'low' })).toBe(3000)
})

test('parseNotify is defensive about missing/empty fields', () => {
  const n = parseNotify(['App'])
  expect(n.app).toBe('App')
  expect(n.summary).toBe('')
  expect(n.body).toBe('')
  expect(n.icon).toBeUndefined()
})

test('notifKey dedupes identical notifications', () => {
  const a = { app: 'X', summary: 's', body: 'b', icon: undefined }
  const b = { app: 'X', summary: 's', body: 'b', icon: 'i' }
  expect(notifKey(a)).toBe(notifKey(b))
})

test('Deduper drops repeats within the window and prunes old keys', () => {
  let t = 0
  const d = new Deduper(1000, () => t)
  expect(d.accept('a')).toBe(true)
  expect(d.accept('a')).toBe(false)
  t = 1500
  expect(d.accept('b')).toBe(true)
  expect(d.size).toBe(1) // 'a' pruned
  expect(d.accept('a')).toBe(true)
})

test('iconCandidates handles paths, URIs and theme names', () => {
  expect(iconCandidates('/x/y.png')).toEqual(['/x/y.png'])
  expect(iconCandidates('file:///x/y.png')).toEqual(['/x/y.png'])
  expect(iconCandidates('../evil')).toEqual([])
  const c = iconCandidates('firefox', '/home/u')
  expect(c).toContain('/usr/share/icons/hicolor/48x48/apps/firefox.png')
  expect(c).toContain('/home/u/.local/share/icons/hicolor/scalable/apps/firefox.svg')
})
