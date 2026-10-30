import { requireOptionalNativeModule } from 'expo'

type LiveLinkModule = {
  start(title: string, text: string): void
  update(title: string, text: string): void
  stop(): void
  isRunning(): boolean
}

/**
 * The "connected to your computer" foreground service. Missing in Expo Go and
 * on iOS: then the app still works, but only while it's open.
 */
const native = requireOptionalNativeModule<LiveLinkModule>('LiveLink')

export const liveLink = {
  available: !!native,
  start: (title: string, text: string) => native?.start(title, text),
  update: (title: string, text: string) => native?.update(title, text),
  stop: () => native?.stop(),
  isRunning: () => native?.isRunning() ?? false,
}
