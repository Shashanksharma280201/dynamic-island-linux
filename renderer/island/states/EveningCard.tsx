import { useEffect, useState } from 'react'
import { appsText, eveningTitle, type EveningCard as Card } from '@shared/digest'
import { MoonIcon } from '../icons'

/** The evening digest, as the island shows it. */
export function useEvening(): { card: Card | null; done: () => void } {
  const [card, setCard] = useState<Card | null>(null)
  useEffect(() => {
    if (!window.island.evening) return
    void window.island.evening.get().then(setCard).catch(() => {})
    return window.island.evening.onCard(setCard)
  }, [])
  return {
    card: card?.state === 'new' ? card : null,
    done: () => {
      setCard(null)
      void window.island.evening.done()
    },
  }
}

const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** This evening: what was kept quiet today, and the notifications you didn't get to. */
export function EveningCard({ card, done, openNotifications }: { card: Card; done: () => void; openNotifications: () => void }) {
  return (
    <div className="card evening-card" onClick={(e) => e.stopPropagation()}>
      <div className="card-head">
        <span className="app-glyph evening-glyph" aria-hidden="true">
          <MoonIcon size={16} />
        </span>
        <span className="app-name">This evening</span>
      </div>
      <div className="evening-title">{eveningTitle(card)}</div>
      {card.kept.length > 0 && (
        <ul className="evening-kept">
          {card.kept.map((k, i) => (
            <li key={i}>
              <span className="evening-line">{k.line}</span>
              <span className="evening-why">
                {hm(k.at)} · {k.why}
              </span>
            </li>
          ))}
          {card.more > 0 && <li className="evening-more">and {card.more} more</li>}
        </ul>
      )}
      {card.notifications > 0 && (
        <div className="evening-notifs">
          Notifications you didn’t get to: {appsText(card.apps)}
        </div>
      )}
      <div className="morning-actions">
        {card.notifications > 0 && (
          <button
            className="pill small"
            onClick={() => {
              openNotifications()
              done()
            }}
          >
            Open notifications
          </button>
        )}
        <button className="pill primary small" onClick={done}>
          Got it
        </button>
      </div>
    </div>
  )
}
