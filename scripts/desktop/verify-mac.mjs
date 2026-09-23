import { execFileSync } from 'node:child_process'
import { access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { sparkleBuildVersion } from '../../packages/shared/src/update-policy.ts'
const app = resolve(process.argv[2] || '')
if (!app.endsWith('.app')) throw new Error('请提供提取后的最终 .app 路径')
execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
for (const path of [
  'Contents/Resources/sparkle/sparkle.node',
  'Contents/Resources/sparkle/LICENSE',
  'Contents/Frameworks/Sparkle.framework/Sparkle',
])
  await access(join(app, path))
const plist = JSON.parse(
  execFileSync('plutil', ['-convert', 'json', '-o', '-', join(app, 'Contents/Info.plist')], {
    encoding: 'utf8',
  }),
)
if (
  !plist.SUPublicEDKey ||
  plist.SUPublicEDKey.includes('PLACEHOLDER') ||
  !plist.SUFeedURL?.startsWith('https://')
)
  throw new Error('更新配置无效')
if (plist.CFBundleVersion !== sparkleBuildVersion(plist.CFBundleShortVersionString))
  throw new Error('Mac 内部构建版本与显示版本不一致')
const architectures = execFileSync(
  'lipo',
  ['-archs', join(app, 'Contents/MacOS', plist.CFBundleExecutable)],
  { encoding: 'utf8' },
).trim()
if (architectures !== 'arm64') throw new Error('仅允许 ARM64 应用')
// ASAR 清单必须包含重构后的解码与音频资源；不读取私密 env 内容。
const { createRequire } = await import('node:module')
const require = createRequire(import.meta.url)
const entries = require('@electron/asar').listPackage(join(app, 'Contents/Resources/app.asar'))
for (const token of [
  '/wasm/libav/0.1.1/',
  '/audio/soundtouch/2.1.1/processor.js',
  'subtitles-octopus-worker.wasm',
]) {
  if (!entries.some((name) => name.includes(token))) throw new Error(`安装包缺少资源：${token}`)
}
if (entries.some((name) => /\.map$|\/\.env(?:\.|$)/.test(name)))
  throw new Error('安装包含构建敏感文件或 Source Map')
console.log('最终 Mac 应用的签名、架构、更新和媒体资源检查通过')
