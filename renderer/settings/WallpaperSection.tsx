import { useState } from 'react'
import type { SettingsState } from '@shared/types'
import { ANIMATIONS, creditLine, type WallItem } from '@shared/wallpaper'
import { Segmented, Toggle, useAction } from './Settings'

const KEY_SITES = [
  { id: 'pexels' as const, name: 'Pexels', what: 'photos and videos', where: 'https://www.pexels.com/api/' },
  { id: 'unsplash' as const, name: 'Unsplash', what: 'photos', where: 'https://unsplash.com/developers' },
  { id: 'pixabay' as const, name: 'Pixabay', what: 'photos and videos', where: 'https://pixabay.com/api/docs/' },
]

/** A tile's picture: the thumbnail, or an animation's colours. */
function Preview({ w, big }: { w: WallItem; big?: boolean }) {
  const anim = w.kind === 'animation' ? ANIMATIONS.find((a) => a.id === w.url) : null
  return (
    <div className={`wall-preview${big ? ' big' : ''}`} style={anim ? { background: `linear-gradient(135deg, ${anim.colors.join(', ')})` } : undefined}>
      {!anim && w.thumb && <img src={w.thumb} alt="" loading="lazy" />}
      {w.kind !== 'image' && <span className="wall-badge">{w.kind === 'video' ? `▶ ${w.duration ? `${Math.round(w.duration)} s` : 'Video'}` : 'Live'}</span>}
    </div>
  )
}

/** Settings → Wallpaper: what's on the desktop, and finding a new one. */
export function WallpaperSection({ s }: { s: SettingsState }) {
  const w = s.wallpaper
  const { run, error, busy } = useAction()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'image' | 'video'>('image')
  const [found, setFound] = useState<{ items: WallItem[]; errors: string[] } | null>(null)
  const [keys, setKeys] = useState<Record<string, string>>({})
  const setIt = (f: () => Promise<string | null>) =>
    run(async () => {
      const e = await f()
      if (e) throw new Error(e)
    })
  const search = () => run(async () => setFound(query.trim() ? await window.settings.wallpaper.search(query, kind) : null))

  return (
    <section id="wallpaper">
      <h2>Wallpaper</h2>
      <div className="wall-now">
        {w.current ? <Preview w={w.current} big /> : <div className="wall-preview big empty">The desktop’s own</div>}
        <div className="wall-now-text">
          <div>{w.current ? w.current.title : 'Your desktop’s own background'}</div>
          <div className="hint">
            {w.current ? creditLine(w.current) : 'The island hasn’t changed it.'}
            {w.live === 'resting' ? ' · resting while a window covers the screen' : w.live === 'playing' ? ' · playing' : ''}
          </div>
          <div className="row">
            {w.history.length > 1 && (
              <button className="secondary" disabled={busy || !!w.busy} onClick={() => setIt(() => window.settings.wallpaper.undo())}>
                Previous
              </button>
            )}
            {w.current && (
              <button className="secondary" disabled={busy || !!w.busy} onClick={() => setIt(() => window.settings.wallpaper.restore())}>
                Desktop’s own
              </button>
            )}
            {w.current?.page && (
              <button className="link" onClick={() => run(() => window.settings.wallpaper.openPage(w.current!.page!))}>
                Where it’s from
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="hint wall-ask">
        Or ask the island: “set my background to a misty forest”, “make it a video of rain on a window”, “another one”, “put the old one back”.
      </div>
      {!w.supported && <div className="warn">Changing the background works on GNOME (Ubuntu), Cinnamon, MATE, KDE and XFCE. This desktop isn’t one of them.</div>}

      <div className="wall-search">
        <div className="row">
          <input
            className="grow"
            placeholder={kind === 'image' ? 'Search photos: “misty mountains”, “city at night”…' : 'Search videos: “ocean waves aerial”, “rain on glass”…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            aria-label="Search for a wallpaper"
          />
          <Segmented
            value={kind}
            options={[
              { value: 'image', label: 'Photos' },
              { value: 'video', label: 'Videos' },
            ]}
            onChange={(v) => {
              setKind(v)
              setFound(null)
            }}
          />
          <button disabled={busy || !query.trim()} onClick={search}>
            Search
          </button>
        </div>
        {w.busy && <div className="hint">{w.busy}</div>}
        {found && (
          <>
            {found.items.length === 0 && <div className="hint">Nothing came up. Try other words{kind === 'video' && !w.keys.pexels && !w.keys.pixabay ? ', or add a Pexels or Pixabay key below for many more videos' : ''}.</div>}
            <div className="wall-grid">
              {found.items.slice(0, 24).map((item) => (
                <button key={item.id} className="wall-tile" title={`${item.title}, ${creditLine(item)}`} disabled={busy || !!w.busy} onClick={() => setIt(() => window.settings.wallpaper.set(item.id))}>
                  <Preview w={item} />
                  <span className="wall-tile-title">{item.title}</span>
                  <span className="wall-tile-meta">
                    {item.width ? `${item.width}×${item.height} · ` : ''}
                    {creditLine(item).replace(/^by [^·]*? on /, '').replace(/ \(.*\)$/, '')}
                  </span>
                </button>
              ))}
            </div>
            {found.errors.length > 0 && <div className="hint">Not answering: {found.errors.join('; ')}</div>}
          </>
        )}
      </div>

      <div className="wall-block">
        <div>Animations</div>
        <div className="hint">Drawn live by the island, slowly, at a low frame rate.</div>
        <div className="wall-grid">
          {ANIMATIONS.map((a) => (
            <button key={a.id} className={`wall-tile${w.current?.id === `island:${a.id}` ? ' on' : ''}`} disabled={busy || !!w.busy} onClick={() => setIt(() => window.settings.wallpaper.animation(a.id))}>
              <div className="wall-preview" style={{ background: `linear-gradient(135deg, ${a.colors.join(', ')})` }} />
              <span className="wall-tile-title">{a.title}</span>
              <span className="wall-tile-meta">{a.note}</span>
            </button>
          ))}
        </div>
      </div>

      {w.history.length > 1 && (
        <div className="wall-block">
          <div>Recent</div>
          <div className="wall-grid">
            {w.history.slice(1, 9).map((item) => (
              <button key={item.id} className="wall-tile" title={item.title} disabled={busy || !!w.busy} onClick={() => setIt(() => window.settings.wallpaper.set(item.id))}>
                <Preview w={item} />
                <span className="wall-tile-title">{item.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <Toggle
        label="Rest live wallpapers when a window covers the screen"
        hint="Videos and animations stop while you can’t see them, so they cost nothing then."
        on={w.pauseCovered}
        onChange={(v) => run(() => window.settings.wallpaper.options({ pauseCovered: v }))}
      />
      <Toggle label="Rest them on battery" on={w.pauseBattery} onChange={(v) => run(() => window.settings.wallpaper.options({ pauseBattery: v }))} />

      <div className="wall-block">
        <div>More photos and videos</div>
        <div className="hint">Openverse and Wikimedia Commons work without anything. Add a free key from these sites for many more (and better) photos and videos. Keys are kept encrypted on this computer.</div>
        {KEY_SITES.map((k) => (
          <div key={k.id} className="row wall-key">
            <span className="wall-key-name">
              {k.name}
              <span className="hint"> · {k.what}</span>
            </span>
            <input
              className="grow"
              type="password"
              placeholder={w.keys[k.id] ? 'Key saved' : `${k.name} API key`}
              value={keys[k.id] ?? ''}
              onChange={(e) => setKeys({ ...keys, [k.id]: e.target.value })}
              aria-label={`${k.name} API key`}
            />
            <button
              className="secondary"
              disabled={!(keys[k.id] ?? '').trim() && !w.keys[k.id]}
              onClick={() =>
                run(async () => {
                  await window.settings.wallpaper.setKey(k.id, keys[k.id] ?? '')
                  setKeys({ ...keys, [k.id]: '' })
                })
              }
            >
              {(keys[k.id] ?? '').trim() ? 'Save' : w.keys[k.id] ? 'Remove' : 'Save'}
            </button>
            <button className="link" onClick={() => run(() => window.settings.wallpaper.openPage(k.where))}>
              Get a key
            </button>
          </div>
        ))}
      </div>
      <div className="row">
        <button className="secondary" onClick={() => run(() => window.settings.wallpaper.openFolder())}>
          Open the wallpapers folder
        </button>
        <span className="hint">Everything you set is saved in Pictures › Dynamic Island Wallpapers.</span>
      </div>
      {(error || w.error) && <div className="error">{error ?? w.error}</div>}
    </section>
  )
}
