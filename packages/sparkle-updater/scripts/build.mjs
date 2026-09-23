import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 官方发布包及头文件均校验后才参与构建，不使用浮动 latest。
const root = fileURLToPath(new URL('../', import.meta.url))
const version = '2.10.0'
const digest = 'c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c'
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('原生桥接仅在 macOS ARM64 构建')
}
const vendor = resolve(root, 'vendor')
const build = resolve(root, 'build')
await mkdir(vendor, { recursive: true })
await mkdir(build, { recursive: true })
const archive = resolve(vendor, `Sparkle-${version}.tar.xz`)
try {
  await access(archive)
} catch {
  execFileSync(
    'curl',
    [
      '-fL',
      '--retry',
      '2',
      `https://github.com/sparkle-project/Sparkle/releases/download/${version}/Sparkle-${version}.tar.xz`,
      '-o',
      archive,
    ],
    { stdio: 'inherit' },
  )
}
if (
  createHash('sha256')
    .update(await readFile(archive))
    .digest('hex') !== digest
) {
  throw new Error('Sparkle 官方发布包校验失败')
}
execFileSync('tar', ['-xf', archive, '-C', vendor])
// N-API 使用 Electron 自身随版本发布的头文件；无需额外 node-gyp 依赖。
const electron = JSON.parse(
  await readFile(resolve(root, '../../node_modules/electron/package.json'), 'utf8'),
)
const headerName = `node-v${electron.version}-headers.tar.gz`
const headers = resolve(build, headerName)
const base = `https://electronjs.org/headers/v${electron.version}`
execFileSync('curl', [
  '-fsSL',
  '--retry',
  '2',
  `${base}/SHASUMS256.txt`,
  '-o',
  resolve(build, 'SHASUMS256.txt'),
])
const checksums = await readFile(resolve(build, 'SHASUMS256.txt'), 'utf8')
const expected = checksums
  .split('\n')
  .find((line) => line.trim().endsWith(` ${headerName}`))
  ?.split(/\s+/)[0]
if (!expected) throw new Error('Electron 头文件校验清单缺少目标')
try {
  await access(headers)
} catch {
  execFileSync('curl', ['-fsSL', '--retry', '2', `${base}/${headerName}`, '-o', headers])
}
if (
  createHash('sha256')
    .update(await readFile(headers))
    .digest('hex') !== expected
)
  throw new Error('Electron 头文件校验失败')
execFileSync('tar', ['-xf', headers, '-C', build])
const sdk = execFileSync('xcrun', ['--sdk', 'macosx', '--show-sdk-path'], {
  encoding: 'utf8',
}).trim()
execFileSync(
  'xcrun',
  [
    'clang++',
    '-isysroot',
    sdk,
    '-std=c++17',
    '-fobjc-arc',
    '-fblocks',
    '-arch',
    'arm64',
    '-mmacosx-version-min=13.0',
    '-bundle',
    '-undefined',
    'dynamic_lookup',
    '-I',
    resolve(build, `node_headers/include/node`),
    '-F',
    vendor,
    '-framework',
    'Cocoa',
    '-framework',
    'Sparkle',
    '-Wl,-rpath,@executable_path/../Frameworks',
    '-Wl,-rpath,@loader_path/../vendor',
    resolve(root, 'native/bridge.mm'),
    '-o',
    resolve(build, 'sparkle.node'),
  ],
  { stdio: 'inherit' },
)
await writeFile(
  resolve(build, 'manifest.json'),
  JSON.stringify(
    { sparkle: version, sha256: digest, electron: electron.version, arch: 'arm64' },
    null,
    2,
  ),
)
console.log('Sparkle ARM64 桥接构建完成')
