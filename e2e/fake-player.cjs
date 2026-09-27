// Minimal MPRIS player on the session bus for e2e tests.
const dbus = require('dbus-next')
const { Interface, ACCESS_READ, ACCESS_READWRITE } = dbus.interface
const { Variant } = dbus

class Player extends Interface {
  constructor() {
    super('org.mpris.MediaPlayer2.Player')
    this._status = 'Playing'
    this._track = 0
    this._shuffle = false
    this._loop = 'None'
  }
  get Shuffle() { return this._shuffle }
  set Shuffle(v) {
    this._shuffle = v
    Interface.emitPropertiesChanged(this, { Shuffle: v }, [])
    console.log('SHUFFLE', v)
  }
  get LoopStatus() { return this._loop }
  set LoopStatus(v) {
    this._loop = v
    Interface.emitPropertiesChanged(this, { LoopStatus: v }, [])
    console.log('LOOP', v)
  }
  get CanSeek() { return true }
  SetPosition(trackId, pos) {
    console.log('SEEK', trackId, String(pos))
  }
  get PlaybackStatus() { return this._status }
  get CanControl() { return true }
  get Position() { return BigInt(30_000_000) }
  get Metadata() {
    return {
      'xesam:title': new Variant('s', ['Fake Track One', 'Fake Track Two'][this._track % 2]),
      'xesam:artist': new Variant('as', ['E2E Band']),
      'mpris:length': new Variant('x', BigInt(180_000_000)),
      'mpris:trackid': new Variant('o', `/org/fake/track${this._track}`),
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
    CanSeek: { signature: 'b', access: ACCESS_READ },
    Shuffle: { signature: 'b', access: ACCESS_READWRITE },
    LoopStatus: { signature: 's', access: ACCESS_READWRITE },
    Position: { signature: 'x', access: ACCESS_READ },
    Metadata: { signature: 'a{sv}', access: ACCESS_READ },
  },
  methods: {
    PlayPause: { inSignature: '', outSignature: '' },
    Next: { inSignature: '', outSignature: '' },
    Previous: { inSignature: '', outSignature: '' },
    SetPosition: { inSignature: 'ox', outSignature: '' },
  },
  signals: { Seeked: { signature: 'x' } },
})

;(async () => {
  const bus = dbus.sessionBus()
  await bus.requestName('org.mpris.MediaPlayer2.fake', 0)
  bus.export('/org/mpris/MediaPlayer2', new Player())
  console.log('READY')
})()
