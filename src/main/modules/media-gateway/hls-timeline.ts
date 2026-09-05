import type { HlsSegmentDescriptor, HlsTimeline } from '@marchen/shared/media'
import { HLS_TIMELINE_SCHEMA_VERSION } from '@marchen/shared/media'

const EPSILON = 0.001

export const sourceTimeToLogicalTime = (sourceTime: number, sourceStartTime: number): number =>
  Math.max(0, sourceTime - sourceStartTime)

export const logicalTimeToSourceTime = (logicalTime: number, sourceStartTime: number): number =>
  sourceStartTime + Math.max(0, logicalTime)

export const createHlsSegmentDescriptor = (input: {
  index: number
  startTime: number
  duration: number
  totalDuration: number
  keyframeAligned: boolean
  actualFirstPts?: number
}): HlsSegmentDescriptor => {
  const startTime = Math.max(0, input.startTime)
  const duration = Math.max(0, Math.min(input.duration, input.totalDuration - startTime))
  const endTime = startTime + duration
  return {
    index: input.index,
    startTime,
    duration,
    endTime,
    keyframeAligned: input.keyframeAligned,
    actualFirstPts:
      input.actualFirstPts !== undefined && Number.isFinite(input.actualFirstPts)
        ? input.actualFirstPts
        : undefined,
    tail: Math.abs(endTime - input.totalDuration) <= EPSILON,
  }
}

export const segmentAtLogicalTime = (
  timeline: HlsTimeline,
  logicalTime: number,
): HlsSegmentDescriptor | undefined => {
  if (timeline.segments.length === 0) return undefined
  const target = Math.max(0, Math.min(logicalTime, Math.max(0, timeline.duration - EPSILON)))
  let left = 0
  let right = timeline.segments.length - 1
  while (left <= right) {
    const middle = Math.floor((left + right) / 2)
    const segment = timeline.segments[middle]!
    if (target < segment.startTime) right = middle - 1
    else if (target >= segment.endTime) left = middle + 1
    else return segment
  }
  return timeline.segments.at(-1)
}

export const validateHlsTimeline = (timeline: HlsTimeline): void => {
  if (!(timeline.duration > 0) || !(timeline.targetSegmentDuration > 0)) {
    throw new Error('HLS timeline 时长无效')
  }
  if (timeline.segments.length === 0) throw new Error('HLS timeline 缺少 segment')
  let expectedStart = 0
  for (let index = 0; index < timeline.segments.length; index += 1) {
    const segment = timeline.segments[index]!
    if (segment.index !== index) throw new Error('HLS segment index 不连续')
    if (!(segment.duration > 0) || segment.endTime <= segment.startTime) {
      throw new Error('HLS segment 时长无效')
    }
    if (Math.abs(segment.startTime - expectedStart) > EPSILON) {
      throw new Error('HLS segment 逻辑时间不连续')
    }
    if (Math.abs(segment.endTime - (segment.startTime + segment.duration)) > EPSILON) {
      throw new Error('HLS segment endTime 与 duration 不一致')
    }
    if (index < timeline.segments.length - 1 && segment.tail) {
      throw new Error('只有最后一个 HLS segment 可以标记 tail')
    }
    expectedStart = segment.endTime
  }
  const last = timeline.segments.at(-1)!
  if (!last.tail || Math.abs(last.endTime - timeline.duration) > EPSILON) {
    throw new Error('HLS timeline 尾段未覆盖完整视频时长')
  }
}

export const createKeyframeAlignedTimeline = (input: {
  sourceStartTime: number
  duration: number
  keyframes: readonly number[]
  targetSegmentDuration: number
}): HlsTimeline => {
  if (!(input.targetSegmentDuration > 0) || !(input.duration > 0)) {
    throw new Error('关键帧 timeline 参数无效')
  }
  const keyframes = [...input.keyframes]
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right)
    .filter((value, index, values) => index === 0 || value - values[index - 1]! > EPSILON)
  if (keyframes.length === 0 || keyframes[0]! > EPSILON) {
    throw new Error('关键帧 timeline 缺少逻辑零点关键帧')
  }
  keyframes[0] = 0
  const duration = Math.max(input.duration, keyframes.at(-1)!)
  const boundaries = [0]
  let desiredCutTime = input.targetSegmentDuration
  for (const keyframe of keyframes.slice(1)) {
    if (keyframe >= duration - EPSILON) break
    if (keyframe + EPSILON < desiredCutTime) continue
    boundaries.push(keyframe)
    // 使用累计目标切点，与 HLS muxer 的初始切片节奏一致；重启后的实际范围另行验证。
    desiredCutTime += input.targetSegmentDuration
  }
  boundaries.push(duration)
  const segments = boundaries.slice(0, -1).map((startTime, index) =>
    createHlsSegmentDescriptor({
      index,
      startTime,
      duration: boundaries[index + 1]! - startTime,
      totalDuration: duration,
      keyframeAligned: true,
    }),
  )
  const timeline: HlsTimeline = {
    schemaVersion: HLS_TIMELINE_SCHEMA_VERSION,
    sourceStartTime: Math.max(0, input.sourceStartTime),
    duration,
    targetSegmentDuration: input.targetSegmentDuration,
    mode: 'keyframe-aligned-copy',
    segments,
  }
  validateHlsTimeline(timeline)
  return timeline
}

export const createClosedGopTimeline = (input: {
  sourceStartTime: number
  duration: number
  targetSegmentDuration: number
}): HlsTimeline => {
  if (!(input.duration > 0) || !(input.targetSegmentDuration > 0)) {
    throw new Error('转码 HLS timeline 参数无效')
  }
  const segments: HlsSegmentDescriptor[] = []
  for (let startTime = 0, index = 0; startTime < input.duration - EPSILON; index += 1) {
    const duration = Math.min(input.targetSegmentDuration, input.duration - startTime)
    segments.push(
      createHlsSegmentDescriptor({
        index,
        startTime,
        duration,
        totalDuration: input.duration,
        keyframeAligned: true,
      }),
    )
    startTime += duration
  }
  const timeline: HlsTimeline = {
    schemaVersion: HLS_TIMELINE_SCHEMA_VERSION,
    sourceStartTime: Math.max(0, input.sourceStartTime),
    duration: input.duration,
    targetSegmentDuration: input.targetSegmentDuration,
    mode: 'closed-gop-transcode',
    segments,
  }
  validateHlsTimeline(timeline)
  return timeline
}
