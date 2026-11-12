import {
  isPointerInsideWindow,
  resolveControllerVisibilityMode,
} from '@renderer/components/modules/player/controls/controller-visibility-math'
import { describe, expect, it } from 'vitest'

describe('控制栏离窗显隐', () => {
  it('顶部黑边和原生拖动区内的 leave 坐标仍在窗口中，边缘外才算离窗', () => {
    for (const point of [
      { x: 400, y: 20 },
      { x: 0, y: 0 },
      { x: 799, y: 79 },
    ]) {
      expect(isPointerInsideWindow(point, 800, 600)).toBe(true)
    }
    for (const point of [
      { x: -1, y: 20 },
      { x: 800, y: 20 },
      { x: 400, y: -1 },
      { x: 400, y: 600 },
    ]) {
      expect(isPointerInsideWindow(point, 800, 600)).toBe(false)
    }
  })
  it.each([true, false])('离窗时不受播放状态或遗留悬停锁影响（playing=%s）', (playing) => {
    expect(
      resolveControllerVisibilityMode({
        pointerInside: false,
        keepVisibleOutsideWindow: false,
        playing,
        locked: true,
      }),
    ).toBe('hidden')
  })

  it('在窗外结束拖动或关闭面板后立即隐藏', () => {
    const outside = { pointerInside: false, playing: false, locked: true }
    expect(resolveControllerVisibilityMode({ ...outside, keepVisibleOutsideWindow: true })).toBe(
      'visible',
    )
    expect(resolveControllerVisibilityMode({ ...outside, keepVisibleOutsideWindow: false })).toBe(
      'hidden',
    )
  })

  it('重新进入后播放恢复倒计时，暂停则保持显示', () => {
    const inside = { pointerInside: true, keepVisibleOutsideWindow: false, locked: false }
    expect(resolveControllerVisibilityMode({ ...inside, playing: true })).toBe('auto')
    expect(resolveControllerVisibilityMode({ ...inside, playing: false })).toBe('visible')
  })

  it('窗内悬停以及窗外键盘焦点保护都会保持显示', () => {
    expect(
      resolveControllerVisibilityMode({
        pointerInside: true,
        keepVisibleOutsideWindow: false,
        locked: true,
        playing: true,
      }),
    ).toBe('visible')
    expect(
      resolveControllerVisibilityMode({
        pointerInside: false,
        keepVisibleOutsideWindow: true,
        locked: true,
        playing: true,
      }),
    ).toBe('visible')
  })
})
