import { useEffect, useState } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import type { SystemState } from '../../../shared/types'
import type { DropLink, Live } from '../link'
import { NowPlaying } from './IslandScreen'
import { Card, Empty, ErrorLine, Page, Slider, s as k, useAction, useCall } from './kit'
import { C } from './theme'

/** The island's Control Center from your phone: volume, brightness, mute, Wi-Fi, Bluetooth, Do Not Disturb. */
export function ControlsScreen({ link, live, top, onBack }: { link: DropLink; live: Live; top: number; onBack: () => void }) {
  // The computer's levels, looked at again every few seconds while this is open.
  const { data, error, setData } = useCall<SystemState>(link, 'system.read', [], { poll: 2500 })
  const act = useAction(link)
  const [dnd, setDnd] = useState(!!live.view?.dnd)
  useEffect(() => setDnd(!!live.view?.dnd), [live.view?.dnd])
  const cmd = (c: Record<string, unknown>, patch: Partial<SystemState>) => {
    if (data) setData({ ...data, ...patch })
    void act.run('cmd', 'system.cmd', c)
  }
  return (
    <Page title="Controls" sub={link.pairing.name} top={top} onBack={onBack}>
      {live.view?.media && <NowPlaying media={live.view.media} link={link} />}
      {!data && !error && <Empty busy title="Reading the computer’s controls…" />}
      {!!error && !data && <Empty title="Can’t read them" text={error} />}
      {data && (
        <Card style={{ gap: 18 }}>
          <Slider label={data.muted ? 'Volume (muted)' : 'Volume'} value={data.volume} color={data.muted ? C.text3 : '#fff'} onChange={(v) => cmd({ type: 'volume', value: v }, { volume: v })} />
          {data.brightness !== null && <Slider label="Brightness" value={data.brightness} color={C.orange} onChange={(v) => cmd({ type: 'brightness', value: v }, { brightness: v })} />}
        </Card>
      )}
      {data && (
        <Card>
          <Toggle title="Mute" value={data.muted} onChange={() => cmd({ type: 'mute' }, { muted: !data.muted })} />
          {data.wifi !== null && <Toggle title="Wi-Fi" value={data.wifi} onChange={(on) => cmd({ type: 'wifi', value: on }, { wifi: on })} />}
          {data.bluetooth !== null && <Toggle title="Bluetooth" value={data.bluetooth} onChange={(on) => cmd({ type: 'bluetooth', value: on }, { bluetooth: on })} />}
          <Toggle
            title="Do Not Disturb"
            last
            value={dnd}
            color={C.violet}
            onChange={(on) => {
              setDnd(on)
              void act.run('dnd', 'notifications.setDnd', on)
            }}
          />
        </Card>
      )}
      <ErrorLine message={act.error} />
    </Page>
  )
}

function Toggle({ title, value, onChange, last, color = C.green }: { title: string; value: boolean; onChange: (on: boolean) => void; last?: boolean; color?: string }) {
  return (
    <View style={[st.toggle, !last && k.rowLine]}>
      <Text style={[k.rowTitle, { flex: 1 }]}>{title}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: color, false: 'rgba(255,255,255,0.15)' }} thumbColor="#fff" />
    </View>
  )
}

const st = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
})
