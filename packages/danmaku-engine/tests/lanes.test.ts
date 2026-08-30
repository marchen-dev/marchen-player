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
    expect(allocator.allocate(scroll, 50, 0)?.lane).toBe(0)
    expect(allocator.allocate({ ...scroll, id: 'fast' }, 200, 5)).toBeNull()
  })

  it('前一条已经拉开且新弹幕更慢时可安全复用轨道', () => {
    const allocator = new DanmakuLaneAllocator(config)
    allocator.resize({ width: 100, height: 27 })
    allocator.allocate(scroll, 50, 0)
    expect(allocator.allocate({ ...scroll, id: 'slow' }, 10, 5)?.lane).toBe(0)
  })

  it('固定弹幕避开控制器遮挡矩形', () => {
    const allocator = new DanmakuLaneAllocator(config)
    allocator.resize({
      width: 300,
      height: 100,
      exclusionRect: { left: 0, right: 300, top: 0, bottom: 27 },
    })
    const top: DanmakuItem = { ...scroll, id: 'top', mode: 'top' }
    expect(allocator.allocate(top, 80, 0)).toEqual({ lane: 1, y: 27 })
  })
})
