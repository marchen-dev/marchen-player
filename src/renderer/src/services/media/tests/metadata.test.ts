import type { Input } from 'mediabunny'
import { expect, it, vi } from 'vitest'
import { MediaMetadata } from '../metadata'

it('描述查询复用并保留未知时长，不触发解码探测', async () => {
  const getTracks = vi.fn(async () => [])
  const getDurationFromMetadata = vi.fn(async () => null)
  const metadata = new MediaMetadata({ getTracks, getDurationFromMetadata } as unknown as Input)
  const [a, b] = await Promise.all([metadata.describe(), metadata.describe()])
  expect(a).toBe(b)
  expect(a.duration).toBeNull()
  expect(getTracks).toHaveBeenCalledTimes(1)
  expect(await metadata.probeNative(5)).toBe('unknown')
})

it('帧率采样复用，保留分数帧率且不依赖解码支持', async () => {
  const computeFrameRateMetrics = vi.fn(async () => ({
    averageFrameRate: 24000 / 1001,
    probedPacketCount: 256,
  }))
  const metadata = new MediaMetadata({
    getPrimaryVideoTrack: async () => ({ computeFrameRateMetrics }),
  } as unknown as Input)
  expect(metadata.videoFrameRate).toBeUndefined()
  await Promise.all([metadata.readVideoFrameRate(), metadata.readVideoFrameRate()])
  expect(metadata.videoFrameRate).toBe(24000 / 1001)
  expect(computeFrameRateMetrics).toHaveBeenCalledExactlyOnceWith({ targetPacketCount: 256 })
})

it.each([
  { averageFrameRate: 24, probedPacketCount: 1 },
  { averageFrameRate: Number.NaN, probedPacketCount: 256 },
  { averageFrameRate: 0, probedPacketCount: 256 },
])('样本不足或无效帧率不产生显示值：%j', async (metrics) => {
  const metadata = new MediaMetadata({
    getPrimaryVideoTrack: async () => ({ computeFrameRateMetrics: async () => metrics }),
  } as unknown as Input)
  expect(await metadata.readVideoFrameRate()).toBeUndefined()
  expect(metadata.videoFrameRate).toBeUndefined()
})

it('来源关闭导致采样失败时静默降级', async () => {
  const metadata = new MediaMetadata({
    getPrimaryVideoTrack: async () => {
      throw new Error('来源已关闭')
    },
  } as unknown as Input)
  expect(await metadata.readVideoFrameRate()).toBeUndefined()
})
