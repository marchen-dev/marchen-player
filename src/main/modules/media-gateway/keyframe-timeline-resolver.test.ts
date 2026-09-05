import type { MediaSourceFingerprint } from '@marchen/shared/media'
import { describe, expect, it, vi } from 'vitest'
import { resolveKeyframeTimeline } from './keyframe-timeline-resolver'

const source: MediaSourceFingerprint = {
  schemaVersion: 1,
  sourceId: 'hash',
  pathKey: 'path',
  size: 100,
  mtimeMs: 1,
}
const good = {
  sourceStartTime: 0,
  duration: 30,
  durationReliable: true,
  keyframes: [0, 10, 20],
}
const base = {
  source,
  inputPath: '/video.mkv',
  extractMatroska: vi.fn(async () => good),
  extractFfprobe: vi.fn(async () => good),
}

describe('关键帧 timeline resolver', () => {
  it('优先使用源指纹缓存，不启动 extractor', async () => {
    const cache = {
      get: vi.fn(async () => ({ ...good, extractor: 'ffprobe' as const })),
      set: vi.fn(),
    }
    const result = await resolveKeyframeTimeline({ ...base, cache })
    expect(result).toMatchObject({ ok: true, extractor: 'ffprobe', cacheHit: true })
    expect(base.extractMatroska).not.toHaveBeenCalled()
    expect(base.extractFfprobe).not.toHaveBeenCalled()
  })

  it('metadata 质量通过时写缓存并生成关键帧 timeline', async () => {
    const cache = { get: vi.fn(async () => undefined), set: vi.fn(async () => undefined) }
    const result = await resolveKeyframeTimeline({ ...base, cache })
    expect(result).toMatchObject({
      ok: true,
      extractor: 'matroska-metadata',
      timeline: { mode: 'keyframe-aligned-copy', duration: 30 },
    })
    expect(cache.set).toHaveBeenCalledWith(
      source,
      expect.objectContaining({ extractor: 'matroska-metadata', keyframes: [0, 10, 20] }),
    )
  })

  it('metadata 稀疏或时长不可靠时补充 ffprobe', async () => {
    const extractMatroska = vi.fn(async () => ({
      ...good,
      keyframes: [0, 22],
      durationReliable: true,
    }))
    const extractFfprobe = vi.fn(async () => good)
    const result = await resolveKeyframeTimeline({ ...base, extractMatroska, extractFfprobe })
    expect(result).toMatchObject({ ok: true, extractor: 'ffprobe', maximumGap: 10 })
    expect(extractFfprobe).toHaveBeenCalledOnce()
  })

  it('全部不可用时迁移期回退 legacy EVENT，不自动转码', async () => {
    const result = await resolveKeyframeTimeline({
      ...base,
      extractMatroska: async () => {
        throw new Error('cues missing')
      },
      extractFfprobe: async () => {
        throw new Error('probe timeout')
      },
    })
    expect(result).toMatchObject({
      ok: false,
      strategy: 'legacy-event',
      reason: { code: 'keyframe-timeline-unavailable' },
      errors: ['cues missing', 'probe timeout'],
    })
  })

  it('禁用 legacy 后按授权选择视频转码或终止', async () => {
    const failed = {
      ...base,
      inputPath: '/video.mp4',
      extractFfprobe: async () => ({ ...good, durationReliable: false }),
      allowLegacyEventFallback: false,
    }
    await expect(
      resolveKeyframeTimeline({ ...failed, allowVideoTranscodeFallback: true }),
    ).resolves.toMatchObject({
      ok: false,
      strategy: 'transcode-video',
    })
    await expect(resolveKeyframeTimeline(failed)).resolves.toMatchObject({
      ok: false,
      strategy: 'fail',
    })
  })

  it('metadata 超时后进入 ffprobe，总期限仍有界', async () => {
    const result = await resolveKeyframeTimeline({
      ...base,
      metadataDeadlineMs: 5,
      totalDeadlineMs: 50,
      extractMatroska: (_path, signal) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
      extractFfprobe: async () => good,
    })
    expect(result).toMatchObject({ ok: true, extractor: 'ffprobe' })
  })
})
