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
  })
})
