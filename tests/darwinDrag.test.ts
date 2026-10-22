import { describe, expect, it } from 'vitest'
import { DRAG_HELPER, dragLine } from '../electron/platform/darwinDrag'

describe('the macOS drag helper', () => {
  it('reads its lines as drag events', () => {
    expect(dragLine('{"ready":true}')).toEqual({ ready: true })
    expect(dragLine('{"start":["/Users/me/Report.pdf","/Users/me/a b.png"]}')).toEqual({ start: ['/Users/me/Report.pdf', '/Users/me/a b.png'] })
    expect(dragLine('{"held":true,"alt":true}')).toEqual({ held: true, alt: true })
    expect(dragLine('{"held":true}')).toEqual({ held: true, alt: false })
    expect(dragLine('{"end":true}')).toEqual({ end: true })
  })
  it('ignores anything else, and paths that aren’t absolute', () => {
    expect(dragLine('2026-10-22 osascript[123] noise')).toBeNull()
    expect(dragLine('{"start":[]}')).toBeNull()
    expect(dragLine('{"start":["relative.pdf", 3]}')).toBeNull()
    expect(dragLine('{"start":["/ok.pdf", "nope"]}')).toEqual({ start: ['/ok.pdf'] })
    expect(dragLine('{}')).toBeNull()
  })
  it('only reads the button, Option and the drag pasteboard', () => {
    expect(DRAG_HELPER).toContain('pressedMouseButtons')
    expect(DRAG_HELPER).toContain('changeCount')
    expect(DRAG_HELPER).toContain('NSPasteboardURLReadingFileURLsOnlyKey')
    // Nothing that would need Accessibility or Input Monitoring.
    expect(DRAG_HELPER).not.toMatch(/CGEventTap|CGEventPost|addGlobalMonitor/)
  })
})
