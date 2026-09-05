import type {
  CompatibilityReason,
  HlsTimeline,
  MediaSourceFingerprint,
} from '@marchen/shared/media'
import type { KeyframeMetadata, KeyframeMetadataCache } from '../ffmpeg/keyframe-cache'
import { createKeyframeAlignedTimeline } from './hls-timeline'

export interface KeyframeExtractionResult {
  sourceStartTime: number
  duration: number
  durationReliable: boolean
  keyframes: number[]
}

export type KeyframeTimelineResolution =
  | {
      ok: true
      timeline: HlsTimeline
      extractor: KeyframeMetadata['extractor']
      cacheHit: boolean
      maximumGap: number
    }
  | {
      ok: false
      strategy: 'legacy-event' | 'transcode-video' | 'fail'
      reason: CompatibilityReason
      errors: string[]
    }

export interface ResolveKeyframeTimelineOptions {
  source: MediaSourceFingerprint
  inputPath: string
  targetSegmentDuration?: number
  metadataDeadlineMs?: number
  totalDeadlineMs?: number
  metadataMaximumGapSeconds?: number
  dynamicCopyMaximumGapSeconds?: number
  allowLegacyEventFallback?: boolean
  allowVideoTranscodeFallback?: boolean
  cache?: Pick<KeyframeMetadataCache, 'get' | 'set'>
  extractMatroska: (inputPath: string, signal: AbortSignal) => Promise<KeyframeExtractionResult>
  extractFfprobe: (signal: AbortSignal, timeoutMs: number) => Promise<KeyframeExtractionResult>
  signal?: AbortSignal
  now?: () => number
}

const maximumGap = (data: KeyframeExtractionResult): number => {
  let maximum = 0
  for (let index = 1; index < data.keyframes.length; index += 1) {
    maximum = Math.max(maximum, data.keyframes[index]! - data.keyframes[index - 1]!)
  }
  return Math.max(maximum, data.duration - data.keyframes.at(-1)!)
}

const qualityAccepted = (data: KeyframeExtractionResult, maximumGapSeconds: number): boolean =>
  data.durationReliable &&
  data.duration > 0 &&
  data.keyframes.length > 0 &&
  data.keyframes[0] === 0 &&
  maximumGap(data) <= maximumGapSeconds

const withDeadline = async <T>(
  action: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parent?: AbortSignal,
): Promise<T> => {
  if (parent?.aborted) throw parent.reason ?? new Error('cancelled')
  const controller = new AbortController()
  const onAbort = () => controller.abort(parent?.reason)
  parent?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(
    () => controller.abort(new Error('keyframe extraction timeout')),
    timeoutMs,
  )
  timer.unref()
  try {
    return await action(controller.signal)
  } finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', onAbort)
  }
}

const cacheMetadata = (
  data: KeyframeExtractionResult,
  extractor: KeyframeMetadata['extractor'],
): KeyframeMetadata => ({ ...data, extractor })

const failureStrategy = (
  options: ResolveKeyframeTimelineOptions,
): Extract<KeyframeTimelineResolution, { ok: false }> => ({
  ok: false,
  strategy:
    options.allowLegacyEventFallback !== false
      ? 'legacy-event'
      : options.allowVideoTranscodeFallback
        ? 'transcode-video'
        : 'fail',
  reason: {
    code: 'keyframe-timeline-unavailable',
    domain: 'video',
    source: 'runtime-error',
  },
  errors: [],
})

export const resolveKeyframeTimeline = async (
  options: ResolveKeyframeTimelineOptions,
): Promise<KeyframeTimelineResolution> => {
  const now = options.now ?? Date.now
  const startedAt = now()
  const targetSegmentDuration = options.targetSegmentDuration ?? 6
  const metadataMaximumGap = options.metadataMaximumGapSeconds ?? 12
  const dynamicMaximumGap = options.dynamicCopyMaximumGapSeconds ?? 30
  const errors: string[] = []

  const cached = await options.cache?.get(options.source)
  if (cached && qualityAccepted(cached, dynamicMaximumGap)) {
    return {
      ok: true,
      timeline: createKeyframeAlignedTimeline({
        sourceStartTime: cached.sourceStartTime,
        duration: cached.duration,
        keyframes: cached.keyframes,
        targetSegmentDuration,
      }),
      extractor: cached.extractor,
      cacheHit: true,
      maximumGap: maximumGap(cached),
    }
  }

  if (/\.(?:mkv|mka|webm)$/i.test(options.inputPath)) {
    try {
      const metadata = await withDeadline(
        (signal) => options.extractMatroska(options.inputPath, signal),
        options.metadataDeadlineMs ?? 2_000,
        options.signal,
      )
      if (qualityAccepted(metadata, metadataMaximumGap)) {
        await options.cache?.set(options.source, cacheMetadata(metadata, 'matroska-metadata'))
        return {
          ok: true,
          timeline: createKeyframeAlignedTimeline({
            sourceStartTime: metadata.sourceStartTime,
            duration: metadata.duration,
            keyframes: metadata.keyframes,
            targetSegmentDuration,
          }),
          extractor: 'matroska-metadata',
          cacheHit: false,
          maximumGap: maximumGap(metadata),
        }
      }
      errors.push('matroska-metadata-quality-rejected')
    } catch (error) {
      if (options.signal?.aborted) throw error
      errors.push(error instanceof Error ? error.message : 'matroska-metadata-failed')
    }
  }

  const remaining = Math.max(1, (options.totalDeadlineMs ?? 8_000) - (now() - startedAt))
  try {
    const probed = await withDeadline(
      (signal) => options.extractFfprobe(signal, remaining),
      remaining,
      options.signal,
    )
    if (qualityAccepted(probed, dynamicMaximumGap)) {
      await options.cache?.set(options.source, cacheMetadata(probed, 'ffprobe'))
      return {
        ok: true,
        timeline: createKeyframeAlignedTimeline({
          sourceStartTime: probed.sourceStartTime,
          duration: probed.duration,
          keyframes: probed.keyframes,
          targetSegmentDuration,
        }),
        extractor: 'ffprobe',
        cacheHit: false,
        maximumGap: maximumGap(probed),
      }
    }
    errors.push('ffprobe-quality-rejected')
  } catch (error) {
    if (options.signal?.aborted) throw error
    errors.push(error instanceof Error ? error.message : 'ffprobe-failed')
  }

  const failure = failureStrategy(options)
  return { ...failure, errors }
}
