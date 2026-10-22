import { describe, expect, it } from 'vitest'
import { WIN_DRAG, winDragLine } from '../electron/platform/winDrag'

describe('the Windows drag watcher', () => {
  it('reads its lines as drag events', () => {
    expect(winDragLine('{"ready":true}')).toEqual({ ready: true })
    expect(winDragLine('{"start":true}')).toEqual({ start: true })
    expect(winDragLine('{"held":true,"alt":true}')).toEqual({ held: true, alt: true })
    expect(winDragLine('{"held":true,"alt":false}')).toEqual({ held: true, alt: false })
    expect(winDragLine('{"end":true}')).toEqual({ end: true })
  })
  it('ignores anything else', () => {
    expect(winDragLine('WARNING: something')).toBeNull()
    expect(winDragLine('{}')).toBeNull()
    expect(winDragLine('{"start":false}')).toBeNull()
  })
  it('watches the main button, the shell drag image and Alt, and nudges with SendInput', () => {
    expect(WIN_DRAG).toContain('SysDragImage')
    expect(WIN_DRAG).toContain('SM_SWAPBUTTON')
    expect(WIN_DRAG).toContain('SendInput')
    expect(WIN_DRAG).toContain('"nudge"')
    // No hooks: nothing that watches every key or click.
    expect(WIN_DRAG).not.toMatch(/SetWindowsHookEx/)
  })
})
