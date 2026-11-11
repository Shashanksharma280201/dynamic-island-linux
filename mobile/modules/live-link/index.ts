import { requireOptionalNativeModule } from 'expo'

type LiveLinkModule = {
  start(title: string, text: string, chip: string | null, lock: string | null): void
  update(title: string, text: string, chip: string | null, lock: string | null): void
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
  /** `lock`: all the lock screen shows (no names); `chip`: what's waiting, for Android 16's status bar chip. */
  start: (title: string, text: string, chip: string | null = null, lock: string | null = null) => native?.start(title, text, chip, lock),
  update: (title: string, text: string, chip: string | null = null, lock: string | null = null) => native?.update(title, text, chip, lock),
  stop: () => native?.stop(),
  isRunning: () => native?.isRunning() ?? false,
}
