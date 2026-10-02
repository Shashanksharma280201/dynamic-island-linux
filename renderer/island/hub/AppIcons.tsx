/**
 * App-style icons for the rail: coloured tiles with a white glyph, like the
 * apps they stand for (drawn here, not the companies' logo files).
 */
import { useId, type ReactNode } from 'react'

function Tile({ from, to, children, round = false, size = 28 }: { from: string; to: string; children: ReactNode; round?: boolean; size?: number }) {
  const id = useId()
  return (
    <svg className="app-icon" width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      {round ? <circle cx="14" cy="14" r="13" fill={`url(#${id})`} /> : <rect width="28" height="28" rx="7.5" fill={`url(#${id})`} />}
      {/* a soft top sheen, like a real app icon */}
      {round ? (
        <circle cx="14" cy="14" r="12.5" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      ) : (
        <rect x="0.5" y="0.5" width="27" height="27" rx="7" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
      )}
      {children}
    </svg>
  )
}

/** Control Center: two switches. */
export const ControlsAppIcon = () => (
  <Tile from="#8e8e93" to="#48484a">
    <rect x="6" y="7" width="16" height="6" rx="3" fill="#fff" fillOpacity="0.35" />
    <circle cx="19" cy="10" r="2.4" fill="#fff" />
    <rect x="6" y="15" width="16" height="6" rx="3" fill="#fff" />
    <circle cx="9" cy="18" r="2.4" fill="#636366" />
  </Tile>
)

/** Claude: the orange sunburst. */
export const ClaudeAppIcon = () => {
  const rays = [0, 40, 75, 115, 160, 200, 235, 280, 320]
  const len = [8, 6.5, 8.5, 7, 8, 6.5, 8.5, 7, 7.5]
  return (
    <Tile from="#e08a67" to="#c8603c" round size={26}>
      <g stroke="#fff" strokeWidth="2.3" strokeLinecap="round">
        {rays.map((a, i) => {
          const r = (a * Math.PI) / 180
          return <line key={a} x1="14" y1="14" x2={14 + Math.cos(r) * len[i]} y2={14 + Math.sin(r) * len[i]} />
        })}
      </g>
    </Tile>
  )
}

/** Spotify: the green disc with three arcs. */
export const SpotifyAppIcon = () => (
  <svg className="app-icon" width={26} height={26} viewBox="0 0 28 28" aria-hidden>
    <circle cx="14" cy="14" r="13" fill="#1ed760" />
    <path
      d="M7.6 10.8c4-1.2 8.8-.9 12.3 1.1M8.3 14.6c3.4-1 7.3-.7 10.2 1M9 18.1c2.7-.7 5.6-.5 7.9.8"
      fill="none"
      stroke="#000"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)

/** WhatsApp: a speech bubble with a handset, on green. */
export const WhatsAppIcon = () => (
  <Tile from="#5ee27a" to="#1faa52">
    <path
      d="M14 5.6a8.4 8.4 0 0 0-7.3 12.6L5.6 22.4l4.3-1.1A8.4 8.4 0 1 0 14 5.6z"
      fill="none"
      stroke="#fff"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M11.3 10.2c.3-.3.7-.3.9.1l.8 1.6c.1.3 0 .6-.2.8l-.5.5c.5 1.1 1.4 2 2.5 2.5l.5-.5c.2-.2.5-.3.8-.2l1.6.8c.4.2.4.6.1.9l-.7.8c-.4.4-1 .5-1.5.3-2.3-.9-4.1-2.7-5-5-.2-.5-.1-1.1.3-1.5z"
      fill="#fff"
    />
  </Tile>
)

/** Mail: a white envelope on blue. */
export const MailAppIcon = () => (
  <Tile from="#27a8ff" to="#0a5cff">
    <rect x="5.5" y="8.5" width="17" height="12" rx="2" fill="#fff" />
    <path d="M6.2 9.4 14 15.2l7.8-5.8" fill="none" stroke="#1c7cff" strokeWidth="1.5" strokeLinejoin="round" />
  </Tile>
)

/** Notes: a yellow-topped page with lines. */
export const NotesAppIcon = () => (
  <svg className="app-icon" width={28} height={28} viewBox="0 0 28 28" aria-hidden>
    <rect width="28" height="28" rx="7.5" fill="#fafafa" />
    <path d="M0 7.5A7.5 7.5 0 0 1 7.5 0h13A7.5 7.5 0 0 1 28 7.5V9H0z" fill="#ffcc2f" />
    <path d="M5 9h18" stroke="#e6ac00" strokeWidth="0.8" />
    <g stroke="#c7c7cc" strokeWidth="1" strokeDasharray="1.2 1.4">
      <path d="M5 14h18M5 18h18M5 22h18" />
    </g>
  </svg>
)

/** Documents: a page with a folded corner, on violet. */
export const DocsAppIcon = () => (
  <Tile from="#a08fff" to="#5a3fe0">
    <path d="M9 5.5h7l4.5 4.5v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z" fill="#fff" />
    <path d="M16 5.5V9a1 1 0 0 0 1 1h3.5z" fill="#d6ceff" />
    <g stroke="#7d68f2" strokeWidth="1.2" strokeLinecap="round">
      <path d="M10.6 13.4h7M10.6 16.2h7M10.6 19h4.4" />
    </g>
  </Tile>
)

/** Settings: a gear on grey. */
export const SettingsAppIcon = () => {
  const teeth = Array.from({ length: 8 }, (_, i) => i * 45)
  return (
    <Tile from="#9a9aa0" to="#5b5b61" size={24}>
      <g fill="#e5e5ea">
        {teeth.map((a) => (
          <rect key={a} x="12.6" y="4.6" width="2.8" height="4" rx="0.8" transform={`rotate(${a} 14 14)`} />
        ))}
        <circle cx="14" cy="14" r="6.6" />
      </g>
      <circle cx="14" cy="14" r="3.2" fill="#6d6d73" />
      <circle cx="14" cy="14" r="5" fill="none" stroke="#b9b9bf" strokeWidth="0.8" />
    </Tile>
  )
}
