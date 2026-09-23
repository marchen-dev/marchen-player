import { basename } from 'node:path'
import { Builder, parseStringPromise } from 'xml2js'
import { parse, stringify } from 'yaml'
import {
  acceptsChannel,
  compareReleaseVersions,
  parseReleaseVersion,
  RELEASE_REPOSITORY,
  releaseVersionFromSparkle,
  sparkleBuildVersion,
  UPDATE_CHANNELS,
  windowsMetadataName,
} from '../../packages/shared/src/update-policy.ts'

export const FIRST_CHANNEL_VERSION = '1.0.0-alpha.0'

/** 发行顺序不等于版本顺序；旧发行不参与新的 Sparkle 渠道。 */
export function eligibleReleases(releases) {
  return releases
    .filter((release) => {
      if (release.draft) return false
      const version = release.tag_name?.replace(/^v/, '')
      try {
        const parsed = parseReleaseVersion(version)
        if (
          release.tag_name !== `v${version}` ||
          compareReleaseVersions(version, FIRST_CHANNEL_VERSION) < 0
        )
          return false
        if (release.prerelease !== (parsed.channel !== 'stable')) throw new Error('渠道标记不一致')
      } catch (error) {
        if (error.message === '渠道标记不一致') throw error
        return false
      }
      return true
    })
    .sort((a, b) => compareReleaseVersions(b.tag_name.slice(1), a.tag_name.slice(1)))
}

export function selectChannelReleases(releases) {
  const sorted = eligibleReleases(releases)
  return Object.fromEntries(
    UPDATE_CHANNELS.map((channel) => [
      channel,
      sorted.find((release) =>
        acceptsChannel(channel, parseReleaseVersion(release.tag_name.slice(1)).channel),
      ) ?? null,
    ]),
  )
}

export async function normalizeRelease(release, readAsset) {
  const version = release.tag_name.slice(1)
  const { channel } = parseReleaseVersion(version)
  const assets = new Map(release.assets.map((asset) => [asset.name, asset]))
  const prefix = `https://github.com/${RELEASE_REPOSITORY}/releases/download/${release.tag_name}/`
  const requireAsset = (name) => {
    const asset = assets.get(name)
    if (
      !asset ||
      asset.state !== 'uploaded' ||
      asset.size <= 0 ||
      asset.browser_download_url !== prefix + encodeURIComponent(name)
    )
      throw new Error(`发行资产缺失或地址错误：${release.tag_name}/${name}`)
    return asset
  }
  const windowsAsset = requireAsset(windowsMetadataName(channel))
  const macAsset = requireAsset('appcast-macos-arm64.xml')
  requireAsset(`Marchen-${version}-arm64.dmg`)
  const windows = parse(await readAsset(windowsAsset))
  if (windows.version !== version || !windows.files?.length)
    throw new Error('Windows 元数据版本或文件为空')
  const resolveAsset = (value) => {
    const url = new URL(value, prefix)
    const name = decodeURIComponent(basename(url.pathname))
    const asset = requireAsset(name)
    if (url.href !== asset.browser_download_url) throw new Error('更新元数据引用了其他版本或来源')
    return asset
  }
  let installer = false
  windows.files = windows.files.map((file) => {
    const asset = resolveAsset(file.url)
    if (
      Buffer.from(file.sha512 ?? '', 'base64').length !== 64 ||
      (file.size !== undefined && file.size !== asset.size)
    )
      throw new Error('Windows 长度或校验值格式错误')
    if (asset.name.endsWith('.exe')) {
      installer = true
      requireAsset(`${asset.name}.blockmap`)
    }
    return { ...file, size: asset.size, url: asset.browser_download_url }
  })
  if (!installer) throw new Error('缺少 Windows 安装包')
  // legacy path 同样改成不可变版本 URL，generic provider 可直接解析。
  if (windows.path) windows.path = resolveAsset(windows.path).browser_download_url
  const mac = await parseStringPromise(await readAsset(macAsset))
  const items = mac.rss?.channel?.[0]?.item
  if (
    items?.length !== 1 ||
    items[0]['sparkle:version']?.[0] !== sparkleBuildVersion(version) ||
    items[0]['sparkle:shortVersionString']?.[0] !== version ||
    items[0].enclosure?.length !== 1
  )
    throw new Error('Mac 元数据版本或全量入口错误')
  const item = items[0]
  const enclosures = [...item.enclosure, ...(item['sparkle:deltas']?.[0]?.enclosure ?? [])]
  for (const [index, enclosure] of enclosures.entries()) {
    const meta = enclosure.$
    const asset = resolveAsset(meta.url)
    if (
      Number(meta.length) !== asset.size ||
      Buffer.from(meta['sparkle:edSignature'] ?? '', 'base64').length !== 64
    )
      throw new Error('Mac 长度或签名格式错误')
    if (index === 0 && asset.name !== `Marchen-${version}-arm64.zip`)
      throw new Error('Mac 全量包不匹配')
    if (
      index > 0 &&
      (!asset.name.endsWith('.delta') ||
        !meta['sparkle:deltaFrom'] ||
        compareReleaseVersions(releaseVersionFromSparkle(meta['sparkle:deltaFrom']), version) >= 0)
    )
      throw new Error('Mac 差分基线错误')
  }
  return { version, windows, mac: new Builder().buildObject(mac) }
}

export async function buildChannelFeeds(releases, readAsset) {
  const selected = selectChannelReleases(releases)
  const normalized = new Map()
  const files = {}
  const index = {}
  for (const channel of UPDATE_CHANNELS) {
    const release = selected[channel]
    if (!release) {
      files[`mac/${channel}.xml`] = new Builder().buildObject({
        rss: {
          $: {
            version: '2.0',
            'xmlns:sparkle': 'http://www.andymatuschak.org/xml-namespaces/sparkle',
          },
          channel: { title: 'Marchen', item: [] },
        },
      })
      index[channel] = null
      continue
    }
    if (!normalized.has(release.tag_name))
      normalized.set(release.tag_name, await normalizeRelease(release, readAsset))
    const data = normalized.get(release.tag_name)
    index[channel] = data.version
    files[`mac/${channel}.xml`] = data.mac
    files[`windows/${channel}/${windowsMetadataName(channel)}`] = stringify(data.windows)
  }
  files['channels.json'] = `${JSON.stringify(index, null, 2)}\n`
  return files
}

/** 防止撤回/删除版本或异常列表把既有渠道静默回退；回滚需明确的人工操作。 */
export function assertChannelAdvance(previous, next) {
  for (const channel of UPDATE_CHANNELS) {
    if (
      previous[channel] &&
      (!next[channel] || compareReleaseVersions(next[channel], previous[channel]) < 0)
    )
      throw new Error(`拒绝回退 ${channel} 源；撤回版本需单独处理`)
  }
}
