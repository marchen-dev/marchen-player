import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DanmakuResizeSettler } from '../danmaku/resize-settler'

describe('弹幕尺寸停稳去抖', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('连续变化只在停稳后交出最后一次尺寸', () => {
    const onSettle = vi.fn()
    const settler = new DanmakuResizeSettler(onSettle, 150)
    settler.schedule({ width: 800, height: 450 })
    vi.advanceTimersByTime(100)
    settler.schedule({ width: 900, height: 500 })
    vi.advanceTimersByTime(100)
    settler.schedule({ width: 1000, height: 560 })
    expect(settler.isPending).toBe(true)
    expect(onSettle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(150)
    expect(onSettle).toHaveBeenCalledTimes(1)
    expect(onSettle).toHaveBeenCalledWith({ width: 1000, height: 560 })
    expect(settler.isPending).toBe(false)
  })

  it('被取走后计时不再触发', () => {
    const onSettle = vi.fn()
    const settler = new DanmakuResizeSettler(onSettle, 150)
    settler.schedule({ width: 1000, height: 560 })
    expect(settler.take()).toEqual({ width: 1000, height: 560 })
    expect(settler.take()).toBeNull()
    vi.advanceTimersByTime(300)
    expect(onSettle).not.toHaveBeenCalled()
  })

  it('取消返回是否待定，且计时不再触发', () => {
    const onSettle = vi.fn()
    const settler = new DanmakuResizeSettler(onSettle, 150)
    expect(settler.cancel()).toBe(false)
    settler.schedule({ width: 1000, height: 560 })
    expect(settler.cancel()).toBe(true)
    vi.advanceTimersByTime(300)
    expect(onSettle).not.toHaveBeenCalled()
    expect(settler.isPending).toBe(false)
  })
})
