/** Shown instead of a blank window when Settings can't load. */
export function SettingsProblem({ detail }: { detail: string }) {
  return (
    <main>
      <h1>Dynamic Island</h1>
      <section>
        <p>
          Settings couldn't load. This usually means an older copy of the island is still running (for example
          after updating it). Restart the island and open Settings again.
        </p>
        <p className="hint">{detail}</p>
        <div className="row">
          <button onClick={() => window.settings?.restart?.()}>Restart Dynamic Island</button>
        </div>
      </section>
    </main>
  )
}
