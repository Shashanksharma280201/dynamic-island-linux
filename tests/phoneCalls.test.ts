import { PHONE_CALLS, PHONE_TOPICS, phoneCallArgs } from '@shared/phone'

// A stand-in ipcMain: handle() registers, as Electron's does.
const registered = new Map<string, (...a: unknown[]) => unknown>()
vi.mock('electron', () => ({ ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown) => registered.set(ch, fn) } }))

const { INVOKED, PUSHED, keepHandlers, phoneCall, invokeKept } = await import('../electron/phoneCalls')
const { ipcMain } = await import('electron')

describe('what the phone may call', () => {
  test('arguments are checked against what each call takes', () => {
    expect(phoneCallArgs('claude.ask', ['fix the tests'])).toEqual({ fn: 'claude.ask', args: ['fix the tests'] })
    expect(phoneCallArgs('claude.ask', [42])).toBeNull()
    expect(phoneCallArgs('claude.ask', [])).toBeNull()
    expect(phoneCallArgs('claude.state', undefined)).toEqual({ fn: 'claude.state', args: [] })
    expect(phoneCallArgs('claude.state', ['extra'])).toBeNull()
    expect(phoneCallArgs('inbox.mailGet', ['work', 12])).toEqual({ fn: 'inbox.mailGet', args: ['work', 12] })
    expect(phoneCallArgs('inbox.mailGet', ['work', '12'])).toBeNull()
    expect(phoneCallArgs('inbox.mailGet', ['work', Infinity])).toBeNull()
    expect(phoneCallArgs('notifications.setDnd', ['yes'])).toBeNull()
    expect(phoneCallArgs('docs.remove', [['d1', 'd2']])).toEqual({ fn: 'docs.remove', args: [['d1', 'd2']] })
    expect(phoneCallArgs('docs.remove', [['d1', 2]])).toBeNull()
    expect(phoneCallArgs('system.cmd', [{ type: 'volume', value: 40 }])).toEqual({ fn: 'system.cmd', args: [{ type: 'volume', value: 40 }] })
    expect(phoneCallArgs('system.cmd', [[1]])).toBeNull()
    expect(phoneCallArgs('crm.saveContact', ['x'.repeat(10), { big: 'y'.repeat(300_000) }])).toBeNull()
  })

  test('optional arguments may be left out or null', () => {
    expect(phoneCallArgs('notes.save', [null, 'Milk, eggs'])).toEqual({ fn: 'notes.save', args: [undefined, 'Milk, eggs'] })
    expect(phoneCallArgs('notes.save', ['n1', 'Milk'])).toEqual({ fn: 'notes.save', args: ['n1', 'Milk'] })
    expect(phoneCallArgs('inbox.mailList', [])).toEqual({ fn: 'inbox.mailList', args: [] })
    expect(phoneCallArgs('crm.contacts', ['sam'])).toEqual({ fn: 'crm.contacts', args: ['sam'] })
  })

  test('only the island’s calls, nothing else', () => {
    expect(phoneCallArgs('toString', [])).toBeNull()
    expect(phoneCallArgs('__proto__', [])).toBeNull()
    expect(phoneCallArgs('settings.setAiKey', ['x', 'y'])).toBeNull()
    expect(phoneCallArgs(undefined, [])).toBeNull()
  })

  test('every call goes somewhere: the window’s own channels, or a few of main’s', () => {
    const own = Object.keys(PHONE_CALLS).filter((k) => !(k in INVOKED))
    expect(own.sort()).toEqual(['docs.toPhone', 'system.cmd', 'system.read'])
    expect(new Set(Object.values(PUSHED))).toEqual(new Set(PHONE_TOPICS))
  })
})

describe('the calls themselves', () => {
  keepHandlers()

  test('run the very handler the island’s window invokes, after the checks', async () => {
    ipcMain.handle(INVOKED['notes.save'] as string, (_e, id, body) => `saved ${id ?? 'new'}: ${body}`)
    const routes = { ...INVOKED, 'system.read': () => ({ volume: 30 }), 'system.cmd': () => true, 'docs.toPhone': () => true } as any
    expect(await phoneCall(routes, 'notes.save', [null, 'Milk'])).toEqual({ ok: true, status: 200, value: 'saved new: Milk' })
    expect(await phoneCall(routes, 'system.read', [])).toEqual({ ok: true, status: 200, value: { volume: 30 } })
    expect(registered.has(INVOKED['notes.save'] as string)).toBe(true)
    expect(await invokeKept(INVOKED['notes.save'] as string, 'n1', 'Eggs')).toBe('saved n1: Eggs')
  })

  test('say why when they can’t', async () => {
    const routes = { ...INVOKED } as any
    expect((await phoneCall(routes, 'notes.save', [5, 'x'])).status).toBe(400)
    expect((await phoneCall(null, 'notes.list', [])).status).toBe(503)
    // Not registered here (that part of the island isn't running).
    expect((await phoneCall(routes, 'crm.deals', [])).status).toBe(501)
    ipcMain.handle(INVOKED['crm.deals'] as string, () => {
      throw new Error('The CRM file is locked')
    })
    expect(await phoneCall(routes, 'crm.deals', [])).toEqual({ ok: false, status: 500, message: 'The CRM file is locked' })
  })
})
