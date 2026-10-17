import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { extractFile, listPackage } from '@electron/asar'
import { parse } from 'yaml'
import {
  linuxArtifactNames,
  linuxMetadataName,
  parseReleaseVersion,
} from '../../packages/shared/src/update-policy.ts'
import {
  debArchitecture,
  debVersion,
  elfArch,
  isLoadableNativeModule,
  parseDesktopEntry,
  verifyDesktopEntry,
  verifyLinuxMetadata,
} from './linux-package.mjs'
import { verifyPackageResources } from './package-resources.mjs'

const EXECUTABLE = 'marchen'
const root = resolve(process.argv[2] || 'dist')
const arch = process.argv[3]
if (arch !== 'x64' && arch !== 'arm64') throw new Error('请提供架构 x64 或 arm64')
const { version } = JSON.parse(await readFile('package.json', 'utf8'))
const { channel } = parseReleaseVersion(version)
const names = linuxArtifactNames(version, arch)

/** 递归列出目录下所有文件 */
async function walk(dir) {
  const result = []
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name)
    if (item.isDirectory()) result.push(...(await walk(path)))
    else if (item.isFile()) result.push(path)
  }
  return result
}

/** 校验解包后的应用目录：主程序与全部原生模块架构、ASAR 资源与版本 */
async function verifyAppDir(appDir, label) {
  if (elfArch(await readFile(join(appDir, EXECUTABLE))) !== arch)
    throw new Error(`${label} 主程序架构不是 ${arch}`)
  const natives = (await walk(appDir)).filter(
    (path) => path.endsWith('.node') && isLoadableNativeModule(path, arch),
  )
  if (!natives.some((path) => path.includes('node-datachannel')))
    throw new Error(`${label} 缺少 node-datachannel 原生模块`)
  for (const path of natives) {
    const found = elfArch(await readFile(path))
    if (found !== arch) throw new Error(`${label} 原生模块架构错误（${found}）：${path}`)
  }
  const asar = join(appDir, 'resources/app.asar')
  verifyPackageResources(listPackage(asar))
  if (JSON.parse(extractFile(asar, 'package.json').toString()).version !== version)
    throw new Error(`${label} 应用版本与发行版本不一致`)
}

const temp = await mkdtemp(join(tmpdir(), 'marchen-linux-'))
try {
  // 更新元数据与 AppImage 本体一致，客户端才能通过 sha512 校验。
  const appImagePath = join(root, names.appImage)
  const appImageData = await readFile(appImagePath)
  verifyLinuxMetadata(parse(await readFile(join(root, linuxMetadataName(channel, arch)), 'utf8')), {
    version,
    appImage: {
      name: names.appImage,
      sha512: createHash('sha512').update(appImageData).digest('base64'),
      size: appImageData.length,
    },
  })
  if (elfArch(appImageData) !== arch) throw new Error(`AppImage 运行时架构不是 ${arch}`)

  // AppImage 自解包需要在目标架构上执行，CI 在对应原生 runner 中运行本脚本。
  const appImageDir = join(temp, 'appimage')
  execFileSync('mkdir', ['-p', appImageDir])
  await chmod(appImagePath, 0o755)
  execFileSync(appImagePath, ['--appimage-extract'], { cwd: appImageDir, stdio: 'pipe' })
  const squashfs = join(appImageDir, 'squashfs-root')
  await verifyAppDir(squashfs, 'AppImage')
  verifyDesktopEntry(
    parseDesktopEntry(await readFile(join(squashfs, `${EXECUTABLE}.desktop`), 'utf8')),
    { executable: EXECUTABLE, format: 'appimage' },
  )

  // deb 控制字段决定 apt 能否安装到正确架构，并与应用内版本对应。
  const debPath = join(root, names.deb)
  const control = execFileSync('dpkg-deb', ['-f', debPath, 'Package', 'Architecture', 'Version'], {
    encoding: 'utf8',
  })
  const fields = Object.fromEntries(
    control
      .trim()
      .split('\n')
      .map((line) => line.split(': ')),
  )
  if (
    fields.Package !== EXECUTABLE ||
    fields.Architecture !== debArchitecture(arch) ||
    fields.Version !== debVersion(version)
  )
    throw new Error(`deb 控制字段不符：${JSON.stringify(fields)}`)
  const debDir = join(temp, 'deb')
  execFileSync('dpkg-deb', ['-x', debPath, debDir])
  await verifyAppDir(join(debDir, 'opt/Marchen'), 'deb')
  verifyDesktopEntry(
    parseDesktopEntry(
      await readFile(join(debDir, `usr/share/applications/${EXECUTABLE}.desktop`), 'utf8'),
    ),
    { executable: EXECUTABLE, format: 'deb' },
  )
  await readFile(join(debDir, 'opt/Marchen/resources/apparmor-profile'))
  console.log(`最终 Linux ${arch} AppImage / deb 的架构、元数据、桌面入口与媒体资源检查通过`)
} finally {
  await rm(temp, { recursive: true, force: true })
}
