# Wallpaper

Change the desktop background by asking for it, or from **Settings →
Wallpaper**: a photo or a video found on the web, or one of the island's own
animations.

## Ask for it

Type or say it to the island's assistant:

- “Set my background to misty mountains at sunrise”
- “Make it a video of rain on a window”
- “Another one” (the next match for the same words)
- “Put the old one back”
- “Use the aurora animation”
- “Where is this background from?”

The assistant searches, picks the best match for your screen, downloads it to
**Pictures › Dynamic Island Wallpapers**, and sets it. It works the same from
Claude Code commands you give the island.

## In Settings

- **Search** photos or videos, then click one to set it.
- **Animations**: Soft glow, Aurora, Waves, Starfield and Gradient (its colours
  follow the time of day). They are drawn live at half resolution and a low
  frame rate, so they cost little.
- **Recent**: everything you set, to go back to.
- **Previous** and **Desktop's own** put things back. The island remembers the
  background you had before it changed anything.

## Where the pictures come from

Without any setup: [Openverse](https://openverse.org) (openly licensed photos)
and [Wikimedia Commons](https://commons.wikimedia.org) (photos and videos).
For many more, and better, photos and videos, add a free key in Settings →
Wallpaper → *More photos and videos*:

| Site | Gives | Get a key |
|---|---|---|
| Pexels | photos and videos | <https://www.pexels.com/api/> |
| Unsplash | photos | <https://unsplash.com/developers> |
| Pixabay | photos and videos | <https://pixabay.com/api/docs/> |

Keys are kept encrypted on your computer. Every wallpaper keeps its credit
(who made it, the site, the licence) and a link to its page.

## Videos and animations

Photos become the desktop's own background (GNOME, Cinnamon, MATE, KDE and
XFCE). Videos and animations play live, in a window under everything on each
screen that lets clicks through, with a still of them set as the normal
background underneath, so the desktop looks the same if the island stops.

They rest (no decoding, no drawing) while a window covers the whole screen,
and on battery. Both are switches in Settings. A playing 1080p video still
uses some CPU, as any video does; animations use much less.

Live wallpapers need X11 ("Ubuntu on Xorg"). On Ubuntu's desktop, the
desktop icons may sit under a live wallpaper; photos are not affected.
