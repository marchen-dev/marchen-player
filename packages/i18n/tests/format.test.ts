import { describe, expect, it } from 'vitest'
import { formatDate, formatNumber } from '../src/format'

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

describe('日期格式', () => {
  const date = new Date(2026, 10, 15, 9, 5)

  it('按界面语言的习惯显示', () => {
    expect(formatDate(date, 'zh-CN')).toBe('2026年11月15日')
    expect(formatDate(date, 'en')).toBe('Nov 15, 2026')
  })

  it('可以带上时间', () => {
    expect(formatDate(date, 'zh-CN', 'datetime')).toBe('2026年11月15日 09:05')
    expect(formatDate(date, 'en', 'datetime')).toMatch(/^Nov 15, 2026, 09:05\s?AM$/)
  })

  it('接受时间戳与日期字符串', () => {
    expect(formatDate(date.getTime(), 'en')).toBe('Nov 15, 2026')
    expect(formatDate(date.toISOString(), 'en')).toBe('Nov 15, 2026')
  })

  it('无效的日期返回空字符串', () => {
    expect(formatDate('不是日期', 'en')).toBe('')
    expect(formatDate(Number.NaN, 'zh-CN')).toBe('')
  })

  it('伪本地化按英文格式', () => {
    expect(formatDate(date, 'pseudo')).toBe('Nov 15, 2026')
  })
})
