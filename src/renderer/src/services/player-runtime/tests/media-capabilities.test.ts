import type { MediaProbeResult } from '@marchen/shared/media'
import { describe, expect, it, vi } from 'vitest'
import { queryBrowserMediaCapabilities } from '../media-capabilities'

const probe: MediaProbeResult = {
  sourceId: 'hevc',
  formatNames: ['mov', 'mp4'],
  startTime: 0,
  duration: 120,
  bitRate: 8_000_000,
  primaryVideoStreamIndex: 0,
  primaryAudioStreamIndex: 1,
  streams: [
    {
      index: 0,
      type: 'video',
      codecName: 'hevc',
      codecString: 'hvc1.2.4.L153.B0',
      width: 3840,
      height: 2160,
      averageFrameRate: 24,
      dynamicRange: 'hdr10',
      disposition: { default: true, forced: false, attachedPicture: false },
      tags: {},
    },
    {
      index: 1,
      type: 'audio',
      codecName: 'aac',
      codecString: 'mp4a.40.2',
      channels: 2,
      sampleRate: 48_000,
      bitRate: 192_000,
      disposition: { default: true, forced: false, attachedPicture: false },
      tags: {},
    },
  ],
}

describe('浏览器媒体能力查询', () => {
  it('使用完整 RFC 6381 codec string 查询视频和音频', async () => {
    const decodingInfo = vi.fn(
      async (
        _configuration: MediaDecodingConfiguration,
      ): Promise<MediaCapabilitiesDecodingInfo> => ({
        supported: true,
        smooth: false,
        powerEfficient: false,
        keySystemAccess: null,
      }),
    )
    const result = await queryBrowserMediaCapabilities(probe, {
      decodingInfo,
      canPlayType: () => 'probably',
    })
    expect(decodingInfo).toHaveBeenCalledTimes(2)
    expect(decodingInfo.mock.calls[0]![0].video?.contentType).toBe(
      'video/mp4; codecs="hvc1.2.4.L153.B0"',
    )
    expect(result).toMatchObject({
      containerSupported: true,
      targetContainer: 'video/mp4',
      targetContainerSupported: true,
      video: { supported: true, smooth: false, powerEfficient: false },
      audio: { supported: true },
    })
  })

  it('mediaCapabilities 异常时回退 canPlayType，并保留 unknown 性能事实', async () => {
    const result = await queryBrowserMediaCapabilities(probe, {
      decodingInfo: async () => {
        throw new Error('not available')
      },
      canPlayType: (type) => (type.includes('hvc1') ? '' : 'maybe'),
    })
    expect(result.video).toMatchObject({
      supported: false,
      smooth: 'unknown',
      powerEfficient: 'unknown',
      source: 'can-play-type',
    })
  })

  it('mKV 容器与轨道能力分开查询，允许兼容轨道只做 remux', async () => {
    const queried: string[] = []
    const result = await queryBrowserMediaCapabilities(
      { ...probe, formatNames: ['matroska', 'webm'] },
      {
        decodingInfo: async (configuration) => {
          const contentType = configuration.video?.contentType ?? configuration.audio?.contentType
          if (contentType) queried.push(contentType)
          return { supported: true, smooth: true, powerEfficient: false, keySystemAccess: null }
        },
        canPlayType: (type) => (type.startsWith('video/x-matroska') ? '' : 'probably'),
      },
    )
    expect(result.containerSupported).toBe(false)
    expect(queried).toEqual([
      'video/mp4; codecs="hvc1.2.4.L153.B0"',
      'audio/mp4; codecs="mp4a.40.2"',
    ])
    expect(result.video?.supported).toBe(true)
  })

  it('缺少目标 codec string 时显式返回 unknown，不调用轨道解码查询', async () => {
    const decodingInfo = vi.fn()
    const missingCodecProbe: MediaProbeResult = {
      ...probe,
      streams: probe.streams.map((stream) =>
        stream.type === 'video' ? { ...stream, codecString: undefined } : stream,
      ),
    }
    const result = await queryBrowserMediaCapabilities(missingCodecProbe, {
      decodingInfo,
      canPlayType: () => 'probably',
    })
    expect(decodingInfo).toHaveBeenCalledTimes(1)
    expect(result.containerSupported).toBe('unknown')
    expect(result.targetContainerSupported).toBe('unknown')
    expect(result.video).toEqual({
      supported: 'unknown',
      smooth: 'unknown',
      powerEfficient: 'unknown',
      source: 'unknown',
    })
  })
})
