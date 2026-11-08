import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  animationItem,
  creditLine,
  parseOpenverse,
  parsePexelsPhotos,
  parsePexelsVideos,
  parsePixabayImages,
  parsePixabayVideos,
  parseUnsplash,
  parseWallpaperConfig,
  parseWikimedia,
  pickVideoFile,
  rankWalls,
  type WallItem,
  type WallpaperConfig,
} from '@shared/wallpaper'
import { searchRequests, searchWalls, endpointsAt, ENDPOINTS } from '../electron/wallpaper/search'
import { DesktopBackground, desktopOf, getCommands, setCommands, unquote, type Cmd } from '../electron/wallpaper/desktop'
import { Wallpapers, downloadUrl, extFor, fileNameFor, type Live } from '../electron/wallpaper'
import { runTool } from '../electron/agent/tools'

const tmp = () => mkdtempSync(join(tmpdir(), 'wall-'))

// What each site answers, trimmed to the fields that matter.
const OPENVERSE = {
  result_count: 2,
  results: [
    { id: 'ov1', title: 'Misty mountains', url: 'https://live.staticflickr.com/1/a.jpg', thumbnail: 'https://api.openverse.org/v1/images/ov1/thumb/', creator: 'Ana', creator_url: 'https://flickr.com/ana', license: 'by', license_version: '2.0', foreign_landing_url: 'https://flickr.com/p/1', width: 4000, height: 2250 },
    { id: 'ov2', title: 'Tiny', url: 'http://x.org/b.jpg', thumbnail: '', width: 640, height: 480 },
  ],
}
const WIKIMEDIA = {
  query: {
    pages: [
      {
        pageid: 11,
        index: 2,
        title: 'File:Aurora_over_lake.jpg',
        imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Aurora_over_lake.jpg', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Aurora_over_lake.jpg/640px-Aurora_over_lake.jpg', width: 6000, height: 3375, mime: 'image/jpeg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Aurora_over_lake.jpg', extmetadata: { Artist: { value: '<a href="x">Bo Li</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }],
      },
      { pageid: 12, index: 1, title: 'File:Waves.webm', imageinfo: [{ url: 'https://upload.wikimedia.org/w/Waves.webm', thumburl: 'https://upload.wikimedia.org/w/Waves.webm.jpg', width: 1920, height: 1080, mime: 'video/webm', duration: 31.5 }] },
      { pageid: 13, index: 3, title: 'File:Diagram.svg', imageinfo: [{ url: 'https://upload.wikimedia.org/d.svg', width: 3000, height: 2000, mime: 'image/svg+xml' }] },
    ],
  },
}
const PEXELS_PHOTOS = { photos: [{ id: 7, width: 5000, height: 3333, url: 'https://www.pexels.com/photo/x-7/', photographer: 'Cy', photographer_url: 'https://www.pexels.com/@cy', alt: 'Snowy peak at dawn', src: { original: 'https://images.pexels.com/7.jpeg', medium: 'https://images.pexels.com/7m.jpeg' } }] }
const PEXELS_VIDEOS = {
  videos: [
    {
      id: 9,
      width: 3840,
      height: 2160,
      url: 'https://www.pexels.com/video/ocean-waves-aerial-9/',
      image: 'https://images.pexels.com/v9.jpg',
      duration: 22,
      user: { name: 'Di', url: 'https://www.pexels.com/@di' },
      video_files: [
        { id: 1, quality: 'uhd', file_type: 'video/mp4', width: 3840, height: 2160, link: 'https://videos.pexels.com/9-uhd.mp4' },
        { id: 2, quality: 'hd', file_type: 'video/mp4', width: 1920, height: 1080, link: 'https://videos.pexels.com/9-hd.mp4' },
        { id: 3, quality: 'sd', file_type: 'video/mp4', width: 960, height: 540, link: 'https://videos.pexels.com/9-sd.mp4' },
      ],
    },
  ],
}
const UNSPLASH = { results: [{ id: 'u1', width: 6000, height: 4000, description: null, alt_description: 'a lake under stars', urls: { raw: 'https://images.unsplash.com/photo-1?ixid=a', full: 'https://images.unsplash.com/photo-1?full', small: 'https://images.unsplash.com/photo-1?w=400' }, links: { html: 'https://unsplash.com/photos/u1', download_location: 'https://api.unsplash.com/photos/u1/download?ixid=a' }, user: { name: 'Ed', links: { html: 'https://unsplash.com/@ed' } } }] }
const PIXABAY = { hits: [{ id: 3, pageURL: 'https://pixabay.com/photos/3/', tags: 'forest, fog, trees', webformatURL: 'https://pixabay.com/get/3w.jpg', largeImageURL: 'https://pixabay.com/get/3l.jpg', imageWidth: 6000, imageHeight: 4000, user: 'Fi' }] }
const PIXABAY_VIDEOS = { hits: [{ id: 4, pageURL: 'https://pixabay.com/videos/4/', tags: 'rain, window', duration: 18, user: 'Gu', videos: { large: { url: 'https://cdn.pixabay.com/4l.mp4', width: 3840, height: 2160, thumbnail: 'https://cdn.pixabay.com/4l.jpg' }, medium: { url: 'https://cdn.pixabay.com/4m.mp4', width: 1920, height: 1080, thumbnail: 'https://cdn.pixabay.com/4m.jpg' }, small: { url: '', width: 0, height: 0 } } }] }

describe('reading each site', () => {
  test('Openverse, with credit and https only', () => {
    const [a, b] = parseOpenverse(OPENVERSE)
    expect(a).toMatchObject({ id: 'openverse:ov1', kind: 'image', title: 'Misty mountains', width: 4000, author: 'Ana', license: 'BY 2.0', page: 'https://flickr.com/p/1' })
    expect(b.url).toBe('https://x.org/b.jpg')
    expect(parseOpenverse({})).toEqual([])
  })

  test('Wikimedia: photos or videos, in the search’s order, no drawings', () => {
    const photos = parseWikimedia(WIKIMEDIA, 'image')
    expect(photos).toHaveLength(1)
    expect(photos[0]).toMatchObject({ id: 'wikimedia:11', title: 'Aurora over lake', author: 'Bo Li', license: 'CC BY-SA 4.0' })
    const videos = parseWikimedia(WIKIMEDIA, 'video')
    expect(videos[0]).toMatchObject({ kind: 'video', title: 'Waves', duration: 31.5 })
    // A big Commons photo is fetched at 4K through its thumbnail address.
    expect(downloadUrl(photos[0])).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Aurora_over_lake.jpg/3840px-Aurora_over_lake.jpg')
  })

  test('Pexels, Unsplash and Pixabay; the right video file for the screen', () => {
    expect(parsePexelsPhotos(PEXELS_PHOTOS)[0]).toMatchObject({ id: 'pexels:7', title: 'Snowy peak at dawn', url: 'https://images.pexels.com/7.jpeg', author: 'Cy' })
    const v = parsePexelsVideos(PEXELS_VIDEOS, 1080)[0]
    expect(v).toMatchObject({ id: 'pexels:v9', kind: 'video', title: 'ocean waves aerial', url: 'https://videos.pexels.com/9-hd.mp4', height: 1080, duration: 22 })
    expect(parsePexelsVideos(PEXELS_VIDEOS, 1440)[0].url).toBe('https://videos.pexels.com/9-uhd.mp4')
    expect(parsePexelsVideos(PEXELS_VIDEOS, 4320)[0].url).toBe('https://videos.pexels.com/9-uhd.mp4')
    const u = parseUnsplash(UNSPLASH)[0]
    expect(u).toMatchObject({ title: 'a lake under stars', author: 'Ed', pingUrl: 'https://api.unsplash.com/photos/u1/download?ixid=a' })
    expect(u.url).toBe('https://images.unsplash.com/photo-1?ixid=a&w=3840&q=85&fm=jpg&fit=max')
    expect(parsePixabayImages(PIXABAY)[0]).toMatchObject({ title: 'forest, fog, trees', url: 'https://pixabay.com/get/3l.jpg' })
    expect(parsePixabayVideos(PIXABAY_VIDEOS, 1080)[0]).toMatchObject({ url: 'https://cdn.pixabay.com/4m.mp4', thumb: 'https://cdn.pixabay.com/4m.jpg' })
    expect(pickVideoFile([], 1080)).toBeNull()
  })

  test('ranking: big enough, shaped like the screen, no repeats', () => {
    const items = [...parseOpenverse(OPENVERSE), ...parsePexelsPhotos(PEXELS_PHOTOS), ...parseOpenverse(OPENVERSE)]
    const ranked = rankWalls(items, { width: 1920, height: 1080 })
    // Pexels' photos make better wallpapers, so a close match there comes first.
    expect(ranked.map((i) => i.id)).toEqual(['pexels:7', 'openverse:ov1'])
    expect(creditLine(ranked[0])).toBe('by Cy on Pexels (Pexels License)')
    expect(creditLine(animationItem('aurora'))).toBe('An animation by Dynamic Island')
  })

  test('the config keeps only sane values', () => {
    expect(parseWallpaperConfig({ current: { id: 'x', title: 't', url: 'u', kind: 'nope' }, pauseCovered: false, keys: { pexels: 'enc', other: 1 } })).toMatchObject({ current: null, pauseCovered: false, pauseBattery: true, keys: { pexels: 'enc', unsplash: '', pixabay: '' } })
  })
})

describe('searching', () => {
  test('the free sites always; the others only with a key', () => {
    const none = { pexels: '', unsplash: '', pixabay: '' }
    expect(searchRequests('misty forest', 'image', none, ENDPOINTS, 1080).map((a) => a.site)).toEqual(['Openverse', 'Wikimedia Commons'])
    const all = { pexels: 'P', unsplash: 'U', pixabay: 'X' }
    const img = searchRequests('misty forest', 'image', all, ENDPOINTS, 1080)
    expect(img.map((a) => a.site)).toEqual(['Unsplash', 'Pexels', 'Pixabay', 'Openverse', 'Wikimedia Commons'])
    expect(img[0].headers).toEqual({ Authorization: 'Client-ID U', 'Accept-Version': 'v1' })
    expect(img[1].headers).toEqual({ Authorization: 'P' })
    expect(img[4].url).toContain('gsrsearch=misty%20forest%20filetype%3Abitmap%20filew%3A%3E1600')
    expect(searchRequests('rain', 'video', all, ENDPOINTS, 1080).map((a) => a.site)).toEqual(['Pexels', 'Pixabay', 'Wikimedia Commons'])
    expect(endpointsAt('http://127.0.0.1:9/').pexels).toBe('http://127.0.0.1:9/pexels')
  })

  test('one site failing doesn’t stop the others', async () => {
    const calls: { url: string; ua: string }[] = []
    const f = (async (url: string, init: any) => {
      calls.push({ url, ua: init.headers['User-Agent'] })
      if (url.includes('openverse')) return new Response(JSON.stringify(OPENVERSE), { status: 200 })
      return new Response('nope', { status: 503 })
    }) as unknown as typeof fetch
    const r = await searchWalls({ query: 'mist', kind: 'image', keys: { pexels: '', unsplash: '', pixabay: '' }, screen: { width: 1920, height: 1080 }, fetch: f })
    expect(r.items.map((i) => i.id)).toEqual(['openverse:ov1'])
    expect(r.errors).toEqual(['Wikimedia Commons: answered 503'])
    expect(calls.every((c) => /^DynamicIsland\/1\.0 /.test(c.ua))).toBe(true)
  })
})

// Linux desktops' settings (file: addresses of Linux paths).
describe.skipIf(process.platform === 'win32')('the desktop', () => {
  test('which desktop, and its commands', () => {
    expect(desktopOf({ XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' })).toBe('gnome')
    expect(desktopOf({ XDG_CURRENT_DESKTOP: 'X-Cinnamon' })).toBe('cinnamon')
    expect(desktopOf({ XDG_CURRENT_DESKTOP: 'KDE' })).toBe('kde')
    expect(desktopOf({})).toBe('unknown')
    const gnome = setCommands('gnome', '/home/me/Pictures/a b.jpg')
    expect(gnome[0]).toEqual({ bin: 'gsettings', args: ['set', 'org.gnome.desktop.background', 'picture-uri', 'file:///home/me/Pictures/a%20b.jpg'] })
    expect(gnome[1].optional).toBe(true)
    expect(setCommands('mate', '/x.jpg')[0].args).toEqual(['set', 'org.mate.background', 'picture-filename', '/x.jpg'])
    expect(setCommands('unknown', '/x.jpg')).toEqual([])
    expect(getCommands('gnome').map((g) => g.key)).toEqual(['picture-uri', 'picture-uri-dark', 'picture-options'])
    expect(unquote("'file:///usr/share/backgrounds/warty.png'\n")).toBe('file:///usr/share/backgrounds/warty.png')
  })

  test('set, save and restore through gsettings', async () => {
    const ran: Cmd[] = []
    const values: Record<string, string> = { 'picture-uri': "'file:///old.png'", 'picture-uri-dark': "'file:///old-dark.png'", 'picture-options': "'zoom'" }
    const d = new DesktopBackground({
      env: { XDG_CURRENT_DESKTOP: 'ubuntu:GNOME', DI_GSETTINGS: 'gs' },
      run: async (c) => {
        ran.push(c)
        if (c.args[0] === 'get') return { ok: true, out: values[c.args[2]] ?? '', err: '' }
        if (c.args[2] === 'picture-uri-dark') return { ok: false, out: '', err: 'No such key' }
        return { ok: true, out: '', err: '' }
      },
    })
    expect(d.supported()).toBe(true)
    const saved = await d.save()
    expect(JSON.parse(saved)).toEqual({ desktop: 'gnome', 'picture-uri': 'file:///old.png', 'picture-uri-dark': 'file:///old-dark.png', 'picture-options': 'zoom' })
    // An optional key failing (older GNOME) is fine.
    expect(await d.set('/new.jpg')).toBeNull()
    expect(ran.filter((c) => c.args[0] === 'set').map((c) => c.bin)).toEqual(['gs', 'gs', 'gs'])
    ran.length = 0
    expect(await d.restore(saved)).toBeNull()
    expect(ran.map((c) => c.args.slice(1).join(' '))).toEqual(['org.gnome.desktop.background picture-uri file:///old.png', 'org.gnome.desktop.background picture-uri-dark file:///old-dark.png', 'org.gnome.desktop.background picture-options zoom'])
  })
})

describe('the wallpapers service', () => {
  function setup(o: { fail?: (url: string) => boolean } = {}) {
    const dir = tmp()
    let config: WallpaperConfig = parseWallpaperConfig(null)
    const set: string[] = []
    const shows: { item: WallItem; url: string }[] = []
    let state: 'playing' | 'resting' | 'off' = 'off'
    const live: Live = {
      show: async (item, url) => {
        shows.push({ item, url })
        state = 'playing'
      },
      stop: () => (state = 'off'),
      still: async () => Buffer.from('png'),
      state: () => state,
    }
    const desktop = new DesktopBackground({
      env: { XDG_CURRENT_DESKTOP: 'GNOME', DI_GSETTINGS: 'gs' },
      run: async (c) => {
        if (c.args[0] === 'set' && c.args[2] === 'picture-uri') set.push(c.args[3])
        return { ok: true, out: c.args[0] === 'get' ? "'file:///orig.png'" : '', err: '' }
      },
    })
    const fetched: string[] = []
    const f = (async (url: string) => {
      fetched.push(url)
      if (o.fail?.(url)) return new Response('gone', { status: 404 })
      if (url.includes('/v1/images/')) return new Response(JSON.stringify(OPENVERSE))
      if (url.includes('/videos/search')) return new Response(JSON.stringify(PEXELS_VIDEOS))
      if (url.includes('api.php')) return new Response(JSON.stringify({ query: { pages: [] } }))
      if (url.endsWith('.mp4')) return new Response(new Uint8Array([0, 0, 0, 1]), { headers: { 'content-type': 'video/mp4', 'content-length': '4' } })
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } })
    }) as unknown as typeof fetch
    const changes: number[] = []
    const w = new Wallpapers({
      config: () => config,
      setConfig: (p) => (config = { ...config, ...p }),
      keys: () => ({ pexels: 'P', unsplash: '', pixabay: '' }),
      dir: join(dir, 'walls'),
      historyFile: join(dir, 'history.json'),
      screen: () => ({ width: 1920, height: 1080 }),
      desktop,
      live,
      fetch: f,
      onChange: () => changes.push(1),
      stillAfterMs: 0,
    })
    return { w, dir, set, shows, fetched, config: () => config, live }
  }

  test('ask for words: it finds, downloads and sets the best photo, and keeps the old one', async () => {
    const t = setup()
    const r = await t.w.setFromQuery('misty mountains')
    expect('item' in r && r.item.id).toBe('openverse:ov1')
    const file = join(t.dir, 'walls', fileNameFor(parseOpenverse(OPENVERSE)[0], 'jpg'))
    expect(existsSync(file)).toBe(true)
    // (A file address: file:///C:/… on Windows.)
    expect(t.set).toEqual([pathToFileURL(file).href])
    expect(JSON.parse(t.config().original)['picture-uri']).toBe('file:///orig.png')
    expect(t.config().current?.file).toBe(file)
    expect(JSON.parse(readFileSync(join(t.dir, 'history.json'), 'utf8'))[0].id).toBe('openverse:ov1')
    expect(readdirSync(join(t.dir, 'walls')).some((f) => f.endsWith('.part'))).toBe(false)
  })

  test('a video plays live, with a still of it set underneath', async () => {
    const t = setup()
    const r = await t.w.setFromQuery('ocean waves', 'video')
    expect('item' in r && r.item.kind).toBe('video')
    expect(t.shows[0].url).toMatch(/^island-media:\/\/wall\/ocean-waves-aerial-[0-9a-f]{8}\.mp4$/)
    expect(t.set[0]).toMatch(/\.still\.png$/)
    expect(t.w.mediaFile(decodeURIComponent(t.shows[0].url.split('/').pop()!))).toBeTruthy()
    expect(t.w.mediaFile('../etc/passwd')).toBeNull()
  })

  test('animations, another one, undo and the desktop’s own', async () => {
    const t = setup()
    await t.w.setFromQuery('misty mountains')
    const anim = await t.w.animation('aurora')
    expect('item' in anim && anim.item.id).toBe('island:aurora')
    expect(t.shows.at(-1)!.item.url).toBe('aurora')
    expect((await t.w.animation('lava')) as { error: string }).toHaveProperty('error')
    const back = await t.w.undo()
    expect('item' in back && back.item?.id).toBe('openverse:ov1')
    expect(t.live.state()).toBe('off')
    expect(await t.w.restore()).toEqual({ item: null })
    expect(t.config().current).toBeNull()
  })

  test('a failing download tries the next match; nothing found says so', async () => {
    const t = setup({ fail: (u) => u.includes('live.staticflickr.com') })
    // Only one Openverse photo is big enough, so nothing else to try.
    const r = await t.w.setFromQuery('misty mountains')
    expect('error' in r && r.error).toMatch(/couldn’t be downloaded/)
    const t2 = setup()
    const none = await t2.w.setFromQuery('qqqq', 'image', 5)
    expect('error' in none).toBe(true)
  })

  test('the assistant’s tools', async () => {
    const t = setup()
    const tools = t.w.tools()
    expect(tools.map((x) => x.name)).toEqual(['wallpaper_set', 'wallpaper_search', 'wallpaper_animation', 'wallpaper_undo', 'wallpaper_now'])
    expect(tools.every((x) => !x.asks)).toBe(true)
    const found = await runTool(tools, 'wallpaper_search', { query: 'misty' })
    expect(found.output).toContain('[id: openverse:ov1]')
    const setIt = await runTool(tools, 'wallpaper_set', { id: 'openverse:ov1' })
    expect(setIt.output).toMatch(/^Set as the background: Misty mountains, by Ana on Openverse/)
    expect((await runTool(tools, 'wallpaper_now', {})).output).toContain('https://flickr.com/p/1')
    expect((await runTool(tools, 'wallpaper_animation', { name: 'Glow' })).output).toContain('Soft glow')
    expect((await runTool(tools, 'wallpaper_set', {})).output).toContain('Give a query')
  })

  test('file names and types', () => {
    expect(extFor('image/jpeg; charset=x', 'https://a/b')).toBe('jpg')
    expect(extFor('application/octet-stream', 'https://a/b.webm?x=1')).toBe('webm')
    expect(extFor('text/html', 'https://a/b')).toBeNull()
    expect(fileNameFor(animationItem('glow'), 'still.png')).toMatch(/^soft-glow-[0-9a-f]{8}\.still\.png$/)
  })
})
