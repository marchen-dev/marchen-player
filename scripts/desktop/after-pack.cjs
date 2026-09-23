const { execFileSync } = require('node:child_process')
const { copyFileSync, mkdirSync, readFileSync } = require('node:fs')
const { resolve, join } = require('node:path')

// 资源在 electron-builder 正式签名前放入 bundle，之后不再修改应用内容。
module.exports = async (context) => {
  if (process.env.MARCHEN_RELEASE_NOTES)
    copyFileSync(
      process.env.MARCHEN_RELEASE_NOTES,
      join(
        context.appOutDir,
        context.electronPlatformName === 'darwin'
          ? `${context.packager.appInfo.productFilename}.app/Contents/Resources/release-notes.md`
          : 'resources/release-notes.md',
      ),
    )
  if (context.electronPlatformName !== 'darwin') return
  const root = context.packager.projectDir
  const { parseReleaseVersion, updateFeedURL } =
    await import('../../packages/shared/src/update-policy.ts')
  const channel = parseReleaseVersion(context.packager.appInfo.version).channel
  const key = process.env.SPARKLE_ED_PUBLIC_KEY?.trim()
  if (!key || !/^[A-Z0-9+/]{43}=$/i.test(key) || Buffer.from(key, 'base64').length !== 32)
    throw new Error('需要有效的 Sparkle Ed25519 公钥')
  const feed = process.env.MARCHEN_SPARKLE_FEED || updateFeedURL('mac', channel)
  if (new URL(feed).protocol !== 'https:') throw new Error('正式打包更新源必须为 HTTPS')
  const manifest = JSON.parse(
    readFileSync(resolve(root, 'packages/sparkle-updater/build/manifest.json')),
  )
  if (
    manifest.arch !== 'arm64' ||
    (manifest.electron !== context.packager.config.electronVersion &&
      manifest.electron !== require(resolve(root, 'node_modules/electron/package.json')).version)
  )
    throw new Error('原生桥接版本或架构不匹配')
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('ditto', [
    resolve(root, 'packages/sparkle-updater/vendor/Sparkle.framework'),
    join(app, 'Contents/Frameworks/Sparkle.framework'),
  ])
  const resources = join(app, 'Contents/Resources/sparkle')
  mkdirSync(resources, { recursive: true })
  copyFileSync(
    resolve(root, 'packages/sparkle-updater/build/sparkle.node'),
    join(resources, 'sparkle.node'),
  )
  copyFileSync(resolve(root, 'packages/sparkle-updater/vendor/LICENSE'), join(resources, 'LICENSE'))
  const plist = join(app, 'Contents/Info.plist')
  for (const [name, value] of Object.entries({ SUFeedURL: feed, SUPublicEDKey: key }))
    execFileSync('plutil', ['-replace', name, '-string', value, plist])
  execFileSync('plutil', ['-replace', 'SUEnableInstallerLauncherService', '-bool', 'NO', plist])
  execFileSync('plutil', [
    '-replace',
    'CFBundleLocalizations',
    '-json',
    '["en","zh_CN","zh_TW"]',
    plist,
  ])
}
