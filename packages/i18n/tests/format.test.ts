import { describe, expect, it } from 'vitest'
import { formatNumber } from '../src/format'

describe('数字格式', () => {
  it('两种语言都带千分位分隔', () => {
    expect(formatNumber(4492, 'zh-CN')).toBe('4,492')
    expect(formatNumber(4492, 'en')).toBe('4,492')
    expect(formatNumber(1234567, 'en')).toBe('1,234,567')
  })

  it('小于一千的数字不变', () => {
    expect(formatNumber(999, 'zh-CN')).toBe('999')
    expect(formatNumber(0, 'en')).toBe('0')
  })

  it('伪本地化按英文格式', () => {
    expect(formatNumber(4492, 'pseudo')).toBe('4,492')
  })
})
