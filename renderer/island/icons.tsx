/**
 * Monochrome icons in the spirit of SF Symbols: rounded strokes, one weight,
 * drawn in currentColor so they follow the label colour.
 */
import type { ReactNode } from 'react'

const Svg = ({ children, size = 18, fill = false }: { children: ReactNode; size?: number; fill?: boolean }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill ? 'currentColor' : 'none'}
    stroke={fill ? 'none' : 'currentColor'}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
)

export const PlayIcon = ({ size = 22 }: { size?: number }) => (
  <Svg size={size} fill>
    <path d="M7.5 4.8c0-1 1.1-1.6 1.9-1.1l10.2 6.3c.8.5.8 1.6 0 2.1L9.4 18.4c-.8.5-1.9-.1-1.9-1.1z" />
  </Svg>
)
export const PauseIcon = ({ size = 22 }: { size?: number }) => (
  <Svg size={size} fill>
    <rect x="5.5" y="4" width="4.5" height="16" rx="1.4" />
    <rect x="14" y="4" width="4.5" height="16" rx="1.4" />
  </Svg>
)
export const PrevIcon = () => (
  <Svg size={20} fill>
    <path d="M11.5 6.4v11.2c0 .8-.9 1.3-1.6.8L2.4 13c-.6-.4-.6-1.3 0-1.7l7.5-5.6c.7-.5 1.6 0 1.6.7z" />
    <path d="M21.5 6.4v11.2c0 .8-.9 1.3-1.6.8L12.4 13c-.6-.4-.6-1.3 0-1.7l7.5-5.6c.7-.5 1.6 0 1.6.7z" />
  </Svg>
)
export const NextIcon = () => (
  <Svg size={20} fill>
    <path d="M12.5 6.4v11.2c0 .8.9 1.3 1.6.8l7.5-5.4c.6-.4.6-1.3 0-1.7l-7.5-5.6c-.7-.5-1.6 0-1.6.7z" />
    <path d="M2.5 6.4v11.2c0 .8.9 1.3 1.6.8l7.5-5.4c.6-.4.6-1.3 0-1.7L4.1 5.7c-.7-.5-1.6 0-1.6.7z" />
  </Svg>
)
export const ShuffleIcon = () => (
  <Svg size={16}>
    <path d="M3 7h3.5c2 0 3 1 4.3 3.2l2.4 3.6C14.5 16 15.5 17 17.5 17H21" />
    <path d="M3 17h3.5c1.3 0 2.2-.5 3-1.4M14.5 8.4c.8-.9 1.7-1.4 3-1.4H21" />
    <path d="M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5" />
  </Svg>
)
export const RepeatIcon = ({ one }: { one?: boolean }) => (
  <Svg size={16}>
    <path d="M4 11V9.5A2.5 2.5 0 0 1 6.5 7H20M17 4l3 3-3 3" />
    <path d="M20 13v1.5a2.5 2.5 0 0 1-2.5 2.5H4M7 20l-3-3 3-3" />
    {one && (
      <text x="12" y="14.6" fontSize="7" textAnchor="middle" fontWeight="700" fill="currentColor" stroke="none">
        1
      </text>
    )}
  </Svg>
)
export const SpeakerIcon = ({ muted }: { muted?: boolean }) => (
  <Svg size={18}>
    <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" />
    {muted ? (
      <path d="m16 9.5 5 5m0-5-5 5" />
    ) : (
      <>
        <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
        <path d="M18.3 6.5a8 8 0 0 1 0 11" />
      </>
    )}
  </Svg>
)
export const SunIcon = () => (
  <Svg size={18}>
    <circle cx="12" cy="12" r="3.6" fill="currentColor" />
    <path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4" />
  </Svg>
)
export const WifiIcon = () => (
  <Svg size={18}>
    <path d="M2.5 9a14 14 0 0 1 19 0" />
    <path d="M5.8 12.4a9.2 9.2 0 0 1 12.4 0" />
    <path d="M9.1 15.8a4.5 4.5 0 0 1 5.8 0" />
    <circle cx="12" cy="19" r="1.2" fill="currentColor" />
  </Svg>
)
export const BluetoothIcon = () => (
  <Svg size={18}>
    <path d="m6.5 7 11 10-5.5 5V2l5.5 5-11 10" />
  </Svg>
)
export const BellIcon = () => (
  <Svg size={14}>
    <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </Svg>
)
export const ChatIcon = () => (
  <Svg size={14}>
    <path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5l1.5-4.3A8.5 8.5 0 1 1 20.5 11.5z" />
  </Svg>
)
export const MailIcon = () => (
  <Svg size={14}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="m3.8 7 8.2 6 8.2-6" />
  </Svg>
)
export const TerminalIcon = () => (
  <Svg size={14}>
    <rect x="3" y="4" width="18" height="16" rx="3.5" />
    <path d="m7.5 9.5 3 2.5-3 2.5M12.5 15h4" />
  </Svg>
)
export const XIcon = () => (
  <Svg size={12}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)
export const GearIcon = () => (
  <Svg size={16}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
)
export const SlidersIcon = () => (
  <Svg size={18}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2.2" />
    <circle cx="9" cy="17" r="2.2" />
  </Svg>
)
export const NoteIcon = () => (
  <Svg size={18}>
    <rect x="4.5" y="3.5" width="15" height="17" rx="3" />
    <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
  </Svg>
)
export const PlusIcon = () => (
  <Svg size={18}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const TrashIcon = () => (
  <Svg size={17}>
    <path d="M4.5 7h15M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7M6.5 7l.8 11.6c.1 1 .9 1.9 2 1.9h5.4c1.1 0 1.9-.9 2-1.9L17.5 7" />
  </Svg>
)
export const SearchIcon = () => (
  <Svg size={14}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Svg>
)
