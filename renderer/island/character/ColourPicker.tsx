import { BODY_COLORS, type CharacterId } from '@shared/character'
import { CHARACTER_COLOR } from './Character'

/** The orb's colour: its own, or one of a few others. */
export function ColourPicker({ id, color, onColor }: { id: CharacterId; color: string | null; onColor: (c: string | null) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Colour">
      {BODY_COLORS.map((c) => (
        <button
          key={c.id}
          role="radio"
          aria-checked={c.color === color}
          aria-label={c.label}
          title={c.label}
          className={`swatch${c.color === color ? ' on' : ''}${c.color ? '' : ' own'}`}
          style={{ background: c.color ?? CHARACTER_COLOR[id] }}
          onClick={(e) => {
            e.stopPropagation()
            onColor(c.color)
          }}
        />
      ))}
    </div>
  )
}
