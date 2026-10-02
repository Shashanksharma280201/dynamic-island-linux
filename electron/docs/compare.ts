/**
 * What changed between two versions of a text: a line diff (longest common
 * subsequence) with a little context, short enough for the agent to explain.
 */

export type DiffOp = { op: '=' | '-' | '+'; line: string }

/** Line-by-line diff. Pure. */
export function diffLines(a: string[], b: string[]): DiffOp[] {
  // Trim the common start and end first: most edits are small.
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const A = a.slice(start, endA)
  const B = b.slice(start, endB)
  if (A.length * B.length > 4_000_000) throw new Error('These documents are too different or too long to compare line by line.')
  const lcs: number[][] = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0))
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) lcs[i][j] = A[i] === B[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const mid: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) {
      mid.push({ op: '=', line: A[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) mid.push({ op: '-', line: A[i++] })
    else mid.push({ op: '+', line: B[j++] })
  }
  while (i < A.length) mid.push({ op: '-', line: A[i++] })
  while (j < B.length) mid.push({ op: '+', line: B[j++] })
  return [...a.slice(0, start).map((line) => ({ op: '=' as const, line })), ...mid, ...a.slice(endA).map((line) => ({ op: '=' as const, line }))]
}

/** Lines of a document for comparing: trimmed, blank lines dropped. Pure. */
export function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/** The changes with up to `context` unchanged lines around each, in unified-diff style. Pure. */
export function diffSummary(a: string, b: string, context = 1, maxLines = 400): { text: string; added: number; removed: number } {
  const ops = diffLines(linesOf(a), linesOf(b))
  const added = ops.filter((o) => o.op === '+').length
  const removed = ops.filter((o) => o.op === '-').length
  if (!added && !removed) return { text: 'The two documents have the same text.', added, removed }
  const keep = new Set<number>()
  ops.forEach((o, k) => {
    if (o.op !== '=') for (let d = -context; d <= context; d++) keep.add(k + d)
  })
  const out: string[] = []
  let last = -2
  for (let k = 0; k < ops.length && out.length < maxLines; k++) {
    if (!keep.has(k)) continue
    if (k !== last + 1 && k > 0) out.push('…') // lines were skipped
    const o = ops[k]
    out.push(`${o.op === '=' ? ' ' : o.op} ${o.line}`)
    last = k
  }
  return { text: out.join('\n'), added, removed }
}
