import type { MediaGatewayRegistry } from './registry'
import { lstat, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { SegmentStore } from './segment-store'
import type { SegmentProducerOwner } from './segment-store'
import type { SegmentMediaRange } from './segment-media-inspector'
import type { InitFingerprint } from '@marchen/shared/media'
import type { InitFingerprintGuard } from '../ffmpeg/init-fingerprint'
import { MediaPipelineError } from './errors'

const timelineError = (message: string) =>
  new MediaPipelineError({
    code: 'hls-timeline-unavailable',
    stage: 'manifest-validation',
    message,
    recoverable: true,
  })

interface ParsedWorkingManifest {
  initName?: string
  segments: Array<{ name: string; duration: number }>
}

export interface DynamicHlsPublisherOptions {
  registry: MediaGatewayRegistry
  sessionId: string
  token: string
  outputDirectory: string
  store: SegmentStore
  owner?: SegmentProducerOwner
  inspectSegment: (initPath: string, segmentPath: string) => Promise<SegmentMediaRange>
  /** 数值容差与范围变化策略独立；没有已验证策略时严格检查计划边界。 */
  ptsToleranceSeconds: number
  requireAudio?: boolean
  acceptBoundaryChange?: (input: {
    index: number
    plannedStart: number
    plannedEnd: number
    actual: SegmentMediaRange
  }) => boolean
  validateReady?: (input: {
    manifestPath: string
    initPath: string
    firstSegmentPath: string
  }) => Promise<void>
  initFingerprintGuard: InitFingerprintGuard
  inspectInitFingerprint: (initPath: string) => Promise<InitFingerprint>
}

const safeName = (name: string): boolean =>
  basename(name) === name && /^[A-Za-z0-9][\w.-]{0,127}$/.test(name) && !name.endsWith('.tmp')

const parseManifest = (source: string): ParsedWorkingManifest => {
  const segments: ParsedWorkingManifest['segments'] = []
  let initName: string | undefined
  let duration: number | undefined
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    const map = line.match(/^#EXT-X-MAP:URI="([^"]+)"/)
    if (map) initName = map[1]
    else if (line.startsWith('#EXTINF:')) duration = Number(line.slice(8).split(',')[0])
    else if (line && !line.startsWith('#')) {
      if (!safeName(line)) throw new Error('Dynamic HLS 工作 manifest 引用了不安全资源')
      segments.push({ name: line, duration: duration ?? NaN })
      duration = undefined
    }
  }
  return { initName, segments }
}

const regularCompleteFile = async (path: string): Promise<number> => {
  const statistics = await lstat(path)
  if (!statistics.isFile() || statistics.isSymbolicLink() || statistics.size <= 0) {
    throw new Error('Dynamic HLS 资源不是完整普通文件')
  }
  return statistics.size
}

const segmentIndex = (name: string): number => {
  const match = name.match(/^segment-(\d+)\.m4s$/)
  const index = match ? Number(match[1]) : NaN
  if (!Number.isSafeInteger(index) || index < 0) throw new Error(`无效逻辑 segment 文件名：${name}`)
  return index
}

export class DynamicHlsPublisher {
  #validated = false

  constructor(private readonly options: DynamicHlsPublisherOptions) {}

  async refresh(): Promise<{ publishedSegments: number; initPublished: boolean }> {
    const manifestPath = join(this.options.outputDirectory, 'index.m3u8')
    const parsed = parseManifest(await readFile(manifestPath, 'utf8'))
    if (!parsed.initName || !safeName(parsed.initName) || parsed.segments.length === 0) {
      throw new Error('Dynamic HLS 工作 manifest 缺少安全 init/segment')
    }
    if (parsed.segments.some(({ name }) => !safeName(name))) {
      throw new Error('Dynamic HLS 工作 manifest 引用了不安全资源')
    }
    const initPath = join(this.options.outputDirectory, parsed.initName)
    const initSize = await regularCompleteFile(initPath)
    if (this.options.initFingerprintGuard && this.options.inspectInitFingerprint) {
      this.options.initFingerprintGuard.accept(await this.options.inspectInitFingerprint(initPath))
    }
    const segmentPaths = await Promise.all(
      parsed.segments.map(async ({ name, duration }) => {
        const path = join(this.options.outputDirectory, name)
        return {
          name,
          path,
          duration,
          index: segmentIndex(name),
          size: await regularCompleteFile(path),
        }
      }),
    )
    if (!this.#validated && this.options.validateReady) {
      await this.options.validateReady({
        manifestPath,
        initPath,
        firstSegmentPath: segmentPaths[0]!.path,
      })
      this.#validated = true
    }

    const tolerance = this.options.ptsToleranceSeconds
    if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('分片 PTS 容差无效')
    const verified = new Map<number, SegmentMediaRange>()
    // 整批验证后再发布，避免后半批失败却已经将前半批暴露给客户端。
    for (const segment of segmentPaths) {
      if (!(segment.duration > 0) || !Number.isFinite(segment.duration))
        throw new Error('分片 EXTINF 无效')
      const planned = this.options.store.timeline.segments[segment.index]
      if (!planned) throw new Error('工作 Job 产生未知逻辑 segment')
      if (this.options.store.snapshot.entries[segment.index]?.status === 'published') continue
      const actual = await this.options.inspectSegment(initPath, segment.path)
      const { start, end } = actual.video
      const total = this.options.store.timeline.duration
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= start ||
        start < -tolerance ||
        end > total + tolerance
      )
        throw new Error('分片实际时间范围无效')
      if (Math.abs(end - start - segment.duration) > tolerance)
        throw timelineError('分片 EXTINF 与视频跨度不符')
      if (this.options.requireAudio && !actual.audio) throw timelineError('分片缺少计划音轨')
      if (
        actual.audio &&
        (!Number.isFinite(actual.audio.start) ||
          !Number.isFinite(actual.audio.end) ||
          actual.audio.end <= actual.audio.start ||
          Math.abs(actual.audio.start - start) > tolerance ||
          Math.abs(actual.audio.end - end) > tolerance)
      )
        throw timelineError(`分片音视频时间不连续：video ${start}–${end}，audio ${actual.audio.start}–${actual.audio.end}`)
      const changed =
        Math.abs(start - planned.startTime) > tolerance ||
        Math.abs(end - planned.endTime) > tolerance
      if (
        changed &&
        !this.options.acceptBoundaryChange?.({
          index: segment.index,
          plannedStart: planned.startTime,
          plannedEnd: planned.endTime,
          actual,
        })
      )
        throw timelineError(
          `分片边界变化未经验证：segment ${segment.index}，计划 ${planned.startTime}–${planned.endTime}，实际视频 ${start}–${end}`,
        )
      const snapshots = this.options.store.snapshot.entries
      for (const [neighbor, edge, target] of [
        [segment.index - 1, 'end', start],
        [segment.index + 1, 'start', end],
      ] as const) {
        const range = verified.get(neighbor) ?? snapshots[neighbor]?.actualRange
        if (range && Math.abs(range.video[edge] - target) > tolerance)
          throw timelineError('分片与相邻已发布资源不能连续衔接')
      }
      verified.set(segment.index, actual)
    }

    let initPublished = false
    // 检查放在全部 await 之后，避免验证期间已换 Job 的迟到输出进入 registry。
    this.options.store.assertJob(this.options.owner)
    if (this.options.store.snapshot.initStatus !== 'published') {
      const resource = {
        path: initPath,
        mimeType: 'video/mp4',
        cacheControl: 'private, max-age=31536000, immutable',
        complete: true,
        sizeBytes: initSize,
      }
      this.options.registry.registerStableResource(this.options.sessionId, 'init.mp4', resource)
      this.options.store.publishInit(resource, this.options.owner)
      initPublished = true
    }

    let publishedSegments = 0
    for (const segment of segmentPaths) {
      const snapshot = this.options.store.snapshot.entries[segment.index]
      if (!snapshot) throw new Error(`工作 Job 产生未知逻辑 segment：${segment.index}`)
      if (snapshot.status === 'published') continue
      if (snapshot.status === 'evicted') {
        this.options.registry.unregisterEvictedResource(
          this.options.sessionId,
          `segment-${segment.index}.m4s`,
        )
      }
      const resource = {
        path: segment.path,
        mimeType: 'video/iso.segment',
        cacheControl: 'private, max-age=31536000, immutable',
        complete: true,
        sizeBytes: segment.size,
      }
      this.options.registry.registerStableResource(
        this.options.sessionId,
        `segment-${segment.index}.m4s`,
        resource,
      )
      this.options.store.publish(
        segment.index,
        resource,
        verified.get(segment.index),
        this.options.owner,
      )
      publishedSegments += 1
    }
    return { publishedSegments, initPublished }
  }
}
