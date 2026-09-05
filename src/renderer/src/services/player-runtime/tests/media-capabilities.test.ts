import type { MediaProbeResult } from '@marchen/shared/media'
import { describe, expect, it, vi } from 'vitest'
import {
  probeContainerCapabilityEvidence,
  probeFmp4OutputCapability,
  probeFmp4HlsCapabilityEvidence,
  queryBrowserMediaCapabilities,
} from '../media-capabilities'

const probe: MediaProbeResult = {
  schemaVersion: 1,
  sourceFingerprint: {
    schemaVersion: 1,
    sourceId: 'hevc',
    pathKey: 'test-path',
    size: 1,
    mtimeMs: 1,
  },
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
  it('容器与 MSE capability 保留完整 evidence，未知性能维度不影响 supported', () => {
    expect(
      probeContainerCapabilityEvidence(probe, {
        canPlayType: () => 'probably',
      }),
    ).toEqual({
      supported: true,
      smooth: 'unknown',
      powerEfficient: 'unknown',
      source: 'can-play-type',
    })
    expect(
      probeFmp4HlsCapabilityEvidence(probe, {
        canPlayType: () => '',
        mediaSourceIsTypeSupported: () => true,
      }),
    ).toEqual({
      supported: true,
      smooth: 'unknown',
      powerEfficient: 'unknown',
      source: 'media-source',
    })
  })

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
      targetContainerSupported: 'unknown',
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

  it('EAC-3 不支持不得污染 HEVC fMP4 视频 copy 门禁', async () => {
    const eac3Probe: MediaProbeResult = {
      ...probe,
      formatNames: ['matroska'],
      streams: probe.streams.map((stream) =>
        stream.type === 'audio' ? { ...stream, codecName: 'eac3', codecString: 'ec-3' } : stream,
      ),
    }
    const queriedMseTypes: string[] = []
    const result = await queryBrowserMediaCapabilities(eac3Probe, {
      decodingInfo: async (configuration) => {
        const type = configuration.video?.contentType ?? configuration.audio?.contentType ?? ''
        const supported = !type.includes('ec-3')
        return { supported, smooth: supported, powerEfficient: supported, keySystemAccess: null }
      },
      canPlayType: (type) =>
        type.startsWith('video/x-matroska') ? '' : type.includes('hvc1') ? 'probably' : '',
      mediaSourceIsTypeSupported: (type) => {
        queriedMseTypes.push(type)
        return type.includes('hvc1') && !type.includes('ec-3')
      },
    })
    expect(queriedMseTypes).toEqual(['video/mp4; codecs="hvc1.2.4.L153.B0"'])
    expect(result).toMatchObject({
      containerSupported: false,
      targetContainerSupported: true,
      video: { supported: true },
      audio: { supported: false },
    })
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

  it.each([
    ['hevc', 'hvc1.2.4.L153.B0', 'aac', 'mp4a.40.2', true],
    ['av1', 'av01.0.08M.10', 'aac', 'mp4a.40.2', true],
    ['vp9', 'vp09.02.41.10', 'eac3', 'ec-3', false],
  ])(
    '用同一探测链处理 %s/%s 与 %s 组合',
    async (videoCodec, videoCodecString, audioCodec, audioCodecString, audioSupported) => {
      const input: MediaProbeResult = {
        ...probe,
        formatNames: ['matroska'],
        streams: probe.streams.map((stream) =>
          stream.type === 'video'
            ? { ...stream, codecName: videoCodec, codecString: videoCodecString }
            : {
                ...stream,
                codecName: audioCodec,
                codecString: audioCodecString,
              },
        ),
      }
      const queried: string[] = []
      const result = await queryBrowserMediaCapabilities(input, {
        decodingInfo: async (configuration) => {
          const type = configuration.video?.contentType ?? configuration.audio?.contentType ?? ''
          queried.push(type)
          const supported = !type.includes('ec-3')
          return {
            supported,
            smooth: supported ? false : true,
            powerEfficient: supported ? false : true,
            keySystemAccess: null,
          }
        },
        canPlayType: (type) => (type.startsWith('video/mp4') ? 'probably' : ''),
        mediaSourceIsTypeSupported: (type) => type.startsWith('video/mp4'),
      })

      expect(result.containerSupported).toBe(false)
      expect(result.targetContainerSupported).toBe(true)
      expect(result.video).toMatchObject({
        codecString: videoCodecString,
        supported: true,
        smooth: false,
        powerEfficient: false,
      })
      expect(result.audio?.supported).toBe(audioSupported)
      expect(queried).toEqual([
        `video/mp4; codecs="${videoCodecString}"`,
        `audio/mp4; codecs="${audioCodecString}"`,
      ])
    },
  )
})

describe('最终 fMP4 输出组合', () => {
  it('检查实际视频与音频组合，不把输入不支持音频当作输出', () => {
    const output = {
      ...probe,
      streams: probe.streams.map((stream) => ({
        ...stream,
        codecString: stream.type === 'video' ? 'avc1.640028' : 'mp4a.40.2',
      })),
    }
    const mse = vi.fn(() => true)
    expect(probeFmp4OutputCapability(output, { mediaSourceIsTypeSupported: mse }).supported).toBe(
      true,
    )
    expect(mse).toHaveBeenCalledWith('video/mp4; codecs="avc1.640028,mp4a.40.2"')
    expect(probeFmp4OutputCapability(output, { canPlayType: () => 'probably' }).supported).toBe(
      'unknown',
    )
  })
})
