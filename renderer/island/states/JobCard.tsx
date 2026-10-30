import type { JobState } from '@shared/types'
import { Orb } from '../../orb/Orb'
import { XIcon } from '../icons'

const Check = () => (
  <svg className="job-ico" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: 2.6 }}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)
const Bang = () => (
  <svg className="job-ico" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: 2.4 }}>
    <path d="M12 7v6M12 17h.01" />
  </svg>
)

/**
 * What a drag action is doing, on the island: a pill with the orb while it
 * works, then the file it made (drag it straight out, open it, show it, or
 * undo), or what went wrong in plain words.
 */
export function JobCard({ id, job }: { id: string; job: JobState }) {
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  const close = (e: React.MouseEvent) => {
    e.stopPropagation()
    window.island.dismiss(id)
  }
  if (job.phase === 'working')
    return (
      <div className="card job" data-job="working">
        <div className="row">
          <Orb state="working" size={24} />
          <div className="job-text">
            <div className="title ellipsis">{job.title}</div>
            <div className="job-sub ellipsis">{job.sub}</div>
          </div>
        </div>
        <div className={`job-bar${job.progress === undefined ? ' busy' : ''}`}>
          <i style={job.progress === undefined ? undefined : { width: `${Math.round(Math.max(0.04, job.progress) * 100)}%` }} />
        </div>
      </div>
    )
  const r = job.result
  return (
    <div className={`card job ${job.phase}`} data-job={job.phase}>
      <div className="row">
        <span className={`job-mark ${job.phase === 'error' ? 'bad' : 'ok'}`}>{job.phase === 'error' ? <Bang /> : <Check />}</span>
        <div className="job-text">
          <div className="title ellipsis">{job.title}</div>
          {!r && <div className="job-sub ellipsis">{job.sub}</div>}
        </div>
        <button className="close-btn" aria-label="Dismiss" title="Dismiss" onClick={close}>
          <XIcon size={10} />
        </button>
      </div>
      {job.note && <div className="job-note">{job.note}</div>}
      {r && (
        <>
          <div
            className="job-file"
            draggable
            title="Drag it into an email, a chat or a folder"
            onClick={stop}
            onDragStart={(e) => {
              // The system drag carries the real file, so apps take it as one.
              e.preventDefault()
              window.island.jobs.drag(id)
            }}
          >
            {r.thumb ? (
              <img className="job-thumb" src={r.thumb} alt="" />
            ) : (
              <span className="job-doc">
                <i />
                <b style={{ background: r.color }}>{r.ext.toUpperCase()}</b>
              </span>
            )}
            <div className="job-text">
              <div className="job-name ellipsis">{r.name}</div>
              <div className="job-sub ellipsis">{r.meta}</div>
            </div>
          </div>
          <div className="job-actions" onClick={stop}>
            <button className="pill primary small" onClick={() => window.island.jobs.open(id)}>
              Open
            </button>
            <button className="pill small" onClick={() => window.island.jobs.show(id)}>
              Show in folder
            </button>
            <button className="plain muted" onClick={() => window.island.jobs.undo(id)}>
              Undo
            </button>
          </div>
        </>
      )}
    </div>
  )
}
