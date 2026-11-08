import { metaText, type AnswerMeta } from '@shared/engine'

/**
 * Where an answer ran, how long it took and what it cost ("local model ·
 * 1.4 s · 0 ¢"), with Ask cloud when it ran here: asking is your yes.
 */
export function AnswerChip({ meta, onCloud, cloud }: { meta: AnswerMeta; onCloud?: () => void; cloud?: string | null }) {
  return (
    <div className="answer-chip-row">
      <span className={`answer-chip ${meta.where}`} title={meta.where === 'local' ? 'Answered on this computer: nothing left it' : `Answered by ${meta.label}`}>
        <span className="answer-dot" aria-hidden="true" />
        {metaText(meta)}
      </span>
      {meta.where === 'local' && onCloud && (
        <button className="answer-cloud" onClick={onCloud} title={cloud ? `Ask ${cloud} instead (it goes to the cloud)` : 'Ask the cloud instead'}>
          Ask cloud
        </button>
      )}
    </div>
  )
}

/** The cloud needs your yes: one line and one button. */
export function CloudConsent({ label, onYes, onNo }: { label: string; onYes: () => void; onNo?: () => void }) {
  return (
    <div className="cloud-consent" role="group" aria-label="Ask the cloud?">
      <span>There’s no model on this computer for this. Ask {label}? It goes to the cloud.</span>
      <span className="cloud-consent-actions">
        {onNo && (
          <button className="pill small" onClick={onNo}>
            Not now
          </button>
        )}
        <button className="pill primary small" onClick={onYes}>
          Ask {label.replace(/ \(.*\)$/, '')}
        </button>
      </span>
    </div>
  )
}
