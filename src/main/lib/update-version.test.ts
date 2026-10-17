import {
  canUpdateTo,
  compareReleaseVersions,
  linuxArtifactNames,
  linuxMetadataName,
  macArtifactNames,
  parseReleaseVersion,
  releaseArtifactNaming,
  releaseVersionFromSparkle,
  sparkleBuildVersion,
  updateFeedURL,
  windowsSetupName,
} from '@marchen/shared/update-policy'
import { expect, it } from 'vitest'
import { isVersionUpgrade } from './update-version'

it('实际升级包含预发布，未知格式与降级不误报', () => {
  expect(isVersionUpgrade('0.1.9', '0.1.10')).toBe(true)
  expect(isVersionUpgrade('1.0.0-alpha.0', '1.0.0-alpha.1')).toBe(true)
  expect(isVersionUpgrade('1.0.0-beta.9', '1.0.0')).toBe(true)
  expect(isVersionUpgrade('1.0.0', '1.0.0')).toBe(false)
  expect(isVersionUpgrade('1.1.0', '1.0.9')).toBe(false)
  expect(isVersionUpgrade('invalid', '1.0.0')).toBe(false)
})
it('版本严格命名，数字序号不按字典序比较', () => {
  for (const bad of [
    'v1.0.0',
    '1.0.0-alpha',
    '1.0.0-alpha.01',
    '1.0.0-rc.0',
    '1.0.0+build',
    '01.0.0',
    '1.0.0-beta.-1',
  ])
    expect(() => parseReleaseVersion(bad)).toThrow()
  const sequence = [
    '1.0.0-alpha.0',
    '1.0.0-alpha.2',
    '1.0.0-alpha.10',
    '1.0.0-beta.0',
    '1.0.0-beta.10',
    '1.0.0',
    '1.0.1-alpha.0',
    '1.0.1',
  ]
  for (let i = 1; i < sequence.length; i++)
    expect(compareReleaseVersions(sequence[i], sequence[i - 1])).toBe(1)
})
it.each([
  ['1.0.0', '1.1.0-alpha.0', false],
  ['1.0.0', '1.1.0-beta.0', false],
  ['1.0.0', '1.1.0', true],
  ['1.0.0-beta.0', '1.1.0-alpha.0', false],
  ['1.0.0-beta.0', '1.0.0-beta.1', true],
  ['1.0.0-beta.0', '1.0.0', true],
  ['1.0.0-alpha.0', '1.0.0-alpha.1', true],
  ['1.0.0-alpha.0', '1.0.0-beta.0', true],
  ['1.0.0-alpha.0', '1.0.0', true],
  ['1.1.0-beta.0', '1.0.1', false],
  ['1.0.0-alpha.0', '1.0.0-alpha.0', false],
])('安装 %s 对候选 %s 的更新规则', (installed, candidate, allowed) => {
  expect(canUpdateTo(installed, candidate)).toBe(allowed)
})
it('渠道从当前安装版本推导，晋升后收敛', () => {
  expect(updateFeedURL('mac', parseReleaseVersion('1.0.0-beta.0').channel)).toMatch(
    /\/mac\/beta.xml$/,
  )
  expect(updateFeedURL('windows', parseReleaseVersion('1.0.0').channel)).toMatch(
    /\/windows\/stable\/$/,
  )
  expect(updateFeedURL('linux', parseReleaseVersion('1.0.0-alpha.1').channel)).toMatch(
    /\/linux\/alpha\/$/,
  )
})

it('linux 元数据文件名与 electron-updater 的渠道与架构规则一致', () => {
  expect(linuxMetadataName('stable', 'x64')).toBe('latest-linux.yml')
  expect(linuxMetadataName('stable', 'arm64')).toBe('latest-linux-arm64.yml')
  expect(linuxMetadataName('beta', 'x64')).toBe('beta-linux.yml')
  expect(linuxMetadataName('alpha', 'arm64')).toBe('alpha-linux-arm64.yml')
})

it('安装包文件名带系统名，历史发行按 dmg 识别旧命名', () => {
  expect(macArtifactNames('1.0.8')).toEqual({
    zip: 'Marchen-1.0.8-macos-arm64.zip',
    dmg: 'Marchen-1.0.8-macos-arm64.dmg',
  })
  expect(windowsSetupName('1.0.8')).toBe('Marchen-1.0.8-windows-x64-setup.exe')
  expect(linuxArtifactNames('1.0.8', 'x64')).toEqual({
    appImage: 'Marchen-1.0.8-linux-x86_64.AppImage',
    deb: 'Marchen-1.0.8-linux-amd64.deb',
  })
  expect(linuxArtifactNames('1.0.7', 'arm64', 'legacy')).toEqual({
    appImage: 'Marchen-1.0.7-arm64.AppImage',
    deb: 'Marchen-1.0.7-arm64.deb',
  })
  expect(macArtifactNames('1.0.7', 'legacy').zip).toBe('Marchen-1.0.7-arm64.zip')
  expect(releaseArtifactNaming('1.0.8', ['Marchen-1.0.8-macos-arm64.dmg'])).toBe('platform')
  expect(releaseArtifactNaming('1.0.7', ['Marchen-1.0.7-arm64.dmg'])).toBe('legacy')
})

it('mac 内部构建版本可逆映射并保持公开 SemVer', () => {
  expect(sparkleBuildVersion('1.0.0-alpha.0')).toBe('1.0.0a1')
  expect(sparkleBuildVersion('1.0.0-beta.2')).toBe('1.0.0b3')
  for (const version of ['1.0.0-alpha.0', '1.0.0-alpha.254', '1.0.0-beta.10', '1.0.0'])
    expect(releaseVersionFromSparkle(sparkleBuildVersion(version))).toBe(version)
  expect(() => sparkleBuildVersion('1.0.0-alpha.255')).toThrow('254')
  expect(() => releaseVersionFromSparkle('1.0.0a0')).toThrow()
})
