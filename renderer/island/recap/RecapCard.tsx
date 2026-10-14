import { useEffect, useRef, useState } from 'react'
import type { RecapCard as Card } from '@shared/recap'
import { Character } from '../character/Character'

export type RecapShow = { card: Card; shareCard: Card; name: string }

/** The recap the main process asked to show (once a week, or from the tray). */
export function useRecap(): [RecapShow | null, () => void] {
  const [r, setR] = useState<RecapShow | null>(null)
  useEffect(() => window.island.recap?.onShow(setR), [])
  return [r, () => setR(null)]
}

/** The shareable picture: 1080×1920, your character on top, the week below. */
async function drawRecap(card: Card, name: string, characterSvg: string | null): Promise<string> {
  const W = 1080
  const H = 1920
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#16141f')
  bg.addColorStop(1, '#2b1838')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  // A soft glow and a field of dots, like the island's orbs.
  const glow = g.createRadialGradient(W / 2, 400, 40, W / 2, 400, 520)
  glow.addColorStop(0, 'rgba(232,132,95,0.45)')
  glow.addColorStop(1, 'rgba(232,132,95,0)')
  g.fillStyle = glow
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2 * 7
    const r = 260 + (i % 9) * 26
    g.fillStyle = `rgba(255,214,190,${0.08 + (i % 5) * 0.03})`
    g.beginPath()
    g.arc(W / 2 + Math.cos(a) * r * 0.92, 400 + Math.sin(a) * r * 0.72, 3 + (i % 3), 0, Math.PI * 2)
    g.fill()
  }
  if (characterSvg) {
    await new Promise<void>((resolve) => {
      const img = new Image()
      img.onload = () => {
        g.drawImage(img, W / 2 - 180, 220, 360, 360)
        resolve()
      }
      img.onerror = () => resolve()
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(characterSvg)}`
    })
  }
  g.textAlign = 'center'
  g.fillStyle = '#fff'
  g.font = '700 76px Inter Variable, system-ui, sans-serif'
  g.fillText('My week of coding', W / 2, 700)
  g.fillStyle = 'rgba(235,235,245,0.62)'
  g.font = '500 40px Inter Variable, system-ui, sans-serif'
  g.fillText(`${card.range} · with ${name}`, W / 2, 765)
  // The numbers, two to a row.
  card.chips.forEach((ch, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = i === card.chips.length - 1 && card.chips.length % 2 ? W / 2 : col === 0 ? W * 0.29 : W * 0.71
    const y = 930 + row * 196
    g.fillStyle = 'rgba(255,255,255,0.07)'
    g.beginPath()
    g.roundRect(x - 220, y - 90, 440, 170, 36)
    g.fill()
    g.fillStyle = '#fff'
    g.font = '700 64px Inter Variable, system-ui, sans-serif'
    g.fillText(ch.value, x, y + 6)
    g.fillStyle = 'rgba(235,235,245,0.62)'
    g.font = '500 32px Inter Variable, system-ui, sans-serif'
    g.fillText(ch.label, x, y + 56)
  })
  const top = 930 + Math.ceil(card.chips.length / 2) * 196 + 20
  card.lines.slice(0, 5).forEach((l, i) => {
    g.fillStyle = 'rgba(235,235,245,0.62)'
    g.font = '500 36px Inter Variable, system-ui, sans-serif'
    g.fillText(`${l.label}: ${l.value}`, W / 2, top + i * 60)
  })
  g.fillStyle = 'rgba(235,235,245,0.4)'
  g.font = '500 30px Inter Variable, system-ui, sans-serif'
  g.fillText('Dynamic Island', W / 2, H - 70)
  return c.toDataURL('image/png')
}

/** Last week, at a glance: the numbers, a few highlights, and an image to share. */
export function RecapCard({ r, onClose }: { r: RecapShow; onClose: () => void }) {
  const [share, setShare] = useState(false)
  const [hide, setHide] = useState(false)
  const [png, setPng] = useState<string | null>(null)
  const [note, setNote] = useState<{ text: string; file?: string } | null>(null)
  const charRef = useRef<HTMLDivElement | null>(null)
  const card = share && hide ? r.shareCard : r.card

  useEffect(() => {
    if (!share) return
    let live = true
    const svg = charRef.current?.querySelector('svg.character')
    const markup = svg ? new XMLSerializer().serializeToString(svg) : null
    void drawRecap(card, r.name, markup).then((p) => live && setPng(p))
    return () => void (live = false)
  }, [share, hide]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card recap-card" onClick={(e) => e.stopPropagation()} data-empty={r.card.empty ? 'yes' : 'no'}>
      <div className="recap-head">
        <div ref={charRef}>
          <Character mood={r.card.empty ? 'sleeping' : 'done'} size={44} ring={false} />
        </div>
        <div className="recap-titles">
          <div className="recap-title">{share ? 'Share your week' : 'Weekly recap'}</div>
          <div className="caption">{r.card.range}</div>
        </div>
      </div>
      {r.card.empty ? (
        <div className="recap-empty">
          <b>No activity last week</b>
          <span>I count your agent sessions as they happen. Check back next Monday.</span>
        </div>
      ) : share ? (
        <div className="recap-share">
          {png ? <img className="recap-thumb" src={png} alt="Your week, as an image" /> : <div className="recap-thumb" />}
          <div className="recap-share-side">
            <label className="recap-hide">
              <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} /> Hide project names
            </label>
            <button
              className="pill primary small"
              disabled={!png}
              onClick={async () => {
                const file = png && (await window.island.recap.save(png))
                setNote(file ? { text: `Saved as ${file.split(/[\\/]/).pop()}`, file } : { text: 'Couldn’t save the image' })
              }}
            >
              Save image
            </button>
            <button className="pill small" disabled={!png} onClick={async () => setNote({ text: png && (await window.island.recap.copy(png)) ? 'Copied: paste it anywhere' : 'Copying images isn’t available here; use Save image' })}>
              Copy
            </button>
            {note && (
              <div className="caption recap-note">
                {note.text}{' '}
                {note.file && (
                  <button className="link" onClick={() => void window.island.recap.show(note.file!)}>
                    Show in folder
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="recap-chips">
            {card.chips.map((c) => (
              <div className="recap-chip" key={c.label}>
                <b>{c.value}</b>
                <span>{c.label}</span>
              </div>
            ))}
          </div>
          <div className="recap-lines">
            {card.lines.map((l) => (
              <div key={l.label}>
                <span>{l.label}</span> <b>{l.value}</b>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="actions">
        {!r.card.empty && (
          <button className="plain" onClick={() => (setShare(!share), setNote(null))}>
            {share ? 'Back' : 'Share image'}
          </button>
        )}
        <span className="spacer" />
        <button className="pill primary" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  )
}
