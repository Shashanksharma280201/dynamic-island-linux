import { memo } from 'react'
import { Circle, G, Path } from 'react-native-svg'
import type { IsoPalette } from '../ui/theme'
import type { Part } from './linkGeometry'

/**
 * Anatomy's way of drawing a solid, in react-native-svg: the silhouette in
 * paper, the side faces in four shades by how they face the light, the top,
 * the creases faint, then the outline. Lines are thin and round-capped.
 */
export function drawPart(part: Part, t: IsoPalette, key: number) {
  switch (part.kind) {
    case 'solid': {
      const { paths, lit, tone = 'hi', halo } = part
      return (
        <G key={key}>
          {halo && <Path d={paths.fill} fill={t.halo} opacity={t.haloOpacity * 0.35} transform="translate(0 3)" />}
          <Path d={paths.fill} fill={lit ? t.face : t.paper} />
          {paths.shades.map((d, i) => (d ? <Path key={i} d={d} fill={lit ? t.litShade : t.shades[i]} /> : null))}
          <Path d={paths.top} fill={lit ? t.litTop : t.top} />
          {!!paths.crease && <Path d={paths.crease} stroke={t.faint} strokeWidth={0.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          {!!paths.bevel && <Path d={paths.bevel} stroke={t.faint} strokeWidth={0.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          <Path d={paths.outline} stroke={lit ? t.lit : t[tone]} strokeWidth={0.7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      )
    }
    case 'line':
      return (
        <Path
          key={key}
          d={part.d}
          stroke={t[part.tone]}
          strokeWidth={part.width ?? 0.7}
          strokeDasharray={part.dashed ? '3 3' : undefined}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'fill': {
      const color =
        part.tone === 'glass'
          ? t.shades[3]
          : part.tone === 'ink'
            ? t.shades[0]
            : part.tone === 'paper'
              ? t.paper
              : part.tone === 'face'
                ? t.face
                : part.tone === 'top'
                  ? t.top
                  : t.shades[Number(part.tone.slice(-1))]
      return <Path key={key} d={part.d} fill={color} opacity={part.opacity} />
    }
    case 'dots':
      return (
        <G key={key}>
          {part.points.map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={part.r} fill={t.dot} opacity={part.tone === 'hi' ? 0.85 : part.tone === 'mid' ? 0.5 : 0.25} />
          ))}
        </G>
      )
  }
}

/** Static parts, drawn once per theme. */
export const Parts = memo(function Parts({ parts, t }: { parts: Part[]; t: IsoPalette }) {
  return <G>{parts.map((p, i) => drawPart(p, t, i))}</G>
})
