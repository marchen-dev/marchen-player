import { describe, expect, it } from 'vitest'

import {
  danmakuFontScaleToPx,
  danmakuSpeedIndexOf,
  danmakuSpeedLevels,
  normalizeDanmakuAppearance,
  normalizeDanmakuDisplayArea,
  normalizeDanmakuDuration,
  normalizeDanmakuFontScale,
} from '../danmaku/appearance'

describe('弹幕字号归一化与迁移', () => {
  it('旧像素档位按当时的标签迁移', () => {
    const legacy: Array<[string, number]> = [
      ['22', 80],
      ['24', 90],
      ['26', 100],
      ['28', 110],
      ['30', 120],
      ['32', 130],
      ['34', 140],
      ['39', 150],
      ['42', 160],
      ['44', 170],
      ['47', 180],
      ['49', 190],
      ['52', 200],
    ]
    for (const [px, scale] of legacy) expect(normalizeDanmakuFontScale(undefined, px)).toBe(scale)
  })

  it('表外像素按 26px 基准换算并对齐 5%', () => {
    expect(normalizeDanmakuFontScale(undefined, '36')).toBe(140)
    expect(normalizeDanmakuFontScale(undefined, '10')).toBe(80)
    expect(normalizeDanmakuFontScale(undefined, '80')).toBe(200)
  })

  it('新字段优先于旧字段，并限制范围与步进', () => {
    expect(normalizeDanmakuFontScale(135, '22')).toBe(135)
    expect(normalizeDanmakuFontScale(137, undefined)).toBe(135)
    expect(normalizeDanmakuFontScale(300, undefined)).toBe(200)
    expect(normalizeDanmakuFontScale(10, undefined)).toBe(80)
  })

  it('缺失或损坏时取默认 100%', () => {
    expect(normalizeDanmakuFontScale(undefined, undefined)).toBe(100)
    expect(normalizeDanmakuFontScale(Number.NaN, 'abc')).toBe(100)
    expect(normalizeDanmakuFontScale('120', null)).toBe(100)
  })

  it('百分比换算为像素', () => {
    expect(danmakuFontScaleToPx(100)).toBe(26)
    expect(danmakuFontScaleToPx(120)).toBe(31)
    expect(danmakuFontScaleToPx(200)).toBe(52)
  })
})

describe('弹幕速度', () => {
  it('档位从慢到快，滚屏时间严格递减', () => {
    const durations = danmakuSpeedLevels.map((level) => Number(level.value))
    for (let index = 1; index < durations.length; index++) {
      expect(durations[index]).toBeLessThan(durations[index - 1])
    }
  })

  it('已保存的毫秒值保持不变，旧「极慢」17s 现在是较慢', () => {
    expect(normalizeDanmakuDuration('17000')).toBe('17000')
    expect(danmakuSpeedIndexOf('17000')).toBe(1)
    expect(danmakuSpeedIndexOf('19000')).toBe(0)
  })

  it('表外值取最近档位，损坏值取适中', () => {
    expect(normalizeDanmakuDuration('8000')).toBe('10000')
    expect(normalizeDanmakuDuration(18500)).toBe('19000')
    expect(normalizeDanmakuDuration('abc')).toBe('15000')
    expect(normalizeDanmakuDuration(undefined)).toBe('15000')
  })
})

describe('显示区域', () => {
  it('只接受五个档位', () => {
    expect(normalizeDanmakuDisplayArea('0.5')).toBe('0.5')
    expect(normalizeDanmakuDisplayArea('0.3')).toBe('0.25')
    expect(normalizeDanmakuDisplayArea(undefined)).toBe('0.25')
  })
})

describe('播放设置中的外观字段', () => {
  it('旧存储读出后迁移字号、删除旧键并保留其他字段', () => {
    const result = normalizeDanmakuAppearance({
      danmakuFontSize: '30',
      danmakuMaxOnScreen: '40',
      danmakuDuration: '17000',
      danmakuEndArea: '0.5',
      enableDanmaku: false,
    })
    expect(result).toEqual({
      danmakuFontScale: 120,
      danmakuDuration: '17000',
      danmakuEndArea: '0.5',
      enableDanmaku: false,
    })
    expect('danmakuFontSize' in result).toBe(false)
    expect('danmakuMaxOnScreen' in result).toBe(false)
  })
})
