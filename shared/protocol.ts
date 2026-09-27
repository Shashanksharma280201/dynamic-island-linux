export function encode(msg: object): string {
  return JSON.stringify(msg) + '\n'
}

/** Max bytes buffered without a newline before the partial line is dropped. */
const MAX_LINE = 1024 * 1024

/**
 * Newline-delimited JSON decoder. Never throws: malformed lines and
 * non-object values are skipped, and an oversized partial line is discarded.
 */
export function createDecoder(): (chunk: Buffer | string) => object[] {
  let buf = ''
  return (chunk) => {
    buf += chunk.toString()
    const out: object[] = []
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx)
      buf = buf.slice(idx + 1)
      if (!line.trim()) continue
      try {
        const v = JSON.parse(line)
        if (v && typeof v === 'object') out.push(v)
      } catch {
        // skip malformed line
      }
    }
    if (buf.length > MAX_LINE) buf = ''
    return out
  }
}

/** Default socket path shared by the app and the hook. */
export function defaultSocketPath(env: NodeJS.ProcessEnv, uid: number | string): string {
  if (env.DYNAMIC_ISLAND_SOCK) return env.DYNAMIC_ISLAND_SOCK
  if (env.XDG_RUNTIME_DIR) return `${env.XDG_RUNTIME_DIR}/dynamic-island.sock`
  return `/tmp/dynamic-island-${uid}.sock`
}
