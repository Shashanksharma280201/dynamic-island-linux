// Minimal MPRIS player on the session bus for e2e tests.
const dbus = require('dbus-next')
const { Interface, ACCESS_READ } = dbus.interface
const { Variant } = dbus

class Player extends Interface {
  constructor() {
    super('org.mpris.MediaPlayer2.Player')
    this._status = 'Playing'
    this._track = 0
  }
  get PlaybackStatus() { return this._status }
  get CanControl() { return true }
  get Position() { return BigInt(30_000_000) }
  get Metadata() {
    return {
      'xesam:title': new Variant('s', ['Fake Track One', 'Fake Track Two'][this._track % 2]),
      'xesam:artist': new Variant('as', ['E2E Band']),
      'mpris:length': new Variant('x', BigInt(180_000_000)),
    }
  }
  PlayPause() {
    this._status = this._status === 'Playing' ? 'Paused' : 'Playing'
    Interface.emitPropertiesChanged(this, { PlaybackStatus: this._status }, [])
    console.log('STATUS', this._status)
  }
  Next() {
    this._track++
    Interface.emitPropertiesChanged(this, { Metadata: this.Metadata }, [])
    console.log('TRACK', this._track)
  }
  Previous() {}
}
Player.configureMembers({
  properties: {
    PlaybackStatus: { signature: 's', access: ACCESS_READ },
    CanControl: { signature: 'b', access: ACCESS_READ },
    Position: { signature: 'x', access: ACCESS_READ },
    Metadata: { signature: 'a{sv}', access: ACCESS_READ },
  },
  methods: {
    PlayPause: { inSignature: '', outSignature: '' },
    Next: { inSignature: '', outSignature: '' },
    Previous: { inSignature: '', outSignature: '' },
  },
  signals: { Seeked: { signature: 'x' } },
})

;(async () => {
  const bus = dbus.sessionBus()
  await bus.requestName('org.mpris.MediaPlayer2.fake', 0)
  bus.export('/org/mpris/MediaPlayer2', new Player())
  console.log('READY')
})()
