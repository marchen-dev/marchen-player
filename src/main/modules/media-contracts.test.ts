import type {
  ClientPlaybackProfile,
  PlaybackDecision,
  WebClientPlaybackProfile,
} from '@marchen/shared/media'
import {
  isCompatibilityReasonCode,
  sortCompatibilityReasons,
  toPublicMediaCompatError,
} from '@marchen/shared/media'
import { describe, expect, expectTypeOf, it } from 'vitest'

type InvalidDirectDecision = {
  method: 'direct-play'
  trial: false
  container: { action: 'remux'; target: 'fmp4-hls' }
  video: { action: 'copy'; streamIndex: 0; sourceCodec: 'hevc' }
  subtitle: { action: 'external-render' }
  reasons: []
}

type InvalidWebProfile = Omit<WebClientPlaybackProfile, 'localCompatibilityAvailable'> & {
  localCompatibilityAvailable: true
}

const webProfile: ClientPlaybackProfile = {
  schemaVersion: 1,
  environment: 'web',
  runtimeKey: 'web-test',
  localCompatibilityAvailable: false,
  direct: {
    kind: 'direct',
    container: {
      containerNames: ['mp4'],
      supported: true,
      smooth: 'unknown',
      powerEfficient: 'unknown',
      source: 'can-play-type',
    },
    subtitles: [],
  },
  fmp4Hls: {
    kind: 'fmp4-hls',
    container: {
      containerNames: ['mp4'],
      mimeType: 'video/mp4',
      supported: true,
      smooth: 'unknown',
      powerEfficient: 'unknown',
      source: 'media-source',
    },
    mediaSourceSupported: true,
    subtitles: [],
  },
}

describe('通用媒体共享契约', () => {
  it('在类型层拒绝 method 与动作、Web 与本地后端的非法组合', () => {
    expectTypeOf<InvalidDirectDecision>().not.toMatchTypeOf<PlaybackDecision>()
    expectTypeOf<InvalidWebProfile>().not.toMatchTypeOf<ClientPlaybackProfile>()
  })

  it('客户端 Profile 可安全序列化且 Web 不声明本地兼容', () => {
    const serialized = JSON.parse(JSON.stringify(webProfile)) as ClientPlaybackProfile
    expect(serialized).toMatchObject({ environment: 'web', localCompatibilityAvailable: false })
  })

  it('错误公开副本保留阶段并脱敏 token、Unix 与 Windows 路径', () => {
    const result = toPublicMediaCompatError({
      code: 'pipeline-preflight-failed',
      stage: 'pipeline-preflight',
      message: '读取 /Users/test/Movies/private.mkv 失败',
      cause: 'GET /v2/media/super-secret-token/segments/1.m4s',
      stderrTail: 'C:\\Users\\test\\video.mkv: Invalid data',
      recoverable: true,
    })

    expect(result.stage).toBe('pipeline-preflight')
    expect(JSON.stringify(result)).not.toContain('super-secret-token')
    expect(JSON.stringify(result)).not.toContain('/Users/test')
    expect(JSON.stringify(result)).not.toContain('C:\\Users')
    expect(JSON.stringify(result)).toContain('<local-path>')
  })

  it('兼容原因代码使用封闭词汇表', () => {
    expect(isCompatibilityReasonCode('video-codec-not-supported')).toBe(true)
    expect(isCompatibilityReasonCode('arbitrary-private-reason')).toBe(false)
  })

  it('兼容原因去重并按视频、音频、字幕、容器、runtime 排序', () => {
    const sorted = sortCompatibilityReasons([
      { code: 'ffmpeg-encoder-unavailable', domain: 'runtime', source: 'ffmpeg-runtime' },
      { code: 'container-remux-required', domain: 'container', source: 'client-profile' },
      {
        code: 'audio-codec-not-supported',
        domain: 'audio',
        source: 'client-profile',
        streamIndex: 1,
      },
      {
        code: 'video-codec-not-supported',
        domain: 'video',
        source: 'client-profile',
        streamIndex: 0,
      },
      {
        code: 'video-codec-not-supported',
        domain: 'video',
        source: 'client-profile',
        streamIndex: 0,
      },
    ])
    expect(sorted.map((item) => item.code)).toEqual([
      'video-codec-not-supported',
      'audio-codec-not-supported',
      'container-remux-required',
      'ffmpeg-encoder-unavailable',
    ])
  })
})
