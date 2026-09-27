/** "+N" pill for activities waiting behind the one shown. */
export function Badge({ count }: { count: number }) {
  if (count <= 0) return null
  return <span className="badge">+{count}</span>
}
