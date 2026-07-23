import type { SystemState, SysCmd } from '@shared/types'

function send(cmd: SysCmd) {
  ;(window as any).island.sendSysCmd(cmd)
}

function Slider({
  icon,
  value,
  onChange,
}: {
  icon: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="row" style={{ gap: 10 }}>
      <span style={{ width: 18, textAlign: 'center' }}>{icon}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onClick={(e) => e.stopPropagation()}
        style={{ flex: 1, accentColor: '#48e06f' }}
      />
      <span className="sub" style={{ width: 34, textAlign: 'right' }}>
        {Math.round(value)}%
      </span>
    </div>
  )
}

function Toggle({
  label,
  on,
  onToggle,
}: {
  label: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      className="toggle"
      data-on={on ? 'yes' : 'no'}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
    >
      {label}
      <span className="dot" />
    </button>
  )
}

export function ControlCenter({ sys }: { sys: SystemState }) {
  return (
    <div style={{ padding: '14px 16px', width: 300 }} onClick={(e) => e.stopPropagation()}>
      <div className="sub" style={{ marginBottom: 10 }}>
        Control Center
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Slider
          icon={sys.muted ? '🔇' : '🔊'}
          value={sys.volume}
          onChange={(v) => send({ type: 'volume', value: v })}
        />
        {sys.brightness !== null && (
          <Slider
            icon="☀"
            value={sys.brightness}
            onChange={(v) => send({ type: 'brightness', value: v })}
          />
        )}
        <div className="row" style={{ gap: 10 }}>
          <Toggle
            label="Wi-Fi"
            on={sys.wifi}
            onToggle={() => send({ type: 'wifi', value: !sys.wifi })}
          />
          <Toggle
            label="Bluetooth"
            on={sys.bluetooth}
            onToggle={() => send({ type: 'bluetooth', value: !sys.bluetooth })}
          />
        </div>
      </div>
    </div>
  )
}
