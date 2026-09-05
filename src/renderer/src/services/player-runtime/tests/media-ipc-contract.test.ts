import { toMediaSessionIpcSnapshot } from '@marchen/shared/media'
import { describe, expect, it } from 'vitest'

describe('媒体会话 IPC 边界', () => {
  it('只输出会话与 lease 白名单字段，不暴露 Main 临时目录和进程信息', () => {
    const internal = {
      id: 'session',
      logicalSourceId: 'hash',
      mode: 'transcode-video' as const,
      status: 'ready' as const,
      activeGeneration: 3,
      decision: {
        method: 'transcode' as const,
        trial: false,
        container: { action: 'remux' as const, target: 'fmp4-hls' as const },
        video: {
          action: 'transcode' as const,
          streamIndex: 0,
          sourceCodec: 'hevc',
          targetCodec: 'h264' as const,
          pixelFormat: 'yuv420p' as const,
          toneMap: 'none' as const,
        },
        audio: {
          action: 'transcode' as const,
          streamIndex: 1,
          sourceCodec: 'eac3',
          targetCodec: 'aac' as const,
          profile: 'aac-low-complexity' as const,
          sampleRate: 48_000 as const,
          channels: 2 as const,
        },
        subtitle: { action: 'external-render' as const },
        reasons: [
          {
            code: 'video-codec-not-supported' as const,
            domain: 'video' as const,
            source: 'client-profile' as const,
          },
        ],
      },
      attemptMethods: ['direct-play' as const, 'transcode' as const],
      job: {
        id: 'job-private',
        sessionId: 'session',
        phase: 'producing' as const,
        pipeline: { schemaVersion: 1 as const, algorithm: 'sha256' as const, value: 'pipeline' },
        runtime: {
          videoDecoder: { name: 'hevc', class: 'software' as const },
          videoEncoder: { name: 'libx264', class: 'software' as const },
          audioEncoder: { name: 'aac', class: 'software' as const },
        },
        coverage: { startSegment: 0 },
        requestedStartTime: 0,
        activeRequestCount: 1,
        waiterCount: 0,
      },
      lease: {
        id: 'lease',
        logicalSourceId: 'hash',
        mode: 'transcode-video' as const,
        transport: 'hls' as const,
        url: 'http://127.0.0.1:3210/v1/media/token/g/3/index.m3u8',
        sessionId: 'session',
        generation: 3,
        timeline: { originalDuration: 120, offset: 10, calibrated: true },
      },
      temporaryDirectory: '/private/cache/session',
      processId: 12345,
    }

    const snapshot = toMediaSessionIpcSnapshot(internal)
    expect(snapshot).not.toHaveProperty('temporaryDirectory')
    expect(snapshot).not.toHaveProperty('processId')
    expect(snapshot.lease).toMatchObject({ sessionId: 'session', generation: 3 })
    expect(snapshot.decision).toMatchObject({ method: 'transcode' })
    expect(snapshot.job).toMatchObject({ phase: 'producing', activeRequestCount: 1 })
    expect(snapshot.decision).not.toBe(internal.decision)
    expect(snapshot.job).not.toBe(internal.job)
  })
})
