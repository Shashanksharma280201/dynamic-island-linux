export function encode(msg: object): string {
  return JSON.stringify(msg) + '\n'
}

export function createDecoder(): (chunk: Buffer | string) => object[] {
  let buf = ''
  return (chunk) => {
    buf += chunk.toString()
    const out: object[] = []
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx)
      buf = buf.slice(idx + 1)
      if (line.trim()) out.push(JSON.parse(line))
    }
    return out
  }
}
