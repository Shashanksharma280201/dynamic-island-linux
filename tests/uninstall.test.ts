import { describe, expect, it } from 'vitest'
import { appBundle, dataPaths, doneText, finishScript, installKind, launchCommand, windowsUninstaller } from '../electron/uninstall'

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
    const sh = finishScript({ platform: 'darwin', pid: 42, remove: ['/Users/me/Library/Application Support/x', "/tmp/it's"], kind: 'mac-app' })
    expect(sh.ext).toBe('sh')
    expect(sh.text).toContain('dynamic-island-uninstall.log')
    expect(sh.text).toContain('while kill -0 42')
    expect(sh.text).toContain("rm -rf '/Users/me/Library/Application Support/x'")
    expect(sh.text).toContain(`rm -rf '/tmp/it'\\''s'`)
    expect(finishScript({ platform: 'linux', pid: 1, remove: [], kind: 'appimage', appImage: '/home/me/D I.AppImage' }).text).toContain("rm -f '/home/me/D I.AppImage'")
    expect(finishScript({ platform: 'linux', pid: 1, remove: [], kind: 'deb', debPackage: 'dynamic-island-linux' }).text).toContain(
      "pkexec apt-get remove -y 'dynamic-island-linux'",
    )
    const mac = finishScript({ platform: 'darwin', pid: 3, remove: ['/U/Library/Preferences/a.b.plist'], kind: 'mac-app' }).text
    expect(mac).toContain("defaults delete '/U/Library/Preferences/a.b'")
    expect(mac).toContain("rm -rf '/U/Library/Preferences/a.b.plist'")
    const win = finishScript({ platform: 'win32', pid: 7, remove: ["C:\\Users\\o'neil\\AppData\\Roaming\\x"], kind: 'windows-installer', uninstaller: 'C:\\P\\Uninstall Dynamic Island.exe' })
    expect(win.ext).toBe('ps1')
    expect(win.text).toContain('Wait-Process -Id 7')
    expect(win.text).toContain("Remove-Item -LiteralPath 'C:\\Users\\o''neil\\AppData\\Roaming\\x'")
    expect(win.text).toContain("$u = 'C:\\P\\Uninstall Dynamic Island.exe'")
    expect(win.text).toContain("Start-Process -FilePath $u -ArgumentList '/S' -Wait -PassThru")
  })

  it('starts the finishing script apart from the island', () => {
    expect(launchCommand('linux', '/tmp/f.sh')).toEqual({ cmd: '/bin/sh', args: ['/tmp/f.sh'], verbatim: false })
    const w = launchCommand('win32', 'C:\\T\\f.ps1')
    expect(w.cmd).toBe('cmd.exe')
    expect(w.args.at(-1)).toBe('start "" /min powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\\T\\f.ps1"')
  })

  it('says what happened', () => {
    expect(doneText('mac-app', true, 'p')).toBe('Dynamic Island was moved to the Trash, with its settings and data.')
    expect(doneText('deb', false, 'dynamic-island-linux')).toContain('sudo apt remove dynamic-island-linux')
    expect(doneText('source', false, 'p')).toContain('your settings and data are kept')
  })
})
