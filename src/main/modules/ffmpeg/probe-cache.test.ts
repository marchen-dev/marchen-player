import type { MediaProbeResult, MediaSourceFingerprint } from '@marchen/shared/media'
import { describe, expect, it, vi } from 'vitest'
import { MediaProbeCache } from './probe-cache'

const fingerprint = (overrides: Partial<MediaSourceFingerprint> = {}): MediaSourceFingerprint => ({
  schemaVersion: 1,
  sourceId: 'hash',
  pathKey: 'path-key',
  size: 100,
  mtimeMs: 1,
  ...overrides,
})

const result = (sourceFingerprint: MediaSourceFingerprint): MediaProbeResult => ({
  schemaVersion: 1,
  sourceFingerprint,
  sourceId: sourceFingerprint.sourceId,
  formatNames: ['matroska'],
  startTime: 0,
  duration: 10,
  streams: [],
})

describe('媒体 probe cache', () => {
  it('复用同一文件版本并合并并发请求', async () => {
    const cache = new MediaProbeCache()
    const value = fingerprint()
    const load = vi.fn(async () => result(value))

    const [first, second] = await Promise.all([
      cache.getOrCreate(value, load),
      cache.getOrCreate(value, load),
    ])
    expect(first).toBe(second)
    expect(load).toHaveBeenCalledOnce()
    await cache.getOrCreate(value, load)
    expect(load).toHaveBeenCalledOnce()
  })

  it.each([
    ['size', { size: 101 }],
    ['mtime', { mtimeMs: 2 }],
    ['sourceId', { sourceId: 'next-hash' }],
  ])('%s 变化时不复用旧结果', async (_label, overrides) => {
    const cache = new MediaProbeCache()
    const first = fingerprint()
    const next = fingerprint(overrides)
    const load = vi.fn(async () => result(load.mock.calls.length === 1 ? first : next))
    await cache.getOrCreate(first, load)
    await cache.getOrCreate(next, load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('失败结果不进入缓存', async () => {
    const cache = new MediaProbeCache()
    const value = fingerprint()
    const load = vi
      .fn<() => Promise<MediaProbeResult>>()
      .mockRejectedValueOnce(new Error('probe failed'))
      .mockResolvedValueOnce(result(value))
    await expect(cache.getOrCreate(value, load)).rejects.toThrow('probe failed')
    await expect(cache.getOrCreate(value, load)).resolves.toMatchObject({ sourceId: 'hash' })
    expect(load).toHaveBeenCalledTimes(2)
  })
})
