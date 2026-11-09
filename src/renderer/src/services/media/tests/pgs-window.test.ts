import { describe, expect, it } from 'vitest'
import {
  activeIndex,
  backtrack,
  decodeAheadEnd,
  mergeRanges,
  PGS_WINDOW,
  readAheadEnd,
  uncovered,
} from '../subtitles/pgs/window'

const times = [1, 2, 3, 4, 5, 6, 7]

describe('定位当前显示集', () => {
  it('二分找到开始时间不晚于 t 的最后一个', () => {
    expect(activeIndex(times, 0.5)).toBe(-1)
    expect(activeIndex(times, 1)).toBe(0)
    expect(activeIndex(times, 3.9)).toBe(2)
    expect(activeIndex(times, 100)).toBe(6)
    expect(activeIndex([], 3)).toBe(-1)
  })
})

describe('回溯', () => {
  const states = [true, false, true, false, false, true, false]
  it('跳到清屏包之后只需回溯一步', () => {
    expect(backtrack(1, (k) => states[k], () => 100)).toEqual({ kind: 'found', start: 0, steps: 1 })
    expect(backtrack(4, (k) => states[k], () => 100)).toEqual({ kind: 'found', start: 2, steps: 2 })
  })

  it('未读的块先请求读取', () => {
    expect(backtrack(4, (k) => (k === 3 ? undefined : states[k]), () => 0)).toEqual({ kind: 'need', index: 3 })
  })

  it('超过数量或字节上限时判为超限', () => {
    const allNormal = () => false
    expect(backtrack(100, allNormal, () => 0, { backtrackSets: 64, backtrackBytes: 1e9 })).toEqual({ kind: 'exceeded', steps: 64 })
    expect(backtrack(5, allNormal, () => 5_000_000, { backtrackSets: 64, backtrackBytes: 8_000_000 }).kind).toBe('exceeded')
    // 回到开头都找不到可独立显示的显示集
    expect(backtrack(2, allNormal, () => 0).kind).toBe('exceeded')
  })
})

describe('前方读取与提前解码', () => {
  it('时间先到时按时间截止', () => {
    expect(readAheadEnd(times, 0, 1, () => 10, { aheadSeconds: 3, aheadBytes: 1e9 })).toBe(4)
  })

  it('字节先到时按字节截止，但至少包含起点', () => {
    expect(readAheadEnd(times, 2, 3, () => 5, { aheadSeconds: 100, aheadBytes: 12 })).toBe(4)
    expect(readAheadEnd(times, 2, 3, () => 50, { aheadSeconds: 100, aheadBytes: 12 })).toBe(3)
  })

  it('片尾曲式密集段：像素上限先到', () => {
    // 24 fps，每个显示集 1920×1080 全屏
    const dense = Array.from({ length: 100 }, (_, i) => i / 24)
    const end = decodeAheadEnd(dense, 0, 0, () => 1920 * 1080, PGS_WINDOW)
    // 每帧约 207 万像素，第 4 帧会让累计超过 800 万，只提前解码 3 帧
    expect(end).toBe(3)
  })

  it('当前显示集即使超出像素预算也会解码', () => {
    expect(decodeAheadEnd(times, 3, 4, () => 1e9)).toBe(4)
  })
})

describe('扫描区间', () => {
  it('合并重叠区间并求未覆盖部分', () => {
    expect(mergeRanges([[5, 10], [0, 3], [2, 6]])).toEqual([[0, 10]])
    expect(uncovered([[0, 3], [5, 8]], 1, 10)).toEqual([[3, 5], [8, 10]])
    expect(uncovered([[0, 20]], 1, 10)).toEqual([])
    expect(uncovered([], 1, 10)).toEqual([[1, 10]])
  })
})
