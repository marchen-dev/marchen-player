import type { DanmakuItem } from '@marchen/danmaku-engine'
import type { PlaybackState } from '@marchen/playback-core'
import { DanmakuEngineCore } from '@marchen/danmaku-engine'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindDanmakuPlayback } from '../danmaku/playback-binding'
import { DanmakuRestoreBudgetError, prepareSeekRestoration } from '../danmaku/seek-restoration'

const items = Array.from({ length: 100 }, (_, index): DanmakuItem => ({
  id: String(index),
  time: 100 + index / 100,
  text: String(index),
  mode: 'scroll',
  color: '#fff',
}))
const setup = () => {
  const engine = new DanmakuEngineCore({ now: () => 113 }, undefined, { duration: 15 })
  engine.resize(1000, 500)
  engine.replaceItems(items)
  return engine
}
const measure = (items: ReadonlyArray<DanmakuItem>) =>
  items.map((item) => ({ item, metrics: { width: 100, height: 30 } }))
afterEach(() => vi.restoreAllMocks())

describe('异步 seek 快照准备', () => {
  it('分批测量不超过 32 个，暂停不依赖 tick', async () => {
    const engine = setup()
    const read = vi.fn(measure)
    const result = await prepareSeekRestoration(
      engine,
      113,
      () => 113,
      read,
      new AbortController().signal,
    )
    expect(read.mock.calls.map(([items]) => items.length)).toEqual([32, 32, 32, 4])
    expect(engine.activeCount).toBe(0)
    expect(engine.installRestoration(result.restoration, result.through)?.length).toBeGreaterThan(0)
  })
  it('批次期间取消立即停止，临时状态不影响核心', async () => {
    const engine = setup()
    const controller = new AbortController()
    const read = vi.fn((items: ReadonlyArray<DanmakuItem>) => {
      controller.abort()
      return measure(items)
    })
    await expect(
      prepareSeekRestoration(engine, 113, () => 113, read, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(read).toHaveBeenCalledTimes(1)
    expect(engine.activeCount).toBe(0)
  })
  it('构建期间向前推进，追赶新条目且按处理上界接续', async () => {
    const engine = setup()
    engine.replaceItems([...items, { ...items[0]!, id: 'new', time: 113.1 }])
    const result = await prepareSeekRestoration(
      engine,
      113,
      () => 113.2,
      measure,
      new AbortController().signal,
    )
    const placements = engine.installRestoration(result.restoration, result.through, 113.2)
    expect(result.through).toBe(113.2)
    expect(placements?.find((p) => p.item.id === 'new')?.elapsed).toBeCloseTo(0.1)
  })
  it('时钟倒退或落后超过窗口时要求有限重建', async () => {
    for (const time of [112, 130]) {
      await expect(
        prepareSeekRestoration(setup(), 113, () => time, measure, new AbortController().signal),
      ).rejects.toBeInstanceOf(DanmakuRestoreBudgetError)
    }
  })
})

describe('同步播放状态衔接', () => {
  const source = { id: 'a', url: 'a.mp4' }
  const timed = { source, currentTime: 113, duration: 200, rate: 2 }
  const setupBinding = () => {
    let state: PlaybackState = { status: 'paused', ...timed }
    const listeners = new Set<() => void>()
    const runtime = {
      get state() {
        return state
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    }
    const renderer = {
      play: vi.fn(),
      pause: vi.fn(),
      setRate: vi.fn(),
      seek: vi.fn(),
      restoreAfterSeek: vi.fn(),
      reset: vi.fn(),
    }
    const dispose = bindDanmakuPlayback(runtime, renderer)
    return {
      renderer,
      dispose,
      emit: (next: PlaybackState) => {
        state = next
        listeners.forEach((listener) => listener())
      },
    }
  }
  it('同一任务内 seeking→paused 也恢复最终落点，保留暂停和倍速', () => {
    const { renderer, emit } = setupBinding()
    emit({
      status: 'seeking',
      source,
      targetTime: 112,
      duration: 200,
      rate: 2,
      resumeAfterSeek: false,
    })
    emit({ status: 'paused', ...timed })
    expect(renderer.seek).toHaveBeenCalledWith(112)
    expect(renderer.restoreAfterSeek).toHaveBeenCalledExactlyOnceWith(113)
    expect(renderer.setRate).toHaveBeenLastCalledWith(2)
    expect(renderer.play).not.toHaveBeenCalled()
    emit({ status: 'paused', ...timed })
    expect(renderer.restoreAfterSeek).toHaveBeenCalledTimes(1)
  })
  it('连续目标仅完成最新落点，换源后不再提交旧 seek', () => {
    const { renderer, emit, dispose } = setupBinding()
    for (const targetTime of [30, 60])
      emit({ status: 'seeking', source, targetTime, duration: 200, rate: 2, resumeAfterSeek: true })
    emit({ status: 'playing', ...timed, currentTime: 60 })
    expect(renderer.restoreAfterSeek).toHaveBeenCalledExactlyOnceWith(60)
    emit({
      status: 'seeking',
      source,
      targetTime: 90,
      duration: 200,
      rate: 2,
      resumeAfterSeek: false,
    })
    emit({ status: 'loading', source: { id: 'b', url: 'b.mp4' } })
    emit({ status: 'paused', ...timed, source: { id: 'b', url: 'b.mp4' } })
    expect(renderer.reset).toHaveBeenCalledTimes(1)
    expect(renderer.restoreAfterSeek).toHaveBeenCalledTimes(1)
    dispose()
    emit({ status: 'idle' })
    expect(renderer.reset).toHaveBeenCalledTimes(1)
  })
  it('同一来源换 transport 的 loading 保留待恢复状态', () => {
    const { renderer, emit } = setupBinding()
    emit({
      status: 'seeking',
      source,
      targetTime: 113,
      duration: 200,
      rate: 2,
      resumeAfterSeek: false,
    })
    emit({ status: 'loading', source })
    expect(renderer.reset).not.toHaveBeenCalled()
    emit({ status: 'ready', ...timed })
    expect(renderer.restoreAfterSeek).toHaveBeenCalledExactlyOnceWith(113)
  })
})
