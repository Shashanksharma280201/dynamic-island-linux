import { describe, expect, it } from 'vitest'
import { appBundle, dataPaths, doneText, finishCommand, installKind, windowsUninstaller } from '../electron/uninstall'

describe('uninstall', () => {
  it('knows how it was installed', () => {
    expect(installKind({ packaged: false, platform: 'darwin', execPath: '/x' })).toBe('source')
    expect(installKind({ packaged: true, platform: 'darwin', execPath: '/Applications/Dynamic Island.app/Contents/MacOS/x' })).toBe('mac-app')
    expect(installKind({ packaged: true, platform: 'win32', execPath: 'C:\\x.exe' })).toBe('windows-installer')
    expect(installKind({ packaged: true, platform: 'linux', execPath: '/tmp/.mount/x', appImage: '/home/me/x.AppImage' })).toBe('appimage')
    expect(installKind({ packaged: true, platform: 'linux', execPath: '/opt/Dynamic Island/x' })).toBe('deb')
  })

  it('finds the app bundle and the Windows uninstaller', () => {
    expect(appBundle('/Applications/Dynamic Island.app/Contents/MacOS/dynamic-island-linux')).toBe('/Applications/Dynamic Island.app')
    expect(appBundle('/usr/bin/x')).toBeNull()
    expect(windowsUninstaller('C:\\Users\\me\\AppData\\Local\\Programs\\Dynamic Island\\DynamicIsland.exe', 'Dynamic Island').replace(/\\/g, '/')).toBe(
      'C:/Users/me/AppData/Local/Programs/Dynamic Island/Uninstall Dynamic Island.exe',
    )
  })

  it('lists the data folder, plus what macOS adds, but never Documents', () => {
    const o = { userData: '/home/me/.config/Dynamic Island', home: '/home/me', appId: 'io.x.app', productName: 'Dynamic Island' }
    expect(dataPaths({ ...o, platform: 'linux' })).toEqual(['/home/me/.config/Dynamic Island'])
    const mac = dataPaths({ ...o, platform: 'darwin' })
    expect(mac).toContain('/home/me/Library/Preferences/io.x.app.plist')
    expect(mac).toContain('/home/me/Library/Saved Application State/io.x.app.savedState')
    expect(mac.some((p) => p.includes('Documents'))).toBe(false)
  })

  it('finishes after the island quits, quoting every path', () => {
    const sh = finishCommand({ platform: 'darwin', pid: 42, remove: ["/Users/me/Library/Application Support/Dynamic Island", "/tmp/it's"], kind: 'mac-app' })
    expect(sh.cmd).toBe('/bin/sh')
    expect(sh.args[1]).toContain('while kill -0 42')
    expect(sh.args[1]).toContain("rm -rf '/Users/me/Library/Application Support/Dynamic Island'")
    expect(sh.args[1]).toContain(`rm -rf '/tmp/it'\\''s'`)
    const img = finishCommand({ platform: 'linux', pid: 1, remove: [], kind: 'appimage', appImage: '/home/me/D I.AppImage' })
    expect(img.args[1]).toContain("rm -f '/home/me/D I.AppImage'")
    const deb = finishCommand({ platform: 'linux', pid: 1, remove: [], kind: 'deb', debPackage: 'dynamic-island-linux' })
    expect(deb.args[1]).toContain("pkexec apt-get remove -y 'dynamic-island-linux'")
    const win = finishCommand({ platform: 'win32', pid: 7, remove: ["C:\\Users\\o'neil\\AppData\\Roaming\\Dynamic Island"], kind: 'windows-installer', uninstaller: 'C:\\P\\Uninstall Dynamic Island.exe' })
    expect(win.cmd).toBe('powershell.exe')
    const script = win.args[win.args.length - 1]
    expect(script).toContain('Wait-Process -Id 7')
    expect(script).toContain("Remove-Item -LiteralPath 'C:\\Users\\o''neil\\AppData\\Roaming\\Dynamic Island'")
    expect(script).toContain("-FilePath 'C:\\P\\Uninstall Dynamic Island.exe' -ArgumentList '/S'")
  })

  it('says what happened', () => {
    expect(doneText('mac-app', true, 'p')).toBe('Dynamic Island was moved to the Trash, with its settings and data.')
    expect(doneText('deb', false, 'dynamic-island-linux')).toContain('sudo apt remove dynamic-island-linux')
    expect(doneText('source', false, 'p')).toContain('your settings and data are kept')
  })
})
