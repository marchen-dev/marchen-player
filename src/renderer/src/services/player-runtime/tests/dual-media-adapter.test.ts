import type { MediaEvent } from '@marchen/playback-core'
import type { ReadyMediaPort } from '../adapters/dual-media-adapter'
import { Subject } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import { DualMediaAdapter } from '../adapters/dual-media-adapter'
import { canFallbackToCanvas } from '../engine-policy'

function fake(): ReadyMediaPort & { events: Subject<MediaEvent> } {
  const events = new Subject<MediaEvent>()
  return {
    events,
    events$: events.asObservable(),
    setSource: vi.fn(),
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    seek: vi.fn(),
    setRate: vi.fn(),
    setMuted: vi.fn(),
    setVolume: vi.fn(),
    waitForPlayableData: vi.fn(async () => {}),
    destroy: vi.fn(),
    getSnapshot: () => ({
      currentTime: 0,
      duration: 10,
      paused: true,
      seeking: false,
      ended: false,
      rate: 1,
      volume: 1,
      muted: false,
      buffered: [],
    }),
  }
}

describe('双内核媒体端口', () => {
  it('两种内核共用来源帧率，暂停和倍速不改变它，关闭后清空', () => {
    let frameRate: number | undefined = 24000 / 1001
    const adapter = new DualMediaAdapter(fake, vi.fn(), () => frameRate)
    adapter.setSource({ id: 'film', url: 'media' }, 1)
    adapter.setRate(2)
    adapter.pause()
    expect(adapter.getPresentation().videoFrameRate).toBe(24000 / 1001)
    adapter.setSource({ id: 'film', engine: 'canvas', resourceId: 'resource' }, 2)
    expect(adapter.getPresentation().videoFrameRate).toBe(24000 / 1001)
    frameRate = undefined
    adapter.setSource({ id: 'next', url: 'next' }, 3)
    expect(adapter.getPresentation().videoFrameRate).toBeUndefined()
    frameRate = 60
    adapter.setSource(null, 4)
    expect(adapter.getPresentation().videoFrameRate).toBeUndefined()
    adapter.destroy()
  })
  it('先销毁旧内核，迟到事件不进入新会话，并保留音量/静音/倍速', () => {
    const native = fake()
    const canvas = fake()
    const create = vi.fn((engine) => {
      if (engine === 'canvas') expect(native.destroy).toHaveBeenCalledOnce()
      return engine === 'native' ? native : canvas
    })
    const adapter = new DualMediaAdapter(create, vi.fn())
    const received: MediaEvent[] = []
    adapter.events$.subscribe((event) => received.push(event))
    adapter.setSource({ id: 'film', url: 'media' }, 1)
    adapter.setVolume(0.4)
    adapter.setMuted(true)
    adapter.setRate(1.5)
    adapter.setSource({ id: 'film', engine: 'canvas', resourceId: 'resource' }, 2)
    native.events.next({ type: 'load-start', sessionId: 1 })
    canvas.events.next({ type: 'load-start', sessionId: 2 })
    expect(received).toEqual([{ type: 'load-start', sessionId: 2 }])
    expect(canvas.setVolume).toHaveBeenCalledWith(0.4)
    expect(canvas.setMuted).toHaveBeenCalledWith(true)
    expect(canvas.setRate).toHaveBeenCalledWith(1.5)
    adapter.destroy()
    adapter.destroy()
    expect(canvas.destroy).toHaveBeenCalledOnce()
  })
  it('仅自动模式下的明确兼容错误有一次回退额度', () => {
    expect(canFallbackToCanvas('auto', 'native', false, { code: 'decode' })).toBe(true)
    for (const code of ['network', 'aborted', 'unknown', 'source-unavailable'] as const)
      expect(canFallbackToCanvas('auto', 'native', false, { code })).toBe(false)
    expect(canFallbackToCanvas('native', 'native', false, { code: 'decode' })).toBe(false)
    expect(canFallbackToCanvas('auto', 'canvas', false, { code: 'decode' })).toBe(false)
    expect(canFallbackToCanvas('auto', 'native', true, { code: 'decode' })).toBe(false)
  })
})
