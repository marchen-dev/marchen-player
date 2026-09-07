import { describe, expect, it, vi } from 'vitest'
import { DecodeRate, observeVideoDecoder } from '../decode-rate'

describe('实时解码速率', () => {
  it('使用墙钟窗口计数，停止解码后归零，倍速产生更多输出时自然升高', () => {
    const rate = new DecodeRate()
    expect(rate.sample(0, 0)).toBeUndefined()
    expect(rate.sample(12, 500)).toBeUndefined()
    expect(rate.sample(24, 1000)).toBe(24)
    expect(rate.sample(24, 1500)).toBe(12)
    expect(rate.sample(24, 2000)).toBe(0)
    rate.sample(48, 2500)
    expect(rate.sample(72, 3000)).toBe(48)
  })

  it('批量提前解码按实际输出计数，不依赖显示帧数', () => {
    const rate = new DecodeRate()
    rate.sample(0, 0)
    rate.sample(100, 250)
    rate.sample(100, 500)
    expect(rate.sample(100, 1000)).toBe(100)
    expect(rate.sample(100, 1250)).toBe(0)
  })

  it('来源切换、跳转重置和长时间后台挂起后重新采样', () => {
    const rate = new DecodeRate()
    rate.sample(100, 0)
    expect(rate.sample(124, 1000)).toBe(24)
    expect(rate.sample(0, 1500)).toBeUndefined()
    expect(rate.sample(24, 2500)).toBe(24)
    expect(rate.sample(200, 5000)).toBeUndefined()
    rate.reset()
    expect(rate.sample(240, 6000)).toBeUndefined()
    expect(rate.sample(Number.NaN, 6500)).toBeUndefined()
  })

  it('原生解码旁路保留回调、帧所有权与静态能力检测', () => {
    let options: VideoDecoderInit | undefined
    class FakeDecoder {
      static isConfigSupported = vi.fn()
      constructor(init: VideoDecoderInit) {
        options = init
      }
    }
    const onDecoded = vi.fn()
    const output = vi.fn()
    const error = vi.fn()
    const Observed = observeVideoDecoder(FakeDecoder as unknown as typeof VideoDecoder, onDecoded)
    const decoder = new Observed({ output, error })
    const frame = { close: vi.fn() } as unknown as VideoFrame
    expect(onDecoded).not.toHaveBeenCalled()
    options!.output(frame)
    expect(onDecoded).toHaveBeenCalledOnce()
    expect(output).toHaveBeenCalledExactlyOnceWith(frame)
    expect(frame.close).not.toHaveBeenCalled()
    expect(options!.error).toBe(error)
    expect(Observed.isConfigSupported).toBe(FakeDecoder.isConfigSupported)
    expect(decoder).toBeInstanceOf(FakeDecoder)
  })
})
