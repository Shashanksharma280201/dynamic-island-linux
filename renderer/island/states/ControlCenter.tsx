import { useEffect, useRef, useState } from 'react'
import type { SystemState, SysCmd } from '@shared/types'

function send(cmd: SysCmd) {
  window.island.sendSysCmd(cmd)
}

/**
 * Slider that owns its value while dragging (so it doesn't snap back to the
 * last polled value) and sends at most one update per ~80ms.
 */
function Slider({
  icon,
  value,
  onIcon,
  onChange,
}: {
  icon: string
  value: number
  onIcon?: () => void
  onChange: (v: number) => void
}) {
  const [local, setLocal] = useState(value)
  const dragging = useRef(false)
  const last = useRef(0)
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!dragging.current) setLocal(value)
  }, [value])
  useEffect(() => () => clearTimeout(pending.current ?? undefined), [])

  const push = (v: number) => {
    clearTimeout(pending.current ?? undefined)
    const wait = 80 - (Date.now() - last.current)
    if (wait <= 0) {
      last.current = Date.now()
      onChange(v)
    } else {
      pending.current = setTimeout(() => {
        last.current = Date.now()
        onChange(v)
      }, wait)
    }
  }

  return (
    <div className="row" style={{ gap: 10 }}>
      <button
        className="ctrl icon"
        onClick={(e) => {
          e.stopPropagation()
          onIcon?.()
        }}
        disabled={!onIcon}
      >
        {icon}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={local}
        onPointerDown={() => (dragging.current = true)}
        onPointerUp={() => (dragging.current = false)}
        onChange={(e) => {
          const v = Number(e.target.value)
          setLocal(v)
          push(v)
        }}
        onClick={(e) => e.stopPropagation()}
        style={{ flex: 1, accentColor: '#48e06f' }}
      />
      <span className="sub" style={{ width: 34, textAlign: 'right' }}>
        {Math.round(local)}%
      </span>
    </div>
  )
}

function Toggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
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

export function ControlCenter({ sys }: { sys: SystemState | null }) {
  return (
    <div className="card panel" onClick={(e) => e.stopPropagation()}>
      <div className="sub" style={{ marginBottom: 10 }}>
        Control Center
      </div>
      {!sys ? (
        <div className="sub">Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Slider
            icon={sys.muted ? '🔇' : '🔊'}
            value={sys.volume}
            onIcon={() => send({ type: 'mute' })}
            onChange={(v) => send({ type: 'volume', value: v })}
          />
          {sys.brightness !== null && (
            <Slider
              icon="☀"
              value={sys.brightness}
              onChange={(v) => send({ type: 'brightness', value: v })}
            />
          )}
          {(sys.wifi !== null || sys.bluetooth !== null) && (
            <div className="row" style={{ gap: 10 }}>
              {sys.wifi !== null && (
                <Toggle
                  label="Wi-Fi"
                  on={sys.wifi}
                  onToggle={() => send({ type: 'wifi', value: !sys.wifi })}
                />
              )}
              {sys.bluetooth !== null && (
                <Toggle
                  label="Bluetooth"
                  on={sys.bluetooth}
                  onToggle={() => send({ type: 'bluetooth', value: !sys.bluetooth })}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
