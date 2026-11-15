import { isWithinNewWindow, NEW_FEATURES, shouldShowNewBadge } from '@renderer/lib/new-features'
import { describe, expect, it } from 'vitest'

describe('新功能标记的显示规则', () => {
  it('引入版本与紧随其后的一个补丁版本内显示', () => {
    expect(isWithinNewWindow('1.1.8', '1.1.8')).toBe(true)
    expect(isWithinNewWindow('1.1.8', '1.1.9')).toBe(true)
  })

  it('再往后的补丁版本、新的次版本或主版本不再显示', () => {
    expect(isWithinNewWindow('1.1.8', '1.1.10')).toBe(false)
    expect(isWithinNewWindow('1.1.8', '1.2.0')).toBe(false)
    expect(isWithinNewWindow('1.1.8', '2.0.0')).toBe(false)
  })

  it('版本号尚未提升到引入版本时按新功能显示', () => {
    expect(isWithinNewWindow('1.1.8', '1.1.7')).toBe(true)
    expect(isWithinNewWindow('1.2.0', '1.1.9')).toBe(true)
    expect(isWithinNewWindow('2.0.0', '1.9.9')).toBe(true)
  })

  it('预发布后缀不影响判断', () => {
    expect(isWithinNewWindow('1.1.8', '1.1.8-beta.2')).toBe(true)
    expect(isWithinNewWindow('1.1.8', '1.1.10-alpha.1')).toBe(false)
  })

  it('版本号无法解析时不显示', () => {
    expect(isWithinNewWindow('1.1.8', '')).toBe(false)
    expect(isWithinNewWindow('1.1.8', 'dev')).toBe(false)
    expect(isWithinNewWindow('next', '1.1.8')).toBe(false)
  })

  it('用过的功能不再显示，即使仍在窗口内', () => {
    const { since } = NEW_FEATURES['danmaku-translation']
    expect(shouldShowNewBadge('danmaku-translation', since, [])).toBe(true)
    expect(shouldShowNewBadge('danmaku-translation', since, ['danmaku-translation'])).toBe(false)
    // 其他功能的记录不影响
    expect(shouldShowNewBadge('danmaku-translation', since, ['something-else'])).toBe(true)
  })
})
