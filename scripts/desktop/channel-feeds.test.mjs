import { expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import {
  linuxArtifactNames,
  macArtifactNames,
  releaseArtifactNaming,
  sparkleBuildVersion,
  windowsSetupName,
} from '../../packages/shared/src/update-policy.ts'
import { assertChannelAdvance, buildChannelFeeds, selectChannelReleases } from './channel-feeds.mjs'

/** naming 为 legacy 时模拟 1.0.7 及更早、文件名不带系统名的历史发行 */
function fixture(version, { naming = 'platform', ...extra } = {}) {
  const channel = version.includes('alpha') ? 'alpha' : version.includes('beta') ? 'beta' : 'latest'
  const prefix = `https://github.com/marchen-dev/marchen-player/releases/download/v${version}/`
  const exe = naming === 'platform' ? windowsSetupName(version) : `Marchen-${version}-setup.exe`
  const { zip, dmg } = macArtifactNames(version, naming)
  const windows = stringify({
    version,
    path: exe,
    sha512: Buffer.alloc(64, 1).toString('base64'),
    files: [{ url: exe, size: 3, sha512: Buffer.alloc(64, 1).toString('base64') }],
  })
  const xml = `<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" version="2.0"><channel><title>Marchen</title><item><sparkle:version>${sparkleBuildVersion(version)}</sparkle:version><sparkle:shortVersionString>${version}</sparkle:shortVersionString><enclosure url="${prefix}${zip}" length="3" sparkle:edSignature="${Buffer.alloc(64, 1).toString('base64')}" /></item></channel></rss>`
  const contents = { [`${channel}.yml`]: windows, 'appcast-macos-arm64.xml': xml }
  return {
    tag_name: `v${version}`,
    draft: false,
    prerelease: channel !== 'latest',
    assets: [
      exe,
      `${exe}.blockmap`,
      zip,
      dmg,
      `${channel}.yml`,
      'appcast-macos-arm64.xml',
    ].map((name) => ({
      name,
      state: 'uploaded',
      size: contents[name] ? Buffer.byteLength(contents[name]) : 3,
      browser_download_url: prefix + name,
      text: contents[name],
    })),
    ...extra,
  }
}
const read = async (asset) => asset.text

/** 给发行补上 Linux 产物；channelFile 与 electron-builder 生成的文件名一致 */
function withLinux(release, arches = ['x64', 'arm64']) {
  const version = release.tag_name.slice(1)
  const channel = version.includes('alpha') ? 'alpha' : version.includes('beta') ? 'beta' : 'latest'
  const prefix = `https://github.com/marchen-dev/marchen-player/releases/download/v${version}/`
  const naming = releaseArtifactNaming(
    version,
    release.assets.map((asset) => asset.name),
  )
  for (const arch of arches) {
    const { appImage, deb } = linuxArtifactNames(version, arch, naming)
    const text = stringify({
      version,
      path: appImage,
      sha512: Buffer.alloc(64, 2).toString('base64'),
      files: [{ url: appImage, size: 3, sha512: Buffer.alloc(64, 2).toString('base64') }],
    })
    const metadata = `${channel}-linux${arch === 'x64' ? '' : `-${arch}`}.yml`
    for (const name of [appImage, deb, metadata])
      release.assets.push({
        name,
        state: 'uploaded',
        size: name === metadata ? Buffer.byteLength(text) : 3,
        browser_download_url: prefix + name,
        text: name === metadata ? text : undefined,
      })
  }
  return release
}
it('只发布 Alpha 时稳定和 Beta 没有虚假更新', async () => {
  const files = await buildChannelFeeds([fixture('1.0.0-alpha.0')], read)
  expect(JSON.parse(files['channels.json'])).toEqual({
    stable: null,
    beta: null,
    alpha: '1.0.0-alpha.0',
  })
  expect(files['windows/stable/latest.yml']).toBeUndefined()
  expect(files['mac/stable.xml']).not.toContain('<item>')
})
it('alpha 到 Beta 到正式版晋升，输出文件名按客户端渠道', async () => {
  for (const version of ['1.0.0-beta.0', '1.0.0']) {
    const files = await buildChannelFeeds([fixture('1.0.0-alpha.0'), fixture(version)], read)
    expect(parse(files['windows/alpha/alpha.yml']).version).toBe(version)
    expect(parse(files['windows/beta/beta.yml']).version).toBe(version)
    expect(files['mac/alpha.xml']).toContain(
      `<sparkle:version>${sparkleBuildVersion(version)}</sparkle:version>`,
    )
    expect(parse(files['windows/alpha/alpha.yml']).files[0].url).toMatch(/^https:\/\/github.com\//)
    if (version === '1.0.0') expect(parse(files['windows/stable/latest.yml']).version).toBe(version)
  }
})
it('旧版本晚发布不会覆盖更高版本，Beta 不收新 Alpha', () => {
  const chosen = selectChannelReleases([
    fixture('1.0.1'),
    fixture('1.1.0-alpha.0'),
    fixture('1.1.0-beta.0'),
    fixture('1.2.0-alpha.0'),
  ])
  expect(chosen.stable.tag_name).toBe('v1.0.1')
  expect(chosen.beta.tag_name).toBe('v1.1.0-beta.0')
  expect(chosen.alpha.tag_name).toBe('v1.2.0-alpha.0')
})
it('draft 与未知版本不可见，正式渠道标记错误直接拒绝', () => {
  const chosen = selectChannelReleases([
    fixture('1.0.0'),
    fixture('2.0.0', { draft: true }),
    fixture('3.0.0', { tag_name: 'v3.0.0-rc.0', prerelease: true }),
  ])
  expect(chosen.alpha.tag_name).toBe('v1.0.0')
  expect(() => selectChannelReleases([fixture('1.1.0-beta.0', { prerelease: false })])).toThrow(
    '渠道标记',
  )
})
it('缺失任一平台资产不产生部分可发布结果', async () => {
  const broken = fixture('1.1.0-beta.0')
  broken.assets = broken.assets.filter((asset) => !asset.name.endsWith('.exe.blockmap'))
  await expect(
    buildChannelFeeds([fixture('1.0.0'), broken, fixture('1.2.0-alpha.0')], read),
  ).rejects.toThrow('资产缺失')
})
it('损坏、跨仓库或跨版本引用的元数据拒绝进入源', async () => {
  const broken = fixture('1.0.0-alpha.0')
  const yml = broken.assets.find((asset) => asset.name === 'alpha.yml')
  yml.text = yml.text.replace('size: 3', 'size: 5')
  await expect(buildChannelFeeds([broken], read)).rejects.toThrow('长度')
  yml.text = fixture('1.0.0-alpha.0')
    .assets.find((asset) => asset.name === 'alpha.yml')
    .text.replace('url: Marchen', 'url: https://example.com/Marchen')
  await expect(buildChannelFeeds([broken], read)).rejects.toThrow('其他版本或来源')
})
it('相同发行清单重复合成完全一致', async () => {
  const releases = [fixture('1.0.0'), fixture('1.1.0-beta.2')]
  expect(await buildChannelFeeds(releases, read)).toEqual(
    await buildChannelFeeds(releases.slice().reverse(), read),
  )
})

it('历史版本没有 Linux 元数据时只留空 Linux 源，mac / win 输出不变', async () => {
  const history = [fixture('1.0.0'), fixture('1.1.0-alpha.0')]
  const before = await buildChannelFeeds(history, read)
  const after = await buildChannelFeeds(
    [fixture('1.0.0'), withLinux(fixture('1.1.0-alpha.0'))],
    read,
  )
  // 没有 Linux 的渠道（稳定）不出现任何 Linux 文件，客户端按 404 视为已是最新。
  expect(Object.keys(after).filter((name) => name.startsWith('linux/stable/'))).toEqual([])
  expect(parse(after['linux/alpha/alpha-linux.yml'])).toMatchObject({
    version: '1.1.0-alpha.0',
    path: expect.stringMatching(/\/v1\.1\.0-alpha\.0\/Marchen-1\.1\.0-alpha\.0-linux-x86_64\.AppImage$/),
  })
  expect(parse(after['linux/alpha/alpha-linux-arm64.yml']).files[0].url).toMatch(
    /Marchen-1\.1\.0-alpha\.0-linux-arm64\.AppImage$/,
  )
  for (const [name, text] of Object.entries(before)) expect(after[name]).toBe(text)
  expect(after['channels.json']).toBe(before['channels.json'])
})
it('稳定版 Linux 元数据使用 latest 前缀，可只发布单一架构', async () => {
  const files = await buildChannelFeeds([withLinux(fixture('1.2.0'), ['x64'])], read)
  expect(files['linux/stable/latest-linux.yml']).toBeDefined()
  expect(files['linux/stable/latest-linux-arm64.yml']).toBeUndefined()
  // Alpha 客户端读取 alpha-linux.yml；正式版晋升后按客户端渠道命名，同 Windows。
  expect(parse(files['linux/alpha/alpha-linux.yml']).version).toBe('1.2.0')
  expect(files['linux/alpha/latest-linux.yml']).toBeUndefined()
})
it('linux 元数据存在但残缺时拒绝发布', async () => {
  const missingAppImage = withLinux(fixture('1.1.0-alpha.0'))
  missingAppImage.assets = missingAppImage.assets.filter(
    (asset) => asset.name !== 'Marchen-1.1.0-alpha.0-linux-arm64.AppImage',
  )
  await expect(buildChannelFeeds([missingAppImage], read)).rejects.toThrow('资产缺失')
  const wrongVersion = withLinux(fixture('1.1.0-alpha.0'))
  const yml = wrongVersion.assets.find((asset) => asset.name === 'alpha-linux.yml')
  yml.text = yml.text.replace('version: 1.1.0-alpha.0', 'version: 1.0.0')
  await expect(buildChannelFeeds([wrongVersion], read)).rejects.toThrow('Linux x64 元数据')
  const badSha = withLinux(fixture('1.1.0-alpha.0'))
  const arm = badSha.assets.find((asset) => asset.name === 'alpha-linux-arm64.yml')
  arm.text = arm.text.replaceAll(Buffer.alloc(64, 2).toString('base64'), 'AAAA')
  await expect(buildChannelFeeds([badSha], read)).rejects.toThrow('Linux arm64 长度或校验值')
})

it('已有渠道源只允许前进或保持，失败重跑不会降级', () => {
  expect(() => assertChannelAdvance({ alpha: '1.1.0-beta.0' }, { alpha: '1.0.1' })).toThrow('回退')
  expect(() => assertChannelAdvance({ alpha: '1.1.0-beta.0' }, { alpha: null })).toThrow('回退')
  expect(() =>
    assertChannelAdvance({ alpha: '1.1.0-beta.0' }, { alpha: '1.1.0-beta.0' }),
  ).not.toThrow()
  expect(() => assertChannelAdvance({ alpha: '1.1.0-beta.0' }, { alpha: '1.1.0' })).not.toThrow()
})

it('改名前的历史发行与新命名发行可同时作为渠道源', async () => {
  const files = await buildChannelFeeds(
    [withLinux(fixture('1.0.7', { naming: 'legacy' })), withLinux(fixture('1.0.8-alpha.0'))],
    read,
  )
  expect(JSON.parse(files['channels.json'])).toEqual({
    stable: '1.0.7',
    beta: '1.0.7',
    alpha: '1.0.8-alpha.0',
  })
  expect(parse(files['linux/stable/latest-linux.yml']).path).toMatch(
    /\/v1\.0\.7\/Marchen-1\.0\.7-x86_64\.AppImage$/,
  )
  expect(files['mac/stable.xml']).toContain('/v1.0.7/Marchen-1.0.7-arm64.zip')
  expect(parse(files['linux/alpha/alpha-linux.yml']).path).toMatch(
    /\/v1\.0\.8-alpha\.0\/Marchen-1\.0\.8-alpha\.0-linux-x86_64\.AppImage$/,
  )
  expect(files['mac/alpha.xml']).toContain('/v1.0.8-alpha.0/Marchen-1.0.8-alpha.0-macos-arm64.zip')
  expect(parse(files['windows/alpha/alpha.yml']).path).toMatch(
    /Marchen-1\.0\.8-alpha\.0-windows-x64-setup\.exe$/,
  )
})
