import type { DanmakuItem } from '../src'
import { describe, expect, it } from 'vitest'
import { DanmakuEngineCore } from '../src'
import { findRectIntersections, isVisibleRect } from './collision-helpers'

const createRandom = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

describe('dense collision simulation', () => {
  it('固定种子密集混排在完整运动区间内没有非法矩形相交', () => {
    const random = createRandom(20260830)
    const modes = ['scroll', 'top', 'bottom'] as const
    const items: DanmakuItem[] = Array.from({ length: 120 }, (_, index) => {
      const fontSize = [18, 26, 40][Math.floor(random() * 3)]!
      const textLength = 2 + Math.floor(random() * 24)
      return {
        id: `dense-${index}`,
        time: Math.floor(index / 8) * 0.35,
        text: '密'.repeat(textLength),
        mode: modes[Math.floor(random() * modes.length)]!,
        color: '#fff',
        fontSize,
      }
    })
    let now = 0
    const engine = new DanmakuEngineCore(
      { now: () => now },
      (item) => ({
        width: item.text.length * (item.fontSize ?? 26),
        height: (item.fontSize ?? 26) * 1.35,
      }),
      { duration: 6, displayArea: 1, fontSize: 20, laneGap: 12, lookAhead: 0 },
    )
    engine.resize(640, 360)
    engine.replaceItems(items, 0)
    engine.play()

    const activeIds = new Set<string>()
    let placed = 0
    for (let step = 0; step <= 240; step += 1) {
      now = step * 0.05
      for (const placement of engine.tick()) {
        activeIds.add(placement.item.id)
        placed += 1
      }
      const rects = [...activeIds]
        .flatMap((id) => {
          const snapshot = engine.getMotionSnapshot(id, now)
          if (!snapshot) {
            activeIds.delete(id)
            return []
          }
          return [
            {
              id: snapshot.id,
              left: snapshot.left,
              right: snapshot.right,
              top: snapshot.top,
              bottom: snapshot.bottom,
            },
          ]
        })
        .filter((rect) => isVisibleRect(rect, 640, 360))

      expect(findRectIntersections(rects), `t=${now.toFixed(2)}`).toEqual([])
    }
    expect(placed).toBeGreaterThan(10)
    expect(engine.getDiagnostics().peakActive).toBeGreaterThan(1)
  })
})
