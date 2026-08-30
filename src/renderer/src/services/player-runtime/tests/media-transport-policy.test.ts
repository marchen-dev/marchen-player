import type { PlaybackMode, PlaybackSourceLeaseDescriptor } from '@marchen/shared/media'
import { resolvePlaybackTransport } from '@marchen/shared/media'
import { describe, expect, it } from 'vitest'

const createLease = (mode: PlaybackMode): PlaybackSourceLeaseDescriptor => {
  const transport = resolvePlaybackTransport(mode)
  return {
    id: `lease:${mode}`,
    logicalSourceId: 'hash:episode-01',
    mode,
    transport,
    url:
      transport === 'custom-protocol'
        ? 'marchen:///library/episode-01.mkv'
        : `http://127.0.0.1:54321/v1/media/token/${mode}/index.m3u8`,
    timeline: { originalDuration: 1_200, offset: 0, calibrated: true },
  }
}

describe('第一阶段媒体传输策略', () => {
  it('普通 direct 默认保留内部协议，兼容计划统一使用 HLS Gateway', () => {
    expect(resolvePlaybackTransport('direct')).toBe('custom-protocol')
    expect(resolvePlaybackTransport('remux')).toBe('hls')
    expect(resolvePlaybackTransport('transcode-audio')).toBe('hls')
    expect(resolvePlaybackTransport('transcode-video')).toBe('hls')
  })

  it('gateway direct 只能由 lifecycle 的显式门禁切换', () => {
    expect(resolvePlaybackTransport('direct', 'gateway')).toBe('http-range')
    expect(resolvePlaybackTransport('transcode-video', 'gateway')).toBe('hls')
  })

  it('不同底层传输向业务层暴露相同的 lease descriptor', () => {
    const direct = createLease('direct')
    const compatible = createLease('transcode-audio')

    expect(Object.keys(direct).sort()).toEqual(Object.keys(compatible).sort())
    expect(direct).toMatchObject({ mode: 'direct', transport: 'custom-protocol' })
    expect(compatible).toMatchObject({ mode: 'transcode-audio', transport: 'hls' })
    expect(direct.timeline).toEqual(compatible.timeline)
  })
})
