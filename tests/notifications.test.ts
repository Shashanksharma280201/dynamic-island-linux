import { parseNotify, notifKey } from '../electron/providers/notifications'

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
