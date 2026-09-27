// A fake GApplication: receives ActivateAction like GNOME Shell would send it,
// and posts a GNotification with a button.
const dbus = require('dbus-next')
const { Interface } = dbus.interface
const { Variant, Message } = dbus

const APP = 'org.example.FakeApp'

class App extends Interface {
  constructor() {
    super('org.freedesktop.Application')
  }
  ActivateAction(name, params) {
    console.log('ACTION', name, JSON.stringify(params.map((p) => p.value)))
  }
  Activate() {}
  Open() {}
}
App.configureMembers({
  methods: {
    ActivateAction: { inSignature: 'sava{sv}', outSignature: '' },
    Activate: { inSignature: 'a{sv}', outSignature: '' },
    Open: { inSignature: 'assa{sv}', outSignature: '' },
  },
})

;(async () => {
  const bus = dbus.sessionBus()
  await bus.requestName(APP, 0)
  bus.export('/org/example/FakeApp', new App())
  console.log('READY')
  process.stdin.on('data', async () => {
    // No GNOME Shell here, so the call itself fails; the island sees it anyway.
    await bus
      .call(
        new Message({
          destination: 'org.gtk.Notifications',
          path: '/org/gtk/Notifications',
          interface: 'org.gtk.Notifications',
          member: 'AddNotification',
          signature: 'ssa{sv}',
          body: [
            APP,
            'build',
            {
              title: new Variant('s', 'Build finished'),
              body: new Variant('s', 'All 128 tests passed'),
              buttons: new Variant('aa{sv}', [
                {
                  label: new Variant('s', 'Open log'),
                  action: new Variant('s', 'app.open-log'),
                  target: new Variant('s', 'run-42'),
                },
              ]),
            },
          ],
        }),
      )
      .catch(() => {})
    console.log('SENT')
  })
})()
