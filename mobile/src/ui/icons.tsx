import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { useTheme } from './theme'

/** The app's line icons (24 × 24, 1.9 px strokes), in one colour. */
export type IconName =
  | 'back'
  | 'chevron'
  | 'check'
  | 'close'
  | 'plus'
  | 'refresh'
  | 'wifi'
  | 'globe'
  | 'link'
  | 'unlink'
  | 'laptop'
  | 'phone'
  | 'folder'
  | 'file'
  | 'photo'
  | 'gear'
  | 'sun'
  | 'moon'
  | 'auto'
  | 'bolt'
  | 'bell'
  | 'shield'
  | 'pulse'
  | 'qr'
  | 'send'
  | 'download'
  | 'play'
  | 'pause'
  | 'info'
  | 'mic'
  | 'terminal'
  | 'sparkle'
  | 'trend'
  | 'music'
  | 'calendar'
  | 'note'
  | 'people'
  | 'doc'
  | 'sliders'
  | 'layers'
  | 'question'
  | 'list'
  | 'alert'

const LINES: Record<IconName, (c: string) => React.ReactNode> = {
  back: (c) => <Path d="M15 5l-7 7 7 7" stroke={c} />,
  chevron: (c) => <Path d="M9 5l7 7-7 7" stroke={c} />,
  check: (c) => <Path d="M5 12.5l4.5 4.5L19 7" stroke={c} />,
  close: (c) => <Path d="M6 6l12 12M18 6L6 18" stroke={c} />,
  plus: (c) => <Path d="M12 5v14M5 12h14" stroke={c} />,
  refresh: (c) => <Path d="M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4" stroke={c} />,
  wifi: (c) => (
    <>
      <Path d="M3 9.5a13 13 0 0 1 18 0M6 13a8 8 0 0 1 12 0M9 16.5a3.5 3.5 0 0 1 6 0" stroke={c} />
      <Circle cx={12} cy={19.5} r={1.2} fill={c} />
    </>
  ),
  globe: (c) => (
    <>
      <Circle cx={12} cy={12} r={8.5} stroke={c} />
      <Path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5s1.2-6.1 3.8-8.5z" stroke={c} />
    </>
  ),
  link: (c) => <Path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" stroke={c} />,
  unlink: (c) => <Path d="M14.5 6.4l1-1a4 4 0 0 1 5.66 5.66l-1 1M9.5 17.6l-1 1a4 4 0 0 1-5.66-5.66l1-1M8 3v2.5M3 8h2.5M16 21v-2.5M21 16h-2.5" stroke={c} />,
  laptop: (c) => (
    <>
      <Rect x={4.5} y={5} width={15} height={10} rx={1.6} stroke={c} />
      <Path d="M2.5 18.5h19" stroke={c} />
    </>
  ),
  phone: (c) => (
    <>
      <Rect x={7} y={2.8} width={10} height={18.4} rx={2.4} stroke={c} />
      <Path d="M10.5 18h3" stroke={c} />
    </>
  ),
  folder: (c) => <Path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" stroke={c} />,
  file: (c) => <Path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5" stroke={c} />,
  photo: (c) => (
    <>
      <Rect x={3.5} y={5} width={17} height={14} rx={2.2} stroke={c} />
      <Circle cx={9} cy={10} r={1.6} stroke={c} />
      <Path d="M4 17l5-4.5 3.5 3 3-2.5L20 16.5" stroke={c} />
    </>
  ),
  gear: (c) => (
    <>
      <Circle cx={12} cy={12} r={3} stroke={c} />
      <Path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7" stroke={c} />
    </>
  ),
  sun: (c) => (
    <>
      <Circle cx={12} cy={12} r={4} stroke={c} />
      <Path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" stroke={c} />
    </>
  ),
  moon: (c) => <Path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" stroke={c} />,
  mic: (c) => (
    <>
      <Rect x={9} y={3.5} width={6} height={11} rx={3} stroke={c} />
      <Path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5M9 20.5h6" stroke={c} />
    </>
  ),
  auto: (c) => (
    <>
      <Circle cx={12} cy={12} r={8.5} stroke={c} />
      <Path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill={c} />
    </>
  ),
  bolt: (c) => <Path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z" stroke={c} />,
  bell: (c) => <Path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" stroke={c} />,
  shield: (c) => <Path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6zM8.5 12l2.5 2.5 4.5-5" stroke={c} />,
  pulse: (c) => <Path d="M3 12h4l2.5-6 4 12 2.5-6h5" stroke={c} />,
  qr: (c) => (
    <>
      <Rect x={4} y={4} width={6} height={6} rx={1} stroke={c} />
      <Rect x={14} y={4} width={6} height={6} rx={1} stroke={c} />
      <Rect x={4} y={14} width={6} height={6} rx={1} stroke={c} />
      <Path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 20h1M20 14v1" stroke={c} />
    </>
  ),
  send: (c) => <Path d="M4 12l16-8-6 16-2.5-6.5z" stroke={c} />,
  download: (c) => <Path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" stroke={c} />,
  play: (c) => <Path d="M8 5.5v13l10.5-6.5z" fill={c} stroke={c} />,
  pause: (c) => <Path d="M8 5v14M16 5v14" stroke={c} strokeWidth={3} />,
  info: (c) => (
    <>
      <Circle cx={12} cy={12} r={8.5} stroke={c} />
      <Path d="M12 11v5.5" stroke={c} />
      <Circle cx={12} cy={7.8} r={1.1} fill={c} />
    </>
  ),
  terminal: (c) => (
    <>
      <Rect x={3} y={4.5} width={18} height={15} rx={3.2} stroke={c} />
      <Path d="M7.5 9.5l3 2.5-3 2.5M12.5 15h4" stroke={c} />
    </>
  ),
  sparkle: (c) => <Path d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9zM18.5 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" stroke={c} />,
  trend: (c) => <Path d="M4 17l5-5 4 4 7-8M15 8h5v5" stroke={c} />,
  music: (c) => (
    <>
      <Path d="M9 17.5V5.5l11-2v12" stroke={c} />
      <Circle cx={6.5} cy={17.5} r={2.5} stroke={c} />
      <Circle cx={17.5} cy={15.5} r={2.5} stroke={c} />
    </>
  ),
  calendar: (c) => (
    <>
      <Rect x={3.5} y={5} width={17} height={15.5} rx={3} stroke={c} />
      <Path d="M3.5 9.8h17M8 3v4M16 3v4" stroke={c} />
    </>
  ),
  note: (c) => (
    <>
      <Rect x={4.5} y={3.5} width={15} height={17} rx={3} stroke={c} />
      <Path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" stroke={c} />
    </>
  ),
  people: (c) => (
    <>
      <Circle cx={9} cy={9} r={3} stroke={c} />
      <Path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.6M17.5 14.5A5 5 0 0 1 20.5 19" stroke={c} />
    </>
  ),
  doc: (c) => <Path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9.5 13h5M9.5 16.5h5" stroke={c} />,
  sliders: (c) => (
    <>
      <Path d="M4 7h9M17 7h3M4 17h3M11 17h9" stroke={c} />
      <Circle cx={15} cy={7} r={2.2} stroke={c} />
      <Circle cx={9} cy={17} r={2.2} stroke={c} />
    </>
  ),
  layers: (c) => <Path d="M12 3.5L3.5 8l8.5 4.5L20.5 8zM3.5 12l8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" stroke={c} />,
  question: (c) => (
    <>
      <Circle cx={12} cy={12} r={8.5} stroke={c} />
      <Path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5" stroke={c} />
      <Circle cx={12} cy={16.8} r={1.1} fill={c} />
    </>
  ),
  list: (c) => (
    <>
      <Path d="M9 7h11M9 12h11M9 17h11" stroke={c} />
      <Circle cx={5} cy={7} r={1.2} fill={c} />
      <Circle cx={5} cy={12} r={1.2} fill={c} />
      <Circle cx={5} cy={17} r={1.2} fill={c} />
    </>
  ),
  alert: (c) => (
    <>
      <Path d="M12 7v6" stroke={c} />
      <Circle cx={12} cy={16.8} r={1.2} fill={c} />
    </>
  ),
}

/** One of the app's icons; in the text colour unless told otherwise. */
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const C = useTheme()
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {LINES[name](color ?? C.text)}
    </Svg>
  )
}

/** An icon on a small rounded tile of its colour, for list rows (as in Settings). */
export function IconTile({ name, color, size = 30 }: { name: IconName; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30">
      <Rect x={0} y={0} width={30} height={30} rx={8} fill={color} />
      <Svg x={5} y={5} width={20} height={20} viewBox="0 0 24 24" fill="none" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
        {LINES[name]('#ffffff')}
      </Svg>
    </Svg>
  )
}
