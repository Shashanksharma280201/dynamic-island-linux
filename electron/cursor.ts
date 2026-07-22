// @ts-expect-error - x11 ships no types
import x11 from 'x11'

export function pickPointer(reply: { rootX: number; rootY: number }): {
  x: number
  y: number
} {
  return { x: reply.rootX, y: reply.rootY }
}

let clientP: Promise<{ X: any; root: number }> | null = null
function getClient(): Promise<{ X: any; root: number }> {
  if (!clientP) {
    clientP = new Promise<{ X: any; root: number }>((resolve, reject) => {
      x11.createClient((err: unknown, display: any) => {
        if (err || !display) return reject(err ?? new Error('no display'))
        resolve({ X: display.client, root: display.screen[0].root })
      })
    }).catch((e) => {
      clientP = null // allow retry on next call
      throw e
    })
  }
  return clientP
}

export async function readCursor(): Promise<{ x: number; y: number } | null> {
  try {
    const { X, root } = await getClient()
    return await new Promise((resolve) => {
      X.QueryPointer(root, (err: unknown, p: any) => {
        if (err || !p) return resolve(null)
        resolve(pickPointer(p))
      })
    })
  } catch {
    return null
  }
}
