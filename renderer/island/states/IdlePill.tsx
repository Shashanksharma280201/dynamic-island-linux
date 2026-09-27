/** Resting state: a slim capsule on the screen edge with a grab bar. */
export function IdlePill() {
  return (
    <div className="capsule idle" title="Click for Control Center, drag to move">
      <span className="grip" />
    </div>
  )
}
