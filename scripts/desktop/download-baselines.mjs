import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  compareReleaseVersions,
  parseReleaseVersion,
  RELEASE_REPOSITORY,
} from '../../packages/shared/src/update-policy.ts'
import { eligibleReleases } from './channel-feeds.mjs'

const current = JSON.parse(await readFile('package.json', 'utf8')).version
const destination = resolve(process.env.MARCHEN_DELTA_BASE_DIR || '.tmp/delta-base')
await mkdir(destination, { recursive: true })
const releases = []
for (let page = 1; ; page++) {
  const response = await fetch(
    `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases?per_page=100&page=${page}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(30000),
    },
  )
  if (!response.ok) throw new Error(`读取差分基线失败：${response.status}`)
  const data = await response.json()
  releases.push(...data)
  if (data.length < 100) break
}
const selected = eligibleReleases(releases)
  .filter(
    (release) =>
      compareReleaseVersions(release.tag_name.slice(1), current) < 0 &&
      parseReleaseVersion(release.tag_name.slice(1)).channel ===
        parseReleaseVersion(current).channel,
  )
  .map((release) =>
    release.assets.find(
      (asset) =>
        asset.name === `Marchen-${release.tag_name.slice(1)}-arm64.zip` &&
        asset.state === 'uploaded',
    ),
  )
  .filter(Boolean)
  .slice(0, 2)
for (const asset of selected) {
  if (
    !asset.browser_download_url.startsWith(
      `https://github.com/${RELEASE_REPOSITORY}/releases/download/`,
    )
  )
    throw new Error('基线下载域名错误')
  const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(180000) })
  if (!response.ok || !response.body) throw new Error(`基线下载失败：${asset.name}`)
  const target = join(destination, asset.name)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(`${target}.part`))
  if ((await stat(`${target}.part`)).size !== asset.size) throw new Error('基线文件长度不符')
  await rename(`${target}.part`, target)
}
console.log(`已准备 ${selected.length} 个 ARM64 差分基线；无基线时使用全量更新`)
