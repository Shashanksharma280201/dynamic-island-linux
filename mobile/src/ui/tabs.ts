/** The app's tabs and where they sit in the bar (no React here, so it can be tested on its own). */

export type TabId = 'island' | 'claude' | 'files' | 'inbox' | 'more'
export const TABS: TabId[] = ['island', 'claude', 'files', 'inbox', 'more']

/** A tab: a circle this wide. The bar is five of them side by side, in the middle of the screen. */
export const TAB_SIZE = 52

/** Where a tab's middle is across a screen `W` wide (files landing on the phone fly to the Files tab). Pure. */
export const tabCenterX = (W: number, t: TabId) => W / 2 + (TABS.indexOf(t) - (TABS.length - 1) / 2) * TAB_SIZE
