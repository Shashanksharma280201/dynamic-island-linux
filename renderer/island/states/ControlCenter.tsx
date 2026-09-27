import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SystemState, SysCmd } from '@shared/types'
import { SpeakerIcon, SunIcon, WifiIcon, BluetoothIcon, GearIcon } from '../icons'

function send(cmd: SysCmd) {
  window.island.sendSysCmd(cmd)
}

/**
 * macOS-style slider: a thick rounded track that fills white, with the icon
 * inside. Owns its value while dragging (so it doesn't snap back to the last
 * polled value) and sends at most one update per ~80ms.
 */
function Slider({
  label,
  icon,
  value,
  onChange,
  accessory,
}: {
  label: string
  icon: ReactNode
  value: number
  onChange: (v: number) => void
  /** Shown instead of the percentage (e.g. a mute button); gets the live value. */
  accessory?: (pct: number) => ReactNode
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
    const fire = () => {
      last.current = Date.now()
      onChange(v)
    }
    if (wait <= 0) fire()
    else pending.current = setTimeout(fire, wait)
  }

  const pct = Math.round(local)
  return (
    <div className="slider-row">
      <div className="slider-label">
        <span>{label}</span>
        {accessory ? accessory(pct) : <span className="value">{pct}%</span>}
      </div>
      <div className="slider">
        {/* keep the fill wide enough to hold the icon, like macOS */}
        <div className="level" style={{ width: `max(32px, ${pct}%)` }} />
        <span className="icon">{icon}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={local}
          aria-label={label}
          onPointerDown={() => (dragging.current = true)}
          onPointerUp={() => (dragging.current = false)}
          onChange={(e) => {
            const v = Number(e.target.value)
            setLocal(v)
            push(v)
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  )
}

function Toggle({
  label,
  on,
  icon,
  onToggle,
}: {
  label: string
  on: boolean
  icon: ReactNode
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
      <span className="circle">{icon}</span>
      <span>
        <div className="label">{label}</div>
        <div className="state">{on ? 'On' : 'Off'}</div>
      </span>
    </button>
  )
}

export function ControlCenter({ sys }: { sys: SystemState | null }) {
  const hasRadios = sys && (sys.wifi !== null || sys.bluetooth !== null)
  return (
    <div className="cc" onClick={(e) => e.stopPropagation()}>
      {!sys ? (
        <div className="module caption">Loading…</div>
      ) : (
        <>
          {hasRadios && (
            <div className="module toggles">
              {sys.wifi !== null && (
                <Toggle
                  label="Wi-Fi"
                  on={sys.wifi}
                  icon={<WifiIcon />}
                  onToggle={() => send({ type: 'wifi', value: !sys.wifi })}
                />
              )}
              {sys.bluetooth !== null && (
                <Toggle
                  label="Bluetooth"
                  on={sys.bluetooth}
                  icon={<BluetoothIcon />}
                  onToggle={() => send({ type: 'bluetooth', value: !sys.bluetooth })}
                />
              )}
            </div>
          )}
          {sys.brightness !== null && (
            <div className="module">
              <Slider
                label="Display"
                icon={<SunIcon />}
                value={sys.brightness}
                onChange={(v) => send({ type: 'brightness', value: v })}
              />
            </div>
          )}
          <div className="module">
            <Slider
              label="Sound"
              icon={<SpeakerIcon muted={sys.muted} />}
              value={sys.muted ? 0 : sys.volume}
              accessory={(pct) => (
                <button
                  className={`mute${sys.muted ? ' on' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    send({ type: 'mute' })
                  }}
                >
                  {sys.muted ? 'Muted' : `${pct}%`}
                </button>
              )}
              onChange={(v) => send({ type: 'volume', value: v })}
            />
          </div>
        </>
      )}
      <div className="panel-foot">
        <button
          className="plain muted row"
          style={{ gap: 6 }}
          onClick={(e) => {
            e.stopPropagation()
            window.island.openSettings()
          }}
        >
          <GearIcon /> Settings
        </button>
      </div>
    </div>
  )
}
