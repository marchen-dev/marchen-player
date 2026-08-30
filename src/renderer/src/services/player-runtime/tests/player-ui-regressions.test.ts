import type { DanmakuPlacement } from '@marchen/danmaku-engine'
import { canStartControllerDrag } from '@renderer/components/modules/player/controls/controller-drag'
import { volumeFromPointer } from '@renderer/components/modules/player/controls/volume-slider-math'
import { describe, expect, it } from 'vitest'
import {
  getDanmakuAnimationTiming,
  getDanmakuInitialTransform,
} from '../danmaku/dom-danmaku-renderer'

const placement: DanmakuPlacement = {
  item: { id: '1', time: 1, text: '弹幕', mode: 'scroll', color: '#fff' },
  lane: 2,
  y: 72,
  width: 120,
  duration: 8,
  playbackRate: 1,
  startDelay: 0.08,
}

describe('播放器 UI 回归', () => {
  it('滚动弹幕入 DOM 前已经定位到画面右侧和目标轨道', () => {
    expect(getDanmakuInitialTransform(placement, 1280)).toBe('translate3d(1280px, 72px, 0)')
    expect(getDanmakuAnimationTiming(placement).fill).toBe('both')
  })

  it('固定弹幕入 DOM 前已经水平居中', () => {
    expect(
      getDanmakuInitialTransform({ ...placement, item: { ...placement.item, mode: 'top' } }, 1280),
    ).toBe('translate3d(580px, 72px, 0)')
  })

  it('控制器空白区域可以拖动，交互控件不会触发拖动', () => {
    expect(canStartControllerDrag({ closest: () => null } as unknown as EventTarget)).toBe(true)
    expect(canStartControllerDrag({ closest: () => ({}) } as unknown as EventTarget)).toBe(false)
  })

  it('音量拖动按指针位置计算并稳定限制在合法范围', () => {
    expect(volumeFromPointer(150, 100, 100)).toBe(0.5)
    expect(volumeFromPointer(50, 100, 100)).toBe(0)
    expect(volumeFromPointer(250, 100, 100)).toBe(1)
    expect(volumeFromPointer(150, 100, 0)).toBe(0)
  })
})
