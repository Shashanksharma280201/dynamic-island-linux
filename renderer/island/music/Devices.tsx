import { useEffect, useState, type MouseEvent } from 'react'
import type { SpDevice, SpotifyView } from '@shared/spotify'
import { errorText } from '../hub/common'
import { DeviceIcon, GlobeIcon, PhoneIcon, RefreshIcon, SpeakerBoxIcon, XIcon } from '../icons'

export type Pending = { contextUri?: string; trackUri?: string }

const stop = (e: MouseEvent) => e.stopPropagation()

function TypeIcon({ type }: { type: string }) {
  if (type === 'Computer') return <DeviceIcon />
  if (type === 'Smartphone' || type === 'Tablet') return <PhoneIcon />
  return <SpeakerBoxIcon />
}

/**
 * Spotify's "Connect to a device" sheet: pick where music plays. Shown when
 * you press play but nothing is open anywhere, or from the player.
 */
export function DevicesSheet({
  view,
  pending,
  noDevice,
  onClose,
}: {
  view: SpotifyView
  /** What to play once a device is chosen (else playback just moves). */
  pending?: Pending
  noDevice?: boolean
  onClose: () => void
}) {
  const [devices, setDevices] = useState<SpDevice[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = () =>
    window.island.spotify
      .devices()
      .then(setDevices)
      .catch((e) => setErr(errorText(e)))
  // Keep checking: a phone shows up once you open Spotify on it.
  useEffect(() => {
    void load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [])
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    setErr(null)
    try {
      const r: any = await fn()
      if (r?.needsDevice) setErr('That device isn’t available any more. Pick another.')
      else onClose()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(null)
    }
  }
  const choose = (d: SpDevice) =>
    act(d.id, () => (pending ? window.island.spotify.play(pending, d.id) : window.island.spotify.transfer(d.id)))
  const current = devices?.find((d) => d.active)
  return (
    <div className="sp-sheet-wrap" onClick={(e) => (stop(e), onClose())}>
      <div className="sp-sheet" onClick={stop} role="dialog" aria-label="Connect to a device">
        <div className="sp-sheet-head">
          <h3>Connect to a device</h3>
          <button className="sp-icon-btn" aria-label="Refresh devices" title="Refresh" onClick={() => void load()}>
            <RefreshIcon />
          </button>
          <button className="sp-icon-btn" aria-label="Close" onClick={onClose}>
            <XIcon />
          </button>
        </div>
        {noDevice && <p className="sp-sheet-note">Nothing is playing on any of your devices yet. Choose where to play:</p>}
        {current && (
          <div className="sp-device-row current">
            <TypeIcon type={current.type} />
            <span>
              <b>Current device</b>
              <small>{current.name}</small>
            </span>
          </div>
        )}
        {devices?.filter((d) => !d.active).map((d) => (
          <button key={d.id} className="sp-device-row" disabled={!!busy} onClick={() => void choose(d)}>
            <TypeIcon type={d.type} />
            <span>
              <b>{d.name}</b>
              <small>{busy === d.id ? 'Connecting…' : d.type === 'Smartphone' ? 'Spotify on your phone' : 'Spotify Connect'}</small>
            </span>
          </button>
        ))}
        <button
          className="sp-device-row web"
          disabled={!!busy}
          onClick={() => void act('web', () => window.island.spotify.playInBrowser(pending ?? {}))}
        >
          <GlobeIcon />
          <span>
            <b>Play in your browser</b>
            <small>{busy === 'web' ? view.connecting ?? 'Opening the Spotify Web Player…' : 'Opens the Spotify Web Player and plays there'}</small>
          </span>
        </button>
        {err && <div className="sp-error">{err}</div>}
        <p className="sp-sheet-hint">
          Don&apos;t see your phone? Open Spotify on it and it appears here.
          {view.appInstalled ? '' : ' Or install the Spotify app for Linux to play on this computer.'}
        </p>
      </div>
    </div>
  )
}
