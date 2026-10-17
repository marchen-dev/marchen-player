/** 桌面端与发行脚本共用；未知格式不默认归入稳定渠道。 */
export type UpdateChannel = 'stable' | 'beta' | 'alpha'
export const UPDATE_CHANNELS: readonly UpdateChannel[] = ['stable', 'beta', 'alpha']
export const RELEASE_REPOSITORY = 'marchen-dev/marchen-player'
export const UPDATE_FEED_ROOT = `https://raw.githubusercontent.com/${RELEASE_REPOSITORY}/update-feeds`
const rank: Record<UpdateChannel, number> = { alpha: 0, beta: 1, stable: 2 }

export function parseReleaseVersion(version: string) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta)\.(0|[1-9]\d*))?$/.exec(
    version,
  )
  if (!match || match[0] !== version) throw new Error(`不支持的发行版本：${version}`)
  const numbers = [match[1], match[2], match[3], match[5] ?? '0'].map(Number)
  if (!numbers.every(Number.isSafeInteger)) throw new Error('版本数字超出安全范围')
  return {
    version,
    channel: (match[4] ?? 'stable') as UpdateChannel,
    numbers,
  }
}
export function compareReleaseVersions(a: string, b: string): number {
  const left = parseReleaseVersion(a)
  const right = parseReleaseVersion(b)
  const l = [...left.numbers.slice(0, 3), rank[left.channel], left.numbers[3]]
  const r = [...right.numbers.slice(0, 3), rank[right.channel], right.numbers[3]]
  for (let i = 0; i < l.length; i++) {
    if (l[i] !== r[i]) return l[i] > r[i] ? 1 : -1
  }
  return 0
}
export function acceptsChannel(installed: UpdateChannel, candidate: UpdateChannel) {
  return rank[candidate] >= rank[installed]
}
export function canUpdateTo(installed: string, candidate: string): boolean {
  return (
    acceptsChannel(
      parseReleaseVersion(installed).channel,
      parseReleaseVersion(candidate).channel,
    ) && compareReleaseVersions(candidate, installed) > 0
  )
}
export function windowsMetadataName(channel: UpdateChannel) {
  return `${channel === 'stable' ? 'latest' : channel}.yml`
}
/** Linux 只发行这两个架构；arm64 为实验性支持 */
export type LinuxUpdateArch = 'x64' | 'arm64'
export const LINUX_UPDATE_ARCHES: readonly LinuxUpdateArch[] = ['x64', 'arm64']
/**
 * electron-updater 在 Linux 上读取 `<channel>-linux[-<arch>].yml`，x64 不带架构后缀；
 * 架构由文件名天然隔离，同一渠道目录可以同时存放两个架构的元数据。
 */
export function linuxMetadataName(channel: UpdateChannel, arch: LinuxUpdateArch) {
  return `${channel === 'stable' ? 'latest' : channel}-linux${arch === 'x64' ? '' : `-${arch}`}.yml`
}
/**
 * electron-builder 按目标格式改写 `${arch}`：AppImage 的 x64 为 x86_64，deb 为 amd64；
 * AppImage 的 blockmap 内嵌在文件中，不单独发布。
 */
export function linuxArtifactNames(version: string, arch: LinuxUpdateArch) {
  return {
    appImage: `Marchen-${version}-${arch === 'x64' ? 'x86_64' : arch}.AppImage`,
    deb: `Marchen-${version}-${arch === 'x64' ? 'amd64' : arch}.deb`,
  }
}
export function updateFeedURL(platform: 'mac' | 'windows' | 'linux', channel: UpdateChannel) {
  if (platform === 'mac') return `${UPDATE_FEED_ROOT}/mac/${channel}.xml`
  return `${UPDATE_FEED_ROOT}/${platform}/${channel}/`
}

/** 显示版本保持 SemVer，Mac 内部构建号使用 Sparkle/系统可比较的 a/b 后缀。 */
export function sparkleBuildVersion(version: string): string {
  const { channel, numbers } = parseReleaseVersion(version)
  const base = numbers.slice(0, 3).join('.')
  if (channel === 'stable') return base
  if (numbers[3] > 254) throw new Error('macOS 预发布序号最多为 254，请推进目标版本')
  return `${base}${channel === 'alpha' ? 'a' : 'b'}${numbers[3] + 1}`
}
export function releaseVersionFromSparkle(build: string): string {
  const match = /^(\d+\.\d+\.\d+)([ab])([1-9]\d*)$/.exec(build)
  const version = match
    ? `${match[1]}-${match[2] === 'a' ? 'alpha' : 'beta'}.${Number(match[3]) - 1}`
    : build
  if (sparkleBuildVersion(version) !== build) throw new Error('无效的 Mac 构建版本')
  return version
}
