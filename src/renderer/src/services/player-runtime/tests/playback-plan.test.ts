import type {
  BrowserMediaCapabilities,
  MediaProbeResult,
  MediaVideoStream,
} from '@marchen/shared/media'
import { describe, expect, it } from 'vitest'
import { resolveForcedOutputProfile } from '../platform/development-overrides'
import { createNativeDecodeFallbackPlan, createPlaybackPlan } from '../playback-plan'

const playbackPlan = (...arguments_: Parameters<typeof createPlaybackPlan>) => {
  const result = createPlaybackPlan(...arguments_)
  if (!result.ok) throw new Error(result.error.message)
  return result.plan
}

const disposition = { default: true, forced: false, attachedPicture: false }

const fixture = (
  name: string,
  options: {
    formatNames?: string[]
    videoCodec?: string
    videoCodecString?: string
    bitDepth?: number
    dynamicRange?: MediaVideoStream['dynamicRange']
    audioCodec?: string
    audioCodecString?: string
    channels?: number
  } = {},
): MediaProbeResult => ({
  sourceId: name,
  formatNames: options.formatNames ?? ['mov', 'mp4'],
  startTime: 0,
  duration: 120,
  primaryVideoStreamIndex: 0,
  primaryAudioStreamIndex: 1,
  streams: [
    {
      index: 0,
      type: 'video',
      codecName: options.videoCodec ?? 'h264',
      codecString: options.videoCodecString ?? 'avc1.42c00d',
      width: 1920,
      height: 1080,
      bitDepth: options.bitDepth ?? 8,
      dynamicRange: options.dynamicRange ?? 'sdr',
      disposition,
      tags: {},
    },
    {
      index: 1,
      type: 'audio',
      codecName: options.audioCodec ?? 'aac',
      codecString: options.audioCodecString ?? 'mp4a.40.2',
      channels: options.channels ?? 2,
      sampleRate: 48_000,
      disposition,
      tags: {},
    },
  ],
})

const capabilities = (
  overrides: Partial<BrowserMediaCapabilities> = {},
): BrowserMediaCapabilities => ({
  containerSupported: true,
  video: {
    codecString: 'avc1.42c00d',
    supported: true,
    smooth: true,
    powerEfficient: true,
    source: 'media-capabilities',
  },
  audio: {
    codecString: 'mp4a.40.2',
    supported: true,
    smooth: true,
    powerEfficient: true,
    source: 'media-capabilities',
  },
  ...overrides,
  targetContainer: 'video/mp4',
  targetContainerSupported: overrides.targetContainerSupported ?? true,
})

describe('playbackPlan 样本矩阵', () => {
  it('原生 H.264 + AAC MP4 选择 native', () => {
    expect(playbackPlan(fixture('native-h264-aac.mp4'), capabilities())).toMatchObject({
      kind: 'native',
      reason: 'native-compatible',
      videoStreamIndex: 0,
      audioStreamIndex: 1,
    })
  })

  it('轨道兼容但 MKV 容器不兼容时选择 copy-video-aac', () => {
    const result = playbackPlan(
      fixture('hevc-main10-aac.mkv', {
        formatNames: ['matroska', 'webm'],
        videoCodec: 'hevc',
        videoCodecString: 'hvc1.2.4.L153.B0',
      }),
      capabilities({ containerSupported: false }),
    )
    expect(result).toMatchObject({
      kind: 'copy-video-aac',
      video: 'copy',
      audio: { codec: 'aac' },
      startupDeadlineMs: 8_000,
    })
  })

  it('h.264 可播放而 EAC-3 不兼容时只转音频', () => {
    const probe = fixture('h264-eac3-5.1.mkv', {
      formatNames: ['matroska', 'webm'],
      audioCodec: 'eac3',
      audioCodecString: 'ec-3',
      channels: 6,
    })
    const result = playbackPlan(
      probe,
      capabilities({
        containerSupported: false,
        audio: {
          codecString: 'ec-3',
          supported: false,
          smooth: 'unknown',
          powerEfficient: 'unknown',
          source: 'can-play-type',
        },
      }),
    )
    expect(result).toMatchObject({
      kind: 'copy-video-aac',
      video: 'copy',
      audio: { codec: 'aac', profile: 'aac_low', sampleRate: 48_000, channels: 2 },
    })
  })

  it('hEVC 受支持但不流畅且 EAC-3 不兼容时只转音频', () => {
    const probe = fixture('hevc-main10-eac3-5.1.mkv', {
      formatNames: ['matroska', 'webm'],
      videoCodec: 'hevc',
      videoCodecString: 'hvc1.2.4.L153.B0',
      bitDepth: 10,
      audioCodec: 'eac3',
      audioCodecString: 'ec-3',
      channels: 6,
    })
    const result = playbackPlan(
      probe,
      capabilities({
        video: {
          codecString: 'hvc1.2.4.L153.B0',
          supported: true,
          smooth: false,
          powerEfficient: false,
          source: 'media-capabilities',
        },
        audio: {
          codecString: 'ec-3',
          supported: false,
          smooth: 'unknown',
          powerEfficient: 'unknown',
          source: 'can-play-type',
        },
      }),
    )
    expect(result).toMatchObject({
      kind: 'copy-video-aac',
      video: 'copy',
      audio: { codec: 'aac', channels: 2 },
    })
  })

  it('未标记 Main10 SDR + FLAC 在目标 fMP4 明确支持时复制视频并转 AAC', () => {
    const result = playbackPlan(
      fixture('structure-main10-sdr-flac-long-gop.mkv', {
        formatNames: ['matroska'],
        videoCodec: 'hevc',
        videoCodecString: 'hvc1.2.4.L60.B0',
        bitDepth: 10,
        dynamicRange: 'unknown',
        audioCodec: 'flac',
        audioCodecString: 'flac',
      }),
      capabilities({
        containerSupported: false,
        video: {
          codecString: 'hvc1.2.4.L60.B0',
          supported: true,
          smooth: true,
          powerEfficient: true,
          source: 'media-capabilities',
        },
        audio: {
          codecString: 'flac',
          supported: false,
          smooth: 'unknown',
          powerEfficient: 'unknown',
          source: 'can-play-type',
        },
      }),
    )
    expect(result).toMatchObject({
      kind: 'copy-video-aac',
      video: 'copy',
      audio: { codec: 'aac', channels: 2 },
    })
  })

  it('目标 fMP4/MSE 能力 unknown 时不允许走视频复制优化档位', () => {
    const probe = fixture('unknown-target.mkv', {
      formatNames: ['matroska'],
      videoCodec: 'hevc',
      videoCodecString: 'hvc1.2.4.L60.B0',
      dynamicRange: 'unknown',
    })
    expect(
      playbackPlan(
        probe,
        capabilities({ containerSupported: false, targetContainerSupported: 'unknown' }),
        { toneMapToSdr: true },
      ).kind,
    ).toBe('safe-h264-aac-sdr')
  })
})

describe('hEVC 原生优先策略', () => {
  const hevcProbe = () =>
    fixture('hevc-main8-aac.mp4', {
      videoCodec: 'hevc',
      videoCodecString: 'hvc1.1.6.L60.B0',
    })

  const hevcCapability = (
    supported: true | false | 'unknown',
    smooth: true | false | 'unknown',
    powerEfficient: true | false | 'unknown',
  ) =>
    capabilities({
      video: {
        codecString: 'hvc1.1.6.L60.B0',
        supported,
        smooth,
        powerEfficient,
        source: supported === 'unknown' ? 'unknown' : 'media-capabilities',
      },
    })

  it.each([
    ['省电', true],
    ['不省电', false],
    ['省电能力未知', 'unknown'],
  ] as const)('supported 且 smooth 时即使%s也保持 native', (_label, powerEfficient) => {
    expect(playbackPlan(hevcProbe(), hevcCapability(true, true, powerEfficient)).kind).toBe(
      'native',
    )
  })

  it('能力未知时先尝试 native', () => {
    expect(playbackPlan(hevcProbe(), hevcCapability('unknown', 'unknown', 'unknown')).kind).toBe(
      'native',
    )
  })

  it('unknown 直放实际解码失败后生成一次强制 H.264 计划', () => {
    expect(
      createNativeDecodeFallbackPlan(hevcProbe(), hevcCapability('unknown', 'unknown', 'unknown'), {
        toneMapToSdr: true,
      }),
    ).toMatchObject({
      ok: true,
      plan: {
        kind: 'safe-h264-aac-sdr',
        reason: 'native-decode-failed',
        video: { codec: 'h264', toneMapToSdr: false },
      },
    })
  })

  it('明确不支持时选择视频转码', () => {
    expect(
      playbackPlan(hevcProbe(), hevcCapability(false, 'unknown', 'unknown')).kind,
    ).toBe('safe-h264-aac-sdr')
  })

  it('supported 为 true 时即使 smooth 为 false 也保持 native', () => {
    expect(playbackPlan(hevcProbe(), hevcCapability(true, false, false)).kind).toBe('native')
  })

  it('hEVC 轨道兼容但容器不兼容时选择 copy-video-aac', () => {
    const probe = hevcProbe()
    probe.formatNames = ['matroska', 'webm']
    expect(
      playbackPlan(probe, {
        ...hevcCapability(true, false, false),
        containerSupported: false,
      }),
    ).toMatchObject({ kind: 'copy-video-aac', video: 'copy', audio: { codec: 'aac' } })
  })
})

describe('开发态强制固定档位', () => {
  it('开发构建显式开启时强制生成视频转码计划', () => {
    expect(
      playbackPlan(fixture('native-h264-aac.mp4'), capabilities(), {
        toneMapToSdr: true,
        forceVideoTranscode: true,
      }),
    ).toMatchObject({
      kind: 'safe-h264-aac-sdr',
      video: { codec: 'h264', toneMapToSdr: false },
      audio: { codec: 'aac' },
    })
  })

  it.each([
    ['开发态未开启', { DEV: true, VITE_FORCE_VIDEO_TRANSCODE: '0' }, undefined],
    [
      '生产构建忽略新变量',
      { DEV: false, VITE_FORCE_TRANSCODE_PROFILE: 'audio' },
      undefined,
    ],
    [
      '开发构建强制音频档位',
      { DEV: true, VITE_FORCE_TRANSCODE_PROFILE: 'audio' },
      'copy-video-aac',
    ],
    [
      '开发构建强制安全档位',
      { DEV: true, VITE_FORCE_TRANSCODE_PROFILE: 'safe' },
      'safe-h264-aac-sdr',
    ],
    [
      '开发构建强制 HDR 档位',
      { DEV: true, VITE_FORCE_TRANSCODE_PROFILE: 'hdr-sdr' },
      'hdr-to-sdr-h264-aac',
    ],
    [
      '旧变量映射安全档位',
      { DEV: true, VITE_FORCE_VIDEO_TRANSCODE: '1' },
      'safe-h264-aac-sdr',
    ],
  ] as const)('%s', (_label, environment, expected) => {
    expect(resolveForcedOutputProfile(environment)).toBe(expected)
  })

  it('强制 audio 时仍要求视频具有可复制能力事实', () => {
    expect(
      playbackPlan(fixture('native-h264-aac.mp4'), capabilities(), {
        toneMapToSdr: true,
        forceProfile: 'copy-video-aac',
      }).kind,
    ).toBe('copy-video-aac')
  })

  it('强制 hdr-sdr 但输入没有 HDR 事实时返回明确错误', () => {
    expect(
      createPlaybackPlan(fixture('main10-unknown.mkv', { bitDepth: 10 }), capabilities(), {
        toneMapToSdr: true,
        forceProfile: 'hdr-to-sdr-h264-aac',
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'unsupported-video', profile: 'hdr-to-sdr-h264-aac' },
    })
  })
})

describe('aAC 兼容输出策略', () => {
  it.each([
    ['单声道保持单声道', 1, 1],
    ['双声道保持双声道', 2, 2],
    ['5.1 下混双声道', 6, 2],
  ] as const)('%s', (_label, inputChannels, outputChannels) => {
    const probe = fixture('audio-incompatible.mkv', {
      audioCodec: 'eac3',
      audioCodecString: 'ec-3',
      channels: inputChannels,
    })
    const result = playbackPlan(
      probe,
      capabilities({
        audio: {
          codecString: 'ec-3',
          supported: false,
          smooth: 'unknown',
          powerEfficient: 'unknown',
          source: 'can-play-type',
        },
      }),
    )
    expect(result).toMatchObject({
      kind: 'copy-video-aac',
      video: 'copy',
      audio: {
        codec: 'aac',
        profile: 'aac_low',
        sampleRate: 48_000,
        channels: outputChannels,
      },
    })
  })
})

describe('hDR 与高位深门禁', () => {
  const incompatibleHdrProbe = () =>
    fixture('hevc-main10-hdr-aac.mkv', {
      videoCodec: 'hevc',
      videoCodecString: 'hvc1.2.4.L153.B0',
      bitDepth: 10,
      dynamicRange: 'hdr10',
    })
  const incompatibleHevcCapabilities = capabilities({
    video: {
      codecString: 'hvc1.2.4.L153.B0',
      supported: false,
      smooth: 'unknown',
      powerEfficient: 'unknown',
      source: 'media-capabilities',
    },
  })

  it('zscale/tonemap 能力完整时生成显式 SDR tone-map 计划', () => {
    const result = createPlaybackPlan(incompatibleHdrProbe(), incompatibleHevcCapabilities, {
      toneMapToSdr: true,
    })
    expect(result).toMatchObject({
      ok: true,
      plan: {
        kind: 'hdr-to-sdr-h264-aac',
        video: { codec: 'h264', toneMapToSdr: true },
      },
    })
  })

  it('tone-map 链缺失时返回结构化不支持错误', () => {
    expect(createPlaybackPlan(incompatibleHdrProbe(), incompatibleHevcCapabilities)).toEqual({
      ok: false,
      error: {
        code: 'tone-map-unavailable',
        stage: 'planning',
        message: '当前 FFmpeg 运行时缺少 HDR 转 SDR 所需的 zscale 与 tonemap 能力',
        recoverable: false,
        profile: 'hdr-to-sdr-h264-aac',
      },
    })
  })

  it.each([
    ['明确 10-bit SDR', 'sdr'],
    ['色彩事实不足的 10-bit', 'unknown'],
  ] as const)('%s 选择安全 8-bit 档位但不 tone-map', (_label, dynamicRange) => {
    const result = playbackPlan(
      fixture('main10-sdr.mkv', {
        videoCodec: 'hevc',
        videoCodecString: 'hvc1.2.4.L120.B0',
        bitDepth: 10,
        dynamicRange,
      }),
      incompatibleHevcCapabilities,
      { toneMapToSdr: true },
    )
    expect(result).toMatchObject({
      kind: 'safe-h264-aac-sdr',
      video: { codec: 'h264', pixelFormat: 'yuv420p', toneMapToSdr: false },
    })
  })

  it('hLG 与 HDR10 一样进入明确 tone-map 档位', () => {
    const result = playbackPlan(
      fixture('hlg.mkv', {
        videoCodec: 'hevc',
        videoCodecString: 'hvc1.2.4.L120.B0',
        bitDepth: 10,
        dynamicRange: 'hlg',
      }),
      incompatibleHevcCapabilities,
      { toneMapToSdr: true },
    )
    expect(result.kind).toBe('hdr-to-sdr-h264-aac')
  })

  it('dolby Vision 不复用静态 HDR tone-map 参数', () => {
    expect(
      createPlaybackPlan(
        fixture('dolby-vision.mkv', {
          videoCodec: 'hevc',
          videoCodecString: 'dvh1.08.06',
          bitDepth: 10,
          dynamicRange: 'dolby-vision',
        }),
        incompatibleHevcCapabilities,
        { toneMapToSdr: true },
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'unsupported-video', stage: 'planning' },
    })
  })
})
