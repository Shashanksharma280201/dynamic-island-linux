import { execFile } from 'node:child_process'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { yaruAccent } from './desktopLook'

/**
 * The login screen and the boot splash in the island's look. They belong to
 * the system, so they need your password: one small script does it all
 * through pkexec (Ubuntu asks for your password), and Undo puts back what
 * was there.
 *
 * - Login screen: GDM's own settings (light or dark, Yaru in the accent) in
 *   /etc/dconf/db/gdm.d, and its shell theme in the accent where Ubuntu has
 *   one (the gdm-theme.gresource alternative).
 * - Boot splash: a Plymouth theme with the island's orb, breathing, made
 *   the default (the default.plymouth alternative), then the boot image is
 *   rebuilt (update-initramfs), which takes a minute.
 */

/** Yaru's name for the accent, light or dark ("Yaru-blue-dark"). Pure. */
export function yaruTheme(accent: string, dark: boolean): string {
  const a = yaruAccent(accent)
  return `Yaru${a ? `-${a}` : ''}${dark ? '-dark' : ''}`
}

/** GDM's settings, as a dconf keyfile. Pure. */
export function gdmKeyfile(accent: string, dark: boolean): string {
  const a = yaruAccent(accent)
  return [
    '# Written by Dynamic Island (Settings › Desktop). Undo there removes it.',
    '[org/gnome/desktop/interface]',
    `color-scheme='${dark ? 'prefer-dark' : 'default'}'`,
    `gtk-theme='${yaruTheme(accent, dark)}'`,
    `icon-theme='Yaru${a ? `-${a}` : ''}'`,
    '',
  ].join('\n')
}

/** The Plymouth theme's two text files. Pure. */
export function plymouthFiles(): Record<'island.plymouth' | 'island.script', string> {
  const dir = '/usr/share/plymouth/themes/island'
  return {
    'island.plymouth': ['[Plymouth Theme]', 'Name=Dynamic Island', 'Description=The island’s orb, breathing while Ubuntu starts.', 'ModuleName=script', '', '[script]', `ImageDir=${dir}`, `ScriptFile=${dir}/island.script`, ''].join('\n'),
    'island.script': `# Dynamic Island: the orb breathes while Ubuntu starts.
Window.SetBackgroundTopColor(0.035, 0.039, 0.05);
Window.SetBackgroundBottomColor(0.035, 0.039, 0.05);

orb.image = Image("orb.png");
orb.sprite = Sprite(orb.image);
orb.sprite.SetX(Window.GetX() + Window.GetWidth() / 2 - orb.image.GetWidth() / 2);
orb.sprite.SetY(Window.GetY() + Window.GetHeight() / 2 - orb.image.GetHeight() / 2);
orb.sprite.SetZ(10);

t = 0;
fun refresh_callback () {
  t = t + 1;
  orb.sprite.SetOpacity(0.6 + 0.4 * Math.Sin(t / 18));
}
Plymouth.SetRefreshFunction(refresh_callback);

# An encrypted disk: its password, under the orb.
prompt.sprite = Sprite();
bullets.sprite = Sprite();
fun display_password_callback (text, count) {
  prompt.sprite.SetImage(Image.Text(text, 0.9, 0.9, 0.92));
  prompt.sprite.SetX(Window.GetX() + Window.GetWidth() / 2 - prompt.sprite.GetImage().GetWidth() / 2);
  prompt.sprite.SetY(orb.sprite.GetY() + orb.image.GetHeight() + 40);
  prompt.sprite.SetOpacity(1);
  dots = "";
  for (i = 0; i < count; i++) dots = dots + "*";
  bullets.sprite.SetImage(Image.Text(dots, 1, 1, 1));
  bullets.sprite.SetX(Window.GetX() + Window.GetWidth() / 2 - bullets.sprite.GetImage().GetWidth() / 2);
  bullets.sprite.SetY(prompt.sprite.GetY() + 30);
  bullets.sprite.SetOpacity(1);
}
fun display_normal_callback () {
  prompt.sprite.SetOpacity(0);
  bullets.sprite.SetOpacity(0);
}
Plymouth.SetDisplayPasswordFunction(display_password_callback);
Plymouth.SetDisplayNormalFunction(display_normal_callback);

message.sprite = Sprite();
fun message_callback (text) {
  message.sprite.SetImage(Image.Text(text, 0.7, 0.7, 0.72));
  message.sprite.SetX(Window.GetX() + Window.GetWidth() / 2 - message.sprite.GetImage().GetWidth() / 2);
  message.sprite.SetY(Window.GetY() + Window.GetHeight() - 60);
}
Plymouth.SetMessageFunction(message_callback);
`,
  }
}

// ------------------------------------------------------------- the orb ----

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(b: Buffer): number {
  let c = 0xffffffff
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** An RGBA image as a PNG. Pure. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/** The island's orb in the accent: a lit sphere with a soft glow, on transparent. Pure. */
export function orbPng(hex: string, size = 192): Buffer {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const px = new Uint8Array(size * size * 4)
  const c = size / 2
  const R = size * 0.27
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c
      const dy = y + 0.5 - c
      const d = Math.hypot(dx, dy)
      let a = 0
      let cr = r
      let cg = g
      let cb = b
      if (d <= R + 1) {
        // The sphere: lit from the top left, edge anti-aliased.
        const lx = (dx + R * 0.35) / R
        const ly = (dy + R * 0.35) / R
        const light = Math.max(0, 1 - Math.hypot(lx, ly) * 0.75)
        const mix = (v: number) => Math.round(v * (0.55 + 0.45 * (1 - d / R)) + (255 - v) * light * 0.55)
        cr = mix(r)
        cg = mix(g)
        cb = mix(b)
        a = Math.min(1, R + 1 - d)
      }
      // The glow around it.
      const glow = d > R ? Math.exp(-(((d - R) / (size * 0.09)) ** 2)) * 0.55 : 0
      const i = (y * size + x) * 4
      const outA = a + glow * (1 - a)
      px[i] = Math.round(outA ? (cr * a + r * glow * (1 - a)) / outA : r)
      px[i + 1] = Math.round(outA ? (cg * a + g * glow * (1 - a)) / outA : g)
      px[i + 2] = Math.round(outA ? (cb * a + b * glow * (1 - a)) / outA : b)
      px[i + 3] = Math.round(outA * 255)
    }
  return encodePng(size, size, px)
}

// ----------------------------------------------------------- as root ----

/**
 * What runs as root (through pkexec): only these commands, only these
 * paths, each argument checked. ISLAND_SYSROOT is for tests (pkexec clears
 * the environment, so it's always empty for real).
 */
export const HELPER = `#!/bin/sh
# Dynamic Island: the login screen and the boot splash in the island's look.
set -eu
R="\${ISLAND_SYSROOT:-}"
# Tests put stand-ins first (pkexec clears the environment, so never for real).
PATH="\${ISLAND_TEST_PATH:+\$ISLAND_TEST_PATH:}/usr/sbin:/usr/bin:/sbin:/bin"
cmd="\${1:-}"
theme_ok() { printf '%s' "$1" | grep -Eq '^Yaru(-[a-z]+)?(-dark)?$'; }
path_ok() { printf '%s' "$1" | grep -Eq '^/usr/share/(gnome-shell|plymouth)/[A-Za-z0-9/._-]+$' && ! printf '%s' "$1" | grep -q '\\.\\.'; }
listed() { update-alternatives --list "$1" 2>/dev/null | grep -qx "$2"; }
current() { update-alternatives --query "$1" 2>/dev/null | sed -n 's/^Value: //p'; }
PLY=/usr/share/plymouth/themes/island
case "$cmd" in
  gdm)
    dark="$2"; keyfile="$3"; shell="$4"
    [ "$dark" = 0 ] || [ "$dark" = 1 ] || exit 2
    [ -f "$keyfile" ] || exit 2
    mkdir -p "$R/etc/dconf/db/gdm.d" "$R/etc/dconf/profile"
    [ -f "$R/etc/dconf/profile/gdm" ] || printf 'user-db:user\\nsystem-db:gdm\\nfile-db:/usr/share/gdm/greeter-dconf-defaults\\n' > "$R/etc/dconf/profile/gdm"
    # Only these lines get through: a comment, the section, and the three keys with plain values.
    grep -E "^(#.*|\\[org/gnome/desktop/interface\\]|(color-scheme|gtk-theme|icon-theme)='[A-Za-z0-9-]+')$" "$keyfile" > "$R/etc/dconf/db/gdm.d/90-dynamic-island"
    dconf update
    echo "previous-gdm $(current gdm-theme.gresource)"
    if [ "$shell" != - ] && theme_ok "$shell"; then
      t="/usr/share/gnome-shell/theme/$shell/gnome-shell-theme.gresource"
      if listed gdm-theme.gresource "$t"; then update-alternatives --set gdm-theme.gresource "$t" >/dev/null; echo "shell $shell"; else echo "no-shell $shell"; fi
    fi
    echo ok ;;
  gdm-undo)
    prev="\${2:--}"
    rm -f "$R/etc/dconf/db/gdm.d/90-dynamic-island"
    dconf update
    if [ "$prev" != - ] && path_ok "$prev" && listed gdm-theme.gresource "$prev"; then update-alternatives --set gdm-theme.gresource "$prev" >/dev/null; fi
    echo ok ;;
  splash)
    src="$2"
    case "$src" in /tmp/island-system-*) ;; *) exit 2 ;; esac
    printf '%s' "$src" | grep -q '\\.\\.' && exit 2
    echo "previous-splash $(current default.plymouth)"
    mkdir -p "$R$PLY"
    for f in island.plymouth island.script orb.png; do cp "$src/$f" "$R$PLY/$f"; done
    update-alternatives --install /usr/share/plymouth/themes/default.plymouth default.plymouth "$PLY/island.plymouth" 100 >/dev/null
    update-alternatives --set default.plymouth "$PLY/island.plymouth" >/dev/null
    update-initramfs -u >/dev/null 2>&1 || { echo initramfs-failed; exit 3; }
    echo ok ;;
  splash-undo)
    prev="\${2:--}"
    if [ "$prev" != - ] && path_ok "$prev" && listed default.plymouth "$prev"; then update-alternatives --set default.plymouth "$prev" >/dev/null; else update-alternatives --auto default.plymouth >/dev/null; fi
    update-alternatives --remove default.plymouth "$PLY/island.plymouth" >/dev/null 2>&1 || true
    rm -rf "$R$PLY"
    update-initramfs -u >/dev/null 2>&1 || { echo initramfs-failed; exit 3; }
    echo ok ;;
  *) exit 2 ;;
esac
`

export type SystemLookResult = { ok: true; out: string[] } | { ok: false; error: string }

/** Runs the helper as root, through pkexec (tests: a stand-in). */
export class SystemLook {
  constructor(private pkexec = process.env.DI_PKEXEC || 'pkexec') {}

  private dir(): string {
    // Under /tmp, where root can read it (an AppImage's own files may not be).
    return mkdtempSync(join(tmpdir(), 'island-system-'))
  }

  private run(args: string[]): Promise<SystemLookResult> {
    const dir = this.dir()
    const helper = join(dir, 'system-look.sh')
    writeFileSync(helper, HELPER)
    chmodSync(helper, 0o755)
    return new Promise((resolve) =>
      execFile(this.pkexec, ['/bin/sh', helper, ...args], { timeout: 10 * 60_000 }, (e, out, err) => {
        const lines = String(out).split('\n').map((l) => l.trim()).filter(Boolean)
        if (!e && lines.includes('ok')) return resolve({ ok: true, out: lines })
        const code = (e as unknown as { code?: number | string } | null)?.code
        if (code === 'ENOENT') return resolve({ ok: false, error: 'pkexec isn’t installed (sudo apt install pkexec).' })
        // pkexec: 126 when you cancelled, 127 when it wasn't allowed.
        if (code === 126 || code === 127) return resolve({ ok: false, error: 'Not changed: the password was cancelled.' })
        if (lines.includes('initramfs-failed')) return resolve({ ok: false, error: 'The boot image couldn’t be rebuilt (update-initramfs failed); the splash shows after the next successful update.' })
        resolve({ ok: false, error: String(err || (e as Error)?.message || 'It didn’t work.').trim().split('\n')[0].slice(0, 200) })
      }),
    )
  }

  /** The login screen in the accent, light or dark. Returns the shell theme to put back, and whether the accent's shell theme exists here. */
  async loginScreen(accent: string, dark: boolean): Promise<{ ok: true; previous: string; shellTheme: boolean } | { ok: false; error: string }> {
    const dir = this.dir()
    const keyfile = join(dir, 'gdm.ini')
    writeFileSync(keyfile, gdmKeyfile(accent, dark))
    const r = await this.run(['gdm', dark ? '1' : '0', keyfile, yaruTheme(accent, false)])
    if (!r.ok) return r
    const previous = r.out.find((l) => l.startsWith('previous-gdm '))?.slice('previous-gdm '.length).trim() ?? ''
    return { ok: true, previous, shellTheme: r.out.some((l) => l.startsWith('shell ')) }
  }

  async loginScreenUndo(previous: string): Promise<SystemLookResult> {
    return this.run(['gdm-undo', previous || '-'])
  }

  /** The boot splash with the island's orb. Returns the splash to put back. */
  async bootSplash(accentHex: string): Promise<{ ok: true; previous: string } | { ok: false; error: string }> {
    const dir = this.dir()
    const files = plymouthFiles()
    writeFileSync(join(dir, 'island.plymouth'), files['island.plymouth'])
    writeFileSync(join(dir, 'island.script'), files['island.script'])
    writeFileSync(join(dir, 'orb.png'), orbPng(accentHex))
    const r = await this.run(['splash', dir])
    if (!r.ok) return r
    return { ok: true, previous: r.out.find((l) => l.startsWith('previous-splash '))?.slice('previous-splash '.length).trim() ?? '' }
  }

  async bootSplashUndo(previous: string): Promise<SystemLookResult> {
    return this.run(['splash-undo', previous || '-'])
  }
}
