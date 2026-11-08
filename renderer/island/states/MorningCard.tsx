import { useEffect, useState } from 'react'
import { cardShowing, type MorningCard as Card } from '@shared/loop'

/** The morning card, as the island shows it, and whether to show it. */
export function useMorning(): { card: Card | null; act: (a: 'send' | 'edit' | 'hold' | 'done') => void } {
  const [card, setCard] = useState<Card | null>(null)
  useEffect(() => {
    if (!window.island.morning) return
    void window.island.morning.get().then(setCard).catch(() => {})
    return window.island.morning.onCard(setCard)
  }, [])
  return {
    card: cardShowing(card, Date.now()) ? card : null,
    act: (a) => {
      if (a === 'hold' || a === 'done') setCard(null)
      void window.island.morning.act(a)
    },
  }
}

/** Good morning: the one thing for today, why, and a draft to send, edit or hold. */
export function MorningCard({ card, act }: { card: Card; act: (a: 'send' | 'edit' | 'hold' | 'done') => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card morning-card" onClick={(e) => e.stopPropagation()}>
      <div className="card-head">
        <span className="app-glyph morning-glyph" aria-hidden="true">
          ☀
        </span>
        <span className="app-name">Good morning</span>
        <span className="spacer" />
        <span className="time">The one thing</span>
      </div>
      <div className="morning-one">{card.one}</div>
      {card.why && <div className="morning-why">{card.why}</div>}
      {card.draft && (
        <button className={`morning-draft${open ? ' open' : ''}`} onClick={() => setOpen(!open)} title={open ? 'Show less' : 'Show the draft'}>
          {card.to && <span className="morning-to">To {card.to}: </span>}
          {card.draft}
        </button>
      )}
      <div className="morning-actions">
        <button className="pill small" onClick={() => act('hold')} title="Bring it back in three hours">
          Hold
        </button>
        {card.draft && (
          <button className="pill small" onClick={() => act('edit')}>
            Edit
          </button>
        )}
        {card.draft && card.to ? (
          <button className="pill primary small" onClick={() => act('send')}>
            Send
          </button>
        ) : (
          <button className="pill primary small" onClick={() => act('done')}>
            Got it
          </button>
        )}
      </div>
    </div>
  )
}
