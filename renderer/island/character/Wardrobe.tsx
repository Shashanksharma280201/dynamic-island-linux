import { BODY_COLORS, OUTFITS, OUTFIT_LABEL, seasonalOutfit, type CharacterId, type Outfit } from '@shared/character'
import { Character } from './Character'

/**
 * Pick what the character wears and its colour: a grid of it wearing each
 * outfit ("Seasonal" changes with the date), and colour swatches.
 */
export function WardrobePicker({
  id,
  outfit,
  color,
  size = 46,
  onOutfit,
  onColor,
}: {
  id: CharacterId
  outfit: Outfit
  color: string | null
  size?: number
  onOutfit: (o: Outfit) => void
  onColor: (c: string | null) => void
}) {
  const today = seasonalOutfit(new Date())
  return (
    <div className="wardrobe">
      <div className="wardrobe-grid" role="radiogroup" aria-label="Outfit">
        {OUTFITS.map((o) => (
          <button
            key={o}
            role="radio"
            aria-checked={o === outfit}
            className={`wardrobe-item${o === outfit ? ' on' : ''}`}
            data-outfit={o}
            title={o === 'auto' ? `Seasonal: changes with the date (today: ${OUTFIT_LABEL[today]})` : OUTFIT_LABEL[o]}
            onClick={(e) => {
              e.stopPropagation()
              onOutfit(o)
            }}
          >
            <Character id={id} mood="idle" size={size} ring={false} outfit={o} paint={color} label={OUTFIT_LABEL[o]} />
            <span>{OUTFIT_LABEL[o]}</span>
          </button>
        ))}
      </div>
      <div className="swatches" role="radiogroup" aria-label="Colour">
        {BODY_COLORS.map((c) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={c.color === color}
            aria-label={c.label}
            title={c.label}
            className={`swatch${c.color === color ? ' on' : ''}${c.color ? '' : ' own'}`}
            style={c.color ? { background: c.color } : undefined}
            onClick={(e) => {
              e.stopPropagation()
              onColor(c.color)
            }}
          />
        ))}
      </div>
    </div>
  )
}
