import type { PlaybackSourceLeaseDescriptor } from '@marchen/shared/media'
import { describe, expect, it, vi } from 'vitest'
import { createPlaybackSourceLease } from '../platform/playback-lease'

const descriptor = (
  overrides: Partial<PlaybackSourceLeaseDescriptor>,
): PlaybackSourceLeaseDescriptor => ({
  id: 'lease',
  logicalSourceId: 'hash',
  mode: 'direct',
  transport: 'custom-protocol',
  url: 'marchen:///video.mkv',
  timeline: { originalDuration: 120, offset: 0, calibrated: true },
  ...overrides,
})

describe('createPlaybackSourceLease', () => {
  it.each([
    descriptor({}),
    descriptor({
      id: 'compatible',
      mode: 'transcode-video',
      transport: 'hls',
      url: 'http://127.0.0.1:1234/session/master.m3u8',
      sessionId: 'session',
      generation: 2,
    }),
  ])('对不同传输暴露同一 lease 形态并保证释放幂等', (value) => {
    const release = vi.fn()
    const lease = createPlaybackSourceLease(value, release)

    expect(lease.url).toBe(value.url)
    lease.release()
    lease.release()
    expect(release).toHaveBeenCalledOnce()
  })

  it('串行切换 generation，并让下一次 seek 使用最新 generation', async () => {
    const expected: number[] = []
    const lease = createPlaybackSourceLease(
      descriptor({
        mode: 'transcode-video',
        transport: 'hls',
        generation: 0,
        sessionId: 'session',
      }),
      vi.fn(),
      async (logicalTime, expectedGeneration) => {
        expected.push(expectedGeneration)
        return descriptor({
          mode: 'transcode-video',
          transport: 'hls',
          url: `http://127.0.0.1/g/${expectedGeneration + 1}/index.m3u8`,
          sessionId: 'session',
          generation: expectedGeneration + 1,
          timeline: { originalDuration: 120, offset: logicalTime, calibrated: true },
        })
      },
    )

    await Promise.all([lease.seek!(30), lease.seek!(60)])
    expect(expected).toEqual([0, 1])
    expect(lease).toMatchObject({ generation: 2, timeline: { offset: 60 } })
  })

  it('只用当前 generation 回执 attaching、playable 与结构化失败', async () => {
    const acknowledgements: Array<
      ['attaching' | 'playable' | 'failed', number, string | undefined]
    > = []
    const lease = createPlaybackSourceLease(
      descriptor({ mode: 'transcode-audio', transport: 'hls', generation: 3 }),
      vi.fn(),
      undefined,
      async (phase, generation, error) => {
        acknowledgements.push([phase, generation, error?.code])
      },
    )
    await lease.markAttaching?.()
    await lease.markPlayable?.()
    await lease.markFailed?.({
      code: 'decode-failed',
      stage: 'decode',
      message: '首帧解码失败',
      recoverable: true,
    })
    expect(acknowledgements).toEqual([
      ['attaching', 3, undefined],
      ['playable', 3, undefined],
      ['failed', 3, 'decode-failed'],
    ])
  })
})
