import {
  canUpdateTo,
  compareReleaseVersions,
  parseReleaseVersion,
  releaseVersionFromSparkle,
  sparkleBuildVersion,
  updateFeedURL,
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
})

it('mac 内部构建版本可逆映射并保持公开 SemVer', () => {
  expect(sparkleBuildVersion('1.0.0-alpha.0')).toBe('1.0.0a1')
  expect(sparkleBuildVersion('1.0.0-beta.2')).toBe('1.0.0b3')
  for (const version of ['1.0.0-alpha.0', '1.0.0-alpha.254', '1.0.0-beta.10', '1.0.0'])
    expect(releaseVersionFromSparkle(sparkleBuildVersion(version))).toBe(version)
  expect(() => sparkleBuildVersion('1.0.0-alpha.255')).toThrow('254')
  expect(() => releaseVersionFromSparkle('1.0.0a0')).toThrow()
})
