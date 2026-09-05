import type {
  ClientPlaybackProfile,
  FfmpegNegotiationCapabilities,
  InputMediaFacts,
  MediaDynamicRange,
} from '@marchen/shared/media'
import { describe, expect, it } from 'vitest'
import { negotiateMediaCompatibility } from '../compatibility-negotiator'

const facts: InputMediaFacts = {
  schemaVersion: 1,
  sourceFingerprint: { schemaVersion: 1, sourceId: 'hash', pathKey: 'path', size: 1, mtimeMs: 1 },
  sourceId: 'hash',
  formatNames: ['mp4'],
  startTime: 0,
  duration: 10,
  primaryVideoStreamIndex: 0,
  primaryAudioStreamIndex: 1,
  streams: [
    {
      type: 'video',
      index: 0,
      codecName: 'h264',
      width: 1920,
      height: 1080,
      dynamicRange: 'sdr',
      disposition: { default: true, forced: false, attachedPicture: false },
      tags: {},
    },
    {
      type: 'audio',
      index: 1,
      codecName: 'aac',
      channels: 2,
      disposition: { default: true, forced: false, attachedPicture: false },
      tags: {},
    },
  ],
}

const evidence = {
  supported: true as const,
  smooth: true as const,
  powerEfficient: true as const,
  source: 'media-capabilities' as const,
}
const client: ClientPlaybackProfile = {
  schemaVersion: 1,
  environment: 'electron',
  runtimeKey: 'runtime',
  localCompatibilityAvailable: true,
  direct: {
    kind: 'direct',
    container: { containerNames: ['mp4'], ...evidence },
    video: {
      conditions: { codecName: 'h264', dynamicRange: 'sdr', width: 1920, height: 1080 },
      decode: evidence,
    },
    audio: { conditions: { codecName: 'aac', channels: 2 }, decode: evidence },
    subtitles: [],
  },
  fmp4Hls: {
    kind: 'fmp4-hls',
    container: { containerNames: ['mp4'], mimeType: 'video/mp4', ...evidence },
    mediaSourceSupported: true,
    video: {
      conditions: { codecName: 'h264', dynamicRange: 'sdr', width: 1920, height: 1080 },
      decode: evidence,
    },
    audio: { conditions: { codecName: 'aac', channels: 2 }, decode: evidence },
    subtitles: [],
  },
}
const ffmpeg: FfmpegNegotiationCapabilities = {
  available: true,
  decodableCodecs: ['h264', 'hevc', 'av1'],
  h264Output: true,
  aacOutput: true,
  fmp4HlsOutput: true,
  toneMapToSdr: true,
}

const unsupportedVideoCase = (codec = 'hevc', dynamicRange: MediaDynamicRange = 'sdr') => {
  const input: InputMediaFacts = {
    ...facts,
    streams: facts.streams.map((stream) =>
      stream.type === 'video' ? { ...stream, codecName: codec, dynamicRange } : stream,
    ),
  }
  const video = client.direct.video
    ? {
        conditions: { ...client.direct.video.conditions, codecName: codec, dynamicRange },
        decode: { ...client.direct.video.decode, supported: false as const },
      }
    : undefined
  const profile: ClientPlaybackProfile = {
    ...client,
    direct: { ...client.direct, video },
    fmp4Hls: { ...client.fmp4Hls, video },
  }
  return { facts: input, client: profile }
}

describe('CompatibilityNegotiator', () => {
  it('强制 Full Transcode 并传递 decoder/encoder mode', () => {
    expect(
      negotiateMediaCompatibility({
        facts,
        client,
        ffmpeg,
        override: {
          source: 'development-environment',
          method: 'transcode',
          videoDecoderMode: 'software',
          videoEncoderMode: 'hardware',
          audioEncoderMode: 'system',
        },
      }),
    ).toMatchObject({
      ok: true,
      decision: {
        method: 'transcode',
        video: { decoderMode: 'software', encoderMode: 'hardware' },
      },
    })
  })

  it('是确定性的纯函数且不修改输入', () => {
    const before = JSON.stringify({ facts, client, ffmpeg })
    const first = negotiateMediaCompatibility({ facts, client, ffmpeg })
    const second = negotiateMediaCompatibility({ facts, client, ffmpeg })
    expect(first).toEqual(second)
    expect(first).toMatchObject({ ok: true, decision: { method: 'direct-play' } })
    expect(JSON.stringify({ facts, client, ffmpeg })).toBe(before)
  })

  it('缺少主视频时返回规划错误而不抛异常', () => {
    expect(
      negotiateMediaCompatibility({
        facts: { ...facts, primaryVideoStreamIndex: undefined },
        client,
        ffmpeg,
      }),
    ).toMatchObject({ ok: false, error: { code: 'probe-failed', stage: 'planning' } })
  })

  it('视频条件与当前事实不一致时不选择 Direct Play', () => {
    const mismatched: ClientPlaybackProfile = {
      ...client,
      direct: {
        ...client.direct,
        video: client.direct.video
          ? {
              ...client.direct.video,
              conditions: { ...client.direct.video.conditions, level: 51 },
            }
          : undefined,
      },
    }
    expect(negotiateMediaCompatibility({ facts, client: mismatched, ffmpeg })).toMatchObject({
      ok: true,
      decision: { method: 'direct-stream' },
    })
  })

  it('选中字幕无法交付时不选择 Direct Play，并显式 drop 该字幕', () => {
    const withSubtitle: InputMediaFacts = {
      ...facts,
      streams: [
        ...facts.streams,
        {
          type: 'subtitle',
          index: 2,
          codecName: 'hdmv_pgs_subtitle',
          disposition: { default: false, forced: false, attachedPicture: false },
          tags: {},
        },
      ],
    }
    const profile: ClientPlaybackProfile = {
      ...client,
      direct: {
        ...client.direct,
        subtitles: [
          {
            codecName: 'hdmv_pgs_subtitle',
            delivery: 'drop',
            supported: false,
            smooth: 'unknown',
            powerEfficient: 'unknown',
            source: 'platform-rule',
          },
        ],
      },
      fmp4Hls: {
        ...client.fmp4Hls,
        subtitles: [
          {
            codecName: 'hdmv_pgs_subtitle',
            delivery: 'drop',
            supported: false,
            smooth: 'unknown',
            powerEfficient: 'unknown',
            source: 'platform-rule',
          },
        ],
      },
    }
    expect(
      negotiateMediaCompatibility({
        facts: withSubtitle,
        client: profile,
        ffmpeg,
        selectedSubtitleStreamIndex: 2,
      }),
    ).toMatchObject({
      ok: true,
      decision: { method: 'direct-stream', subtitle: { action: 'drop', streamIndex: 2 } },
    })
  })

  it('容器不兼容但目标 fMP4 轨道兼容时纯 remux', () => {
    const profile: ClientPlaybackProfile = {
      ...client,
      direct: {
        ...client.direct,
        container: { ...client.direct.container, supported: false },
      },
    }
    expect(negotiateMediaCompatibility({ facts, client: profile, ffmpeg })).toMatchObject({
      ok: true,
      decision: {
        method: 'direct-stream',
        container: { action: 'remux', target: 'fmp4-hls' },
        video: { action: 'copy', sourceCodec: 'h264' },
        audio: { action: 'copy', sourceCodec: 'aac' },
      },
    })
  })

  it('视频可 copy、源音频不兼容时只转 AAC', () => {
    const eacFacts: InputMediaFacts = {
      ...facts,
      streams: facts.streams.map((stream) =>
        stream.type === 'audio' ? { ...stream, codecName: 'eac3', channels: 6 } : stream,
      ),
    }
    const profile: ClientPlaybackProfile = {
      ...client,
      direct: {
        ...client.direct,
        container: { ...client.direct.container, supported: false },
        audio: client.direct.audio
          ? {
              conditions: { ...client.direct.audio.conditions, codecName: 'eac3', channels: 6 },
              decode: { ...client.direct.audio.decode, supported: false },
            }
          : undefined,
      },
      fmp4Hls: {
        ...client.fmp4Hls,
        audio: client.fmp4Hls.audio
          ? {
              conditions: { ...client.fmp4Hls.audio.conditions, codecName: 'eac3', channels: 6 },
              decode: { ...client.fmp4Hls.audio.decode, supported: false },
            }
          : undefined,
      },
    }
    expect(negotiateMediaCompatibility({ facts: eacFacts, client: profile, ffmpeg })).toMatchObject(
      {
        ok: true,
        decision: {
          method: 'direct-stream',
          video: { action: 'copy', sourceCodec: 'h264' },
          audio: {
            action: 'transcode',
            sourceCodec: 'eac3',
            targetCodec: 'aac',
            channels: 2,
          },
        },
      },
    )
  })

  it('Web 或本地 mux 后端不可用时不产生 Direct Stream', () => {
    const web: ClientPlaybackProfile = {
      ...client,
      environment: 'web',
      localCompatibilityAvailable: false,
      direct: { ...client.direct, container: { ...client.direct.container, supported: false } },
    }
    expect(negotiateMediaCompatibility({ facts, client: web, ffmpeg })).not.toMatchObject({
      ok: true,
      decision: { method: 'direct-stream' },
    })
    expect(
      negotiateMediaCompatibility({
        facts,
        client: {
          ...client,
          direct: { ...client.direct, container: { ...client.direct.container, supported: false } },
        },
        ffmpeg: { ...ffmpeg, fmp4HlsOutput: false },
      }),
    ).not.toMatchObject({ ok: true, decision: { method: 'direct-stream' } })
  })

  it.each(['hevc', 'av1', 'vp9', 'vc1', 'mpeg2video'])(
    '%s 不受支持时走同一 H.264 兼容决策',
    (codec) => {
      const codecFacts: InputMediaFacts = {
        ...facts,
        streams: facts.streams.map((stream) =>
          stream.type === 'video' ? { ...stream, codecName: codec } : stream,
        ),
      }
      const unsupportedVideo = client.direct.video
        ? {
            conditions: { ...client.direct.video.conditions, codecName: codec },
            decode: { ...client.direct.video.decode, supported: false as const },
          }
        : undefined
      const profile: ClientPlaybackProfile = {
        ...client,
        direct: { ...client.direct, video: unsupportedVideo },
        fmp4Hls: { ...client.fmp4Hls, video: unsupportedVideo },
      }

      expect(
        negotiateMediaCompatibility({
          facts: codecFacts,
          client: profile,
          ffmpeg: { ...ffmpeg, decodableCodecs: [codec] },
        }),
      ).toMatchObject({
        ok: true,
        decision: {
          method: 'transcode',
          video: {
            action: 'transcode',
            sourceCodec: codec,
            targetCodec: 'h264',
            pixelFormat: 'yuv420p',
            toneMap: 'none',
          },
          audio: { action: 'copy', sourceCodec: 'aac' },
          reasons: [{ code: 'video-codec-not-supported', inputValue: codec }],
        },
      })
    },
  )

  it('客户端不支持且 runtime 没有对应 decoder 时不生成转码决策', () => {
    const video = client.direct.video
      ? {
          ...client.direct.video,
          decode: { ...client.direct.video.decode, supported: false as const },
        }
      : undefined
    const profile: ClientPlaybackProfile = {
      ...client,
      direct: { ...client.direct, video },
      fmp4Hls: { ...client.fmp4Hls, video },
    }
    expect(
      negotiateMediaCompatibility({
        facts,
        client: profile,
        ffmpeg: { ...ffmpeg, decodableCodecs: [] },
      }),
    ).toMatchObject({ ok: false, error: { code: 'ffmpeg-decoder-unavailable' } })
  })

  it('视频转码时 EAC-3 音频独立转 AAC', () => {
    const input: InputMediaFacts = {
      ...facts,
      streams: facts.streams.map((stream) =>
        stream.type === 'video'
          ? { ...stream, codecName: 'hevc' }
          : { ...stream, codecName: 'eac3', channels: 6 },
      ),
    }
    const video = client.direct.video
      ? {
          conditions: { ...client.direct.video.conditions, codecName: 'hevc' },
          decode: { ...client.direct.video.decode, supported: false as const },
        }
      : undefined
    const audio = client.direct.audio
      ? {
          conditions: { ...client.direct.audio.conditions, codecName: 'eac3', channels: 6 },
          decode: { ...client.direct.audio.decode, supported: false as const },
        }
      : undefined
    const profile: ClientPlaybackProfile = {
      ...client,
      direct: { ...client.direct, video, audio },
      fmp4Hls: { ...client.fmp4Hls, video, audio },
    }
    expect(
      negotiateMediaCompatibility({
        facts: input,
        client: profile,
        ffmpeg,
      }),
    ).toMatchObject({
      ok: true,
      decision: {
        method: 'transcode',
        video: { action: 'transcode', sourceCodec: 'hevc' },
        audio: { action: 'transcode', sourceCodec: 'eac3', targetCodec: 'aac', channels: 2 },
      },
    })
  })

  it('视频转码时兼容 Opus 音频保持 copy', () => {
    const input: InputMediaFacts = {
      ...facts,
      streams: facts.streams.map((stream) =>
        stream.type === 'video'
          ? { ...stream, codecName: 'vp9' }
          : { ...stream, codecName: 'opus' },
      ),
    }
    const video = client.direct.video
      ? {
          conditions: { ...client.direct.video.conditions, codecName: 'vp9' },
          decode: { ...client.direct.video.decode, supported: false as const },
        }
      : undefined
    const audio = client.direct.audio
      ? {
          conditions: { ...client.direct.audio.conditions, codecName: 'opus' },
          decode: { ...client.direct.audio.decode, supported: true as const },
        }
      : undefined
    const profile: ClientPlaybackProfile = {
      ...client,
      direct: { ...client.direct, video, audio },
      fmp4Hls: { ...client.fmp4Hls, video, audio },
    }
    expect(
      negotiateMediaCompatibility({
        facts: input,
        client: profile,
        ffmpeg: { ...ffmpeg, decodableCodecs: [...ffmpeg.decodableCodecs, 'vp9'] },
      }),
    ).toMatchObject({
      ok: true,
      decision: {
        method: 'transcode',
        audio: { action: 'copy', sourceCodec: 'opus' },
      },
    })
  })

  it('无音频输入不会生成音频动作', () => {
    const input: InputMediaFacts = {
      ...facts,
      primaryAudioStreamIndex: undefined,
      streams: facts.streams
        .filter((stream) => stream.type !== 'audio')
        .map((stream) => ({
          ...stream,
          codecName: 'av1',
        })),
    }
    const video = client.direct.video
      ? {
          conditions: { ...client.direct.video.conditions, codecName: 'av1' },
          decode: { ...client.direct.video.decode, supported: false as const },
        }
      : undefined
    const profile: ClientPlaybackProfile = {
      ...client,
      direct: { ...client.direct, video, audio: undefined },
      fmp4Hls: { ...client.fmp4Hls, video, audio: undefined },
    }
    const result = negotiateMediaCompatibility({ facts: input, client: profile, ffmpeg })
    expect(result).toMatchObject({ ok: true, decision: { method: 'transcode' } })
    if (result.ok) expect(result.decision.audio).toBeUndefined()
  })

  it('能力 unknown 时先生成 Direct Play trial', () => {
    const unknown = {
      supported: 'unknown' as const,
      smooth: 'unknown' as const,
      powerEfficient: 'unknown' as const,
      source: 'unknown' as const,
    }
    const profile: ClientPlaybackProfile = {
      ...client,
      direct: {
        ...client.direct,
        container: { ...client.direct.container, ...unknown },
        video: client.direct.video ? { ...client.direct.video, decode: unknown } : undefined,
        audio: client.direct.audio ? { ...client.direct.audio, decode: unknown } : undefined,
      },
    }
    expect(negotiateMediaCompatibility({ facts, client: profile, ffmpeg })).toMatchObject({
      ok: true,
      decision: { method: 'direct-play', trial: true },
    })
  })

  it.each([
    [false, false],
    [false, 'unknown'],
    ['unknown', false],
  ] as const)(
    'supported=true 时 smooth=%s powerEfficient=%s 仍 Direct Play',
    (smooth, powerEfficient) => {
      const profile: ClientPlaybackProfile = {
        ...client,
        direct: {
          ...client.direct,
          video: client.direct.video
            ? {
                ...client.direct.video,
                decode: {
                  ...client.direct.video.decode,
                  supported: true,
                  smooth,
                  powerEfficient,
                },
              }
            : undefined,
        },
      }
      expect(negotiateMediaCompatibility({ facts, client: profile, ffmpeg })).toMatchObject({
        ok: true,
        decision: { method: 'direct-play', trial: false },
      })
    },
  )

  it('视频 supported=false 时不生成 Direct Play trial', () => {
    const video = client.direct.video
      ? {
          ...client.direct.video,
          decode: { ...client.direct.video.decode, supported: false as const },
        }
      : undefined
    const profile: ClientPlaybackProfile = {
      ...client,
      direct: { ...client.direct, video },
      fmp4Hls: { ...client.fmp4Hls, video },
    }
    const result = negotiateMediaCompatibility({ facts, client: profile, ffmpeg })
    expect(result).toMatchObject({ ok: true, decision: { method: 'transcode' } })
    if (result.ok) expect(result.decision.trial).toBe(false)
  })

  it.each([
    ['runtime', { available: false }, 'runtime-unavailable'],
    ['fmp4 mux', { fmp4HlsOutput: false }, 'ffmpeg-format-unavailable'],
    ['H.264 encoder', { h264Output: false }, 'ffmpeg-encoder-unavailable'],
    ['input decoder', { decodableCodecs: [] }, 'ffmpeg-decoder-unavailable'],
  ] as const)('%s 缺失时返回结构化规划错误', (_label, overrides, code) => {
    const input = unsupportedVideoCase()
    expect(
      negotiateMediaCompatibility({
        ...input,
        ffmpeg: { ...ffmpeg, ...overrides },
      }),
    ).toMatchObject({ ok: false, error: { code, stage: 'planning' } })
  })

  it('音频不可 copy 且 AAC encoder 缺失时失败，不静默丢音频', () => {
    const input = unsupportedVideoCase()
    const eacFacts: InputMediaFacts = {
      ...input.facts,
      streams: input.facts.streams.map((stream) =>
        stream.type === 'audio' ? { ...stream, codecName: 'eac3', channels: 6 } : stream,
      ),
    }
    const audio = input.client.direct.audio
      ? {
          conditions: { ...input.client.direct.audio.conditions, codecName: 'eac3', channels: 6 },
          decode: { ...input.client.direct.audio.decode, supported: false as const },
        }
      : undefined
    const profile: ClientPlaybackProfile = {
      ...input.client,
      direct: { ...input.client.direct, audio },
      fmp4Hls: { ...input.client.fmp4Hls, audio },
    }
    expect(
      negotiateMediaCompatibility({
        facts: eacFacts,
        client: profile,
        ffmpeg: { ...ffmpeg, aacOutput: false },
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: 'ffmpeg-encoder-unavailable',
        compatibilityReason: { domain: 'audio', inputValue: 'eac3', supportedValue: 'aac' },
      },
    })
  })

  it('Dolby Vision 不做未经验证的兼容转码', () => {
    expect(
      negotiateMediaCompatibility({
        ...unsupportedVideoCase('hevc', 'dolby-vision'),
        ffmpeg,
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: 'video-range-not-supported',
        compatibilityReason: { code: 'video-range-not-supported', inputValue: 'dolby-vision' },
      },
    })
  })

  it.each(['hdr10', 'hlg'] as const)('%s 转码缺少 tone-map filter 时失败', (dynamicRange) => {
    expect(
      negotiateMediaCompatibility({
        ...unsupportedVideoCase('hevc', dynamicRange),
        ffmpeg: { ...ffmpeg, toneMapToSdr: false },
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: 'tone-map-unavailable',
        compatibilityReason: { code: 'ffmpeg-filter-unavailable' },
      },
    })
  })

  it('聚合视频、音频、字幕、容器原因并稳定排序', () => {
    const base = unsupportedVideoCase('hevc')
    const inputFacts: InputMediaFacts = {
      ...base.facts,
      streams: [
        ...base.facts.streams.map((stream) =>
          stream.type === 'audio' ? { ...stream, codecName: 'eac3', channels: 6 } : stream,
        ),
        {
          type: 'subtitle',
          index: 2,
          codecName: 'hdmv_pgs_subtitle',
          disposition: { default: false, forced: false, attachedPicture: false },
          tags: {},
        },
      ],
    }
    const audio = base.client.fmp4Hls.audio
      ? {
          conditions: { ...base.client.fmp4Hls.audio.conditions, codecName: 'eac3', channels: 6 },
          decode: { ...base.client.fmp4Hls.audio.decode, supported: false as const },
        }
      : undefined
    const subtitle = {
      codecName: 'hdmv_pgs_subtitle',
      delivery: 'drop' as const,
      supported: false as const,
      smooth: 'unknown' as const,
      powerEfficient: 'unknown' as const,
      source: 'platform-rule' as const,
    }
    const profile: ClientPlaybackProfile = {
      ...base.client,
      direct: {
        ...base.client.direct,
        container: { ...base.client.direct.container, supported: false },
        audio,
        subtitles: [subtitle],
      },
      fmp4Hls: { ...base.client.fmp4Hls, audio, subtitles: [subtitle] },
    }
    const result = negotiateMediaCompatibility({
      facts: inputFacts,
      client: profile,
      ffmpeg,
      selectedSubtitleStreamIndex: 2,
    })
    expect(result).toMatchObject({ ok: true, decision: { method: 'transcode' } })
    if (!result.ok) return
    expect(result.decision.reasons.map((item) => item.code)).toEqual([
      'video-codec-not-supported',
      'audio-codec-not-supported',
      'subtitle-not-supported',
      'container-remux-required',
    ])
  })

  it.each([
    ['h264', 'aac', true, true, true, 'direct-play', 'direct', 'direct'],
    ['hevc', 'aac', true, true, true, 'direct-play', 'direct', 'direct'],
    ['hevc', 'eac3', false, true, false, 'direct-stream', 'copy', 'transcode'],
    ['av1', 'aac', false, false, true, 'transcode', 'transcode', 'copy'],
    ['vp9', 'opus', false, false, true, 'transcode', 'transcode', 'copy'],
    ['vc1', 'flac', false, false, false, 'transcode', 'transcode', 'transcode'],
    ['mpeg2video', 'aac', false, false, true, 'transcode', 'transcode', 'copy'],
  ] as const)(
    '%s/%s → %s',
    (
      videoCodec,
      audioCodec,
      directContainerSupported,
      videoSupported,
      audioSupported,
      expectedMethod,
      expectedVideoAction,
      expectedAudioAction,
    ) => {
      const inputFacts: InputMediaFacts = {
        ...facts,
        formatNames: directContainerSupported ? ['mp4'] : ['matroska'],
        streams: facts.streams.map((stream) =>
          stream.type === 'video'
            ? { ...stream, codecName: videoCodec }
            : stream.type === 'audio'
              ? {
                  ...stream,
                  codecName: audioCodec,
                  channels: audioCodec === 'eac3' ? 6 : stream.channels,
                }
              : stream,
        ),
      }
      const video = client.direct.video
        ? {
            conditions: { ...client.direct.video.conditions, codecName: videoCodec },
            decode: { ...client.direct.video.decode, supported: videoSupported },
          }
        : undefined
      const audio = client.direct.audio
        ? {
            conditions: {
              ...client.direct.audio.conditions,
              codecName: audioCodec,
              channels: audioCodec === 'eac3' ? 6 : client.direct.audio.conditions.channels,
            },
            decode: { ...client.direct.audio.decode, supported: audioSupported },
          }
        : undefined
      const profile: ClientPlaybackProfile = {
        ...client,
        direct: {
          ...client.direct,
          container: {
            ...client.direct.container,
            supported: directContainerSupported,
          },
          video,
          audio,
        },
        fmp4Hls: { ...client.fmp4Hls, video, audio },
      }
      expect(
        negotiateMediaCompatibility({
          facts: inputFacts,
          client: profile,
          ffmpeg: { ...ffmpeg, decodableCodecs: [videoCodec] },
        }),
      ).toMatchObject({
        ok: true,
        decision: {
          method: expectedMethod,
          video: { action: expectedVideoAction },
          audio: { action: expectedAudioAction },
        },
      })
    },
  )
})
