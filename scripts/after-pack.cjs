// electron-builder afterPack hook: on macOS, sign the finished app ad hoc
// (no Apple certificate needed) before the .dmg is made. Apple silicon refuses
// unsigned apps as "damaged"; electron-builder's own ad-hoc signing leaves a
// signature that doesn't verify, so it's off ("identity": null) and done here.
// A release built with a Developer ID certificate (-c.mac.identity=<team ID>,
// see docs/mac-signing.md) is signed by electron-builder instead.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'darwin') return
  if (ctx.packager.platformSpecificBuildOptions.identity != null) return
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' })
}
