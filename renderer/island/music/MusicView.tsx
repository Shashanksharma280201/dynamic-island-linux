import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import type { SpCollection, SpHome, SpPage, SpPlayer, SpSearch, SpTrack, SpotifyView } from '@shared/spotify'
import { LIKED, greeting, msText, progressNow } from '@shared/spotify'
import { Spinner, errorText, useLoad, useNow } from '../hub/common'
import { SearchField } from '../hub/SearchField'
import { useArtColor } from './color'
import { DevicesSheet, type Pending } from './Devices'
import {
  ChevronDownIcon,
  DeviceIcon,
  HeartIcon,
  HomeIcon,
  LibraryIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  SearchIcon,
  ShuffleIcon,
  SpotifyIcon,
} from '../icons'

type Page = { kind: 'home' } | { kind: 'search' } | { kind: 'library' } | { kind: 'collection'; uri: string } | { kind: 'now' }

const stop = (e: MouseEvent) => e.stopPropagation()

/** Names of playlists / albums seen, for "Playing from …". */
const contextNames = new Map<string, string>()

/** Liked Songs' cover: Spotify's purple-to-blue square with a white heart. */
function Cover({ c, size, round }: { c: Pick<SpCollection, 'kind' | 'image' | 'name'>; size: number; round?: boolean }) {
  const style: CSSProperties = { width: size, height: size, borderRadius: round ? '50%' : size > 60 ? 6 : 4 }
  if (c.kind === 'liked')
    return (
      <div className="sp-cover liked" style={style}>
        <HeartIcon filled size={Math.round(size * 0.42)} />
      </div>
    )
  return c.image ? (
    <img className="sp-cover" src={c.image} alt="" style={style} />
  ) : (
    <div className="sp-cover empty" style={style}>
      ♪
    </div>
  )
}

function PlayButton({ size = 48, playing, onClick, label }: { size?: number; playing?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      className="sp-play"
      style={{ width: size, height: size }}
      aria-label={label}
      title={label}
      onClick={(e) => {
        stop(e)
        onClick()
      }}
    >
      {playing ? <PauseIcon size={Math.round(size * 0.42)} /> : <PlayIcon size={Math.round(size * 0.42)} />}
    </button>
  )
}

function Equalizer() {
  return (
    <span className="sp-eq" aria-label="Now playing">
      <i />
      <i />
      <i />
    </span>
  )
}

function TrackRow({
  t,
  index,
  current,
  playing,
  onPlay,
  showCover = true,
}: {
  t: SpTrack
  index?: number
  current: boolean
  playing: boolean
  onPlay: () => void
  showCover?: boolean
}) {
  return (
    <button className={`sp-row${current ? ' current' : ''}`} onClick={(e) => (stop(e), onPlay())} title={`${t.name} · ${t.artists}`}>
      {index !== undefined && <span className="sp-index">{current && playing ? <Equalizer /> : index + 1}</span>}
      {showCover && <Cover c={{ kind: 'playlist', image: t.image, name: t.name }} size={40} />}
      <span className="sp-row-text">
        <span className="sp-row-title ellipsis">{t.name}</span>
        <span className="sp-row-sub ellipsis">
          {t.explicit && <span className="sp-explicit">E</span>}
          {t.artists}
        </span>
      </span>
      <span className="sp-dur">{msText(t.durationMs)}</span>
    </button>
  )
}

function CollectionRow({ c, onOpen }: { c: SpCollection; onOpen: () => void }) {
  return (
    <button className="sp-row collection" onClick={(e) => (stop(e), onOpen())}>
      <Cover c={c} size={48} round={c.kind === 'artist'} />
      <span className="sp-row-text">
        <span className="sp-row-title ellipsis">{c.name}</span>
        <span className="sp-row-sub ellipsis">{c.subtitle}</span>
      </span>
    </button>
  )
}

function Card({ c, onOpen }: { c: SpCollection; onOpen: () => void }) {
  return (
    <button className="sp-card" onClick={(e) => (stop(e), onOpen())} title={c.name}>
      <Cover c={c} size={112} round={c.kind === 'artist'} />
      <span className="sp-card-title ellipsis">{c.name}</span>
      <span className="sp-card-sub ellipsis">{c.subtitle}</span>
    </button>
  )
}

function Home({ open, play, player }: { open: (uri: string) => void; play: (o: { contextUri?: string; trackUri?: string }) => void; player?: SpPlayer | null }) {
  const { data, error, loading } = useLoad<SpHome>(() => window.island.spotify.home(), [])
  const now = new Date()
  if (!data) return loading ? <Spinner /> : <div className="sp-empty">{error}</div>
  const col = [LIKED, ...data.recent.filter((c) => c.uri !== LIKED.uri)].slice(0, 6)
  for (const c of [...data.recent, ...data.playlists]) contextNames.set(c.uri, c.name)
  return (
    <div className="sp-home">
      <h2 className="sp-h1">{greeting(now)}</h2>
      <div className="sp-tiles">
        {col.map((c) => (
          <button key={c.uri} className="sp-tile" onClick={(e) => (stop(e), open(c.uri))} title={c.name}>
            <Cover c={c} size={44} />
            <span className="sp-tile-name ellipsis">{c.name}</span>
            {c.kind !== 'liked' && (
              <span className="sp-tile-play">
                <PlayButton size={28} label={`Play ${c.name}`} playing={player?.isPlaying && player.contextUri === c.uri} onClick={() => play({ contextUri: c.uri })} />
              </span>
            )}
          </button>
        ))}
      </div>
      {data.recentTracks.length > 0 && (
        <>
          <h3 className="sp-h2">Recently played</h3>
          <div className="sp-list">
            {data.recentTracks.slice(0, 5).map((t) => (
              <TrackRow key={t.uri} t={t} current={player?.track?.uri === t.uri} playing={!!player?.isPlaying} onPlay={() => play({ trackUri: t.uri })} />
            ))}
          </div>
        </>
      )}
      {data.playlists.length > 0 && (
        <>
          <h3 className="sp-h2">Your playlists</h3>
          <div className="sp-shelf">
            {data.playlists.slice(0, 12).map((c) => (
              <Card key={c.uri} c={c} onOpen={() => open(c.uri)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Library({ open }: { open: (uri: string) => void }) {
  const { data, error, loading } = useLoad<SpHome>(() => window.island.spotify.home(), [])
  if (!data) return loading ? <Spinner /> : <div className="sp-empty">{error}</div>
  return (
    <div className="sp-list">
      <h2 className="sp-h1">Your Library</h2>
      <CollectionRow c={LIKED} onOpen={() => open(LIKED.uri)} />
      {data.playlists.map((c) => (
        <CollectionRow key={c.uri} c={c} onOpen={() => open(c.uri)} />
      ))}
    </div>
  )
}

function Search({ open, play, player, onTyping }: { open: (uri: string) => void; play: (o: { trackUri?: string }) => void; player?: SpPlayer | null; onTyping: (on: boolean) => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<SpSearch | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!q.trim()) return setRes(null)
    let live = true
    const t = setTimeout(() => {
      setBusy(true)
      window.island.spotify
        .search(q)
        .then((r) => live && (setRes(r), setErr(null)))
        .catch((e) => live && setErr(errorText(e)))
        .finally(() => live && setBusy(false))
    }, 350)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q])
  return (
    <div className="sp-search">
      <h2 className="sp-h1">Search</h2>
      <div className="sp-searchbox">
        <SearchField value={q} onChange={setQ} onTyping={onTyping} placeholder="What do you want to play?" />
      </div>
      {busy && !res && <Spinner />}
      {err && <div className="sp-empty">{err}</div>}
      {res && (
        <>
          {res.tracks.length > 0 && (
            <>
              <h3 className="sp-h2">Songs</h3>
              <div className="sp-list">
                {res.tracks.slice(0, 6).map((t) => (
                  <TrackRow key={t.uri} t={t} current={player?.track?.uri === t.uri} playing={!!player?.isPlaying} onPlay={() => play({ trackUri: t.uri })} />
                ))}
              </div>
            </>
          )}
          {[
            ['Artists', res.artists],
            ['Albums', res.albums],
            ['Playlists', res.playlists],
          ].map(
            ([title, list]) =>
              (list as SpCollection[]).length > 0 && (
                <div key={title as string}>
                  <h3 className="sp-h2">{title as string}</h3>
                  <div className="sp-shelf">
                    {(list as SpCollection[]).map((c) => (
                      <Card key={c.uri} c={c} onOpen={() => open(c.uri)} />
                    ))}
                  </div>
                </div>
              ),
          )}
          {!res.tracks.length && !res.albums.length && !res.artists.length && !res.playlists.length && (
            <div className="sp-empty">No results for “{q.trim()}”.</div>
          )}
        </>
      )}
      {!q && <div className="sp-empty">Search for songs, artists, albums and playlists.</div>}
    </div>
  )
}

function Collection({ uri, back, play, player }: { uri: string; back: () => void; play: (o: { contextUri?: string; trackUri?: string }) => void; player?: SpPlayer | null }) {
  const { data, error, loading } = useLoad<SpPage>(() => window.island.spotify.page(uri), [uri])
  const c = data?.collection
  if (c) contextNames.set(c.uri, c.name)
  const color = useArtColor(c?.kind === 'liked' ? undefined : c?.image)
  const tint = c?.kind === 'liked' ? 'rgb(80, 56, 160)' : color
  const inThis = player?.contextUri === uri || (uri === LIKED.uri && !!player?.track && data?.tracks.some((t) => t.uri === player.track!.uri))
  const playingHere = !!player?.isPlaying && inThis
  return (
    <div className="sp-collection" style={{ ['--sp-tint' as any]: tint }}>
      <div className="sp-col-head">
        <button className="sp-back" aria-label="Back" onClick={(e) => (stop(e), back())}>
          ‹
        </button>
        {c && (
          <>
            <Cover c={c} size={132} round={c.kind === 'artist'} />
            <div className="sp-col-kind">{c.kind === 'liked' ? 'Playlist' : c.kind[0].toUpperCase() + c.kind.slice(1)}</div>
            <h2 className="sp-col-title">{c.name}</h2>
            <div className="sp-col-sub">
              {c.subtitle.replace(/^(Playlist|Album|Single) · /, '')}
              {c.total !== undefined && ` · ${c.total} songs`}
            </div>
          </>
        )}
      </div>
      {!data && loading && <Spinner />}
      {error && !data && <div className="sp-empty">{error}</div>}
      {c && (
        <div className="sp-actions">
          <PlayButton
            label={playingHere ? 'Pause' : `Play ${c.name}`}
            playing={playingHere}
            onClick={() =>
              playingHere || (inThis && player && !player.isPlaying)
                ? void window.island.spotify.control({ type: 'toggle' })
                : play(c.kind === 'liked' ? { contextUri: LIKED.uri, trackUri: data?.tracks[0]?.uri } : { contextUri: c.uri })
            }
          />
        </div>
      )}
      {data && (
        <div className="sp-list">
          {data.tracks.map((t, i) => (
            <TrackRow
              key={t.uri + i}
              t={t}
              index={i}
              showCover={c?.kind !== 'album'}
              current={player?.track?.uri === t.uri}
              playing={!!player?.isPlaying}
              onPlay={() => play({ contextUri: c?.kind === 'liked' ? undefined : uri, trackUri: t.uri })}
            />
          ))}
          {c && !c.listable && c.kind === 'playlist' && (
            <div className="sp-empty">Spotify only shows the songs of playlists you made or collaborate on. Press play to listen to it.</div>
          )}
          {c?.kind === 'artist' && <div className="sp-empty">Press play for this artist&apos;s music.</div>}
        </div>
      )}
    </div>
  )
}

function Progress({ p, dark }: { p: SpPlayer; dark?: boolean }) {
  const now = useNow(500)
  const dur = p.track?.durationMs ?? 0
  const pos = progressNow(p, now)
  const [drag, setDrag] = useState<number | null>(null)
  const shown = drag ?? pos
  return (
    <div className={`sp-progress${dark ? ' dark' : ''}`}>
      <input
        type="range"
        min={0}
        max={Math.max(1, dur)}
        value={Math.min(shown, dur)}
        aria-label="Song position"
        style={{ ['--sp-fill' as any]: `${dur ? (shown / dur) * 100 : 0}%` }}
        onClick={stop}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={() => {
          if (drag !== null) void window.island.spotify.control({ type: 'seek', ms: drag })
          setDrag(null)
        }}
      />
      <div className="sp-times">
        <span>{msText(shown)}</span>
        <span>{msText(dur)}</span>
      </div>
    </div>
  )
}

function LikeButton({ p, size = 22 }: { p: SpPlayer; size?: number }) {
  if (!p.track) return null
  const on = !!p.liked
  return (
    <button
      className={`sp-icon-btn like${on ? ' on' : ''}`}
      aria-label={on ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
      title={on ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
      onClick={(e) => (stop(e), void window.island.spotify.like(p.track!.uri, !on))}
    >
      <HeartIcon filled={on} size={size} />
    </button>
  )
}

function NowPlaying({ p, close, contextName, devices }: { p: SpPlayer; close: () => void; contextName?: string; devices: () => void }) {
  const color = useArtColor(p.track?.art ?? p.track?.image)
  const t = p.track
  const ctl = (cmd: { type: string; [k: string]: unknown }) => void window.island.spotify.control(cmd)
  const nextRepeat = p.repeat === 'off' ? 'context' : p.repeat === 'context' ? 'track' : 'off'
  return (
    <div className="sp-now" style={{ ['--sp-tint' as any]: color }}>
      <div className="sp-now-head">
        <button className="sp-icon-btn" aria-label="Close" onClick={(e) => (stop(e), close())}>
          <ChevronDownIcon />
        </button>
        <div className="sp-now-from">
          <span>PLAYING FROM {p.contextUri?.includes(':playlist:') ? 'PLAYLIST' : p.contextUri?.includes(':album:') ? 'ALBUM' : 'SPOTIFY'}</span>
          <b className="ellipsis">{contextName ?? t?.album ?? ''}</b>
        </div>
        <span style={{ width: 32 }} />
      </div>
      {t?.art || t?.image ? <img className="sp-now-art" src={t.art ?? t.image} alt="" /> : <div className="sp-now-art empty" />}
      <div className="sp-now-meta">
        <div className="sp-now-text">
          <div className="sp-now-title ellipsis">{t?.name ?? 'Nothing playing'}</div>
          <div className="sp-now-artist ellipsis">{t?.artists}</div>
        </div>
        <LikeButton p={p} size={24} />
      </div>
      <Progress p={p} />
      <div className="sp-controls">
        <button className={`sp-icon-btn toggle${p.shuffle ? ' on' : ''}`} aria-label="Shuffle" title="Shuffle" onClick={(e) => (stop(e), ctl({ type: 'shuffle', on: !p.shuffle }))}>
          <ShuffleIcon />
        </button>
        <button className="sp-icon-btn big" aria-label="Previous" onClick={(e) => (stop(e), ctl({ type: 'previous' }))}>
          <PrevIcon />
        </button>
        <button className="sp-play white" aria-label={p.isPlaying ? 'Pause' : 'Play'} onClick={(e) => (stop(e), ctl({ type: 'toggle' }))}>
          {p.isPlaying ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
        </button>
        <button className="sp-icon-btn big" aria-label="Next" onClick={(e) => (stop(e), ctl({ type: 'next' }))}>
          <NextIcon />
        </button>
        <button className={`sp-icon-btn toggle${p.repeat !== 'off' ? ' on' : ''}`} aria-label="Repeat" title="Repeat" onClick={(e) => (stop(e), ctl({ type: 'repeat', state: nextRepeat }))}>
          <RepeatIcon one={p.repeat === 'track'} />
        </button>
      </div>
      <button className="sp-device" onClick={(e) => (stop(e), devices())} aria-label="Connect to a device">
        <DeviceIcon /> {p.device ? p.device.name : 'Connect to a device'}
      </button>
    </div>
  )
}

function MiniPlayer({ p, onOpen, devices }: { p: SpPlayer; onOpen: () => void; devices: () => void }) {
  const color = useArtColor(p.track?.art ?? p.track?.image)
  const now = useNow(1000)
  const dur = p.track?.durationMs ?? 0
  const pct = dur ? (progressNow(p, now) / dur) * 100 : 0
  if (!p.track) return null
  return (
    <div className="sp-mini" style={{ ['--sp-tint' as any]: color }} onClick={(e) => (stop(e), onOpen())} role="button" aria-label="Open Now Playing">
      <img className="sp-mini-art" src={p.track.image} alt="" />
      <div className="sp-mini-text">
        <div className="sp-mini-title ellipsis">{p.track.name}</div>
        <div className="sp-mini-sub ellipsis">
          {p.device ? (
            <span className="sp-mini-device">
              <DeviceIcon /> {p.device.name}
            </span>
          ) : (
            p.track.artists
          )}
        </div>
      </div>
      <button className="sp-icon-btn" aria-label="Connect to a device" title="Connect to a device" onClick={(e) => (stop(e), devices())}>
        <DeviceIcon />
      </button>
      <LikeButton p={p} />
      <button className="sp-icon-btn" aria-label={p.isPlaying ? 'Pause' : 'Play'} onClick={(e) => (stop(e), void window.island.spotify.control({ type: 'toggle' }))}>
        {p.isPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
      </button>
      <span className="sp-mini-line" style={{ width: `${pct}%` }} />
    </div>
  )
}

function Connect({ view }: { view: SpotifyView }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const needsClient = view.status === 'needs-client'
  return (
    <div className="sp-connect">
      <span className="sp-logo">
        <SpotifyIcon size={56} />
      </span>
      <h2>{needsClient ? 'Spotify isn’t set up yet' : 'Connect Spotify'}</h2>
      <p>
        {needsClient
          ? 'Create a free Spotify app (takes a minute) and paste its Client ID in Settings. The steps are there.'
          : 'Browse your library, search, and control what plays, right here.'}
      </p>
      <button
        className="sp-pill"
        disabled={busy || view.status === 'signing-in'}
        onClick={async (e) => {
          stop(e)
          if (needsClient) return window.island.openSettings('spotify')
          setBusy(true)
          setErr(null)
          await window.island.spotify.signIn().catch((x) => setErr(errorText(x)))
          setBusy(false)
        }}
      >
        {needsClient ? 'Open Settings' : busy || view.status === 'signing-in' ? 'Waiting for your browser…' : 'Log in with Spotify'}
      </button>
      {(err || view.error) && <div className="sp-error">{err || view.error}</div>}
    </div>
  )
}

/** The Music tab: Spotify, in Spotify's own style. */
export function MusicView({ onTyping }: { onTyping: (on: boolean) => void }) {
  const [view, setView] = useState<SpotifyView | null>(null)
  const [stack, setStack] = useState<Page[]>([{ kind: 'home' }])
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<{ pending?: Pending; noDevice?: boolean } | null>(null)
  useEffect(() => {
    let live = true
    window.island.spotify.state().then((v) => live && setView(v)).catch(() => {})
    const off = window.island.spotify.onChange(setView)
    window.island.spotify.watch(true)
    return () => {
      live = false
      off()
      window.island.spotify.watch(false)
    }
  }, [])
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 6000)
    return () => clearTimeout(t)
  }, [error])

  if (!view) return <div className="music" />
  if (view.status !== 'ready') return <div className="music">{<Connect view={view} />}</div>

  const page = stack[stack.length - 1]
  const go = (p: Page) => setStack((s) => [...s, p])
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
  const root = (p: Page) => setStack([p])
  const open = (uri: string) => go({ kind: 'collection', uri })
  const play = (o: Pending) =>
    window.island.spotify
      .play(o)
      .then((r) => {
        // Nothing open anywhere: ask where to play (phone, browser, …).
        if ('needsDevice' in r) setSheet({ pending: o, noDevice: true })
      })
      .catch((e) => setError(errorText(e)))
  const devicesSheet = sheet && <DevicesSheet view={view} pending={sheet.pending} noDevice={sheet.noDevice} onClose={() => setSheet(null)} />
  const openDevices = () => setSheet({})
  const p = view.player

  if (page.kind === 'now' && p)
    return (
      <div className="music">
        <NowPlaying p={p} close={back} devices={openDevices} contextName={p.contextUri ? contextNames.get(p.contextUri) : undefined} />
        {devicesSheet}
      </div>
    )

  const tabs: { kind: 'home' | 'search' | 'library'; label: string; icon: ReactNode }[] = [
    { kind: 'home', label: 'Home', icon: <HomeIcon filled={stack[0].kind === 'home'} /> },
    { kind: 'search', label: 'Search', icon: <SearchIcon /> },
    { kind: 'library', label: 'Your Library', icon: <LibraryIcon /> },
  ]
  return (
    <div className="music">
      <div className="sp-scroll">
        {page.kind === 'home' && <Home open={open} play={play} player={p} />}
        {page.kind === 'library' && <Library open={open} />}
        {page.kind === 'search' && <Search open={open} play={play} player={p} onTyping={onTyping} />}
        {page.kind === 'collection' && <Collection key={page.uri} uri={page.uri} back={back} play={play} player={p} />}
      </div>
      {error && <div className="sp-error toast">{error}</div>}
      {view.connecting && !sheet && <div className="sp-connecting">{view.connecting}</div>}
      {p?.track && <MiniPlayer p={p} onOpen={() => go({ kind: 'now' })} devices={openDevices} />}
      <nav className="sp-nav">
        {tabs.map((t) => (
          <button key={t.kind} className={stack[0].kind === t.kind && stack.length === 1 ? 'on' : ''} onClick={(e) => (stop(e), root({ kind: t.kind }))}>
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      {devicesSheet}
    </div>
  )
}
