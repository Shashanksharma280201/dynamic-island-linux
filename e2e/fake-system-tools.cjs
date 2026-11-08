// Stand-ins for what the login screen and boot splash need as root, for
// tests: pkexec (runs the command as you, keeping the environment), and
// update-alternatives, dconf and update-initramfs (which keep their state in
// files and log each call). Nothing touches the real system: the helper
// writes under ISLAND_SYSROOT and finds these first on ISLAND_TEST_PATH.
const fs = require('fs')
const path = require('path')

function makeFakeSystem(dir) {
  const bin = path.join(dir, 'bin')
  const root = path.join(dir, 'root')
  const state = path.join(dir, 'alternatives')
  const log = path.join(dir, 'calls.log')
  for (const d of [bin, root, state]) fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(log, '')
  const sh = (name, body) => fs.writeFileSync(path.join(bin, name), `#!/bin/sh\necho "${name} $*" >> "${log}"\n${body}\n`, { mode: 0o755 })
  sh('pkexec', 'exec "$@"')
  sh('dconf', 'exit 0')
  sh('update-initramfs', 'exit 0')
  sh(
    'update-alternatives',
    `S="${state}"
case "$1" in
  --list) cat "$S/$2.list" 2>/dev/null || exit 2 ;;
  --query) [ -f "$S/$2.value" ] && echo "Value: $(cat "$S/$2.value")" || exit 2 ;;
  --set) grep -qx "$3" "$S/$2.list" || exit 2; echo "$3" > "$S/$2.value" ;;
  --install) grep -qx "$4" "$S/$3.list" 2>/dev/null || echo "$4" >> "$S/$3.list" ;;
  --remove) grep -vx "$3" "$S/$2.list" > "$S/$2.tmp"; mv "$S/$2.tmp" "$S/$2.list" ;;
  --auto) head -n1 "$S/$2.list" > "$S/$2.value" ;;
  *) exit 2 ;;
esac`,
  )
  // What a fresh Ubuntu 22.04 has.
  const gdm = ['Yaru', 'Yaru-dark', 'Yaru-blue', 'Yaru-purple'].map((t) => `/usr/share/gnome-shell/theme/${t}/gnome-shell-theme.gresource`)
  fs.writeFileSync(path.join(state, 'gdm-theme.gresource.list'), gdm.join('\n') + '\n')
  fs.writeFileSync(path.join(state, 'gdm-theme.gresource.value'), gdm[0] + '\n')
  const ply = ['/usr/share/plymouth/themes/bgrt/bgrt.plymouth', '/usr/share/plymouth/themes/spinner/spinner.plymouth']
  fs.writeFileSync(path.join(state, 'default.plymouth.list'), ply.join('\n') + '\n')
  fs.writeFileSync(path.join(state, 'default.plymouth.value'), ply[0] + '\n')
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '')
  return {
    bin,
    root,
    log,
    pkexec: path.join(bin, 'pkexec'),
    env: { ISLAND_SYSROOT: root, ISLAND_TEST_PATH: bin },
    value: (name) => read(path.join(state, `${name}.value`)),
    list: (name) => read(path.join(state, `${name}.list`)).split('\n').filter(Boolean),
    calls: () => read(log).split('\n').filter(Boolean),
  }
}

module.exports = { makeFakeSystem }
