import type { DanmakuItem } from '../src'
import { describe, expect, it } from 'vitest'
import { DanmakuEngineCore, DanmakuLaneAllocator, DEFAULT_DANMAKU_CONFIG } from '../src'

const scroll = (id: string, time: number): DanmakuItem => ({
  id,
  time,
  text: id,
  mode: 'scroll',
  color: '#fff',
})

describe('danmaku collision regressions', () => {
  it('更新控制器遮挡区域不会遗忘仍在屏幕上的轨道占用', () => {
    let now = 0
    const engine = new DanmakuEngineCore({ now: () => now }, () => ({ width: 50, height: 27 }), {
      duration: 10,
      fontSize: 20,
      displayArea: 1,
      lookAhead: 0,
    })
    engine.resize(100, 54)
    engine.replaceItems([scroll('first', 0), scroll('second', 2)], 0)
    engine.play()
    expect(engine.tick()).toHaveLength(1)

    engine.setExclusionRect({ left: 0, right: 100, top: 27, bottom: 54 })
    engine.setExclusionRect({ left: 1, right: 99, top: 27, bottom: 54 })
    engine.setExclusionRect({ left: 0, right: 100, top: 27, bottom: 54 })
    now = 2
    expect(engine.tick()).toEqual([])
  })

  it('hover 暂停的弹幕持续占用轨道和活动容量', () => {
    let now = 0
    const engine = new DanmakuEngineCore({ now: () => now }, () => ({ width: 50, height: 27 }), {
      duration: 10,
      fontSize: 20,
      displayArea: 1,
      lookAhead: 0,
    })
    engine.resize(100, 27)
    engine.replaceItems([scroll('first', 0), scroll('second', 9)], 0)
    engine.play()
    expect(engine.tick()).toHaveLength(1)

    engine.pauseItem('first')
    now = 9
    expect(engine.tick()).toEqual([])
    expect(engine.activeCount).toBe(1)
  })

  it('顶部和底部弹幕不会取得相同的垂直位置', () => {
    const allocator = new DanmakuLaneAllocator({
      ...DEFAULT_DANMAKU_CONFIG,
      duration: 10,
      fontSize: 20,
      displayArea: 1,
    })
    allocator.resize({ width: 300, height: 54 })
    const top = { ...scroll('top', 0), mode: 'top' as const }
    const bottom = { ...scroll('bottom', 0), mode: 'bottom' as const }

    expect(allocator.allocate(top, { width: 80, height: 27 }, 0)?.y).toBe(0)
    expect(allocator.allocate({ ...top, id: 'top-2' }, { width: 80, height: 27 }, 0)?.y).toBe(27)
    expect(allocator.allocate(bottom, { width: 80, height: 27 }, 0)).toBeNull()
  })
})
