import * as Notifications from 'expo-notifications'
import { AppState, Platform } from 'react-native'
import { liveLink } from '../modules/live-link'
import type { PhoneApproval, PhoneIncoming } from './islandTypes'
import type { DropLink, Live } from './link'
import { sizeText } from './protocol'

/**
 * The phone's notifications for the island:
 * - one per approval waiting (Claude Code, the assistant, a trade), with its
 *   buttons. Private on the lock screen, so nobody can answer from a locked
 *   phone; gone as soon as it's answered anywhere;
 * - files arriving from the computer;
 * - the computer's own notifications, if you want them here too;
 * - a quiet ongoing one while the app keeps in touch in the background.
 */
const CH_APPROVALS = 'approvals'
const CH_FILES = 'files'
const CH_COMPUTER = 'computer'
const PREFIX = 'ap-'

/** Button labels per category: [deny, allow]. */
const CATEGORIES: Record<string, [string, string]> = {
  'ap-claude': ['Deny', 'Allow'],
  'ap-agent': ['Don’t Allow', 'Allow'],
  'ap-plan': ['Keep planning', 'Start'],
  'ap-trade-buy': ['Skip', 'Buy'],
  'ap-trade-sell': ['Skip', 'Sell'],
  'ap-trade': ['Reject', 'Approve'],
}

const categoryOf = (a: PhoneApproval): string | undefined =>
  a.kind === 'claude' ? 'ap-claude' : a.kind === 'agent' ? 'ap-agent' : a.kind === 'plan' ? 'ap-plan' : a.kind === 'trade' ? (a.allow === 'Buy' ? 'ap-trade-buy' : a.allow === 'Sell' ? 'ap-trade-sell' : 'ap-trade') : undefined // questions: open the app to pick

export async function setupNotifications(): Promise<boolean> {
  Notifications.setNotificationHandler({
    // In the app, the card is on screen already: no banner for it.
    handleNotification: async (n) => {
      const approval = String(n.request.identifier).startsWith(PREFIX)
      const open = AppState.currentState === 'active'
      return { shouldShowBanner: !(approval && open), shouldShowList: true, shouldPlaySound: !open, shouldSetBadge: false }
    },
  })
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CH_APPROVALS, {
      name: 'Waiting for your answer',
      description: 'Claude Code’s permissions, trades and the assistant’s questions',
      importance: Notifications.AndroidImportance.MAX,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      vibrationPattern: [0, 220, 120, 220],
    })
    await Notifications.setNotificationChannelAsync(CH_FILES, {
      name: 'Files from your computer',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    })
    await Notifications.setNotificationChannelAsync(CH_COMPUTER, {
      name: 'Your computer’s notifications',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    })
  }
  for (const [id, [deny, allow]] of Object.entries(CATEGORIES)) {
    await Notifications.setNotificationCategoryAsync(id, [
      // Answering from the notification needs the app running, which the background link keeps.
      { identifier: 'deny', buttonTitle: deny, options: { opensAppToForeground: false } },
      { identifier: 'allow', buttonTitle: allow, options: { opensAppToForeground: false } },
    ])
  }
  const perm = await Notifications.getPermissionsAsync()
  if (perm.granted) return true
  return (await Notifications.requestPermissionsAsync()).granted
}

const now = (channelId: string): Notifications.NotificationTriggerInput => (Platform.OS === 'android' ? { channelId } : null)

function approvalBody(a: PhoneApproval): string {
  if (a.kind === 'trade') return [a.body, ...(a.lines ?? []).slice(0, 3).map((l) => `${l.label} ${l.value}`)].filter(Boolean).join(' · ')
  if (a.kind === 'question') return 'Claude has a question. Open to answer.'
  return [a.body.split('\n')[0], a.where ? `in ${a.where}` : ''].filter(Boolean).join(' · ')
}

export type NotifyPrefs = { computer: () => boolean; background: () => boolean }

/**
 * Keep the phone's notifications in step with the island: a notification per
 * approval (gone when answered anywhere), the computer's notifications if
 * wanted, and the background link's ongoing notification. Returns a stop.
 */
export function followIsland(link: DropLink, prefs: NotifyPrefs): () => void {
  const shown = new Set<string>()
  let notesSince = Date.now()
  const seenNotes = new Set<string>()

  const offLive = link.subscribeLive((live: Live) => {
    const v = live.view
    if (prefs.background() && liveLink.available) {
      const text = live.phase === 'live' ? (v?.approvals.length ? `${v.approvals.length} waiting for you` : 'Connected') : live.phase === 'connecting' ? 'Connecting…' : 'Can’t reach it right now'
      if (liveLink.isRunning()) liveLink.update(`Island Drop · ${link.pairing.name}`, text)
      else liveLink.start(`Island Drop · ${link.pairing.name}`, text)
    } else if (liveLink.available && liveLink.isRunning()) liveLink.stop()
    if (!v) return
    const ids = new Set(v.approvals.map((a) => a.id))
    for (const a of v.approvals) {
      if (shown.has(a.id)) continue
      shown.add(a.id)
      void Notifications.scheduleNotificationAsync({
        identifier: `${PREFIX}${a.id}`,
        content: {
          title: a.kind === 'trade' ? `${a.app}: ${a.title}` : a.kind === 'agent' ? `${a.app}: ${a.title}` : `Claude Code: ${a.title}`,
          body: approvalBody(a),
          categoryIdentifier: categoryOf(a),
          data: { approval: a.id },
          sticky: false,
          autoDismiss: true,
        },
        trigger: now(CH_APPROVALS),
      })
    }
    // Answered (here, on the island, or by the engine): its notification goes.
    for (const id of [...shown]) {
      if (ids.has(id)) continue
      shown.delete(id)
      void Notifications.dismissNotificationAsync(`${PREFIX}${id}`).catch(() => {})
    }
    if (prefs.computer()) {
      for (const n of v.notes) {
        const key = `${n.id}@${n.at}`
        if (n.at <= notesSince || seenNotes.has(key)) continue
        seenNotes.add(key)
        void Notifications.scheduleNotificationAsync({ content: { title: n.app === n.title ? n.title : `${n.app}: ${n.title}`, body: n.body ?? '', data: { note: n.id } }, trigger: now(CH_COMPUTER) })
      }
    }
    notesSince = Math.max(notesSince, ...v.notes.map((n) => n.at))
  })

  // A button on an approval's notification: that's your answer.
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const id = r.notification.request.content.data?.approval
    if (typeof id !== 'string') return
    if (r.actionIdentifier === 'allow' || r.actionIdentifier === 'deny') {
      void link.decide(id, r.actionIdentifier).then((res) => {
        if (!res.ok && res.message) void Notifications.scheduleNotificationAsync({ content: { title: 'Your answer didn’t go through', body: res.message }, trigger: now(CH_APPROVALS) })
      })
      void Notifications.dismissNotificationAsync(r.notification.request.identifier).catch(() => {})
    }
  })

  return () => {
    offLive()
    sub.remove()
    if (liveLink.isRunning()) liveLink.stop()
  }
}

/** A file arrived from the computer (shown when the app isn't open). */
export function notifyReceived(f: PhoneIncoming, from: string, ok: boolean, message?: string): void {
  if (AppState.currentState === 'active') return
  void Notifications.scheduleNotificationAsync({
    content: ok ? { title: `${f.name}`, body: `From ${from} · ${sizeText(f.size)}. Tap to open Island Drop.`, data: { received: f.id } } : { title: `${f.name} didn’t arrive`, body: message ?? '' },
    trigger: now(CH_FILES),
  })
}
