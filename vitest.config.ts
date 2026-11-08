import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Tests of Linux-only parts (X11, D-Bus, XDG autostart, GNOME's look, the login screen) run only on Linux.
const linuxOnly = ['tests/inputShape.test.ts', 'tests/notifications.test.ts', 'tests/autostart.test.ts', 'tests/system.test.ts', 'tests/desktopLook.test.ts', 'tests/systemLook.test.ts']

export default defineConfig({
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'], exclude: process.platform === 'linux' ? [] : linuxOnly },
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
})
