import { requireOptionalNativeModule } from 'expo'

export type SharedFile = { uri: string; name: string; size: number; mimeType?: string | null }

type ShareIntakeModule = {
  take(): Promise<SharedFile[]>
  addListener(event: 'onShare', listener: () => void): { remove(): void }
}

/**
 * Files other apps share to Island Drop (Share -> Island Drop). Missing in Expo
 * Go and on iOS: then sharing to the app just isn't offered.
 */
const native = requireOptionalNativeModule<ShareIntakeModule>('ShareIntake')

export const shareIntake = {
  available: !!native,
  /** What was shared since the last call (once), copied into the app. */
  take: async (): Promise<SharedFile[]> => {
    try {
      return (await native?.take()) ?? []
    } catch {
      return []
    }
  },
  /** A share came in while the app was open. */
  onShare: (cb: () => void): (() => void) => {
    const sub = native?.addListener('onShare', cb)
    return () => sub?.remove()
  },
}
