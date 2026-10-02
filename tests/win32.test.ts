import { describe, expect, it } from 'vitest'
import { mediaLine, parseHelperMedia, playerName, sysLine } from '../electron/platform/win32'
import { WIN_HELPER } from '../electron/platform/winHelper'

describe('Windows media sessions', () => {
  it('names the player from its app id', () => {
    expect(playerName('Spotify.exe')).toBe('spotify')
    expect(playerName('SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify')).toBe('spotify')
    expect(playerName('MSEdge')).toBe('msedge')
    expect(playerName('Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic')).toBe('microsoft.zunemusic')
    expect(playerName(undefined)).toBeUndefined()
  })

  it('turns the helper report into the island state', () => {
    const s = parseHelperMedia(
      {
        app: 'Spotify.exe',
        title: 'Song',
        artist: 'Band',
        art: 'data:image/png;base64,AA',
        status: 'Playing',
        length: 200,
        position: 12.5,
        canSeek: true,
        shuffle: true,
        repeat: 'List',
      },
      1000,
    )
    expect(s).toEqual({
      title: 'Song',
      artist: 'Band',
      artUrl: 'data:image/png;base64,AA',
      playing: true,
      canControl: true,
      length: 200,
      position: 12.5,
      positionAt: 1000,
      canSeek: true,
      shuffle: true,
      loop: 'Playlist',
      player: 'spotify',
    })
    expect(parseHelperMedia({ title: 'A', status: 'Paused', repeat: 'Track', length: 0, shuffle: null })).toMatchObject({
      playing: false,
      loop: 'Track',
      length: undefined,
      shuffle: undefined,
    })
  })

  it('shows nothing for stopped, closed or empty sessions', () => {
    expect(parseHelperMedia(null)).toBeNull()
    expect(parseHelperMedia({ title: 'A', status: 'Stopped' })).toBeNull()
    expect(parseHelperMedia({ title: 'A', status: 'Closed' })).toBeNull()
    expect(parseHelperMedia({ title: '', artist: '', status: 'Playing' })).toBeNull()
  })

  it('sends buttons and controls as helper lines', () => {
    expect(mediaLine('playpause')).toBe('media playpause')
    expect(mediaLine({ type: 'seek', position: 42.5 })).toBe('media seek 42.5')
    expect(sysLine({ type: 'volume', value: 140 })).toBe('vol 100')
    expect(sysLine({ type: 'brightness', value: 33.4 })).toBe('bright 33')
    expect(sysLine({ type: 'mute' })).toBe('mute')
    expect(sysLine({ type: 'wifi', value: false })).toBe('wifi off')
    expect(sysLine({ type: 'bluetooth', value: true })).toBe('bt on')
  })

  it('the helper understands every line the island sends', () => {
    for (const w of ["'sys'", "'vol'", "'mute'", "'bright'", "'wifi'", "'bt'", "'media'", "'playpause'", "'next'", "'previous'", "'seek'", "'shuffle'", "'loop'"])
      expect(WIN_HELPER).toContain(w)
    expect(WIN_HELPER).toContain('IAsyncOperation`1')
  })
})

describe.runIf(process.platform === 'win32')('the PowerShell helper on this machine', () => {
  it('starts, reports the system and stays up', async () => {
    const { spawn } = await import('node:child_process')
    const { writeFileSync, mkdtempSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const file = join(mkdtempSync(join(tmpdir(), 'helper-')), 'h.ps1')
    writeFileSync(file, '﻿' + WIN_HELPER)
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file])
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    const waitFor = async (re: RegExp, ms: number) => {
      const end = Date.now() + ms
      while (!re.test(out) && Date.now() < end) await new Promise((r) => setTimeout(r, 100))
      return re.test(out)
    }
    try {
      expect(await waitFor(/"ready":true/, 60000), err).toBe(true)
      p.stdin.write('sys\n')
      expect(await waitFor(/"sys":/, 30000), err).toBe(true)
      const sys = JSON.parse(out.split('\n').find((l) => l.includes('"sys"'))!).sys
      expect(Object.keys(sys).sort()).toEqual(['bluetooth', 'brightness', 'muted', 'volume', 'wifi'])
      p.stdin.write('media playpause\n')
      expect(await waitFor(/"media":/, 15000), err).toBe(true)
      expect(p.exitCode).toBeNull()
    } finally {
      p.kill()
    }
  }, 120000)
})
