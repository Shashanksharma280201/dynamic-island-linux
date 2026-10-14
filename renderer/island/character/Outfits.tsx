import type { CharacterId, Wear } from '@shared/character'

/** Where things sit on each character (its 100×100 drawing). */
export type Anchor = {
  /** Top of the head. */
  top: number
  /** Width of the head near the top. */
  headW: number
  eyeY: number
  eyeL: number
  eyeR: number
  eyeSize: number
  /** Where a bow tie or scarf goes. */
  chinY: number
  /** Left and right edges of the head at eye level. */
  sideL: number
  sideR: number
  /** Glasses frames that show against the face (Bolt's visor is dark). */
  frame: string
}

export const ANCHORS: Record<CharacterId, Anchor> = {
  bolt: { top: 24, headW: 60, eyeY: 51.5, eyeL: 40, eyeR: 60, eyeSize: 7.2, chinY: 84, sideL: 15, sideR: 85, frame: '#e5e5ea' },
  puff: { top: 19, headW: 42, eyeY: 52, eyeL: 38, eyeR: 62, eyeSize: 6, chinY: 86, sideL: 15, sideR: 85, frame: '#2b2b2e' },
  orbit: { top: 22, headW: 40, eyeY: 50, eyeL: 41, eyeR: 59, eyeSize: 5.6, chinY: 84, sideL: 20, sideR: 80, frame: '#3a1f14' },
}

/** Things worn on the head (a hat hides Bolt's antenna). */
export const HATS: Wear[] = ['beanie', 'cap', 'crown', 'party', 'santa', 'witch', 'tophat']

/** Hats, headphones, a flower, a bow tie, a scarf: they move with the body. */
export function HeadWear({ wear, a }: { wear: Wear; a: Anchor }) {
  const t = a.top
  const w = a.headW
  switch (wear) {
    case 'beanie':
      return (
        <g className="outfit" data-outfit="beanie">
          <path d={`M${50 - w / 2} ${t + 8} C ${50 - w / 2} ${t - 16}, ${50 + w / 2} ${t - 16}, ${50 + w / 2} ${t + 8} Z`} fill="#ff6b6b" />
          <rect x={50 - w / 2 - 2} y={t + 2} width={w + 4} height={8} rx={4} fill="#e0484f" />
          {[-3, -1, 1, 3].map((i) => (
            <line key={i} x1={50 + i * (w / 9)} y1={t + 3} x2={50 + i * (w / 9)} y2={t + 9} stroke="#c53a41" strokeWidth={1.4} />
          ))}
          <circle cx={50} cy={t - 11} r={5.5} fill="#fff4f0" />
        </g>
      )
    case 'cap':
      return (
        <g className="outfit" data-outfit="cap">
          <path d={`M${50 - w * 0.48} ${t + 7} C ${50 - w * 0.48} ${t - 13}, ${50 + w * 0.48} ${t - 13}, ${50 + w * 0.48} ${t + 7} Z`} fill="#0a84ff" />
          <path d={`M${50 + w * 0.2} ${t + 6} Q ${50 + w * 0.62} ${t + 2} ${50 + w * 0.78} ${t + 8} Q ${50 + w * 0.5} ${t + 10} ${50 + w * 0.2} ${t + 8} Z`} fill="#005fcc" />
          <circle cx={50} cy={t - 7} r={2} fill="#005fcc" />
        </g>
      )
    case 'crown':
      return (
        <g className="outfit" data-outfit="crown">
          <path d={`M${50 - 15} ${t + 5} L${50 - 17} ${t - 9} L${50 - 8} ${t - 2} L50 ${t - 13} L${50 + 8} ${t - 2} L${50 + 17} ${t - 9} L${50 + 15} ${t + 5} Z`} fill="#ffd60a" stroke="#e0a800" strokeWidth={1.4} strokeLinejoin="round" />
          <circle cx={50} cy={t} r={2.2} fill="#ff375f" />
          <circle cx={50 - 9} cy={t + 1} r={1.6} fill="#5ac8fa" />
          <circle cx={50 + 9} cy={t + 1} r={1.6} fill="#5ac8fa" />
        </g>
      )
    case 'headphones':
      return (
        <g className="outfit" data-outfit="headphones">
          <path d={`M${a.sideL + 3} ${a.eyeY} C ${a.sideL + 3} ${t - 14}, ${a.sideR - 3} ${t - 14}, ${a.sideR - 3} ${a.eyeY}`} stroke="#3a3a3c" strokeWidth={4.5} fill="none" strokeLinecap="round" />
          <rect x={a.sideL - 3} y={a.eyeY - 9} width={10} height={18} rx={5} fill="#ff375f" />
          <rect x={a.sideR - 7} y={a.eyeY - 9} width={10} height={18} rx={5} fill="#ff375f" />
        </g>
      )
    case 'bowtie':
      return (
        <g className="outfit" data-outfit="bowtie">
          <path d={`M50 ${a.chinY - 4} L${50 - 11} ${a.chinY - 10} L${50 - 11} ${a.chinY + 2} Z M50 ${a.chinY - 4} L${50 + 11} ${a.chinY - 10} L${50 + 11} ${a.chinY + 2} Z`} fill="#ff453a" stroke="#c9302c" strokeWidth={1} strokeLinejoin="round" />
          <circle cx={50} cy={a.chinY - 4} r={2.8} fill="#c9302c" />
        </g>
      )
    case 'party':
      return (
        <g className="outfit" data-outfit="party" transform={`rotate(12 50 ${t})`}>
          <path d={`M${50 - 10} ${t + 4} L${50 + 10} ${t + 4} L50 ${t - 22} Z`} fill="#bf5af2" />
          <path d={`M${50 - 6.5} ${t - 5} L${50 + 6.5} ${t - 5} M${50 - 3.4} ${t - 13} L${50 + 3.4} ${t - 13}`} stroke="#ffd60a" strokeWidth={2.4} strokeLinecap="round" />
          <circle cx={50} cy={t - 23} r={3.4} fill="#ffd60a" />
        </g>
      )
    case 'flower':
      return (
        <g className="outfit" data-outfit="flower" transform={`translate(${50 + w * 0.36} ${t + 4})`}>
          {[0, 72, 144, 216, 288].map((r) => (
            <ellipse key={r} cx={0} cy={-5} rx={3.4} ry={5} fill="#ff9fd2" transform={`rotate(${r})`} />
          ))}
          <circle r={3} fill="#ffd60a" />
        </g>
      )
    case 'santa':
      return (
        <g className="outfit" data-outfit="santa">
          <path d={`M${50 - w / 2} ${t + 6} C ${50 - w / 3} ${t - 18}, ${50 + w / 4} ${t - 22}, ${50 + w / 2 + 8} ${t - 4} L${50 + w / 2} ${t + 6} Z`} fill="#e5383b" />
          <rect x={50 - w / 2 - 3} y={t + 2} width={w + 6} height={8} rx={4} fill="#fff7f2" />
          <circle cx={50 + w / 2 + 8} cy={t - 4} r={4.6} fill="#fff7f2" />
        </g>
      )
    case 'witch':
      return (
        <g className="outfit" data-outfit="witch">
          <ellipse cx={50} cy={t + 5} rx={w / 2 + 12} ry={4.5} fill="#4a3f6b" stroke="rgba(255,255,255,.25)" strokeWidth={0.8} />
          <path d={`M${50 - 12} ${t + 4} L${50 + 12} ${t + 4} L${50 + 9} ${t - 12} Q ${50 + 6} ${t - 22} ${50 + 16} ${t - 25} Q ${50 + 1} ${t - 22} ${50 - 4} ${t - 12} Z`} fill="#5b4d86" stroke="rgba(255,255,255,.25)" strokeWidth={0.8} />
          <rect x={50 - 12} y={t - 1} width={24} height={4.5} fill="#bf5af2" />
        </g>
      )
    case 'tophat':
      return (
        <g className="outfit" data-outfit="tophat">
          <ellipse cx={50} cy={t + 4} rx={w / 2 + 4} ry={3.6} fill="#48484a" stroke="rgba(255,255,255,.28)" strokeWidth={0.8} />
          <rect x={50 - 12} y={t - 18} width={24} height={22} rx={2} fill="#48484a" stroke="rgba(255,255,255,.28)" strokeWidth={0.8} />
          <rect x={50 - 12} y={t - 2} width={24} height={4} fill="#ff453a" />
        </g>
      )
    case 'scarf':
      return (
        <g className="outfit" data-outfit="scarf">
          <rect x={50 - w / 2 - 4} y={a.chinY - 11} width={w + 8} height={9} rx={4.5} fill="#ff9f0a" />
          <rect x={50 + w / 5} y={a.chinY - 5} width={8} height={14} rx={3} fill="#ff9f0a" transform={`rotate(-8 ${50 + w / 5} ${a.chinY - 5})`} />
          {[-2, 0, 2].map((i) => (
            <line key={i} x1={50 + i * 9} y1={a.chinY - 11} x2={50 + i * 9} y2={a.chinY - 2} stroke="#e07b00" strokeWidth={1.6} />
          ))}
        </g>
      )
    default:
      return null
  }
}

/** Glasses: they follow the eyes. */
export function FaceWear({ wear, a }: { wear: Wear; a: Anchor }) {
  const r = a.eyeSize * 1.45
  if (wear === 'glasses')
    return (
      <g className="outfit" data-outfit="glasses" fill="rgba(255,255,255,.12)" stroke={a.frame} strokeWidth={2.2}>
        <circle cx={a.eyeL} cy={a.eyeY} r={r} />
        <circle cx={a.eyeR} cy={a.eyeY} r={r} />
        <path d={`M${a.eyeL + r} ${a.eyeY - 1} Q50 ${a.eyeY - 4} ${a.eyeR - r} ${a.eyeY - 1}`} fill="none" />
      </g>
    )
  if (wear === 'sunglasses')
    return (
      <g className="outfit" data-outfit="sunglasses">
        <rect x={a.eyeL - r} y={a.eyeY - r * 0.75} width={r * 2} height={r * 1.5} rx={r * 0.6} fill="#111" />
        <rect x={a.eyeR - r} y={a.eyeY - r * 0.75} width={r * 2} height={r * 1.5} rx={r * 0.6} fill="#111" />
        <path d={`M${a.eyeL + r} ${a.eyeY - 1} L${a.eyeR - r} ${a.eyeY - 1}`} stroke="#111" strokeWidth={2.2} />
        <path d={`M${a.eyeL - r * 0.5} ${a.eyeY - r * 0.3} L${a.eyeL} ${a.eyeY - r * 0.55}`} stroke="rgba(255,255,255,.5)" strokeWidth={1.4} strokeLinecap="round" />
        <path d={`M${a.eyeR - r * 0.5} ${a.eyeY - r * 0.3} L${a.eyeR} ${a.eyeY - r * 0.55}`} stroke="rgba(255,255,255,.5)" strokeWidth={1.4} strokeLinecap="round" />
      </g>
    )
  return null
}
