import type { MediaProbeResult } from '@marchen/shared/media'
import { describe, expect, it, vi } from 'vitest'
import {
  buildClientPlaybackProfile,
  buildWebClientPlaybackProfile,
  ClientPlaybackProfileCache,
  createClientPlaybackRuntimeKey,
  queryMediaTrackCapabilityProfiles,
} from '../client-playback-profile'

const probe: MediaProbeResult = {
  schemaVersion: 1,
  sourceFingerprint: {
    schemaVersion: 1,
    sourceId: 'source',
    pathKey: 'path',
    size: 1,
    mtimeMs: 1,
  },
  sourceId: 'source',
  formatNames: ['matroska'],
  startTime: 0,
  duration: 60,
  bitRate: 8_000_000,
  primaryVideoStreamIndex: 0,
  primaryAudioStreamIndex: 1,
  streams: [
    {
      type: 'video',
      index: 0,
      codecName: 'av1',
      profile: 'Main',
      level: 8,
      bitDepth: 10,
      width: 3840,
      height: 2160,
      averageFrameRate: 24,
      dynamicRange: 'hdr10',
      disposition: { default: true, forced: false, attachedPicture: false },
      tags: {},
    },
    {
      type: 'audio',
      index: 1,
      codecName: 'flac',
      profile: 'native',
      bitDepth: 24,
      channels: 6,
      sampleRate: 96_000,
      disposition: { default: true, forced: false, attachedPicture: false },
      tags: {},
    },
  ],
}

describe('客户端轨道 capability profile', () => {
  it('使用 target probe codec string 查询并保留完整视频/音频条件', async () => {
    const decodingInfo = vi.fn(async (): Promise<MediaCapabilitiesDecodingInfo> => ({
      supported: true,
      smooth: false,
      powerEfficient: false,
      keySystemAccess: null,
    }))
    const result = await queryMediaTrackCapabilityProfiles(
      probe,
      { decodingInfo, canPlayType: () => '' },
      { videoCodecString: 'av01.0.08M.10', audioCodecString: 'fLaC' },
    )

    expect(result.video).toEqual({
      conditions: {
        codecName: 'av1',
        codecString: 'av01.0.08M.10',
        profile: 'Main',
        level: 8,
        bitDepth: 10,
        dynamicRange: 'hdr10',
        width: 3840,
        height: 2160,
        frameRate: 24,
      },
      decode: {
        codecString: 'av01.0.08M.10',
        supported: true,
        smooth: false,
        powerEfficient: false,
        source: 'media-capabilities',
      },
    })
    expect(result.audio?.conditions).toEqual({
      codecName: 'flac',
      codecString: 'fLaC',
      profile: 'native',
      channels: 6,
      sampleRate: 96_000,
      bitDepth: 24,
    })
    expect(decodingInfo).toHaveBeenCalledTimes(2)
  })

  it('静态与 target probe 都缺 codec string 时保持 unknown 且不查询解码 API', async () => {
    const decodingInfo = vi.fn()
    const result = await queryMediaTrackCapabilityProfiles(probe, { decodingInfo })
    expect(result.video?.decode).toMatchObject({ supported: 'unknown', source: 'unknown' })
    expect(result.audio?.decode).toMatchObject({ supported: 'unknown', source: 'unknown' })
    expect(decodingInfo).not.toHaveBeenCalled()
  })

  it('生成 Electron Direct/fMP4 Profile，并按 runtime 与媒体条件缓存', async () => {
    const decodingInfo = vi.fn(async (): Promise<MediaCapabilitiesDecodingInfo> => ({
      supported: true,
      smooth: true,
      powerEfficient: true,
      keySystemAccess: null,
    }))
    const runtime = {
      environment: 'electron' as const,
      platform: 'darwin-arm64',
      electronVersion: '44.0.0',
      chromiumVersion: '142.0.0',
    }
    const options = {
      runtime,
      localCompatibilityAvailable: true,
      dependencies: {
        decodingInfo,
        canPlayType: (type: string) =>
          type.startsWith('video/x-matroska') || type.startsWith('video/webm')
            ? ''
            : ('probably' as const),
        mediaSourceIsTypeSupported: () => true,
      },
      overrides: { videoCodecString: 'av01.0.08M.10', audioCodecString: 'fLaC' },
    }
    const cache = new ClientPlaybackProfileCache()
    const [first, second] = await Promise.all([
      cache.getOrCreate(probe, options),
      cache.getOrCreate(probe, options),
    ])

    expect(first).toBe(second)
    expect(first).toMatchObject({
      environment: 'electron',
      localCompatibilityAvailable: true,
      runtimeKey: 'electron:44.0.0:chromium:142.0.0:darwin-arm64',
      direct: { container: { supported: 'unknown', source: 'unknown' } },
      fmp4Hls: {
        container: { supported: true, source: 'media-source', mimeType: 'video/mp4' },
        mediaSourceSupported: true,
      },
    })
    expect(JSON.stringify(first)).not.toContain('path')
    expect(decodingInfo).toHaveBeenCalledTimes(2)

    await cache.getOrCreate(probe, {
      ...options,
      runtime: { ...runtime, chromiumVersion: '143.0.0' },
    })
    expect(decodingInfo).toHaveBeenCalledTimes(4)
    expect(createClientPlaybackRuntimeKey(runtime)).toContain('electron:44.0.0')
  })

  it('file 音频支持不覆盖 MSE 拒绝，target override 不改写原文件事实', async () => {
    const input = {
      ...probe,
      streams: probe.streams.map((stream) => ({
        ...stream,
        codecString: stream.type === 'video' ? 'av01.0.08M.10' : 'fLaC',
      })),
    }
    const decodingInfo = vi.fn(
      async (_config: MediaDecodingConfiguration): Promise<MediaCapabilitiesDecodingInfo> => ({
        supported: true,
        smooth: true,
        powerEfficient: true,
        keySystemAccess: null,
      }),
    )
    const profile = await buildClientPlaybackProfile(input, {
      runtime: {
        environment: 'electron',
        platform: 'darwin',
        electronVersion: '44',
        chromiumVersion: '142',
      },
      localCompatibilityAvailable: true,
      dependencies: {
        decodingInfo,
        canPlayType: () => 'probably',
        mediaSourceIsTypeSupported: (type) => !type.startsWith('audio/'),
      },
    })
    expect(profile.direct.audio?.decode.supported).toBe(true)
    expect(profile.fmp4Hls.audio?.decode).toMatchObject({
      supported: false,
      source: 'media-source',
    })
    expect(decodingInfo.mock.calls.some(([config]) => config.type === 'media-source')).toBe(true)
  })

  it('MSE API 缺失不借用 file 的 canPlayType 支持', async () => {
    const profile = await buildClientPlaybackProfile(probe, {
      runtime: {
        environment: 'electron',
        platform: 'darwin',
        electronVersion: '44',
        chromiumVersion: '142',
      },
      localCompatibilityAvailable: true,
      overrides: { audioCodecString: 'fLaC', videoCodecString: 'av01.0.08M.10' },
      dependencies: { canPlayType: () => 'probably' },
    })
    expect(profile.fmp4Hls.audio?.decode.supported).toBe('unknown')
    expect(profile.direct.audio?.conditions.codecString).toBeUndefined()
  })

  it('Web Profile 永远关闭本地兼容声明', async () => {
    const profile = await buildWebClientPlaybackProfile(probe, {
      platform: 'darwin',
      chromiumVersion: '142',
      dependencies: { canPlayType: () => '' },
    })
    expect(profile).toMatchObject({ environment: 'web', localCompatibilityAvailable: false })
  })
})
