import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dropPairingLink } from '@shared/drop'
import { aim, computerSide, exitPoint, release, SEND_AT } from '../mobile/src/gesture'
import { cleanPairing, isIslandHello, parsePairingLink, sizeText } from '../mobile/src/protocol'

// The Island Drop app's pure parts (mobile/src): pairing and the gesture.

describe('pairing', () => {
  test('the phone reads the link the island puts in its QR', () => {
    const link = dropPairingLink('my laptop', 'k'.repeat(43), ['http://192.168.1.20:8790', 'http://100.101.102.103:8790'])
    expect(parsePairingLink(link)).toEqual({ name: 'my laptop', token: 'k'.repeat(43), urls: ['http://192.168.1.20:8790', 'http://100.101.102.103:8790'] })
  })

  test('links that are not right are refused', () => {
    expect(parsePairingLink('daytrader://pair?url=http%3A%2F%2Fx%3A1&token=' + 'k'.repeat(20))).toBeNull()
    expect(parsePairingLink('islanddrop://pair?v=1&name=x&token=short&url=http%3A%2F%2F10.0.0.2%3A8790')).toBeNull()
    expect(parsePairingLink('islanddrop://pair?v=1&name=x&token=' + 'k'.repeat(20))).toBeNull()
    expect(parsePairingLink('islanddrop://pair?token=%E0%A4%A')).toBeNull()
    expect(cleanPairing('', 'k'.repeat(20), ['ftp://x', 'http://user@host:1', 'http://10.0.0.2:8790/'])).toEqual({ name: 'Your computer', token: 'k'.repeat(20), urls: ['http://10.0.0.2:8790'] })
  })

  test('only an island counts as one', () => {
    expect(isIslandHello({ ok: true, protocol: 1, app: 'dynamic-island', name: 'vm' })).toBe(true)
    expect(isIslandHello({ ok: true, protocol: 1, name: 'vm' })).toBe(false)
    expect(sizeText(1536)).toBe('2 KB')
  })
})

describe('the flick', () => {
  const W = 400
  const H = 800

  test('the middle of the screen aims nowhere; near an edge aims at it', () => {
    expect(aim(200, 400, W, H)).toBeNull()
    const a = aim(10, 300, W, H)!
    expect(a.edge).toBe('left')
    expect(a.closeness).toBeGreaterThan(0.85)
    expect(a.along).toBeCloseTo(300 / 800)
    expect(aim(200, 790, W, H)?.edge).toBe('bottom')
  })

  test('let go near the edge, or flick toward it, and it goes', () => {
    expect(release(12, 400, 0, 0, -150, 0, W, H)?.edge).toBe('left')
    // Let go in the middle, still: it comes back.
    expect(release(200, 400, 0.1, 0, 30, 0, W, H)).toBeNull()
    // A quick flick to the right from the middle.
    const f = release(230, 420, 1.6, 0.2, 90, 10, W, H)
    expect(f?.edge).toBe('right')
    expect(f?.closeness).toBeGreaterThanOrEqual(SEND_AT)
    // Fast, but it hardly moved that way: no.
    expect(release(200, 400, 1.6, 0, 10, 0, W, H)).toBeNull()
    // Flicked up.
    expect(release(200, 300, 0.1, -1.4, 0, -120, W, H)?.edge).toBe('top')
  })

  test('the computer is on the side you flick toward', () => {
    expect(computerSide('left')).toBe('right')
    expect(computerSide('right')).toBe('left')
    expect(computerSide('top')).toBe('bottom')
    expect(computerSide('bottom')).toBe('top')
    expect(exitPoint('left', 20, 300, W, H, 100)).toEqual({ x: -140, y: 300 })
    expect(exitPoint('bottom', 20, 300, W, H, 100)).toEqual({ x: 20, y: 940 })
  })
})

describe('what the island sends the phone', () => {
  // mobile/src/islandTypes.ts is a copy of the types in shared/phone.ts (the
  // app is built on its own, so it can't import them). Comments may differ.
  const decls = (file: string) => {
    const s = readFileSync(join(__dirname, '..', file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const from = s.indexOf('export const PHONE_PROTOCOL')
    const last = s.indexOf('export type PhoneIncoming')
    return s.slice(from, s.indexOf('\n', last)).replace(/\s+/g, ' ').trim()
  }

  test('the phone app has the same types as the island', () => {
    const island = decls('shared/phone.ts')
    expect(island).toContain('export type PhoneView')
    expect(decls('mobile/src/islandTypes.ts')).toBe(island)
  })
})
