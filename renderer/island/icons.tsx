/** Small monochrome icons (currentColor), consistent across font setups. */
const Svg = ({ children, size = 16 }: { children: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    {children}
  </svg>
)

export const PlayIcon = () => (
  <Svg size={20}>
    <path d="M7 4.5v15l13-7.5z" />
  </Svg>
)
export const PauseIcon = () => (
  <Svg size={20}>
    <rect x="6" y="4.5" width="4" height="15" rx="1" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" />
  </Svg>
)
export const PrevIcon = () => (
  <Svg>
    <rect x="4" y="5" width="2.5" height="14" rx="1" />
    <path d="M20 5v14L8 12z" />
  </Svg>
)
export const NextIcon = () => (
  <Svg>
    <rect x="17.5" y="5" width="2.5" height="14" rx="1" />
    <path d="M4 5v14l12-7z" />
  </Svg>
)
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
export const ShuffleIcon = () => (
  <Svg>
    <g {...stroke}>
      <path d="M3 7h3.5c2 0 3 1 4.3 3.2l2.4 3.6C14.5 16 15.5 17 17.5 17H21" />
      <path d="M3 17h3.5c1.3 0 2.2-.5 3-1.4M14.5 8.4c.8-.9 1.7-1.4 3-1.4H21" />
      <path d="M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5" />
    </g>
  </Svg>
)
export const RepeatIcon = ({ one }: { one?: boolean }) => (
  <Svg>
    <g {...stroke}>
      <path d="M4 11V9.5A2.5 2.5 0 0 1 6.5 7H20M17 4l3 3-3 3" />
      <path d="M20 13v1.5a2.5 2.5 0 0 1-2.5 2.5H4M7 20l-3-3 3-3" />
    </g>
    {one && (
      <text x="12" y="14.5" fontSize="7" textAnchor="middle" fontWeight="700" fill="currentColor">
        1
      </text>
    )}
  </Svg>
)
