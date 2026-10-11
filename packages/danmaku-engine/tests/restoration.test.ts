import type { DanmakuItem } from '../src'
import { describe, expect, it } from 'vitest'
import { DanmakuEngineCore } from '../src'

const item = (id: string, time: number, mode: DanmakuItem['mode'] = 'scroll'): DanmakuItem => ({
  id,
  time,
  mode,
  text: id,
  color: '#fff',
})
const setup = (items: DanmakuItem[], maxOnScreen = 80) => {
  let time = 116
  const engine = new DanmakuEngineCore({ now: () => time }, () => ({ width: 100, height: 30 }), {
    duration: 15,
    displayArea: 1,
    maxOnScreen,
    lookAhead: 0,
  })
  engine.resize(1000, 300)
  engine.replaceItems(items)
  const restore = (target: number) => {
    engine.seek(target)
    const builder = engine.beginRestoration()
    builder.append(
      engine.getRestoreCandidates(target - 15, target).map((item) => ({
        item,
        metrics: { width: 100, height: 30 },
      })),
    )
    time = target
    return engine.installRestoration(builder, target)
  }
  return {
    engine,
    restore,
    setTime: (value: number) => {
      time = value
    },
  }
}

describe('弹幕 seek 恢复', () => {
  it('暂停时也恢复已离屏弹幕的 13 秒进度，2 秒后结束', () => {
    const { engine, restore, setTime } = setup([item('a', 100)])
    expect(restore(113)).toMatchObject([{ elapsed: 13, duration: 15, startDelay: 0 }])
    expect(engine.getMotionSnapshot('a')?.left).toBeCloseTo(1000 - (1100 * 13) / 15)
    engine.play()
    expect(engine.tick()).toEqual([])
    setTime(115)
    engine.tick()
    expect(engine.activeCount).toBe(0)
  })
  it('边界包含零点和开始时间，不恢复已结束或未来条目', () => {
    const { restore } = setup([item('zero', 0), item('a', 100)])
    expect(restore(0)?.map((p) => p.item.id)).toEqual(['zero'])
    expect(restore(99)).toEqual([])
    expect(restore(100)).toMatchObject([{ item: { id: 'a' }, elapsed: 0 }])
    expect(restore(115)).toEqual([])
  })
  it('三种模式保留进度，提交采用最新倍速', () => {
    const { engine, restore } = setup([
      item('a', 100),
      item('b', 101, 'top'),
      item('c', 102, 'bottom'),
    ])
    engine.setRate(2)
    expect(restore(113)?.map((p) => [p.item.mode, p.elapsed, p.playbackRate])).toEqual([
      ['scroll', 13, 2],
      ['top', 12, 2],
      ['bottom', 11, 2],
    ])
  })
  it('恢复条目和容量丢弃条目均不重复发射，释放后后续条目可进入', () => {
    const { engine, restore, setTime } = setup([item('a', 100), item('b', 113), item('c', 116)], 1)
    expect(restore(113)?.map((p) => p.item.id)).toEqual(['a'])
    expect(engine.getDiagnostics().dropped).toBe(1)
    engine.play()
    expect(engine.tick()).toEqual([])
    setTime(116)
    expect(engine.tick().map((p) => p.item.id)).toEqual(['c'])
  })
  it('过滤不占容量，关闭时不恢复', () => {
    const { engine, restore } = setup([item('a', 100), item('b', 101)], 1)
    engine.setBlockedIds(new Set(['a']))
    expect(restore(113)?.map((p) => p.item.id)).toEqual(['b'])
    expect(engine.getDiagnostics().dropped).toBe(0)
    engine.updateConfig({ enabled: false })
    expect(restore(113)).toEqual([])
  })
  it('不接受过时、外部或重复提交的快照', () => {
    const { engine } = setup([item('a', 100)])
    const builder = engine.beginRestoration()
    engine.seek(113)
    expect(engine.installRestoration(builder, 113)).toBeNull()
    const fresh = engine.beginRestoration()
    const other = setup([]).engine
    expect(other.installRestoration(fresh, 113)).toBeNull()
    expect(engine.installRestoration(fresh, 113)).toEqual([])
    expect(engine.installRestoration(fresh, 113)).toBeNull()
  })
  it('分批追赶不遗漏新条目，并按最终展示时间推进已有条目', () => {
    const { engine } = setup([item('a', 100), item('b', 113.1)])
    const builder = engine.beginRestoration()
    for (const [from, to] of [
      [98, 113],
      [113, 113.2],
    ]) {
      builder.append(
        engine
          .getRestoreCandidates(from!, to!)
          .map((item) => ({ item, metrics: { width: 100, height: 30 } })),
      )
    }
    expect(
      engine.installRestoration(builder, 113.2, 113.25)?.map((p) => [p.item.id, p.elapsed]),
    ).toEqual([
      ['a', 13.25],
      ['b', 113.25 - 113.1],
    ])
  })
  it('新条目使用恢复占用，整段运动不追尾', () => {
    const { engine, restore, setTime } = setup([item('a', 100), item('b', 105.1)])
    restore(105)
    engine.play()
    setTime(105.1)
    engine.tick()
    for (let t = 105.1; t < 115; t += 0.1) {
      const a = engine.getMotionSnapshot('a', t)!
      const b = engine.getMotionSnapshot('b', t)!
      if (a.lane === b.lane) expect(b.left - a.right).toBeGreaterThanOrEqual(12)
    }
  })
})
