import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseStringPromise } from 'xml2js'
import { parse } from 'yaml'

import {
  parseReleaseVersion,
  sparkleBuildVersion,
  windowsMetadataName,
} from '../../packages/shared/src/update-policy.ts'

export async function verifyAssets(root, version) {
  const { channel } = parseReleaseVersion(version)
  const windowsMetadata = windowsMetadataName(channel)
  const files = await readdir(root)
  for (const name of [
    `Marchen-${version}-arm64.zip`,
    `Marchen-${version}-arm64.dmg`,
    windowsMetadata,
    'appcast-macos-arm64.xml',
  ]) {
    if (!files.includes(name)) throw new Error(`缺少发行产物 ${name}`)
  }
  if (files.some((name) => /AppImage|latest-mac\.yml|linux|arm64-mac\.zip/.test(name)))
    throw new Error('包含已停止支持的平台元数据或产物')
  const windows = parse(await readFile(join(root, windowsMetadata), 'utf8'))
  if (windows.version !== version || !windows.files?.length)
    throw new Error('Windows 更新版本或元数据无效')
  let installer = false
  for (const item of windows.files) {
    const name = decodeURIComponent(
      basename(new URL(item.url, 'https://release.invalid/').pathname),
    )
    const data = await readFile(join(root, name))
    if (createHash('sha512').update(data).digest('base64') !== item.sha512)
      throw new Error('Windows 更新校验值不符')
    if (name.endsWith('.exe')) {
      installer = true
      if (!files.includes(`${name}.blockmap`)) throw new Error('Windows 缺少 blockmap')
    }
  }
  if (!installer) throw new Error('Windows 缺少安装包')
  const feed = await parseStringPromise(
    await readFile(join(root, 'appcast-macos-arm64.xml'), 'utf8'),
  )
  const items = feed.rss?.channel?.[0]?.item
  if (items?.length !== 1) throw new Error('正式 feed 必须只包含本次版本')
  for (const item of items) {
    if (
      item['sparkle:version']?.[0] !== sparkleBuildVersion(version) ||
      item['sparkle:shortVersionString']?.[0] !== version ||
      item.enclosure?.length !== 1
    )
      throw new Error('Mac 更新版本或全量入口无效')
    const enclosures = [...item.enclosure, ...(item['sparkle:deltas']?.[0]?.enclosure ?? [])]
    for (const [index, enclosure] of enclosures.entries()) {
      const metadata = enclosure.$
      const url = new URL(metadata.url)
      const prefix = `/marchen-dev/marchen-player/releases/download/v${version}/`
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'github.com' ||
        !url.pathname.startsWith(prefix)
      )
        throw new Error('正式更新包地址不可信')
      const name = decodeURIComponent(basename(url.pathname))
      if (index === 0 && name !== `Marchen-${version}-arm64.zip`)
        throw new Error('Mac 全量包架构或版本错误')
      if (index > 0 && (!name.endsWith('.delta') || !metadata['sparkle:deltaFrom']))
        throw new Error('差分基线无效')
      if (
        Buffer.from(metadata['sparkle:edSignature'] || '', 'base64').length !== 64 ||
        (await readFile(join(root, name))).length !== Number(metadata.length)
      )
        throw new Error('Mac 更新签名格式或文件长度不符')
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await verifyAssets(
    resolve(process.argv[2] || 'dist'),
    JSON.parse(await readFile('package.json', 'utf8')).version,
  )
  console.log('发行版本、架构、元数据引用和 Windows 校验值通过')
}
