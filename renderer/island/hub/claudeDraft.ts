import { useEffect } from 'react'

/** A message to finish, handed to the Claude tab's box (it may not be open yet). */
let pending: string | null = null
const boxes = new Set<(text: string) => void>()

export function offerDraft(text: string): void {
  if (boxes.size) for (const b of boxes) b(text)
  else pending = text
}

/** The box takes a draft offered before it opened, and any offered while it's open. */
export function useDraft(take: (text: string) => void): void {
  useEffect(() => {
    if (pending !== null) {
      take(pending)
      pending = null
    }
    boxes.add(take)
    return () => void boxes.delete(take)
  }, [])
}
