import { describe, expect, test } from 'vitest'
import { RING, angleOf, askPrompt, choiceAngle, dragKindOf, dwellStep, editDraft, extForMime, extOf, parseUriList, resultName, ringCenter, ringFile, ringHit, ringPlan, ringPlanForTypes, ringTitle, type PlanEnv } from '../shared/dragActions'

const env: PlanEnv = { libreOffice: false, assistant: 'api', language: 'English' }
const slot = (plan: ReturnType<typeof ringPlan>, id: string) => plan!.slots.find((s) => s.id === id)!

describe('files', () => {
  test('kinds by extension', () => {
    expect(extOf('/a/Report.PDF')).toBe('pdf')
    expect(extOf('/a/.hidden')).toBe('')
    expect(dragKindOf('/a/b.xlsx')).toBe('sheet')
    expect(dragKindOf('/a/b.jpeg')).toBe('image')
    expect(dragKindOf('/a/folder')).toBe('other')
    expect(ringFile('/home/me/Quarterly Report.pdf')).toMatchObject({ name: 'Quarterly Report.pdf', base: 'Quarterly Report', ext: 'pdf', kind: 'pdf', color: '#ff453a' })
  })

  test('a uri-list gives local paths only', () => {
    expect(parseUriList('# from Files\r\nfile:///home/me/A%20B.pdf\r\nhttps://example.com/x.pdf\nfile://localhost/tmp/c.png\n\n')).toEqual(['/home/me/A B.pdf', '/tmp/c.png'])
    expect(parseUriList('file:///bad%E0%A4%A.txt')).toEqual(['/bad%E0%A4%A.txt'])
  })

  test('results are named next to the original', () => {
    expect(resultName('Report', 'convert', 'docx')).toBe('Report.docx')
    expect(resultName('Photo', 'shrink', 'jpg')).toBe('Photo (smaller).jpg')
  })
})

describe('what the ring offers', () => {
  test('a PDF', () => {
    const p = ringPlan(['/d/Report.pdf'], env)!
    expect(p.slots.map((s) => s.id)).toEqual(['convert', 'edit', 'capture', 'ask', 'shrink', 'text'])
    expect(slot(p, 'convert').choices!.map((c) => c.label)).toEqual(['Word', 'Text', 'Markdown'])
    expect(slot(p, 'edit')).toMatchObject({ enabled: false, why: 'Not yet for PDFs' })
    expect(slot(p, 'capture').enabled).toBe(false)
    expect(slot(p, 'ask').enabled).toBe(true)
    expect(slot(p, 'ask').choices!.map((c) => c.id)).toEqual(['summarize', 'translate', 'explain'])
    expect(slot(p, 'shrink').enabled).toBe(true)
    expect(slot(p, 'text').enabled).toBe(true)
  })

  test('an image: Capture copies it; seeing it needs Claude Code', () => {
    const p = ringPlan(['/d/Receipt.png'], env)!
    expect(slot(p, 'convert').choices!.map((c) => c.id)).toEqual(['jpg', 'webp', 'pdf'])
    expect(slot(p, 'capture').enabled).toBe(true)
    expect(slot(p, 'ask')).toMatchObject({ enabled: false, why: 'Seeing images needs Claude Code as the assistant' })
    expect(slot(ringPlan(['/d/Receipt.png'], { ...env, assistant: 'claude-code' }), 'ask').enabled).toBe(true)
    expect(slot(p, 'text')).toMatchObject({ enabled: false, why: 'Not yet for images' })
  })

  test('slides become PDFs only with LibreOffice', () => {
    expect(slot(ringPlan(['/d/Deck.pptx'], env), 'convert').choices!.map((c) => c.id)).toEqual(['txt', 'md'])
    expect(slot(ringPlan(['/d/Deck.pptx'], { ...env, libreOffice: true }), 'convert').choices!.map((c) => c.id)).toEqual(['pdf', 'txt', 'md'])
  })

  test('without an assistant, Ask and Edit say how to set one up', () => {
    const p = ringPlan(['/d/Notes.md'], { ...env, assistant: null })!
    expect(slot(p, 'ask')).toMatchObject({ enabled: false, why: 'Set up the assistant in Settings first' })
    expect(slot(p, 'edit')).toMatchObject({ enabled: false, why: 'Set up the assistant in Settings first' })
    expect(slot(ringPlan(['/d/Notes.md'], env), 'edit').enabled).toBe(true)
  })

  test('several files: what works for all of them', () => {
    const p = ringPlan(['/d/A.pdf', '/d/B.docx'], env)!
    expect(slot(p, 'convert').choices!.map((c) => c.id)).toEqual(['txt', 'md'])
    expect(slot(p, 'shrink')).toMatchObject({ enabled: false, why: 'Nothing to shrink in this kind of file' })
    expect(slot(p, 'text').enabled).toBe(true)
    expect(slot(ringPlan(['/d/A.pdf', '/d/B.png'], env), 'convert')).toMatchObject({ enabled: false, why: 'Not for these files together' })
  })

  test('no ring for folders and unknown files', () => {
    expect(ringPlan(['/home/me/Projects'], env)).toBeNull()
    expect(ringPlan([], env)).toBeNull()
  })

  test('before the drop only the types are known', () => {
    expect(extForMime('application/pdf')).toBe('pdf')
    expect(extForMime('IMAGE/JPEG; q=1')).toBe('jpg')
    expect(extForMime('application/zip')).toBeNull()
    const p = ringPlanForTypes(['application/pdf'], env)!
    expect(slot(p, 'convert').choices!.map((c) => c.id)).toEqual(['docx', 'txt', 'md'])
    expect(ringTitle(p.files)).toBe('PDF')
    expect(ringTitle(ringPlanForTypes(['image/png', 'image/png', 'image/jpeg'], env)!.files)).toBe('3 files')
    expect(ringTitle(ringPlanForTypes(['image/jpeg'], env)!.files)).toBe('JPEG')
    expect(ringPlanForTypes(['application/zip', ''], env)).toBeNull()
  })

  test("what Claude is asked, and Edit's draft", () => {
    const f = [ringFile('/d/A.pdf')]
    expect(askPrompt('summarize', f, 'English')).toBe('Summarize the file "/d/A.pdf" in 3 short lines.')
    expect(askPrompt('translate', f, 'Hindi')).toBe('Translate the text of the file "/d/A.pdf" into Hindi.')
    expect(askPrompt('read', [ringFile('/d/B.png'), ringFile('/d/C.png')], 'English')).toBe('Read out all the text in the image these files: "/d/B.png", "/d/C.png".')
    expect(editDraft(f)).toBe('In "/d/A.pdf", change ')
  })
})

describe('the ring', () => {
  const choicesOn = (s: number) => s === 0 || s === 3
  test('angles go clockwise from up', () => {
    expect(angleOf(0, -10)).toBe(0)
    expect(angleOf(10, 0)).toBe(90)
    expect(angleOf(0, 10)).toBe(180)
    expect(angleOf(-10, 0)).toBe(270)
    expect(choiceAngle(0, 0, 3)).toBe(-27)
    expect(choiceAngle(3, 2, 3)).toBe(207)
  })

  test('middle cancels; the six places; the second ring', () => {
    expect(ringHit(10, 10, -1, 0, choicesOn)).toMatchObject({ hub: true, slot: -1 })
    expect(ringHit(0, -100, -1, 0, choicesOn)).toMatchObject({ slot: 0, sub: 0 })
    expect(ringHit(90, -50, -1, 0, choicesOn)).toMatchObject({ slot: 1, sub: -1 })
    expect(ringHit(-90, 50, -1, 0, choicesOn)).toMatchObject({ slot: 4 })
    // Convert's three formats: the middle one is straight up.
    expect(ringHit(0, -RING.choiceAt, 0, 3, choicesOn)).toMatchObject({ slot: 0, choice: 1 })
    // Between two formats: still on Convert, nothing picked.
    expect(ringHit(-50.4, -210, 0, 3, choicesOn)).toMatchObject({ slot: 0, choice: -1, sub: 0 })
  })

  test('far away closes it', () => {
    expect(ringHit(0, 250, -1, 0, choicesOn)).toMatchObject({ slot: -1, far: false })
    expect(ringHit(320, 0, -1, 0, choicesOn)).toMatchObject({ far: true })
  })

  test('near a screen edge the ring slides inward', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1080 }
    expect(ringCenter({ x: 900, y: 500 }, area)).toEqual({ x: 900, y: 500 })
    expect(ringCenter({ x: 20, y: 1070 }, area)).toEqual({ x: 310, y: 770 })
    expect(ringCenter({ x: 50, y: 50 }, { x: 0, y: 0, width: 400, height: 400 })).toEqual({ x: 200, y: 200 })
  })
})

describe('holding still', () => {
  const cfg = { dwellMs: 400, when: 'either' as const }
  test('opens after holding still, not while moving', () => {
    let s = { anchor: null, bloomed: false } as Parameters<typeof dwellStep>[0]
    let r = dwellStep(s, { x: 0, y: 0, t: 0, alt: false }, cfg)
    expect(r.bloom).toBe(false)
    r = dwellStep(r.state, { x: 50, y: 0, t: 300, alt: false }, cfg)
    r = dwellStep(r.state, { x: 52, y: 1, t: 500, alt: false }, cfg)
    expect(r.bloom).toBe(false)
    expect(r.holding).toBeCloseTo(0.5)
    r = dwellStep(r.state, { x: 53, y: 2, t: 700, alt: false }, cfg)
    expect(r.bloom).toBe(true)
    s = r.state
    expect(dwellStep(s, { x: 53, y: 2, t: 900, alt: false }, cfg).bloom).toBe(false)
  })

  test('Alt opens it at once, unless it is set to holding still only', () => {
    const s = { anchor: null, bloomed: false }
    expect(dwellStep(s, { x: 0, y: 0, t: 0, alt: true }, cfg).bloom).toBe(true)
    expect(dwellStep(s, { x: 0, y: 0, t: 0, alt: true }, { dwellMs: 400, when: 'still' }).bloom).toBe(false)
    expect(dwellStep({ anchor: { x: 0, y: 0, t: 0 }, bloomed: false }, { x: 0, y: 0, t: 5000, alt: false }, { dwellMs: 400, when: 'alt' }).bloom).toBe(false)
  })
})
