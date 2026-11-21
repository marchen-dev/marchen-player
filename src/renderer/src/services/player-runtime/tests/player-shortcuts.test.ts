import { bindPlayerShortcuts } from '@renderer/components/modules/player/controls/usePlayerShortcuts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('播放器右方向键', () => {
  let unbind: () => void
  const seekBy = vi.fn()
  const restore = vi.fn()
  const startRightHold = vi.fn<() => (() => void) | undefined>()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    startRightHold.mockReturnValue(restore)
    vi.stubGlobal('HTMLElement', class {})
    vi.stubGlobal('window', Object.assign(new EventTarget(), { setTimeout, clearTimeout }))
    vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }))
    const root = Object.assign(new HTMLElement(), { isConnected: true })
    unbind = bindPlayerShortcuts({ current: root }, () => ({
      seekBy,
      startRightHold,
      togglePlayback: vi.fn(),
      changeVolume: vi.fn(),
      toggleMuted: vi.fn(),
    }))
  })

  afterEach(() => {
    unbind()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  const right = (type: 'keydown' | 'keyup', repeat = false) =>
    window.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), { key: 'ArrowRight', repeat }),
    )

  it('短按在松手时只快进一次', () => {
    right('keydown')
    vi.advanceTimersByTime(299)
    expect(seekBy).not.toHaveBeenCalled()
    right('keyup')
    vi.advanceTimersByTime(300)
    expect(seekBy.mock.calls).toEqual([[5]])
    expect(startRightHold).not.toHaveBeenCalled()
  })

  it('长按触发一次，松手恢复且不快进', () => {
    right('keydown')
    vi.advanceTimersByTime(300)
    expect(startRightHold).toHaveBeenCalledTimes(1)
    right('keydown', true)
    vi.advanceTimersByTime(300)
    expect(startRightHold).toHaveBeenCalledTimes(1)
    right('keyup')
    expect(restore).toHaveBeenCalledTimes(1)
    expect(seekBy).not.toHaveBeenCalled()
  })

  it('暂停时拒绝加速的长按松手也不会变成快进', () => {
    startRightHold.mockReturnValueOnce(undefined)
    right('keydown')
    vi.advanceTimersByTime(300)
    right('keyup')
    expect(restore).not.toHaveBeenCalled()
    expect(seekBy).not.toHaveBeenCalled()
  })

  it('失焦取消待触发的操作，并忽略复焦后的残留按键', () => {
    right('keydown')
    window.dispatchEvent(new Event('blur'))
    right('keydown', true)
    vi.advanceTimersByTime(300)
    right('keyup')
    expect(startRightHold).not.toHaveBeenCalled()
    expect(seekBy).not.toHaveBeenCalled()
  })

  it('解绑时立即恢复倍速，后续松手不会重复恢复', () => {
    right('keydown')
    vi.advanceTimersByTime(300)
    unbind()
    expect(restore).toHaveBeenCalledTimes(1)
    right('keyup')
    expect(restore).toHaveBeenCalledTimes(1)
  })
})
