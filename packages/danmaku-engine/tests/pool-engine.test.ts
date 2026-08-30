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
    const engine = new DanmakuEngineCore({ now: () => now }, () => ({ width: 40, height: 27 }), {
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
    const engine = new DanmakuEngineCore({ now: () => 0 }, () => ({ width: 20, height: 27 }), {
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
    expect(engine.getDiagnostics()).toEqual({ active: 1, peakActive: 1, dropped: 1 })
  })

  it('测量或节点容量不足只计入丢弃，不留下幽灵占用', () => {
    const engine = new DanmakuEngineCore({ now: () => 0 }, undefined, {
      maxOnScreen: 2,
      lookAhead: 0,
    })
    engine.resize(500, 200)
    engine.replaceItems([item('missing-node', 0)], 0)
    engine.play()
    const [candidate] = engine.collectCandidates()
    expect(engine.placeCandidates([{ item: candidate!, metrics: null }])).toEqual([])
    expect(engine.getDiagnostics()).toEqual({ active: 0, peakActive: 0, dropped: 1 })
  })

  it('单条暂停、全局暂停和倍速变更不会推进冻结的运动快照', () => {
    let now = 0
    const engine = new DanmakuEngineCore({ now: () => now }, () => ({ width: 50, height: 27 }), {
      duration: 10,
      displayArea: 1,
      lookAhead: 0,
    })
    engine.resize(100, 36)
    engine.replaceItems([item('first', 0)], 0)
    engine.play()
    expect(engine.tick()).toHaveLength(1)

    now = 2
    expect(engine.pauseItem('first')).toBe(true)
    const frozen = engine.getMotionSnapshot('first')
    engine.pause()
    engine.setRate(2)
    now = 7
    expect(engine.getMotionSnapshot('first')).toEqual(frozen)

    engine.play()
    expect(engine.resumeItem('first')).toBe(true)
    now = 8
    expect(engine.getMotionSnapshot('first')?.elapsed).toBe(3)
  })

  it('resize 和 seek 以 revision 原子清除活动记录', () => {
    const engine = new DanmakuEngineCore({ now: () => 0 }, () => ({ width: 20, height: 27 }))
    engine.resize(500, 200)
    engine.replaceItems([item('first', 0)], 0)
    engine.play()
    engine.tick()
    const beforeResize = engine.revision
    expect(engine.activeCount).toBe(1)
    engine.resize(640, 360)
    expect(engine.activeCount).toBe(0)
    expect(engine.revision).toBeGreaterThan(beforeResize)

    engine.seek(0)
    expect(engine.activeCount).toBe(0)
  })

  it('数据替换、显示区域和显示开关热更新不会保留陈旧占用', () => {
    let now = 0
    const engine = new DanmakuEngineCore({ now: () => now }, () => ({ width: 20, height: 27 }), {
      displayArea: 1,
      lookAhead: 0,
    })
    engine.resize(500, 200)
    engine.replaceItems([item('old', 0)], 0)
    engine.play()
    expect(engine.tick()).toHaveLength(1)

    engine.replaceItems([item('new', 1)], 1)
    expect(engine.activeCount).toBe(0)
    now = 1
    expect(engine.tick()[0]?.item.id).toBe('new')

    engine.updateConfig({ displayArea: 0.25 })
    expect(engine.activeCount).toBe(0)
    engine.updateConfig({ enabled: false })
    expect(engine.tick()).toEqual([])
  })

  it('运行策略热更新保留活动占用与 revision', () => {
    const engine = new DanmakuEngineCore({ now: () => 0 }, () => ({ width: 20, height: 27 }), {
      displayArea: 1,
      lookAhead: 0,
      maxOnScreen: 80,
    })
    engine.resize(500, 200)
    engine.replaceItems([item('visible', 0)], 0)
    engine.play()
    expect(engine.tick()).toHaveLength(1)
    const revision = engine.revision

    engine.updateConfig({ maxOnScreen: 40 }, false)

    expect(engine.activeCount).toBe(1)
    expect(engine.revision).toBe(revision)
    expect(engine.getMotionSnapshot('visible')).not.toBeNull()
  })

  it('持续时间热更新保留活动弹幕位置、暂停状态和 revision', () => {
    let now = 0
    const engine = new DanmakuEngineCore({ now: () => now }, () => ({ width: 50, height: 27 }), {
      duration: 10,
      displayArea: 1,
      lookAhead: 0,
    })
    engine.resize(100, 54)
    engine.replaceItems([item('visible', 0)], 0)
    engine.play()
    expect(engine.tick()).toHaveLength(1)

    now = 4
    expect(engine.pauseItem('visible')).toBe(true)
    const before = engine.getMotionSnapshot('visible')!
    const revision = engine.revision
    engine.updateConfig({ duration: 20 }, false)
    const after = engine.getMotionSnapshot('visible')!

    expect(after).toMatchObject({ left: before.left, right: before.right, state: 'paused' })
    expect(after.elapsed).toBe(8)
    expect(engine.activeCount).toBe(1)
    expect(engine.revision).toBe(revision)
  })

  it('字号和显示区域渐进更新只约束后续弹幕', () => {
    const engine = new DanmakuEngineCore({ now: () => 0 }, undefined, {
      duration: 10,
      fontSize: 20,
      displayArea: 1,
      lookAhead: 0,
    })
    engine.resize(300, 108)
    engine.play()

    const bottom = { ...item('old', 0), mode: 'bottom' as const }
    expect(engine.placeCandidates([{ item: bottom, metrics: { width: 50, height: 27 } }])[0]).toMatchObject({
      lane: 3,
      y: 81,
    })
    const revision = engine.revision

    engine.updateConfig({ fontSize: 40, displayArea: 0.75 }, false)
    expect(engine.activeCount).toBe(1)
    expect(engine.getMotionSnapshot('old')?.top).toBe(81)

    const next = engine.placeCandidates([
      { item: item('new', 0), metrics: { width: 80, height: 54 } },
    ])[0]
    expect(next).toMatchObject({ lane: 0, laneSpan: 2, y: 0 })
    expect(engine.revision).toBe(revision)
  })
})
