import { useState } from 'react'
import { dueTime, type TaskSummary } from '@shared/crm'
import { Empty, Spinner, errorText, useLoad } from '../common'
import { TrashIcon } from '../../icons'
import { ContactPicker, DuePicker, Field, TaskRow } from './parts'
import type { CrmNav } from './CrmView'

/** Open follow-ups in groups: overdue, today, upcoming, someday. Pure. */
export function groupTasks(tasks: TaskSummary[], now: Date): { title: string; tasks: TaskSummary[] }[] {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
  const groups: Record<string, TaskSummary[]> = { Overdue: [], Today: [], Upcoming: [], Someday: [] }
  for (const t of tasks) {
    const at = t.due ? dueTime(t.due) : null
    if (at == null) groups.Someday.push(t)
    else if (at < now.getTime() && t.due!.includes('T')) groups.Overdue.push(t)
    else if (at < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) groups.Overdue.push(t)
    else if (at < end) groups.Today.push(t)
    else groups.Upcoming.push(t)
  }
  return Object.entries(groups)
    .filter(([, list]) => list.length)
    .map(([title, list]) => ({ title, tasks: list }))
}

/** Everything to do, soonest first; done ones on request. */
export function TasksList({ nav }: { nav: CrmNav }) {
  const [showDone, setShowDone] = useState(false)
  const { data, error, loading } = useLoad<TaskSummary[]>(
    () => window.island.crm.tasks(showDone ? 'done' : 'open'),
    [showDone],
    (r) => window.island.crm.onChanged(() => r()),
  )
  const open = (t: TaskSummary) => () => nav.go(t.contactId ? { kind: 'contact', id: t.contactId } : { kind: 'editTask', id: t.id, task: t })
  return (
    <>
      <div className="chips crm-filters">
        <button className={`chip${!showDone ? ' on' : ''}`} onClick={() => setShowDone(false)}>
          To do
        </button>
        <button className={`chip${showDone ? ' on' : ''}`} onClick={() => setShowDone(true)}>
          Done
        </button>
      </div>
      <div className="list crm-list">
        {!data && loading && <Spinner />}
        {error && !data && <Empty title="Couldn't load your follow-ups" body={error} />}
        {data && !data.length && (
          <Empty
            title={showDone ? 'Nothing done yet' : 'All caught up'}
            body={showDone ? undefined : 'Follow-ups you add (or ask the agent to add) show up here, and the island reminds you when they’re due.'}
            action={
              !showDone && (
                <button className="pill primary" onClick={() => nav.go({ kind: 'editTask' })}>
                  Add Follow-up
                </button>
              )
            }
          />
        )}
        {data &&
          (showDone ? (
            data.map((t) => <TaskRow key={t.id} task={t} />)
          ) : (
            groupTasks(data, new Date()).map((g) => (
              <div key={g.title} className="crm-group">
                <div className={`crm-group-title${g.title === 'Overdue' ? ' late' : ''}`}>{g.title}</div>
                {g.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} onOpen={open(t)} />
                ))}
              </div>
            ))
          ))}
      </div>
    </>
  )
}

/** Add a follow-up, or change one. */
export function TaskFormView({
  task,
  contact,
  dealId,
  nav,
  onTyping,
}: {
  task?: TaskSummary
  contact?: { id: string; name: string }
  dealId?: string
  nav: CrmNav
  onTyping: (on: boolean) => void
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [due, setDue] = useState(task?.due ?? '')
  const [who, setWho] = useState<{ id: string; name: string } | null>(task?.contactId ? { id: task.contactId, name: task.contactName ?? '' } : contact ?? null)
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    try {
      if (task) await window.island.crm.saveTask(task.id, { title, due: due || null })
      else await window.island.crm.saveTask(null, { title, due: due || undefined, contactId: who?.id, dealId })
      nav.back()
    } catch (e) {
      setErr(errorText(e))
    }
  }
  return (
    <div className="crm-form">
      <Field label="Follow-up" placeholder="What to do, like “Send the proposal”" value={title} onChange={setTitle} onTyping={onTyping} autoFocus={!task} onEnter={() => title.trim() && void save()} />
      <DuePicker value={due} onChange={setDue} onTyping={onTyping} />
      {!task && !dealId && <ContactPicker value={who} onChange={setWho} onTyping={onTyping} />}
      {(task || dealId) && who && <div className="caption">With {who.name}</div>}
      {err && <div className="status error">{err}</div>}
      <div className="crm-form-actions">
        {task && (
          <button
            className="icon-btn"
            title="Delete follow-up"
            aria-label="Delete follow-up"
            onClick={() => void window.island.crm.remove('task', task.id).then((b) => (nav.deleted(b, `“${task.title}”`), nav.back()))}
          >
            <TrashIcon />
          </button>
        )}
        <span className="spacer" />
        <button className="pill small" onClick={() => nav.back()}>
          Cancel
        </button>
        <button className="pill small primary" disabled={!title.trim()} onClick={() => void save()}>
          {task ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  )
}
