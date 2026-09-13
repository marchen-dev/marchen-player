import type { DanmakuConfig, DanmakuItem } from '../src'
import { describe, expect, it } from 'vitest'
import { DanmakuLaneAllocator, DEFAULT_DANMAKU_CONFIG } from '../src'

const config: DanmakuConfig = {
  ...DEFAULT_DANMAKU_CONFIG,
  duration: 10,
  fontSize: 20,
  displayArea: 1,
  laneGap: 12,
}
const scroll: DanmakuItem = { id: 's', time: 0, text: 'scroll', mode: 'scroll', color: '#fff' }

describe('danmaku lane allocator', () => {
  it('窄屏单轨会拒绝仍可能碰撞的滚动弹幕', () => {
    const allocator = new DanmakuLaneAllocator(config)
    allocator.resize({ width: 100, height: 27 })
    expect(allocator.allocate(scroll, { width: 50, height: 27 }, 0)?.lane).toBe(0)
    expect(allocator.allocate({ ...scroll, id: 'fast' }, { width: 200, height: 27 }, 5)).toBeNull()
  })

  it('前一条已经拉开且新弹幕更慢时可安全复用轨道', () => {
    const allocator = new DanmakuLaneAllocator(config)
    allocator.resize({ width: 100, height: 27 })
    allocator.allocate(scroll, { width: 50, height: 27 }, 0)
    expect(allocator.allocate({ ...scroll, id: 'slow' }, { width: 10, height: 27 }, 5)?.lane).toBe(
      0,
    )
  })

  it('固定弹幕避开控制器遮挡矩形', () => {
    const allocator = new DanmakuLaneAllocator(config)
    allocator.resize({
      width: 300,
      height: 100,
      exclusionRect: { left: 0, right: 300, top: 0, bottom: 27 },
    })
    const top: DanmakuItem = { ...scroll, id: 'top', mode: 'top' }
    expect(allocator.allocate(top, { width: 80, height: 27 }, 0)).toEqual({
      lane: 1,
      laneSpan: 1,
      y: 27,
    })
  })

  it.each([
    { width: 160, height: 54, metrics: { width: 80, height: 27 }, span: 1 },
    { width: 640, height: 108, metrics: { width: 220, height: 54 }, span: 2 },
    { width: 1280, height: 162, metrics: { width: 600, height: 70 }, span: 3 },
  ])('按真实宽高分配多轨包围盒 %#', ({ width, height, metrics, span }) => {
    const allocator = new DanmakuLaneAllocator(config)
    allocator.resize({ width, height })
    expect(allocator.allocate(scroll, metrics, 0)).toMatchObject({ lane: 0, laneSpan: span })
  })

  it('多轨弹幕占用其覆盖的每条垂直候选', () => {
    const allocator = new DanmakuLaneAllocator(config)
    allocator.resize({ width: 400, height: 81 })
    expect(allocator.allocate(scroll, { width: 100, height: 54 }, 0)).toMatchObject({
      lane: 0,
      laneSpan: 2,
    })
    expect(
      allocator.allocate({ ...scroll, id: 'fixed', mode: 'top' }, { width: 100, height: 27 }, 0),
    ).toMatchObject({ lane: 2, laneSpan: 1 })
  })

  it('相同排除矩形去重且不清除已有活动占用', () => {
    const allocator = new DanmakuLaneAllocator(config)
    allocator.resize({ width: 300, height: 54 })
    allocator.allocate(scroll, { width: 80, height: 27 }, 0)
    const rect = { left: 0, right: 300, top: 27, bottom: 54 }
    expect(allocator.updateExclusionRect(rect)).toBe(true)
    expect(allocator.updateExclusionRect({ ...rect })).toBe(false)
    expect(allocator.activeCount).toBe(1)
  })
})
