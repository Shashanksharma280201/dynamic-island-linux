/**
 * What drag actions need from the system: to know when a file drag starts in
 * any app, where the pointer is until it ends, and (where the system needs
 * it) a way to make the dragging app look again at what's under the pointer.
 * X11 has one (dragWatch.ts); macOS and Windows bring their own.
 */

/** The pointer during a drag, in screen units (Electron's), with the button and Alt. */
export type DragSample = { x: number; y: number; t: number; alt: boolean; down: boolean }

export type DragEvents = {
  /** A drag began in some app; `files` when the system says what's dragged (macOS does). */
  onStart: (files?: string[]) => void
  onSample: (s: DragSample) => void
  /** The button was let go: dropped or cancelled. */
  onEnd: () => void
  /** Drags the island started itself (a result dragged out of it). */
  ownDrag: () => boolean
}

export interface DragSource {
  /** False when drags can't be followed here; `problem` says why. */
  start(): Promise<boolean>
  stop(): void
  /** Move the pointer a pixel and back, where the dragging app only looks under it on a move. */
  nudge(): void
  /** Why it isn't running (no X11, Wayland, a missing helper…). */
  readonly problem: string | null
}

export type DragSourceMaker = (events: DragEvents) => DragSource
