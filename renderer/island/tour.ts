import type { Activity } from '@shared/types'
import type { AgentSession } from '@shared/sessions'

/**
 * "Show me around": a short tour of what the island does, with example cards
 * (nothing real is touched). Each step shows its activities and says one thing.
 */
export type TourStep = {
  title: string
  body: string
  /** What the island shows for this step. */
  activities: (now: number) => Activity[]
  /** Open the card even without a hover. */
  expanded?: boolean
}

const session = (now: number, over: Partial<AgentSession>): AgentSession => ({
  id: 'tour-session',
  agent: 'claude-code',
  cwd: '~/projects/shop',
  project: 'shop',
  phase: 'working',
  prompt: 'Fix the cart total and add a test',
  steps: [
    { id: 't1', tool: 'Read', label: 'Reading cart.ts', at: now - 9000, done: true },
    { id: 't2', tool: 'Edit', label: 'Editing cart.ts', at: now - 6000, done: true, stat: { added: 4, removed: 1 } },
    { id: 't3', tool: 'Bash', label: 'Running npm test', at: now - 2000, done: false },
  ],
  turnSteps: 3,
  added: 4,
  removed: 1,
  edits: 1,
  files: [{ file: '~/projects/shop/cart.ts', added: 4, removed: 1, hunks: [] }],
  startedAt: now - 60_000,
  turnStartedAt: now - 12_000,
  lastAt: now,
  ...over,
})

export function tourSteps(name: string, panelKey: string): TourStep[] {
  return [
    {
      title: `Hi, I'm ${name}`,
      body: `I sit on the edge of your screen. Rest the pointer on me to peek, click me (or press ${panelKey}) for the panel, and drag me wherever you like.`,
      activities: () => [],
    },
    {
      title: 'Music',
      body: 'Whatever plays, in any app, shows here. Hover for the controls; click the bar to seek.',
      expanded: true,
      activities: (now) => [
        {
          kind: 'media',
          id: 'tour-media',
          priority: 1,
          media: { title: 'Midnight City', artist: 'M83', playing: true, canControl: true, length: 243, position: 61, positionAt: now, canSeek: true, shuffle: false, loop: 'None' },
        },
      ],
    },
    {
      title: 'Notifications',
      body: 'They pop up here and close by themselves (the bar shows when). Several at once? Clear them all. Every one waits in the Notifications tab.',
      activities: () => [
        { kind: 'notification', id: 'tour-n1', priority: 5, notification: { app: 'Mail', summary: 'Alice', body: 'Lunch at 1?' } },
        { kind: 'notification', id: 'tour-n2', priority: 5, notification: { app: 'Calendar', summary: 'Standup in 5 minutes', body: 'Room 2' } },
        { kind: 'notification', id: 'tour-n3', priority: 5, seq: 3, closes: 9000, notification: { app: 'Slack', summary: 'Design team', body: 'New mockups are up' } },
      ],
    },
    {
      title: 'Claude Code, from any terminal',
      body: 'While it works I show what it’s doing. Rest on me for the current step, or open Sessions for every step and diff.',
      expanded: true,
      activities: (now) => [{ kind: 'session', id: 'agent-sessions', priority: 2, session: session(now, {}) }],
    },
    {
      title: 'When it needs you',
      body: 'Approve, deny, or answer its questions right here, without finding the terminal.',
      activities: () => [
        {
          kind: 'approval',
          id: 'tour-question',
          priority: 10,
          request: {
            id: 'tour-question',
            toolName: 'AskUserQuestion',
            inputSummary: '',
            cwd: '~/projects/shop',
            toolInput: {
              questions: [
                {
                  question: 'Where should the tax rate come from?',
                  header: 'Tax',
                  multiSelect: false,
                  options: [
                    { label: 'A setting', description: 'One rate, set in config' },
                    { label: 'Per country', description: 'Look it up from the address' },
                  ],
                },
              ],
            },
          },
        },
      ],
    },
    {
      title: 'And when it’s done',
      body: 'Its answer, how long it took and what it changed. Open terminal takes you straight back.',
      activities: (now) => [
        {
          kind: 'session',
          id: 'session-done-tour',
          priority: 4,
          session: session(now, {
            phase: 'done',
            finishedAt: now,
            final: 'Fixed: the total now includes tax, with a test for it. All 42 tests pass.',
            steps: [],
            turnSteps: 7,
            added: 18,
            removed: 3,
            files: [
              { file: '~/projects/shop/cart.ts', added: 6, removed: 3, hunks: [] },
              { file: '~/projects/shop/cart.test.ts', added: 12, removed: 0, hunks: [] },
            ],
          }),
        },
      ],
    },
    {
      title: 'That’s the tour',
      body: 'Settings has the rest: your character, shortcuts, Do Not Disturb, and the apps I connect to.',
      activities: () => [],
    },
  ]
}
