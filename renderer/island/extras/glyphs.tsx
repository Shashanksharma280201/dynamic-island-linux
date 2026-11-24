import type { ReactNode } from 'react'
import type { DeviceKind, WxKind } from '@shared/extras'

/** Small drawn icons for the Dashboard's tiles, the notch's notices and the shelf: one weight, round ends. */
const line = (d: ReactNode, sw = 1.9) =>
  function Icon({ size = 15 }: { size?: number }) {
    return (
      <svg className="gl" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {d}
      </svg>
    )
  }

export const NoteGlyph = line(
  <>
    <path d="M9 17.5V5.5l11-2v12" />
    <circle cx="6.5" cy="17.5" r="2.5" />
    <circle cx="17.5" cy="15.5" r="2.5" />
  </>,
)
export const TimerGlyph = line(
  <>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.5v4l2.5 1.5M9.5 3h5" />
  </>,
)
export const MicGlyph = line(
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
  </>,
)
export const ChipGlyph = line(
  <>
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
    <path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3" />
  </>,
)
export const DayGlyph = line(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
  </>,
)
export const CalendarLine = line(
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 9.8h17M8 3v4M16 3v4" />
  </>,
)
export const AsteriskGlyph = line(<path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18" />, 2.1)
export const CloudSunGlyph = line(
  <>
    <path d="M12 3v1.6M5.6 5.6l1.1 1.1M3 12h1.6M18.4 5.6l-1.1 1.1" />
    <path d="M8.2 10.3a4 4 0 0 1 7.3-1.8" />
    <path d="M8 20h9.5a3.500 3.500 0 0 0 .4-7 5 5 0 0 0-9.600-1A4 4 0 0 0 8 20z" />
  </>,
)
export const BluetoothGlyph = line(<path d="m6.5 7 11 10-5.500 5V2l5.500 5-11 10" />)
export const HourglassGlyph = line(<path d="M7 3h10M7 21h10M8 3v3.500c0 2 4 3.500 4 5.500s-4 3.500-4 5.500V21M16 3v3.500c0 2-4 3.500-4 5.500s4 3.500 4 5.500V21" />)
export const ChecklistGlyph = line(
  <>
    <path d="M8.500 6.500h11M8.500 12h11M8.500 17.500h11" />
    <path d="m3.500 6.300 1 1 1.800-2M3.500 11.800l1 1 1.800-2M3.500 17.300l1 1 1.800-2" />
  </>,
)
export const TrayGlyph = line(
  <>
    <path d="M4 13.500 6.300 5.500a2 2 0 0 1 1.900-1.500h7.600a2 2 0 0 1 1.900 1.500L20 13.500" />
    <path d="M4 13.500h4.500a3.500 3.500 0 0 0 7 0H20v4.500a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
  </>,
)
export const TranslateGlyph = line(
  <>
    <path d="M3.500 6h9M8 4v2M10.500 6c-.6 3.200-3 6-6.500 7.500M6 9.500c1 1.800 2.800 3.300 5 4" />
    <path d="m12.500 20 4-9.500 4 9.500M14 16.800h5" />
  </>,
)
export const HeadphonesGlyph = line(
  <>
    <path d="M4.500 14.500v-2.500a7.500 7.500 0 0 1 15 0v2.500" />
    <rect x="3.500" y="13.500" width="4" height="6.500" rx="1.800" />
    <rect x="16.500" y="13.500" width="4" height="6.500" rx="1.800" />
  </>,
)
export const MouseGlyph = line(
  <>
    <rect x="7" y="3" width="10" height="18" rx="5" />
    <path d="M12 7v3" />
  </>,
)
export const KeyboardGlyph = line(
  <>
    <rect x="2.500" y="6.500" width="19" height="11" rx="2.500" />
    <path d="M6.500 10.500h.01M10 10.500h.01M13.500 10.500h.01M17 10.500h.01M8 14h8" />
  </>,
)
export const PhoneGlyph = line(
  <>
    <rect x="7" y="2.500" width="10" height="19" rx="2.800" />
    <path d="M11 18.500h2" />
  </>,
)
export const SpeakerBoxGlyph = line(
  <>
    <rect x="6" y="2.500" width="12" height="19" rx="3" />
    <circle cx="12" cy="14.500" r="3" />
    <path d="M12 7h.01" />
  </>,
)
export const GamepadGlyph = line(
  <>
    <rect x="2.500" y="7" width="19" height="11" rx="5.500" />
    <path d="M7.500 10.500v4M5.500 12.500h4M15.500 11h.01M18 13.500h.01" />
  </>,
)
export const WatchGlyph = line(
  <>
    <rect x="7" y="6.500" width="10" height="11" rx="3" />
    <path d="M9 6.500 9.700 3h4.600l.7 3.500M9 17.500l.7 3.500h4.600l.7-3.500" />
  </>,
)
export const DocGlyph = line(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </>,
)
export const FolderGlyph = line(<path d="M3.500 7.500a2 2 0 0 1 2-2h4l2 2.200h7a2 2 0 0 1 2 2v7.800a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />)
export const SwapGlyph = line(<path d="M4 8.500h14M14.500 5l3.500 3.500-3.500 3.500M20 15.500H6M9.500 12 6 15.500 9.500 19" />)
export const PlusGlyph = line(<path d="M12 5.500v13M5.500 12h13" />, 2)
export const TickGlyph = line(<path d="m6 12.500 4 4 8-9" />, 2.6)
export const CrossGlyph = line(<path d="M6.500 6.500l11 11M17.500 6.500l-11 11" />, 2.2)
export const ChevGlyph = line(<path d="m7 10 5 5 5-5" />, 2.2)
export const PromptGlyph = line(<path d="m6 8.500 4 3.500-4 3.500M12.500 16h5.500" />, 2.2)
export const SparkGlyph = line(
  <>
    <path d="M10.500 3.500l1.700 4.800 4.800 1.700-4.800 1.700-1.700 4.800-1.700-4.800L4 10l4.800-1.700z" />
    <path d="M18 14.500l.8 2.200 2.200.8-2.200.8-.8 2.200-.8-2.200-2.200-.8 2.200-.8z" />
  </>,
)
export const EyeGlyph = line(
  <>
    <path d="M2.500 12s3.500-6.500 9.500-6.500 9.500 6.500 9.500 6.500-3.500 6.500-9.500 6.500S2.500 12 2.500 12z" />
    <circle cx="12" cy="12" r="2.800" />
  </>,
)

/** An arrow, as the pointer in Cursor. */
export function CursorGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg className="gl" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M5 3.500 18.500 10l-5.600 1.900L11 17.500z" />
    </svg>
  )
}

/** The volume, with waves; or crossed out when it's muted. */
export function VolumeGlyph({ muted = false, size = 18 }: { muted?: boolean; size?: number }) {
  return (
    <svg className="gl" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9.500h3.200L12 5.500v13l-4.800-4H4z" fill="currentColor" />
      {muted ? (
        <path d="m16 9.500 5 5m0-5-5 5" />
      ) : (
        <>
          <path d="M15.500 9a4.200 4.200 0 0 1 0 6" />
          <path d="M18.300 6.500a8 8 0 0 1 0 11" />
        </>
      )}
    </svg>
  )
}

/** The screen's brightness: a sun. */
export function BrightnessGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg className="gl" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="3.600" fill="currentColor" />
      <path d="M12 2.800v2M12 19.200v2M2.800 12h2M19.200 12h2M5.500 5.500l1.400 1.400M17.100 17.100l1.400 1.400M5.500 18.500l1.400-1.400M17.100 6.900l1.400-1.400" />
    </svg>
  )
}

const DEVICE: Record<DeviceKind, (p: { size?: number }) => ReactNode> = {
  headphones: HeadphonesGlyph,
  speaker: SpeakerBoxGlyph,
  mouse: MouseGlyph,
  keyboard: KeyboardGlyph,
  phone: PhoneGlyph,
  controller: GamepadGlyph,
  watch: WatchGlyph,
  other: BluetoothGlyph,
}
export function DeviceGlyph({ kind, size = 15 }: { kind: DeviceKind; size?: number }) {
  const G = DEVICE[kind] ?? BluetoothGlyph
  return <G size={size} />
}

const SUN = '#ffd60a'
const CLOUD = 'M8 20.500h9.800a3.700 3.700 0 0 0 .5-7.400 5.300 5.300 0 0 0-10.200-1A4.200 4.200 0 0 0 8 20.500z'

/** The weather, in colour (as the system's symbols are): a yellow sun, a pale cloud, blue rain. */
export function Wx({ kind, size = 18 }: { kind: WxKind; size?: number }) {
  const cloud = (dy = 0) => <path d={CLOUD} transform={dy ? `translate(0 ${dy})` : undefined} fill="var(--wx-cloud)" stroke="var(--wx-cloud-edge)" strokeWidth="0.6" />
  const smallSun = (
    <>
      <circle cx="9" cy="9" r="4.200" fill={SUN} />
      <g stroke={SUN} strokeWidth="1.700" strokeLinecap="round">
        <path d="M9 1.800v1.600M2 9h1.600M3.900 3.900l1.100 1.100M14.100 3.900 13 5M3.900 14.100 5 13" />
      </g>
    </>
  )
  const moon = <path d="M15.500 3.500a7.500 7.500 0 1 0 5 12.800A8.500 8.500 0 0 1 15.500 3.500z" fill={SUN} />
  let body: ReactNode
  switch (kind) {
    case 'sun':
      body = (
        <>
          <circle cx="12" cy="12" r="5" fill={SUN} />
          <g stroke={SUN} strokeWidth="1.800" strokeLinecap="round">
            <path d="M12 2.500v2M12 19.500v2M2.500 12h2M19.500 12h2M5.300 5.300l1.400 1.400M17.300 17.300l1.400 1.400M5.300 18.700l1.400-1.400M17.300 6.700l1.400-1.400" />
          </g>
        </>
      )
      break
    case 'moon':
      body = moon
      break
    case 'partly':
      body = (
        <>
          {smallSun}
          {cloud()}
        </>
      )
      break
    case 'partly-night':
      body = (
        <>
          <path d="M11.500 2.500a5.500 5.500 0 1 0 4.200 9.300A6.300 6.300 0 0 1 11.500 2.500z" fill={SUN} />
          {cloud()}
        </>
      )
      break
    case 'rain':
      body = (
        <>
          {cloud(-4)}
          <g stroke="#64d2ff" strokeWidth="1.800" strokeLinecap="round">
            <path d="M9 19l-.9 2.600M13 19l-.9 2.600M17 19l-.9 2.600" />
          </g>
        </>
      )
      break
    case 'snow':
      body = (
        <>
          {cloud(-4)}
          <g fill="var(--wx-snow)">
            <circle cx="8.500" cy="20.300" r="1.150" />
            <circle cx="12.700" cy="21" r="1.150" />
            <circle cx="16.900" cy="20.300" r="1.150" />
          </g>
        </>
      )
      break
    case 'storm':
      body = (
        <>
          {cloud(-4)}
          <path d="M13.200 15.800 10.300 20h2.500l-1.100 3.200 3.900-4.700H13l1.200-2.700z" fill={SUN} />
        </>
      )
      break
    case 'fog':
      body = (
        <>
          {cloud(-4)}
          <g stroke="var(--wx-fog)" strokeWidth="1.700" strokeLinecap="round">
            <path d="M6 19.500h12M8 22.300h8" />
          </g>
        </>
      )
      break
    default:
      body = cloud()
  }
  return (
    <svg className="gl wx" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {body}
    </svg>
  )
}

/** A battery with its level drawn in: red when low, green while charging. */
export function BatteryGlyph({ pct, charging = false }: { pct: number; charging?: boolean }) {
  return (
    <svg className="gl" width="22" height="12" viewBox="0 0 22 12" aria-hidden>
      <rect x="0.75" y="0.75" width="17.5" height="10.5" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.2" />
      <rect x="19.6" y="3.8" width="1.8" height="4.4" rx="0.9" fill="currentColor" fillOpacity="0.45" />
      <rect x="2.4" y="2.4" width={Math.max(1.5, (14.2 * pct) / 100)} height="7.2" rx="1.6" className={`level${pct <= 20 && !charging ? ' low' : charging ? ' charging' : ''}`} />
    </svg>
  )
}

/** A ring that fills (a countdown, a share): `fraction` of it lit. */
export function Ring({ size, stroke, fraction, tone, children }: { size: number; stroke: number; fraction: number; tone?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const f = Math.max(0, Math.min(1, fraction))
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(var(--ink),0.13)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone ?? 'var(--blue)'} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${f * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      {children !== undefined && <span className="ring-in">{children}</span>}
    </span>
  )
}
