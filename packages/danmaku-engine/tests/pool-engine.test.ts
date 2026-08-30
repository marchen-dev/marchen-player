import type { DanmakuItem } from '../src'
import { describe, expect, it, vi } from 'vitest'
import { DanmakuEngineCore, DanmakuNodePool } from '../src'

describe('danmaku node pool', () => {
  it('达到上限后丢弃，并在复用前清空文本、样式和事件状态', () => {
    const reset = vi.fn((node: { text: string; style: string; hovered: boolean }) => {
      node.text = ''
      node.style = ''
      node.hovered = false
    })
    const pool = new DanmakuNodePool(1, () => ({ text: '', style: '', hovered: false }), reset)
    const first = pool.acquire()!
    first.text = 'old'
    first.style = 'color:red'
    first.hovered = true
    expect(pool.acquire()).toBeNull()

    pool.release(first)
    const reused = pool.acquire()!
    expect(reused).toBe(first)
    expect(reused).toEqual({ text: '', style: '', hovered: false })
    expect(pool.allocatedCount).toBe(1)
  })
})

describe('danmaku engine commands', () => {
  const item = (id: string, time: number): DanmakuItem => ({
    id,
    time,
    text: id,
    mode: 'scroll',
    color: '#fff',
  })

  it('只在播放时 tick，seek 清屏并从新时间二分调度', () => {
    let now = 5
    const engine = new DanmakuEngineCore({ now: () => now }, () => 40, {
      maxOnScreen: 2,
      lookAhead: 0,
    })
    engine.resize(500, 200)
    engine.replaceItems([item('past', 1), item('current', 5), item('future', 10)], 5)
    expect(engine.tick()).toEqual([])

    engine.play()
    expect(engine.tick().map((placement) => placement.item.id)).toEqual(['current'])
    engine.seek(10)
    now = 10
    expect(engine.tick().map((placement) => placement.item.id)).toEqual(['future'])
    expect(engine.revision).toBeGreaterThan(1)
  })

  it('倍速命令更新 placement，最大在屏数触发高密度丢弃', () => {
    const engine = new DanmakuEngineCore({ now: () => 0 }, () => 20, {
      maxOnScreen: 1,
      lookAhead: 0,
    })
    engine.resize(500, 200)
    engine.replaceItems([item('first', 0), item('dropped', 0)], 0)
    engine.setRate(2)
    engine.play()
    const placements = engine.tick()

    expect(placements).toHaveLength(1)
    expect(placements[0]).toMatchObject({ playbackRate: 2, item: { id: 'first' } })
    expect(engine.activeCount).toBe(1)
  })
})
