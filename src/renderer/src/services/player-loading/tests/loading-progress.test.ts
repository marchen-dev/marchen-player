import { describe, expect, it } from 'vitest'
import { advanceProgress, CREEP_CAP, progressTarget, toProgressStep } from '../loading-progress'

describe('加载进度模型', () => {
  it('本地来源把大部分长度留给匹配与获取弹幕', () => {
    const start = (step: 'hashing' | 'matching' | 'loading_danmaku') =>
      progressTarget({ step, profile: 'local', elapsedMs: 0 })
    expect(start('hashing')).toBeCloseTo(0.08)
    expect(start('matching')).toBeCloseTo(0.15)
    expect(start('loading_danmaku')).toBeCloseTo(0.55)
  })

  it('远程来源的导入段按真实字节比例映射', () => {
    expect(
      progressTarget({ step: 'importing', profile: 'remote', elapsedMs: 0, ratio: 0.5 }),
    ).toBeCloseTo(0.2)
    expect(
      progressTarget({ step: 'importing', profile: 'remote', elapsedMs: 0, ratio: 2 }),
    ).toBeCloseTo(0.4)
  })

  it('段内渐近爬升：开头快、越来越慢、不超过上限', () => {
    const at = (elapsedMs: number) =>
      progressTarget({ step: 'matching', profile: 'local', elapsedMs })
    const first = at(1_000) - at(0)
    const later = at(5_000) - at(4_000)
    expect(first).toBeGreaterThan(later)
    expect(at(60_000)).toBeLessThanOrEqual(0.15 + 0.4 * CREEP_CAP + 1e-9)
    // 永远停在段终点之前，完成时进入下一段会有可见的跳动
    expect(at(60_000)).toBeLessThan(0.55)
  })

  it('减少动态效果时只停在段起点', () => {
    expect(
      progressTarget({ step: 'matching', profile: 'local', elapsedMs: 5_000, reducedMotion: true }),
    ).toBeCloseTo(0.15)
  })

  it('进度只增不减', () => {
    expect(advanceProgress(0.3, 0.2)).toBe(0.3)
    expect(advanceProgress(0.3, 0.5)).toBe(0.5)
    expect(advanceProgress(0.3, 1.5)).toBe(1)
  })

  it('等待选择与匹配失败停在匹配段并暂停', () => {
    expect(toProgressStep('waiting_user')).toEqual({ step: 'matching', paused: true })
    expect(toProgressStep('match_failed')).toEqual({ step: 'matching', paused: true })
    expect(toProgressStep('matching')).toEqual({ step: 'matching', paused: false })
    expect(toProgressStep('ready')).toBeNull()
  })
})
