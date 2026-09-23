import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { verifyAssets } from './verify-assets.mjs'
let root
const signature = Buffer.alloc(64, 1).toString('base64')
const feed = `<rss><channel><item><sparkle:version>1.2.3</sparkle:version><sparkle:shortVersionString>1.2.3</sparkle:shortVersionString><enclosure url="https://github.com/marchen-dev/marchen-player/releases/download/v1.2.3/Marchen-1.2.3-arm64.zip" length="3" sparkle:edSignature="${signature}" /></item></channel></rss>`
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'marchen-assets-'))
  for (const name of [
    'Marchen-1.2.3-arm64.zip',
    'Marchen-1.2.3-arm64.dmg',
    'Marchen-1.2.3.exe',
    'Marchen-1.2.3.exe.blockmap',
  ])
    await writeFile(join(root, name), 'abc')
  await writeFile(
    join(root, 'latest.yml'),
    `version: 1.2.3\nfiles:\n  - url: Marchen-1.2.3.exe\n    sha512: ${createHash('sha512').update('abc').digest('base64')}\n`,
  )
  await writeFile(join(root, 'appcast-macos-arm64.xml'), feed)
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})
it('接受匹配版本完整产物', async () => {
  await verifyAssets(root, '1.2.3')
})
it('拒绝空 feed', async () => {
  await writeFile(join(root, 'appcast-macos-arm64.xml'), '<rss><channel /></rss>')
  await expect(verifyAssets(root, '1.2.3')).rejects.toThrow('只包含本次版本')
})
it('拒绝其他仓库的包地址', async () => {
  await writeFile(
    join(root, 'appcast-macos-arm64.xml'),
    feed.replace('marchen-dev/marchen-player', 'other/repository'),
  )
  await expect(verifyAssets(root, '1.2.3')).rejects.toThrow('不可信')
})
it('拒绝损坏的 Windows 安装包', async () => {
  await writeFile(join(root, 'Marchen-1.2.3.exe'), 'changed')
  await expect(verifyAssets(root, '1.2.3')).rejects.toThrow('校验值不符')
})
it('拒绝旧 Mac 元数据，避免 Intel 路由到 ARM64', async () => {
  await writeFile(join(root, 'latest-mac.yml'), 'old')
  await expect(verifyAssets(root, '1.2.3')).rejects.toThrow('停止支持')
})
