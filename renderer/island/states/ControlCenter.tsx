import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SystemState, SysCmd } from '@shared/types'
import { SpeakerIcon, SunIcon, WifiIcon, BluetoothIcon, GearIcon, MoonIcon, KeyboardIcon } from '../icons'
import { SHORTCUT_INFO, shortcutLabel, type ShortcutId } from '@shared/shortcuts'
import { useShortcuts } from '../useShortcuts'

const MAC = navigator.userAgent.includes('Macintosh')

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

/** Every shortcut with its keys as they're set now, plus the island's gestures. */
function ShortcutSheet() {
  const keys = useShortcuts()
  const rows: [string, string][] = [
    ...(['panel', 'voice', 'dictate', 'allow', 'deny', 'always'] as ShortcutId[]).map((id): [string, string] => [SHORTCUT_INFO[id].label, shortcutLabel(keys[id], MAC)]),
    ['Move the island', 'Drag it'],
    ['Peek at what’s going on', 'Rest the pointer on it'],
  ]
  return (
    <div className="module shortcut-sheet" role="list" aria-label="Keyboard shortcuts">
      {rows.map(([what, how]) => (
        <div className="sheet-row" role="listitem" key={what}>
          <span className="ellipsis">{what}</span>
          {how.includes(' ') && !/[+⌃⌥⌘⇧]/.test(how) ? <span className="sheet-how">{how}</span> : <kbd className="key">{how}</kbd>}
        </div>
      ))}
      <button className="plain sheet-change" onClick={() => window.island.openSettings('shortcuts')}>
        Change keys…
      </button>
    </div>
  )
}

/** A picture frame: the wallpaper tile. */
const PhotoIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="10.6" cy="6.1" r="1.25" fill="currentColor" />
    <path d="M2.6 12.2 6.2 8.4l2.4 2.5 1.4-1.4 3.3 2.9" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
)

/**
 * Control Center, laid out like macOS: Wi-Fi and Bluetooth in one module,
 * Focus (Do Not Disturb) and Wallpaper as tiles beside it, then the sliders.
 */
export function ControlCenter({ sys, dnd = false }: { sys: SystemState | null; dnd?: boolean }) {
  const [sheet, setSheet] = useState(false)
  const connect = !!sys && (sys.wifi !== null || sys.bluetooth !== null)
  return (
    <div className="cc" onClick={(e) => e.stopPropagation()}>
      {!sys ? (
        <div className="module caption">Loading…</div>
      ) : (
        <>
          <div className={`cc-grid${connect ? ' has-connect' : ''}`}>
            {connect && (
              <div className="module toggles cc-connect">
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
            <div className="module cc-tile">
              <Toggle label="Do Not Disturb" on={dnd} icon={<MoonIcon />} onToggle={() => void window.island.notifications.setDnd(!dnd)} />
            </div>
            <button
              className="module cc-tile cc-wall"
              onClick={(e) => {
                e.stopPropagation()
                window.island.openSettings('wallpaper')
              }}
            >
              <span className="circle">
                <PhotoIcon />
              </span>
              <span>
                <div className="label">Wallpaper</div>
                <div className="state">Change…</div>
              </span>
            </button>
          </div>
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
      {sheet && <ShortcutSheet />}
      <div className="panel-foot">
        <button className={`plain muted row${sheet ? ' on' : ''}`} aria-expanded={sheet} onClick={() => setSheet(!sheet)}>
          <KeyboardIcon /> Shortcuts
        </button>
        <span className="spacer" />
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
