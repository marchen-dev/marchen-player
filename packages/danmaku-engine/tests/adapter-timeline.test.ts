import { describe, expect, it } from 'vitest'
import { convertDandanplayComments, DanmakuTimeline, lowerBoundByTime } from '../src'

describe('danmaku adapter and timeline', () => {
  const items = convertDandanplayComments([
    { cid: 2, m: '顶部', p: '5,5,16711680,user' },
    { cid: 1, m: '滚动', p: '1,1,16777215,user' },
    { cid: 3, m: '底部', p: '5,4,255,user' },
  ])

  it('转换并稳定排序弹弹play评论', () => {
    expect(items.map((item) => [item.time, item.mode, item.color])).toEqual([
      [1, 'scroll', '#ffffff'],
      [5, 'top', '#ff0000'],
      [5, 'bottom', '#0000ff'],
    ])
  })

  it('兼容本地 B 站弹幕转换生成的十六进制颜色', () => {
    expect(
      convertDandanplayComments([{ cid: 4, m: '本地弹幕', p: '1,1,#66CCFF,user' }])[0]
        ?.color,
    ).toBe('#66ccff')
  })

  it('二分定位边界时间，seek 后不补发已越过弹幕', () => {
    expect(lowerBoundByTime(items, 5)).toBe(1)
    expect(lowerBoundByTime(items, 99)).toBe(3)
    const timeline = new DanmakuTimeline()
    timeline.replace(items, 5)
    expect(timeline.collect(5, 0).map((item) => item.text)).toEqual(['顶部', '底部'])
    timeline.seek(5.01)
    expect(timeline.collect(5.01, 1)).toEqual([])
  })
})
