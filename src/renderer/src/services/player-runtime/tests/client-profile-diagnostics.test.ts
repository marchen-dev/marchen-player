import type { ClientPlaybackProfile } from '@marchen/shared/media'
import { describe, expect, it } from 'vitest'
import { toClientPlaybackProfileDiagnostic } from '../client-profile-diagnostics'

describe('ClientPlaybackProfile 诊断快照', () => {
  it('只复制白名单字段并脱敏路径、token 与额外挂载的环境值', () => {
    const profile = {
      schemaVersion: 1,
      environment: 'electron',
      runtimeKey: 'electron:44:chromium:142:darwin',
      localCompatibilityAvailable: true,
      direct: {
        kind: 'direct',
        container: {
          containerNames: ['matroska'],
          contentType: 'video/x-matroska; note="/Users/test/private.mkv"',
          supported: false,
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
          contentType: 'video/mp4; source="/v2/media/private-token/index.m3u8"',
          supported: true,
          smooth: 'unknown',
          powerEfficient: 'unknown',
          source: 'media-source',
        },
        mediaSourceSupported: true,
        subtitles: [],
      },
      sourcePath: '/Volumes/private/video.mkv',
      gatewayToken: 'private-token',
      environmentSecret: 'secret-value',
    } as ClientPlaybackProfile & Record<string, unknown>

    const snapshot = toClientPlaybackProfileDiagnostic(profile)
    const serialized = JSON.stringify(snapshot)
    expect(snapshot).not.toHaveProperty('sourcePath')
    expect(snapshot).not.toHaveProperty('gatewayToken')
    expect(snapshot).not.toHaveProperty('environmentSecret')
    expect(serialized).not.toContain('/Users/test')
    expect(serialized).not.toContain('/Volumes/private')
    expect(serialized).not.toContain('private-token')
    expect(serialized).not.toContain('secret-value')
    expect(serialized).toContain('<local-path>')
    expect(serialized).toContain('<token>')
  })
})
