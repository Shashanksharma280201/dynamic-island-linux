import { useEffect, useState } from 'react'
import type { SettingsState } from '@shared/types'
import type { DragConfig } from '@shared/dragActions'
import { Segmented, Toggle, useAction } from './Settings'

const WHY: Record<string, string> = {
  wayland: 'For now it needs an X11 session (“Ubuntu on Xorg” at the login screen). Wayland is coming',
  'no-x11': 'It couldn’t reach the X server, so it’s off for now',
  'no-xfixes': 'This X server can’t tell when a drag starts (no XFixes), so it’s off',
  'no-helper': 'Its drag watcher couldn’t start, so it’s off for now',
}

/** Settings → Drag actions: the ring that opens around a file you drag, in any app. */
export function DragSection({ s }: { s: SettingsState }) {
  const { run, error } = useAction()
  const d = s.drag
  const set = (patch: Partial<DragConfig>) => run(() => window.settings.setDrag(patch))
  // The slider saves when you let go of it.
  const [ms, setMs] = useState(d.dwellMs)
  useEffect(() => setMs(d.dwellMs), [d.dwellMs])
  const saveMs = () => ms !== d.dwellMs && void set({ dwellMs: ms })
  return (
    <section id="drag">
      <h2>Drag actions</h2>
      {!d.available ? (
        <p className="hint">Drag a file and hold still to convert it, shrink it, copy its text or ask Claude about it. Not available on this system yet.</p>
      ) : (
        <>
          <Toggle
            label="Show the ring when I drag a file"
            hint={d.on && d.problem ? WHY[d.problem] ?? 'It couldn’t start here' : 'Drag a file in any app and hold still: convert it, shrink it, copy its text or ask Claude. Off: dragging works as if Dynamic Island weren’t there'}
            on={d.on}
            onChange={(on) => void set({ on })}
          />
          {d.on && (
            <>
              <div className="toggle-row">
                <div>
                  <div>Open it when</div>
                  <div className="hint">Alt opens it at once, without waiting</div>
                </div>
                <Segmented
                  value={d.when}
                  options={[
                    { value: 'still', label: 'I hold still' },
                    { value: 'alt', label: 'I press Alt' },
                    { value: 'either', label: 'Either' },
                  ]}
                  onChange={(when) => void set({ when })}
                />
              </div>
              {d.when !== 'alt' && (
                <div className="toggle-row">
                  <div>
                    <div>Hold still for</div>
                    <div className="hint">Shorter opens it sooner; longer keeps it out of quick drags</div>
                  </div>
                  <div className="range-row">
                    <input type="range" min={200} max={900} step={20} value={ms} aria-label="Hold still for" onChange={(e) => setMs(Number(e.target.value))} onPointerUp={saveMs} onKeyUp={saveMs} onBlur={saveMs} />
                    <span className="range-value">{ms} ms</span>
                  </div>
                </div>
              )}
              <div className="toggle-row">
                <div>
                  <div>Save results</div>
                  <div className="hint">Nothing is overwritten: each result is a new file</div>
                </div>
                <select className="display-select" value={d.saveTo} onChange={(e) => void set({ saveTo: e.target.value as DragConfig['saveTo'] })}>
                  <option value="next">Next to the original</option>
                  <option value="downloads">In Downloads</option>
                </select>
              </div>
            </>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
