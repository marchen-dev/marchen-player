import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FfmpegProcessExecutor } from '../ffmpeg/executor'
import { extractKeyframesWithFfprobe } from '../ffmpeg/ffprobe-keyframes'
import { KeyframeMetadataCache } from '../ffmpeg/keyframe-cache'
import { extractMatroskaKeyframes } from '../ffmpeg/matroska-keyframes'
import { FfmpegTaskScheduler } from '../ffmpeg/scheduler'
import { createMediaSourceFingerprint } from '../ffmpeg/source-fingerprint'
import { resolveKeyframeTimeline } from './keyframe-timeline-resolver'

const runtimeDirectory = resolve('resources', 'ffmpeg', `${process.platform}-${process.arch}`)
const suffix = process.platform === 'win32' ? '.exe' : ''
const ffprobe = join(runtimeDirectory, `ffprobe${suffix}`)
const fixtures = {
  longGop: resolve('test-results/media-compat/structure-main10-sdr-flac-long-gop.mkv'),
  vfrMkv: resolve('test-results/media-compat/structure-vfr-nonzero-start.mkv'),
  vfrMp4: resolve('test-results/media-compat/structure-h264-vfr-nonzero-start-long-gop.mp4'),
}
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

describe.runIf(existsSync(ffprobe) && Object.values(fixtures).every((path) => existsSync(path)))(
  '关键帧 resolver 真实矩阵',
  () => {
    const resolveFixture = async (path: string, sourceId: string, cache: KeyframeMetadataCache) => {
      const executor = new FfmpegProcessExecutor()
      const scheduler = new FfmpegTaskScheduler()
      return resolveKeyframeTimeline({
        source: await createMediaSourceFingerprint(path, sourceId),
        inputPath: path,
        cache,
        extractMatroska: extractMatroskaKeyframes,
        extractFfprobe: (signal, timeoutMs) =>
          extractKeyframesWithFfprobe({
            ffprobe,
            executor,
            scheduler,
            inputPath: path,
            videoStreamIndex: 0,
            signal,
            timeoutMs,
          }),
      })
    }

    it('长 GOP MKV 使用 metadata，segment 起点关键帧对齐且尾段完整', async () => {
      const root = await mkdtemp(join(tmpdir(), 'marchen-keyframe-integration-'))
      temporaryDirectories.push(root)
      const result = await resolveFixture(
        fixtures.longGop,
        'long-gop',
        new KeyframeMetadataCache(root),
      )
      expect(result).toMatchObject({
        ok: true,
        extractor: 'matroska-metadata',
        timeline: {
          sourceStartTime: 0,
          duration: 30,
          mode: 'keyframe-aligned-copy',
        },
      })
      if (!result.ok) return
      expect(result.timeline.segments.map((segment) => segment.startTime)).toEqual([0, 10, 20])
      expect(result.timeline.segments.at(-1)?.tail).toBe(true)
    })

    it('VFR/非零起点 MKV 补扫 ffprobe，MP4 直接 ffprobe', async () => {
      const root = await mkdtemp(join(tmpdir(), 'marchen-keyframe-vfr-'))
      temporaryDirectories.push(root)
      const cache = new KeyframeMetadataCache(root)
      const mkv = await resolveFixture(fixtures.vfrMkv, 'vfr-mkv', cache)
      const mp4 = await resolveFixture(fixtures.vfrMp4, 'vfr-mp4', cache)
      expect(mkv).toMatchObject({
        ok: true,
        extractor: 'ffprobe',
        timeline: { sourceStartTime: 5, duration: 29.966 },
      })
      expect(mp4).toMatchObject({
        ok: true,
        extractor: 'ffprobe',
        timeline: { sourceStartTime: 5, duration: 29.966667 },
      })
    })

    it('第二次解析命中持久缓存，不再调用 extractor', async () => {
      const root = await mkdtemp(join(tmpdir(), 'marchen-keyframe-hit-'))
      temporaryDirectories.push(root)
      const cache = new KeyframeMetadataCache(root)
      await resolveFixture(fixtures.longGop, 'cache-hit', cache)
      const source = await createMediaSourceFingerprint(fixtures.longGop, 'cache-hit')
      const extractMatroska = vi.fn()
      const extractFfprobe = vi.fn()
      const cached = await resolveKeyframeTimeline({
        source,
        inputPath: fixtures.longGop,
        cache,
        extractMatroska,
        extractFfprobe,
      })
      expect(cached).toMatchObject({ ok: true, cacheHit: true })
      expect(extractMatroska).not.toHaveBeenCalled()
      expect(extractFfprobe).not.toHaveBeenCalled()
    })
  },
)
