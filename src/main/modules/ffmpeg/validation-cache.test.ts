import type { MediaSourceFingerprint, PipelineFingerprint } from '@marchen/shared/media'
import { describe, expect, it, vi } from 'vitest'
import { createMediaValidationCacheKey, MediaValidationCache } from './validation-cache'

const source: MediaSourceFingerprint = {
  schemaVersion: 1,
  sourceId: 'hash',
  pathKey: 'path',
  size: 100,
  mtimeMs: 1,
}
const pipeline: PipelineFingerprint = { schemaVersion: 1, algorithm: 'sha256', value: 'pipe' }

describe('target probe/preflight cache', () => {
  it('key 包含源版本、轨道、target 与 pipeline', () => {
    const base = createMediaValidationCacheKey({
      source,
      videoStreamIndex: 0,
      audioStreamIndex: 1,
      target: 'fmp4-copy',
      pipeline,
    })
    expect(
      createMediaValidationCacheKey({
        source,
        videoStreamIndex: 0,
        audioStreamIndex: 2,
        target: 'fmp4-copy',
        pipeline,
      }),
    ).not.toBe(base)
    expect(
      createMediaValidationCacheKey({
        source: { ...source, mtimeMs: 2 },
        videoStreamIndex: 0,
        audioStreamIndex: 1,
        target: 'fmp4-copy',
        pipeline,
      }),
    ).not.toBe(base)
    expect(
      createMediaValidationCacheKey({
        source,
        videoStreamIndex: 0,
        audioStreamIndex: 1,
        target: 'fmp4-copy',
        pipeline: { ...pipeline, value: 'next' },
      }),
    ).not.toBe(base)
  })

  it('成功结果与并发请求复用', async () => {
    const cache = new MediaValidationCache<{ codec: string }>()
    const load = vi.fn(async () => ({ codec: 'hevc' }))
    const [first, second] = await Promise.all([
      cache.getOrCreate('key', load),
      cache.getOrCreate('key', load),
    ])
    expect(first).toBe(second)
    await cache.getOrCreate('key', load)
    expect(load).toHaveBeenCalledOnce()
  })

  it('失败只在短 TTL 内复用，过期后重新验证', async () => {
    let now = 0
    const cache = new MediaValidationCache<string>({
      failureTtlMs: 1_000,
      now: () => now,
    })
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('invalid init'))
      .mockResolvedValueOnce('recovered')

    await expect(cache.getOrCreate('key', load)).rejects.toThrow('invalid init')
    await expect(cache.getOrCreate('key', load)).rejects.toThrow('invalid init')
    expect(load).toHaveBeenCalledOnce()
    now = 1_001
    await expect(cache.getOrCreate('key', load)).resolves.toBe('recovered')
    expect(load).toHaveBeenCalledTimes(2)
  })
})
