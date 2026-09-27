// @ts-expect-error - x11 ships no types
import x11 from 'x11'

export function pickPointer(reply: { rootX: number; rootY: number }): {
  x: number
  y: number
} {
  return { x: reply.rootX, y: reply.rootY }
}

type Client = { X: any; root: number }
let clientP: Promise<Client> | null = null

function getClient(): Promise<Client> {
  if (!clientP) {
    clientP = new Promise<Client>((resolve, reject) => {
      const display = x11.createClient((err: unknown, d: any) => {
        if (err || !d) return reject(err ?? new Error('no display'))
        resolve({ X: d.client, root: d.screen[0].root })
      })
      // A dropped X connection must not crash the app; reconnect lazily.
      display?.on?.('error', () => {
        clientP = null
      })
    }).catch((e) => {
      clientP = null // allow retry on next call
      throw e
    })
  }
  return clientP
}

/** Global cursor position in physical root-window pixels, or null. */
export async function readCursor(): Promise<{ x: number; y: number } | null> {
  if (!process.env.DISPLAY) return null
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

export async function closeCursor(): Promise<void> {
  const p = clientP
  clientP = null
  try {
    ;(await p)?.X.terminate?.()
  } catch {
    // already gone
  }
}
