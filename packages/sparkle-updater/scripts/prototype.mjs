import { execFileSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const target = resolve(root, '../../.tmp/sparkle-prototype')
mkdirSync(target, { recursive: true })
const keyPath = resolve(target, 'test-private-key')
const publicPath = resolve(target, 'test-public-key')
if (!existsSync(keyPath)) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  writeFileSync(
    keyPath,
    privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('base64'),
    { mode: 0o600 },
  )
  writeFileSync(
    publicPath,
    publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64'),
  )
}
const publicKey = readFileSync(publicPath, 'utf8')
const run = (bin, args) => execFileSync(bin, args, { stdio: 'pipe' })
for (const version of ['0.0.1', '0.0.2']) {
  const app = resolve(target, version, 'Marchen Sparkle Prototype.app')
  if (existsSync(app)) throw new Error(`原型输出已存在，使用新的隔离目录或人工清理：${app}`)
  mkdirSync(resolve(target, version), { recursive: true })
  run('ditto', [resolve(root, '../../node_modules/electron/dist/Electron.app'), app])
  const resources = resolve(app, 'Contents/Resources')
  mkdirSync(resolve(resources, 'app'), { recursive: true })
  copyFileSync(resolve(root, 'prototype/main.cjs'), resolve(resources, 'app/main.cjs'))
  writeFileSync(
    resolve(resources, 'app/package.json'),
    JSON.stringify({ name: 'marchen-sparkle-prototype', version, main: 'main.cjs' }),
  )
  copyFileSync(resolve(root, 'build/sparkle.node'), resolve(resources, 'sparkle.node'))
  run('ditto', [
    resolve(root, 'vendor/Sparkle.framework'),
    resolve(app, 'Contents/Frameworks/Sparkle.framework'),
  ])
  const plist = resolve(app, 'Contents/Info.plist')
  const values = {
    CFBundleIdentifier: 'com.suemor.marchen.sparkle-prototype',
    CFBundleName: 'Marchen Sparkle Prototype',
    CFBundleDisplayName: 'Marchen Sparkle Prototype',
    CFBundleVersion: version,
    CFBundleShortVersionString: version,
    SUFeedURL: 'http://127.0.0.1:18746/appcast.xml',
    SUPublicEDKey: publicKey,
  }
  for (const [key, value] of Object.entries(values))
    run('plutil', ['-replace', key, '-string', value, plist])
  run('plutil', ['-replace', 'CFBundleLocalizations', '-json', '["en","zh_CN","zh_TW"]', plist])
  run('plutil', ['-replace', 'SUEnableInstallerLauncherService', '-bool', 'NO', plist])
  run('plutil', ['-replace', 'SUEnableAutomaticChecks', '-bool', 'NO', plist])
  // HTTP 仅用于独立测试 bundle 的 loopback 源，正式应用不允许此例外。
  run('plutil', [
    '-replace',
    'NSAppTransportSecurity',
    '-json',
    '{"NSAllowsLocalNetworking":true}',
    plist,
  ])
  run('codesign', ['--force', '--deep', '--sign', '-', app])
  run('codesign', ['--verify', '--deep', '--strict', app])
  run('ditto', [
    '-c',
    '-k',
    '--sequesterRsrc',
    '--keepParent',
    app,
    resolve(target, `prototype-${version}.zip`),
  ])
  console.log(`已构建并校验隔离原型 ${version}`)
}
const archive = resolve(target, 'prototype-0.0.2.zip')
const signature = run(resolve(root, 'vendor/bin/sign_update'), ['--ed-key-file', keyPath, archive])
  .toString()
  .trim()
if (!signature.includes('sparkle:edSignature=')) throw new Error('更新签名输出不符')
writeFileSync(
  resolve(target, 'appcast.xml'),
  `<?xml version="1.0" encoding="utf-8"?><rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>Marchen 隔离更新测试</title><item><title>原型 0.0.2</title><description><![CDATA[<h2>更新验证</h2><p>验证中文窗口、签名和安装重启。</p>]]></description><sparkle:version>0.0.2</sparkle:version><sparkle:shortVersionString>0.0.2</sparkle:shortVersionString><sparkle:minimumSystemVersion>13.0</sparkle:minimumSystemVersion><enclosure url="http://127.0.0.1:18746/prototype-0.0.2.zip" ${signature} type="application/octet-stream"/></item></channel></rss>`,
)
console.log('原型更新源已生成；私钥仅保存在被忽略的本地目录')
