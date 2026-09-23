import { expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { sparkleBuildVersion } from '../../packages/shared/src/update-policy.ts'
import { assertChannelAdvance, buildChannelFeeds, selectChannelReleases } from './channel-feeds.mjs'

function fixture(version, extra = {}) {
  const channel = version.includes('alpha') ? 'alpha' : version.includes('beta') ? 'beta' : 'latest'
  const prefix = `https://github.com/marchen-dev/marchen-player/releases/download/v${version}/`
  const exe = `Marchen-${version}-setup.exe`
  const zip = `Marchen-${version}-arm64.zip`
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
      `Marchen-${version}-arm64.dmg`,
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

it('已有渠道源只允许前进或保持，失败重跑不会降级', () => {
  expect(() => assertChannelAdvance({ alpha: '1.1.0-beta.0' }, { alpha: '1.0.1' })).toThrow('回退')
  expect(() => assertChannelAdvance({ alpha: '1.1.0-beta.0' }, { alpha: null })).toThrow('回退')
  expect(() =>
    assertChannelAdvance({ alpha: '1.1.0-beta.0' }, { alpha: '1.1.0-beta.0' }),
  ).not.toThrow()
  expect(() => assertChannelAdvance({ alpha: '1.1.0-beta.0' }, { alpha: '1.1.0' })).not.toThrow()
})
